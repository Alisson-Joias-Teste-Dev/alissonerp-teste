import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import NovaVendaClientV2 from "./NovaVendaClientV2";
import { calcularTetoDesconto, FULL_ACCESS_ROLES_DESCONTO } from "@/lib/desconto/precificar-item";
import { buscarFallbackDescontoSemCadastro } from "@/lib/aprovacao-regras";

const PODE_SELECIONAR_VENDEDOR = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "financeiro"];

export default async function NovaVendaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role              = "consultora";
  let vendedorId: number | null = null;
  let maxDesconto       = 0; // fallback antes de ler o usuário (Fase 5 — alinhado ao novo default)
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

      // REGRA DE NEGÓCIO (Fase 5, 15/07): FONTE ÚNICA — antes esta CASE (15/30/50
      // por cargo) duplicava a lógica hardcoded do gate real (getDescontoThreshold
      // em aprovacao-regras.ts) e divergia dele. Agora os dois chamam
      // calcularTetoDesconto (src/lib/desconto/precificar-item.ts), com o mesmo
      // fallback vindo de configuracoes_sistema.desconto_fallback_sem_cadastro_pct.
      // IMPACTO SE REMOVIDO: a tela volta a mostrar um teto diferente do que o
      // servidor realmente aceita sem pedir aprovação.
      const fallbackDesconto = await buscarFallbackDescontoSemCadastro();
      maxDesconto = calcularTetoDesconto(
        u.mx_desconto_permitido != null ? Number(u.mx_desconto_permitido) : null,
        role,
        FULL_ACCESS_ROLES_DESCONTO,
        fallbackDesconto,
      );
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
