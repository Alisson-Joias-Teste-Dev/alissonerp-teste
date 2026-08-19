import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import VendaDetalheClient from "./VendaDetalheClient";
import { calcularTetoDesconto, FULL_ACCESS_ROLES_DESCONTO } from "@/lib/desconto/precificar-item";
import { buscarFallbackDescontoSemCadastro } from "@/lib/aprovacao-regras";
import { isMasterAdmin } from "@/lib/master-admin";

interface Props {
  params: Promise<{ id: string }>;
}

const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];

export default async function VendaDetalhePage({ params }: Props) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role        = "consultora";
  let vendedorId: number | null = null;
  let maxDesconto = 0; // fallback antes de ler o usuário (Fase 5 — alinhado ao novo default)

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id, mx_desconto_permitido
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role       = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;

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

  const descontoAuthThreshold = maxDesconto;

  // REGRA DE NEGÓCIO (19/08/2026): identifica o master admin (Alisson) pra
  // liberar o botão "Aprovar como Ação Marketing" — é decisão pessoal do
  // dono, nunca por role/cargo. Ver src/lib/master-admin.ts e approveVenda().
  // IMPACTO SE REMOVIDO: botão de aprovação-cortesia deixa de aparecer.
  const souMasterAdmin = user ? await isMasterAdmin(user.id) : false;

  return (
    <VendaDetalheClient
      vendaId={Number(id)}
      role={role}
      vendedorId={vendedorId}
      isFullAccess={FULL_ACCESS.includes(role)}
      maxDesconto={maxDesconto}
      descontoAuthThreshold={descontoAuthThreshold}
      isMasterAdmin={souMasterAdmin}
    />
  );
}
