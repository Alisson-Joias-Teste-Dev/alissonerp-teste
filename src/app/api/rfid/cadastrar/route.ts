import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, isFullAccess } from "@/lib/roles";
import { gerarZplEtiquetaJoia } from "@/lib/rfid-zpl";
import { zodError } from "@/lib/schemas/common";

const RfidCadastrarSchema = z.object({
  produto_id: z.coerce.number().int().positive(),
}).passthrough();

/**
 * POST /api/rfid/cadastrar
 *
 * Body: { produto_id: number }
 *
 * Fluxo (UMA transacao):
 *   1. Autentica usuario (401 se nao logado)
 *   2. Valida role (403 se nao autorizado)
 *   3. Valida existencia do produto em alissonerp.produtos_compat (404 se nao existe)
 *   4. Gera proximo EPC via fn alissonerp.gerar_proximo_epc()
 *   5. INSERT em alissonerp.joias_rfid com status='pendente_impressao'
 *   6. INSERT em alissonerp.joias_leituras (evento='cadastro')
 *   7. Gera string ZPL (grava EPC em hex + QR + texto)
 *
 * Response: { ok: true, epc, zpl }
 *
 * O frontend, ao receber OK, envia o ZPL ao Zebra Browser Print.
 * Se a impressao falhar, deve chamar POST /api/rfid/reverter { epc }.
 * Se a impressao OK, deve chamar POST /api/rfid/confirmar-impressao { epc }.
 */

// Roles autorizadas a cadastrar tag RFID.
// Cadastro acontece na fabrica quando a joia entra no estoque rastreado.
const ROLES_CADASTRAR_RFID = [
  "admin",
  "desenvolvedor",
  "gerente_fabrica",
  "estoquista_fabrica",
] as const;

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

  // -----------------------------------------------------------
  // 4. Transacao: busca produto + gera EPC + insert
  // -----------------------------------------------------------
  try {
    const resultado = await sql.begin(async (tx: any) => {
      // Busca produto (alissonerp.produtos_compat — readonly, ok somente SELECT)
      const [produto] = await tx`
        SELECT
          id_produto,
          sku,
          nome,
          categoria,
          peso_real,
          preco_tiny
        FROM alissonerp.produtos_compat
        WHERE id_produto = ${produtoId}
      `;

      if (!produto) {
        throw new HttpError(404, "Produto nao encontrado");
      }

      const sku:  string | null = produto.sku  ?? null;
      const nome: string | null = produto.nome ?? null;

      if (!sku || !nome) {
        throw new HttpError(
          422,
          "Produto nao tem SKU ou nome preenchidos — impossivel gerar etiqueta",
        );
      }

      // peso_real em alissonerp.produtos_compat e REAL (4 bytes). Salvamos como NUMERIC(8,3).
      // preco_tiny e NUMERIC. Ambos podem ser null (snapshot opcional).
      const pesoG:
        | number
        | null = produto.peso_real != null ? Number(produto.peso_real) : null;
      const precoVenda:
        | number
        | null = produto.preco_tiny != null ? Number(produto.preco_tiny) : null;
      const categoria: string | null = produto.categoria ?? null;

      // Gera EPC sequencial
      const [epcRow] = await tx`SELECT alissonerp.gerar_proximo_epc() AS epc`;
      const epc: string = epcRow.epc;

      // Insere joia com status pendente_impressao (muda para 'ativo' via confirmar-impressao)
      await tx`
        INSERT INTO alissonerp.joias_rfid (
          epc,
          produto_id,
          sku,
          nome,
          categoria,
          peso_g,
          preco_venda,
          localizacao_atual,
          status,
          criado_por
        ) VALUES (
          ${epc},
          ${produtoId},
          ${sku},
          ${nome},
          ${categoria},
          ${pesoG},
          ${precoVenda},
          'fabrica',
          'pendente_impressao',
          ${user.id}::uuid
        )
      `;

      // Registra evento na timeline
      await tx`
        INSERT INTO alissonerp.joias_leituras (
          epc,
          evento,
          localizacao,
          leitor_id,
          operador,
          metadata
        ) VALUES (
          ${epc},
          'cadastro',
          'fabrica',
          'ZEBRA-ZD621R',
          ${user.id}::uuid,
          ${sql.json({ produto_id: produtoId, sku, nome })}
        )
      `;

      return { epc, sku, nome };
    });

    // -----------------------------------------------------------
    // 5. Gera ZPL (fora da TX — evita abrir conexao enquanto gera texto)
    // -----------------------------------------------------------
    const zpl = gerarZplEtiquetaJoia({
      epc:  resultado.epc,
      sku:  resultado.sku,
      nome: resultado.nome,
    });

    return NextResponse.json({ ok: true, epc: resultado.epc, zpl });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[POST /api/rfid/cadastrar] Erro interno:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Helper interno para sinalizar status HTTP custom a partir do callback sql.begin().
 */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
