"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, X, Plus, Loader2, CheckCircle,
  Truck, Video, FileText, UserPlus, MapPin, Pencil, User, Package, CreditCard, XCircle,
  Ticket, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { maskCpfCnpj } from "@/lib/formatters";
import PixQrInline from "@/components/vendas/PixQrInline";
import CartaoInline from "@/components/vendas/CartaoInline";
import BadgePromo from "@/components/ui/BadgePromo";
import { useErrorStore } from "@/stores/errorStore";

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
  email: string | null; telefone: string | null; celular?: string | null;
  endereco?: string | null; numero?: string | null; complemento?: string | null;
  bairro?: string | null; municipio?: string | null; cep?: string | null; uf?: string | null;
}
interface Produto {
  id: number; sku: string; nome: string;
  preco_venda: number | null; peso_precificado: number | null;
  unidade: string | null; sufixo_variacao: string | null; numeracao: string | null;
  preco_promo?: number | null;
  em_promocao?: boolean;
  promocao_nome?: string | null;
}
interface FaixaComissao { desconto_pct: number; comissao_pct: number; }
interface ItemVenda {
  _key: string; produto_id: number; nome_produto: string; sku: string;
  quantidade: number; preco_lista: number; pct_desconto: number;
  preco_unitario: number; total_item: number; pct_comissao: number;
  valor_comissao: number; peso_estimado: number | null; unidade: string | null;
  // Promocao vigente no momento da adicao (piso do preco_unitario)
  preco_promo?: number | null;
  promocao_nome?: string | null;
}
interface Pagamento { _key: string; forma: string; valor: number; parcelas: number; vale_numero?: string; }
interface ParcelaRow { num: number; dias: number; data: string; valor: number; }
interface Vendedor { id_vendedor: number; nome: string; }
interface FormaEnvio { id: number; nome: string; id_api: string; }
interface FormaFrete { id: number; nome: string; codigo: string; id_api_logistica: string; }

const FORMAS_PAGAMENTO = [
  "Dinheiro", "Cartão de Crédito",
  "Vale-Troca", "Pix", "Ouro", "A Receber", "Múltiplas",
];
const GATEWAYS   = ["Mercado Pago", "PagSeguro", "Cielo", "Stone", "Getnet", "Rede", "Outro"];
const BANDEIRAS  = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outro"];
const CONDICOES  = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
// Parcelas disponíveis para MP: mínimo R$100 por parcela
function condicoesMp(valor: number) {
  const max = Math.min(12, Math.floor(valor / 100));
  return CONDICOES.filter(c => c === "À vista" || parseInt(c) <= max);
}

