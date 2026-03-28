"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, ChevronDown,
  Wrench, Hammer, RotateCcw, Store, Package, Shield, Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import NovaOrdemReposicaoLojaModal from "@/components/ordens/NovaOrdemReposicaoLojaModal";

// servico_loja NÃO aparece — escondido do frontend
const TIPOS_ORDEM = [
  { value: "servico_venda",     label: "Serviço Venda",    Icon: Wrench,    color: "#1E40AF" },
  { value: "fabricacao",        label: "Fabricação",        Icon: Hammer,    color: "#92400E" },
  { value: "reposicao_venda",   label: "Reposição Venda",  Icon: RotateCcw, color: "#6B21A8" },
  { value: "reposicao_loja",    label: "Reposição Loja",   Icon: Store,     color: "#0369A1" },
  { value: "compra_fornecedor", label: "Compra",           Icon: Package,   color: "#065F46" },
  { value: "garantia",          label: "Garantia",          Icon: Shield,    color: "#991B1B" },
  { value: "servico_interno",   label: "Serviço Interno",  Icon: Settings,  color: "#166534" },
];

export default function NovaOrdemButton({
  tiposPermitidos,
}: {
  tiposPermitidos: string[];
}) {
  const router = useRouter();
  const { nome } = useAuth();

  const [aberto, setAberto]                     = useState(false);
  const [toastMsg, setToastMsg]                 = useState<string | null>(null);
  const [reposicaoLojaOpen, setReposicaoLojaOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (tiposPermitidos.length === 0) return null;

  const tiposVisiveis = TIPOS_ORDEM.filter((t) => tiposPermitidos.includes(t.value));

  function handleTipo(value: string, label: string) {
    setAberto(false);
    if (value === "reposicao_loja") {
      setReposicaoLojaOpen(true);
      return;
    }
    // Placeholder para os demais tipos
    setToastMsg(`🚧 Em construção — ${label} estará disponível em breve!`);
    setTimeout(() => setToastMsg(null), 3000);
  }

  function handleReposicaoLojaSuccess(numeroOrdem: string) {
    setToastMsg(`✓ Ordem ${numeroOrdem} criada com sucesso!`);
    setTimeout(() => setToastMsg(null), 4000);
    router.refresh();
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#184036" }}
        >
          <Plus size={15} />
          Nova Ordem
          <ChevronDown
            size={13}
            className={`transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>

        {aberto && (
          <div
            className="absolute right-0 top-full mt-1.5 z-30 bg-white rounded-xl shadow-lg border overflow-hidden min-w-[190px]"
            style={{ borderColor: "#E8DCC8" }}
          >
            {tiposVisiveis.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTipo(t.value, t.label)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left border-b last:border-0"
                style={{ borderColor: "#F3EADA", color: "#1A1A1A" }}
              >
                <t.Icon size={14} style={{ color: t.color, flexShrink: 0 }} />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal Reposição Loja */}
      <NovaOrdemReposicaoLojaModal
        isOpen={reposicaoLojaOpen}
        onClose={() => setReposicaoLojaOpen(false)}
        onSuccess={handleReposicaoLojaSuccess}
        userName={nome ?? "Usuário"}
      />

      {/* Toast — "Em construção" ou "Ordem criada" */}
      {toastMsg && (
        <div
          className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: "#184036" }}
        >
          {toastMsg}
        </div>
      )}
    </>
  );
}
