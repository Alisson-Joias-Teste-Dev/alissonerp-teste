import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import ProtocoloClient from "./ProtocoloClient";
import ProtocoloMotoboy from "@/components/motoboy/ProtocoloMotoboy";

export const dynamic = 'force-dynamic';

export default async function ProtocoloPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.user_metadata?.role === "motoboy") {
    return <ProtocoloMotoboy />;
  }

  const [ida, volta, aprovacoes, entregas] = await Promise.all([
    sql`
      SELECT
        p.id,
        p.etapas::text,
        p.data_conclusao,
        p.created_at,
        COUNT(DISTINCT po.ordem_id)::integer AS total_ordens
      FROM alissonerp.protocolos p
      LEFT JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
      WHERE p.direcao = 'ida'
      GROUP BY p.id
      ORDER BY p.id DESC
      LIMIT 100
    `,
    sql`
      SELECT
        p.id,
        p.etapas::text,
        p.data_conclusao,
        p.created_at,
        COUNT(DISTINCT po.ordem_id)::integer AS total_ordens
      FROM alissonerp.protocolos p
      LEFT JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
      WHERE p.direcao = 'volta'
      GROUP BY p.id
      ORDER BY p.id DESC
      LIMIT 100
    `,
    sql`
      SELECT
        ac.id,
        ac.etapas::text,
        ac.ordem_id,
        ac.consultora_id,
        ac.obs,
        ac.created_at,
        o.numero_ordem,
        v.nome AS consultora_nome
      FROM alissonerp.aprovacoes_consultora ac
      LEFT JOIN alissonerp.ordens o ON o.id = ac.ordem_id
      LEFT JOIN public.vendedores v ON v.id_vendedor = ac.consultora_id
      ORDER BY ac.id DESC
      LIMIT 100
    `,
    sql`
      SELECT
        pe.id,
        pe.etapas::text,
        pe.ordem_id,
        pe.created_at,
        o.numero_ordem
      FROM alissonerp.preparacoes_entrega pe
      LEFT JOIN alissonerp.ordens o ON o.id = pe.ordem_id
      ORDER BY pe.id DESC
      LIMIT 100
    `,
  ]);

  return (
    <ProtocoloClient
      ida={ida as any[]}
      volta={volta as any[]}
      aprovacoes={aprovacoes as any[]}
      entregas={entregas as any[]}
    />
  );
}
