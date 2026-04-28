"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiFetch";
import { useGlobalError } from "@/stores/errorStore";
import {
  X, Search, Loader2, Hammer, CheckSquare, Square,
  ShoppingBag, Package, ChevronRight, Calendar, Camera, Trash2,
} from "lucide-react";
import FichaTecnicaForm, {
  type FichaTecnicaDados, type TipoItem, TIPOS_ITEM, validarFichaTecnica,
} from "./FichaTecnicaForm";
import { maskCpfCnpj } from "@/lib/formatters";
import { useDebounce } from "./_shared/useDebounce";
import { fmtData, fmtBRL } from "./_shared/formatters";
import { SITUACAO_LABEL } from "./_shared/constants";
import type { Cliente, Venda, ItemVenda } from "./_shared/types";
import { compressImage } from "./_shared/compressImage";
import { Steps } from "./_shared/Steps";

// ─── Cores ──────────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg:          "#FAFAF7",
  marrom:      "#92400E",
};

// ─── Types ──────────────────────────────────────────────────────────────────
export interface NovaOrdemFabricacaoModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
}

const PRIORIDADES = ["Design da peça", "Peso do metal negociado"];
const ROTAS = [
  { value: "pcp",       label: "PCP" },
  { value: "protocolo", label: "Protocolo" },
];

