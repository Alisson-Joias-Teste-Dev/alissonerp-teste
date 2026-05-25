// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: /metal/comprar/page.tsx — Nova Compra de Metal
//
// REGRA DE NEGÓCIO: Formulário para empresa comprar metal de fornecedor.
// A cotação é carregada do servidor (SSR) e passada ao componente cliente.
// Pagamento será gerado via MP após registro.
// ═══════════════════════════════════════════════════════════════════════════

import { getCotacaoOuro, getModuloConfig } from "@/lib/metal/config";
import CompraForm from "@/components/metal/CompraForm";

export default async function ComprarMetalPage() {
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
    // fallback silencioso — o formulário vai mostrar erro nos cálculos
  }

  return (
    <div className="max-w-lg mx-auto p-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Breadcrumb */}
      <div className="text-[10px] text-[#1A3C34]/40 font-bold uppercase tracking-wide mb-4">
        <a href="/metal" className="hover:text-[#1A3C34]">Metal</a>
        <span className="mx-1">›</span>
        <span className="text-[#1A3C34]/60">Nova Compra</span>
      </div>

      <h1 className="text-xl font-bold text-[#1A3C34] mb-6">Nova Compra de Metal</h1>

      <CompraForm cotacaoOuro={cotacaoOuro} configs={configs} />
    </div>
  );
}
