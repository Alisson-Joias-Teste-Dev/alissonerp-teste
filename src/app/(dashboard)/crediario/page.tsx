import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import CrediarioClient from "./CrediarioClient";

export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

export default async function CrediarioPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;

  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role as string)) {
    redirect("/");
  }

  const isConsultora = usuario.role === "consultora";
  const vendedorId = usuario.vendedor_id as number | null;

  // Pré-carrega primeira página server-side
  const whereVendedor = isConsultora && vendedorId
    ? sql`AND vendedor_id = ${vendedorId}`
    : sql``;

  // CREDIÁRIO = só vendas "A Receber" (fiado). MANTÉM se: tem "A Receber" OU é
  // legado (sem pagamento_venda) OU foi baixada pelo crediário (tem comunicacao).
  // EXCLUI o resto = paga pelo PEDIDO. Filtro de exibição (igual ao /api/crediario).
  const whereCrediario = sql`
    AND (
      EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
              WHERE p.venda_id = vw_crediario.venda_id AND p.forma = 'A Receber')
      OR NOT EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
                     WHERE p.venda_id = vw_crediario.venda_id)
      OR EXISTS (SELECT 1 FROM alissonerp.comunicacoes_crediario c
                 JOIN alissonerp.contas_receber cr2 ON cr2.id = c.conta_receber_id
                 WHERE cr2.venda_erp_id = vw_crediario.venda_id)
    )
  `;

  const [itemsResult, countResult, saldoResult] = await Promise.all([
    sql`
      SELECT
        conta_receber_id, descricao, valor, data_vencimento, data_recebimento,
        situacao, status_aging, dias_atraso, obs, created_at,
        venda_id, numero_venda, total_venda, venda_situacao, venda_bloqueada,
        credito_gerente_usado, venda_created_at,
        (SELECT v.data_venda FROM alissonerp.vendas_erp v WHERE v.id = venda_id) AS data_venda,
        cliente_id, cliente_nome, cliente_telefone,
        vendedor_id, vendedor_nome,
        consultora_uuid, consultora_nome
      FROM alissonerp.vw_crediario
      WHERE situacao = 'pendente'
        ${whereVendedor}
        ${whereCrediario}
      ORDER BY
        CASE WHEN status_aging = 'vencido' THEN 0
             WHEN status_aging = 'vence_em_breve' THEN 1
             ELSE 2 END,
        data_vencimento ASC NULLS LAST
      LIMIT 50
    `,
    sql`
      SELECT
        COUNT(*)::integer                            AS total,
        COUNT(*) FILTER (WHERE situacao='pendente')::integer AS pendente,
        COUNT(*) FILTER (WHERE situacao='pago')::integer     AS pago,
        COUNT(*) FILTER (WHERE status_aging='vencido' AND situacao='pendente')::integer AS vencido,
        COALESCE(SUM(valor) FILTER (WHERE situacao='pendente'), 0) AS valor_pendente,
        COALESCE(SUM(valor) FILTER (WHERE status_aging='vencido' AND situacao='pendente'), 0) AS valor_vencido
      FROM alissonerp.vw_crediario
      WHERE 1=1 ${whereVendedor} ${whereCrediario}
    `,
    isConsultora
      ? sql`SELECT NULL::numeric AS saldo_atual, NULL::numeric AS saldo_limite`
      : sql`
          SELECT
            -- Saldo GERAL (regra v2.78.0): limite − A Receber pendente, derivado ao
            -- vivo (não o contador 'saldo_gerente_atual', que dava drift). Pendente =
            -- SÓ crediário REAL (mesmo filtro whereCrediario do card "Pendente");
            -- sem ele, conta pendente que não é A Receber inflava e dava negativo falso.
            -- GLOBAL (sem whereVendedor). Pode ser NEGATIVO se o A Receber passa do limite.
            (SELECT valor::numeric FROM alissonerp.configuracoes_sistema WHERE chave='saldo_gerente_limite' LIMIT 1)
              - COALESCE((SELECT SUM(valor) FROM alissonerp.vw_crediario WHERE situacao='pendente' ${whereCrediario}), 0) AS saldo_atual,
            (SELECT valor::numeric FROM alissonerp.configuracoes_sistema WHERE chave='saldo_gerente_limite' LIMIT 1) AS saldo_limite
        `,
  ]);

  const contagens = countResult[0];
  const saldo = saldoResult[0];

  return (
    <CrediarioClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items={itemsResult.map((r: any) => ({
        ...r,
        valor: Number(r.valor),
        total_venda: r.total_venda ? Number(r.total_venda) : null,
        credito_gerente_usado: r.credito_gerente_usado ? Number(r.credito_gerente_usado) : null,
        dias_atraso: Number(r.dias_atraso ?? 0),
      }))}
      contagens={{
        total:          Number(contagens.total),
        pendente:       Number(contagens.pendente),
        pago:           Number(contagens.pago),
        vencido:        Number(contagens.vencido),
        valor_pendente: Number(contagens.valor_pendente),
        valor_vencido:  Number(contagens.valor_vencido),
      }}
      saldo={
        saldo.saldo_atual != null
          ? { atual: Number(saldo.saldo_atual), limite: Number(saldo.saldo_limite) }
          : null
      }
      userRole={usuario.role as string}
      vendedorId={vendedorId}
    />
  );
}
