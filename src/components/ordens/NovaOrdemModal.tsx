"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Plus, Trash2, Camera, Video, Search, Loader2 } from "lucide-react";

// ─── Constantes ─────────────────────────────────────────────────────────────

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
};

const TIPO_LABELS: Record<string, string> = {
  servico_venda:     "Serviço Venda",
  servico_loja:      "Serviço Loja",
  fabricacao:        "Fabricação",
  reposicao_venda:   "Reposição Venda",
  reposicao_loja:    "Reposição Loja",
  compra_fornecedor: "Compra de Fornecedor",
  garantia:          "Garantia",
  servico_interno:   "Serviço Interno",
};

const SERVICO_TIPOS = ["servico_venda", "servico_loja"];
const CLIENTE_OBRIGATORIO = ["servico_venda", "fabricacao", "reposicao_venda", "garantia"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function compressImage(file: File, maxBytes = 2 * 1024 * 1024): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1920;
      let { width, height } = img;
      if (width > max || height > max) {
        if (width > height) { height = Math.round((height * max) / width); width = max; }
        else { width = Math.round((width * max) / height); height = max; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            if (blob.size <= maxBytes || quality <= 0.3) return resolve(blob);
            quality -= 0.1;
            tryCompress();
          },
          "image/jpeg",
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ItemOrdem {
  produto_id: number;
  produto_nome: string;
  produto_sku: string;
  quantidade: number;
}

interface Contato { id_contato: number; nome: string; telefone: string | null }
interface Vendedor { id_vendedor: number; nome: string }
interface Produto  { id_produto: number; nome: string; sku: string; peso_precificado: number | null }

interface Props {
  tiposPermitidos: string[];
  onClose: () => void;
  onSuccess: (numeroOrdem: string) => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function NovaOrdemModal({ tiposPermitidos, onClose, onSuccess }: Props) {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [tipoOrdem, setTipoOrdem] = useState(tiposPermitidos[0] ?? "");
  const [clienteId, setClienteId]   = useState<number | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [dataEntrega, setDataEntrega] = useState("");
  const [pesoMetal, setPesoMetal]   = useState("");
  const [pesoPeca, setPesoPeca]     = useState("");
  const [itens, setItens]           = useState<ItemOrdem[]>([]);

  // ── File state ───────────────────────────────────────────────────────────────
  const [fotoFile, setFotoFile]       = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [videoFile, setVideoFile]     = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const fotoInputRef  = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ── Autocomplete clientes ────────────────────────────────────────────────────
  const [clienteBusca, setClienteBusca]     = useState("");
  const [clienteResultados, setClienteResultados] = useState<Contato[]>([]);
  const [clienteLoading, setClienteLoading] = useState(false);
  const [showClienteDrop, setShowClienteDrop] = useState(false);
  const debouncedClienteBusca = useDebounce(clienteBusca, 300);
  const clienteRef = useRef<HTMLDivElement>(null);

  // ── Autocomplete produtos ────────────────────────────────────────────────────
  const [produtoBusca, setProdutoBusca]     = useState("");
  const [produtoResultados, setProdutoResultados] = useState<Produto[]>([]);
  const [produtoLoading, setProdutoLoading] = useState(false);
  const [showProdutoDrop, setShowProdutoDrop] = useState(false);
  const debouncedProdutoBusca = useDebounce(produtoBusca, 300);
  const produtoRef = useRef<HTMLDivElement>(null);

  // ── Vendedores ───────────────────────────────────────────────────────────────
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  // ── Submit state ─────────────────────────────────────────────────────────────
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // ── Computed ─────────────────────────────────────────────────────────────────
  const isServico = SERVICO_TIPOS.includes(tipoOrdem);
  const clienteObrigatorio = CLIENTE_OBRIGATORIO.includes(tipoOrdem);

  // ── Load vendedores on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/ordens/vendedores")
      .then(r => r.json())
      .then(setVendedores)
      .catch(() => {});
  }, []);

  // ── Search clientes ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedClienteBusca.length < 2) { setClienteResultados([]); return; }
    setClienteLoading(true);
    fetch(`/api/ordens/contatos?busca=${encodeURIComponent(debouncedClienteBusca)}`)
      .then(r => r.json())
      .then(data => { setClienteResultados(data); setShowClienteDrop(true); })
      .catch(() => {})
      .finally(() => setClienteLoading(false));
  }, [debouncedClienteBusca]);

  // ── Search produtos ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedProdutoBusca.length < 2) { setProdutoResultados([]); return; }
    setProdutoLoading(true);
    fetch(`/api/ordens/produtos-busca?busca=${encodeURIComponent(debouncedProdutoBusca)}`)
      .then(r => r.json())
      .then(data => { setProdutoResultados(data); setShowProdutoDrop(true); })
      .catch(() => {})
      .finally(() => setProdutoLoading(false));
  }, [debouncedProdutoBusca]);

  // ── Close dropdowns on outside click ────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setShowClienteDrop(false);
      }
      if (produtoRef.current && !produtoRef.current.contains(e.target as Node)) {
        setShowProdutoDrop(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Foto handler ─────────────────────────────────────────────────────────────
  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const url = URL.createObjectURL(file);
    setFotoPreview(url);
  }

  // ── Vídeo handler ────────────────────────────────────────────────────────────
  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
  }

  // ── Adicionar produto ────────────────────────────────────────────────────────
  function adicionarItem(produto: Produto) {
    const jaExiste = itens.find(i => i.produto_id === produto.id_produto);
    if (jaExiste) {
      setItens(prev => prev.map(i =>
        i.produto_id === produto.id_produto
          ? { ...i, quantidade: i.quantidade + 1 }
          : i
      ));
    } else {
      setItens(prev => [...prev, {
        produto_id:   produto.id_produto,
        produto_nome: produto.nome,
        produto_sku:  produto.sku,
        quantidade:   1,
      }]);
    }
    setProdutoBusca("");
    setShowProdutoDrop(false);
  }

  function removerItem(produtoId: number) {
    setItens(prev => prev.filter(i => i.produto_id !== produtoId));
  }

  function alterarQtd(produtoId: number, delta: number) {
    setItens(prev => prev.map(i => {
      if (i.produto_id !== produtoId) return i;
      return { ...i, quantidade: Math.max(1, i.quantidade + delta) };
    }));
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validações
    if (!tipoOrdem) { setError("Selecione o tipo de ordem."); return; }
    if (clienteObrigatorio && !clienteId) {
      setError("Cliente é obrigatório para este tipo de ordem."); return;
    }
    if (isServico && !fotoFile) {
      setError("Foto da peça é obrigatória para ordens de serviço."); return;
    }
    if (isServico && !pesoPeca) {
      setError("Peso da peça é obrigatório para ordens de serviço."); return;
    }

    setLoading(true);
    try {
      const sb = createClient();
      let fotoPecaPath: string | null = null;
      let videoPath: string | null = null;

      // Upload foto da peça
      if (fotoFile) {
        const compressed = await compressImage(fotoFile);
        const ext = "jpg";
        const path = `servico/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await sb.storage
          .from("ordem-fotos")
          .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
        if (uploadErr) throw new Error(`Falha no upload da foto: ${uploadErr.message}`);
        fotoPecaPath = path;
      }

      // Upload vídeo de observação
      if (videoFile) {
        const path = `servico/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoFile.name.split(".").pop()}`;
        const { error: uploadErr } = await sb.storage
          .from("ordem-videos")
          .upload(path, videoFile, { contentType: videoFile.type, upsert: false });
        if (uploadErr) throw new Error(`Falha no upload do vídeo: ${uploadErr.message}`);
        videoPath = path;
      }

      // Criar ordem
      const res = await fetch("/api/ordens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_ordem:            tipoOrdem,
          cliente_id:            clienteId,
          vendedor_id:           vendedorId,
          data_entrega:          dataEntrega || null,
          peso_metal_negociado:  pesoMetal ? Number(pesoMetal) : null,
          foto_peca_servico:     fotoPecaPath,
          peso_peca_servico:     pesoPeca ? Number(pesoPeca) : null,
          video_observacao:      videoPath,
          itens: itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Erro ${res.status}`);
      }

      const { numero_ordem } = await res.json();
      onSuccess(numero_ordem);

    } catch (err: any) {
      setError(err.message ?? "Erro ao criar ordem");
    } finally {
      setLoading(false);
    }
  }, [
    tipoOrdem, clienteId, clienteObrigatorio, isServico,
    fotoFile, pesoPeca, pesoMetal, videoFile,
    clienteNome, vendedorId, dataEntrega, itens, onSuccess,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="relative w-full max-w-2xl my-8 mx-4 bg-white rounded-2xl shadow-2xl"
        style={{ borderTop: `4px solid ${C.esmeralda}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Nova Ordem
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border flex items-center justify-center transition-colors hover:bg-gray-50"
            style={{ borderColor: C.cremeBorder }}
          >
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Tipo de Ordem */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Tipo de Ordem *
            </label>
            <select
              value={tipoOrdem}
              onChange={e => setTipoOrdem(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A", backgroundColor: "#fff" }}
            >
              {tiposPermitidos.map(tipo => (
                <option key={tipo} value={tipo}>{TIPO_LABELS[tipo] ?? tipo}</option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div ref={clienteRef}>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Cliente {clienteObrigatorio ? "*" : "(opcional)"}
            </label>
            {clienteId ? (
              <div
                className="flex items-center justify-between px-3 py-2.5 border rounded-lg"
                style={{ borderColor: C.esmeralda, backgroundColor: `${C.esmeralda}10` }}
              >
                <span className="text-sm font-medium" style={{ color: C.esmeralda }}>{clienteNome}</span>
                <button
                  type="button"
                  onClick={() => { setClienteId(null); setClienteNome(""); setClienteBusca(""); }}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ color: "#6B7280" }}
                >
                  Alterar
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                  <input
                    type="text"
                    value={clienteBusca}
                    onChange={e => { setClienteBusca(e.target.value); setShowClienteDrop(true); }}
                    onFocus={() => clienteBusca.length >= 2 && setShowClienteDrop(true)}
                    placeholder="Buscar por nome ou telefone…"
                    className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                  />
                  {clienteLoading && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#9CA3AF" }} />
                  )}
                </div>
                {showClienteDrop && clienteResultados.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {clienteResultados.map(c => (
                      <button
                        key={c.id_contato}
                        type="button"
                        onClick={() => {
                          setClienteId(c.id_contato);
                          setClienteNome(c.nome);
                          setClienteBusca("");
                          setShowClienteDrop(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b last:border-0 transition-colors"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        <div className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{c.nome}</div>
                        {c.telefone && (
                          <div className="text-[11px]" style={{ color: "#9CA3AF" }}>{c.telefone}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vendedor + Data Entrega */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Vendedor(a)
              </label>
              <select
                value={vendedorId ?? ""}
                onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#1A1A1A", backgroundColor: "#fff" }}
              >
                <option value="">— Selecionar —</option>
                {vendedores.map(v => (
                  <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Data de Entrega
              </label>
              <input
                type="date"
                value={dataEntrega}
                onChange={e => setDataEntrega(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
              />
            </div>
          </div>

          {/* Peso Metal Negociado */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Peso Metal Negociado (g)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={pesoMetal}
              onChange={e => setPesoMetal(e.target.value)}
              placeholder="0.00"
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
            />
          </div>

          {/* Produtos */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
              Produtos
            </label>
            <div ref={produtoRef} className="relative mb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                <input
                  type="text"
                  value={produtoBusca}
                  onChange={e => { setProdutoBusca(e.target.value); setShowProdutoDrop(true); }}
                  onFocus={() => produtoBusca.length >= 2 && setShowProdutoDrop(true)}
                  placeholder="Buscar produto por nome ou SKU…"
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                />
                {produtoLoading && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#9CA3AF" }} />
                )}
              </div>
              {showProdutoDrop && produtoResultados.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto"
                  style={{ borderColor: C.cremeBorder }}
                >
                  {produtoResultados.map(p => (
                    <button
                      key={p.id_produto}
                      type="button"
                      onClick={() => adicionarItem(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b last:border-0 transition-colors"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{p.nome}</span>
                        <span className="text-[11px] font-mono ml-3" style={{ color: "#9CA3AF" }}>{p.sku}</span>
                      </div>
                      {p.peso_precificado != null && (
                        <div className="text-[11px]" style={{ color: "#9CA3AF" }}>
                          {Number(p.peso_precificado).toFixed(2)}g
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {itens.length > 0 && (
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: C.bg }}>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#9CA3AF" }}>Produto</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#9CA3AF" }}>SKU</th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#9CA3AF" }}>Qtd</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(item => (
                      <tr key={item.produto_id} className="border-t" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-3 py-2 font-medium" style={{ color: "#1A1A1A" }}>{item.produto_nome}</td>
                        <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "#6B7280" }}>{item.produto_sku}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={() => alterarQtd(item.produto_id, -1)}
                              className="w-5 h-5 rounded text-xs border flex items-center justify-center"
                              style={{ borderColor: C.cremeBorder }}>−</button>
                            <span className="w-6 text-center text-sm font-mono">{item.quantidade}</span>
                            <button type="button" onClick={() => alterarQtd(item.produto_id, +1)}
                              className="w-5 h-5 rounded text-xs border flex items-center justify-center"
                              style={{ borderColor: C.cremeBorder }}>+</button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => removerItem(item.produto_id)}
                            className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-50">
                            <Trash2 size={12} style={{ color: "#DC2626" }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Campos de Serviço (condicional) */}
          {isServico && (
            <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: C.bg, border: `1px solid ${C.cremeBorder}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                Peça do Cliente
              </p>

              {/* Foto da Peça */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Foto da Peça *
                </label>
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFotoChange}
                  className="hidden"
                />
                {fotoPreview ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fotoPreview}
                      alt="Preview foto peça"
                      className="w-28 h-28 object-cover rounded-lg border"
                      style={{ borderColor: C.cremeBorder }}
                    />
                    <button
                      type="button"
                      onClick={() => { setFotoFile(null); setFotoPreview(null); if (fotoInputRef.current) fotoInputRef.current.value = ""; }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
                    >
                      <X size={10} color="white" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      className="mt-1 text-[11px] block text-center w-28"
                      style={{ color: "#6B7280" }}
                    >
                      Trocar foto
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fotoInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors hover:bg-gray-50"
                    style={{ borderColor: C.cremeBorder, color: "#6B7280", borderStyle: "dashed" }}
                  >
                    <Camera size={16} />
                    Tirar foto / Upload
                  </button>
                )}
              </div>

              {/* Peso da Peça */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Peso da Peça *  (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pesoPeca}
                  onChange={e => setPesoPeca(e.target.value)}
                  required={isServico}
                  placeholder="0.00"
                  className="w-40 border rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
                  style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                />
              </div>
            </div>
          )}

          {/* Vídeo de observação (sempre opcional) */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Vídeo de Observação (opcional)
            </label>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={handleVideoChange}
              className="hidden"
            />
            {videoPreview ? (
              <div className="relative inline-block">
                <video
                  src={videoPreview}
                  controls
                  className="w-48 rounded-lg border"
                  style={{ borderColor: C.cremeBorder }}
                />
                <button
                  type="button"
                  onClick={() => { setVideoFile(null); setVideoPreview(null); if (videoInputRef.current) videoInputRef.current.value = ""; }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <X size={10} color="white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors hover:bg-gray-50"
                style={{ borderColor: C.cremeBorder, color: "#6B7280", borderStyle: "dashed" }}
              >
                <Video size={16} />
                Gravar vídeo / Upload
              </button>
            )}
          </div>

          {/* Erro */}
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm border transition-colors"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: C.esmeralda }}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Criando…
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Criar Ordem
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
