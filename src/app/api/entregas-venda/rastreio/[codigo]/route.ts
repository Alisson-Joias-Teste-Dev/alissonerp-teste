/**
 * GET /api/entregas-venda/rastreio/[codigo]
 * [codigo] = código de entrega no formato ENT-YYYYMMDD-XXXXX
 *
 * ROTA PÚBLICA — não requer autenticação.
 *
 * Permite que clientes consultem o status de suas entregas usando apenas
 * o código de entrega (ENT-...). Este código é seguro para compartilhar
 * pois não permite ações (diferente dos códigos de verificação).
 *
 * REGRA DE NEGÓCIO: este endpoint é acessível sem login para que o cliente
 * possa acompanhar sua entrega via link enviado por WhatsApp/email.
 * Dados expostos são mínimos e não sensíveis.
 *
 * O QUE: busca a entrega pelo código_entrega, faz JOIN com vendas_erp para
 * obter o número da venda, e retorna dados públicos: código, situação,
 * data de criação, status e quantidade de itens.
 *
 * POR QUE: reduz a carga no suporte — o cliente consulta sozinho o status
 * da entrega em vez de ligar/mandar mensagem para a loja.
 *
 * SEGURANÇA: esta rota NÃO expõe códigos de verificação (codigo_cliente,
 * codigo_motoboy), dados do cliente, valores, endereço ou qualquer
 * informação sensível. Apenas status operacional.
 *
 * IMPACTO SE ALTERADO: se a rota for removida ou passar a exigir auth,
 * os links de rastreio enviados aos clientes param de funcionar,
 * gerando insatisfação e aumento de chamados no suporte.
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await params;

  // Validação básica do formato do código
  // REGRA DE NEGÓCIO: códigos de entrega seguem o formato ENT-YYYYMMDD-XXXXX.
  // Se não seguir este formato, é provável que seja um código de verificação
  // (6 dígitos) que NÃO deve ser usado para rastreio público.
  if (!codigo || codigo.length < 5) {
    return NextResponse.json(
      { error: "Código de entrega inválido" },
      { status: 400 },
    );
  }

  // REGRA DE NEGÓCIO: busca pela coluna codigo_entrega (formato ENT-...).
  // Esta coluna é segura para expor publicamente pois não permite ações.
  // Os códigos de verificação (codigo_cliente/codigo_motoboy) NÃO são usados aqui.
  const [entrega] = await sql`
    SELECT
      ev.codigo_entrega,
      ev.status AS situacao,
      ev.created_at,
      ev.forma_entrega,
      ve.numero_venda,
      ve.status AS venda_situacao,
      (SELECT COUNT(*) FROM alissonerp.entregas_venda_itens WHERE entrega_id = ev.id)::integer AS itens_count
    FROM alissonerp.entregas_venda ev
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    WHERE ev.codigo_entrega = ${codigo}
    LIMIT 1
  `;

  if (!entrega) {
    return NextResponse.json(
      { error: "Entrega não encontrada" },
      { status: 404 },
    );
  }

  // REGRA DE NEGÓCIO: retorna dados mínimos para o cliente acompanhar.
  // NÃO inclui: códigos de verificação, nome do cliente, endereço,
  // valores, dados do motoboy ou qualquer outra informação sensível.
  //
  // O campo status_entrega é um alias para situacao — o frontend público
  // pode usar para exibir um badge visual (pendente, em andamento, entregue).
  return NextResponse.json({
    codigo: entrega.codigo_entrega,
    situacao: entrega.situacao,
    data_criacao: entrega.created_at,
    status_entrega: entrega.situacao,
    numero_venda: entrega.numero_venda,
    itens_count: Number(entrega.itens_count ?? 0),
  });
}
