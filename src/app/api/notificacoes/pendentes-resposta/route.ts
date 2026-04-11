import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/notificacoes/pendentes-resposta
// Retorna as menções que estão aguardando resposta do usuário logado
// (usado pelo alarme sonoro do MencaoAlarme no DashboardShell).
//
// Respeita snooze global: se alissonerp.usuarios.notif_alarme_silenciado_ate
// está no futuro, retorna { total: 0, silenciado_ate } para que o alarme
// fique mudo até a janela expirar.
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Checa snooze antes de buscar pendências
  const [usuario] = await sql<
    { notif_alarme_silenciado_ate: Date | null }[]
  >`
    SELECT notif_alarme_silenciado_ate
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
    LIMIT 1
  `;

  const agora = new Date();
  const silenciadoAte = usuario?.notif_alarme_silenciado_ate ?? null;
  const ativo =
    silenciadoAte != null && new Date(silenciadoAte).getTime() > agora.getTime();

  if (ativo) {
    return NextResponse.json({
      total: 0,
      itens: [],
      silenciado_ate: silenciadoAte,
    });
  }

  const rows = await sql`
    SELECT
      n.id,
      n.ordem_id,
      n.titulo,
      n.mensagem,
      n.link,
      n.created_at,
      u.nome AS remetente_nome,
      o.numero_ordem
    FROM alissonerp.notificacoes n
    LEFT JOIN alissonerp.usuarios u ON u.id = n.remetente_id
    LEFT JOIN alissonerp.ordens   o ON o.id = n.ordem_id
    WHERE n.usuario_id = ${user.id}::uuid
      AND n.tipo = 'mencao'
      AND n.aguardando_resposta = true
    ORDER BY n.created_at ASC
    LIMIT 20
  `;

  return NextResponse.json({
    total: rows.length,
    itens: rows.map((r) => ({
      id: Number(r.id),
      ordem_id: r.ordem_id != null ? Number(r.ordem_id) : null,
      numero_ordem: r.numero_ordem ?? null,
      titulo: r.titulo ?? "",
      mensagem: r.mensagem ?? null,
      link: r.link ?? null,
      remetente_nome: r.remetente_nome ?? null,
      created_at: r.created_at,
    })),
    silenciado_ate: null,
  });
}
