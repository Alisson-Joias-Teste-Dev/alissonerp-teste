import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";

/**
 * Movimentacao Interna / Solicitacao de Peca — transicoes de estado.
 *
 * REGRA DE NEGOCIO:
 *   solicitado --entregar(foto)--> entregue --receber(foto)--> recebido
 *   recebido --cliente_levou--> finalizado (sem foto)
 *   recebido --solicitar_volta--> volta_solicitada --confirmar_devolucao(foto)--> finalizado
 *   solicitado --cancelar(motivo)--> cancelado
 *
 * CANCELAR (mig 347): a consultora desiste antes de a peca sair do estoque.
 * So sai de 'solicitado' — enquanto a peca esta FISICAMENTE no estoque e nada
 * aconteceu. A partir de 'entregue' a peca ja saiu, e o caminho honesto e a
 * devolucao (com foto); permitir cancelar ali apagaria o rastro de que alguem
 * esta com a peca. Motivo e OBRIGATORIO: e o que da visibilidade de por que as
 * consultoras desistem — sem ele o cancelamento vira buraco no historico.
 * Nao movimenta estoque (este modulo nunca movimentou) — e encerramento
 * administrativo puro.
 *
 * A volta ao estoque e um handshake dentro da MESMA solicitacao (nao cria
 * registro novo): a solicitante pede a volta (sem foto), o estoque confirma o
 * recebimento de volta (com foto), ai encerra.
 *
 * Sem checagem de role: qualquer usuario autenticado opera; grava quem fez cada
 * passo. As transicoes so avancam a partir do estado correto (nao pula, nao
 * repete). A FOTO ja vem enviada pelo client (foto_path) direto no bucket
 * privado protocolo-fotos — mesmo padrao provado em prod dos modais de Protocolo
 * (a sessao do usuario passa na RLS; upload server-side com anon-key nao passa).
 */
const SolicitacaoPatchSchema = z.object({
  action: z.enum(["entregar", "receber", "cliente_levou", "solicitar_volta", "confirmar_devolucao", "cancelar"]),
  foto_path: z.string().max(500).optional(),
  motivo: z.string().max(2000).optional(),
}).passthrough();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id: idParam } = await params;
  const id = parseInt(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SolicitacaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { action, foto_path, motivo } = parsed.data;

  const [sol] = await sql`
    SELECT id, status::text FROM alissonerp.solicitacoes_peca WHERE id = ${id}
  `;
  if (!sol) return NextResponse.json({ error: "Solicitacao nao encontrada" }, { status: 404 });

  // ── entregar: solicitado -> entregue ──────────────────────────────────────
  if (action === "entregar") {
    if (sol.status !== "solicitado") {
      return NextResponse.json({ error: `So da pra entregar quando esta 'solicitado' (atual: ${sol.status})` }, { status: 409 });
    }
    if (!foto_path) return NextResponse.json({ error: "Foto da entrega e obrigatoria" }, { status: 400 });
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'entregue', entregue_por_id = ${user.id}::uuid,
          entregue_em = now(), foto_entrega = ${foto_path}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  // ── receber: entregue -> recebido ─────────────────────────────────────────
  else if (action === "receber") {
    if (sol.status !== "entregue") {
      return NextResponse.json({ error: `So da pra confirmar recebimento quando esta 'entregue' (atual: ${sol.status})` }, { status: 409 });
    }
    if (!foto_path) return NextResponse.json({ error: "Foto do recebimento e obrigatoria" }, { status: 400 });
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'recebido', recebido_por_id = ${user.id}::uuid,
          recebido_em = now(), foto_recebimento = ${foto_path}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  // ── cliente_levou: recebido -> finalizado (sem foto) ──────────────────────
  else if (action === "cliente_levou") {
    if (sol.status !== "recebido") {
      return NextResponse.json({ error: `So da pra marcar 'cliente levou' quando esta 'recebido' (atual: ${sol.status})` }, { status: 409 });
    }
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'finalizado', finalizado_por_id = ${user.id}::uuid,
          finalizado_em = now(), motivo_final = 'cliente_levou', updated_at = now()
      WHERE id = ${id}
    `;
  }

  // ── solicitar_volta: recebido -> volta_solicitada (sem foto) ──────────────
  else if (action === "solicitar_volta") {
    if (sol.status !== "recebido") {
      return NextResponse.json({ error: `So da pra pedir a volta quando esta 'recebido' (atual: ${sol.status})` }, { status: 409 });
    }
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'volta_solicitada', volta_solicitada_por_id = ${user.id}::uuid,
          volta_solicitada_em = now(), updated_at = now()
      WHERE id = ${id}
    `;
  }

  // ── confirmar_devolucao: volta_solicitada -> finalizado (devolvido, foto) ──
  else if (action === "confirmar_devolucao") {
    if (sol.status !== "volta_solicitada") {
      return NextResponse.json({ error: `So da pra confirmar a devolucao quando a volta foi solicitada (atual: ${sol.status})` }, { status: 409 });
    }
    if (!foto_path) return NextResponse.json({ error: "Foto da devolucao e obrigatoria" }, { status: 400 });
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'finalizado', finalizado_por_id = ${user.id}::uuid,
          finalizado_em = now(), motivo_final = 'devolvido',
          foto_devolucao = ${foto_path}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  // ── cancelar: solicitado -> cancelado (motivo obrigatorio, sem foto) ──────
  // Trava no 'solicitado': a peca nunca saiu do estoque, entao encerrar aqui
  // nao apaga nenhum rastro fisico. Em qualquer outro estado a peca ja circulou
  // e o desfecho tem que ser devolucao ou cliente_levou.
  else if (action === "cancelar") {
    if (sol.status !== "solicitado") {
      return NextResponse.json({ error: `So da pra cancelar quando esta 'solicitado' (atual: ${sol.status}). Se a peca ja saiu do estoque, use a devolucao.` }, { status: 409 });
    }
    const motivoLimpo = motivo?.trim();
    if (!motivoLimpo) return NextResponse.json({ error: "Motivo do cancelamento e obrigatorio" }, { status: 400 });
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'cancelado', cancelado_por_id = ${user.id}::uuid,
          cancelado_em = now(), motivo_cancelamento = ${motivoLimpo}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  await logAudit(sql, {
    tabela: "solicitacoes_peca",
    operacao: "UPDATE",
    registro_id: id,
    usuario_id: user.id,
    dados_depois: { action, ...(action === "cancelar" ? { motivo: motivo?.trim() } : {}) },
  });

  return NextResponse.json({ ok: true });
}
