"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Download, FileText, XCircle, RefreshCw } from "lucide-react";
import NotaFiscalStatusBadge from "./NotaFiscalStatusBadge";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA", cremeBg: "#FAFAF7" };

interface NotaDetalhe {
  id: number;
  modelo: "55" | "65";
  serie: number;
  numero: number | null;
  chave_44: string | null;
  status: string;
  ambiente: string | null;
  valor_produtos: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  valor_total: number;
  emitida_em: string | null;
  pdf_danfe_url: string | null;
  xml_protocolo: string | null;
  emitente_razao_social: string | null;
  sefaz_codigo: string | null;
  sefaz_motivo: string | null;
  itens?: NotaItem[];
}

interface NotaItem {
  id: number;
  descricao: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  ncm: string | null;
  cfop: string | null;
  csosn: string | null;
}

interface Props {
  notaId: number;
  onClose: () => void;
  onSuccess?: () => void;
}

function fmt(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function ModeloBadge({ modelo }: { modelo: "55" | "65" }) {
  return modelo === "65" ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">NFC-e 65</span>
  ) : (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">NF-e 55</span>
  );
}

export default function NotaFiscalDetalheModal({ notaId, onClose, onSuccess }: Props) {
  const [nota, setNota] = useState<NotaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acao, setAcao] = useState<"cancelar" | "cce" | null>(null);
  const [textoAcao, setTextoAcao] = useState("");
  const [loadingAcao, setLoadingAcao] = useState(false);
  const [erroAcao, setErroAcao] = useState("");
  const [msgSucesso, setMsgSucesso] = useState("");

  async function fetchNota() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fiscal/notas/${notaId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setNota(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar nota");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNota();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notaId]);

  async function handleAcao() {
    if (!nota) return;
    setLoadingAcao(true);
    setErroAcao("");
    try {
      const endpoint = acao === "cancelar"
        ? `/api/fiscal/notas/${nota.id}/cancelar`
        : `/api/fiscal/notas/${nota.id}/cce`;
      const body = acao === "cancelar"
        ? { justificativa: textoAcao }
        : { descricao_correcao: textoAcao };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao processar");
      setMsgSucesso(acao === "cancelar" ? "Nota cancelada com sucesso." : "CC-e registrada com sucesso.");
      setAcao(null);
      setTextoAcao("");
      await fetchNota();
      onSuccess?.();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoadingAcao(false);
    }
  }

  async function handleRetry() {
    if (!nota) return;
    setLoadingAcao(true);
    setErroAcao("");
    try {
      const res = await fetch(`/api/fiscal/notas/${nota.id}/retry`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao retentar");
      setMsgSucesso("Nota reenviada. Aguardando resposta da SEFAZ.");
      await fetchNota();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoadingAcao(false);
    }
  }

  function downloadXml() {
    if (!nota?.xml_protocolo) return;
    const blob = new Blob([nota.xml_protocolo], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfe_${nota.chave_44 ?? nota.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl border max-h-[90vh] flex flex-col"
        style={{ borderColor: C.cremeBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header
          className="px-5 py-4 flex items-center justify-between rounded-t-xl shrink-0"
          style={{ background: C.creme, borderBottom: `1px solid ${C.cremeBorder}` }}
        >
          <div className="flex items-center gap-2">
            <FileText size={17} style={{ color: C.esmeralda }} />
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              Detalhes da Nota Fiscal
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </header>

        {/* Corpo */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin" style={{ color: C.esmeralda }} />
            </div>
          )}

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm border border-red-200 bg-red-50 text-red-700">
              {error}
            </div>
          )}

          {nota && !loading && (
            <>
              {/* Cabeçalho da nota */}
              <div className="flex flex-wrap items-center gap-2">
                <ModeloBadge modelo={nota.modelo} />
                <span className="font-mono text-sm font-semibold" style={{ color: C.esmeralda }}>
                  {nota.numero ? `${nota.serie}-${String(nota.numero).padStart(6, "0")}` : "Sem número"}
                </span>
                <NotaFiscalStatusBadge status={nota.status} />
              </div>

              {/* Identificação */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                  Identificação
                </h3>
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
                >
                  {nota.chave_44 && (
                    <div>
                      <p className="text-xs mb-1" style={{ color: "#9CA3AF" }}>Chave de Acesso</p>
                      <p
                        className="font-mono text-[11px] break-all leading-relaxed"
                        style={{ color: "#374151" }}
                      >
                        {nota.chave_44.replace(/(\d{4})/g, "$1 ").trim()}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>Emitente</p>
                      <p className="font-medium" style={{ color: "#1A1A1A" }}>{nota.emitente_razao_social ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>Ambiente</p>
                      <p className="font-medium capitalize" style={{ color: "#1A1A1A" }}>{nota.ambiente ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>Emitida em</p>
                      <p className="font-medium" style={{ color: "#1A1A1A" }}>{fmtDate(nota.emitida_em)}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Valores */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                  Valores
                </h3>
                <div
                  className="rounded-xl border p-4 grid grid-cols-2 gap-3 text-sm"
                  style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
                >
                  <div>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>Produtos</p>
                    <p className="font-medium tabular-nums" style={{ color: "#374151" }}>{fmt(nota.valor_produtos)}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>Desconto</p>
                    <p className="font-medium tabular-nums" style={{ color: "#374151" }}>{fmt(nota.valor_desconto)}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>Frete</p>
                    <p className="font-medium tabular-nums" style={{ color: "#374151" }}>{fmt(nota.valor_frete)}</p>
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>Total</p>
                    <p className="text-base font-bold tabular-nums" style={{ color: C.esmeralda }}>{fmt(nota.valor_total)}</p>
                  </div>
                </div>
              </section>

              {/* Itens */}
              {nota.itens && nota.itens.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                    Itens
                  </h3>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead style={{ backgroundColor: C.cremeBg }}>
                          <tr>
                            {["Descrição", "Qtd", "Unit.", "Total", "NCM", "CFOP", "CSOSN"].map((h) => (
                              <th
                                key={h}
                                className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                                style={{ color: "#9CA3AF" }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {nota.itens.map((item, i) => (
                            <tr
                              key={item.id}
                              style={{ borderTop: i > 0 ? `1px solid ${C.cremeBorder}` : undefined }}
                            >
                              <td className="px-3 py-2 max-w-[160px] truncate" style={{ color: "#374151" }}>
                                {item.descricao ?? "—"}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-right" style={{ color: "#374151" }}>{item.quantidade}</td>
                              <td className="px-3 py-2 tabular-nums text-right" style={{ color: "#374151" }}>{fmt(item.valor_unitario)}</td>
                              <td className="px-3 py-2 tabular-nums text-right font-medium" style={{ color: C.esmeralda }}>{fmt(item.valor_total)}</td>
                              <td className="px-3 py-2" style={{ color: "#6B7280" }}>{item.ncm ?? "—"}</td>
                              <td className="px-3 py-2" style={{ color: "#6B7280" }}>{item.cfop ?? "—"}</td>
                              <td className="px-3 py-2" style={{ color: "#6B7280" }}>{item.csosn ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* Formulário inline de cancelamento */}
              {acao === "cancelar" && (
                <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm font-medium text-red-800 mb-2">Justificativa do cancelamento (mín. 15 caracteres)</p>
                  <textarea
                    value={textoAcao}
                    onChange={e => setTextoAcao(e.target.value)}
                    rows={3}
                    className="w-full text-sm border border-red-300 rounded p-2 resize-none"
                    placeholder="Informe o motivo do cancelamento..."
                  />
                  <p className="text-xs text-red-600 mt-1">{textoAcao.length}/15 mínimo</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleAcao} disabled={textoAcao.length < 15 || loadingAcao}
                      className="px-3 py-1.5 bg-red-600 text-white text-sm rounded disabled:opacity-50">
                      {loadingAcao ? <Loader2 size={14} className="animate-spin inline" /> : "Confirmar Cancelamento"}
                    </button>
                    <button onClick={() => { setAcao(null); setTextoAcao(""); setErroAcao(""); }}
                      className="px-3 py-1.5 text-sm text-stone-600 border rounded">
                      Voltar
                    </button>
                  </div>
                </div>
              )}

              {/* Formulário inline de CC-e */}
              {acao === "cce" && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800 mb-2">Descrição da correção (mín. 15 caracteres)</p>
                  <textarea
                    value={textoAcao}
                    onChange={e => setTextoAcao(e.target.value)}
                    rows={3}
                    className="w-full text-sm border border-blue-300 rounded p-2 resize-none"
                    placeholder="Descreva a correção..."
                  />
                  <p className="text-xs text-blue-600 mt-1">{textoAcao.length}/15 mínimo</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleAcao} disabled={textoAcao.length < 15 || loadingAcao}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
                      {loadingAcao ? <Loader2 size={14} className="animate-spin inline" /> : "Confirmar CC-e"}
                    </button>
                    <button onClick={() => { setAcao(null); setTextoAcao(""); setErroAcao(""); }}
                      className="px-3 py-1.5 text-sm text-stone-600 border rounded">
                      Voltar
                    </button>
                  </div>
                </div>
              )}

              {/* Mensagem SEFAZ */}
              {(nota.sefaz_codigo || nota.sefaz_motivo) && (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{ backgroundColor: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E" }}
                >
                  <p className="font-semibold text-xs mb-0.5">Mensagem SEFAZ</p>
                  <p>
                    {nota.sefaz_codigo && <span className="font-mono mr-2">[{nota.sefaz_codigo}]</span>}
                    {nota.sefaz_motivo}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé */}
        {nota && !loading && (
          <div
            className="px-5 py-3 flex flex-col gap-2 shrink-0 rounded-b-xl"
            style={{ borderTop: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
          >
            {msgSucesso && (
              <div className="mb-1 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                {msgSucesso}
              </div>
            )}
            {erroAcao && (
              <div className="mb-1 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {erroAcao}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
            {nota.status === "autorizada" && (
              <>
                <button
                  onClick={() => { setAcao("cancelar"); setMsgSucesso(""); setErroAcao(""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-red-50"
                  style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
                >
                  <XCircle size={13} />
                  Cancelar Nota
                </button>
                {nota.modelo === "55" && (
                  <button
                    onClick={() => { setAcao("cce"); setMsgSucesso(""); setErroAcao(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-blue-50"
                    style={{ borderColor: "#93C5FD", color: "#2563EB" }}
                  >
                    Corrigir (CC-e)
                  </button>
                )}
              </>
            )}
            {nota.status === "rejeitada" && (
              <button
                onClick={handleRetry}
                disabled={loadingAcao}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-stone-100 disabled:opacity-50"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                {loadingAcao ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Tentar Novamente
              </button>
            )}
            {nota.pdf_danfe_url && (
              <a
                href={nota.pdf_danfe_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-stone-100"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <Download size={13} />
                Baixar DANFE
              </a>
            )}
            {nota.xml_protocolo && (
              <button
                onClick={downloadXml}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-stone-100"
                style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
              >
                <Download size={13} />
                Baixar XML
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.esmeralda }}
            >
              Fechar
            </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
