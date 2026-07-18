import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";
import { ROLES_CADASTRAR_RFID } from "@/lib/rfid/roles";
import { RfidCadastrarSchema } from "@/lib/rfid/tipos";
import { buscarProduto, gerarProximoSerial, cadastrarJoiaPendente, modeloEtiquetaPadrao } from "@/lib/rfid/repo";
import { buildEpc } from "@/lib/rfid/epc";
import { gerarZplJoiaDoModelo } from "@/lib/rfid/zpl";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

/**
 * POST /api/rfid/cadastrar
 *
 * Body: { produto_id: number }
 *
 * Fluxo:
 *   1. Autentica usuario (401 se nao logado)
 *   2. Valida role (403 se nao autorizado)
 *   3. Valida body com RfidCadastrarSchema
 *   4. Busca produto via repo (404 se nao existe, 422 se sem sku/nome)
 *   5. Gera serial via repo (sequencial atomico)
 *   6. Monta EPC via buildEpc(idProduto, serial)
 *   7. Insere joia pendente via repo (transacao unica: joia + leitura)
 *   8. Gera string ZPL (grava EPC em hex + QR + texto)
 *
 * Response: { ok: true, epc, zpl }
 *
 * O frontend, ao receber OK, envia o ZPL ao Zebra Browser Print.
 * Se a impressao falhar, deve chamar POST /api/rfid/reverter { epc }.
 * Se a impressao OK, deve chamar POST /api/rfid/confirmar-impressao { epc }.
 */
export async function POST(req: NextRequest) {
  // -----------------------------------------------------------
  // 1. Auth
  // -----------------------------------------------------------
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  // -----------------------------------------------------------
  // 2. Role check
  // -----------------------------------------------------------
  const [u] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !hasRole(role, ROLES_CADASTRAR_RFID))) {
    return NextResponse.json(
      { error: "Sem permissao para cadastrar tag RFID" },
      { status: 403 },
    );
  }

  // -----------------------------------------------------------
  // 3. Parse + valida body
  // -----------------------------------------------------------
  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RfidCadastrarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const produtoId = parsed.data.produto_id;

  try {
    // -----------------------------------------------------------
    // 4. Busca produto
    // -----------------------------------------------------------
    const produto = await buscarProduto(produtoId);
    if (!produto) {
      return NextResponse.json(
        { error: "Produto nao encontrado" },
        { status: 404 },
      );
    }

    if (!produto.sku || !produto.nome) {
      return NextResponse.json(
        { error: "Produto nao tem SKU ou nome preenchidos — impossivel gerar etiqueta" },
        { status: 422 },
      );
    }

    const produtoData = {
      produto_id: produto.id_produto,
      sku: produto.sku,
      nome: produto.nome,
      categoria: produto.categoria,
      peso_g: produto.peso_real,
      preco_venda: produto.preco_tiny,
    };

    // -----------------------------------------------------------
    // 5. Gera serial + EPC
    // -----------------------------------------------------------
    const serial = await gerarProximoSerial();
    const epc = buildEpc(produtoId, serial);

    // -----------------------------------------------------------
    // 6. Cadastra joia pendente (transacao: joia + leitura)
    // -----------------------------------------------------------
    await cadastrarJoiaPendente({
      produtoData,
      userId: user.id,
      epc,
    });

    // -----------------------------------------------------------
    // 7. Gera ZPL
    // -----------------------------------------------------------
    const modelo = await modeloEtiquetaPadrao();
    const zpl = gerarZplJoiaDoModelo(
      { id_produto: produtoId, sku: produto.sku, nome: produto.nome },
      epc,
      modelo,
    );

    return NextResponse.json({ ok: true, epc, zpl });
  } catch (err) {
    return internalError("[POST /api/rfid/cadastrar]", err, "Erro interno");
  }
}
