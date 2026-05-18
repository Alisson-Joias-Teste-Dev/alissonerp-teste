"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2, RefreshCw, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

const C = {
  esmeralda:   "#184036",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Solicitacao {
  id: number;
  tipo: "pagamento_status" | "venda_campo";
  venda_id: number;
  pagamento_id: number | null;
  campo: string | null;
  valor_atual: unknown;
  valor_solicitado: unknown;
  motivo: string;
  solicitado_por_id: string;
  solicitado_por_nome: string;
  status: "pendente" | "aprovado" | "rejeitado";
  decidido_por_nome: string | null;
  motivo_decisao: string | null;
  decidido_em: string | null;
  created_at: string;
  numero_venda: string | null;
  pagamento_forma: string | null;
  pagamento_valor: number | null;
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

function renderValor(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "sim" : "não";
  return JSON.stringify(v);
}

function descreverAlvo(r: Solicitacao): string {
  if (r.tipo === "pagamento_status") {
    const forma = r.pagamento_forma ?? "Pagamento";
    const valor = r.pagamento_valor != null ? ` ${fmt(r.pagamento_valor)}` : "";
    return `Status do pagamento (${forma}${valor})`;
  }
  return `Campo "${r.campo ?? "?"}"`;
}

export default function SolicitacoesAlteracaoClient() {
  const [tab, setTab] = useState<"pendente" | "aprovado" | "rejeitado">("pendente");
  const [acting, setActing] = useState<number | null>(null);
  const [rejeitandoId, setRejeitandoId] = useState<number | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [err, setErr] = useState("");
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ["solicitacoes-alteracao", tab],
    queryFn: async () => {
      const res = await fetch(`/api/vendas/solicitacoes-alteracao?status=${tab}`);
      if (!res.ok) return [] as Solicitacao[];
      return res.json() as Promise<Solicitacao[]>;
    },
    refetchInterval: tab === "pendente" ? 10_000 : false,
    staleTime: 5_000,
  });

  async function handleAprovar(id: number) {
    setActing(id);
    setErr("");
    try {
      const res = await fetch(`/api/vendas/solicitacoes-alteracao/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao: "aprovado" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Erro ao aprovar");
      } else {
        queryClient.invalidateQueries({ queryKey: ["solicitacoes-alteracao"] });
      }
    } catch {
      setErr("Erro de conexão");
    } finally {
      setActing(null);
    }
  }

  async function handleRejeitar(id: number) {
    if (!motivoRejeicao.trim()) {
      setErr("Informe o motivo da rejeição.");
      return;
    }
    setActing(id);
    setErr("");
    try {
      const res = await fetch(`/api/vendas/solicitacoes-alteracao/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao: "rejeitado", motivo: motivoRejeicao }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Erro ao rejeitar");
      } else {
        setRejeitandoId(null);
        setMotivoRejeicao("");
        queryClient.invalidateQueries({ queryKey: ["solicitacoes-alteracao"] });
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
            Solicitações de Alteração
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Pedidos de alteração em vendas e pagamentos enviados pela equipe
          </p>
        </div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ["solicitacoes-alteracao"] })} disabled={loading}
          className="ml-auto text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit"
        style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
        {(["pendente", "aprovado", "rejeitado"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setRejeitandoId(null); setErr(""); }} style={tabStyle(t)}>
            {t === "pendente" ? "Pendentes" : t === "aprovado" ? "Aprovadas" : "Rejeitadas"}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{err}</div>
      )}

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
                      {descreverAlvo(r)}
                    </span>
                    <Link href={`/vendas/${r.venda_id}`}
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium hover:underline"
                      style={{ backgroundColor: "#EFF6FF", color: "#1D4ED8" }}>
                      Venda {r.numero_venda ?? `#${r.venda_id}`}
                    </Link>
                  </div>
                  <div className="text-xs text-gray-500 mb-1.5">
                    <span className="text-gray-400">De:</span>{" "}
                    <strong className="text-gray-700">{renderValor(r.valor_atual)}</strong>
                    <span className="text-gray-400 mx-1.5">→</span>
                    <span className="text-gray-400">Para:</span>{" "}
                    <strong style={{ color: "#184036" }}>{renderValor(r.valor_solicitado)}</strong>
                  </div>
                  <div className="text-xs text-gray-600 mb-1.5">
                    <span className="text-gray-400">Motivo:</span> {r.motivo}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
                    <Clock size={11} />
                    <span>{timeAgo(r.created_at)}</span>
                    <span>·</span>
                    <span>Por: {r.solicitado_por_nome || "—"}</span>
                    {r.decidido_por_nome && (
                      <>
                        <span>·</span>
                        <span>Resp: {r.decidido_por_nome}</span>
                      </>
                    )}
                  </div>
                  {r.motivo_decisao && tab !== "pendente" && (
                    <div className="text-xs text-gray-500 mt-1.5">
                      <span className="text-gray-400">Resposta:</span> {r.motivo_decisao}
                    </div>
                  )}
                </div>

                {tab === "pendente" && rejeitandoId !== r.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setRejeitandoId(r.id); setMotivoRejeicao(""); setErr(""); }}
                      disabled={acting === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                      <XCircle size={13} />
                      Rejeitar
                    </button>
                    <button
                      onClick={() => handleAprovar(r.id)}
                      disabled={acting === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" }}>
                      {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />}
                      Aprovar
                    </button>
                  </div>
                )}

                {tab !== "pendente" && (
                  <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: tab === "aprovado" ? "#F0FDF4" : "#FEF2F2",
                      color: tab === "aprovado" ? "#16A34A" : "#DC2626",
                    }}>
                    {tab === "aprovado" ? "Aprovada" : "Rejeitada"}
                  </span>
                )}
              </div>

              {tab === "pendente" && rejeitandoId === r.id && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                  <label className="block text-xs text-gray-500 mb-1.5">Motivo da rejeição</label>
                  <textarea
                    value={motivoRejeicao}
                    onChange={(e) => setMotivoRejeicao(e.target.value)}
                    rows={2}
                    className="w-full text-sm rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
                    style={{ borderColor: C.cremeBorder }}
                    placeholder="Explique o motivo para a vendedora..."
                    autoFocus
                  />
                  <div className="flex items-center gap-2 mt-2 justify-end">
                    <button
                      onClick={() => { setRejeitandoId(null); setMotivoRejeicao(""); setErr(""); }}
                      disabled={acting === r.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-40">
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleRejeitar(r.id)}
                      disabled={acting === r.id || !motivoRejeicao.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                      {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={13} />}
                      Confirmar rejeição
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
