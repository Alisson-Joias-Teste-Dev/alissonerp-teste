import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// ─── GET /api/vendas/clientes/busca?q=&limit= ─────────────────────────────────
// Busca clientes em public.contatos (READONLY)
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { searchParams } = new URL(req.url);
  const q     = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  // Documento (CPF/CNPJ) é armazenado SEM máscara no banco (intencional).
  // Se o usuário digitou algo que parece um doc (só dígitos/pontos/traços/barras/espaços
  // com ≥3 dígitos), normalizamos a query para dígitos e comparamos contra o cpf_cnpj
  // também normalizado via regexp_replace — assim "059", "059.123.456-78" e
  // "05912345678" batem no mesmo cliente.
  const qDigits = q.replace(/\D+/g, "");
  const isDocSearch = qDigits.length >= 3 && /^[\d.\-\/\s]+$/.test(q);

  const clientes = isDocSearch
    ? await sql`
        SELECT
          id_contato AS id,
          nome,
          cpf_cnpj,
          email,
          telefone,
          celular,
          endereco,
          numero,
          complemento,
          bairro,
          municipio,
          cep,
          uf
        FROM public.contatos
        WHERE regexp_replace(COALESCE(cpf_cnpj, ''), '\D', '', 'g') ILIKE ${'%' + qDigits + '%'}
        ORDER BY nome
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          id_contato AS id,
          nome,
          cpf_cnpj,
          email,
          telefone,
          celular,
          endereco,
          numero,
          complemento,
          bairro,
          municipio,
          cep,
          uf
        FROM public.contatos
        WHERE
          nome     ILIKE ${'%' + q + '%'}
          OR email    ILIKE ${'%' + q + '%'}
          OR telefone ILIKE ${'%' + q + '%'}
          OR celular  ILIKE ${'%' + q + '%'}
        ORDER BY nome
        LIMIT ${limit}
      `;

  return NextResponse.json(clientes);
}
