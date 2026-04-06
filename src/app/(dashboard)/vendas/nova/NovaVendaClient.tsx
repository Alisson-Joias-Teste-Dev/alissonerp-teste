"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, Plus, Loader2, Save, CheckCircle,
  User, Package, CreditCard, Truck, FileText, ChevronDown, Video,
} from "lucide-react";
import Link from "next/link";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cliente {
  id: number; nome: string; cpf_cnpj: string | null;
  email: string | null; telefone: string | null;
}

interface Produto {
  id: number; sku: string; nome: string;
  preco_venda: number | null; peso_precificado: number | null;
  unidade: string | null; sufixo_variacao: string | null; numeracao: string | null;
}

interface FaixaComissao {
  desconto_pct: number; comissao_pct: number;
}

interface ItemVenda {
  _key:          string;
  produto_id:    number;
  nome_produto:  string;
  sku:           string;
  quantidade:    number;
  preco_lista:   number;
  pct_desconto:  number;
  preco_unitario: number;
  total_item:    number;
  pct_comissao:  number;
  valor_comissao: number;
  peso_estimado: number | null;
}

interface Pagamento {
  _key:     string;
  forma:    string;
  valor:    number;
  parcelas: number;
}

interface Vendedor { id_vendedor: number; nome: string; }

const FORMAS_PAGAMENTO = [
  "Pix", "Cartão Crédito", "Cartão Débito", "Dinheiro", "Transferência", "Boleto",
];
const FORMAS_ENVIO = ["Motoboy", "Correios", "Retirada", "Transportadora", "Entrega Própria"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function uid() { return Math.random().toString(36).slice(2); }

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  role:        string;
  vendedorId:  number | null;
  maxDesconto: number;
}

const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border" style={{ borderColor: C.cremeBorder }}>
      <div
        className="flex items-center gap-2 px-4 py-3 border-b rounded-t-xl"
        style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}
      >
        <Icon size={14} style={{ color: C.esmeralda }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.esmeralda }}>
          {title}
        </span>
      </div>
      <div className="p-4 bg-white rounded-b-xl">{children}</div>
    </div>
  );
}

