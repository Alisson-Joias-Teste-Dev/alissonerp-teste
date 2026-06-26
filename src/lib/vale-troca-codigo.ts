// ═══════════════════════════════════════════════════════════════════════════
// vale-troca-codigo.ts — 2a confirmacao do Vale-Troca por codigo no WhatsApp
//
// Regra de negocio (brecha #1 da auditoria 16/06):
//   O QUE: ao aplicar um vale COM DONO numa venda, o sistema gera um codigo de
//     6 digitos e envia no WhatsApp do DONO do vale (public.contatos.celular).
//     O vale so e aplicado apos o dono informar o codigo ao atendente. Vale SEM
//     dono (promocional) nao exige confirmacao.
//   POR QUE: hoje o vale e aplicado sem validar o dono — houve 2 usos cruzados
//     reais (R$3.410). O codigo garante consentimento e identidade do dono.
//   IMPACTO SE REMOVIDO: volta a ser possivel usar vale alheio sem autorizacao.
//
//   Trava: 5 tentativas erradas BLOQUEIAM o codigo (padrao das entregas,
//   migration 295); codigo expira em 15 min. Se nao der pra enviar (cliente sem
//   celular / WhatsApp fora), sinaliza precisa_excecao -> aprovador configurado.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { enviarCodigoValeTroca, enviarAvisoDesenvolvedor } from "@/lib/whatsapp";

const EXPIRA_MIN = 15;
export const MAX_TENTATIVAS_VALE = 5;

