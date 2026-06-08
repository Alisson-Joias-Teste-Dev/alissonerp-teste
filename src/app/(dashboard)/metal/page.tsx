// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: /metal/page.tsx — Página principal do módulo Metal
//
// REGRA DE NEGÓCIO: Agora funciona como landing page única para operações
// de compra e recebimento. Server component que carrega cotação + configs
// e delega ao client component MetalPageClient a exibição com abas.
//
// IMPACTO SE ALTERADO: Usuário perde acesso rápido aos formulários de metal.
// ═══════════════════════════════════════════════════════════════════════════

import { getCotacaoOuro, getModuloConfig } from "@/lib/metal/config";
import MetalPageClient from "./MetalPageClient";
import { AlertTriangle } from "lucide-react";

// REGRA DE NEGÓCIO: força renderização dinâmica para evitar cotação congelada.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MetalPage() {
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
    console.error("[METAL][page] Falha ao carregar cotação", err);
  }

  try {
    configs = await getModuloConfig();
  } catch (err) {
    console.error("[METAL][page] Falha ao carregar configuração", err);
  }

  return (
    <>
      {/* REGRA DE NEGÓCIO: se a cotação falhou, mostra banner de alerta antes do form. */}
      {cotacaoOuro <= 0 && (
        <div className="max-w-5xl mx-auto px-6 pt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Cotacão do ouro indisponível no momento. Os valores podem estar incorretos.</span>
          </div>
        </div>
      )}
      <MetalPageClient cotacaoOuro={cotacaoOuro} configs={configs} />
    </>
  );
}
