import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";

type Params = Promise<{ id: string }>;

const TOLERANCIA_PADRAO_G = 0.3;

// REGRA DE NEGOCIO:
// - O que faz: conclui a compra comercial e aciona os triggers de entrada no estoque + (caso ainda
//   nao exista) contas a pagar. Antes de concluir, CONFERE o peso: a soma do peso das pecas cadastradas
//   tem que bater com o peso do lote informado na chegada (dentro da tolerancia de balanca).
// - Por que: garante que o que foi cadastrado corresponde ao metal que chegou. Pequena diferenca de
//   balanca e tolerada; divergencia maior exige APROVACAO (status 'aprovado') antes de concluir.
// - Impacto se alterado/removido: estoque/financeiro podem ser efetivados com lote divergente sem governanca.
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);

  const [compra] = await sql`
    SELECT bloqueado, situacao, peso_total_g, total_pecas FROM alissonerp.compras_comercial WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.situacao === "concluido") return NextResponse.json({ error: "Compra já concluída" }, { status: 409 });

  // REGRA DE NEGOCIO: uma compra APROVADA fica bloqueada, mas pode ser concluida (a divergencia de
  // peso ja passou por aprovacao). Qualquer outro estado bloqueado nao conclui.
  if (compra.bloqueado && compra.situacao !== "aprovado") {
    return NextResponse.json({ error: "Compra bloqueada — aguardando aprovação" }, { status: 409 });
  }

  const situacoesPermitidas = ["recebida", "rascunho", "pendente", "recebido_pendente_cadastro", "aprovado"];
  if (!situacoesPermitidas.includes(compra.situacao as string)) {
    return NextResponse.json(
      { error: `Compra está em situação "${compra.situacao}" — não pode ser concluída` },
      { status: 409 },
    );
  }

  // Conferencia de peso (so quando a chegada registrou peso de lote).
  const pesoLote = Number(compra.peso_total_g ?? 0);
  if (pesoLote > 0 && compra.situacao !== "aprovado") {
    let toleranciaG = TOLERANCIA_PADRAO_G;
    try {
      const [cfg] = await sql`SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'tolerancia_lote_peso_g' LIMIT 1`;
      const v = Number(String(cfg?.valor ?? "").replace(",", "."));
      if (Number.isFinite(v) && v > 0) toleranciaG = v;
    } catch { /* usa padrao */ }

    const [resumo] = await sql`
      SELECT COALESCE(SUM(peso_total), 0)::numeric AS peso_cadastrado
      FROM alissonerp.itens_compra_comercial
      WHERE compra_comercial_id = ${compraId}
    `;
    const pesoCadastrado = Number(resumo?.peso_cadastrado ?? 0);
    const diff = Math.abs(pesoCadastrado - pesoLote);

    if (diff > toleranciaG) {
      // REGRA DE NEGOCIO: peso divergente do lote → bloqueia conclusao direta e pede aprovacao.
      // O front mostra "Solicitar aprovação"; apos aprovada (status 'aprovado'), a conclusao e liberada.
      return NextResponse.json(
        {
          error: `Peso cadastrado (${pesoCadastrado.toFixed(3)}g) diverge do lote (${pesoLote.toFixed(3)}g) em ${diff.toFixed(3)}g. Solicite aprovação para concluir.`,
          needs_approval: true,
          peso_cadastrado: pesoCadastrado,
          peso_lote: pesoLote,
          diferenca: Number(diff.toFixed(3)),
        },
        { status: 409 },
      );
    }
  }

  try {
    await sql`UPDATE alissonerp.compras_comercial SET situacao = 'concluido' WHERE id = ${compraId}`;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string };
    if (error.message?.includes("bloqueado") || error.code === "P0001") {
      return NextResponse.json({ error: "Compra bloqueada — não permite alteração" }, { status: 409 });
    }
    return internalError("[PATCH /api/compras-comercial/[id]/concluir]", err);
  }
}
