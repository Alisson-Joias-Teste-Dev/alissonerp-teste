import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
// REGRA DE NEGOCIO: saldo de estoque centralizado em src/lib/estoque-saldo.ts
// (pente-fino 10/08/2026, etapa 2) — nao reimplementar SUM(saldo) aqui.
import { buscarSaldoEstoque } from "@/lib/estoque-saldo";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const TransferirInsumoSchema = z.object({
  dest_deposito_id: z.coerce.number().int().positive(),
  insumo_id: z.coerce.number().int().positive(),
  quantidade: z.coerce.number().positive(),
  foto_base64: z.string().min(1, "obrigatório"),
}).passthrough();

// POST /api/service/transferir-insumo
// Transfere insumo do estoque do operador logado para outro operador.
// Valida saldo antes de mover. IA valida foto para insumo_id=1 (ouro).
// Auth: is_operador_service = true OU fullAccess

function extrairMediaType(base64: string): string {
  if (base64.startsWith("data:image/png"))  return "image/png";
  if (base64.startsWith("data:image/webp")) return "image/webp";
  return "image/jpeg";
}
function extrairBase64Puro(b64: string): string {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const [caller] = await sql`
      SELECT role, deposito_id, is_operador_service, nome
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
    `;
    if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

    const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
    if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    if (!caller.deposito_id) {
      return NextResponse.json({ error: "Usuário sem depósito vinculado" }, { status: 422 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = TransferirInsumoSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;
    const origemId   = caller.deposito_id as number;
    const destId     = body.dest_deposito_id;
    const insumoId   = body.insumo_id;
    const quantidade = body.quantidade;
    const fotoBase64 = body.foto_base64;
    if (destId === origemId) return NextResponse.json({ error: "Destino deve ser um operador diferente" }, { status: 400 });

    // ── 1. Verificar depósito destino ─────────────────────────────────────────
    const [destDeposito] = await sql`
      SELECT id, nome, local_estoque_id FROM alissonerp.depositos WHERE id = ${destId}
    `;
    if (!destDeposito) return NextResponse.json({ error: "Operador destino não encontrado" }, { status: 404 });

    // ── 2. Verificar insumo ───────────────────────────────────────────────────
    const [insumo] = await sql`SELECT id, nome, categoria_id FROM alissonerp.insumos WHERE id = ${insumoId}`;
    if (!insumo) return NextResponse.json({ error: "Insumo não encontrado" }, { status: 404 });

    /**
     * O QUE FAZ: converte a quantidade digitada para a unidade do estoque.
     *
     * O PORQUÊ: pedra é pesada na balança em GRAMA, mas o estoque de pedra é
     * controlado em QUILATE (1 ct = 0,2 g) — é assim que ela entra por compra e
     * sai por apontamento. Metal e demais insumos já são gramas nas duas pontas.
     *
     * IMPACTO se remover: a grama entra no razão como se fosse quilate. Foi
     * exatamente isso que aconteceu com a Mossanite PD-1352 (movimentação 3400,
     * 07/08/2026): 2 pedras de 1,2 g entraram como 2,4 num estoque em ct, onde
     * deviam ser 12 — e o apontamento seguinte foi barrado por saldo.
     */
    const isPedra = (insumo.categoria_id as number) === 2;
    const quantidadeEstoque = isPedra
      ? parseFloat((quantidade / 0.2).toFixed(4))
      : quantidade;
    const unidade = isPedra ? "ct" : "g";

    // ── 3. Verificar saldo da origem ──────────────────────────────────────────
    const saldoAtual = await buscarSaldoEstoque(sql, origemId, insumoId);
    if (saldoAtual < quantidadeEstoque) {
      return NextResponse.json(
        { error: `Saldo insuficiente. Disponível: ${saldoAtual.toFixed(4)}${unidade}, solicitado: ${quantidadeEstoque.toFixed(4)}${unidade}` },
        { status: 422 }
      );
    }

    // ── 4. IA valida foto (obrigatório para ouro/metal) ───────────────────────
    const isOuro = (insumo.categoria_id as number) === 1;
    if (isOuro) {
      const mediaType  = extrairMediaType(fotoBase64);
      const base64Puro = extrairBase64Puro(fotoBase64);
      const validacao  = await validarPesoBalanca(base64Puro, mediaType, quantidade, "metal");
      if (!validacao.match) {
        return NextResponse.json(
          { error: `Peso não confirmado pela IA: ${validacao.mensagem}` },
          { status: 422 }
        );
      }
    }

    // ── 5. Upload da foto ─────────────────────────────────────────────────────
    const mediaType  = extrairMediaType(fotoBase64);
    const fotoPath   = `transferencias/${origemId}-${destId}/${insumoId}-${Date.now()}.jpg`;
    const fotoResult = await uploadFile("service-fotos", fotoPath, fotoBase64, mediaType);
    if ("error" in fotoResult) {
      return NextResponse.json({ error: `Erro no upload: ${fotoResult.error}` }, { status: 500 });
    }

    // ── 6. Depósito origem: local_estoque_id ──────────────────────────────────
    const [origemDeposito] = await sql`
      SELECT local_estoque_id FROM alissonerp.depositos WHERE id = ${origemId}
    `;
    const localOrigem = (origemDeposito?.local_estoque_id ?? 1) as number;
    const localDest   = (destDeposito.local_estoque_id   ?? 1) as number;

    const operadorNome = (caller.nome ?? "operador") as string;
    const obs = `Transferência ${insumo.nome as string}: ${operadorNome} → ${destDeposito.nome as string}`;

    // ── 7. Dupla-entrada em transação ─────────────────────────────────────────
    await (sql as unknown as { begin: (fn: (tx: typeof sql) => Promise<void>) => Promise<void> }).begin(async (tx) => {
      // As duas pernas usam quantidadeEstoque (ct para pedra, g para o resto) —
      // nunca a quantidade digitada crua, senão a unidade do razão fica mista.
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, local_estoque_id, entrada, saida, marcador, observacao, data_hora)
        VALUES (${insumoId}, ${origemId}, ${localOrigem}, 0, ${quantidadeEstoque}, 'SA', ${obs}, NOW())
      `;
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, local_estoque_id, entrada, saida, marcador, observacao, data_hora)
        VALUES (${insumoId}, ${destId}, ${localDest}, ${quantidadeEstoque}, 0, 'EA', ${obs}, NOW())
      `;
    });

    // ── 8. Novos saldos ───────────────────────────────────────────────────────
    const novosSaldos = await sql`
      SELECT deposito_id, COALESCE(SUM(saldo), 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE insumo_id = ${insumoId} AND deposito_id IN (${origemId}, ${destId})
      GROUP BY deposito_id
    `;
    const novoSaldoOrigem = parseFloat(parseFloat(String(novosSaldos.find(r => r.deposito_id === origemId)?.saldo ?? 0)).toFixed(4));
    const novoSaldoDest   = parseFloat(parseFloat(String(novosSaldos.find(r => r.deposito_id === destId)?.saldo   ?? 0)).toFixed(4));

    return NextResponse.json({
      success:           true,
      foto_url:          fotoResult.url,
      novo_saldo_origem: novoSaldoOrigem,
      novo_saldo_dest:   novoSaldoDest,
    });
  } catch (err) {
    return internalError("[POST /api/service/transferir-insumo]", err);
  }
}
