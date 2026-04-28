"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiFetch";
import { useGlobalError } from "@/stores/errorStore";
import {
  X, Search, Loader2, RotateCcw, CheckSquare, Square,
  ShoppingBag, Package, ChevronRight,
} from "lucide-react";
import { maskCpfCnpj } from "@/lib/formatters";
import { useDebounce } from "./_shared/useDebounce";
import { fmtData, fmtBRL } from "./_shared/formatters";
import { SITUACAO_LABEL } from "./_shared/constants";
import type { Cliente, Venda, ItemVenda } from "./_shared/types";

// ─── Cores ──────────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg:          "#FAFAF7",
  roxo:        "#6B21A8",
};

// ─── Types ──────────────────────────────────────────────────────────────────
export interface NovaOrdemReposicaoVendaModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
}

// ─── Steps ──────────────────────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ["Cliente", "Venda", "Itens", "Revisão"];
  return (
    <div className="flex items-center gap-1 mb-5">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: i <= current ? C.esmeralda : "#E5E7EB", color: i <= current ? C.creme : "#9CA3AF" }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className="text-xs font-medium hidden sm:block" style={{ color: i <= current ? C.esmeralda : "#9CA3AF" }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-px mx-1" style={{ background: i < current ? C.esmeralda : "#E5E7EB" }} />}
        </div>
      ))}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────