function gerarCodigo6(): string {
  // 6 digitos numericos (000000–999999). Math.random aqui e codigo de app (ok).
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

function mascararTelefone(tel: string | null | undefined): string {
  const d = (tel ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `****${d.slice(-4)}` : "****";
}

async function lerWhatsappDesenvolvedor(): Promise<string | null> {
  const [c] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'whatsapp_desenvolvedor'
  `;
  return c?.valor ? String(c.valor) : null;
}

export interface SolicitarCodigoValeResult {
  ok: boolean;
  precisa_codigo: boolean;     // false = vale sem dono (promo): aplica direto, sem codigo
  codigo_id?: number;
  telefone_mascarado?: string;
  precisa_excecao?: boolean;   // true = nao deu pra enviar -> usar aprovador de excecao
  erro?: string;
}

// Gera e envia o codigo ao dono do vale. Persiste o registro mesmo se o envio
// falhar (para rastro e para o caminho de excecao).
export async function solicitarCodigoVale(
  valeNumero: string,
  vendaId: number | null,
  userId: string,
): Promise<SolicitarCodigoValeResult> {
  const [vale] = await sql`
    SELECT id, cliente_id, status FROM alissonerp.vale_troca WHERE numero = ${valeNumero}
  `;
  if (!vale) return { ok: false, precisa_codigo: false, erro: "Vale-troca nao encontrado" };
  if (vale.status !== "ativo") return { ok: false, precisa_codigo: false, erro: `Vale-troca ${vale.status}` };

  // Vale promocional (sem dono): nao exige 2a confirmacao.
  if (vale.cliente_id == null) {
    return { ok: true, precisa_codigo: false };
  }

  const [contato] = await sql`
    SELECT nome, celular FROM public.contatos WHERE id_contato = ${vale.cliente_id}
  `;

  // ── Reuso do codigo ativo (fix do "codigo incorreto") ──────────────────────
  // O QUE: se ja existe um codigo VALIDO para este vale (nao confirmado, nao
  //   bloqueado, dentro dos 15 min), REUSA o mesmo numero em vez de gerar outro.
  // POR QUE: o dono costuma demorar a responder; cada novo pedido gerava um
  //   codigo novo e o confirmarCodigoVale so aceita o ULTIMO — entao o codigo da
  //   1a mensagem "morria" e dava "codigo incorreto" mesmo com o numero certo.
  //   Reusando, o "Reenviar" manda o MESMO codigo e o que o dono recebeu sempre vale.
  // IMPACTO SE REMOVIDO: volta o bug do codigo que troca a cada clique/reenvio.
  const [ativo] = await sql`
    SELECT id, codigo
    FROM alissonerp.vale_troca_codigo
    WHERE vale_troca_id = ${vale.id}
      AND confirmado_em IS NULL
      AND bloqueado_em IS NULL
      AND expira_em > now()
    ORDER BY created_at DESC
    LIMIT 1
  `;

  let codigo: string;
  let codigoId: number;
  if (ativo) {
    // Reusa o codigo ativo (mantem expira_em/tentativas originais). Reenvia o mesmo.
    codigo = String(ativo.codigo);
    codigoId = ativo.id;
  } else {
    // Nenhum codigo ativo -> gera um novo (validade 15 min).
    codigo = gerarCodigo6();
    const expira = new Date(Date.now() + EXPIRA_MIN * 60 * 1000);
    const [row] = await sql`
      INSERT INTO alissonerp.vale_troca_codigo
        (vale_troca_id, venda_id, codigo, telefone, expira_em, created_by)
      VALUES (${vale.id}, ${vendaId}, ${codigo}, ${contato?.celular ?? null}, ${expira}, ${userId}::uuid)
      RETURNING id
    `;
    codigoId = row.id;
  }

  // Sem celular cadastrado -> nao da pra enviar; cai pro aprovador de excecao.
  if (!contato?.celular) {
    return {
      ok: true, precisa_codigo: true, codigo_id: codigoId,
      precisa_excecao: true, erro: "Cliente sem celular cadastrado",
    };
  }

  const env = await enviarCodigoValeTroca(contato.celular, codigo, contato.nome ?? "cliente");
  if (!env.enviado) {
    // Fallback: manda o codigo + motivo pro WhatsApp do desenvolvedor (rastro).
    const numeroDev = await lerWhatsappDesenvolvedor();
    if (numeroDev) {
      await enviarAvisoDesenvolvedor(
        numeroDev,
        `Vale ${valeNumero} (venda ${vendaId}): codigo ${codigo} — falha no envio ao cliente (${env.erro ?? "?"}).`,
      );
    }
    return {
      ok: true, precisa_codigo: true, codigo_id: codigoId,
      telefone_mascarado: mascararTelefone(contato.celular),
      precisa_excecao: true, erro: env.erro ?? "Falha ao enviar WhatsApp",
    };
  }

  return {
    ok: true, precisa_codigo: true, codigo_id: codigoId,
    telefone_mascarado: mascararTelefone(contato.celular),
  };
}

export interface ConfirmarCodigoValeResult {
  ok: boolean;
  erro?: string;
  bloqueado?: boolean;
}

// Valida o codigo digitado contra o ULTIMO codigo gerado para o vale. O codigo
// esta atrelado ao vale+dono (nao a venda) — o dono consentiu em usar ESTE vale,
// independentemente de em qual venda. Conta tentativas e bloqueia em 5 erros.
// Marca confirmado_em ao acertar. Idempotente se ja confirmado.
export async function confirmarCodigoVale(
  valeId: number,
  codigoDigitado: string,
): Promise<ConfirmarCodigoValeResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sql as any).begin(async (tx: any): Promise<ConfirmarCodigoValeResult> => {
    const [reg] = await tx`
      SELECT id, codigo, tentativas, bloqueado_em, confirmado_em, expira_em
      FROM alissonerp.vale_troca_codigo
      WHERE vale_troca_id = ${valeId}
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (!reg) return { ok: false, erro: "Nenhum codigo solicitado. Peca o codigo primeiro." };
    if (reg.bloqueado_em) return { ok: false, bloqueado: true, erro: "Codigo bloqueado por tentativas. Solicite um novo codigo." };
    if (reg.confirmado_em) return { ok: true };
    if (new Date(reg.expira_em) < new Date()) return { ok: false, erro: "Codigo expirado. Solicite um novo." };

    if (String(codigoDigitado).trim() === String(reg.codigo)) {
      await tx`UPDATE alissonerp.vale_troca_codigo SET confirmado_em = now() WHERE id = ${reg.id}`;
      return { ok: true };
    }

    const novas = Number(reg.tentativas) + 1;
    const bloqueia = novas >= MAX_TENTATIVAS_VALE;
    await tx`
      UPDATE alissonerp.vale_troca_codigo
      SET tentativas = ${novas}, bloqueado_em = ${bloqueia ? new Date() : null}
      WHERE id = ${reg.id}
    `;
    return {
      ok: false,
      bloqueado: bloqueia,
      erro: bloqueia ? "Codigo bloqueado (5 tentativas erradas). Solicite um novo." : "Codigo incorreto.",
    };
  }) as Promise<ConfirmarCodigoValeResult>;
}
