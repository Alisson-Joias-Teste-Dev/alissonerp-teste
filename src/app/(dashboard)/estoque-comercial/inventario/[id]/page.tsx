"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ClipboardList, Loader2, CheckCircle,
  XCircle, Save, AlertTriangle,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";

interface InventarioHeader {
  id: number;
  local_estoque_id: number;
  local_nome: string;
  status: string;
  obs: string | null;
  data_abertura: string;
  data_conclusao: string | null;
  criado_por_email: string | null;
  concluido_por_email: string | null;
}

interface ItemInventario {
  id: number;
  produto_id: number;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  diferenca: number;
  nome_produto: string;
  sku: string | null;
  contado_por_email: string | null;
  contado_em: string | null;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function InventarioDetalhePage() {
  const router = useRouter();
  const params = useParams();
  const invId = Number(params.id);

  const [inventario, setInventario] = useState<InventarioHeader | null>(null);
  const [itens,      setItens]      = useState<ItemInventario[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [contagens,  setContagens]  = useState<Record<number, string>>({});
  const [salvando,   setSalvando]   = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [msg,        setMsg]        = useState("");
  const [filtro,     setFiltro]     = useState<"todos" | "divergentes" | "pendentes">("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}`);
      if (r.ok) {
        const d = await r.json() as { inventario: InventarioHeader; itens: ItemInventario[] };
        setInventario(d.inventario);
        setItens(d.itens);
        // Preencher contagens com valores existentes
        const c: Record<number, string> = {};
        d.itens.forEach(item => {
          if (item.quantidade_contada !== null) {
            c[item.produto_id] = String(item.quantidade_contada);
          }
        });
        setContagens(c);
      }
    } finally { setLoading(false); }
  }, [invId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function salvarContagens() {
    const payload = Object.entries(contagens)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => ({
        produto_id: Number(k),
        quantidade_contada: Number(v),
      }));
    if (payload.length === 0) return;

    setSalvando(true); setMsg("");
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/contar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contagens: payload }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const data = await r.json() as { atualizados: number };
      setMsg(`${data.atualizados} item(ns) atualizado(s)`);
      await fetchData();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setSalvando(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function concluirInventario() {
    if (!confirm("Concluir inventario? Isso gerara ajustes automaticos para todas as divergencias.")) return;
    setConcluindo(true); setMsg("");
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/concluir`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const data = await r.json() as { ajustes_gerados: number };
      setMsg(`Inventario concluido! ${data.ajustes_gerados} ajuste(s) gerado(s).`);
      await fetchData();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally { setConcluindo(false); }
  }

  async function cancelarInventario() {
    if (!confirm("Cancelar inventario? Nenhum ajuste sera gerado.")) return;
    setCancelando(true);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/cancelar`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      await fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    } finally { setCancelando(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
      </div>
    );
  }

  if (!inventario) {
    return <div className="p-6 text-center text-gray-500">Inventario nao encontrado.</div>;
  }

  const isAberto = inventario.status === "aberto" || inventario.status === "em_contagem";
  const totalItens = itens.length;
  const contados = itens.filter(i => i.quantidade_contada !== null).length;
  const divergentes = itens.filter(i => i.quantidade_contada !== null && i.diferenca !== 0).length;
  const pendentes = itens.filter(i => i.quantidade_contada === null).length;

  const itensFiltrados = itens.filter(i => {
    if (filtro === "divergentes") return i.quantidade_contada !== null && i.diferenca !== 0;
    if (filtro === "pendentes") return i.quantidade_contada === null;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial/inventario")}
      >
        <ArrowLeft size={15} />
        Inventarios
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Inventario #{inventario.id}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {inventario.local_nome} - {fmtDate(inventario.data_abertura)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAberto && (
            <>
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-red-50"
                style={{ color: "#DC2626" }}
                onClick={cancelarInventario}
                disabled={cancelando}
              >
                {cancelando ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={15} />}
                Cancelar
              </button>
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "#059669", color: "#fff" }}
                onClick={concluirInventario}
                disabled={concluindo || pendentes > 0}
                title={pendentes > 0 ? `${pendentes} itens pendentes` : ""}
              >
                {concluindo ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={15} />}
                Concluir
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-3" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
          <p className="text-xs text-gray-500">Total itens</p>
          <p className="text-xl font-bold" style={{ color: "#184036" }}>{totalItens}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
          <p className="text-xs text-gray-500">Contados</p>
          <p className="text-xl font-bold" style={{ color: "#059669" }}>{contados}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
          <p className="text-xs text-gray-500">Pendentes</p>
          <p className="text-xl font-bold" style={{ color: "#D97706" }}>{pendentes}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
          <p className="text-xs text-gray-500">Divergencias</p>
          <p className="text-xl font-bold" style={{ color: divergentes > 0 ? "#DC2626" : "#059669" }}>
            {divergentes}
          </p>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "#D1FAE5", color: "#065F46" }}>
          {msg}
        </div>
      )}

      {/* Filtros + Salvar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {(["todos", "pendentes", "divergentes"] as const).map(f => (
            <button
              key={f}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: filtro === f ? "#184036" : "#F3F4F6",
                color: filtro === f ? "#F3EADA" : "#6B7280",
              }}
              onClick={() => setFiltro(f)}
            >
              {f === "todos" ? "Todos" : f === "pendentes" ? "Pendentes" : "Divergentes"}
            </button>
          ))}
        </div>
        {isAberto && (
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA" }}
            onClick={salvarContagens}
            disabled={salvando}
          >
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Salvar contagens
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E8DCC8" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "#F9F6F0" }}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase" style={{ color: "#9CA3AF" }}>Produto</th>
              <th className="text-center px-3 py-3 font-semibold text-xs uppercase" style={{ color: "#9CA3AF" }}>Sistema</th>
              <th className="text-center px-3 py-3 font-semibold text-xs uppercase" style={{ color: "#9CA3AF" }}>Contagem</th>
              <th className="text-center px-3 py-3 font-semibold text-xs uppercase" style={{ color: "#9CA3AF" }}>Diferenca</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.map((item, i) => {
              const diff = item.quantidade_contada !== null ? item.diferenca : null;
              return (
                <tr
                  key={item.id}
                  style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F6" }}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm" style={{ color: "#184036" }}>{item.nome_produto}</p>
                    {item.sku && <p className="text-xs text-gray-400">{item.sku}</p>}
                  </td>
                  <td className="px-3 py-3 text-center text-sm text-gray-600">
                    {item.quantidade_sistema}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {isAberto ? (
                      <input
                        type="number"
                        min={0}
                        className="w-20 border rounded-lg px-2 py-1.5 text-sm text-center outline-none"
                        style={{ borderColor: "#E8DCC8" }}
                        value={contagens[item.produto_id] ?? ""}
                        placeholder="-"
                        onChange={e => setContagens(prev => ({
                          ...prev,
                          [item.produto_id]: e.target.value,
                        }))}
                      />
                    ) : (
                      <span className="text-sm">{item.quantidade_contada ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {diff !== null ? (
                      <span
                        className="text-sm font-bold"
                        style={{ color: diff === 0 ? "#059669" : "#DC2626" }}
                      >
                        {diff > 0 ? "+" : ""}{diff}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
