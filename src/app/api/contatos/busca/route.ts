// ═══════════════════════════════════════════════════════════════════════════
// GET /api/contatos/busca?q=...&limit=...
//
// REGRA DE NEGÓCIO: Busca autenticada em public.contatos por nome ou
// CPF/CNPJ. Usada pelo ClienteSelector do módulo Metal para selecionar
// fornecedores (compra) e clientes (recebimento). Suporta CPF com/sem
// máscara.
//
// IMPACTO SE REMOVIDO: ClienteSelector do módulo Metal não consegue
// buscar contatos, bloqueando cadastro de compras e recebimentos.
//
// REGRA DE NEGÓCIO (03/08/2026 — confirmação de endereço no Frete Avulso):
// resposta também traz o endereço de cadastro (endereco/numero/complemento/
// bairro/municipio/uf/cep) — usado por FreteAvulsoModal como sugestão de
// endereço quando o cliente não tem venda vinculada. Consumidores existentes
// (ClienteSelector do módulo Metal) ignoram os campos extras sem quebrar.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10) || 10, 1), 20);

  // Se a query for numérica (CPF/CNPJ), faz busca exata pelo CPF sem máscara
  const digitos = q.replace(/\D/g, "");
  if (digitos.length >= 3) {
    const rows = await sql`
      SELECT id_contato, nome, cpf_cnpj, telefone,
           endereco, numero, complemento, bairro, municipio, uf, cep
      FROM public.contatos
      WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') ILIKE ${"%" + digitos + "%"}
         OR nome ILIKE ${"%" + q + "%"}
      ORDER BY
        CASE WHEN cpf_cnpj ILIKE ${digitos + "%"} THEN 0 ELSE 1 END,
        nome ASC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  }

  // Busca textual por nome
  const rows = await sql`
    SELECT id_contato, nome, cpf_cnpj, telefone,
           endereco, numero, complemento, bairro, municipio, uf, cep
    FROM public.contatos
    WHERE nome ILIKE ${"%" + q + "%"}
    ORDER BY nome ASC
    LIMIT ${limit}
  `;
  return NextResponse.json(rows);
}