export default function NovaOrdemReposicaoVendaModal({
  isOpen, onClose, onSuccess, userId, userName,
}: NovaOrdemReposicaoVendaModalProps) {
  const { pushError } = useGlobalError();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  // Step 0: Cliente
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [clienteBuscando, setClienteBuscando] = useState(false);
  const [clienteDropOpen, setClienteDropOpen] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const clienteRef = useRef<HTMLDivElement>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const clienteDebounced = useDebounce(clienteBusca, 300);

  // Step 1: Vendas
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);

  // Step 2: Itens
  const [itensVenda, setItensVenda] = useState<ItemVenda[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([]);

  // Step 3: Revisão
  const [proximoNumero, setProximoNumero] = useState<string | null>(null);
  const [loadingNumero, setLoadingNumero] = useState(false);

  // Submit
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ── Reset ao fechar ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setStep(0); setClienteBusca(""); setClienteResultados([]); setClienteSelecionado(null);
      setVendas([]); setVendaSelecionada(null); setItensVenda([]); setItensSelecionados([]);
      setProximoNumero(null); setSalvando(false); setErro(null); setClienteDropOpen(false);
    }
  }, [isOpen]);

  // ── Buscar clientes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 0 || clienteDebounced.length < 2) { setClienteResultados([]); return; }
    let cancel = false;
    setClienteBuscando(true);
    fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(clienteDebounced)}`)
      .then(r => r.json())
      .then(d => { if (!cancel) { setClienteResultados(Array.isArray(d) ? d : d.clientes ?? []); setClienteDropOpen(true); } })
      .catch(() => {})
      .finally(() => { if (!cancel) setClienteBuscando(false); });
    return () => { cancel = true; };
  }, [clienteDebounced, step]);

  // ── Posição dropdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (clienteDropOpen && clienteInputRef.current) {
      const r = clienteInputRef.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [clienteDropOpen, clienteResultados]);

  function selecionarCliente(c: Cliente) {
    setClienteSelecionado(c);
    setClienteBusca(c.nome);
    setClienteDropOpen(false);
    setVendaSelecionada(null);
    setItensVenda([]);
    setItensSelecionados([]);
  }

  // ── Carregar vendas do cliente ────────────────────────────────────────────
  useEffect(() => {
    if (step !== 1 || !clienteSelecionado) return;
    setLoadingVendas(true);
    fetch(`/api/vendas/por-cliente/${clienteSelecionado.id}`)
      .then(r => r.json())
      .then(d => setVendas(Array.isArray(d) ? d : d.vendas ?? []))
      .catch(() => {})
      .finally(() => setLoadingVendas(false));
  }, [step, clienteSelecionado]);

  // ── Carregar itens da venda ───────────────────────────────────────────────
  useEffect(() => {
    if (step !== 2 || !vendaSelecionada) return;
    setLoadingItens(true);
    fetch(`/api/vendas/${vendaSelecionada.id}/itens`)
      .then(r => r.json())
      .then(d => setItensVenda(Array.isArray(d) ? d : d.itens ?? []))
      .catch(() => {})
      .finally(() => setLoadingItens(false));
  }, [step, vendaSelecionada]);

  function toggleItem(id: number) {
    setItensSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  // ── Ir para revisão ──────────────────────────────────────────────────────
  async function irParaRevisao() {
    if (itensSelecionados.length === 0) { setErro("Selecione pelo menos um item."); return; }
    setErro(null);
    setLoadingNumero(true);
    try {
      const r = await fetch("/api/ordens/proximo-numero");
      if (r.ok) {
        const d = await r.json() as { numero: string };
        setProximoNumero(d.numero);
      }
    } catch { /* sem número */ }
    finally { setLoadingNumero(false); }
    setStep(3);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!clienteSelecionado) { setErro("Selecione um cliente."); return; }
    if (!vendaSelecionada) { setErro("Selecione uma venda."); return; }
    if (itensSelecionados.length === 0) { setErro("Selecione pelo menos um item."); return; }

    setSalvando(true); setErro(null);
    try {
      const itensSelecionadosData = itensVenda.filter(i => itensSelecionados.includes(i.id));
      const body = {
        tipo_ordem:     "reposicao_venda",
        cliente_id:     clienteSelecionado.id,
        venda_id:       vendaSelecionada.id,
        venda_item_ids: itensSelecionados,
        itens: itensSelecionadosData.map(i => ({
          produto_id:    i.produto_id,
          quantidade:    i.quantidade,
          peso_estimado: null,
        })),
      };

      const { numero_ordem } = await apiFetch<{ id: number; numero_ordem: string }>(
        "/api/ordens",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      onSuccess?.(numero_ordem);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro inesperado ao criar ordem de reposição";
      setErro(msg);
      pushError("Falha ao criar Ordem de Reposição Venda", msg);
    } finally {
      setSalvando(false);
    }
  }, [clienteSelecionado, vendaSelecionada, itensSelecionados, itensVenda, onSuccess, onClose, pushError]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "90dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div className="flex items-center gap-2">
            <RotateCcw size={17} style={{ color: C.roxo }} />
            <h2 className="font-bold text-base" style={{ color: C.esmeralda }}>Nova Reposição Venda</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={17} className="text-gray-400" />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 pt-4">
          <Steps current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ maxHeight: "60dvh" }}>
          {/* Erro */}
          {erro && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>
              {erro}
            </div>
          )}

          {/* ─── STEP 0: CLIENTE ─────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Busque e selecione o cliente:</p>
              <div ref={clienteRef} className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={clienteInputRef}
                    className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }}
                    placeholder="Nome, CPF ou telefone..."
                    value={clienteBusca}
                    onChange={e => { setClienteBusca(e.target.value); setClienteSelecionado(null); }}
                    onFocus={() => { if (clienteResultados.length > 0) setClienteDropOpen(true); }}
                    onBlur={() => setTimeout(() => setClienteDropOpen(false), 200)}
                  />
                  {clienteBuscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                </div>
              </div>

              {/* Cliente selecionado */}
              {clienteSelecionado && (
                <div className="rounded-xl p-3 border" style={{ borderColor: C.esmeralda, background: "#F0FDF4" }}>
                  <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>{clienteSelecionado.nome}</p>
                  {clienteSelecionado.cpf_cnpj && <p className="text-xs text-gray-400 mt-0.5 font-mono">{maskCpfCnpj(clienteSelecionado.cpf_cnpj)}</p>}
                </div>
              )}

              {/* Dropdown portal */}
              {clienteDropOpen && clienteResultados.length > 0 && dropRect && typeof document !== "undefined" &&
                createPortal(
                  <div
                    className="bg-white border rounded-xl shadow-xl overflow-y-auto z-[9999]"
                    style={{ position: "fixed", top: dropRect.top, left: dropRect.left, width: dropRect.width, maxHeight: 200, borderColor: C.cremeBorder }}
                  >
                    {clienteResultados.map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm"
                        style={{ borderColor: C.cremeBorder }}
                        onMouseDown={e => { e.preventDefault(); selecionarCliente(c); }}
                      >
                        <span className="font-medium">{c.nome}</span>
                        {c.cpf_cnpj && <span className="text-gray-400 ml-2 text-xs font-mono">{maskCpfCnpj(c.cpf_cnpj)}</span>}
                      </button>
                    ))}
                  </div>,
                  document.body,
                )
              }
            </div>
          )}

          {/* ─── STEP 1: VENDAS ──────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Vendas de <strong>{clienteSelecionado?.nome}</strong>:</p>
              {loadingVendas ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: C.esmeralda }} /></div>
              ) : vendas.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Nenhuma venda encontrada.</p>
              ) : (
                <div className="space-y-2">
                  {vendas.map(v => {
                    const sel = vendaSelecionada?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        className="w-full text-left rounded-xl p-3 border transition-colors"
                        style={{
                          borderColor: sel ? C.esmeralda : C.cremeBorder,
                          background: sel ? "#F0FDF4" : "#fff",
                        }}
                        onClick={() => { setVendaSelecionada(v); setItensSelecionados([]); }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShoppingBag size={14} style={{ color: sel ? C.esmeralda : "#9CA3AF" }} />
                            <span className="text-sm font-semibold" style={{ color: C.esmeralda }}>Pedido #{v.numero_venda}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#6B7280" }}>
                            {SITUACAO_LABEL[v.situacao] ?? v.situacao}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          <span>{fmtData(v.data_venda)}</span>
                          <span>{fmtBRL(v.total_venda)}</span>
                          <span>{v.qtd_itens} ite{v.qtd_itens === 1 ? "m" : "ns"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: ITENS ───────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Selecione os itens para reposição do pedido <strong>#{vendaSelecionada?.numero_venda}</strong>:
              </p>
              {loadingItens ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: C.esmeralda }} /></div>
              ) : itensVenda.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Nenhum item encontrado nesta venda.</p>
              ) : (
                <div className="space-y-2">
                  {itensVenda.map(item => {
                    const sel = itensSelecionados.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        className="w-full text-left rounded-xl p-3 border transition-colors"
                        style={{
                          borderColor: sel ? C.esmeralda : C.cremeBorder,
                          background: sel ? "#F0FDF4" : "#fff",
                        }}
                        onClick={() => toggleItem(item.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span style={{ color: sel ? C.esmeralda : "#D1D5DB" }}>
                            {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Package size={12} className="text-gray-400 shrink-0" />
                              <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>{item.nome_produto}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                              {item.sku && <span>SKU: {item.sku}</span>}
                              <span>Qtd: {item.quantidade}</span>
                              <span>{fmtBRL(item.total_item)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 3: REVISÃO ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Número da ordem */}
              <div className="rounded-2xl p-4 text-center" style={{ background: C.esmeralda }}>
                {loadingNumero ? (
                  <Loader2 size={18} className="animate-spin mx-auto" style={{ color: C.creme }} />
                ) : (
                  <>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#A7C4BB" }}>Número da Ordem</p>
                    <p className="text-3xl font-bold tracking-wide" style={{ color: C.creme }}>
                      {proximoNumero ?? "C-????"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#A7C4BB" }}>Reposição Venda</p>
                  </>
                )}
              </div>

              {/* Detalhes */}
              <div className="rounded-xl divide-y text-sm" style={{ border: `1px solid ${C.cremeBorder}` }}>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Consultor(a)</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{userName}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Cliente</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{clienteSelecionado?.nome}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Pedido</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>#{vendaSelecionada?.numero_venda}</span>
                </div>
                <div className="px-4 py-2.5">
                  <p className="text-xs text-gray-400 mb-1.5">Iten(s) para reposição</p>
                  <div className="space-y-1">
                    {itensVenda.filter(i => itensSelecionados.includes(i.id)).map(i => (
                      <div key={i.id} className="flex items-center justify-between">
                        <p className="text-xs font-medium" style={{ color: C.esmeralda }}>{i.nome_produto}</p>
                        <p className="text-xs text-gray-400">Qtd: {i.quantidade}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Rota</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>PCP</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
          {step > 0 && (
            <button
              className="px-4 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
              onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2 | 3)}
            >
              Voltar
            </button>
          )}

          {step === 0 && (
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: clienteSelecionado ? C.esmeralda : "#9CA3AF", color: C.creme, cursor: clienteSelecionado ? "pointer" : "not-allowed" }}
              disabled={!clienteSelecionado}
              onClick={() => { setErro(null); setStep(1); }}
            >
              Continuar
            </button>
          )}

          {step === 1 && (
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: vendaSelecionada ? C.esmeralda : "#9CA3AF", color: C.creme, cursor: vendaSelecionada ? "pointer" : "not-allowed" }}
              disabled={!vendaSelecionada}
              onClick={() => { setErro(null); setStep(2); }}
            >
              Continuar
            </button>
          )}

          {step === 2 && (
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: itensSelecionados.length > 0 ? C.esmeralda : "#9CA3AF", color: C.creme, cursor: itensSelecionados.length > 0 ? "pointer" : "not-allowed" }}
              disabled={itensSelecionados.length === 0}
              onClick={irParaRevisao}
            >
              <ChevronRight size={14} />
              Revisar Ordem
            </button>
          )}

          {step === 3 && (
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: C.roxo, color: "#fff", opacity: salvando ? 0.7 : 1 }}
              onClick={handleSubmit}
              disabled={salvando}
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {salvando ? "Criando…" : "Confirmar e Criar Ordem"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
