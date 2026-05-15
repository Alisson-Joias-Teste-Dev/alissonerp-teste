import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import ProtocoloClient from "./ProtocoloClient";
import ProtocoloMotoboy from "@/components/motoboy/ProtocoloMotoboy";

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ["admin", "desenvolvedor"];
const ALL_TIPOS_PROTOCOLO = ["fabrica", "service"];

export default async function ProtocoloPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.user_metadata?.role === "motoboy") {
    return <ProtocoloMotoboy />;
  }

  // Buscar permissões de protocolo do usuário logado
  let tiposProtocoloPermitidos: string[] = [];
  if (user) {
    const [usuario] = await sql`
      SELECT role::text AS role, tipos_protocolo_permitidos
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (usuario) {
      tiposProtocoloPermitidos = FULL_ACCESS_ROLES.includes(usuario.role)
        ? ALL_TIPOS_PROTOCOLO
        : (usuario.tipos_protocolo_permitidos ?? []);
    }
  }

  const [ida, volta, aprovacoes, entregas] = await Promise.all([
    sql`
      SELECT
        p.id,
        p.etapas::text,
        p.tipo_protocolo,
        p.data_conclusao,
        p.created_at,
        p.foto_criacao,
        p.foto_conclusao,
        COUNT(DISTINCT po.ordem_id)::integer AS total_ordens,
        m.nome AS criado_por_nome,
        r.nome AS concluido_por_nome
      FROM alissonerp.protocolos p
      LEFT JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
      LEFT JOIN alissonerp.usuarios m        ON m.id = p.motoboy_id
      LEFT JOIN alissonerp.usuarios r        ON r.id = p.recebedor_id
      WHERE p.direcao = 'ida'
      GROUP BY p.id, m.nome, r.nome
      ORDER BY p.id DESC
      LIMIT 100
    `,
    sql`
      SELECT
        p.id,
        p.etapas::text,
        p.tipo_protocolo,
        p.data_conclusao,
        p.created_at,
        p.foto_criacao,
        p.foto_conclusao,
        COUNT(DISTINCT po.ordem_id)::integer AS total_ordens,
        m.nome AS criado_por_nome,
        r.nome AS concluido_por_nome
      FROM alissonerp.protocolos p
      LEFT JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
      LEFT JOIN alissonerp.usuarios m        ON m.id = p.motoboy_id
      LEFT JOIN alissonerp.usuarios r        ON r.id = p.recebedor_id
      WHERE p.direcao = 'volta'
      GROUP BY p.id, m.nome, r.nome
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
      tiposProtocoloPermitidos={tiposProtocoloPermitidos}
    />
  );
}
