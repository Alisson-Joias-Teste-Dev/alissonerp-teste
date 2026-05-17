import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { sendToTiny } from "@/lib/vendas-aprovar";

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Busca todas as vendas com erro e sem tiny_pedido_id (não foram enviadas)
  const vendas = await sql`
    SELECT id, numero_venda, situacao FROM alissonerp.vendas_erp
    WHERE tiny_sync_status = 'erro'
      AND tiny_pedido_id IS NULL
      AND situacao NOT IN ('cancelado')
    ORDER BY id DESC
    LIMIT 100
  `;

  if (vendas.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sincronizados: 0, erros: 0, detalhes: [] });
  }

  // Reseta status de todas antes de tentar
  await sql`
    UPDATE alissonerp.vendas_erp
    SET tiny_sync_status = 'pendente', tiny_sync_erro = NULL
    WHERE id = ANY(${vendas.map(v => v.id)})
  `;

  let sincronizados = 0;
  let erros = 0;
  const detalhes: { numero_venda: string; ok: boolean; erro?: string }[] = [];

  for (const venda of vendas) {
    try {
      await sendToTiny(Number(venda.id));
      sincronizados++;
      detalhes.push({ numero_venda: String(venda.numero_venda), ok: true });
    } catch (err) {
      erros++;
      const internalMsg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[tiny/resync-erros] venda=${venda.numero_venda} falhou:`, err);
      // Reporta classificacao do erro sem vazar mensagem bruta do Tiny/Postgres
      const tokenInvalidado = internalMsg.includes("expirado") || internalMsg.includes("Token");
      detalhes.push({
        numero_venda: String(venda.numero_venda),
        ok: false,
        erro: tokenInvalidado ? "Token Tiny expirado/inválido" : "Falha ao enviar (ver log do servidor)",
      });
      // Se o primeiro já falhou por token, para — os demais vão falhar igual
      if (tokenInvalidado) break;
    }
  }

  return NextResponse.json({
    ok: erros === 0,
    total: vendas.length,
    sincronizados,
    erros,
    detalhes,
  });
}