// ─── Steps ──────────────────────────────────────────────────────────────────
// ─── Main Modal ─────────────────────────────────────────────────────────────
export default function NovaOrdemFabricacaoModal({
  isOpen, onClose, onSuccess, userId, userName,
}: NovaOrdemFabricacaoModalProps) {
  const { pushError } = useGlobalError();
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);

  // Step 0: Cliente
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [clienteBuscando, setClienteBuscando] = useState(false);
  const [clienteDropOpen, setClienteDropOpen] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const clienteDebounced = useDebounce(clienteBusca, 300);

  // Step 1: Vendas
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);
  const [numeroPedidoManual, setNumeroPedidoManual] = useState("");

  // Step 2: Itens
  const [itensVenda, setItensVenda] = useState<ItemVenda[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([]);

  // Step 3: Dados da Ordem
  const [dataEntrega, setDataEntrega] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [rota, setRota] = useState("pcp");
  const [pesoNegociado, setPesoNegociado] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Step 4: Ficha Técnica
  const [fichaDados, setFichaDados] = useState<FichaTecnicaDados>({ tipo_item: "" as TipoItem });

  // Step 5: Revisão
  const [proximoNumero, setProximoNumero] = useState<string | null>(null);
  const [loadingNumero, setLoadingNumero] = useState(false);

  // Submit
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ── Reset ao fechar ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setStep(0); setClienteBusca(""); setClienteResultados([]); setClienteSelecionado(null);
      setVendas([]); setVendaSelecionada(null); setNumeroPedidoManual(""); setItensVenda([]); setItensSelecionados([]);
      setDataEntrega(""); setPrioridade(""); setRota("pcp"); setPesoNegociado("");
      setFotos([]); setFotoPreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
      setFichaDados({ tipo_item: "" as TipoItem });
      setProximoNumero(null); setSalvando(false); setErro(null); setClienteDropOpen(false);
    }
  }, [isOpen]);

  // ── Default data entrega +10 dias úteis ao entrar no step 3 ───────────────
  useEffect(() => {
    if (step === 3 && !dataEntrega) {
      // Calcula +10 dias úteis client-side (aproximação)
      const d = new Date();
      let added = 0;
      while (added < 10) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) added++;
      }
      setDataEntrega(d.toISOString().split("T")[0]);
    }
  }, [step, dataEntrega]);

  // ── Buscar clientes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 0 || clienteDebounced.length < 2) { setClienteResultados([]); return; }
    let cancel = false;
    setClienteBuscando(true);
    fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(clienteDebounced)}`)
      .then(r => r.json())
      .then(d => { if (!cancel) { setClienteResultados(Array.isArray(d) ? d : []); setClienteDropOpen(true); } })
      .catch(() => {})
      .finally(() => { if (!cancel) setClienteBuscando(false); });
    return () => { cancel = true; };
  }, [clienteDebounced, step]);

  useEffect(() => {
    if (clienteDropOpen && clienteInputRef.current) {
      const r = clienteInputRef.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [clienteDropOpen, clienteResultados]);

  function selecionarCliente(c: Cliente) {
    setClienteSelecionado(c); setClienteBusca(c.nome); setClienteDropOpen(false);
    setVendaSelecionada(null); setItensVenda([]); setItensSelecionados([]);
  }

  // ── Carregar vendas ───────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 1 || !clienteSelecionado) return;
    setLoadingVendas(true);
    fetch(`/api/vendas/por-cliente/${clienteSelecionado.id}`)
      .then(r => r.json())
      .then(d => setVendas(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingVendas(false));
  }, [step, clienteSelecionado]);

  // ── Carregar itens ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 2 || !vendaSelecionada) return;
    setLoadingItens(true);
    fetch(`/api/vendas/${vendaSelecionada.id}/itens`)
      .then(r => r.json())
      .then(d => setItensVenda(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoadingItens(false));
  }, [step, vendaSelecionada]);

  function toggleItem(id: number) {
    setItensSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  // ── Ir para revisão (step 5) ─────────────────────────────────────────────
  async function irParaRevisao() {
    const fichaErro = validarFichaTecnica(fichaDados);
    if (fichaErro) { setErro(fichaErro); return; }
    setErro(null); setLoadingNumero(true);
    try {
      const r = await fetch("/api/ordens/proximo-numero");
      if (r.ok) { const d = await r.json() as { numero: string }; setProximoNumero(d.numero); }
    } catch {}
    finally { setLoadingNumero(false); }
    setStep(5);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!clienteSelecionado) { setErro("Selecione um cliente."); return; }
    if (!vendaSelecionada && !numeroPedidoManual.trim()) { setErro("Selecione uma venda ou informe o número do pedido."); return; }
    if (vendaSelecionada && itensSelecionados.length === 0) { setErro("Selecione pelo menos um item."); return; }
    if (!prioridade) { setErro("Selecione a prioridade."); return; }
    const peso = parseFloat(pesoNegociado.replace(",", "."));
    if (isNaN(peso) || peso <= 0) { setErro("Informe o peso do metal negociado."); return; }

    setSalvando(true); setErro(null);
    try {
      // Comprimir fotos (se houver)
      const fotosBase64: string[] = [];
      for (const f of fotos) {
        const b64 = await compressImage(f);
        if (b64) fotosBase64.push(b64);
      }

      const itensSelecionadosData = itensVenda.filter(i => itensSelecionados.includes(i.id));
      const body = {
        tipo_ordem:          "fabricacao",
        cliente_id:          clienteSelecionado.id,
        data_entrega:        dataEntrega || undefined,
        peso_metal_negociado: peso,
        rota_override:       rota,
        detalhes_ordem:      `Prioridade: ${prioridade}`,
        venda_id:             vendaSelecionada?.id,
        venda_item_ids:       vendaSelecionada ? itensSelecionados : undefined,
        numero_pedido_manual: vendaSelecionada ? undefined : (numeroPedidoManual.trim() || undefined),
        ficha_tecnica_dados: fichaDados,
        fotos_base64:        fotosBase64.length > 0 ? fotosBase64 : undefined,
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
      const msg = e instanceof Error ? e.message : "Erro inesperado ao criar ordem de fabricação";
      setErro(msg);
      pushError("Falha ao criar Ordem de Fabricação", msg);
    } finally {
      setSalvando(false);
    }
  }, [clienteSelecionado, vendaSelecionada, numeroPedidoManual, itensSelecionados, itensVenda, prioridade, pesoNegociado, dataEntrega, rota, fichaDados, fotos, onSuccess, onClose, pushError]);

  if (!isOpen) return null;

  const tipoItemLabel = TIPOS_ITEM.find(t => t.value === fichaDados.tipo_item)?.label ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "90dvh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div className="flex items-center gap-2">
            <Hammer size={17} style={{ color: C.marrom }} />
            <h2 className="font-bold text-base" style={{ color: C.esmeralda }}>Nova Ordem de Fabricação</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={17} className="text-gray-400" /></button>
        </div>

        {/* Steps */}
        <div className="px-5 pt-4"><Steps steps={["Cliente", "Venda", "Itens", "Dados", "Ficha", "Revisão"]} current={step} /></div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ maxHeight: "60dvh" }}>
          {erro && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>{erro}</div>
          )}

          {/* ─── STEP 0: CLIENTE ─────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Busque e selecione o cliente:</p>
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
              {clienteSelecionado && (
                <div className="rounded-xl p-3 border" style={{ borderColor: C.esmeralda, background: "#F0FDF4" }}>
                  <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>{clienteSelecionado.nome}</p>
                  {clienteSelecionado.cpf_cnpj && <p className="text-xs text-gray-400 mt-0.5 font-mono">{maskCpfCnpj(clienteSelecionado.cpf_cnpj)}</p>}
                </div>
              )}
              {clienteDropOpen && clienteResultados.length > 0 && dropRect && typeof document !== "undefined" &&
                createPortal(
                  <div className="bg-white border rounded-xl shadow-xl overflow-y-auto z-[9999]" style={{ position: "fixed", top: dropRect.top, left: dropRect.left, width: dropRect.width, maxHeight: 200, borderColor: C.cremeBorder }}>
                    {clienteResultados.map(c => (
                      <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm" style={{ borderColor: C.cremeBorder }} onMouseDown={e => { e.preventDefault(); selecionarCliente(c); }}>
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
                <div className="space-y-3 py-4">
                  <p className="text-center text-sm text-gray-400">Nenhuma venda encontrada.</p>
                  <div className="pt-1">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Número do pedido (manual)</label>
                    <input
                      type="text"
                      className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                      style={{ borderColor: C.cremeBorder }}
                      placeholder="Ex: 14946"
                      value={numeroPedidoManual}
                      onChange={e => setNumeroPedidoManual(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Use quando o pedido não está cadastrado no sistema.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {vendas.map(v => {
                    const sel = vendaSelecionada?.id === v.id;
                    return (
                      <button key={v.id} className="w-full text-left rounded-xl p-3 border transition-colors" style={{ borderColor: sel ? C.esmeralda : C.cremeBorder, background: sel ? "#F0FDF4" : "#fff" }} onClick={() => { setVendaSelecionada(v); setItensSelecionados([]); }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShoppingBag size={14} style={{ color: sel ? C.esmeralda : "#9CA3AF" }} />
                            <span className="text-sm font-semibold" style={{ color: C.esmeralda }}>Pedido #{v.numero_venda}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#6B7280" }}>{SITUACAO_LABEL[v.situacao] ?? v.situacao}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          <span>{fmtData(v.data_venda)}</span><span>{fmtBRL(v.total_venda)}</span><span>{v.qtd_itens} ite{v.qtd_itens === 1 ? "m" : "ns"}</span>
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
              <p className="text-sm text-gray-500">Selecione os itens do pedido <strong>#{vendaSelecionada?.numero_venda}</strong>:</p>
              {loadingItens ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: C.esmeralda }} /></div>
              ) : itensVenda.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Nenhum item encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {itensVenda.map(item => {
                    const sel = itensSelecionados.includes(item.id);
                    return (
                      <button key={item.id} className="w-full text-left rounded-xl p-3 border transition-colors" style={{ borderColor: sel ? C.esmeralda : C.cremeBorder, background: sel ? "#F0FDF4" : "#fff" }} onClick={() => toggleItem(item.id)}>
                        <div className="flex items-center gap-2">
                          <span style={{ color: sel ? C.esmeralda : "#D1D5DB" }}>{sel ? <CheckSquare size={16} /> : <Square size={16} />}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Package size={12} className="text-gray-400 shrink-0" />
                              <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>{item.nome_produto}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                              {item.sku && <span>SKU: {item.sku}</span>}<span>Qtd: {item.quantidade}</span><span>{fmtBRL(item.total_item)}</span>
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

          {/* ─── STEP 3: DADOS DA ORDEM ──────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  <Calendar size={12} className="inline mr-1" />Data de Entrega *
                </label>
                <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm outline-none" style={{ borderColor: C.cremeBorder }} value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
                <p className="text-[10px] text-gray-400 mt-1">Padrão: +10 dias úteis. Pode alterar.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Prioridade na Fabricação *</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }} value={prioridade} onChange={e => setPrioridade(e.target.value)}>
                  <option value="">Selecione a prioridade</option>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Rota *</label>
                <select className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }} value={rota} onChange={e => setRota(e.target.value)}>
                  {ROTAS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">PCP (produção) ou Protocolo (logística)</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Peso do Metal Negociado (g) *</label>
                <input type="text" inputMode="decimal" className="w-full border rounded-xl px-3 py-2 text-sm outline-none" style={{ borderColor: C.cremeBorder }} placeholder="Ex: 5.5" value={pesoNegociado} onChange={e => setPesoNegociado(e.target.value)} />
              </div>

              {/* Fotos de referência */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  <Camera size={12} className="inline mr-1" />Fotos de Referência (opcional)
                </label>
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    const total = fotos.length + files.length;
                    if (total > 10) { setErro("Máximo 10 fotos por ordem."); e.target.value = ""; return; }
                    const newPreviews = files.map(f => URL.createObjectURL(f));
                    setFotos(prev => [...prev, ...files]);
                    setFotoPreviews(prev => [...prev, ...newPreviews]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="w-full border-2 border-dashed rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors hover:bg-gray-50"
                  style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                  onClick={() => fotoInputRef.current?.click()}
                >
                  <Camera size={16} />
                  {fotos.length === 0 ? "Adicionar fotos" : `${fotos.length}/10 foto${fotos.length > 1 ? "s" : ""}`}
                </button>
                {fotoPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {fotoPreviews.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} alt={`Foto ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border" style={{ borderColor: C.cremeBorder }} />
                        <button
                          type="button"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            URL.revokeObjectURL(fotoPreviews[i]);
                            setFotos(prev => prev.filter((_, j) => j !== i));
                            setFotoPreviews(prev => prev.filter((_, j) => j !== i));
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">Até 10 fotos. JPG, PNG, WebP ou HEIC.</p>
              </div>
            </div>
          )}

          {/* ─── STEP 4: FICHA TÉCNICA ───────────────────────────────── */}
          {step === 4 && (
            <div>
              <p className="text-sm text-gray-500 mb-3">Preencha os dados técnicos do produto:</p>
              <FichaTecnicaForm dados={fichaDados} onChange={setFichaDados} />
            </div>
          )}

          {/* ─── STEP 5: REVISÃO ─────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 text-center" style={{ background: C.esmeralda }}>
                {loadingNumero ? (
                  <Loader2 size={18} className="animate-spin mx-auto" style={{ color: C.creme }} />
                ) : (
                  <>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#A7C4BB" }}>Número da Ordem</p>
                    <p className="text-3xl font-bold tracking-wide" style={{ color: C.creme }}>{proximoNumero ?? "C-????"}</p>
                    <p className="text-xs mt-1" style={{ color: "#A7C4BB" }}>Fabricação</p>
                  </>
                )}
              </div>

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
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>#{vendaSelecionada?.numero_venda ?? numeroPedidoManual}</span>
                </div>
                <div className="px-4 py-2.5">
                  <p className="text-xs text-gray-400 mb-1.5">Itens</p>
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
                  <span className="text-xs text-gray-400">Data Entrega</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{dataEntrega ? new Date(dataEntrega + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Prioridade</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{prioridade}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Rota</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{rota === "pcp" ? "PCP" : "Protocolo"}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Peso Negociado</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{pesoNegociado}g</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Ficha Técnica</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{tipoItemLabel}</span>
                </div>
                {fotos.length > 0 && (
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-gray-400 mb-1.5">Fotos ({fotos.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fotoPreviews.map((src, i) => (
                        <img key={i} src={src} alt={`Foto ${i + 1}`} className="w-12 h-12 object-cover rounded-lg border" style={{ borderColor: C.cremeBorder }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
          {step > 0 && (
            <button className="px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }} onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2 | 3 | 4 | 5)}>
              Voltar
            </button>
          )}

          {step === 0 && (
            <button className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: clienteSelecionado ? C.esmeralda : "#9CA3AF", color: C.creme }} disabled={!clienteSelecionado} onClick={() => { setErro(null); setStep(1); }}>
              Continuar
            </button>
          )}

          {step === 1 && (
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: (vendaSelecionada || numeroPedidoManual.trim()) ? C.esmeralda : "#9CA3AF", color: C.creme }}
              disabled={!vendaSelecionada && !numeroPedidoManual.trim()}
              onClick={() => { setErro(null); setStep(vendaSelecionada ? 2 : 3); }}
            >
              Continuar
            </button>
          )}

          {step === 2 && (
            <button className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: itensSelecionados.length > 0 ? C.esmeralda : "#9CA3AF", color: C.creme }} disabled={itensSelecionados.length === 0} onClick={() => { setErro(null); setStep(3); }}>
              Continuar
            </button>
          )}

          {step === 3 && (
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: (prioridade && pesoNegociado) ? C.esmeralda : "#9CA3AF", color: C.creme }}
              disabled={!prioridade || !pesoNegociado}
              onClick={() => {
                if (!dataEntrega) { setErro("Informe a data de entrega."); return; }
                if (!prioridade) { setErro("Selecione a prioridade."); return; }
                const p = parseFloat(pesoNegociado.replace(",", "."));
                if (isNaN(p) || p <= 0) { setErro("Informe o peso do metal negociado."); return; }
                setErro(null); setStep(4);
              }}
            >
              Continuar
            </button>
          )}

          {step === 4 && (
            <button className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2" style={{ background: fichaDados.tipo_item ? C.esmeralda : "#9CA3AF", color: C.creme }} disabled={!fichaDados.tipo_item} onClick={irParaRevisao}>
              <ChevronRight size={14} />Revisar Ordem
            </button>
          )}

          {step === 5 && (
            <button className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2" style={{ background: C.marrom, color: "#fff", opacity: salvando ? 0.7 : 1 }} onClick={handleSubmit} disabled={salvando}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />}
              {salvando ? "Criando…" : "Confirmar e Criar Ordem"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
