/**
 * POST /api/whatsapp/webhook
 * Recebe mensagens do Evolution API e responde via Gemini.
 *
 * ZONA: src/app/api/whatsapp/ — não toca em outros módulos.
 * DB: pg via import sql from "@/lib/db" (postgres npm, tagged template)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { parsearWebhook, enviarMensagem } from "@/lib/whatsapp/evolution";
import { processarMensagem } from "@/lib/whatsapp/assistente";
import { zodError } from "@/lib/schemas/common";

// Webhook Evolution API — payload variável, usa passthrough.
const WhatsappWebhookSchema = z.object({}).passthrough();

const WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET || "";
const JONATHAN_WHATSAPP = process.env.JONATHAN_WHATSAPP || "";
const WA_MAX_HISTORY = parseInt(process.env.WA_MAX_HISTORY || "20", 10);

// Emojis por tipo de escalação
const EMOJI_TIPO = {
  duvida: "❓",
  bug: "🐛",
  sugestao: "💡",
  urgente: "🚨",
};

// ─── Handler principal ─────────────────────────────────────────────────────

export async function POST(req) {
  // 1. Validar webhook secret (se configurado)
  if (WEBHOOK_SECRET) {
    const secret = req.headers.get("x-webhook-secret") || req.headers.get("apikey") || "";
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsedZ = WhatsappWebhookSchema.safeParse(raw);
  if (!parsedZ.success) return zodError(parsedZ.error);
  const body = parsedZ.data;

  // 2. Parsear webhook — ignorar se inválido ou não for mensagem de texto
  const parsed = parsearWebhook(body);
  if (!parsed) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { telefone, mensagem, nome } = parsed;

  // 3. Verificar se é comando de Jonathan
  if (JONATHAN_WHATSAPP && telefone === JONATHAN_WHATSAPP.replace(/\D/g, "")) {
    const resultadoComando = await processarComandoJonathan(telefone, mensagem);
    if (resultadoComando) {
      return NextResponse.json({ ok: true, comando: true });
    }
  }

  // 4. Buscar/criar usuário no cache
  const usuario = await buscarOuCriarUsuario(telefone, nome);

  // 5. Salvar mensagem de entrada
  const [conversaEntrada] = await sql`
    INSERT INTO alissonerp.wa_conversas
      (telefone, user_profile_id, nome_usuario, role_usuario, direcao, mensagem, tipo_resposta)
    VALUES
      (${telefone}, ${usuario.user_profile_id || null}, ${usuario.nome}, ${usuario.role || null}, 'entrada', ${mensagem}, 'direta')
    RETURNING id
  `;

  // 6. Carregar histórico recente
  const historico = await carregarHistorico(telefone);

  // 7. Carregar knowledge base filtrado por role
  const knowledgeBase = await carregarKnowledgeBase(usuario.role);

  // 8. Chamar assistente
  const resposta = await processarMensagem({
    mensagem,
    usuario: { nome: usuario.nome, role: usuario.role || "desconhecido", telefone },
    historico,
    knowledgeBase,
  });

  if (resposta.escalar) {
    // 9a. Salvar escalação
    const escalacaoId = await criarEscalacao({
      conversaId: conversaEntrada.id,
      telefone,
      nomeUsuario: usuario.nome,
      roleUsuario: usuario.role,
      tipo: resposta.tipo_escalacao,
      resumo: resposta.resumo_escalacao,
      analise: resposta.analise,
      historico: historico.slice(-5),
    });

    // 9b. Notificar Jonathan
    await notificarJonathan(escalacaoId, {
      tipo: resposta.tipo_escalacao,
      nome: usuario.nome,
      role: usuario.role,
      telefone,
      resumo: resposta.resumo_escalacao,
      analise: resposta.analise,
      mensagemOriginal: mensagem,
      historico: historico.slice(-3),
    });

    // 9c. Responder usuário
    await enviarMensagem(telefone, resposta.texto_usuario);

    // 9d. Salvar resposta
    await sql`
      INSERT INTO alissonerp.wa_conversas
        (telefone, user_profile_id, nome_usuario, role_usuario, direcao, mensagem, tipo_resposta, tokens_entrada, tokens_saida, modelo)
      VALUES
        (${telefone}, ${usuario.user_profile_id || null}, ${usuario.nome}, ${usuario.role || null},
         'saida', ${resposta.texto_usuario}, 'escalada',
         ${resposta.tokens.input}, ${resposta.tokens.output}, ${process.env.WA_MODEL || "gemini-2.5-flash"})
    `;
  } else {
    // 10. Resposta direta
    await enviarMensagem(telefone, resposta.texto_usuario);

    await sql`
      INSERT INTO alissonerp.wa_conversas
        (telefone, user_profile_id, nome_usuario, role_usuario, direcao, mensagem, tipo_resposta, tokens_entrada, tokens_saida, modelo)
      VALUES
        (${telefone}, ${usuario.user_profile_id || null}, ${usuario.nome}, ${usuario.role || null},
         'saida', ${resposta.texto_usuario}, 'direta',
         ${resposta.tokens.input}, ${resposta.tokens.output}, ${process.env.WA_MODEL || "gemini-2.5-flash"})
    `;
  }

  return NextResponse.json({ ok: true });
}

// ─── Funções auxiliares ────────────────────────────────────────────────────

async function buscarOuCriarUsuario(telefone, nome) {
  // Tentar cache wa_usuarios
  const [cache] = await sql`
    SELECT
      wu.telefone,
      wu.nome,
      wu.role,
      wu.user_profile_id,
      wu.ativo
    FROM alissonerp.wa_usuarios wu
    WHERE wu.telefone = ${telefone}
    LIMIT 1
  `;

  if (cache) {
    // Atualizar nome se mudou
    if (cache.nome !== nome) {
      await sql`
        UPDATE alissonerp.wa_usuarios
        SET nome = ${nome}, updated_at = NOW()
        WHERE telefone = ${telefone}
      `;
      cache.nome = nome;
    }
    return cache;
  }

  // Não achou no cache — buscar em public.user_profiles por phone (migration 088)
  const [perfil] = await sql`
    SELECT
      up.id_user,
      up.name AS nome_perfil,
      u.role,
      u.nome AS nome_erp
    FROM public.user_profiles up
    JOIN alissonerp.usuarios u ON u.id = up.id_user
    WHERE up.phone = ${telefone}
      AND u.ativo = true
    LIMIT 1
  `;

  const user_profile_id = perfil?.id_user || null;
  const role = perfil?.role || null;
  // Preferir nome do ERP; fallback para nome do perfil; fallback para pushName do WhatsApp
  const nomeResolvido = perfil?.nome_erp || perfil?.nome_perfil || nome;

  const [novo] = await sql`
    INSERT INTO alissonerp.wa_usuarios (telefone, nome, user_profile_id, role)
    VALUES (${telefone}, ${nomeResolvido}, ${user_profile_id}, ${role})
    ON CONFLICT (telefone) DO UPDATE
      SET nome        = EXCLUDED.nome,
          user_profile_id = EXCLUDED.user_profile_id,
          role        = EXCLUDED.role,
          updated_at  = NOW()
    RETURNING telefone, nome, role, user_profile_id, ativo
  `;

  return novo;
}

async function carregarHistorico(telefone) {
  const rows = await sql`
    SELECT direcao, mensagem, created_at
    FROM alissonerp.wa_conversas
    WHERE telefone = ${telefone}
    ORDER BY created_at DESC
    LIMIT ${WA_MAX_HISTORY}
  `;
  // Reverter para ordem cronológica
  return rows.reverse();
}

async function carregarKnowledgeBase(role) {
  const rows = await sql`
    SELECT categoria, titulo, conteudo
    FROM alissonerp.wa_knowledge_base
    WHERE ativo = true
      AND (
        roles_aplicaveis = '{}'
        OR ${role || ""}::text = ANY(roles_aplicaveis)
      )
    ORDER BY ordem ASC, id ASC
  `;
  return rows;
}

async function criarEscalacao({ conversaId, telefone, nomeUsuario, roleUsuario, tipo, resumo, analise, historico }) {
  const [row] = await sql`
    INSERT INTO alissonerp.wa_escalacoes
      (conversa_id, telefone, nome_usuario, role_usuario, tipo, resumo, analise_assistente, contexto_mensagens)
    VALUES
      (${conversaId || null}, ${telefone}, ${nomeUsuario}, ${roleUsuario || null},
       ${tipo}, ${resumo}, ${analise || null}, ${JSON.stringify(historico)})
    RETURNING id
  `;
  return row.id;
}

async function notificarJonathan(escalacaoId, dados) {
  if (!JONATHAN_WHATSAPP) {
    console.warn("[WhatsApp] JONATHAN_WHATSAPP não configurado — escalação não notificada");
    return;
  }

  const emoji = EMOJI_TIPO[dados.tipo] || "❓";
  const tipoLabel = { duvida: "Dúvida", bug: "Bug", sugestao: "Sugestão", urgente: "URGENTE" }[dados.tipo] || dados.tipo;

  const ultimasMensagens = (dados.historico || [])
    .map((h) => `${h.direcao === "entrada" ? "👤" : "🤖"} ${h.mensagem}`)
    .join("\n");

  const msg = [
    `${emoji} *Nova escalação #${escalacaoId} — ${tipoLabel}*`,
    "",
    `*De:* ${dados.nome} (${dados.role || "sem cargo"})`,
    `*Tel:* ${dados.telefone}`,
    "",
    `*Resumo:* ${dados.resumo}`,
    dados.analise ? `*Análise:* ${dados.analise}` : null,
    "",
    ultimasMensagens ? `*Últimas mensagens:*\n${ultimasMensagens}` : null,
    "",
    `Para responder:`,
    `/resolver ${escalacaoId} <sua resposta>`,
    `/descartar ${escalacaoId}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  await enviarMensagem(JONATHAN_WHATSAPP.replace(/\D/g, ""), msg);
}

async function processarComandoJonathan(telefone, mensagem) {
  // /resolver {id} {resposta...}
  const resolverMatch = mensagem.match(/^\/resolver\s+(\d+)\s+([\s\S]+)/i);
  if (resolverMatch) {
    const id = parseInt(resolverMatch[1], 10);
    const resposta = resolverMatch[2].trim();

    const [escalacao] = await sql`
      SELECT id, telefone, nome_usuario
      FROM alissonerp.wa_escalacoes
      WHERE id = ${id} AND status = 'pendente'
      LIMIT 1
    `;

    if (!escalacao) {
      await enviarMensagem(telefone, `Escalação #${id} não encontrada ou já resolvida.`);
      return true;
    }

    await sql`
      UPDATE alissonerp.wa_escalacoes
      SET status = 'resolvido', resposta_jonathan = ${resposta}, resolvido_at = NOW()
      WHERE id = ${id}
    `;

    // Enviar resposta ao usuário original
    const msgUsuario = `✅ Resposta do suporte:\n${resposta}`;
    await enviarMensagem(escalacao.telefone, msgUsuario);

    await sql`
      INSERT INTO alissonerp.wa_conversas
        (telefone, nome_usuario, direcao, mensagem, tipo_resposta)
      VALUES
        (${escalacao.telefone}, ${escalacao.nome_usuario}, 'saida', ${msgUsuario}, 'escalada')
    `;

    await enviarMensagem(telefone, `✅ Escalação #${id} resolvida. Resposta enviada para ${escalacao.nome_usuario}.`);
    return true;
  }

  // /descartar {id}
  const descartarMatch = mensagem.match(/^\/descartar\s+(\d+)/i);
  if (descartarMatch) {
    const id = parseInt(descartarMatch[1], 10);

    const [escalacao] = await sql`
      UPDATE alissonerp.wa_escalacoes
      SET status = 'descartado'
      WHERE id = ${id} AND status = 'pendente'
      RETURNING id
    `;

    if (!escalacao) {
      await enviarMensagem(telefone, `Escalação #${id} não encontrada ou já encerrada.`);
    } else {
      await enviarMensagem(telefone, `🗑️ Escalação #${id} descartada.`);
    }
    return true;
  }

  return false; // Não era um comando
}
