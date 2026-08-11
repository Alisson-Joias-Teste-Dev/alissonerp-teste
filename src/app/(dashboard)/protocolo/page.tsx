import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import ProtocoloClient from "./ProtocoloClient";
import ProtocoloMotoboy from "@/components/motoboy/ProtocoloMotoboy";

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ["admin", "desenvolvedor"];
/**
 * REGRA DE NEGÓCIO: quem tem acesso total enxerga todos os tipos de protocolo.
 * Para os demais, o que vale é `usuarios.tipos_protocolo_permitidos` (tela de
 * permissões) — é assim que se libera a transferência de estoque para consultora
 * ou estoquista sem cravar papel no código.
 */
const ALL_TIPOS_PROTOCOLO = ["fabrica", "transferencia"];

export default async function ProtocoloPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.user_metadata?.role === "motoboy") {
    return <ProtocoloMotoboy />;
  }

  // Buscar permissões de protocolo do usuário logado
  let tiposProtocoloPermitidos: string[] = [];
  let podeColetar = false;
  if (user) {
    const [usuario] = await sql`
      SELECT role::text AS role, tipos_protocolo_permitidos, is_transportador
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (usuario) {
      /**
       * REGRA DE NEGÓCIO: quem pode confirmar a coleta de uma transferência é
       * quem está marcado como transportador — o motoboy usa o app do celular, o
       * gerente e o dono usam esta tela. Ninguém precisa trocar de papel no ERP
       * só porque levou uma peça.
       */
      podeColetar = Boolean(usuario.is_transportador) || FULL_ACCESS_ROLES.includes(usuario.role);
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
        r.nome AS concluido_por_nome,
        -- Transferência de estoque: trajeto + estado DERIVADO (solicitado →
        -- em_rota → recebido). Ver docs/regras-negocio/protocolo.md §5.3.
        lo.nome AS local_origem_nome,
        ld.nome AS local_destino_nome,
        COUNT(DISTINCT pp.produto_id)::integer AS total_produtos,
        CASE
          WHEN p.tipo_protocolo <> 'transferencia' THEN NULL
          WHEN p.etapas::text = 'concluido' THEN 'recebido'
          WHEN p.etapas::text = 'cancelado' THEN 'cancelado'
          WHEN EXISTS (
            SELECT 1 FROM alissonerp.transferencias_estoque_comercial t
            WHERE t.protocolo_id = p.id AND t.status = 'pendente'
          ) THEN 'em_rota'
          ELSE 'solicitado'
        END AS estado_transferencia
      FROM alissonerp.protocolos p
      LEFT JOIN alissonerp.protocolo_ordens po ON po.protocolo_id = p.id
      LEFT JOIN alissonerp.protocolo_produtos pp ON pp.protocolo_id = p.id
      LEFT JOIN alissonerp.usuarios m        ON m.id = p.motoboy_id
      LEFT JOIN alissonerp.usuarios r        ON r.id = p.recebedor_id
      LEFT JOIN alissonerp.locais_estoque lo ON lo.id = p.local_origem_id
      LEFT JOIN alissonerp.locais_estoque ld ON ld.id = p.local_destino_id
      WHERE p.direcao = 'ida' AND p.tipo_protocolo != 'interno'
      GROUP BY p.id, m.nome, r.nome, lo.nome, ld.nome
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
      WHERE p.direcao = 'volta' AND p.tipo_protocolo != 'interno'
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
        ac.observacao AS obs,
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
      podeColetar={podeColetar}
    />
  );
}
