"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: /metal/historico/page.tsx — Histórico completo de metal
//
// REGRA DE NEGÓCIO: Histórico de todas as compras e recebimentos de metal.
// Filtros: Hoje, Ontem, 7 dias, 30 dias, Mês, Personalizado.
// Tabs separadas para Compras e Recebimentos.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { Search, Calendar } from "lucide-react";
import TabelaCompras from "@/components/metal/TabelaCompras";
import TabelaRecebimentos from "@/components/metal/TabelaRecebimentos";
import DrawerCompraDetalhe from "@/components/metal/DrawerCompraDetalhe";
import DrawerRecebimentoDetalhe from "@/components/metal/DrawerRecebimentoDetalhe";
import type { CompraRecord, RecebimentoRecord } from "@/lib/metal/types";

type TabType = "compras" | "recebimentos";
type FiltroPeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "custom";

export default function MetalHistoricoPage() {
  const [tab, setTab] = useState<TabType>("compras");
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("30d");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [compras, setCompras] = useState<CompraRecord[]>([]);
  const [recebimentos, setRecebimentos] = useState<RecebimentoRecord[]>([]);
  const [comprasTotal, setComprasTotal] = useState(0);
  const [recebimentosTotal, setRecebimentosTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [drawerCompraId, setDrawerCompraId] = useState<number | null>(null);
  const [drawerRecebimentoId, setDrawerRecebimentoId] = useState<number | null>(null);

  const calcularDatas = useCallback(() => {
    const hoje = new Date();
    const fim = hoje.toISOString().split("T")[0];

    switch (filtroPeriodo) {
      case "hoje":
        return { inicio: fim, fim };
      case "ontem": {
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        const d = ontem.toISOString().split("T")[0];
        return { inicio: d, fim: d };
      }
      case "7d": {
        const d7 = new Date(hoje);
        d7.setDate(d7.getDate() - 7);
        return { inicio: d7.toISOString().split("T")[0], fim };
      }
      case "30d": {
        const d30 = new Date(hoje);
        d30.setDate(d30.getDate() - 30);
        return { inicio: d30.toISOString().split("T")[0], fim };
      }
      case "mes": {
        const mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        return { inicio: mes.toISOString().split("T")[0], fim };
      }
      case "custom":
        return { inicio: dataInicio, fim: dataFim };
      default:
        return { inicio: "", fim: "" };
    }
  }, [filtroPeriodo, dataInicio, dataFim]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    const { inicio, fim } = calcularDatas();

    try {
      if (tab === "compras") {
        const params = new URLSearchParams();
        if (inicio) params.set("data_inicio", inicio);
        if (fim) params.set("data_fim", fim);
        params.set("limit", "50");

        const res = await fetch(`/api/metal/compras?${params}`);
        if (res.ok) {
          const data = await res.json();
          setCompras(data.data ?? []);
          setComprasTotal(data.total ?? data.data?.length ?? 0);
        } else {
          throw new Error(`Erro ${res.status} ao carregar compras`);
        }
      } else {
        const params = new URLSearchParams();
        if (inicio) params.set("data_inicio", inicio);
        if (fim) params.set("data_fim", fim);
        params.set("limit", "50");

        const res = await fetch(`/api/metal/recebimentos?${params}`);
        if (res.ok) {
          const data = await res.json();
          setRecebimentos(data.data ?? []);
          setRecebimentosTotal(data.total ?? data.data?.length ?? 0);
        } else {
          throw new Error(`Erro ${res.status} ao carregar recebimentos`);
        }
      }
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [tab, calcularDatas]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const periodos: { key: FiltroPeriodo; label: string }[] = [
    { key: "hoje", label: "Hoje" },
    { key: "ontem", label: "Ontem" },
    { key: "7d", label: "7 Dias" },
    { key: "30d", label: "30 Dias" },
    { key: "mes", label: "Mês" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1A3C34]">Histórico de Metal</h1>
        <p className="text-sm text-[#1A3C34]/60">
          Consulte todas as compras e recebimentos de metal
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#1A3C34]/10 p-1 rounded-xl mb-4 max-w-md">
        <button
          onClick={() => setTab("compras")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === "compras" ? "bg-[#1A3C34] text-[#C59B6D] shadow-md" : "text-[#1A3C34]/60 hover:text-[#1A3C34]"
          }`}
        >
          Compras {comprasTotal > 0 && `(${comprasTotal})`}
        </button>
        <button
          onClick={() => setTab("recebimentos")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            tab === "recebimentos" ? "bg-[#1A3C34] text-[#C59B6D] shadow-md" : "text-[#1A3C34]/60 hover:text-[#1A3C34]"
          }`}
        >
          Recebimentos {recebimentosTotal > 0 && `(${recebimentosTotal})`}
        </button>
      </div>

      {/* Filtros de Data */}
      <div className="flex flex-wrap gap-2 mb-4">
        {periodos.map((p) => (
          <button
            key={p.key}
            onClick={() => setFiltroPeriodo(p.key)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              filtroPeriodo === p.key
                ? "bg-[#1A3C34] text-[#C59B6D]"
                : "bg-white border border-[#1A3C34]/20 text-[#1A3C34]/60 hover:bg-[#F2E8D5]"
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* Filtro custom de data */}
        {filtroPeriodo === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <label className="flex items-center gap-1">
              <span className="text-[10px] text-[#1A3C34]/50 font-bold">De:</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="bg-white border border-[#C59B6D]/30 rounded-lg px-2 py-1 text-xs text-[#1A3C34] outline-none"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-[10px] text-[#1A3C34]/50 font-bold">Até:</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="bg-white border border-[#C59B6D]/30 rounded-lg px-2 py-1 text-xs text-[#1A3C34] outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/30 shadow-sm overflow-hidden p-4">
        {/* REGRA DE NEGÓCIO: banner de erro visível no topo da tabela quando
            a API falha. Antes ficava silencioso. */}
        {erro && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-center justify-between">
            <span>{erro}</span>
            <button onClick={carregar} className="text-xs font-bold underline ml-4 shrink-0">
              Tentar novamente
            </button>
          </div>
        )}
        {tab === "compras" ? (
          <TabelaCompras data={compras} loading={loading} error={erro ? "" : undefined} onRowClick={setDrawerCompraId} />
        ) : (
          <TabelaRecebimentos data={recebimentos} loading={loading} error={erro ? "" : undefined} onRowClick={setDrawerRecebimentoId} />
        )}
      </div>

      {/* Drawer de detalhe da compra */}
      <DrawerCompraDetalhe compraId={drawerCompraId} onClose={() => setDrawerCompraId(null)} onUpdated={carregar} />

      {/* Drawer de detalhe do recebimento */}
      <DrawerRecebimentoDetalhe recebimentoId={drawerRecebimentoId} onClose={() => setDrawerRecebimentoId(null)} onUpdated={carregar} />
    </div>
  );
}
