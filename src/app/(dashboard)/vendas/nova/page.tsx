import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import NovaVendaClientV2 from "./NovaVendaClientV2";

const PODE_SELECIONAR_VENDEDOR = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "financeiro"];

export default async function NovaVendaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role              = "consultora";
  let vendedorId: number | null = null;
  let maxDesconto       = 15;
  let vendedorNome      = "";
  let vendedores: { id: number; nome: string }[] = [];
  const userId            = user?.id ?? "";
  let userName          = "";

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id, mx_desconto_permitido, nome
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role       = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;
      userName   = (u.nome as string) || user.email || "";

      const SUPER = ["desenvolvedor", "admin"];
      if (SUPER.includes(role)) {
        maxDesconto = 100;
      } else if (u.mx_desconto_permitido != null && Number(u.mx_desconto_permitido) > 0) {
        maxDesconto = Number(u.mx_desconto_permitido);
      } else {
        const FULL = ["gerente_fabrica", "financeiro"];
        if (FULL.includes(role)) maxDesconto = 30;
        else if (role === "gerente_loja") maxDesconto = 50;
        else maxDesconto = 15;
      }
    }
  }

  // Buscar nome do vendedor (para consultoras com ID fixo)
  if (vendedorId) {
    const [v] = await sql`SELECT nome FROM public.vendedores WHERE id_vendedor = ${vendedorId} LIMIT 1`;
    if (v) vendedorNome = v.nome as string;
  }

  // Para admins/gerentes sem vendedor fixo: carregar lista de vendedores ativos
  if (PODE_SELECIONAR_VENDEDOR.includes(role) && !vendedorId) {
    const rows = await sql`
      SELECT id_vendedor AS id, nome
      FROM public.vendedores
      WHERE situacao = 'Ativo'
      ORDER BY nome
    `;
    vendedores = rows.map(r => ({ id: Number(r.id), nome: r.nome as string }));
  }

  const descontoAuthThreshold = maxDesconto;

  return (
    <NovaVendaClientV2
      role={role}
      vendedorId={vendedorId}
      vendedorNome={vendedorNome}
      maxDesconto={maxDesconto}
      descontoAuthThreshold={descontoAuthThreshold}
      vendedores={vendedores}
      userId={userId}
      userName={userName}
    />
  );
}
