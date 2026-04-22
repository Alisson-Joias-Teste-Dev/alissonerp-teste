"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Loader2, RefreshCw, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

const C = {
  esmeralda:   "#184036",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Solicitacao {
  id: number;
  venda_id: number | null;
  item_id: number | null;
  produto_nome: string;
  preco_lista: number;
  pct_desconto_solicitado: number;
  preco_solicitado: number;
  status: "pendente" | "aprovado" | "rejeitado";
  solicitado_por_nome: string;
  autorizado_por_nome: string | null;
  created_at: string;
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

export default function AutorizacoesClient() {
  const [tab, setTab] = useState<"pendente" | "aprovado" | "rejeitado">("pendente");
  const [rows, setRows] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendas/solicitacoes-desconto?status=${tab}`);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh a cada 10s quando na aba pendente
  useEffect(() => {
    if (tab !== "pendente") return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [tab, load]);

  async function handleAction(id: number, status: "aprovado" | "rejeitado") {
    setActing(id);
    setErr("");
    try {
      const res = await fetch(`/api/vendas/solicitacoes-desconto/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json();
        setErr(d.error ?? "Erro ao processar");
      } else {
        setRows(prev => prev.filter(r => r.id !== id));
      }
    } catch {
      setErr("Erro de conexão");
    } finally {
      setActing(null);
    }
  }

  const tabStyle = (t: string) => ({
    padding: "6px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: tab === t ? 600 : 400,
    cursor: "pointer",
    backgroundColor: tab === t ? C.esmeralda : "transparent",
    color: tab === t ? "#F3EADA" : "#6B7280",
    border: "none",
    transition: "all 0.15s",
  } as React.CSSProperties);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: C.esmeralda }}>
            Autorizações de Desconto
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Solicitações de desconto acima de 30% enviadas pela equipe de vendas
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="ml-auto text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit"
        style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
        {(["pendente", "aprovado", "rejeitado"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(t)}>
            {t === "pendente" ? "Pendentes" : t === "aprovado" ? "Aprovados" : "Rejeitados"}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{err}</div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {tab === "pendente" ? "Nenhuma solicitação pendente." : "Nenhum registro."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(r => (
            <div key={r.id} className="rounded-xl border p-4"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm truncate" style={{ color: "#1A1A1A" }}>
                      {r.produto_nome}
                    </span>
                    {r.venda_id && (
                      <Link href={`/vendas/${r.venda_id}`}
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium hover:underline"
                        style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8" }}>
                        Venda #{r.venda_id}
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span>Preço lista: <strong className="text-gray-700">{fmt(r.preco_lista)}</strong></span>
                    <span>Desconto solicitado: <strong style={{ color: "#D97706" }}>{r.pct_desconto_solicitado}%</strong></span>
                    <span>Preço negociado: <strong style={{ color: "#184036" }}>{fmt(r.preco_solicitado)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                    <Clock size={11} />
                    <span>{timeAgo(r.created_at)}</span>
                    <span>·</span>
                    <span>Por: {r.solicitado_por_nome || "—"}</span>
                    {r.autorizado_por_nome && (
                      <>
                        <span>·</span>
                        <span>Resp: {r.autorizado_por_nome}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ações (somente pendentes) */}
                {tab === "pendente" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleAction(r.id, "rejeitado")}
                      disabled={acting === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                      {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={13} />}
                      Rejeitar
                    </button>
                    <button
                      onClick={() => handleAction(r.id, "aprovado")}
                      disabled={acting === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}>
                      {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />}
                      Aprovar
                    </button>
                  </div>
                )}

                {/* Badge status (não-pendentes) */}
                {tab !== "pendente" && (
                  <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: tab === "aprovado" ? "#F0FDF4" : "#FEF2F2",
                      color: tab === "aprovado" ? "#16A34A" : "#DC2626",
                    }}>
                    {tab === "aprovado" ? "Aprovado" : "Rejeitado"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