// formas que exibem tabela de parcelas
const COM_PARCELAS = ["Cartão de Crédito"];
// formas que exibem gateway/bandeira
const COM_CARTAO   = ["Cartão de Crédito", "Pix"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function hoje() { return new Date().toISOString().slice(0, 10); }
function uid() { return Math.random().toString(36).slice(2); }
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDateBR(iso: string) {
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}
function isoFromBR(br: string) {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}

interface Props { role: string; vendedorId: number | null; maxDesconto: number; }
const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── Autocomplete ─────────────────────────────────────────────────────────────
function Autocomplete<T>({ placeholder, onSearch, renderItem, onSelect, selectedLabel, onClear }: {
  placeholder: string; onSearch: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode; onSelect: (item: T) => void;
  selectedLabel?: string | null; onClear: () => void;
}) {
  const [q, setQ] = useState(""); const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const r = await onSearch(val); setResults(r); setOpen(true); setLoading(false);
    }, 300);
  }, [onSearch]);

  if (selectedLabel) return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border" style={{ borderColor: C.cremeBorder }}>
      <span className="text-sm" style={{ color: "#374151" }}>{selectedLabel}</span>
      <button onClick={onClear} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
    </div>
  );
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
        {loading ? <Loader2 size={13} className="animate-spin text-gray-400" /> : <Search size={13} style={{ color: "#9CA3AF" }} />}
        <input className="flex-1 outline-none text-sm" style={{ color: "#1A1A1A" }} placeholder={placeholder} value={q}
          onChange={e => { setQ(e.target.value); search(e.target.value); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg overflow-hidden bg-white" style={{ borderColor: C.cremeBorder, maxHeight: 240 }}>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {results.map((item, i) => (
              <button key={i} className="w-full text-left px-3 py-2.5 hover:bg-stone-50 text-sm border-b last:border-b-0" style={{ borderColor: C.creme }}
                onMouseDown={() => { onSelect(item); setQ(""); setOpen(false); setResults([]); }}>
                {renderItem(item)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section card (mesmo padrão da tela de detalhe) ──────────────────────────
function Section({ icon: Icon, title, children }: {
  icon: any; title: string; children: React.ReactNode;
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
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${className}`} style={{ borderColor: C.cremeBorder, color: "#374151" }} {...props} />;
}
function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${className}`} style={{ borderColor: C.cremeBorder, color: "#374151" }} {...props} />;
}
function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-6 border-b ${className}`} style={{ borderColor: C.cremeBorder }}>{children}</div>;
}
function STitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mb-4" style={{ color: "#1A1A1A" }}>{children}</h3>;
}
function DescontoValorInput({ precoLista, pctDesconto, onCommit }: {
  precoLista: number; pctDesconto: number; onCommit: (val: string) => void;
}) {
  const calculated = pctDesconto > 0 ? (precoLista * pctDesconto / 100).toFixed(2).replace(".", ",") : "";
  const [local, setLocal] = useState(calculated);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(calculated); }, [calculated, focused]);
  return (
    <input type="text" value={local}
      onChange={e => { setLocal(e.target.value); }}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onCommit(local || "0"); }}
      onKeyDown={e => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
      placeholder="0,00"
      className="w-20 border rounded px-1.5 py-1 text-sm text-right outline-none"
      style={{ borderColor: "#E8DCC8" }} />
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function NovaVendaClient({ role, vendedorId, maxDesconto }: Props) {
  const router = useRouter();
  const isFullAccess = FULL_ACCESS.includes(role);

  // Refs de dados
  const [faixas, setFaixas] = useState<FaixaComissao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [formaEnvioOpts, setFormaEnvioOpts] = useState<FormaEnvio[]>([]);
  const [formaFreteAll, setFormaFreteAll] = useState<FormaFrete[]>([]);

  // Form
  const [cliente,       setCliente]       = useState<Cliente | null>(null);
  const [vendedorSel,   setVendedorSel]   = useState<number | "">(vendedorId ?? "");
  const [dataVenda,     setDataVenda]     = useState(hoje());
  const [dataEntrega,   setDataEntrega]   = useState("");
  const [totalFrete,    setTotalFrete]    = useState(0);
  const [formaEnvioId,  setFormaEnvioId]  = useState<number | "">("");
  const [formaFreteId,  setFormaFreteId]  = useState<number | "">("");
  const [observacoes,   setObservacoes]   = useState("");
  const [obsInternas,   setObsInternas]   = useState("");

  // Vídeo
  const videoInputRef = useRef<HTMLInputElement>(null);
  const autoSavedRef  = useRef(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoObsInterna, setVideoObsInterna] = useState<string | null>(null);
  const [uploadingVideo,  setUploadingVideo]  = useState(false);
  const [videoUploadErr,  setVideoUploadErr]  = useState("");

  // Modals & delivery address
  const [showDadosCliente, setShowDadosCliente] = useState(false);
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [showEndEntrega, setShowEndEntrega] = useState(false);
  const [mesmoEndereco, setMesmoEndereco] = useState(true);
  const [endEntrega, setEndEntrega] = useState({ cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" });
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
  const [savingCliente, setSavingCliente] = useState(false);
  const [clienteErr, setClienteErr] = useState("");
  const [cpfExistente, setCpfExistente] = useState<string | null>(null);
  const cpfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingCliente, setEditingCliente] = useState(false);
  const [editClienteForm, setEditClienteForm] = useState({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });

  // Itens
  const [itens,       setItens]       = useState<ItemVenda[]>([]);
  const [produtoSel,  setProdutoSel]  = useState<Produto | null>(null);
  const [qtd,         setQtd]         = useState(1);
  const [pctDesconto, setPctDesconto] = useState(0);
  const [descontoErr, setDescontoErr] = useState("");
  const [addingItem,  setAddingItem]  = useState(false);
  const [prodTab, setProdTab] = useState<"produtos" | "comissoes">("produtos");

  // Pagamentos
  const [pagForma,       setPagForma]       = useState("Dinheiro");
  const [pagGateway,     setPagGateway]     = useState("Mercado Pago");
  const [pagBandeira,    setPagBandeira]    = useState("Outro");
  const [pagCondicao,    setPagCondicao]    = useState("À vista");
  const [parcelasRows,   setParcelasRows]   = useState<ParcelaRow[]>([]);
  // Múltiplas
  const [pagamentos,     setPagamentos]     = useState<Pagamento[]>([]);
  const [pagMultForma,   setPagMultForma]   = useState("Dinheiro");
  const [pagMultParcelas, setPagMultParcelas] = useState(1);
  const [pagValor,       setPagValor]       = useState("");

  // Vale-Troca
  const [valeNumero,      setValeNumero]      = useState("");
  const [valeValidando,   setValeValidando]   = useState(false);
  const [valeValidacao,   setValeValidacao]   = useState<{
    ok: boolean;
    erro?: string;
    valor_disponivel?: number;
    cliente_id?: number | null;
  } | null>(null);
  const [valeTrocoToast,  setValeTrocoToast]  = useState<{ numero: string; valor: number } | null>(null);

  // Submit
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState("");
  // Aprovação crédito (A Receber)
  const [aprovacaoEnviada, setAprovacaoEnviada] = useState(false);
  const [vendaIdCriada, setVendaIdCriada] = useState<number | null>(null);

  // Carregar dados de referência
  useEffect(() => {
    const { push } = useErrorStore.getState();
    fetch("/api/vendas/faixas-comissao").then(r => r.json()).then(setFaixas)
      .catch(() => push("Não foi possível carregar faixas de comissão", { level: "warning" }));
    fetch("/api/vendas/forma-envio").then(r => r.json()).then((d: { envio: FormaEnvio[]; frete: FormaFrete[] }) => {
      setFormaEnvioOpts(d.envio ?? []);
      setFormaFreteAll(d.frete ?? []);
    }).catch(() => push("Não foi possível carregar formas de envio/frete", { level: "warning" }));
    if (isFullAccess) {
      fetch("/api/vendedores").then(r => r.json()).then(setVendedores)
        .catch(() => push("Não foi possível carregar lista de vendedores", { level: "warning" }));
    } else if (vendedorId) {
      // Consultora: buscar só o próprio vendedor pra mostrar o nome
      fetch("/api/vendedores").then(r => r.json()).then((all: Vendedor[]) => {
        const proprio = all.filter(v => Number(v.id_vendedor) === vendedorId);
        if (proprio.length) setVendedores(proprio);
      }).catch(() => {});
    }
  }, [isFullAccess, vendedorId]);

  // Auto-save: ao primeiro item ou cliente, cria rascunho e redireciona para edição
  useEffect(() => {
    if (autoSavedRef.current) return;
    if (itens.length === 0 && !cliente) return;
    autoSavedRef.current = true;
    const body = montarBodyVenda();
    fetch("/api/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => r.json())
      .then((data: { id?: number; error?: string }) => {
        if (data.id) router.replace(`/vendas/${data.id}`);
        else autoSavedRef.current = false;
      })
      .catch(() => { autoSavedRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, cliente]);

  // Formas de frete disponíveis para o envio selecionado
  const formaFreteOpts = formaFreteAll.filter(f => {
    const envio = formaEnvioOpts.find(e => e.id === formaEnvioId);
    return envio ? f.id_api_logistica === envio.id_api : false;
  });

  // ── Comissão ────────────────────────────────────────────────────────────────
  function getComissao(pct: number): number {
    const faixa = faixas.find(f => f.desconto_pct === Math.round(pct));
    if (!faixa || pct > 30) return 0;
    return faixa.comissao_pct;
  }

  function calcItem(produto: Produto, q: number, pct: number): Omit<ItemVenda, "_key"> {
    const precoLista  = produto.preco_venda ?? 0;
    // Promocao ativa: piso preco_promo. pct_desconto e o desconto TOTAL (lista->unitario),
    // pode passar do maxDesconto da vendedora (e a comissao usa o pct total real).
    const temPromo = !!produto.em_promocao && produto.preco_promo != null && produto.preco_promo >= 0;
    const pctEfetivo = temPromo && precoLista > 0
      ? Math.max(pct, ((precoLista - (produto.preco_promo ?? 0)) / precoLista) * 100)
      : pct;
    const precoUnit   = precoLista * (1 - pctEfetivo / 100);
    const totalItem   = precoUnit * q;
    const pctComissao = getComissao(pctEfetivo);
    return {
      produto_id: produto.id, nome_produto: produto.nome, sku: produto.sku,
      quantidade: q, preco_lista: precoLista, pct_desconto: pctEfetivo,
      preco_unitario: precoUnit, total_item: totalItem,
      pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100,
      peso_estimado: produto.peso_precificado, unidade: produto.unidade,
      preco_promo: temPromo ? produto.preco_promo : null,
      promocao_nome: temPromo ? (produto.promocao_nome ?? null) : null,
    };
  }

  function updateItem(key: string, field: "quantidade" | "pct_desconto" | "desconto_valor", raw: string) {
    setItens(prev => prev.map(item => {
      if (item._key !== key) return item;
      // Piso de desconto vindo da promo (pct equivalente preco_promo).
      // O usuario nao pode digitar abaixo desse piso (= preco_unitario < preco_promo).
      const pctPromoMin = item.preco_promo != null && item.preco_promo > 0 && item.preco_lista > 0
        ? ((item.preco_lista - item.preco_promo) / item.preco_lista) * 100
        : 0;
      // Teto: pct adicional acima da promo limitado a maxDesconto. Quando ha promo,
      // o teto efetivo no input vendedor e pctPromoMin + maxDesconto (a vendedora pode
      // descontar ate maxDesconto ALEM do preco promo).
      const pctMax = Math.max(maxDesconto, pctPromoMin + maxDesconto);
      let q = item.quantidade;
      let pct = item.pct_desconto;
      if (field === "quantidade") q = Math.max(1, parseInt(raw) || 1);
      if (field === "pct_desconto") {
        pct = Math.max(0, parseFloat(raw.replace(",", ".")) || 0);
        pct = Math.max(pctPromoMin, Math.min(pctMax, pct));
      }
      if (field === "desconto_valor") {
        const valorDesc = parseFloat(raw.replace(",", ".")) || 0;
        const pctBruto = item.preco_lista > 0 ? (valorDesc / item.preco_lista) * 100 : 0;
        pct = Math.max(pctPromoMin, Math.min(pctMax, Math.max(0, pctBruto)));
        pct = Math.round(pct * 100) / 100;
      }
      const precoUnit = item.preco_lista * (1 - pct / 100);
      const totalItem = precoUnit * q;
      // Comissao usa o pct TOTAL real (sem clamp pelo maxDesconto) para nao
      // cair em faixa errada quando a promo ja passa de maxDesconto.
      const pctComissao = getComissao(pct);
      return { ...item, quantidade: q, pct_desconto: pct, preco_unitario: precoUnit, total_item: totalItem, pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100 };
    }));
  }

  function handleAddItem() {
    if (!produtoSel) return;
    if (pctDesconto > maxDesconto) { setDescontoErr(`Máximo: ${maxDesconto}%`); return; }
    setItens(prev => [...prev, { _key: uid(), ...calcItem(produtoSel, qtd, pctDesconto) }]);
    setProdutoSel(null); setQtd(1); setPctDesconto(0); setDescontoErr(""); setAddingItem(false);
  }

  // ── Totais (declarados antes do useEffect que depende de totalVenda) ─────────
  const totalProdutos = itens.reduce((s, i) => s + i.total_item, 0);
  const totalDesconto = itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);
  const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);
  const totalVenda    = totalProdutos + totalFrete;

  // Reset pagCondicao se ficar inválida para MP (valor baixou, parcela < R$100)
  useEffect(() => {
    if (pagGateway !== "Mercado Pago" || pagForma !== "Cartão de Crédito") return;
    const opcoes = condicoesMp(totalVenda);
    if (!opcoes.includes(pagCondicao)) setPagCondicao("À vista");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalVenda, pagGateway, pagForma]);

  // Gerar linhas de parcelas quando condição ou total mudam
  useEffect(() => {
    if (pagForma === "Múltiplas") return;
    const n = pagCondicao === "À vista" ? 1 : parseInt(pagCondicao);
    const base = totalVenda > 0 ? +(totalVenda / n).toFixed(2) : 0;
    const rows: ParcelaRow[] = Array.from({ length: n }, (_, i) => ({
      num: i + 1,
      dias: 30 * (i + 1),
      data: addDays(hoje(), 30 * (i + 1)),
      valor: i === n - 1 ? +(totalVenda - base * (n - 1)).toFixed(2) : base,
    }));
    setParcelasRows(rows);
   
  }, [pagCondicao, totalVenda, pagForma]);

  function equalizarParcelas() {
    const n = parcelasRows.length;
    if (!n) return;
    const base = +(totalVenda / n).toFixed(2);
    setParcelasRows(prev => prev.map((r, i) => ({
      ...r,
      valor: i === n - 1 ? +(totalVenda - base * (n - 1)).toFixed(2) : base,
    })));
  }

  function updateParcelaRow(i: number, field: "dias" | "data" | "valor", raw: string) {
    const tv = totalVenda;
    setParcelasRows(prev => {
      const updated = prev.map((r, idx) => {
        if (idx !== i) return r;
        if (field === "dias") {
          const d = parseInt(raw) || 0;
          return { ...r, dias: d, data: addDays(hoje(), d) };
        }
        if (field === "data") {
          if (raw.length !== 10) return { ...r, data: raw };
          const origem = new Date(hoje() + "T12:00:00");
          const destino = new Date(raw + "T12:00:00");
          const dias = Math.round((destino.getTime() - origem.getTime()) / 86400000);
          return { ...r, data: raw, dias };
        }
        return { ...r, valor: parseFloat(raw.replace(",", ".")) || 0 };
      });
      // Ao editar valor de qualquer linha exceto a última, auto-ajusta a última
      if (field === "valor" && i < updated.length - 1) {
        const sumOthers = updated.slice(0, -1).reduce((s, r) => s + r.valor, 0);
        const lastVal = +(tv - sumOthers).toFixed(2);
        updated[updated.length - 1] = { ...updated[updated.length - 1], valor: Math.max(0, lastVal) };
      }
      return updated;
    });
  }

  async function validarValeTroca() {
    if (!valeNumero.trim()) return;
    setValeValidando(true);
    setValeValidacao(null);
    try {
      const res = await fetch("/api/vale-troca/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: valeNumero.trim() }),
      });
      const d = await res.json() as {
        ok: boolean;
        erro?: string;
        valor_disponivel?: number;
        cliente_id?: number | null;
      };
      setValeValidacao(d);
    } catch {
      setValeValidacao({ ok: false, erro: "Erro ao validar" });
    } finally {
      setValeValidando(false);
    }
  }

  function handleAddPagamento() {
    const restante = +(totalVenda - pagamentos.reduce((s, p) => s + p.valor, 0)).toFixed(2);
    const v = parseFloat(pagValor.replace(",", "."));
    if (!v || v <= 0 || restante <= 0) return;
    const valorFinal = Math.min(v, restante);
    setPagamentos(prev => [...prev, { _key: uid(), forma: pagMultForma, valor: valorFinal, parcelas: pagMultForma === "Cartão de Crédito" ? pagMultParcelas : 1 }]);
    setPagValor("");
  }

  // ── Vídeo ──────────────────────────────────────────────────────────────────
  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setVideoObsInterna(null); setVideoUploadErr(""); setUploadingVideo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res  = await fetch("/api/vendas/upload-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64, mime: file.type, filename: file.name }) });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setVideoObsInterna(data.url ?? null);
    } catch (err) { setVideoUploadErr(err instanceof Error ? err.message : "Erro ao enviar vídeo"); }
    finally { setUploadingVideo(false); }
  }
  function handleRemoveVideo() {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null); setVideoObsInterna(null); setVideoUploadErr("");
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  const totalPago     = pagamentos.reduce((s, p) => s + p.valor, 0);
  // Pagamento cobre o total? (Múltiplas: soma dos pagamentos; simples: sempre cobre)
  const pagamentoCobre = pagForma === "Múltiplas" ? Math.abs(totalPago - totalVenda) < 0.01 : true;

  // ── CEP lookup ──────────────────────────────────────────────────────────────
  async function buscaCEP(cep: string, target: "entrega" | "novoCliente") {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data.erro) return;
      if (target === "entrega") {
        setEndEntrega(prev => ({ ...prev, logradouro: data.logradouro ?? "", bairro: data.bairro ?? "", cidade: data.localidade ?? "", uf: data.uf ?? "" }));
      } else {
        setNovoClienteForm(prev => ({ ...prev, endereco: data.logradouro ?? "", bairro: data.bairro ?? "", municipio: data.localidade ?? "", uf: data.uf ?? "" }));
      }
    } catch { /* silent */ }
  }

  // ── Edit existing client ────────────────────────────────────────────────────
  function startEditCliente() {
    if (!cliente) return;
    setEditClienteForm({
      nome: cliente.nome ?? "", cpf_cnpj: cliente.cpf_cnpj ?? "", email: cliente.email ?? "",
      telefone: cliente.telefone ?? "", celular: cliente.celular ?? "", cep: cliente.cep ?? "",
      endereco: cliente.endereco ?? "", numero: cliente.numero ?? "", complemento: cliente.complemento ?? "",
      bairro: cliente.bairro ?? "", municipio: cliente.municipio ?? "", uf: cliente.uf ?? "",
    });
    setEditingCliente(true);
  }

  async function handleSalvarCliente() {
    if (!cliente) return;
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cliente.id, ...editClienteForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCliente({ ...cliente, ...data });
      setEditingCliente(false);
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSavingCliente(false); }
  }

  // ── Verificar CPF duplicado ─────────────────────────────────────────────────
  function checkCpfDuplicado(cpf: string) {
    setCpfExistente(null);
    const limpo = cpf.replace(/\D/g, "");
    if (limpo.length < 11) return;
    if (cpfTimer.current) clearTimeout(cpfTimer.current);
    cpfTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(limpo)}&limit=1`);
        const data = await res.json() as Cliente[];
        const found = data.find(c => c.cpf_cnpj?.replace(/\D/g, "") === limpo);
        setCpfExistente(found ? found.nome : null);
      } catch { /* silent */ }
    }, 400);
  }

  // ── Create new client ──────────────────────────────────────────────────────
  async function handleCriarCliente() {
    if (!novoClienteForm.nome.trim()) { setClienteErr("Nome é obrigatório"); return; }
    if (cpfExistente) { setClienteErr(`CPF/CNPJ já cadastrado para: ${cpfExistente}`); return; }
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoClienteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCliente({ id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, email: data.email, telefone: data.telefone, celular: data.celular, endereco: data.endereco, numero: data.numero, complemento: data.complemento, bairro: data.bairro, municipio: data.municipio, cep: data.cep, uf: data.uf });
      setShowNovoCliente(false);
      setNovoClienteForm({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao criar cliente"); }
    finally { setSavingCliente(false); }
  }

  // ── Monta body de criação de venda (compartilhado entre submit e salvar rascunho Pix) ──
  function montarBodyVenda() {
    const envioNome = formaEnvioOpts.find(e => e.id === formaEnvioId)?.nome ?? "";
    const freteNome = formaFreteAll.find(f => f.id === formaFreteId)?.nome ?? "";
    return {
      cliente_id: cliente?.id ?? null,
      vendedor_id: vendedorSel || null,
      data_entrega: dataEntrega || null,
      total_frete: totalFrete,
      forma_envio: envioNome || null,
      forma_frete: freteNome || null,
      observacoes: observacoes || null,
      observacoes_internas: obsInternas || null,
      video_obs_interna: videoObsInterna,
      ...(!mesmoEndereco && showEndEntrega ? {
        endereco_entrega: endEntrega.logradouro || null,
        endereco_entrega_numero: endEntrega.numero || null,
        endereco_entrega_complemento: endEntrega.complemento || null,
        endereco_entrega_bairro: endEntrega.bairro || null,
        endereco_entrega_cidade: endEntrega.cidade || null,
        endereco_entrega_cep: endEntrega.cep || null,
        endereco_entrega_uf: endEntrega.uf || null,
      } : {}),
      itens: itens.map(i => ({
        produto_id: i.produto_id, nome_produto: i.nome_produto, sku: i.sku,
        quantidade: i.quantidade, preco_lista: i.preco_lista, pct_desconto: i.pct_desconto,
        preco_unitario: i.preco_unitario, total_item: i.total_item,
        pct_comissao: i.pct_comissao, valor_comissao: i.valor_comissao, peso_estimado: i.peso_estimado,
      })),
    };
  }

  // ── Salvar rascunho e retornar id (pro PixQrInline chamar criar-link) ───
  async function salvarRascunhoParaPix(): Promise<{ id: number; numero_venda: string }> {
    if (itens.length === 0) throw new Error("Adicione ao menos 1 item antes de gerar o QR Code");
    if (totalVenda <= 0) throw new Error("Total da venda deve ser maior que zero");

    // NÃO inclui pagamentos — o criar-link vai criar o pagamento MP separadamente
    const body = montarBodyVenda();
    const res = await fetch("/api/vendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { id: number; numero_venda: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return { id: data.id, numero_venda: data.numero_venda };
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  // Detectar se pagamentos incluem "A Receber"
  const temAReceberNova = pagForma === "A Receber" || (pagForma === "Múltiplas" && pagamentos.some(p => p.forma === "A Receber"));

  function montarBody() {
    const envioNome  = formaEnvioOpts.find(e => e.id === formaEnvioId)?.nome ?? "";
    const freteNome  = formaFreteAll.find(f => f.id === formaFreteId)?.nome ?? "";
    return {
      cliente_id: cliente?.id ?? null,
      vendedor_id: vendedorSel || null,
      data_entrega: dataEntrega || null,
      total_frete: totalFrete,
      forma_envio: envioNome || null,
      forma_frete: freteNome || null,
      observacoes: observacoes || null,
      observacoes_internas: obsInternas || null,
      video_obs_interna: videoObsInterna,
      ...(!mesmoEndereco && showEndEntrega ? {
        endereco_entrega: endEntrega.logradouro || null,
        endereco_entrega_numero: endEntrega.numero || null,
        endereco_entrega_complemento: endEntrega.complemento || null,
        endereco_entrega_bairro: endEntrega.bairro || null,
        endereco_entrega_cidade: endEntrega.cidade || null,
        endereco_entrega_cep: endEntrega.cep || null,
        endereco_entrega_uf: endEntrega.uf || null,
      } : {}),
      itens: itens.map(i => ({
        produto_id: i.produto_id, nome_produto: i.nome_produto, sku: i.sku,
        quantidade: i.quantidade, preco_lista: i.preco_lista, pct_desconto: i.pct_desconto,
        preco_unitario: i.preco_unitario, total_item: i.total_item,
        pct_comissao: i.pct_comissao, valor_comissao: i.valor_comissao, peso_estimado: i.peso_estimado,
      })),
      pagamentos: pagForma === "Múltiplas"
        ? pagamentos
            // Vale-Troca eh inserido via /pagamentos route (precisa de vale_numero)
            .filter(p => p.forma !== "Vale-Troca")
            .map(p => ({ forma: p.forma, valor: p.valor, parcelas: p.parcelas, status: "pendente" }))
        : pagForma === "Vale-Troca"
        ? [] // Vale-Troca simples tambem vai via /pagamentos route
        : [{
            forma: pagForma,
            valor: totalVenda,
            parcelas: pagCondicao === "À vista" ? 1 : parseInt(pagCondicao),
            gateway: COM_CARTAO.includes(pagForma) ? pagGateway : null,
            bandeira: COM_CARTAO.includes(pagForma) ? pagBandeira : null,
            status: "pendente",
          }],
    };
  }

  // Apos criar venda, aplica Vale-Troca via /api/vendas/[id]/pagamentos
  async function aplicarValeNaVenda(vendaId: number, valor: number, numero?: string): Promise<void> {
    const res = await fetch(`/api/vendas/${vendaId}/pagamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forma: "Vale-Troca",
        valor,
        vale_numero: (numero ?? valeNumero).trim(),
      }),
    });
    const data = await res.json() as {
      novo_vale?: { id: number; numero: string; valor_original: number };
      precisa_complemento?: boolean;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (data.novo_vale) {
      setValeTrocoToast({ numero: data.novo_vale.numero, valor: data.novo_vale.valor_original });
    }
  }

  async function submit(situacao: "rascunho" | "aprovado") {
    setSaving(true); setSaveErr("");
    try {
      // Se forma = Vale-Troca, exige validacao previa
      const pagValeItem = pagForma === "Múltiplas" ? pagamentos.find(p => p.forma === "Vale-Troca") : null;
      const usaVale = pagForma === "Vale-Troca" || !!pagValeItem;
      // Numero do vale: no modo direto usa estado; no modo Múltiplas usa o salvo no item
      const valeNumeroFinal = pagForma === "Vale-Troca" ? valeNumero.trim() : (pagValeItem?.vale_numero ?? "");
      if (usaVale) {
        if (!valeNumeroFinal) throw new Error("Numero do vale-troca obrigatorio");
        if (pagForma === "Vale-Troca" && !valeValidacao?.ok) throw new Error("Vale-troca nao validado — clique em Validar antes de salvar");
      }

      const body = montarBody();
      const res  = await fetch("/api/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { id: number; numero_venda: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Aplicar Vale-Troca na venda recem-criada
      if (usaVale) {
        // Validacao: Vale-Troca direto deve cobrir o total; caso contrário usar Múltiplas
        if (
          pagForma === "Vale-Troca" &&
          valeValidacao?.ok &&
          valeValidacao.valor_disponivel !== undefined &&
          valeValidacao.valor_disponivel < totalVenda
        ) {
          throw new Error(`Saldo do vale insuficiente (${fmt(valeValidacao.valor_disponivel)}). Use "Múltiplas" para combinar com outro pagamento.`);
        }
        const valorVale = pagValeItem ? pagValeItem.valor : totalVenda;
        await aplicarValeNaVenda(data.id, valorVale, valeNumeroFinal);
      }

      if (situacao === "aprovado") {
        if (temAReceberNova) {
          // Tem A Receber → solicitar aprovação de crédito (não aprovar direto)
          const apRes = await fetch(`/api/vendas/${data.id}/solicitar-aprovacao`, { method: "POST" });
          const apData = await apRes.json();
          if (!apRes.ok) throw new Error(apData.error ?? "Erro ao solicitar aprovação");
          // Redirecionar para detalhe da venda (mostra banner de aguardando aprovação)
          router.push(`/vendas/${data.id}`);
          return;
        }
        // Sem A Receber → aprovar direto (fluxo normal)
        await fetch(`/api/vendas/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ situacao: "aprovado" }) });
      }

      // Se houve troco, mostrar toast antes de redirecionar
      if (valeTrocoToast) {
        setTimeout(() => router.push(`/vendas/${data.id}`), 3000);
        return;
      }

      router.push(`/vendas/${data.id}`);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao salvar venda"); }
    finally { setSaving(false); }
  }

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="px-3 md:px-6 py-4 md:py-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full" style={{ backgroundColor: C.esmeralda }} />
            <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "#1A1A1A" }}>
              Nova Venda
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
              Rascunho
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: C.cremeBorder }}>

        {/* ── 1. Cliente + Vendedor ── */}
        <Secao>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label required>Cliente</Label>
              <Autocomplete<Cliente>
                placeholder="Digite para buscar cliente (nome, CPF/CNPJ, telefone)..."
                onSearch={async q => { const r = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(q)}`); return r.json(); }}
                renderItem={c => (
                  <div>
                    <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{c.nome}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      {c.cpf_cnpj ? maskCpfCnpj(c.cpf_cnpj) : (c.telefone ?? "—")}
                    </p>
                  </div>
                )}
                onSelect={setCliente}
                selectedLabel={cliente ? `${cliente.nome}${cliente.cpf_cnpj ? ` · ${maskCpfCnpj(cliente.cpf_cnpj)}` : ""}` : null}
                onClear={() => setCliente(null)}
              />
              {cliente && (
                <>
                  <p className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>
                    {[cliente.email, cliente.telefone].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setShowDadosCliente(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <FileText size={12} /> Dados
                    </button>
                    <button type="button" onClick={() => setShowNovoCliente(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <UserPlus size={12} /> Novo Cliente
                    </button>
                    <button type="button" onClick={() => setShowEndEntrega(!showEndEntrega)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: showEndEntrega ? C.esmeralda : C.cremeBorder, color: C.esmeralda, backgroundColor: showEndEntrega ? C.esmeraldaLt : "transparent" }}>
                      <MapPin size={12} /> End. Entrega
                    </button>
                  </div>
                </>
              )}
              {!cliente && (
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setShowNovoCliente(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                    <UserPlus size={12} /> Novo Cliente
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label required>Vendedor</Label>
              {isFullAccess ? (
                <Select value={vendedorSel} onChange={e => setVendedorSel(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Selecione um vendedor</option>
                  {vendedores.map(v => <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>)}
                </Select>
              ) : (
                <div className="border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: C.cremeBg }}>
                  {vendedores.find(v => Number(v.id_vendedor) === vendedorId)?.nome ?? "—"}
                </div>
              )}
            </div>
          </div>
        </Secao>

        {/* ── Endereço de Entrega (expandível) ── */}
        {showEndEntrega && (
          <Secao>
            <div className="flex items-center justify-between mb-4">
              <STitle>Endereço de Entrega</STitle>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#374151" }}>
                <input type="checkbox" checked={mesmoEndereco} onChange={e => setMesmoEndereco(e.target.checked)} className="rounded border-gray-300" />
                Mesmo do cliente
              </label>
            </div>
            {mesmoEndereco && cliente ? (
              <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                {[cliente.endereco, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.uf, cliente.cep].filter(Boolean).join(", ") || "Endereço não cadastrado no cliente"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div><Label required>CEP</Label><Input value={endEntrega.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setEndEntrega(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "entrega"); }} /></div>
                <div className="md:col-span-2"><Label required>Logradouro</Label><Input value={endEntrega.logradouro} onChange={e => setEndEntrega(p => ({ ...p, logradouro: e.target.value }))} /></div>
                <div><Label required>Número</Label><Input value={endEntrega.numero} onChange={e => setEndEntrega(p => ({ ...p, numero: e.target.value }))} /></div>
                <div><Label>Complemento</Label><Input value={endEntrega.complemento} onChange={e => setEndEntrega(p => ({ ...p, complemento: e.target.value }))} /></div>
                <div><Label required>Bairro</Label><Input value={endEntrega.bairro} onChange={e => setEndEntrega(p => ({ ...p, bairro: e.target.value }))} /></div>
                <div><Label required>Cidade</Label><Input value={endEntrega.cidade} onChange={e => setEndEntrega(p => ({ ...p, cidade: e.target.value }))} /></div>
                <div><Label required>UF</Label><Input value={endEntrega.uf} maxLength={2} onChange={e => setEndEntrega(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
              </div>
            )}
          </Secao>
        )}

        {/* ── Modal: Dados do Cliente ── */}
        {showDadosCliente && cliente && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowDadosCliente(false); setEditingCliente(false); }}>
            <div className="bg-white rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
                <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>{editingCliente ? "Editar Cliente" : "Dados do Cliente"}</h3>
                <button onClick={() => { setShowDadosCliente(false); setEditingCliente(false); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                {editingCliente ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label required>Nome</Label><Input value={editClienteForm.nome} onChange={e => setEditClienteForm(p => ({ ...p, nome: e.target.value }))} /></div>
                      <div><Label>CPF/CNPJ</Label><Input value={editClienteForm.cpf_cnpj} onChange={e => setEditClienteForm(p => ({ ...p, cpf_cnpj: e.target.value }))} /></div>
                      <div><Label>Email</Label><Input type="email" value={editClienteForm.email} onChange={e => setEditClienteForm(p => ({ ...p, email: e.target.value }))} /></div>
                      <div><Label>Telefone</Label><Input value={editClienteForm.telefone} onChange={e => setEditClienteForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                      <div><Label>Celular</Label><Input value={editClienteForm.celular} onChange={e => setEditClienteForm(p => ({ ...p, celular: e.target.value }))} /></div>
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço de Cobrança</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div><Label>CEP</Label><Input value={editClienteForm.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setEditClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }} /></div>
                        <div className="md:col-span-2"><Label>Logradouro</Label><Input value={editClienteForm.endereco} onChange={e => setEditClienteForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                        <div><Label>Número</Label><Input value={editClienteForm.numero} onChange={e => setEditClienteForm(p => ({ ...p, numero: e.target.value }))} /></div>
                        <div><Label>Complemento</Label><Input value={editClienteForm.complemento} onChange={e => setEditClienteForm(p => ({ ...p, complemento: e.target.value }))} /></div>
                        <div><Label>Bairro</Label><Input value={editClienteForm.bairro} onChange={e => setEditClienteForm(p => ({ ...p, bairro: e.target.value }))} /></div>
                        <div><Label>Cidade</Label><Input value={editClienteForm.municipio} onChange={e => setEditClienteForm(p => ({ ...p, municipio: e.target.value }))} /></div>
                        <div><Label>UF</Label><Input value={editClienteForm.uf} maxLength={2} onChange={e => setEditClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                      </div>
                    </div>
                    {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
                  </>
                ) : (
                  <div className="text-sm space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Nome</span><p style={{ color: "#1A1A1A" }}>{cliente.nome}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>CPF/CNPJ</span><p className="font-mono" style={{ color: "#1A1A1A" }}>{cliente.cpf_cnpj ? maskCpfCnpj(cliente.cpf_cnpj) : "—"}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Email</span><p style={{ color: "#1A1A1A" }}>{cliente.email || "—"}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Telefone</span><p style={{ color: "#1A1A1A" }}>{cliente.telefone || "—"}</p></div>
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço de Cobrança</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Logradouro</span><p style={{ color: "#1A1A1A" }}>{cliente.endereco || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Número</span><p style={{ color: "#1A1A1A" }}>{cliente.numero || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Bairro</span><p style={{ color: "#1A1A1A" }}>{cliente.bairro || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Cidade</span><p style={{ color: "#1A1A1A" }}>{cliente.municipio || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>CEP</span><p style={{ color: "#1A1A1A" }}>{cliente.cep || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>UF</span><p style={{ color: "#1A1A1A" }}>{cliente.uf || "—"}</p></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.cremeBorder }}>
                {editingCliente ? (
                  <>
                    <button onClick={() => setEditingCliente(false)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                    <button onClick={handleSalvarCliente} disabled={savingCliente} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      {savingCliente ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Salvar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={startEditCliente} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button onClick={() => setShowDadosCliente(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: C.esmeralda, color: C.creme }}>Fechar</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Novo Cliente ── */}
        {showNovoCliente && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNovoCliente(false)}>
            <div className="bg-white rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
                <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Novo Cliente</h3>
                <button onClick={() => setShowNovoCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label required>Nome</Label><Input value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({ ...p, nome: e.target.value }))} /></div>
                  <div>
                    <Label>CPF/CNPJ</Label>
                    <Input value={novoClienteForm.cpf_cnpj} onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cpf_cnpj: v })); checkCpfDuplicado(v); }}
                      style={{ borderColor: cpfExistente ? "#EF4444" : C.cremeBorder }} />
                    {cpfExistente && <p className="text-xs text-red-500 mt-1">Já cadastrado: {cpfExistente}</p>}
                  </div>
                  <div><Label>Email</Label><Input type="email" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                  <div><Label>Celular</Label><Input value={novoClienteForm.celular} onChange={e => setNovoClienteForm(p => ({ ...p, celular: e.target.value }))} /></div>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div><Label>CEP</Label><Input value={novoClienteForm.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }} /></div>
                    <div className="md:col-span-2"><Label>Logradouro</Label><Input value={novoClienteForm.endereco} onChange={e => setNovoClienteForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                    <div><Label>Número</Label><Input value={novoClienteForm.numero} onChange={e => setNovoClienteForm(p => ({ ...p, numero: e.target.value }))} /></div>
                    <div><Label>Complemento</Label><Input value={novoClienteForm.complemento} onChange={e => setNovoClienteForm(p => ({ ...p, complemento: e.target.value }))} /></div>
                    <div><Label>Bairro</Label><Input value={novoClienteForm.bairro} onChange={e => setNovoClienteForm(p => ({ ...p, bairro: e.target.value }))} /></div>
                    <div><Label>Cidade</Label><Input value={novoClienteForm.municipio} onChange={e => setNovoClienteForm(p => ({ ...p, municipio: e.target.value }))} /></div>
                    <div><Label>UF</Label><Input value={novoClienteForm.uf} maxLength={2} onChange={e => setNovoClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                  </div>
                </div>
                {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
              </div>
              <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.cremeBorder }}>
                <button onClick={() => setShowNovoCliente(false)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                <button onClick={handleCriarCliente} disabled={savingCliente} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  {savingCliente ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 2. Detalhes da Venda ── */}
        <Secao>
          <STitle>Detalhes da Venda</STitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label required>Data da Venda</Label>
              <Input type="date" value={dataVenda} onChange={e => setDataVenda(e.target.value)} />
            </div>
            <div>
              <Label>Data de Entrega</Label>
              <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
            </div>
            <div>
              <Label>Frete (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#9CA3AF" }}>R$</span>
                <input type="number" min={0} step={0.01} value={totalFrete || ""}
                  onChange={e => setTotalFrete(Number(e.target.value) || 0)}
                  placeholder="0,00"
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }} />
              </div>
            </div>
          </div>
        </Secao>

        {/* ── 3. Produtos / Comissões ── */}
        <Secao>
          <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
            {(["produtos", "comissoes"] as const).map(tab => (
              <button key={tab} onClick={() => setProdTab(tab)}
                className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={{ backgroundColor: prodTab === tab ? "#fff" : "transparent", color: prodTab === tab ? C.esmeralda : "#6B7280",
                  boxShadow: prodTab === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                {tab === "produtos" ? "Produtos" : "Comissões"}
              </button>
            ))}
          </div>

          {prodTab === "produtos" && (
            <>
              <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.cremeBorder }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Nº", "Descrição", "Código (SKU)", "Qtde", "UN", "Preço lista", "% Desc", "R$ Desc", "Preço un", "Preço total", ""].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.length === 0 && !addingItem && (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Nenhum produto adicionado</td></tr>
                    )}
                    {itens.map((item, idx) => (
                      <tr key={item._key} className="border-t hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-3 py-2.5 text-xs tabular-nums" style={{ color: "#9CA3AF" }}>{idx + 1}</td>
                        <td className="px-3 py-2.5 max-w-[180px] truncate font-medium" style={{ color: "#1A1A1A" }}>
                          <span>
                            {item.nome_produto}
                            {item.preco_promo != null && (
                              <BadgePromo campanha={item.promocao_nome} className="ml-1.5 align-middle" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{item.sku}</td>
                        <td className="px-3 py-2.5">
                          <input type="number" min={1} value={item.quantidade}
                            onChange={e => updateItem(item._key, "quantidade", e.target.value)}
                            className="w-14 border rounded px-1.5 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "#9CA3AF" }}>{item.unidade ?? "un"}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_lista)}</td>
                        <td className="px-3 py-2.5">
                          {(() => {
                            const pctPromoMin = item.preco_promo != null && item.preco_promo > 0 && item.preco_lista > 0
                              ? ((item.preco_lista - item.preco_promo) / item.preco_lista) * 100
                              : 0;
                            const atingiuPisoPromo = pctPromoMin > 0 && item.pct_desconto <= pctPromoMin + 0.01;
                            return (
                              <input type="number" min={0} step={0.01}
                                value={item.pct_desconto || ""}
                                onChange={e => updateItem(item._key, "pct_desconto", e.target.value || "0")}
                                placeholder="0"
                                title={pctPromoMin > 0 ? `Promo${item.promocao_nome ? ` ${item.promocao_nome}` : ""} - piso ${fmt(item.preco_promo ?? 0)} (${pctPromoMin.toFixed(2)}%)` : undefined}
                                className="w-20 border rounded px-1.5 py-1 text-sm text-center outline-none"
                                style={{
                                  borderColor: atingiuPisoPromo ? "#059669" : C.cremeBorder,
                                  color: atingiuPisoPromo ? "#059669" : undefined,
                                }} />
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2.5">
                          <DescontoValorInput
                            precoLista={item.preco_lista}
                            pctDesconto={item.pct_desconto}
                            onCommit={val => updateItem(item._key, "desconto_valor", val)}
                          />
                        </td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_unitario)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(item.total_item)}</td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))}
                            className="text-gray-300 hover:text-red-400 transition-colors">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add item panel */}
              {addingItem && (
                <div className="mb-3 p-4 rounded-xl border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium" style={{ color: "#374151" }}>Adicionar produto</p>
                    <button onClick={() => { setAddingItem(false); setProdutoSel(null); setDescontoErr(""); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                  <Autocomplete<Produto>
                    placeholder="Buscar por nome ou SKU..."
                    onSearch={async q => { const r = await fetch(`/api/vendas/produtos/busca?q=${encodeURIComponent(q)}&limit=15`); return r.json(); }}
                    renderItem={p => (
                      <div>
                        <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{p.nome}</p>
                        <p className="text-xs" style={{ color: "#9CA3AF" }}>{p.sku} · {p.preco_venda != null ? fmt(p.preco_venda) : "sem preço"}</p>
                      </div>
                    )}
                    onSelect={p => { setProdutoSel(p); setPctDesconto(0); setDescontoErr(""); }}
                    selectedLabel={produtoSel ? `${produtoSel.nome} · ${fmt(produtoSel.preco_venda ?? 0)}` : null}
                    onClear={() => { setProdutoSel(null); setDescontoErr(""); }}
                  />
                  {produtoSel && (
                    <div className="mt-3 grid grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Qtd</label>
                        <input type="number" min={1} value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center" style={{ borderColor: C.cremeBorder }} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>% Desconto <span style={{ color: "#9CA3AF" }}>(máx {maxDesconto}%)</span></label>
                        <input type="number" min={0} max={maxDesconto} step={1} value={pctDesconto}
                          onChange={e => { const v = Number(e.target.value) || 0; setPctDesconto(v); setDescontoErr(v > maxDesconto ? `Máximo: ${maxDesconto}%` : ""); }}
                          onBlur={e => { if (e.target.value === "") setPctDesconto(0); }}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                          style={{ borderColor: descontoErr ? "#EF4444" : C.cremeBorder }} />
                        {descontoErr && <p className="text-[11px] text-red-500 mt-0.5">{descontoErr}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Preço un</label>
                        <div className="border rounded-lg px-2 py-1.5 text-sm text-center tabular-nums" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: C.esmeralda }}>
                          {fmt(calcItem(produtoSel, qtd, pctDesconto).preco_unitario)}
                        </div>
                      </div>
                      <button onClick={handleAddItem} disabled={!!descontoErr || pctDesconto > maxDesconto}
                        className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                        <Plus size={14} /> Confirmar
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button onClick={() => setAddingItem(true)} disabled={addingItem}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                <Plus size={14} /> adicionar outro item
              </button>

              {itens.length > 0 && (
                <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: C.cremeBorder }}>
                  <span className="text-sm" style={{ color: "#6B7280" }}>{itens.length} produto{itens.length > 1 ? "s" : ""}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalProdutos)}</span>
                </div>
              )}
            </>
          )}

          {prodTab === "comissoes" && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.cremeBg }}>
                  <tr>
                    {["Nº", "Produto", "SKU", "Qtde", "Preço Total", "% Comissão", "Valor Comissão"].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Nenhum produto</td></tr>
                  ) : itens.map((item, idx) => (
                    <tr key={item._key} className="border-t" style={{ borderColor: C.cremeBorder }}>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "#9CA3AF" }}>{idx + 1}</td>
                      <td className="px-3 py-2.5 max-w-[180px] truncate" style={{ color: "#1A1A1A" }}>{item.nome_produto}</td>
                      <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{item.sku}</td>
                      <td className="px-3 py-2.5 text-center" style={{ color: "#374151" }}>{item.quantidade}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium" style={{ color: C.esmeralda }}>{fmt(item.total_item)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "#059669" }}>{item.pct_comissao.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: "#059669" }}>{fmt(item.valor_comissao)}</td>
                    </tr>
                  ))}
                  {itens.length > 0 && (
                    <tr className="border-t" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                      <td colSpan={6} className="px-3 py-2.5 text-sm font-semibold text-right" style={{ color: "#374151" }}>Total comissão:</td>
                      <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: "#059669" }}>{fmt(totalComissao)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        {/* ── 4. Pagamento ── */}
        <Secao>
          <STitle>Pagamento</STitle>
          <p className="text-sm mb-4" style={{ color: "#6B7280" }}>Selecione a forma de recebimento do valor total</p>

          {itens.length === 0 ? (
            <div className="rounded-lg border px-4 py-6 text-sm text-center" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
              Adicione produtos para configurar o pagamento
            </div>
          ) : (<>

          {/* Forma de recebimento */}
          <div className="mb-4">
            <Label>Forma de recebimento</Label>
            <Select value={pagForma} onChange={e => { setPagForma(e.target.value); setPagCondicao("À vista"); }} className="w-56">
              <optgroup label="Métodos de Pagamento">
                {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
              </optgroup>
            </Select>
          </div>

          {/* Dinheiro / Ouro — simples */}
          {["Dinheiro", "Ouro"].includes(pagForma) && (
            <div className="rounded-lg border px-4 py-3 text-sm mb-4" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
              Pagamento em {pagForma.toLowerCase()}. Não há campos adicionais necessários.
            </div>
          )}

          {/* A Receber simples — botão solicitar aprovação direto */}
          {pagForma === "A Receber" && totalVenda > 0 && (
            <div className="rounded-xl border p-4 mb-4 space-y-2" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
              <p className="text-sm font-medium" style={{ color: "#374151" }}>
                A Receber — {fmt(totalVenda)}
              </p>
              {aprovacaoEnviada ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
                    Aprovação solicitada
                  </span>
                  <button onClick={() => router.push(`/vendas/${vendaIdCriada}`)}
                    className="text-xs underline" style={{ color: C.esmeralda }}>
                    Ver venda
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setSaving(true); setSaveErr("");
                    try {
                      if (!cliente) throw new Error("Selecione um cliente");
                      if (itens.length === 0) throw new Error("Adicione ao menos 1 item");
                      const body = montarBody();
                      const res = await fetch("/api/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                      const data = await res.json() as { id: number; error?: string };
                      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                      const apRes = await fetch(`/api/vendas/${data.id}/solicitar-aprovacao`, { method: "POST" });
                      const apData = await apRes.json();
                      if (!apRes.ok) throw new Error(apData.error ?? "Erro ao solicitar aprovação");
                      setVendaIdCriada(data.id);
                      setAprovacaoEnviada(true);
                    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro"); }
                    finally { setSaving(false); }
                  }}
                  disabled={saving || itens.length === 0 || !cliente || vendedorSel === "" || formaEnvioId === ""}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#D97706", color: "#fff" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Solicitar Aprovação
                </button>
              )}
            </div>
          )}

          {/* Aviso crédito gerente quando A Receber */}
          {(pagForma === "A Receber" || pagForma === "Múltiplas") && (
            <div className="rounded-lg border px-4 py-3 text-xs mb-4"
              style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
              Vendas com &quot;A Receber&quot; requerem aprovação do gerente de loja.
              Se o valor exceder o saldo disponível, será encaminhado ao diretor e a comissão será zerada.
            </div>
          )}

          {/* Cartão Crédito — gateway + condição */}
          {COM_CARTAO.includes(pagForma) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Gateway</Label>
                <Select value={pagGateway} onChange={e => setPagGateway(e.target.value)}>
                  {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
              </div>
              {pagForma === "Cartão de Crédito" && (
                <div>
                  <Label>Condição de Pagamento</Label>
                  <Select value={pagCondicao} onChange={e => setPagCondicao(e.target.value)}>
                    {(pagGateway === "Mercado Pago" ? condicoesMp(totalVenda) : CONDICOES).map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Ouro / A Receber / Pix / Vale-Troca — só condição */}
          {COM_PARCELAS.includes(pagForma) && !COM_CARTAO.includes(pagForma) && pagForma !== "Dinheiro" && pagForma !== "Vale-Troca" && (
            <div className="mb-4 w-56">
              <Label>Condição de Pagamento</Label>
              <Select value={pagCondicao} onChange={e => setPagCondicao(e.target.value)}>
                {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          )}

          {/* Vale-Troca — input + validar */}
          {pagForma === "Vale-Troca" && totalVenda > 0 && (
            <div
              className="rounded-xl border p-4 mb-4 space-y-3"
              style={{ borderColor: C.cremeBorder, backgroundColor: C.esmeraldaLt }}
            >
              <div className="flex items-center gap-2">
                <Ticket size={16} style={{ color: C.esmeralda }} />
                <span className="text-sm font-medium" style={{ color: C.esmeralda }}>
                  Informe o numero do Vale-Troca
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={valeNumero}
                  onChange={e => {
                    setValeNumero(e.target.value);
                    setValeValidacao(null);
                  }}
                  placeholder="VT-00001"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }}
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), validarValeTroca())}
                />
                <button
                  type="button"
                  onClick={validarValeTroca}
                  disabled={!valeNumero.trim() || valeValidando}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}
                >
                  {valeValidando ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
                </button>
              </div>
              {valeValidacao && (
                <div
                  className="rounded-lg border p-3 flex items-start gap-2"
                  style={{
                    borderColor: valeValidacao.ok ? "#A7F3D0" : "#FECACA",
                    backgroundColor: valeValidacao.ok ? "#ECFDF5" : "#FEF2F2",
                  }}
                >
                  {valeValidacao.ok ? (
                    <CheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#065F46" }} />
                  ) : (
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#991B1B" }} />
                  )}
                  <div className="text-xs flex-1" style={{ color: valeValidacao.ok ? "#065F46" : "#991B1B" }}>
                    <p className="font-medium">
                      {valeValidacao.ok ? "Vale-troca valido" : (valeValidacao.erro ?? "Vale invalido")}
                    </p>
                    {valeValidacao.ok && valeValidacao.valor_disponivel !== undefined && (
                      <>
                        <p className="mt-0.5">
                          Saldo disponivel: <strong>{fmt(valeValidacao.valor_disponivel)}</strong>
                          {valeValidacao.valor_disponivel > totalVenda && (
                            <span className="ml-2">
                              — troco (vale novo): <strong>{fmt(valeValidacao.valor_disponivel - totalVenda)}</strong>
                            </span>
                          )}
                        </p>
                        {valeValidacao.valor_disponivel < totalVenda && (
                          <p className="mt-1.5 font-semibold" style={{ color: "#B45309" }}>
                            Saldo insuficiente — faltam {fmt(totalVenda - valeValidacao.valor_disponivel)}.
                            Selecione &quot;Múltiplas&quot; como forma de pagamento para combinar o vale com outro método.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QR Code Pix via Mercado Pago (quando forma=Pix) */}
          {pagForma === "Pix" && totalVenda > 0 && (
            <PixQrInline
              vendaId={null}
              numeroVenda="Nova"
              valor={totalVenda}
              endpoint="criar-pix-instore"
              obterVendaId={salvarRascunhoParaPix}
              onPagamentoConfirmado={(vendaIdConfirmado) => {
                router.push(`/vendas/${vendaIdConfirmado}`);
              }}
            />
          )}

          {/* Cartão de Crédito via Mercado Pago (link ou maquininha) */}
          {pagForma === "Cartão de Crédito" && totalVenda > 0 && (
            <CartaoInline
              vendaId={null}
              numeroVenda="Nova"
              valor={totalVenda}
              installments={pagCondicao === "À vista" ? 1 : parseInt(pagCondicao) || 1}
              obterVendaId={salvarRascunhoParaPix}
              onPagamentoConfirmado={(vendaIdConfirmado) => {
                router.push(`/vendas/${vendaIdConfirmado}`);
              }}
            />
          )}


          {/* Múltiplas */}
          {pagForma === "Múltiplas" && (() => {
            const totalMult = pagamentos.reduce((s, p) => s + p.valor, 0);
            const restante  = +(totalVenda - totalMult).toFixed(2);
            return (
              <div className="mb-4">
                <div className="flex flex-wrap items-end gap-2 mb-3">
                  <div className="flex-1 min-w-36">
                    <Label>Forma</Label>
                    <Select value={pagMultForma} onChange={e => { setPagMultForma(e.target.value); setPagMultParcelas(1); setValeValidacao(null); setValeNumero(""); setPagValor(""); }}>
                      <optgroup label="Métodos de Pagamento">
                        {FORMAS_PAGAMENTO.filter(f => f !== "Múltiplas").map(f => <option key={f} value={f}>{f}</option>)}
                      </optgroup>
                    </Select>
                  </div>
                  {pagMultForma === "Vale-Troca" ? (
                    /* Vale-Troca: input do número + Validar substituem o campo de valor */
                    <div className="flex-1 min-w-48 flex gap-2">
                      <div className="flex-1">
                        <Label>Número do Vale</Label>
                        <input type="text" value={valeNumero}
                          onChange={e => { setValeNumero(e.target.value); setValeValidacao(null); setPagValor(""); }}
                          placeholder="VT-00001"
                          className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                          style={{ borderColor: valeValidacao?.ok ? "#6EE7B7" : C.cremeBorder, color: "#374151" }}
                          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), validarValeTroca())}
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="button" onClick={async () => { await validarValeTroca(); }}
                          disabled={!valeNumero.trim() || valeValidando}
                          className="px-3 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 whitespace-nowrap"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                          {valeValidando ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-28">
                        <Label>Valor{restante > 0 && <span className="ml-1 font-normal text-xs" style={{ color: "#9CA3AF" }}>(restante: {fmt(restante)})</span>}</Label>
                        <input type="text" value={pagValor} onChange={e => setPagValor(e.target.value)}
                          placeholder={restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00"}
                          onKeyDown={e => e.key === "Enter" && handleAddPagamento()}
                          className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                      </div>
                      {pagMultForma === "Cartão de Crédito" && (
                        <div className="min-w-28">
                          <Label>Parcelas</Label>
                          <Select value={pagMultParcelas} onChange={e => setPagMultParcelas(Number(e.target.value))}>
                            {CONDICOES.map((c, i) => (
                              <option key={c} value={i === 0 ? 1 : i + 1}>{c}</option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (pagMultForma === "Vale-Troca") {
                        if (!valeValidacao?.ok || !valeValidacao.valor_disponivel) return;
                        const valorValeDisp = Math.min(valeValidacao.valor_disponivel, restante);
                        setPagamentos(prev => [...prev, { _key: uid(), forma: "Vale-Troca", valor: valorValeDisp, parcelas: 1, vale_numero: valeNumero.trim() }]);
                        setValeNumero(""); setValeValidacao(null); setPagValor("");
                      } else {
                        handleAddPagamento();
                      }
                    }}
                    disabled={restante <= 0 || (pagMultForma === "Vale-Troca" ? !valeValidacao?.ok : false)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    <Plus size={13} /> Adicionar
                  </button>
                </div>
                {/* Feedback validação vale em Múltiplas */}
                {pagMultForma === "Vale-Troca" && valeValidacao && (
                  <div className="rounded-lg border p-3 flex items-start gap-2 mb-3"
                    style={{ borderColor: valeValidacao.ok ? "#A7F3D0" : "#FECACA", backgroundColor: valeValidacao.ok ? "#ECFDF5" : "#FEF2F2" }}>
                    {valeValidacao.ok
                      ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#065F46" }} />
                      : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#991B1B" }} />}
                    <div className="text-xs" style={{ color: valeValidacao.ok ? "#065F46" : "#991B1B" }}>
                      <p className="font-medium">{valeValidacao.ok ? "Vale-troca válido" : (valeValidacao.erro ?? "Vale inválido")}</p>
                      {valeValidacao.ok && valeValidacao.valor_disponivel !== undefined && (
                        <p className="mt-0.5">Saldo disponível: <strong>{fmt(Math.min(valeValidacao.valor_disponivel, restante))}</strong> será adicionado</p>
                      )}
                    </div>
                  </div>
                )}
                {pagamentos.length > 0 && (
                  <div className="space-y-1.5">
                    {pagamentos.map(p => (
                      <div key={p._key} className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }}>
                        <span style={{ color: "#374151" }}>
                          {p.forma}
                          {p.vale_numero && <span className="ml-1.5 text-xs font-mono" style={{ color: "#6B7280" }}>({p.vale_numero})</span>}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(p.valor)}</span>
                          <button onClick={() => setPagamentos(prev => prev.filter(x => x._key !== p._key))} className="text-gray-300 hover:text-red-400"><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
                      <span style={{ color: "#6B7280" }}>Restante a pagar</span>
                      <span className="tabular-nums font-semibold" style={{ color: restante > 0.01 ? "#D97706" : "#059669" }}>{fmt(restante)}</span>
                    </div>
                  </div>
                )}

                {/* Pix inline dentro de Múltiplas */}
                {pagamentos.some(p => p.forma === "Pix") && totalVenda > 0 && (
                  <div className="mt-3">
                    <PixQrInline
                      vendaId={null}
                      numeroVenda="Nova"
                      valor={pagamentos.find(p => p.forma === "Pix")!.valor}
                      endpoint="criar-pix-instore"
                      obterVendaId={salvarRascunhoParaPix}
                      onPagamentoConfirmado={(vendaIdConfirmado) => {
                        router.push(`/vendas/${vendaIdConfirmado}`);
                      }}
                    />
                  </div>
                )}

                {/* Cartão inline dentro de Múltiplas */}
                {pagamentos.some(p => p.forma === "Cartão de Crédito") && totalVenda > 0 && (
                  <div className="mt-3">
                    <CartaoInline
                      vendaId={null}
                      numeroVenda="Nova"
                      valor={pagamentos.find(p => p.forma === "Cartão de Crédito")!.valor}
                      installments={pagamentos.find(p => p.forma === "Cartão de Crédito")!.parcelas || pagMultParcelas}
                      obterVendaId={salvarRascunhoParaPix}
                      onPagamentoConfirmado={(vendaIdConfirmado) => {
                        router.push(`/vendas/${vendaIdConfirmado}`);
                      }}
                    />
                  </div>
                )}

                {/* A Receber inline dentro de Múltiplas — botão solicitar aprovação */}
                {pagamentos.some(p => p.forma === "A Receber") && restante < 0.01 && totalVenda > 0 && (
                  <div className="mt-3 rounded-xl border p-4 space-y-2" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
                    <p className="text-sm font-medium" style={{ color: "#374151" }}>
                      A Receber — {fmt(pagamentos.find(p => p.forma === "A Receber")!.valor)}
                    </p>
                    {aprovacaoEnviada ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
                          Aprovação solicitada
                        </span>
                        <button onClick={() => router.push(`/vendas/${vendaIdCriada}`)}
                          className="text-xs underline" style={{ color: C.esmeralda }}>
                          Ver venda
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          setSaving(true); setSaveErr("");
                          try {
                            if (!cliente) throw new Error("Selecione um cliente");
                            if (itens.length === 0) throw new Error("Adicione ao menos 1 item");
                            // 1. Salvar rascunho com pagamentos
                            const body = montarBody();
                            const res = await fetch("/api/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                            const data = await res.json() as { id: number; error?: string };
                            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                            // 2. Solicitar aprovação de crédito
                            const apRes = await fetch(`/api/vendas/${data.id}/solicitar-aprovacao`, { method: "POST" });
                            const apData = await apRes.json();
                            if (!apRes.ok) throw new Error(apData.error ?? "Erro ao solicitar aprovação");
                            setVendaIdCriada(data.id);
                            setAprovacaoEnviada(true);
                          } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro"); }
                          finally { setSaving(false); }
                        }}
                        disabled={saving || itens.length === 0 || !cliente || vendedorSel === "" || formaEnvioId === ""}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
                        style={{ backgroundColor: "#D97706", color: "#fff" }}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Solicitar Aprovação
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Categoria */}
          <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder }}>
            <span className="font-medium" style={{ color: "#374151" }}>Categoria:</span>
            <span className="ml-1" style={{ color: "#6B7280" }}>01.01 - Vendas de Produtos e serviço</span>
          </div>

          {/* Resumo totais */}
          <div className="mt-4 pt-4 border-t space-y-1.5" style={{ borderColor: C.cremeBorder }}>
            {totalDesconto > 0 && (
              <div className="flex justify-between text-sm"><span style={{ color: "#6B7280" }}>Desconto</span><span className="tabular-nums" style={{ color: "#D97706" }}>−{fmt(totalDesconto)}</span></div>
            )}
            {totalFrete > 0 && (
              <div className="flex justify-between text-sm"><span style={{ color: "#6B7280" }}>Frete</span><span className="tabular-nums" style={{ color: "#374151" }}>{fmt(totalFrete)}</span></div>
            )}
            <div className="flex justify-between text-base font-bold pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
              <span style={{ color: C.esmeralda }}>Total</span>
              <span className="tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalVenda)}</span>
            </div>
          </div>

          </>)}
        </Secao>

        {/* ── 5. Transportador e Frete ── */}
        <Secao>
          <STitle>Transportador</STitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Forma de Envio</Label>
              <Select value={formaEnvioId} onChange={e => { setFormaEnvioId(e.target.value === "" ? "" : Number(e.target.value)); setFormaFreteId(""); }}>
                <option value="">Selecione a forma de envio</option>
                {formaEnvioOpts.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
            </div>
            <div>
              <Label>Forma de Frete</Label>
              <Select value={formaFreteId} disabled={!formaEnvioId || formaFreteOpts.length === 0}
                onChange={e => setFormaFreteId(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ borderColor: C.cremeBorder, color: "#374151", opacity: (!formaEnvioId || formaFreteOpts.length === 0) ? 0.5 : 1 }}>
                <option value="">Selecione a forma de frete</option>
                {formaFreteOpts.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
              {formaEnvioId && formaFreteOpts.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Sem fretes cadastrados para este envio</p>
              )}
            </div>
          </div>
        </Secao>

        {/* ── 6. Dados Adicionais ── */}
        <Secao>
          <STitle>Dados Adicionais</STitle>
          <div className="space-y-4">
            <div>
              <Label>Observações</Label>
              <textarea rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)}
                placeholder="Digite observações sobre o pedido..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            <div>
              <Label>Observações Internas</Label>
              <textarea rows={3} value={obsInternas} onChange={e => setObsInternas(e.target.value)}
                placeholder="Digite observações internas (uso interno)..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            {isFullAccess && (
              <div>
                <Label>Vídeo Interno</Label>
                {!videoPreviewUrl ? (
                  <label className="flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed cursor-pointer py-6 transition-colors hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                    <Video size={22} style={{ color: "#9CA3AF" }} />
                    <span className="text-sm" style={{ color: "#9CA3AF" }}>Gravar ou selecionar vídeo</span>
                    <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoSelect} />
                  </label>
                ) : (
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    <video src={videoPreviewUrl} controls className="w-full max-h-48 bg-black" />
                    <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: C.cremeBg }}>
                      {uploadingVideo ? (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: "#6B7280" }}><Loader2 size={12} className="animate-spin" /> Enviando…</span>
                      ) : videoUploadErr ? (
                        <span className="text-xs text-red-500">{videoUploadErr}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs" style={{ color: C.esmeralda }}><CheckCircle size={12} /> Enviado</span>
                      )}
                      <button type="button" onClick={handleRemoveVideo} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400"><X size={12} /> Remover</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Secao>

        {/* ── Footer inline ── */}
        <div className="px-6 py-5 flex items-center justify-between gap-3">
          {saveErr && <p className="text-sm text-red-600 flex-1">{saveErr}</p>}

          <div className="flex items-center gap-2">
            <Link href="/vendas"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-50 no-underline"
              style={{ borderColor: "#FCA5A5", color: "#EF4444" }}>
              <XCircle size={14} /> Cancelar
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => submit("rascunho")} disabled={saving}
              className="px-5 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-40 transition-opacity hover:opacity-80"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Salvar Rascunho
            </button>
            {/* Esconde botão principal quando tem A Receber (já tem botão inline na seção de pagamento) */}
            {!temAReceberNova && (() => {
              const camposFaltando: string[] = [];
              if (!cliente) camposFaltando.push("Cliente");
              if (vendedorSel === "") camposFaltando.push("Vendedor");
              if (formaEnvioId === "") camposFaltando.push("Forma de envio");
              const podeConcluir = !saving && itens.length > 0 && pagamentoCobre && camposFaltando.length === 0;
              return (
                <div className="relative group">
                  <button onClick={() => submit("aprovado")} disabled={!podeConcluir}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Concluir Venda
                  </button>
                  {camposFaltando.length > 0 && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 rounded-lg border bg-white shadow-lg text-xs z-10"
                      style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                      Preencha antes de concluir:
                      {camposFaltando.map(f => <p key={f} className="text-red-500">• {f}</p>)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

      </div>

      {/* Toast Vale-Troca: troco gerado */}
      {valeTrocoToast && (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-xl shadow-lg border p-4 max-w-sm animate-in slide-in-from-bottom-4"
          style={{ borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" }}
        >
          <div className="flex items-start gap-2">
            <Ticket size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#065F46" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "#065F46" }}>
                Novo vale-troco gerado!
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#065F46" }}>
                <strong>{valeTrocoToast.numero}</strong> — {fmt(valeTrocoToast.valor)}
              </p>
            </div>
            <button
              onClick={() => setValeTrocoToast(null)}
              className="p-1 rounded hover:bg-white/50"
              style={{ color: "#065F46" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
