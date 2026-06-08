/**
 * POST /api/entregas-venda/consultar-codigo
 *
 * Consulta informações básicas de uma entrega a partir de um código
 * de verificação (código A do cliente ou código B do motoboy).
 *
 * REGRA DE NEGÓCIO: usado pelo operador da loja para verificar rapidamente
 * a qual entrega um código pertence, sem expor dados sensíveis como o
 * código completo do outro participante.
 *
 * O QUE: recebe um código de 6 dígitos, busca em entregas_venda onde
 * codigo_cliente = codigo OU codigo_motoboy = codigo, e retorna dados
 * mínimos: id da entrega, situação, forma de entrega, código da entrega
 * (ENT-...), e quantidade de itens.
 *
 * POR QUE: permite que o operador identifique rapidamente se um código
 * é válido e a qual entrega pertence, sem precisar navegar pela lista
 * completa. Essencial para o fluxo de balcão/retirada.
 *
 * SEGURANÇA: esta rota NÃO retorna o outro código de verificação.
 * Se o código informado é o do cliente, o código do motoboy NÃO é exposto,
 * e vice-versa. Apenas dados operacionais básicos são retornados.
 *
 * IMPACTO SE ALTERADO: expor ambos os códigos permitiria que um cliente
 * mal-intencionado obtivesse o código do motoboy e vice-versa, quebrando
 * a segurança do sistema de dois fatores.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

// Schema: código de 6 dígitos (string, pode ter zeros à esquerda)
const ConsultarCodigoSchema = z.object({
  codigo: z
    .string()
    .min(1, "Código é obrigatório")
    .max(6, "Código deve ter no máximo 6 dígitos"),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Verifica se o usuário existe no ERP
  const [usuario] = await sql`
    SELECT id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // Validação do body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = ConsultarCodigoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { codigo } = parsed.data;

  // REGRA DE NEGÓCIO: busca por código_cliente OU código_motoboy.
  // Ambos são códigos de 6 dígitos únicos no sistema.
  // Retorna apenas dados operacionais, sem expor códigos sensíveis.
  const [entrega] = await sql`
    SELECT
      ev.id,
      ev.situacao,
      ev.forma_entrega,
      ev.codigo_entrega,
      ev.codigo_cliente,
      ev.codigo_motoboy,
      (SELECT COUNT(*) FROM alissonerp.entregas_venda_itens WHERE entrega_id = ev.id)::integer AS itens_count
    FROM alissonerp.entregas_venda ev
    WHERE ev.codigo_cliente = ${codigo} OR ev.codigo_motoboy = ${codigo}
    LIMIT 1
  `;

  if (!entrega) {
    return NextResponse.json(
      { error: "Código não encontrado. Nenhuma entrega ativa possui este código." },
      { status: 404 },
    );
  }

  // REGRA DE SEGURANÇA: determina qual código foi usado e NÃO expõe o outro.
  // Se o cliente usou o código dele, não mostramos o código do motoboy.
  // Se o motoboy usou o código dele, não mostramos o código do cliente.
  const codigoUsado = entrega.codigo_cliente === codigo ? "cliente" : "motoboy";

  return NextResponse.json({
    id: Number(entrega.id),
    situacao: entrega.situacao,
    forma_entrega: entrega.forma_entrega,
    codigo_entrega: entrega.codigo_entrega,
    codigo_usado: codigoUsado,
    itens_count: Number(entrega.itens_count ?? 0),
  });
}
