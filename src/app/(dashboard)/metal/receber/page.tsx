// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: /metal/receber/page.tsx — Novo Recebimento de Metal
//
// REGRA DE NEGÓCIO: Formulário para receber metal de cliente como parte
// de pagamento. Vincula a uma venda. Excedente → saldo do cliente.
// Metal entra IMEDIATAMENTE no cofre_ouro.
// ═══════════════════════════════════════════════════════════════════════════

import { getCotacaoOuro, getModuloConfig } from "@/lib/metal/config";
import RecebimentoForm from "@/components/metal/RecebimentoForm";

export default async function ReceberMetalPage() {
  let cotacaoOuro = 0;
  let configs = {
    compra_metal_min_pct: 80,
    compra_metal_max_pct: 85,
    compra_metal_comm_pct: 50,
    receb_metal_min_pct: 95,
    receb_metal_max_pct: 100,
  };

  try {
    cotacaoOuro = await getCotacaoOuro();
    configs = await getModuloConfig();
  } catch {
    // fallback silencioso
  }

  return (
    <div className="max-w-lg mx-auto p-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Breadcrumb */}
      <div className="text-[10px] text-[#1A3C34]/40 font-bold uppercase tracking-wide mb-4">
        <a href="/metal" className="hover:text-[#1A3C34]">Metal</a>
        <span className="mx-1">›</span>
        <span className="text-[#1A3C34]/60">Novo Recebimento</span>
      </div>

      <h1 className="text-xl font-bold text-[#1A3C34] mb-6">Novo Recebimento de Metal</h1>

      <RecebimentoForm cotacaoOuro={cotacaoOuro} configs={configs} />
    </div>
  );
}
