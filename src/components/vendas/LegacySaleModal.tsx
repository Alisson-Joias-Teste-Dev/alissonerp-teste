"use client";

import { useState, useRef, useCallback } from "react";
import {
  X, Loader2, Search, Package, History,
  User, Phone, Calendar, FileText, Weight, Hash,
  Mail, MapPin, Building, UserCheck,
} from "lucide-react";

const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

interface Cliente {
  id: number;
  nome: string;
  cpf_cnpj?: string | null;
  telefone?: string | null;
  celular?: string | null;
}

interface Produto {
  id: number;
  sku?: string | null;
  nome: string;
  preco_venda?: number | null;
  peso_precificado?: number | null;
  saldo_disponivel?: number;
}

interface Vendedor {
  id_vendedor: number;
  nome: string;
}

interface Props {
  onClose: () => void;
  onSuccess: (result: { id: number; numero_venda: string }) => void;
}

// ─── Autocomplete inline simplificado ───────────────────────────────────────
function AutoComplete<T>({
  placeholder,
  onSearch,
  renderItem,
  onSelect,
  selectedLabel,
  onClear,
}: {
  placeholder: string;
  onSearch: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  selectedLabel?: string | null;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); setHighlighted(-1); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const r = await onSearch(val);
      setResults(r);
      setOpen(r.length > 0);
      setHighlighted(-1);
      setLoading(false);
    }, 350);
  }, [onSearch]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      onSelect(results[highlighted]);
      setQ(""); setOpen(false); setResults([]); setHighlighted(-1);
    } else if (e.key === "Escape") {
      setOpen(false); setHighlighted(-1);
    }
  }

  if (selectedLabel) {
    return (
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2.5 border bg-white"
        style={{ borderColor: C.cremeBorder }}
      >
        <span className="text-sm truncate" style={{ color: "#374151" }}>{selectedLabel}</span>
        <button type="button" onClick={onClear} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-gray-400 flex-shrink-0" />
        ) : (
          <Search size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0" />
        )}
        <input
          className="flex-1 outline-none text-sm bg-transparent min-w-0"
          style={{ color: "#1A1A1A" }}
          placeholder={placeholder}
          value={q}
          onChange={e => { setQ(e.target.value); search(e.target.value); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg overflow-hidden bg-white"
          style={{ borderColor: C.cremeBorder, maxHeight: 200 }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {results.map((item, i) => (
              <button
                type="button"
                key={i}
                className="w-full text-left px-3 py-2.5 text-sm border-b last:border-b-0 transition-colors"
                style={{ borderColor: C.creme, backgroundColor: i === highlighted ? C.esmeraldaLt : undefined }}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={() => { onSelect(item); setQ(""); setOpen(false); setResults([]); setHighlighted(-1); }}
              >
                {renderItem(item)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Input rapido para campos inline ────────────────────────────────────────
function InputField({
  icon: Icon, placeholder, value, onChange, maxLength,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
      <Icon size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0" />
      <input
        className="flex-1 outline-none text-sm bg-transparent min-w-0"
        style={{ color: "#1A1A1A" }}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function LegacySaleModal({ onClose, onSuccess }: Props) {
  const [modoCliente, setModoCliente] = useState<"buscar" | "novo">("buscar");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [novoCliente, setNovoCliente] = useState({
    nome: "",
    cpf_cnpj: "",
    email: "",
    telefone: "",
    celular: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    municipio: "",
    cep: "",
    uf: "",
  });

  const [dataVenda, setDataVenda] = useState("");
  const [observacoes, setObservacoes] = useState("Registro manual de venda antiga");
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);

  const [produto, setProduto] = useState<Produto | null>(null);
  const [nomeProdutoManual, setNomeProdutoManual] = useState("");
  const [pesoEstimado, setPesoEstimado] = useState("");
  const [quantidade, setQuantidade] = useState("1");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nomeProduto = produto ? produto.nome : nomeProdutoManual;
  const novoClienteValido = novoCliente.nome.trim() && novoCliente.telefone.trim();
  const valido =
    ((modoCliente === "buscar" && cliente) || (modoCliente === "novo" && novoClienteValido)) &&
    nomeProduto.trim() &&
    pesoEstimado.trim() && Number(pesoEstimado) > 0 &&
    (!quantidade || Number(quantidade) >= 1);

  async function handleSubmit() {
    if (!valido) return;
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        data_venda: dataVenda || undefined,
        observacoes: observacoes || undefined,
        vendedor_id: vendedor?.id_vendedor ?? undefined,
        itens: [{
          produto_id: produto?.id ?? null,
          nome_produto: nomeProduto,
          sku: produto?.sku ?? null,
          quantidade: Number(quantidade) || 1,
          peso_estimado: Number(pesoEstimado),
        }],
      };

      if (modoCliente === "buscar" && cliente) {
        body.cliente_id = cliente.id;
      } else {
        body.novo_cliente = {
          nome: novoCliente.nome.trim(),
          telefone: novoCliente.telefone.trim(),
          cpf_cnpj: novoCliente.cpf_cnpj.trim() || undefined,
          email: novoCliente.email.trim() || undefined,
          celular: novoCliente.celular.trim() || undefined,
          endereco: novoCliente.endereco.trim() || undefined,
          numero: novoCliente.numero.trim() || undefined,
          complemento: novoCliente.complemento.trim() || undefined,
          bairro: novoCliente.bairro.trim() || undefined,
          municipio: novoCliente.municipio.trim() || undefined,
          cep: novoCliente.cep.trim() || undefined,
          uf: novoCliente.uf.trim().toUpperCase() || undefined,
        };
      }

      const res = await fetch("/api/vendas/legado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido");

      onSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar venda antiga");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg border flex flex-col"
        style={{ borderColor: C.cremeBorder, maxHeight: "90vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b flex-shrink-0"
          style={{ borderColor: C.cremeBorder }}
        >
          <div className="flex items-center gap-2">
            <History size={18} style={{ color: C.esmeralda }} />
            <h3
              className="text-base font-semibold"
              style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
            >
              Cadastrar Venda Antiga
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            style={{ color: "#9CA3AF" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* ── Cliente ─────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
              Cliente <span style={{ color: "#EF4444" }}>*</span>
            </label>

            <div className="flex gap-1 p-0.5 rounded-lg border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              {(["buscar", "novo"] as const).map(modo => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => setModoCliente(modo)}
                  className="flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: modoCliente === modo ? "#fff" : "transparent",
                    color: modoCliente === modo ? C.esmeralda : "#9CA3AF",
                    boxShadow: modoCliente === modo ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
                  }}
                >
                  {modo === "buscar" ? "Buscar existente" : "Cadastrar novo"}
                </button>
              ))}
            </div>

            {modoCliente === "buscar" ? (
              <AutoComplete<Cliente>
                placeholder="Digite nome, telefone ou CPF..."
                onSearch={async q => {
                  const r = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(q)}`);
                  return r.json();
                }}
                renderItem={c => (
                  <div>
                    <p className="font-medium text-sm">{c.nome}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      {c.telefone || c.celular || "sem telefone"}
                    </p>
                  </div>
                )}
                onSelect={c => setCliente(c)}
                selectedLabel={cliente ? `${cliente.nome} ${cliente.telefone ? `(${cliente.telefone})` : ""}` : null}
                onClear={() => setCliente(null)}
              />
            ) : (
              <div className="space-y-2">
                {/* Linha 1: Nome + CPF/CNPJ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InputField icon={User} placeholder="Nome completo *" value={novoCliente.nome} onChange={v => setNovoCliente(p => ({ ...p, nome: v }))} />
                  <InputField icon={Hash} placeholder="CPF/CNPJ" value={novoCliente.cpf_cnpj} onChange={v => setNovoCliente(p => ({ ...p, cpf_cnpj: v }))} />
                </div>
                {/* Linha 2: Telefone + Celular */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InputField icon={Phone} placeholder="Telefone *" value={novoCliente.telefone} onChange={v => setNovoCliente(p => ({ ...p, telefone: v }))} />
                  <InputField icon={Phone} placeholder="Celular" value={novoCliente.celular} onChange={v => setNovoCliente(p => ({ ...p, celular: v }))} />
                </div>
                {/* Linha 3: Email */}
                <InputField icon={Mail} placeholder="Email" value={novoCliente.email} onChange={v => setNovoCliente(p => ({ ...p, email: v }))} />
                {/* Linha 4: Endereco + Numero */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <InputField icon={MapPin} placeholder="Endereco" value={novoCliente.endereco} onChange={v => setNovoCliente(p => ({ ...p, endereco: v }))} />
                  </div>
                  <InputField icon={Hash} placeholder="Numero" value={novoCliente.numero} onChange={v => setNovoCliente(p => ({ ...p, numero: v }))} />
                </div>
                {/* Linha 5: Complemento + Bairro */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <InputField icon={Building} placeholder="Complemento" value={novoCliente.complemento} onChange={v => setNovoCliente(p => ({ ...p, complemento: v }))} />
                  <InputField icon={MapPin} placeholder="Bairro" value={novoCliente.bairro} onChange={v => setNovoCliente(p => ({ ...p, bairro: v }))} />
                </div>
                {/* Linha 6: Municipio + CEP + UF */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <div className="sm:col-span-2">
                    <InputField icon={MapPin} placeholder="Municipio" value={novoCliente.municipio} onChange={v => setNovoCliente(p => ({ ...p, municipio: v }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <InputField icon={MapPin} placeholder="CEP" value={novoCliente.cep} onChange={v => setNovoCliente(p => ({ ...p, cep: v }))} />
                  </div>
                  <InputField icon={MapPin} placeholder="UF" value={novoCliente.uf} onChange={v => setNovoCliente(p => ({ ...p, uf: v }))} maxLength={2} />
                </div>
              </div>
            )}
          </div>

          {/* ── Dados da venda ──────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
              Dados da Venda
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
                  <Calendar size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0" />
                  <input
                    type="date"
                    className="flex-1 outline-none text-sm bg-transparent min-w-0"
                    style={{ color: "#1A1A1A" }}
                    max="2023-12-31"
                    value={dataVenda}
                    onChange={e => setDataVenda(e.target.value)}
                  />
                </div>
                <p className="text-[10px] mt-0.5 px-1" style={{ color: "#9CA3AF" }}>
                  Data maxima: 31/12/2023
                </p>
              </div>
              <div>
                <AutoComplete<Vendedor>
                  placeholder="Buscar vendedor(a)..."
                  onSearch={async q => {
                    const r = await fetch(`/api/vendedores?q=${encodeURIComponent(q)}`);
                    const data = await r.json();
                    return data.filter((v: Vendedor) =>
                      v.nome.toLowerCase().includes(q.toLowerCase())
                    );
                  }}
                  renderItem={v => (
                    <div>
                      <p className="font-medium text-sm">{v.nome}</p>
                    </div>
                  )}
                  onSelect={v => setVendedor(v)}
                  selectedLabel={vendedor?.nome ?? null}
                  onClear={() => setVendedor(null)}
                />
              </div>
            </div>

            <div>
              <div className="flex items-start gap-1.5 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
                <FileText size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0 mt-0.5" />
                <textarea
                  className="flex-1 outline-none text-sm bg-transparent resize-none min-w-0"
                  style={{ color: "#1A1A1A" }}
                  rows={2}
                  placeholder="Observacoes..."
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Peca ───────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
              Peca <span style={{ color: "#EF4444" }}>*</span>
            </label>

            <AutoComplete<Produto>
              placeholder="Buscar peca por nome ou SKU (opcional)..."
              onSearch={async q => {
                const r = await fetch(`/api/vendas/produtos/busca?q=${encodeURIComponent(q)}`);
                return r.json();
              }}
              renderItem={p => (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.nome}</span>
                    {p.sku && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
                        {p.sku}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.peso_precificado != null && (
                      <span className="text-xs" style={{ color: "#9CA3AF" }}>Peso: {Number(p.peso_precificado).toFixed(2)}g</span>
                    )}
                  </div>
                </div>
              )}
              onSelect={p => { setProduto(p); if (!nomeProdutoManual) setNomeProdutoManual(p.nome); }}
              selectedLabel={produto ? `${produto.sku ? `[${produto.sku}] ` : ""}${produto.nome}` : null}
              onClear={() => { setProduto(null); setNomeProdutoManual(""); }}
            />

            {!produto && (
              <div>
                <div className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
                  <Package size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0" />
                  <input
                    className="flex-1 outline-none text-sm bg-transparent min-w-0"
                    placeholder="Nome da peca (ex: Alianca Ouro 18k)"
                    value={nomeProdutoManual}
                    onChange={e => setNomeProdutoManual(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
                  <Weight size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0" />
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    className="flex-1 outline-none text-sm bg-transparent min-w-0"
                    style={{ color: "#1A1A1A" }}
                    placeholder="Peso medio (g)"
                    value={pesoEstimado}
                    onChange={e => setPesoEstimado(e.target.value)}
                  />
                </div>
                <p className="text-[10px] mt-0.5 px-1" style={{ color: "#9CA3AF" }}>
                  Peso medio em gramas
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
                  <Hash size={14} style={{ color: "#9CA3AF" }} className="flex-shrink-0" />
                  <input
                    type="number"
                    min="1"
                    className="flex-1 outline-none text-sm bg-transparent min-w-0"
                    style={{ color: "#1A1A1A" }}
                    placeholder="Qtd"
                    value={quantidade}
                    onChange={e => setQuantidade(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm border border-red-200 bg-red-50 text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 p-4 border-t flex-shrink-0"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valido || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Cadastrar
          </button>
        </div>
      </div>
    </div>
  );
}