// ─── Autocomplete genérico ─────────────────────────────────────────────────────
function Autocomplete<T>({
  placeholder, onSearch, renderItem, onSelect, selectedLabel, onClear,
}: {
  placeholder:  string;
  onSearch:     (q: string) => Promise<T[]>;
  renderItem:   (item: T) => React.ReactNode;
  onSelect:     (item: T) => void;
  selectedLabel?: string | null;
  onClear:      () => void;
}) {
  const [q,       setQ]       = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const r = await onSearch(val);
      setResults(r);
      setOpen(true);
      setLoading(false);
    }, 300);
  }, [onSearch]);

  if (selectedLabel) {
    return (
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2 border"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        <span className="text-sm" style={{ color: "#374151" }}>{selectedLabel}</span>
        <button onClick={onClear} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 border"
        style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
      >
        {loading ? <Loader2 size={13} className="animate-spin text-gray-400" /> : <Search size={13} style={{ color: "#9CA3AF" }} />}
        <input
          className="flex-1 outline-none text-sm"
          style={{ color: "#1A1A1A" }}
          placeholder={placeholder}
          value={q}
          onChange={e => { setQ(e.target.value); search(e.target.value); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg overflow-hidden"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", maxHeight: 240 }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {results.map((item, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2.5 hover:bg-stone-50 transition-colors border-b last:border-b-0 text-sm"
                style={{ borderColor: C.creme }}
                onMouseDown={() => { onSelect(item); setQ(""); setOpen(false); setResults([]); }}
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NovaVendaClient({ role, vendedorId, maxDesconto }: Props) {
  const router = useRouter();
  const isFullAccess = FULL_ACCESS.includes(role);

  // Dados de referência
  const [faixas,    setFaixas]    = useState<FaixaComissao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  // Form state
  const [cliente,        setCliente]        = useState<Cliente | null>(null);
  const [vendedorSel,    setVendedorSel]    = useState<number | "">(vendedorId ?? "");
  const [dataEntrega,    setDataEntrega]    = useState("");
  const [totalFrete,     setTotalFrete]     = useState(0);
  const [formaEnvio,     setFormaEnvio]     = useState("");
  const [formaFrete,     setFormaFrete]     = useState("");
  const [observacoes,    setObservacoes]    = useState("");

  // Vídeo observações internas
  const videoInputRef                       = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoObsInterna, setVideoObsInterna] = useState<string | null>(null);
  const [uploadingVideo,  setUploadingVideo]  = useState(false);
  const [videoUploadErr,  setVideoUploadErr]  = useState("");

  // Itens
  const [itens, setItens] = useState<ItemVenda[]>([]);

  // Produto sendo adicionado
  const [produtoSel,  setProdutoSel]  = useState<Produto | null>(null);
  const [qtd,         setQtd]         = useState(1);
  const [pctDesconto, setPctDesconto] = useState(0);
  const [descontoErr, setDescontoErr] = useState("");

  // Pagamentos
  const [pagamentos,   setPagamentos]   = useState<Pagamento[]>([]);
  const [pagForma,     setPagForma]     = useState("Pix");
  const [pagValor,     setPagValor]     = useState("");
  const [pagParcelas,  setPagParcelas]  = useState(1);

  // Submissão
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState("");

  // Carregar dados de referência
  useEffect(() => {
    fetch("/api/vendas/faixas-comissao")
      .then(r => r.json())
      .then(setFaixas)
      .catch(() => {});
    if (isFullAccess) {
      fetch("/api/vendedores").then(r => r.json()).then(setVendedores).catch(() => {});
    }
  }, [isFullAccess]);

  // ── Lookups ────────────────────────────────────────────────────────────────
  function getComissao(pct: number): number {
    const rounded = Math.round(pct);
    const faixa = faixas.find(f => f.desconto_pct === rounded);
    if (!faixa) return 0;
    if (pct > 30) return 0; // acima do limite = sem comissão
    return faixa.comissao_pct;
  }

  // ── Calcular item atual ─────────────────────────────────────────────────────
  function calcItem(produto: Produto, q: number, pct: number): Omit<ItemVenda, "_key"> {
    const precoLista   = produto.preco_venda ?? 0;
    const precoUnit    = precoLista * (1 - pct / 100);
    const totalItem    = precoUnit * q;
    const pctComissao  = getComissao(pct);
    const valComissao  = totalItem * pctComissao / 100;
    return {
      produto_id:    produto.id,
      nome_produto:  produto.nome,
      sku:           produto.sku,
      quantidade:    q,
      preco_lista:   precoLista,
      pct_desconto:  pct,
      preco_unitario: precoUnit,
      total_item:    totalItem,
      pct_comissao:  pctComissao,
      valor_comissao: valComissao,
      peso_estimado: produto.peso_precificado,
    };
  }

  function handleAddItem() {
    if (!produtoSel) return;
    if (pctDesconto > maxDesconto) {
      setDescontoErr(`Desconto máximo permitido: ${maxDesconto}%`);
      return;
    }
    const item = { _key: uid(), ...calcItem(produtoSel, qtd, pctDesconto) };
    setItens(prev => [...prev, item]);
    setProdutoSel(null);
    setQtd(1);
    setPctDesconto(0);
    setDescontoErr("");
  }

  function removeItem(key: string) {
    setItens(prev => prev.filter(i => i._key !== key));
  }

  function handleAddPagamento() {
    const v = parseFloat(pagValor.replace(",", "."));
    if (!v || v <= 0) return;
    setPagamentos(prev => [...prev, { _key: uid(), forma: pagForma, valor: v, parcelas: pagParcelas }]);
    setPagValor("");
    setPagParcelas(1);
  }

  // ── Totais ─────────────────────────────────────────────────────────────────
  const totalProdutos = itens.reduce((s, i) => s + i.total_item,    0);
  const totalDesconto = itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);
  const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);
  const totalVenda    = totalProdutos + totalFrete;
  const totalPago     = pagamentos.reduce((s, p) => s + p.valor, 0);
  const saldo         = totalVenda - totalPago;

  // ── Vídeo observações internas ─────────────────────────────────────────────
  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setVideoObsInterna(null);
    setVideoUploadErr("");
    setUploadingVideo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res  = await fetch("/api/vendas/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mime: file.type, filename: file.name }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setVideoObsInterna(data.url ?? null);
    } catch (err) {
      setVideoUploadErr(err instanceof Error ? err.message : "Erro ao enviar vídeo");
    } finally {
      setUploadingVideo(false);
    }
  }

  function handleRemoveVideo() {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null);
    setVideoObsInterna(null);
    setVideoUploadErr("");
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit(situacao: "rascunho" | "aprovado") {
    setSaving(true);
    setSaveErr("");
    try {
      const body = {
        cliente_id:           cliente?.id ?? null,
        vendedor_id:          vendedorSel || null,
        data_entrega:         dataEntrega || null,
        total_frete:          totalFrete,
        forma_envio:          formaEnvio || null,
        forma_frete:          formaFrete || null,
        observacoes:          observacoes || null,
        video_obs_interna:    videoObsInterna,
        itens: itens.map(i => ({
          produto_id:    i.produto_id,
          nome_produto:  i.nome_produto,
          sku:           i.sku,
          quantidade:    i.quantidade,
          preco_lista:   i.preco_lista,
          pct_desconto:  i.pct_desconto,
          preco_unitario: i.preco_unitario,
          total_item:    i.total_item,
          pct_comissao:  i.pct_comissao,
          valor_comissao: i.valor_comissao,
          peso_estimado: i.peso_estimado,
        })),
        pagamentos: pagamentos.map(p => ({
          forma:    p.forma,
          valor:    p.valor,
          parcelas: p.parcelas,
          status:   "pendente",
        })),
      };

      const res  = await fetch("/api/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { id: number; numero_venda: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Se aprovado, atualizar situação
      if (situacao === "aprovado") {
        await fetch(`/api/vendas/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ situacao: "aprovado" }),
        });
      }

      router.push("/vendas");
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao salvar venda");
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl mx-auto pb-32">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Nova Venda
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Preencha os dados abaixo</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">

        {/* ── Cliente ── */}
        <Section icon={User} title="Cliente">
          <Autocomplete<Cliente>
            placeholder="Buscar cliente por nome, CPF ou telefone..."
            onSearch={async q => {
              const r = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(q)}`);
              return r.json();
            }}
            renderItem={c => (
              <div>
                <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{c.nome}</p>
                <p className="text-xs" style={{ color: "#9CA3AF" }}>{c.cpf_cnpj ?? c.telefone ?? "—"}</p>
              </div>
            )}
            onSelect={setCliente}
            selectedLabel={cliente ? `${cliente.nome}${cliente.cpf_cnpj ? ` · ${cliente.cpf_cnpj}` : ""}` : null}
            onClear={() => setCliente(null)}
          />
        </Section>

        {/* ── Cabeçalho venda ── */}
        <Section icon={FileText} title="Dados da Venda">
          <div className="grid grid-cols-2 gap-3">

            {/* Vendedor */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Vendedor</label>
              {isFullAccess ? (
                <select
                  value={vendedorSel}
                  onChange={e => setVendedorSel(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }}
                >
                  <option value="">Selecionar vendedor</option>
                  {vendedores.map(v => (
                    <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>
                  ))}
                </select>
              ) : (
                <div
                  className="border rounded-lg px-3 py-2 text-sm"
                  style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: C.cremeBg }}
                >
                  {vendedores.find(v => v.id_vendedor === vendedorId)?.nome ?? "—"}
                </div>
              )}
            </div>

            {/* Data entrega */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Data de Entrega</label>
              <input
                type="date"
                value={dataEntrega}
                onChange={e => setDataEntrega(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
            </div>
          </div>
        </Section>

        {/* ── Produtos ── */}
        <Section icon={Package} title="Produtos">

          {/* Busca produto */}
          <div className="mb-4 p-3 rounded-xl border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            <p className="text-xs font-medium mb-2" style={{ color: "#6B7280" }}>Adicionar produto</p>

            <Autocomplete<Produto>
              placeholder="Buscar por nome ou SKU..."
              onSearch={async q => {
                const r = await fetch(`/api/vendas/produtos/busca?q=${encodeURIComponent(q)}&limit=15`);
                return r.json();
              }}
              renderItem={p => (
                <div>
                  <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{p.nome}</p>
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>
                    {p.sku} · {p.preco_venda != null ? fmt(p.preco_venda) : "sem preço"}
                  </p>
                </div>
              )}
              onSelect={p => { setProdutoSel(p); setPctDesconto(0); setDescontoErr(""); }}
              selectedLabel={produtoSel ? `${produtoSel.nome} · ${fmt(produtoSel.preco_venda ?? 0)}` : null}
              onClear={() => { setProdutoSel(null); setDescontoErr(""); }}
            />

            {produtoSel && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {/* Quantidade */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Qtd</label>
                  <input
                    type="number" min={1} value={qtd}
                    onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>

                {/* Desconto */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                    Desconto % <span style={{ color: "#9CA3AF" }}>(máx {maxDesconto}%)</span>
                  </label>
                  <input
                    type="number" min={0} max={maxDesconto} step={1} value={pctDesconto}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setPctDesconto(v);
                      setDescontoErr(v > maxDesconto ? `Máximo: ${maxDesconto}%` : "");
                    }}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                    style={{ borderColor: descontoErr ? "#EF4444" : C.cremeBorder }}
                  />
                  {descontoErr && <p className="text-[11px] text-red-500 mt-0.5">{descontoErr}</p>}
                </div>

                {/* Preview comissão */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Comissão</label>
                  <div
                    className="border rounded-lg px-2 py-1.5 text-sm text-center tabular-nums"
                    style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, color: C.esmeralda }}
                  >
                    {getComissao(pctDesconto).toFixed(2)}%
                  </div>
                </div>

                {/* Preview valor */}
                <div className="col-span-3 flex items-center justify-between text-xs pt-1" style={{ color: "#6B7280" }}>
                  <span>
                    {fmt(produtoSel.preco_venda ?? 0)} × {qtd}
                    {pctDesconto > 0 && ` − ${pctDesconto}%`}
                  </span>
                  <span className="font-semibold" style={{ color: C.esmeralda }}>
                    = {fmt(calcItem(produtoSel, qtd, pctDesconto).total_item)}
                  </span>
                </div>

                <button
                  onClick={handleAddItem}
                  disabled={!!descontoErr || pctDesconto > maxDesconto}
                  className="col-span-3 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            )}
          </div>

          {/* Lista de itens */}
          {itens.length === 0 ? (
            <p className="text-center text-sm py-4" style={{ color: "#9CA3AF" }}>Nenhum produto adicionado</p>
          ) : (
            <div className="space-y-2">
              {itens.map(item => (
                <div
                  key={item._key}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                  style={{ borderColor: C.cremeBorder }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>{item.nome_produto}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      {item.sku} · {item.quantidade}× {fmt(item.preco_lista)}
                      {item.pct_desconto > 0 && ` −${item.pct_desconto}%`}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: C.esmeralda }}>
                        {fmt(item.total_item)}
                      </span>
                      <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                        Comissão: {item.pct_comissao}% = {fmt(item.valor_comissao)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item._key)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              {/* Sub-total */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}
              >
                <span>{itens.length} produto{itens.length > 1 ? "s" : ""}</span>
                <span className="tabular-nums">{fmt(totalProdutos)}</span>
              </div>
            </div>
          )}
        </Section>

        {/* ── Frete ── */}
        <Section icon={Truck} title="Envio & Frete">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Forma de Envio</label>
              <select
                value={formaEnvio}
                onChange={e => setFormaEnvio(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              >
                <option value="">Selecionar</option>
                {FORMAS_ENVIO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Valor do Frete</label>
              <input
                type="number" min={0} step={0.01} value={totalFrete || ""}
                onChange={e => setTotalFrete(Number(e.target.value) || 0)}
                placeholder="0,00"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
            </div>
          </div>
        </Section>

        {/* ── Pagamento ── */}
        <Section icon={CreditCard} title="Pagamento">

          {/* Adicionar forma */}
          <div
            className="flex flex-wrap items-end gap-2 mb-3 p-3 rounded-xl border"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
          >
            <div className="flex-1 min-w-32">
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Forma</label>
              <select
                value={pagForma}
                onChange={e => setPagForma(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
              >
                {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-24">
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Valor</label>
              <input
                type="text" value={pagValor}
                onChange={e => setPagValor(e.target.value)}
                placeholder="0,00"
                className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
                onKeyDown={e => e.key === "Enter" && handleAddPagamento()}
              />
            </div>
            {pagForma === "Cartão Crédito" && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Parcelas</label>
                <select
                  value={pagParcelas}
                  onChange={e => setPagParcelas(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder }}
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                    <option key={n} value={n}>{n}×</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={handleAddPagamento}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              <Plus size={13} /> Add
            </button>
          </div>

          {/* Lista pagamentos */}
          {pagamentos.length === 0 ? (
            <p className="text-center text-sm py-2" style={{ color: "#9CA3AF" }}>Nenhum pagamento registrado</p>
          ) : (
            <div className="space-y-1.5">
              {pagamentos.map(p => (
                <div key={p._key} className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: C.cremeBorder }}>
                  <span style={{ color: "#374151" }}>
                    {p.forma}{p.parcelas > 1 ? ` ${p.parcelas}×` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium" style={{ color: C.esmeralda }}>{fmt(p.valor)}</span>
                    <button onClick={() => setPagamentos(prev => prev.filter(x => x._key !== p._key))}
                      className="text-gray-300 hover:text-red-400 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Saldo */}
          {(itens.length > 0 || pagamentos.length > 0) && (
            <div className="mt-3 pt-3 border-t space-y-1" style={{ borderColor: C.cremeBorder }}>
              {[
                { label: "Produtos",   value: totalProdutos, show: true },
                { label: "Desconto",   value: -totalDesconto, show: totalDesconto > 0 },
                { label: "Frete",      value: totalFrete,     show: totalFrete > 0 },
                { label: "Total",      value: totalVenda,     bold: true, show: true },
                { label: "Pago",       value: totalPago,      show: pagamentos.length > 0 },
                { label: "Saldo",      value: saldo,          show: pagamentos.length > 0, alert: saldo > 0.01 },
              ].filter(r => r.show).map(r => (
                <div key={r.label} className={`flex items-center justify-between text-sm ${r.bold ? "font-semibold" : ""}`}>
                  <span style={{ color: r.bold ? C.esmeralda : "#6B7280" }}>{r.label}</span>
                  <span
                    className="tabular-nums"
                    style={{ color: r.alert ? "#D97706" : r.bold ? C.esmeralda : "#374151" }}
                  >
                    {fmt(r.value ?? 0)}
                  </span>
                </div>
              ))}
              {isFullAccess && totalComissao > 0 && (
                <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
                  <span>Comissão total</span>
                  <span className="tabular-nums">{fmt(totalComissao)}</span>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Observações ── */}
        <Section icon={FileText} title="Observações">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                Observações (visível ao cliente)
              </label>
              <textarea
                rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)}
                placeholder="Ex: Entregar na loja, embrulho para presente..."
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
            </div>
            {isFullAccess && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                  Observações internas (vídeo)
                </label>
                {!videoPreviewUrl ? (
                  <label
                    className="flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed cursor-pointer py-6 transition-colors hover:bg-stone-50"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <Video size={24} style={{ color: "#9CA3AF" }} />
                    <span className="text-xs" style={{ color: "#9CA3AF" }}>Gravar ou selecionar vídeo</span>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleVideoSelect}
                    />
                  </label>
                ) : (
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    <video src={videoPreviewUrl} controls className="w-full max-h-48 bg-black" />
                    <div
                      className="flex items-center justify-between px-3 py-2"
                      style={{ backgroundColor: C.cremeBg }}
                    >
                      {uploadingVideo ? (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6B7280" }}>
                          <Loader2 size={12} className="animate-spin" /> Enviando…
                        </span>
                      ) : videoUploadErr ? (
                        <span className="text-xs text-red-500">{videoUploadErr}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs" style={{ color: C.esmeralda }}>
                          <CheckCircle size={12} /> Enviado
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleRemoveVideo}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <X size={12} /> Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

      </div>

      {/* ── Footer fixo com ações ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 border-t"
        style={{ backgroundColor: "#fff", borderColor: C.cremeBorder }}
      >
        {saveErr && (
          <p className="text-xs text-red-600 text-center mb-2">{saveErr}</p>
        )}
        <div className="flex gap-2 max-w-3xl mx-auto">
          <button
            onClick={() => submit("rascunho")}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-50 transition-opacity"
            style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Rascunho
          </button>
          <button
            onClick={() => submit("aprovado")}
            disabled={saving || itens.length === 0}
            className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Finalizar Venda
          </button>
        </div>
      </div>

    </div>
  );
}
