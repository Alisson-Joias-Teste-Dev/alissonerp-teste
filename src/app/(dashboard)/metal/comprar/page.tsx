// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: /metal/comprar/page.tsx — Nova Compra de Metal
//
// REGRA DE NEGÓCIO: Formulário para empresa comprar metal de fornecedor.
// A cotação é carregada do servidor (SSR) e passada ao componente cliente.
// Pagamento será gerado via MP após registro.
// ═══════════════════════════════════════════════════════════════════════════

import { getCotacaoOuro, getModuloConfig } from "@/lib/metal/config";
import CompraForm from "@/components/metal/CompraForm";
import { AlertTriangle } from "lucide-react";

// REGRA DE NEGÓCIO:
// O QUE: força renderização dinâmica em toda requisição da página de compra.
// POR QUE: em produção, render estático pode congelar cotação em 0,00/g quando há falha transitória.
// IMPACTO: sem isso, a cotação pode ficar desatualizada/zerada até novo deploy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ComprarMetalPage() {
  let cotacaoOuro = 0;
  let configs = {
    compra_metal_min_pct: 80,
    compra_metal_max_pct: 85,
    compra_metal_comm_pct: 50,
    receb_metal_min_pct: 95,
    receb_metal_max_pct: 100,
    metal_home_roles: [] as string[],
  };

  try {
    cotacaoOuro = await getCotacaoOuro();
  } catch (err) {
    // REGRA DE NEGÓCIO:
    // O QUE: registra falha exclusiva da leitura de cotação do ouro.
    // POR QUE: isola incidente de cotação sem bloquear carregamento de configurações.
    // IMPACTO: sem isolamento, uma falha de cotação derruba também as faixas de configuração.
    console.error("[METAL][comprar/page] Falha ao carregar cotação", err);
  }

  try {
    configs = await getModuloConfig();
  } catch (err) {
    // REGRA DE NEGÓCIO:
    // O QUE: registra falha exclusiva da leitura de configurações do módulo metal.
    // POR QUE: permite diagnóstico sem mascarar o tipo de erro no servidor.
    // IMPACTO: sem isso, o módulo opera com defaults sem rastreabilidade do motivo.
    console.error("[METAL][comprar/page] Falha ao carregar configuração", err);
  }

  return (
    <div className="max-w-2xl mx-auto p-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Breadcrumb */}
      <div className="text-xs text-[#1A3C34]/50 font-bold uppercase tracking-wide mb-4">
        <a href="/metal" className="hover:text-[#1A3C34]">Metal</a>
        <span className="mx-1">›</span>
        <span className="text-[#1A3C34]/60">Nova Compra</span>
      </div>

      {/* REGRA DE NEGÓCIO: se a cotação falhou, mostra banner de alerta antes do form.
          Sem isso o usuário via R$ 0.00/g e podia registrar transação incorreta. */}
      {cotacaoOuro <= 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>Cotacão do ouro indisponível no momento. Os valores podem estar incorretos.</span>
        </div>
      )}

      <h1 className="text-xl font-bold text-[#1A3C34] mb-6">Nova Compra de Metal</h1>

      <CompraForm cotacaoOuro={cotacaoOuro} configs={configs} />
    </div>
  );
}
