import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConfiguracoesClient from "./ConfiguracoesClient";
import { isFullAccess } from "@/lib/roles";

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isFullAccess(user?.user_metadata?.role)) redirect("/");

  const [parametros, webhooks, logs, usuarios, depositos, teores, ligaTipos] = await Promise.all([
    sql`SELECT * FROM public.parametros LIMIT 1`,
    sql`
      SELECT id, nome, url, ativo, descricao, ultimo_disparo, total_disparos
      FROM alissonerp.webhook_config
      ORDER BY nome
    `,
    sql`
      SELECT id, webhook_nome, response_status, erro, created_at
      FROM alissonerp.webhook_log
      ORDER BY created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT
        u.id, u.email, u.nome, u.role, u.ativo, u.created_at,
        u.tipos_ordem_permitidos,
        u.tipos_protocolo_permitidos,
        up.avatar_url
      FROM alissonerp.usuarios u
      LEFT JOIN public.user_profiles up ON up.id_user = u.id
      ORDER BY u.created_at DESC
      LIMIT 50
    `,
    sql`SELECT id, nome FROM alissonerp.depositos WHERE ativo = true ORDER BY id`,
    sql`
      SELECT t.id, t.insumo_id, t.nome, t.teor, t.ativo, t.updated_at, i.sku
      FROM alissonerp.teores_ouro t
      JOIN alissonerp.insumos i ON i.id = t.insumo_id
      ORDER BY t.nome
    `,
    sql`
      SELECT
        lto.id,
        lto.tipo_18k_insumo_id,
        i18k.nome       AS tipo_18k_nome,
        lto.liga_insumo_id,
        iliga.nome      AS liga_nome,
        lto.teor_default,
        lto.ativo,
        COALESCE(vpliga.saldo_real, 0)::numeric AS saldo_liga
      FROM alissonerp.liga_tipo_ouro lto
      JOIN alissonerp.insumos i18k  ON i18k.id  = lto.tipo_18k_insumo_id
      JOIN alissonerp.insumos iliga ON iliga.id = lto.liga_insumo_id
      LEFT JOIN alissonerp.vw_detalhe_pote vpliga ON vpliga.insumo_id = lto.liga_insumo_id
      ORDER BY lto.id
    `,
  ]);

  return (
    <ConfiguracoesClient
      parametros={(parametros as any[])[0] ?? {}}
      webhooks={webhooks as any[]}
      logs={logs as any[]}
      usuarios={usuarios as any[]}
      depositos={depositos as any[]}
      teores={teores as any[]}
      ligaTipos={ligaTipos as any[]}
    />
  );
}
