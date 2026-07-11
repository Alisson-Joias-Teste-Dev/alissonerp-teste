import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { zodError } from "@/lib/schemas/common";

/**
 * Movimentacao Interna / Solicitacao de Peca — transicoes de estado.
 *
 * REGRA DE NEGOCIO: ciclo solicitado -> entregue -> recebido -> finalizado.
 *  - entregar   (estoque separa e entrega): foto obrigatoria
 *  - receber    (solicitante confirma recebimento): foto obrigatoria
 *  - finalizar  (motivo devolvido -> foto obrigatoria; cliente_levou -> sem foto)
 * Sem checagem de role: qualquer usuario autenticado opera; grava quem fez cada
 * passo. As transicoes so avancam a partir do estado correto (nao pula etapa,
 * nao repete).
 *
 * A FOTO ja vem enviada pelo client (foto_path) direto no bucket privado
 * protocolo-fotos — mesmo padrao dos modais de Protocolo (NovaProtocoloModal),
 * que e o unico jeito provado em prod de escrever nesse bucket privado (a
 * sessao do usuario passa na RLS; upload server-side com anon-key nao passa).
 */
const SolicitacaoPatchSchema = z.object({
  action: z.enum(["entregar", "receber", "finalizar"]),
  foto_path: z.string().max(500).optional(),
  motivo_final: z.enum(["devolvido", "cliente_levou"]).optional(),
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
  const { action, foto_path, motivo_final } = parsed.data;

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

  // ── finalizar: recebido -> finalizado (devolvido | cliente_levou) ─────────
  else if (action === "finalizar") {
    if (sol.status !== "recebido") {
      return NextResponse.json({ error: `So da pra finalizar quando esta 'recebido' (atual: ${sol.status})` }, { status: 409 });
    }
    if (!motivo_final) return NextResponse.json({ error: "Informe o motivo (devolvido ou cliente_levou)" }, { status: 400 });
    // REGRA: devolucao ao estoque exige foto; cliente levou nao (peca saiu de vez).
    let fotoPath: string | null = null;
    if (motivo_final === "devolvido") {
      if (!foto_path) return NextResponse.json({ error: "Foto da devolucao ao estoque e obrigatoria" }, { status: 400 });
      fotoPath = foto_path;
    }
    await sql`
      UPDATE alissonerp.solicitacoes_peca
      SET status = 'finalizado', finalizado_por_id = ${user.id}::uuid,
          finalizado_em = now(), motivo_final = ${motivo_final},
          foto_devolucao = ${fotoPath}, updated_at = now()
      WHERE id = ${id}
    `;
  }

  await logAudit(sql, {
    tabela: "solicitacoes_peca",
    operacao: "UPDATE",
    registro_id: id,
    usuario_id: user.id,
    dados_depois: { action, motivo_final: motivo_final ?? null },
  });

  return NextResponse.json({ ok: true });
}
