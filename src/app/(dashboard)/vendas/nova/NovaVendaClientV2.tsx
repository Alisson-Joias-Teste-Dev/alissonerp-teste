"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Search, X, Plus, Loader2, CheckCircle, CheckCircle2,
  User, Package, Truck, CreditCard, FileText, Star, Calculator, Scale,
  MapPin, AlertCircle, AlertTriangle, Check, ChevronRight, Ticket, Pencil, Wrench, Video,
} from "lucide-react";
import Link from "next/link";
import CartaoInline from "@/components/vendas/CartaoInline";
import PixQrInline from "@/components/vendas/PixQrInline";
import { maskCpfCnpj, formatDateBR } from "@/lib/formatters";
import NovaOrdemServicoBaseModal from "@/components/ordens/NovaOrdemServicoBaseModal";

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
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  cep: string | null;
  uf: string | null;
}

interface Produto {
  id: number;
  sku: string;
  nome: string;
  preco_venda: number | null;
  peso_precificado: number | null;
  unidade: string | null;
  sufixo_variacao: string | null;
  numeracao: string | null;
  saldo_disponivel: number;
  tem_ficha_tecnica: boolean;
}

interface FaixaComissao {
  desconto_pct: number;
  comissao_pct: number;
}


interface ItemVenda {
  _key: string;
  produto_id: number | null;
  nome_produto: string;
  sku: string | null;
  quantidade: number;
  preco_lista: number;
  pct_desconto: number;
  preco_unitario: number;
  total_item: number;
  pct_comissao: number;
  valor_comissao: number;
  peso_estimado: number | null;
  saldo_disponivel: number;
  personalizacao?: { valor: string };
}

// Config de personalizacao (config vinda de /api/produtos/[id]/personalizacao)
type CaracteresPermitidos =
  | "alfa"
  | "alfa_acento"
  | "alfa_acento_espaco"
  | "alfanum"
  | "alfanum_acento_espaco"
  | "numero"
  | "qualquer";

interface ConfigPersonalizacao {
  produto_id: number;
  tipo: string;
  obrigatorio: boolean;
  min_caracteres: number;
  max_caracteres: number;
  caracteres_permitidos: CaracteresPermitidos;
  label: string;
  placeholder: string | null;
  exemplo: string | null;
  observacao: string | null;
  ativo: boolean;
  preco_por_letra?: number | null;
  peso_por_letra?:  number | null;
}

const REGEX_PERSONALIZACAO: Record<CaracteresPermitidos, RegExp> = {
  alfa:                  /^[A-Za-z]+$/,
  alfa_acento:           /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/,
  alfa_acento_espaco:    /^[A-Za-zÀ-ÖØ-öø-ÿ ]+$/,
  alfanum:               /^[A-Za-z0-9]+$/,
  alfanum_acento_espaco: /^[A-Za-z0-9À-ÖØ-öø-ÿ ]+$/,
  numero:                /^[0-9]+$/,
  qualquer:              /^.+$/,
};

interface Pagamento {
  _key: string;
  forma: string;
  valor: number;
  parcelas: number;
  vale_numero?: string;
  db_id?: number; // ID do pagamentos_venda pré-criado (Pix/Cartão em Múltiplas)
}

interface ParcelaRow {
  num: number;
  dias: number;
  data: string;
  valor: number;
}

interface EnderecoEntrega {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
}

interface VendaHistorico {
  id: number;
  numero_venda: string;
  data_venda: string;
  total_venda: number;
  itens_resumo: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  role: string;
  vendedorId: number | null;
  vendedorNome: string;
  maxDesconto: number;
  descontoAuthThreshold?: number;
  vendedores?: { id: number; nome: string }[];
  userId: string;
  userName: string;
}

interface PendingAuth {
  solicitacaoId: number | null;
  pct: number;
  status: "local" | "pendente" | "aprovado" | "rejeitado";
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIPOS_SERVICO = [
  { id: 1, nome: "Solda Laser" },
  { id: 2, nome: "Cravação Manual" },
  { id: 3, nome: "Acabamento e polimento" },
  { id: 4, nome: "Ajuste Manual" },
  { id: 5, nome: "Solda e Limpeza" },
  { id: 6, nome: "Outros" },
];

const FORMAS_PAGAMENTO = ["Dinheiro", "Cartão de Crédito", "Pix", "Vale-Troca", "A Receber", "Múltiplas"];
const GATEWAYS = ["Mercado Pago", "PagSeguro", "Cielo", "Stone", "Getnet", "Rede", "Outro"];
const CONDICOES = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
const COM_CARTAO = ["Cartão de Crédito", "Pix"];

function condicoesMp(valor: number) {
  const max = Math.min(12, Math.floor(valor / 100));
  return CONDICOES.filter(c => c === "À vista" || parseInt(c) <= max);
}

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

// ─── Shared UI helpers ────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 ${className}`}
      style={{ borderColor: C.cremeBorder, color: "#374151" }}
      {...props}
    />
  );
}
function Sel({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none ${className}`}
      style={{ borderColor: C.cremeBorder, color: "#374151" }}
      {...props}
    />
  );
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────
function Autocomplete<T>({
  placeholder, onSearch, renderItem, onSelect, selectedLabel, onClear, onNoResults, onClearResults,
}: {
  placeholder: string;
  onSearch: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  selectedLabel?: string | null;
  onClear: () => void;
  onNoResults?: (q: string) => void;
  onClearResults?: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const search = useCallback((val: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setResults([]); setOpen(false); setHighlighted(-1); onClearResults?.(); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const r = await onSearch(val);
      setResults(r);
      setOpen(true);
      setHighlighted(-1);
      setLoading(false);
      if (r.length === 0) onNoResults?.(val);
      else onClearResults?.();
    }, 400);
  }, [onSearch, onNoResults, onClearResults]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => {
        const next = Math.min(h + 1, results.length - 1);
        listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => {
        const prev = Math.max(h - 1, 0);
        listRef.current?.children[prev]?.scrollIntoView({ block: "nearest" });
        return prev;
      });
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      onSelect(results[highlighted]);
      setQ(""); setOpen(false); setResults([]); setHighlighted(-1);
    } else if (e.key === "Escape") {
      setOpen(false); setHighlighted(-1);
    }
  }

  if (selectedLabel) return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
      <span className="text-sm" style={{ color: "#374151" }}>{selectedLabel}</span>
      <button onClick={onClear} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
    </div>
  );
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border bg-white" style={{ borderColor: C.cremeBorder }}>
        {loading ? <Loader2 size={13} className="animate-spin text-gray-400" /> : <Search size={13} style={{ color: "#9CA3AF" }} />}
        <input
          className="flex-1 outline-none text-sm"
          style={{ color: "#1A1A1A" }}
          placeholder={placeholder}
          value={q}
          onChange={e => { setQ(e.target.value); search(e.target.value); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg overflow-hidden bg-white" style={{ borderColor: C.cremeBorder, maxHeight: 240 }}>
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {results.map((item, i) => (
              <button
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

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step, total, tipoVenda }: { step: number; total: number; tipoVenda: string | null }) {
  const steps = tipoVenda === "servico" ? [
    { icon: User, label: "Cliente" },
    { icon: Star, label: "Tipo" },
    { icon: Wrench, label: "Serviço" },
    { icon: Truck, label: "Entrega" },
    { icon: CreditCard, label: "Pagamento" },
    { icon: CheckCircle, label: "Finalizar" },
  ] : [
    { icon: User, label: "Cliente" },
    { icon: Star, label: "Tipo" },
    { icon: Package, label: "Produtos" },
    { icon: Truck, label: "Entrega" },
    { icon: CreditCard, label: "Pagamento" },
    { icon: CheckCircle, label: "Finalizar" },
  ];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map(({ icon: Icon, label }, i) => {
        const num = i + 1;
        const isActive = num === step;
        const isDone = num < step;
        return (
          <div key={num} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-none">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  backgroundColor: isDone ? C.esmeralda : isActive ? C.esmeralda : "#E5E7EB",
                  color: isDone || isActive ? C.creme : "#9CA3AF",
                }}
              >
                {isDone ? <Check size={14} /> : <Icon size={14} />}
              </div>
              <span
                className="text-[10px] mt-1 font-medium hidden md:block"
                style={{ color: isActive ? C.esmeralda : "#9CA3AF" }}
              >
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <div
                className="flex-1 h-0.5 mx-1"
                style={{ backgroundColor: isDone ? C.esmeralda : "#E5E7EB" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── DescontoValorInput ────────────────────────────────────────────────────────
function DescontoValorInput({ precoLista, pctDesconto, onCommit }: {
  precoLista: number;
  pctDesconto: number;
  onCommit: (val: string) => void;
}) {
  const calculated = pctDesconto > 0 ? (precoLista * pctDesconto / 100).toFixed(2).replace(".", ",") : "";
  const [local, setLocal] = useState(calculated);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(calculated); }, [calculated, focused]);
  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onCommit(local || "0"); }}
      onKeyDown={e => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
      placeholder="0,00"
      className="w-20 border rounded px-1.5 py-1 text-sm text-right outline-none"
      style={{ borderColor: C.cremeBorder }}
    />
  );
}

// ─── PrecoListaInput ──────────────────────────────────────────────────────────
function PrecoListaInput({ value, onCommit }: { value: number; onCommit: (val: string) => void }) {
  const fmt2 = (n: number) => n.toFixed(2).replace(".", ",");
  const [local, setLocal] = useState(fmt2(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(fmt2(value)); }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onCommit(local || "0"); }}
      onKeyDown={e => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
      className="w-24 border rounded px-1.5 py-1 text-sm text-right outline-none tabular-nums"
      style={{ borderColor: C.cremeBorder, color: "#374151" }}
    />
  );
}

// Input para editar o "Preço Un" diretamente. Ao sair do campo (blur),
// converte o preço digitado em desconto %. Útil para o gerente que quer
// negociar direto o valor final da peça.
function PrecoUnitarioInput({ precoUnit, onCommit }: {
  precoUnit: number;
  onCommit: (val: string) => void;
}) {
  const formatted = precoUnit > 0 ? precoUnit.toFixed(2).replace(".", ",") : "";
  const [local, setLocal] = useState(formatted);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(formatted); }, [formatted, focused]);
  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onCommit(local || "0"); }}
      onKeyDown={e => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
      placeholder="0,00"
      className="w-24 border rounded px-1.5 py-1 text-sm text-right outline-none tabular-nums"
      style={{ borderColor: C.cremeBorder, color: "#374151" }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function NovaVendaClientV2({ role, vendedorId, vendedorNome, maxDesconto, descontoAuthThreshold, vendedores = [], userId, userName }: Props) {
  const router = useRouter();

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [vendaId, setVendaId] = useState<number | null>(null);
  const [numeroVenda, setNumeroVenda] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // ── Step 1: Cliente ───────────────────────────────────────────────────────
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [showNovoClienteForm, setShowNovoClienteForm] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteSemResultados, setClienteSemResultados] = useState(false);
  const [novoClienteForm, setNovoClienteForm] = useState({
    nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "",
    cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "",
  });
  const [savingCliente, setSavingCliente] = useState(false);
  const [clienteErr, setClienteErr] = useState("");
  const [cpfExistente, setCpfExistente] = useState<string | null>(null);
  const cpfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Step 2: Tipo ──────────────────────────────────────────────────────────
  const [tipoVenda, setTipoVenda] = useState<"produto" | "servico" | "garantia" | null>(null);
  const [vendaGarantiaId, setVendaGarantiaId] = useState<number | null>(null);
  const [historicoVendas, setHistoricoVendas] = useState<VendaHistorico[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [selVendedorId, setSelVendedorId] = useState<number | null>(vendedorId);
  const [selVendedorNome, setSelVendedorNome] = useState<string>(vendedorNome);

  // ── Step 3: Entrega ───────────────────────────────────────────────────────
  const [modoEntrega, setModoEntrega] = useState<"loja" | "correios" | "transportadora" | "motoboy" | "uber" | null>(null);
  const [usarEnderecoCliente, setUsarEnderecoCliente] = useState(true);
  const [enderecoEntrega, setEnderecoEntrega] = useState<EnderecoEntrega>({
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "",
  });
  const [totalFrete, setTotalFrete] = useState(0);
  const [fretePersonalizado, setFretePersonalizado] = useState(false);
  const [freteCalculado, setFreteCalculado] = useState<number | null>(null);
  const [loadingFrete, setLoadingFrete] = useState(false);
  const [numeroRastreio, setNumeroRastreio] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");

  // ── Step 4: Itens ─────────────────────────────────────────────────────────
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [faixas, setFaixas] = useState<FaixaComissao[]>([]);
  const [produtoSel, setProdutoSel] = useState<Produto | null>(null);
  const [qtd, setQtd] = useState(1);
  const [pctDesconto, setPctDesconto] = useState(0);
  const [descontoErr, setDescontoErr] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [pendingAuths, setPendingAuths] = useState<Record<string, PendingAuth>>({});
  // Cache de configs de personalização por produto_id.
  //   null  → ja consultado, produto NAO tem config
  //   undefined → ainda nao consultado
  const [personalizacoesCache, setPersonalizacoesCache] = useState<
    Record<number, ConfigPersonalizacao | null>
  >({});
  // For serviço/fabricação
  const [servDescricao, setServDescricao] = useState("");
  const [servValor, setServValor] = useState("");

  // ── Step 5: Pagamento ─────────────────────────────────────────────────────
  const [pagForma, setPagForma] = useState("Dinheiro");
  const [pagGateway, setPagGateway] = useState("Mercado Pago");
  const [pagCondicao, setPagCondicao] = useState("À vista");
  const [parcelasRows, setParcelasRows] = useState<ParcelaRow[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [pagMultForma, setPagMultForma] = useState("Dinheiro");
  const [pagMultParcelas, setPagMultParcelas] = useState(1);
  const [pagValor, setPagValor] = useState("");
  const [valeNumero, setValeNumero] = useState("");
  const [valeValidando, setValeValidando] = useState(false);
  const [valeValidacao, setValeValidacao] = useState<{
    ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null;
  } | null>(null);
  const [valeTrocoToast, setValeTrocoToast] = useState<{ numero: string; valor: number } | null>(null);
  const [aprovacaoEnviada, setAprovacaoEnviada] = useState(false);
  const [aprovacaoDescontoEnviada, setAprovacaoDescontoEnviada] = useState(false);
  const [pedindoAprovacao, setPedindoAprovacao] = useState(false);

  // ── Step 6: Finalizar ─────────────────────────────────────────────────────
  const [showModalFim, setShowModalFim] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [showOrdemModal, setShowOrdemModal] = useState(false);
  const [ordemCriada, setOrdemCriada] = useState<{ id: number; numero_ordem: string } | null>(null);

  // ── Step 3 Serviço (servico type only) ────────────────────────────────────
  const [svcPesoMetal, setSvcPesoMetal] = useState("");
  const [svcFotoB64, setSvcFotoB64] = useState<string | null>(null);
  const [svcFotoPreview, setSvcFotoPreview] = useState<string | null>(null);
  const [svcVideoB64, setSvcVideoB64] = useState<string | null>(null);
  const [svcVideoNome, setSvcVideoNome] = useState<string | null>(null);
  const [validandoSvcFoto, setValidandoSvcFoto] = useState(false);
  const [validacaoSvcFoto, setValidacaoSvcFoto] = useState<{ match: boolean; mensagem: string } | null>(null);

  // Load commission tables on mount
  useEffect(() => {
    fetch("/api/vendas/faixas-comissao").then(r => r.json()).then(setFaixas).catch(() => {});
  }, []);


  // ─── Computed totals ─────────────────────────────────────────────────────
  const totalProdutos = itens.reduce((s, i) => s + i.total_item, 0);
  const totalDesconto = itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);
  const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);
  const totalVenda = totalProdutos + totalFrete;
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0);
  const pagamentoCobre = pagForma === "Múltiplas" ? Math.abs(totalPago - totalVenda) < 0.01 : true;
  const temAReceber = pagForma === "A Receber" || (pagForma === "Múltiplas" && pagamentos.some(p => p.forma === "A Receber"));
  const LIMITE_DESCONTO_APROVACAO = 30;
  // Admin/dev (maxDesconto=100) aprovar diretamente — sem tarefa de aprovação
  const precisaAprovacaoDesconto = maxDesconto < 100 && itens.some(i => i.pct_desconto > LIMITE_DESCONTO_APROVACAO);

  // Reset parcelas se valor muda
  useEffect(() => {
    if (pagForma === "Múltiplas") return;
    if (pagGateway === "Mercado Pago" && pagForma === "Cartão de Crédito") {
      const opcoes = condicoesMp(totalVenda);
      if (!opcoes.includes(pagCondicao)) setPagCondicao("À vista");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalVenda, pagGateway, pagForma]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagCondicao, totalVenda, pagForma]);

  // ─── CEP lookup ──────────────────────────────────────────────────────────
  async function buscaCEP(cep: string, target: "entrega" | "novoCliente") {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data.erro) return;
      if (target === "entrega") {
        setEnderecoEntrega(prev => ({
          ...prev,
          logradouro: data.logradouro ?? "",
          bairro: data.bairro ?? "",
          municipio: data.localidade ?? "",
          uf: data.uf ?? "",
        }));
        calcularFrete(data.bairro ?? "", data.localidade ?? "");
      } else {
        setNovoClienteForm(prev => ({
          ...prev,
          endereco: data.logradouro ?? "",
          bairro: data.bairro ?? "",
          municipio: data.localidade ?? "",
          uf: data.uf ?? "",
        }));
      }
    } catch { /* silent */ }
  }

  // ─── Calcular frete ───────────────────────────────────────────────────────
  async function calcularFrete(bairro: string, municipio: string) {
    if (!bairro && !municipio) return;
    setLoadingFrete(true);
    try {
      const params = new URLSearchParams();
      if (bairro) params.set("bairro", bairro);
      if (municipio) params.set("municipio", municipio);
      const res = await fetch(`/api/vendas/frete?${params}`);
      const data = await res.json() as { valor?: number; personalizado?: boolean };
      if (data.personalizado) {
        setFretePersonalizado(true);
        setFreteCalculado(null);
      } else if (data.valor != null) {
        setFretePersonalizado(false);
        setFreteCalculado(data.valor);
        setTotalFrete(data.valor);
      } else {
        setFretePersonalizado(true);
        setFreteCalculado(null);
      }
    } catch {
      setFretePersonalizado(true);
      setFreteCalculado(null);
    } finally {
      setLoadingFrete(false);
    }
  }

  // When usarEnderecoCliente changes or cliente changes, recalculate frete
  useEffect(() => {
    if (modoEntrega === "loja" || !modoEntrega) return;
    if (usarEnderecoCliente && cliente) {
      calcularFrete(cliente.bairro ?? "", cliente.municipio ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarEnderecoCliente, cliente, modoEntrega]);

  // ─── CPF duplicado check ─────────────────────────────────────────────────
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

  // ─── Serviço step helpers ─────────────────────────────────────────────────
  async function validarFotoServico(b64: string, peso: number) {
    setValidandoSvcFoto(true);
    setValidacaoSvcFoto(null);
    try {
      const puro = b64.replace(/^data:[^;]+;base64,/, "");
      const mt = b64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      const blob = await fetch(`data:${mt};base64,${puro}`).then(r => r.blob());
      const fd = new FormData();
      fd.append("file", new File([blob], "foto.jpg", { type: mt }));
      fd.append("peso", String(peso));
      fd.append("tipo", "metal");
      const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
      const data = await res.json();
      setValidacaoSvcFoto(data);
    } catch {
      setValidacaoSvcFoto({ match: false, mensagem: "Erro ao validar" });
    } finally {
      setValidandoSvcFoto(false);
    }
  }

  function handleSvcFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target?.result as string;
      setSvcFotoB64(b64);
      setSvcFotoPreview(b64);
      setValidacaoSvcFoto(null);
      const peso = parseFloat(svcPesoMetal.replace(",", "."));
      if (peso > 0) await validarFotoServico(b64, peso);
    };
    reader.readAsDataURL(file);
  }

  function handleSvcVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setSaveErr("Vídeo muito grande. Limite: 15MB");
      return;
    }
    setSvcVideoNome(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => { setSvcVideoB64(ev.target?.result as string); };
    reader.readAsDataURL(file);
  }

  // ─── Create new client ───────────────────────────────────────────────────
  async function handleCriarCliente() {
    if (!novoClienteForm.nome.trim()) { setClienteErr("Nome é obrigatório"); return; }
    if (cpfExistente) { setClienteErr(`CPF/CNPJ já cadastrado para: ${cpfExistente}`); return; }
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoClienteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCliente({
        id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, email: data.email,
        telefone: data.telefone, celular: data.celular, endereco: data.endereco,
        numero: data.numero, bairro: data.bairro, municipio: data.municipio,
        cep: data.cep, uf: data.uf,
      });
      setShowNovoClienteForm(false);
      setNovoClienteForm({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao criar cliente"); }
    finally { setSavingCliente(false); }
  }

  async function handleEditarCliente() {
    if (!cliente) return;
    if (!novoClienteForm.nome.trim()) { setClienteErr("Nome é obrigatório"); return; }
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cliente.id, ...novoClienteForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCliente({
        id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, email: data.email,
        telefone: data.telefone, celular: data.celular, endereco: data.endereco,
        numero: data.numero, bairro: data.bairro, municipio: data.municipio,
        cep: data.cep, uf: data.uf,
      });
      setEditandoCliente(false);
      setNovoClienteForm({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSavingCliente(false); }
  }

  // ─── Load historico de vendas ────────────────────────────────────────────
  async function loadHistoricoVendas(clienteId: number) {
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/vendas/cliente/${clienteId}/historico`);
      const data = await res.json();
      setHistoricoVendas(Array.isArray(data) ? data : (data.vendas ?? []));
    } catch { setHistoricoVendas([]); }
    finally { setLoadingHistorico(false); }
  }

  // ─── Comissão ─────────────────────────────────────────────────────────────
  function getComissao(pct: number): number {
    if (pct > 30) return 0.5;
    const faixa = faixas.find(f => f.desconto_pct === Math.round(pct));
    if (!faixa) return 0;
    return faixa.comissao_pct;
  }

  function calcItem(produto: Produto, q: number, pct: number): Omit<ItemVenda, "_key"> {
    const precoLista = produto.preco_venda ?? 0;
    const precoUnit = precoLista * (1 - pct / 100);
    const totalItem = precoUnit * q;
    const pctComissao = getComissao(pct);
    return {
      produto_id: produto.id, nome_produto: produto.nome, sku: produto.sku,
      quantidade: q, preco_lista: precoLista, pct_desconto: pct,
      preco_unitario: precoUnit, total_item: totalItem,
      pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100,
      peso_estimado: produto.peso_precificado,
      saldo_disponivel: produto.saldo_disponivel ?? 0,
    };
  }

  function updateItem(key: string, field: "quantidade" | "pct_desconto" | "desconto_valor" | "preco_lista" | "preco_unitario", raw: string) {
    const authThr = descontoAuthThreshold ?? maxDesconto;

    setItens(prev => prev.map(item => {
      if (item._key !== key) return item;
      let q = item.quantidade;
      let pct = item.pct_desconto;
      let precoUnitDigitado: number | null = null;

      if (field === "quantidade") q = Math.max(1, parseInt(raw) || 1);
      if (field === "pct_desconto") pct = Math.max(0, parseFloat(raw.replace(",", ".")) || 0);
      if (field === "desconto_valor") {
        const valorDesc = parseFloat(raw.replace(",", ".")) || 0;
        pct = item.preco_lista > 0 ? Math.max(0, (valorDesc / item.preco_lista) * 100) : 0;
        pct = Math.round(pct * 100) / 100;
      }
      if (field === "preco_lista") {
        // Normaliza formato BR com separador de milhar: "1.500,99" → 1500.99
        const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
        const novaLista = Math.max(0, parseFloat(normalized) || 0);
        const precoUnit = novaLista * (1 - pct / 100);
        const totalItem = precoUnit * q;
        const pctComissao = getComissao(pct);
        return { ...item, preco_lista: novaLista, preco_unitario: precoUnit, total_item: totalItem, pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100 };
      }
      if (field === "preco_unitario") {
        const novoPreco = parseFloat(raw.replace(",", ".")) || 0;
        if (item.preco_lista > 0 && novoPreco >= 0 && novoPreco <= item.preco_lista) {
          pct = Math.min(maxDesconto, Math.max(0, ((item.preco_lista - novoPreco) / item.preco_lista) * 100));
          pct = Math.round(pct * 100) / 100;
          precoUnitDigitado = novoPreco;
        }
      }

      // Auth threshold: se acima do limite livre, pende autorização
      let authCapped = false;
      if (field !== "quantidade" && pct > authThr) {
        const requestedPct = pct;
        setPendingAuths(prev2 => {
          const existing = prev2[key];
          if (existing?.status === "aprovado" && existing.pct >= requestedPct) return prev2;
          return { ...prev2, [key]: { solicitacaoId: null, pct: requestedPct, status: "local" } };
        });
        pct = authThr;
        authCapped = true;
      } else if (field !== "quantidade" && pct <= authThr) {
        setPendingAuths(prev2 => {
          if (!prev2[key]) return prev2;
          const next = { ...prev2 };
          delete next[key];
          return next;
        });
      }
      // Se produto tem preco_por_letra, recalcula preco_lista pelo nome digitado
      const cfg = item.produto_id != null ? personalizacoesCache[item.produto_id] : null;
      const precoPorLetra = cfg?.preco_por_letra;
      let precoLista = item.preco_lista;
      if (precoPorLetra != null && precoPorLetra > 0) {
        const qtdLetras = item.personalizacao?.valor?.trim().length ?? 0;
        precoLista = qtdLetras === 0 ? 0 : Math.round(qtdLetras * precoPorLetra * 100) / 100;
      }
      // Preço unitário: preserva valor digitado para evitar drift de arredondamento.
      // Se auth cortou o desconto ou personalização mudou o preço_lista, recalcula.
      const precoUnit = (precoUnitDigitado !== null && !authCapped && precoLista === item.preco_lista)
        ? precoUnitDigitado
        : precoLista * (1 - pct / 100);
      const totalItem = precoUnit * q;
      const pctComissao = getComissao(pct);
      return { ...item, quantidade: q, pct_desconto: pct, preco_lista: precoLista, preco_unitario: precoUnit, total_item: totalItem, pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100 };
    }));
  }

  async function solicitarAutorizacao(key: string) {
    const pending = pendingAuths[key];
    const item = itens.find(i => i._key === key);
    if (!pending || !item || pending.status !== "local") return;
    const precoSolicitado = item.preco_lista * (1 - pending.pct / 100);
    try {
      const res = await fetch("/api/vendas/solicitar-desconto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: vendaId ?? undefined,
          produto_nome: item.nome_produto,
          preco_lista: item.preco_lista,
          pct_desconto: pending.pct,
          preco_solicitado: precoSolicitado,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { id: number };
        setPendingAuths(prev => ({ ...prev, [key]: { ...prev[key], solicitacaoId: data.id, status: "pendente" } }));
      }
    } catch { /* ignora */ }
  }

  function applyApprovedDiscount(key: string, pct: number) {
    setItens(prev => prev.map(item => {
      if (item._key !== key) return item;
      const precoUnit  = item.preco_lista * (1 - pct / 100);
      const totalItem  = precoUnit * item.quantidade;
      const pctComissao = getComissao(pct);
      return { ...item, pct_desconto: pct, preco_unitario: precoUnit, total_item: totalItem, pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100 };
    }));
  }

  // Polling para autorizações pendentes (checa a cada 5s)
  useEffect(() => {
    const pending = Object.entries(pendingAuths).filter(([, a]) => a.status === "pendente" && a.solicitacaoId);
    if (pending.length === 0) return;
    const interval = setInterval(async () => {
      for (const [key, auth] of pending) {
        try {
          const res = await fetch(`/api/vendas/solicitacoes-desconto/${auth.solicitacaoId}`);
          if (!res.ok) continue;
          const data = await res.json() as { status: string };
          if (data.status === "aprovado") {
            applyApprovedDiscount(key, auth.pct);
            setPendingAuths(prev => ({ ...prev, [key]: { ...prev[key], status: "aprovado" } }));
          } else if (data.status === "rejeitado") {
            setPendingAuths(prev => ({ ...prev, [key]: { ...prev[key], status: "rejeitado" } }));
          }
        } catch { /* ignora */ }
      }
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuths]);

  // ─── Personalização (produto_personalizacao) ─────────────────────────────
  // Busca config do produto e cacheia. Retorna cedo se ja em cache.
  const fetchPersonalizacaoConfig = useCallback(async (produtoId: number) => {
    if (personalizacoesCache[produtoId] !== undefined) return;
    try {
      const res = await fetch(`/api/produtos/${produtoId}/personalizacao`);
      if (!res.ok) {
        setPersonalizacoesCache(prev => ({ ...prev, [produtoId]: null }));
        return;
      }
      const data = (await res.json()) as { config: ConfigPersonalizacao | null };
      setPersonalizacoesCache(prev => ({ ...prev, [produtoId]: data.config ?? null }));
    } catch {
      setPersonalizacoesCache(prev => ({ ...prev, [produtoId]: null }));
    }
  }, [personalizacoesCache]);

  // Valida valor atual do item contra config. Retorna erro (string) ou null.
  function validarItemPersonalizacao(
    item: ItemVenda,
    config: ConfigPersonalizacao | null | undefined,
  ): string | null {
    if (!config) return null;
    const valor = item.personalizacao?.valor?.trim() ?? "";
    if (config.obrigatorio && !valor) {
      return `${config.label} é obrigatório`;
    }
    if (!valor) return null;
    if (valor.length < config.min_caracteres) {
      return `Mínimo ${config.min_caracteres} caractere${config.min_caracteres === 1 ? "" : "s"}`;
    }
    if (valor.length > config.max_caracteres) {
      return `Máximo ${config.max_caracteres} caractere${config.max_caracteres === 1 ? "" : "s"}`;
    }
    const rx = REGEX_PERSONALIZACAO[config.caracteres_permitidos];
    if (rx && !rx.test(valor)) {
      return "Caracteres não permitidos";
    }
    return null;
  }

  function atualizarPersonalizacao(itemKey: string, valor: string) {
    setItens(prev =>
      prev.map(it => {
        if (it._key !== itemKey) return it;
        const novaPers = { valor };
        const cfg = it.produto_id != null ? personalizacoesCache[it.produto_id] : null;
        const precoPorLetra = cfg?.preco_por_letra;
        const pesoPorLetra  = cfg?.peso_por_letra;
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const qtdLetras = valor.trim().length;

        // Recalcula peso_estimado se peso_por_letra configurado
        let pesoEstimadoNovo: number | null = it.peso_estimado;
        if (pesoPorLetra != null && pesoPorLetra > 0) {
          pesoEstimadoNovo = qtdLetras === 0 ? null : r2(qtdLetras * pesoPorLetra);
        }

        // Se o produto tem preco_por_letra, RECALCULA preços em tempo real
        if (precoPorLetra != null && precoPorLetra > 0) {
          const pctDesc   = it.pct_desconto ?? 0;
          const qtd       = Math.max(1, it.quantidade || 1);
          const pctCom    = it.pct_comissao ?? 0;
          const precoLista    = qtdLetras === 0 ? 0 : r2(qtdLetras * precoPorLetra);
          const precoUnitario = r2(precoLista * (1 - pctDesc / 100));
          const totalItem     = r2(precoUnitario * qtd);
          const valorComissao = r2(totalItem * pctCom / 100);
          return {
            ...it,
            personalizacao: novaPers,
            preco_lista:    precoLista,
            preco_unitario: precoUnitario,
            total_item:     totalItem,
            valor_comissao: valorComissao,
            peso_estimado:  pesoEstimadoNovo,
          };
        }
        return { ...it, personalizacao: novaPers, peso_estimado: pesoEstimadoNovo };
      }),
    );
  }

  function handleAddItem() {
    if (!produtoSel) return;
    const novoItemBase = calcItem(produtoSel, qtd, pctDesconto);
    // Se o produto ja tem config com preco_por_letra no cache, zera precos iniciais
    // (serao calculados ao digitar o nome). Se ainda nao esta no cache, o fetch
    // abaixo atualiza o cache e o render do form detecta automaticamente.
    const cachedCfg = personalizacoesCache[produtoSel.id];
    const precoPorLetra = cachedCfg?.preco_por_letra;
    const novoItem = (precoPorLetra != null && precoPorLetra > 0)
      ? { ...novoItemBase, preco_lista: 0, preco_unitario: 0, total_item: 0, valor_comissao: 0 }
      : novoItemBase;
    setItens(prev => [...prev, { _key: uid(), ...novoItem }]);
    // Busca config de personalizacao do produto (async, nao bloqueia o add)
    void fetchPersonalizacaoConfig(produtoSel.id);
    setProdutoSel(null); setQtd(1); setPctDesconto(0); setDescontoErr(""); setAddingItem(false);
  }

  function handleAddServico() {
    const desc = servDescricao.trim();
    const valor = parseFloat(servValor.replace(",", "."));
    if (!desc || !valor) return;
    setItens(prev => [...prev, {
      _key: uid(), produto_id: null, nome_produto: desc, sku: null,
      quantidade: 1, preco_lista: valor, pct_desconto: 0,
      preco_unitario: valor, total_item: valor,
      pct_comissao: 0, valor_comissao: 0, peso_estimado: null,
      saldo_disponivel: 0,
    }]);
    setServDescricao(""); setServValor("");
  }

  // ─── Montar body da venda ────────────────────────────────────────────────
  function montarBody(situacao?: string, skipPagamentos = false) {
    const endEntregaFinal = !usarEnderecoCliente && modoEntrega !== "loja" ? {
      endereco_entrega: enderecoEntrega.logradouro || null,
      endereco_entrega_numero: enderecoEntrega.numero || null,
      endereco_entrega_complemento: enderecoEntrega.complemento || null,
      endereco_entrega_bairro: enderecoEntrega.bairro || null,
      endereco_entrega_cidade: enderecoEntrega.municipio || null,
      endereco_entrega_cep: enderecoEntrega.cep || null,
      endereco_entrega_uf: enderecoEntrega.uf || null,
    } : {};

    const pagamentosBody = skipPagamentos ? [] : pagForma === "Múltiplas"
      ? pagamentos
          .filter(p => p.forma !== "Vale-Troca")
          .map(p => ({ forma: p.forma, valor: p.valor, parcelas: p.parcelas, status: "pendente" }))
      : pagForma === "Vale-Troca"
      ? []
      : [{
          forma: pagForma,
          valor: totalVenda,
          parcelas: pagCondicao === "À vista" ? 1 : parseInt(pagCondicao),
          gateway: COM_CARTAO.includes(pagForma) ? pagGateway : null,
          status: "pendente",
        }];

    return {
      cliente_id: cliente?.id ?? null,
      vendedor_id: selVendedorId || null,
      data_entrega: dataEntrega || null,
      total_frete: totalFrete,
      forma_envio: modoEntrega === "loja" ? "Retirada na loja" : modoEntrega === "correios" ? "Correios" : modoEntrega === "transportadora" ? "Transportadora" : modoEntrega === "motoboy" ? "Motoboy" : modoEntrega === "uber" ? "Uber" : null,
      numero_rastreio: numeroRastreio || null,
      tipo_venda: tipoVenda,
      venda_garantia_id: vendaGarantiaId || null,
      situacao: situacao ?? "rascunho",
      ...endEntregaFinal,
      itens: itens.map(i => ({
        produto_id: i.produto_id, nome_produto: i.nome_produto, sku: i.sku,
        quantidade: i.quantidade, preco_lista: i.preco_lista, pct_desconto: i.pct_desconto,
        preco_unitario: i.preco_unitario, total_item: i.total_item,
        pct_comissao: i.pct_comissao, valor_comissao: i.valor_comissao, peso_estimado: i.peso_estimado,
        personalizacao: i.personalizacao?.valor?.trim()
          ? { valor: i.personalizacao.valor.trim() }
          : null,
      })),
      pagamentos: pagamentosBody,
    };
  }

  // ─── Salvar/criar rascunho ────────────────────────────────────────────────
  async function salvarRascunho(opts?: { skipPagamentos?: boolean }): Promise<{ id: number; numero_venda: string }> {
    const body = montarBody(undefined, opts?.skipPagamentos ?? false);
    if (vendaId) {
      // PATCH
      const res = await fetch(`/api/vendas/${vendaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { id?: number; numero_venda?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return { id: vendaId, numero_venda: numeroVenda };
    } else {
      const res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { id?: number; numero_venda?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.id) {
        setVendaId(data.id);
        setNumeroVenda(data.numero_venda ?? "");
      }
      return { id: data.id!, numero_venda: data.numero_venda ?? "" };
    }
  }

  // ─── Aplicar Vale-Troca ───────────────────────────────────────────────────
  async function aplicarValeNaVenda(vendaIdLocal: number, valor: number, numero?: string) {
    const res = await fetch(`/api/vendas/${vendaIdLocal}/pagamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forma: "Vale-Troca", valor, vale_numero: (numero ?? valeNumero).trim() }),
    });
    const data = await res.json() as { novo_vale?: { id: number; numero: string; valor_original: number }; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (data.novo_vale) {
      setValeTrocoToast({ numero: data.novo_vale.numero, valor: data.novo_vale.valor_original });
    }
  }

  // ─── Vale troca validar ───────────────────────────────────────────────────
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
      const d = await res.json() as { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null };
      setValeValidacao(d);
    } catch { setValeValidacao({ ok: false, erro: "Erro ao validar" }); }
    finally { setValeValidando(false); }
  }

  async function handleAddPagamento() {
    const restante = +(totalVenda - pagamentos.reduce((s, p) => s + p.valor, 0)).toFixed(2);
    const v = parseFloat(pagValor.replace(",", "."));
    if (!v || v <= 0 || restante <= 0) return;
    const valorFinal = Math.min(v, restante);
    const parcelas = pagMultForma === "Cartão de Crédito" ? pagMultParcelas : 1;
    const key = uid();
    setPagamentos(prev => [...prev, { _key: key, forma: pagMultForma, valor: valorFinal, parcelas }]);
    setPagValor("");

    // Pré-cria registro DB para formas gateway, permitindo múltiplos widgets independentes
    if (vendaId && ["Pix", "Cartão de Crédito"].includes(pagMultForma)) {
      try {
        const res = await fetch(`/api/vendas/${vendaId}/pagamentos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forma: pagMultForma, valor: valorFinal, parcelas }),
        });
        if (res.ok) {
          const data = await res.json() as { id: number };
          setPagamentos(prev => prev.map(p => p._key === key ? { ...p, db_id: data.id } : p));
        }
      } catch { /* ignora — widget funciona sem db_id (fallback para comportamento antigo) */ }
    }
  }

  async function handleRemovePagamento(p: Pagamento) {
    setPagamentos(prev => prev.filter(x => x._key !== p._key));
    if (p.db_id && vendaId) {
      try {
        await fetch(`/api/vendas/${vendaId}/pagamentos/${p.db_id}`, { method: "DELETE" });
      } catch { /* ignora */ }
    }
  }

  // ─── Navigate between steps ───────────────────────────────────────────────
  async function avancar() {
    setSaveErr("");
    // Validações por step
    if (step === 1 && !cliente) { setSaveErr("Selecione um cliente para continuar"); return; }
    if (step === 2 && !tipoVenda) { setSaveErr("Selecione o tipo de venda"); return; }
    if (step === 2 && tipoVenda === "garantia" && !vendaGarantiaId) { setSaveErr("Selecione a venda em garantia"); return; }
    if (step === 3 && tipoVenda === "servico") {
      const pesoSvc = parseFloat(svcPesoMetal.replace(",", "."));
      if (!svcPesoMetal || isNaN(pesoSvc) || pesoSvc <= 0) { setSaveErr("Informe o peso do metal externo"); return; }
      if (!svcFotoB64) { setSaveErr("Foto da balança é obrigatória"); return; }
      if (!validacaoSvcFoto?.match) { setSaveErr("Valide a foto com a IA antes de continuar"); return; }
      if (itens.length === 0) { setSaveErr("Adicione pelo menos 1 serviço para faturamento"); return; }
    }
    if (step === 3 && tipoVenda !== "servico" && itens.length === 0) { setSaveErr("Adicione pelo menos 1 item"); return; }
    if (step === 3 && precisaAprovacaoDesconto) { setSaveErr("Desconto acima de 30% requer aprovação. Clique em 'Solicitar Aprovação'."); return; }
    // Valida pendencias de personalizacao no passo 3
    if (step === 3) {
      const pendencias = itens
        .map((it, idx) => {
          const cfg = it.produto_id != null ? personalizacoesCache[it.produto_id] : null;
          const erro = validarItemPersonalizacao(it, cfg);
          if (!erro) return null;
          return `Item ${idx + 1}${it.sku ? ` (SKU ${it.sku})` : ""} — ${erro}`;
        })
        .filter((x): x is string => x !== null);
      if (pendencias.length > 0) {
        setSaveErr(`Pendências de personalização:\n• ${pendencias.join("\n• ")}`);
        return;
      }
    }
    // Bloqueia avanço se há descontos aguardando autorização (step 3 = Produtos)
    if (step === 3 && tipoVenda !== "servico") {
      const authPendente = Object.values(pendingAuths).some(a => a.status === "local" || a.status === "pendente");
      if (authPendente) {
        setSaveErr("Existem descontos acima de 30% aguardando autorização da direção.");
        return;
      }
    }
    if (step === 4 && tipoVenda !== "servico" && !modoEntrega) { setSaveErr("Selecione o modo de entrega"); return; }
    if (step === 4 && tipoVenda === "servico" && !modoEntrega) { setSaveErr("Selecione o modo de entrega"); return; }

    if (step === 5) {
      if (pagForma === "Múltiplas" && !pagamentoCobre) {
        setSaveErr("Os pagamentos não cobrem o total da venda"); return;
      }
      if (pagForma === "Vale-Troca" && !valeValidacao?.ok) {
        setSaveErr("Valide o vale-troca antes de continuar"); return;
      }
    }

    // Auto-save ao entrar no passo 5 (sem pagamentos — forma é escolhida no passo 5)
    if (step === 4) {
      setSaving(true);
      try {
        await salvarRascunho({ skipPagamentos: true });
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : "Erro ao salvar");
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setStep(s => Math.min(s + 1, 6));
  }

  function voltar() {
    setSaveErr("");
    setStep(s => Math.max(s - 1, 1));
  }

  // ─── Solicitar aprovação de desconto (step 3) ────────────────────────────
  async function pedirAprovacaoDesconto() {
    setPedindoAprovacao(true); setSaveErr("");
    try {
      let idFinal = vendaId;
      if (!idFinal) {
        const { id } = await salvarRascunho({ skipPagamentos: true });
        idFinal = id;
      }
      const apRes = await fetch(`/api/vendas/${idFinal}/solicitar-aprovacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "desconto" }),
      });
      const apData = await apRes.json();
      if (!apRes.ok) throw new Error(apData.error ?? "Erro ao solicitar aprovação de desconto");
      setAprovacaoDescontoEnviada(true);
      setShowModalFim(true);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao solicitar aprovação");
    } finally {
      setPedindoAprovacao(false);
    }
  }

  // ─── Concluir venda ───────────────────────────────────────────────────────
  async function concluirVenda(vendaIdOverride?: number) {
    setConcluindo(true); setSaveErr("");
    if (precisaAprovacaoDesconto) {
      setSaveErr("Esta venda tem desconto acima de 30% aguardando aprovação. Retorne ao passo 3 e clique em 'Solicitar Aprovação'.");
      setConcluindo(false);
      return;
    }
    try {
      // Ensure we have a vendaId
      let idFinal = vendaIdOverride ?? vendaId;
      const foiPresalva = !!idFinal;
      if (!idFinal) {
        // Fresh venda: salvarRascunho cria com pagamentos incluídos
        const { id } = await salvarRascunho();
        idFinal = id;
      }

      // Se a venda foi pré-salva (step 4) sem pagamentos, criar agora os pagamentos não-gateway
      if (foiPresalva) {
        const formasGateway = ["Pix", "Cartão de Crédito", "Vale-Troca"];
        const pagList: Array<{ forma: string; valor: number; parcelas: number }> = [];
        if (pagForma === "Múltiplas") {
          pagamentos
            .filter(p => !formasGateway.includes(p.forma))
            .forEach(p => pagList.push({ forma: p.forma, valor: p.valor, parcelas: p.parcelas || 1 }));
        } else if (!formasGateway.includes(pagForma)) {
          pagList.push({
            forma: pagForma,
            valor: totalVenda,
            parcelas: pagCondicao === "À vista" ? 1 : parseInt(pagCondicao),
          });
        }
        for (const p of pagList) {
          const res = await fetch(`/api/vendas/${idFinal}/pagamentos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          });
          if (!res.ok) {
            const d = await res.json() as { error?: string };
            throw new Error(d.error ?? "Erro ao registrar pagamento");
          }
        }
      }

      // Aplicar Vale-Troca se necessário
      const pagValeItem = pagForma === "Múltiplas" ? pagamentos.find(p => p.forma === "Vale-Troca") : null;
      const usaVale = pagForma === "Vale-Troca" || !!pagValeItem;
      if (usaVale) {
        const valeNumeroFinal = pagForma === "Vale-Troca" ? valeNumero.trim() : (pagValeItem?.vale_numero ?? "");
        if (!valeNumeroFinal) throw new Error("Número do vale-troca obrigatório");
        const valorVale = pagValeItem ? pagValeItem.valor : totalVenda;
        await aplicarValeNaVenda(idFinal, valorVale, valeNumeroFinal);
      }

      if (temAReceber) {
        const apRes = await fetch(`/api/vendas/${idFinal}/solicitar-aprovacao`, { method: "POST" });
        const apData = await apRes.json();
        if (!apRes.ok) throw new Error(apData.error ?? "Erro ao solicitar aprovação");
        setAprovacaoEnviada(true);
      } else {
        await fetch(`/api/vendas/${idFinal}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ situacao: "aprovado" }),
        });
      }

      // Auto-criar ordem de serviço para tipo "servico"
      if (tipoVenda === "servico") {
        try {
          const pesoExterno = parseFloat(svcPesoMetal.replace(",", "."));
          const ordemBody: Record<string, unknown> = {
            tipo_ordem: "servico_venda",
            cliente_id: cliente?.id ?? null,
            foto_peca_servico_base64: svcFotoB64,
            peso_metal_externo: pesoExterno,
            venda_id: idFinal,
            itens: itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
          };
          if (svcVideoB64) ordemBody.video_observacao_base64 = svcVideoB64;
          const ordemRes = await fetch("/api/ordens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ordemBody),
          });
          const ordemData = await ordemRes.json();
          if (ordemRes.ok) setOrdemCriada(ordemData);
          else console.error("[concluirVenda] Erro ao criar ordem:", ordemData.error);
        } catch (err) {
          console.error("[concluirVenda] Erro ao criar ordem:", err);
        }
      }

      setShowModalFim(true);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao concluir");
    } finally {
      setConcluindo(false);
    }
  }

  // ─── Mapeamento tipo → ordem ──────────────────────────────────────────────
  function tipoParaOrdem() {
    if (tipoVenda === "produto") return "fabricacao";
    if (tipoVenda === "servico") return "servico_venda";
    if (tipoVenda === "garantia") return "garantia";
    return "fabricacao";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JSX
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="px-3 md:px-6 py-4 md:py-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 rounded-full" style={{ backgroundColor: C.esmeralda }} />
          <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "#1A1A1A" }}>
            Nova Venda
          </h2>
          {numeroVenda && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
              {numeroVenda}
            </span>
          )}
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
            Passo {step} de 6
          </span>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar step={step} total={6} tipoVenda={tipoVenda} />

      {/* Card */}
      <div className="rounded-xl border bg-white" style={{ borderColor: C.cremeBorder }}>

        {/* ── PASSO 1: Cliente ── */}
        {step === 1 && (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4" style={{ color: "#1A1A1A" }}>
              <User size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Selecionar Cliente
            </h3>

            {!showNovoClienteForm ? (
              <>
                <div className="mb-4">
                  <Label required>Buscar cliente</Label>
                  <Autocomplete<Cliente>
                    placeholder="Digite nome, CPF/CNPJ ou telefone..."
                    onSearch={async q => {
                      const r = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(q)}`);
                      return r.json();
                    }}
                    renderItem={c => (
                      <div>
                        <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{c.nome}</p>
                        <p className="text-xs" style={{ color: "#9CA3AF" }}>
                          {c.cpf_cnpj ? maskCpfCnpj(c.cpf_cnpj) : (c.telefone ?? "—")}
                        </p>
                      </div>
                    )}
                    onSelect={c => { setCliente(c); setClienteSemResultados(false); }}
                    selectedLabel={cliente ? `${cliente.nome}${cliente.cpf_cnpj ? ` · ${maskCpfCnpj(cliente.cpf_cnpj)}` : ""}` : null}
                    onClear={() => { setCliente(null); setClienteSemResultados(false); }}
                    onNoResults={() => setClienteSemResultados(true)}
                    onClearResults={() => setClienteSemResultados(false)}
                  />
                </div>

                {cliente && !editandoCliente && (
                  <div className="rounded-xl border p-4 mb-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{cliente.nome}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setNovoClienteForm({
                              nome: cliente.nome ?? "",
                              cpf_cnpj: cliente.cpf_cnpj ?? "",
                              email: cliente.email ?? "",
                              telefone: cliente.telefone ?? "",
                              celular: cliente.celular ?? "",
                              cep: cliente.cep ?? "",
                              endereco: cliente.endereco ?? "",
                              numero: cliente.numero ?? "",
                              complemento: "",
                              bairro: cliente.bairro ?? "",
                              municipio: cliente.municipio ?? "",
                              uf: cliente.uf ?? "",
                            });
                            setClienteErr("");
                            setEditandoCliente(true);
                          }}
                          className="text-gray-400 hover:text-gray-600"
                          title="Editar dados do cliente"
                        >
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setCliente(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs" style={{ color: "#6B7280" }}>
                      {cliente.cpf_cnpj && <div><span className="font-medium">CPF/CNPJ:</span> <span className="font-mono">{maskCpfCnpj(cliente.cpf_cnpj)}</span></div>}
                      {cliente.email && <div><span className="font-medium">Email:</span> {cliente.email}</div>}
                      {cliente.telefone && <div><span className="font-medium">Tel:</span> {cliente.telefone}</div>}
                      {cliente.celular && <div><span className="font-medium">Cel:</span> {cliente.celular}</div>}
                      {(cliente.endereco || cliente.municipio) && (
                        <div className="col-span-2 md:col-span-3">
                          <span className="font-medium">End:</span>{" "}
                          {[cliente.endereco, cliente.numero, cliente.bairro, cliente.municipio, cliente.uf].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {cliente && editandoCliente && (
                  <div className="space-y-4 mb-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold" style={{ color: "#374151" }}>Editar Cliente</p>
                      <button onClick={() => { setEditandoCliente(false); setClienteErr(""); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label required>Nome</Label><Input value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({ ...p, nome: e.target.value }))} /></div>
                      <div><Label>CPF/CNPJ</Label><Input value={novoClienteForm.cpf_cnpj} onChange={e => setNovoClienteForm(p => ({ ...p, cpf_cnpj: e.target.value }))} /></div>
                      <div><Label>Email</Label><Input type="email" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({ ...p, email: e.target.value }))} /></div>
                      <div><Label>Telefone</Label><Input value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                      <div><Label>Celular</Label><Input value={novoClienteForm.celular} onChange={e => setNovoClienteForm(p => ({ ...p, celular: e.target.value }))} /></div>
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <Label>CEP</Label>
                          <Input value={novoClienteForm.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }} />
                        </div>
                        <div className="md:col-span-2"><Label>Logradouro</Label><Input value={novoClienteForm.endereco} onChange={e => setNovoClienteForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                        <div><Label>Número</Label><Input value={novoClienteForm.numero} onChange={e => setNovoClienteForm(p => ({ ...p, numero: e.target.value }))} /></div>
                        <div><Label>Complemento</Label><Input value={novoClienteForm.complemento} onChange={e => setNovoClienteForm(p => ({ ...p, complemento: e.target.value }))} /></div>
                        <div><Label>Bairro</Label><Input value={novoClienteForm.bairro} onChange={e => setNovoClienteForm(p => ({ ...p, bairro: e.target.value }))} /></div>
                        <div><Label>Município</Label><Input value={novoClienteForm.municipio} onChange={e => setNovoClienteForm(p => ({ ...p, municipio: e.target.value }))} /></div>
                        <div><Label>UF</Label><Input value={novoClienteForm.uf} maxLength={2} onChange={e => setNovoClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                      </div>
                    </div>
                    {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setEditandoCliente(false); setClienteErr(""); }} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                      <button onClick={handleEditarCliente} disabled={savingCliente} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                        {savingCliente ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar Alterações
                      </button>
                    </div>
                  </div>
                )}

                {!cliente && clienteSemResultados && (
                  <button
                    onClick={() => { setShowNovoClienteForm(true); setClienteErr(""); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border hover:bg-stone-50 transition-colors"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                  >
                    <Plus size={14} /> Cadastrar novo cliente
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: "#374151" }}>Novo Cliente</p>
                  <button onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label required>Nome</Label>
                    <Input value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label>CPF/CNPJ</Label>
                    <Input
                      value={novoClienteForm.cpf_cnpj}
                      onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cpf_cnpj: v })); checkCpfDuplicado(v); }}
                      placeholder="000.000.000-00"
                      style={{ borderColor: cpfExistente ? "#EF4444" : C.cremeBorder }}
                    />
                    {cpfExistente && (
                      <p className="text-xs text-red-500 mt-1">
                        Já cadastrado: {cpfExistente}
                        <button
                          className="ml-2 underline"
                          onClick={() => {
                            // Search for it
                            setShowNovoClienteForm(false);
                          }}
                        >
                          Buscar
                        </button>
                      </p>
                    )}
                  </div>
                  <div><Label>Email</Label><Input type="email" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                  <div><Label>Celular</Label><Input value={novoClienteForm.celular} onChange={e => setNovoClienteForm(p => ({ ...p, celular: e.target.value }))} /></div>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <Label>CEP</Label>
                      <Input
                        value={novoClienteForm.cep}
                        placeholder="00000-000"
                        onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }}
                      />
                    </div>
                    <div className="md:col-span-2"><Label>Logradouro</Label><Input value={novoClienteForm.endereco} onChange={e => setNovoClienteForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                    <div><Label>Número</Label><Input value={novoClienteForm.numero} onChange={e => setNovoClienteForm(p => ({ ...p, numero: e.target.value }))} /></div>
                    <div><Label>Complemento</Label><Input value={novoClienteForm.complemento} onChange={e => setNovoClienteForm(p => ({ ...p, complemento: e.target.value }))} /></div>
                    <div><Label>Bairro</Label><Input value={novoClienteForm.bairro} onChange={e => setNovoClienteForm(p => ({ ...p, bairro: e.target.value }))} /></div>
                    <div><Label>Município</Label><Input value={novoClienteForm.municipio} onChange={e => setNovoClienteForm(p => ({ ...p, municipio: e.target.value }))} /></div>
                    <div><Label>UF</Label><Input value={novoClienteForm.uf} maxLength={2} onChange={e => setNovoClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                  </div>
                </div>
                {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                  <button onClick={handleCriarCliente} disabled={savingCliente} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    {savingCliente ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar Cliente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PASSO 2: Tipo de Venda ── */}
        {step === 2 && (
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#1A1A1A" }}>
              <Star size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Tipo de Venda
            </h3>
            {vendedores.length > 0 ? (
              <div className="flex items-center gap-2 mb-4 text-sm rounded-lg px-3 py-2" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                <User size={13} style={{ color: C.esmeralda }} />
                <span style={{ color: "#6B7280" }}>Consultora:</span>
                <select
                  value={selVendedorId ?? ""}
                  onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSelVendedorId(id);
                    setSelVendedorNome(vendedores.find(v => v.id === id)?.nome ?? "");
                  }}
                  className="flex-1 bg-transparent font-medium outline-none cursor-pointer"
                  style={{ color: "#1A1A1A" }}
                >
                  <option value="">— Selecione —</option>
                  {vendedores.map(v => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-4 text-sm rounded-lg px-3 py-2" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                <User size={13} style={{ color: C.esmeralda }} />
                <span style={{ color: "#6B7280" }}>Consultora:</span>
                <span className="font-medium" style={{ color: "#1A1A1A" }}>{selVendedorNome || "—"}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              {([
                { key: "produto", icon: "🏷️", label: "Produto", desc: "Venda de produto do estoque" },
                { key: "servico", icon: "🔧", label: "Serviço", desc: "Conserto ou reforma" },
                { key: "garantia", icon: "🛡️", label: "Garantia", desc: "Garantia de venda anterior" },
              ] as const).map(({ key, icon, label, desc }) => (
                <button
                  key={key}
                  onClick={() => {
                    setTipoVenda(key);
                    setVendaGarantiaId(null);
                    if (key === "garantia" && cliente) loadHistoricoVendas(cliente.id);
                  }}
                  className="text-left p-4 rounded-xl border-2 transition-all hover:shadow-sm"
                  style={{
                    borderColor: tipoVenda === key ? C.esmeralda : C.cremeBorder,
                    backgroundColor: tipoVenda === key ? C.esmeraldaLt : "white",
                  }}
                >
                  <div className="text-2xl mb-2">{icon}</div>
                  <p className="font-semibold text-sm" style={{ color: tipoVenda === key ? C.esmeralda : "#1A1A1A" }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{desc}</p>
                </button>
              ))}
            </div>

            {tipoVenda === "garantia" && (
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <p className="text-sm font-semibold mb-3" style={{ color: "#374151" }}>
                  <AlertCircle size={14} className="inline mr-1.5" style={{ color: "#D97706" }} />
                  Selecione a venda em garantia
                </p>
                {loadingHistorico ? (
                  <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={14} className="animate-spin" /> Carregando histórico...
                  </div>
                ) : historicoVendas.length === 0 ? (
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>
                    {cliente ? "Nenhuma venda encontrada para este cliente" : "Selecione um cliente primeiro"}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {historicoVendas.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setVendaGarantiaId(v.id)}
                        className="w-full text-left p-3 rounded-lg border transition-all"
                        style={{
                          borderColor: vendaGarantiaId === v.id ? C.esmeralda : C.cremeBorder,
                          backgroundColor: vendaGarantiaId === v.id ? C.esmeraldaLt : "white",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium" style={{ color: vendaGarantiaId === v.id ? C.esmeralda : "#1A1A1A" }}>
                            {v.numero_venda}
                          </span>
                          <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(v.total_venda)}</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                          {formatDateBR(v.data_venda)} · {v.itens_resumo}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PASSO 3: Serviço (apenas tipo servico) ── */}
        {step === 3 && tipoVenda === "servico" && (
          <div className="p-6 space-y-5">
            <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
              <Wrench size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Informações do Serviço
            </h3>

            {/* Produto/Serviço para faturamento */}
            <div>
              <Label required>Serviço para Faturamento</Label>
              {itens.length > 0 && (
                <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.cremeBorder }}>
                  <table className="w-full text-sm">
                    <thead style={{ backgroundColor: C.cremeBg }}>
                      <tr>
                        {["Descrição", "Qtde", "Desconto", "Preço Un", "Total", ""].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(item => (
                        <tr key={item._key} className="border-t hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                          <td className="px-3 py-2 font-medium" style={{ color: "#1A1A1A" }}>{item.nome_produto}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="number" min={1} value={item.quantidade}
                              onChange={e => updateItem(item._key, "quantidade", e.target.value)}
                              className="w-14 border rounded px-1.5 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                          </td>
                          <td className="px-3 py-2 tabular-nums text-xs" style={{ color: "#6B7280" }}>
                            {item.pct_desconto > 0 ? `${item.pct_desconto}%` : "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_unitario)}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(item.total_item)}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))} className="text-gray-300 hover:text-red-400"><X size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="p-4 rounded-xl border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <Autocomplete<Produto>
                  placeholder="Buscar serviço por nome ou SKU..."
                  onSearch={async q => { const r = await fetch(`/api/vendas/produtos/busca?q=${encodeURIComponent(q)}&limit=15&servico=1`); return r.json(); }}
                  renderItem={p => (
                    <div>
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>{p.sku} · {p.preco_venda != null ? fmt(p.preco_venda) : "sem preço"}</p>
                    </div>
                  )}
                  onSelect={p => { setProdutoSel(p); setPctDesconto(0); setDescontoErr(""); }}
                  selectedLabel={produtoSel ? `${produtoSel.nome} · ${fmt(produtoSel.preco_venda ?? 0)}` : null}
                  onClear={() => { setProdutoSel(null); setDescontoErr(""); }}
                />
                {produtoSel && (
                  <div className="mt-3 flex items-end gap-3 flex-wrap">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Qtd</label>
                      <input type="number" min={1} value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
                        className="w-16 border rounded-lg px-2 py-1.5 text-sm outline-none text-center" style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Desconto %</label>
                      <input type="number" min={0} step={1} value={pctDesconto}
                        onChange={e => { const v = Number(e.target.value) || 0; setPctDesconto(v); setDescontoErr(""); }}
                        className="w-20 border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                        style={{ borderColor: pctDesconto > LIMITE_DESCONTO_APROVACAO ? "#F97316" : C.cremeBorder, color: pctDesconto > LIMITE_DESCONTO_APROVACAO ? "#EA580C" : undefined }} />
                      {pctDesconto > LIMITE_DESCONTO_APROVACAO && <p className="text-[11px] mt-0.5" style={{ color: "#EA580C" }}>Precisa aprovação</p>}
                    </div>
                    <div className="text-xs" style={{ color: "#6B7280" }}>
                      = {produtoSel ? fmt(calcItem(produtoSel, qtd, pctDesconto).preco_unitario) : "—"}
                    </div>
                    <button onClick={handleAddItem} disabled={false}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                      style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      <Plus size={14} /> Adicionar
                    </button>
                  </div>
                )}
              </div>

              {itens.length > 0 && (
                <div className="pt-2 flex justify-end">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>Total: {fmt(totalProdutos)}</span>
                </div>
              )}
            </div>

            {/* Peso + Foto balança */}
            <div className="space-y-3">
              <div>
                <Label required>Peso do Metal Externo (g)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={svcPesoMetal}
                  onChange={e => { setSvcPesoMetal(e.target.value); setValidacaoSvcFoto(null); }}
                  placeholder="Ex: 2,50"
                  className="max-w-[200px]"
                />
              </div>

              <div>
                <Label required>Foto da Balança</Label>
                <div className="flex flex-col gap-3">
                  <label
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer hover:bg-stone-50 transition-colors w-full"
                    style={{ borderColor: svcFotoB64 ? C.esmeralda : C.cremeBorder }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      capture={"environment" as unknown as boolean}
                      className="hidden"
                      onChange={handleSvcFotoChange}
                    />
                    {svcFotoB64
                      ? <span className="text-sm font-medium" style={{ color: C.esmeralda }}>Foto selecionada — toque para trocar</span>
                      : <span className="text-sm" style={{ color: "#6B7280" }}>📷 Tirar foto ou selecionar da galeria</span>
                    }
                  </label>

                  {svcFotoPreview && (
                    <div className="relative w-fit">
                      <img src={svcFotoPreview} alt="Preview" className="w-40 h-28 object-cover rounded-lg border" style={{ borderColor: C.cremeBorder }} />
                      <button
                        onClick={() => { setSvcFotoB64(null); setSvcFotoPreview(null); setValidacaoSvcFoto(null); }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center bg-red-500 text-white"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  {svcFotoB64 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {validandoSvcFoto ? (
                        <div className="flex items-center gap-2 text-sm" style={{ color: "#9CA3AF" }}>
                          <Loader2 size={14} className="animate-spin" /> Validando com IA...
                        </div>
                      ) : validacaoSvcFoto ? (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${validacaoSvcFoto.match ? "bg-green-50" : "bg-red-50"}`}
                          style={{ color: validacaoSvcFoto.match ? "#065F46" : "#991B1B" }}>
                          {validacaoSvcFoto.match ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                          <span>{validacaoSvcFoto.mensagem}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            const peso = parseFloat(svcPesoMetal.replace(",", "."));
                            if (!peso || isNaN(peso) || peso <= 0) { setSaveErr("Informe o peso antes de validar"); return; }
                            if (svcFotoB64) validarFotoServico(svcFotoB64, peso);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}
                        >
                          Validar com IA
                        </button>
                      )}
                      {validacaoSvcFoto && !validandoSvcFoto && (
                        <button
                          onClick={() => {
                            const peso = parseFloat(svcPesoMetal.replace(",", "."));
                            if (svcFotoB64 && peso > 0) validarFotoServico(svcFotoB64, peso);
                          }}
                          className="text-xs underline"
                          style={{ color: "#9CA3AF" }}
                        >
                          Revalidar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Vídeo (opcional) */}
            <div>
              <Label>
                Detalhes em Vídeo{" "}
                <span className="font-normal text-xs" style={{ color: "#9CA3AF" }}>(opcional)</span>
              </Label>
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer w-fit hover:bg-stone-50 transition-colors" style={{ borderColor: C.cremeBorder }}>
                <input
                  type="file"
                  accept="video/*"
                  capture={"environment" as unknown as boolean}
                  className="hidden"
                  onChange={handleSvcVideoChange}
                />
                <Video size={15} style={{ color: C.esmeralda }} />
                <span className="text-sm" style={{ color: "#374151" }}>
                  {svcVideoNome ?? "Gravar ou selecionar vídeo"}
                </span>
                {svcVideoNome && (
                  <span
                    className="ml-1"
                    onClick={e => { e.preventDefault(); setSvcVideoB64(null); setSvcVideoNome(null); }}
                  >
                    <X size={12} style={{ color: "#9CA3AF" }} />
                  </span>
                )}
              </label>
            </div>

          </div>
        )}

        {/* ── PASSO 3: Entrega (não-servico) / PASSO 4: Entrega (servico) ── */}
        {((step === 4 && tipoVenda !== "servico") || (step === 4 && tipoVenda === "servico")) && (
          <div className="p-6 space-y-5">
            <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
              <Truck size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Entrega
            </h3>

            {/* 3a. Modo entrega */}
            <div>
              <Label required>Modo de entrega</Label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: "loja", icon: "🏪", label: "Retirada na Loja", desc: "Sem frete" },
                  { key: "correios", icon: "📦", label: "Correios", desc: "Com rastreio" },
                  { key: "motoboy", icon: "🏍️", label: "Motoboy", desc: "Entrega local" },
                  { key: "uber", icon: "🚗", label: "Uber", desc: "Entrega por app" },
                ] as const).map(({ key, icon, label, desc }) => (
                  <button
                    key={key}
                    onClick={() => { setModoEntrega(key); if (key === "loja") setTotalFrete(0); }}
                    className="text-left p-3 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: modoEntrega === key ? C.esmeralda : C.cremeBorder,
                      backgroundColor: modoEntrega === key ? C.esmeraldaLt : "white",
                    }}
                  >
                    <div className="text-xl mb-1">{icon}</div>
                    <p className="font-semibold text-xs" style={{ color: modoEntrega === key ? C.esmeralda : "#374151" }}>{label}</p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 3b. Endereço de entrega (se não for retirada) */}
            {modoEntrega && modoEntrega !== "loja" && (
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <div>
                  <Label>O endereço de entrega é o mesmo do cadastro do cliente?</Label>
                  <div className="flex gap-4 mt-1">
                    {[{ v: true, l: "Sim, usar endereço do cliente" }, { v: false, l: "Não, outro endereço" }].map(({ v, l }) => (
                      <label key={String(v)} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#374151" }}>
                        <input
                          type="radio"
                          checked={usarEnderecoCliente === v}
                          onChange={() => setUsarEnderecoCliente(v)}
                          className="accent-emerald-700"
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                {usarEnderecoCliente && cliente && (
                  <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, backgroundColor: "white" }}>
                    <p className="text-xs font-medium mb-1" style={{ color: C.esmeralda }}>
                      <MapPin size={11} className="inline mr-1" />Endereço do cliente
                    </p>
                    <p style={{ color: "#374151" }}>
                      {[cliente.endereco, cliente.numero, cliente.bairro, cliente.municipio, cliente.uf, cliente.cep].filter(Boolean).join(", ") || "Endereço não cadastrado"}
                    </p>
                  </div>
                )}

                {!usarEnderecoCliente && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Label>CEP</Label>
                        <Input
                          value={enderecoEntrega.cep}
                          placeholder="00000-000"
                          onChange={e => {
                            const v = e.target.value;
                            setEnderecoEntrega(p => ({ ...p, cep: v }));
                            if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "entrega");
                          }}
                        />
                      </div>
                      <div className="md:col-span-2"><Label>Logradouro</Label><Input value={enderecoEntrega.logradouro} onChange={e => setEnderecoEntrega(p => ({ ...p, logradouro: e.target.value }))} /></div>
                      <div><Label>Número</Label><Input value={enderecoEntrega.numero} onChange={e => setEnderecoEntrega(p => ({ ...p, numero: e.target.value }))} /></div>
                      <div><Label>Complemento</Label><Input value={enderecoEntrega.complemento} onChange={e => setEnderecoEntrega(p => ({ ...p, complemento: e.target.value }))} /></div>
                      <div><Label>Bairro</Label><Input value={enderecoEntrega.bairro} onChange={e => setEnderecoEntrega(p => ({ ...p, bairro: e.target.value }))} /></div>
                      <div><Label>Município</Label><Input value={enderecoEntrega.municipio} onChange={e => setEnderecoEntrega(p => ({ ...p, municipio: e.target.value }))} /></div>
                      <div><Label>UF</Label><Input value={enderecoEntrega.uf} maxLength={2} onChange={e => setEnderecoEntrega(p => ({ ...p, uf: e.target.value.toUpperCase() }))} /></div>
                    </div>
                  </div>
                )}

                {/* Frete */}
                <div>
                  <Label>Frete (R$)</Label>
                  {loadingFrete ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "#9CA3AF" }}>
                      <Loader2 size={13} className="animate-spin" /> Calculando frete...
                    </div>
                  ) : fretePersonalizado ? (
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={totalFrete || ""}
                        onChange={e => setTotalFrete(Number(e.target.value) || 0)}
                        placeholder="0,00"
                        className="max-w-[180px]"
                      />
                      <span className="text-xs" style={{ color: "#9CA3AF" }}>Valor personalizado</span>
                    </div>
                  ) : (
                    <div className="rounded-lg border px-3 py-2.5 text-sm font-medium w-fit" style={{ borderColor: C.cremeBorder, backgroundColor: "white", color: C.esmeralda }}>
                      {fmt(freteCalculado ?? 0)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3c. Rastreio */}
            {modoEntrega && modoEntrega !== "loja" && modoEntrega !== "motoboy" && modoEntrega !== "uber" && (
              <div>
                <Label>Número de Rastreio</Label>
                <Input
                  value={numeroRastreio}
                  onChange={e => setNumeroRastreio(e.target.value)}
                  placeholder="Ex: BR123456789BR"
                />
                {!numeroRastreio && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#FEF9C3", color: "#854D0E" }}>
                    <AlertCircle size={12} /> Número de rastreio não informado
                  </div>
                )}
              </div>
            )}

            {/* 3d. Datas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data da Venda</Label>
                <div className="rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, color: "#6B7280" }}>
                  {new Date().toLocaleString("pt-BR")}
                </div>
              </div>
              <div>
                <Label>Data de Entrega</Label>
                <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── PASSO 4: Produtos/Serviços (não-servico apenas) ── */}
        {step === 3 && tipoVenda !== "servico" && (
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
              <Package size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Produtos
              {tipoVenda === "garantia" && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                  Garantia da venda {historicoVendas.find(v => v.id === vendaGarantiaId)?.numero_venda ?? ""}
                </span>
              )}
            </h3>

            {/* Tabela de itens */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.cremeBg }}>
                  <tr>
                    {["Nº", "Descrição", tipoVenda === "produto" || tipoVenda === "garantia" ? "SKU" : "", "Qtde", "Preço Lista",
                      tipoVenda === "produto" || tipoVenda === "garantia" ? "% Desc" : "",
                      tipoVenda === "produto" || tipoVenda === "garantia" ? "R$ Desc" : "",
                      "Preço Un",
                      tipoVenda === "produto" || tipoVenda === "garantia" ? "Comissão" : "",
                      "Total", ""].filter(Boolean).map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Nenhum item adicionado</td></tr>
                  )}
                  {itens.map((item, idx) => {
                    const configPers = item.produto_id != null
                      ? personalizacoesCache[item.produto_id]
                      : null;
                    const erroPers = validarItemPersonalizacao(item, configPers);
                    const numCols = tipoVenda === "produto" || tipoVenda === "garantia" ? 11 : 7;
                    return (
                      <>
                        <tr key={item._key} className="border-t hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                          <td className="px-3 py-2.5 text-xs" style={{ color: "#9CA3AF" }}>{idx + 1}</td>
                          <td className="px-3 py-2.5 max-w-[200px] font-medium" style={{ color: "#1A1A1A" }}>
                            <span className="block truncate">{item.nome_produto}</span>
                            {tipoVenda === "produto" && item.saldo_disponivel < item.quantidade && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5"
                                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                                Sob encomenda · estoque: {item.saldo_disponivel}
                              </span>
                            )}
                          </td>
                          {(tipoVenda === "produto" || tipoVenda === "garantia") && (
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{item.sku ?? "—"}</td>
                          )}
                          <td className="px-3 py-2.5">
                            <input type="number" min={1} value={item.quantidade}
                              onChange={e => updateItem(item._key, "quantidade", e.target.value)}
                              className="w-14 border rounded px-1.5 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                          </td>
                          <td className="px-3 py-2.5">
                            <PrecoListaInput
                              value={item.preco_lista}
                              onCommit={val => updateItem(item._key, "preco_lista", val)}
                            />
                          </td>
                          {(tipoVenda === "produto" || tipoVenda === "garantia") && (<>
                            <td className="px-3 py-2.5">
                              {descontoAuthThreshold != null ? (() => {
                                const auth = pendingAuths[item._key];
                                const displayPct = auth?.pct ?? item.pct_desconto;
                                const isPending = auth?.status === "local" || auth?.status === "pendente";
                                const isApproved = auth?.status === "aprovado";
                                const isRejected = auth?.status === "rejeitado";
                                return (
                                  <div className="flex items-center gap-1">
                                    <input type="number" min={0} max={maxDesconto} step={0.01}
                                      value={displayPct || ""}
                                      onChange={e => updateItem(item._key, "pct_desconto", e.target.value || "0")}
                                      readOnly={auth?.status === "pendente"}
                                      placeholder="0"
                                      className="w-16 border rounded px-1.5 py-1 text-sm text-center outline-none"
                                      style={{
                                        borderColor: isPending ? "#D97706" : isApproved ? "#059669" : isRejected ? "#EF4444" : C.cremeBorder,
                                        color: isPending ? "#D97706" : isApproved ? "#059669" : undefined,
                                      }} />
                                    {auth?.status === "local" && (
                                      <button onClick={() => void solicitarAutorizacao(item._key)}
                                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
                                        style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #D97706" }}>
                                        Pedir
                                      </button>
                                    )}
                                    {auth?.status === "pendente" && (
                                      <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: "#D97706" }}>⏳ Aguard.</span>
                                    )}
                                    {auth?.status === "aprovado" && (
                                      <span className="text-[10px] font-medium" style={{ color: "#059669" }}>✓</span>
                                    )}
                                    {auth?.status === "rejeitado" && (
                                      <span className="text-[10px] font-medium" style={{ color: "#EF4444" }}>✗ máx 30%</span>
                                    )}
                                  </div>
                                );
                              })() : (
                                <input type="number" min={0} max={maxDesconto} step={0.01}
                                  value={item.pct_desconto || ""}
                                  onChange={e => updateItem(item._key, "pct_desconto", e.target.value || "0")}
                                  placeholder="0"
                                  className="w-20 border rounded px-1.5 py-1 text-sm text-center outline-none"
                                  style={{ borderColor: item.pct_desconto > maxDesconto ? "#F97316" : C.cremeBorder, color: item.pct_desconto > maxDesconto ? "#EA580C" : undefined }} />
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <DescontoValorInput
                                precoLista={item.preco_lista}
                                pctDesconto={item.pct_desconto}
                                onCommit={val => updateItem(item._key, "desconto_valor", val)}
                              />
                            </td>
                          </>)}
                          <td className="px-3 py-2.5">
                            {(tipoVenda === "produto" || tipoVenda === "garantia") ? (
                              <PrecoUnitarioInput
                                precoUnit={item.preco_unitario}
                                onCommit={val => updateItem(item._key, "preco_unitario", val)}
                              />
                            ) : (
                              <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_unitario)}</span>
                            )}
                          </td>
                          {(tipoVenda === "produto" || tipoVenda === "garantia") && (
                            <td className="px-3 py-2.5 tabular-nums text-xs whitespace-nowrap"
                              style={{ color: item.pct_comissao > 0 ? "#184036" : "#9CA3AF" }}>
                              {item.pct_comissao > 0 ? (
                                <span>
                                  <strong>{item.pct_comissao.toFixed(2)}%</strong>
                                  <span className="text-[10px] ml-1" style={{ color: "#6B7280" }}>
                                    ({fmt(item.valor_comissao)})
                                  </span>
                                </span>
                              ) : "—"}
                            </td>
                          )}
                          <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(item.total_item)}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))} className="text-gray-300 hover:text-red-400 transition-colors">
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                        {configPers && (
                          <tr key={item._key + "-pers"} style={{ backgroundColor: "#FFFCF5" }}>
                            <td colSpan={numCols} className="px-3 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
                              <div className="pl-4 border-l-2" style={{ borderColor: "#D4A843" }}>
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>
                                    🏷️ {configPers.label}
                                    {configPers.obrigatorio && <span className="text-red-600 ml-0.5">*</span>}
                                  </span>
                                  <span className="text-[10px] font-normal normal-case text-gray-500">
                                    (máximo {configPers.max_caracteres} caractere{configPers.max_caracteres === 1 ? "" : "s"})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <input
                                    type="text"
                                    value={item.personalizacao?.valor ?? ""}
                                    onChange={(e) => atualizarPersonalizacao(item._key, e.target.value)}
                                    maxLength={configPers.max_caracteres}
                                    placeholder={configPers.placeholder ?? "Ex: JOAO"}
                                    className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2"
                                    style={{
                                      borderColor: erroPers ? "#EF4444" : C.cremeBorder,
                                      letterSpacing: "0.05em",
                                      textTransform: "uppercase",
                                    }}
                                  />
                                  <span
                                    className={`text-xs font-mono tabular-nums px-2 py-1 rounded ${
                                      erroPers ? "text-red-600" : "text-gray-600"
                                    }`}
                                    style={{ backgroundColor: erroPers ? "#FEE2E2" : "#F3F4F6" }}
                                  >
                                    {(item.personalizacao?.valor?.length ?? 0)}/{configPers.max_caracteres}
                                  </span>
                                  {!erroPers && item.personalizacao?.valor && (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                  )}
                                </div>
                                {erroPers && (
                                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    {erroPers}
                                  </p>
                                )}
                                {configPers.exemplo && !item.personalizacao?.valor && !erroPers && (
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    Exemplo: {configPers.exemplo}
                                  </p>
                                )}
                                {/* Preview do calculo quando tem preco_por_letra */}
                                {configPers.preco_por_letra != null && configPers.preco_por_letra > 0 && (
                                  <div
                                    className="mt-2 flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                                    style={{ backgroundColor: "#FFFBF0", borderLeft: "3px solid #D4A843" }}
                                  >
                                    <Calculator className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#D4A843" }} />
                                    <span style={{ color: "#6B7280" }}>
                                      {item.personalizacao?.valor?.trim().length ?? 0} letras × {fmt(configPers.preco_por_letra)} =
                                    </span>
                                    <span className="font-semibold tabular-nums" style={{ color: C.esmeralda }}>
                                      {fmt((item.personalizacao?.valor?.trim().length ?? 0) * configPers.preco_por_letra)}
                                    </span>
                                  </div>
                                )}
                                {/* Preview do peso quando tem peso_por_letra */}
                                {configPers.peso_por_letra != null && configPers.peso_por_letra > 0 && (
                                  <div
                                    className="mt-1 flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                                    style={{ backgroundColor: "#F0F7F4", borderLeft: "3px solid #059669" }}
                                  >
                                    <Scale className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#059669" }} />
                                    <span style={{ color: "#6B7280" }}>
                                      {item.personalizacao?.valor?.trim().length ?? 0} letras × {configPers.peso_por_letra.toFixed(2)} g =
                                    </span>
                                    <span className="font-semibold tabular-nums" style={{ color: "#065F46" }}>
                                      {((item.personalizacao?.valor?.trim().length ?? 0) * configPers.peso_por_letra).toFixed(2)} g
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Aviso itens sem estoque */}
            {tipoVenda === "produto" && itens.some(i => i.saldo_disponivel < i.quantidade) && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
                style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                <span>⚠️</span>
                <span>
                  Itens marcados como <b>sob encomenda</b> não têm estoque suficiente.
                  Uma <b>ordem de reposição será aberta automaticamente</b> ao concluir a venda, com prazo de 10 dias úteis.
                </span>
              </div>
            )}

            {/* Adicionar item */}
            {(tipoVenda === "produto" || tipoVenda === "garantia") && (
              <>
                {addingItem && (
                  <div className="p-4 rounded-xl border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium" style={{ color: "#374151" }}>Adicionar produto</p>
                      <button onClick={() => { setAddingItem(false); setProdutoSel(null); setDescontoErr(""); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                    <Autocomplete<Produto>
                      placeholder="Buscar por nome ou SKU..."
                      onSearch={async q => { const r = await fetch(`/api/vendas/produtos/busca?q=${encodeURIComponent(q)}&limit=15`); return r.json(); }}
                      renderItem={p => (
                        <div>
                          <p className="font-medium text-sm">{p.nome}</p>
                          <p className="text-xs" style={{ color: "#9CA3AF" }}>
                            {p.sku} · {p.preco_venda != null ? fmt(p.preco_venda) : "sem preço"}
                            {" · "}
                            <span style={{ color: p.saldo_disponivel > 0 ? "#059669" : "#D97706", fontWeight: 600 }}>
                              estoque: {p.saldo_disponivel}
                            </span>
                          </p>
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
                          <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>% Desconto</label>
                          <input type="number" min={0} step={1} value={pctDesconto}
                            onChange={e => { const v = Number(e.target.value) || 0; setPctDesconto(v); setDescontoErr(""); }}
                            className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                            style={{ borderColor: pctDesconto > LIMITE_DESCONTO_APROVACAO ? "#F97316" : C.cremeBorder, color: pctDesconto > LIMITE_DESCONTO_APROVACAO ? "#EA580C" : undefined }} />
                          {pctDesconto > LIMITE_DESCONTO_APROVACAO && <p className="text-[11px] mt-0.5" style={{ color: "#EA580C" }}>Precisa aprovação</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Preço un</label>
                          <div className="border rounded-lg px-2 py-1.5 text-sm text-center tabular-nums" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                            {produtoSel ? fmt(calcItem(produtoSel, qtd, pctDesconto).preco_unitario) : "—"}
                          </div>
                        </div>
                        <button onClick={handleAddItem} disabled={false}
                          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                          <Plus size={14} /> Confirmar
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => setAddingItem(true)} disabled={addingItem}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                  <Plus size={14} /> Adicionar produto
                </button>
              </>
            )}


            {/* Subtotal */}
            {itens.length > 0 && (
              <div className="pt-4 border-t flex items-center justify-between" style={{ borderColor: C.cremeBorder }}>
                <span className="text-sm" style={{ color: "#6B7280" }}>{itens.length} item{itens.length > 1 ? "s" : ""}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalProdutos)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── PASSO 5: Pagamento ── */}
        {step === 5 && (
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
              <CreditCard size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Pagamento
            </h3>

            {/* Forma de pagamento */}
            <div>
              <Label>Forma de recebimento</Label>
              <Sel value={pagForma} onChange={e => { setPagForma(e.target.value); setPagCondicao("À vista"); }} className="w-56">
                <optgroup label="Métodos de Pagamento">
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              </Sel>
            </div>

            {["Dinheiro"].includes(pagForma) && (
              <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                Pagamento em dinheiro. Não há campos adicionais.
              </div>
            )}

            {pagForma === "A Receber" && totalVenda > 0 && (
              <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
                <p className="text-sm font-medium" style={{ color: "#374151" }}>A Receber — {fmt(totalVenda)}</p>
                {aprovacaoEnviada ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
                    Aprovação solicitada
                  </span>
                ) : (
                  <p className="text-xs" style={{ color: "#92400E" }}>
                    Ao concluir, será solicitada aprovação do gerente de loja.
                  </p>
                )}
              </div>
            )}

            {temAReceber && (
              <div className="rounded-lg border px-4 py-3 text-xs" style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
                Vendas com &quot;A Receber&quot; requerem aprovação do gerente de loja.
              </div>
            )}

            {/* Cartão de Crédito */}
            {COM_CARTAO.includes(pagForma) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Gateway</Label>
                  <Sel value={pagGateway} onChange={e => setPagGateway(e.target.value)}>
                    {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
                  </Sel>
                </div>
                {pagForma === "Cartão de Crédito" && (
                  <div>
                    <Label>Condição de Pagamento</Label>
                    <Sel value={pagCondicao} onChange={e => setPagCondicao(e.target.value)}>
                      {(pagGateway === "Mercado Pago" ? condicoesMp(totalVenda) : CONDICOES).map(c => <option key={c} value={c}>{c}</option>)}
                    </Sel>
                  </div>
                )}
              </div>
            )}

            {/* Vale-Troca */}
            {pagForma === "Vale-Troca" && totalVenda > 0 && (
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.esmeraldaLt }}>
                <div className="flex items-center gap-2">
                  <Ticket size={16} style={{ color: C.esmeralda }} />
                  <span className="text-sm font-medium" style={{ color: C.esmeralda }}>Informe o número do Vale-Troca</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={valeNumero}
                    onChange={e => { setValeNumero(e.target.value); setValeValidacao(null); }}
                    placeholder="VT-00001"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), validarValeTroca())}
                  />
                  <button
                    onClick={validarValeTroca}
                    disabled={!valeNumero.trim() || valeValidando}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}
                  >
                    {valeValidando ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
                  </button>
                </div>
                {valeValidacao && (
                  <div className="rounded-lg border p-3 flex items-start gap-2"
                    style={{ borderColor: valeValidacao.ok ? "#A7F3D0" : "#FECACA", backgroundColor: valeValidacao.ok ? "#ECFDF5" : "#FEF2F2" }}>
                    {valeValidacao.ok
                      ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#065F46" }} />
                      : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: "#991B1B" }} />}
                    <div className="text-xs flex-1" style={{ color: valeValidacao.ok ? "#065F46" : "#991B1B" }}>
                      <p className="font-medium">{valeValidacao.ok ? "Vale-troca válido" : (valeValidacao.erro ?? "Vale inválido")}</p>
                      {valeValidacao.ok && valeValidacao.valor_disponivel !== undefined && (
                        <p className="mt-0.5">Saldo disponível: <strong>{fmt(valeValidacao.valor_disponivel)}</strong></p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pix In-Store (taxa zero, confirmação automática) */}
            {pagForma === "Pix" && totalVenda > 0 && (
              <PixQrInline
                vendaId={vendaId ?? null}
                numeroVenda={numeroVenda || "Nova"}
                valor={totalVenda}
                endpoint="criar-pix-instore"
                obterVendaId={!vendaId ? salvarRascunho : undefined}
                onPagamentoConfirmado={(id) => { if (tipoVenda === "servico") concluirVenda(id); else router.push(`/vendas/${id}`); }}
              />
            )}

            {/* Cartão inline */}
            {pagForma === "Cartão de Crédito" && totalVenda > 0 && vendaId && (
              <CartaoInline
                vendaId={vendaId}
                numeroVenda={numeroVenda || "Nova"}
                valor={totalVenda}
                installments={pagCondicao === "À vista" ? 1 : parseInt(pagCondicao) || 1}
                onPagamentoConfirmado={(id) => { if (tipoVenda === "servico") concluirVenda(id); else router.push(`/vendas/${id}`); }}
              />
            )}
            {pagForma === "Cartão de Crédito" && totalVenda > 0 && !vendaId && (
              <CartaoInline
                vendaId={null}
                numeroVenda="Nova"
                valor={totalVenda}
                installments={pagCondicao === "À vista" ? 1 : parseInt(pagCondicao) || 1}
                obterVendaId={salvarRascunho}
                onPagamentoConfirmado={(id) => { if (tipoVenda === "servico") concluirVenda(id); else router.push(`/vendas/${id}`); }}
              />
            )}

            {/* Múltiplas */}
            {pagForma === "Múltiplas" && (() => {
              const totalMult = pagamentos.reduce((s, p) => s + p.valor, 0);
              const restante = +(totalVenda - totalMult).toFixed(2);
              return (
                <div>
                  <div className="flex flex-wrap items-end gap-2 mb-3">
                    <div className="flex-1 min-w-36">
                      <Label>Forma</Label>
                      <Sel value={pagMultForma} onChange={e => { setPagMultForma(e.target.value); setPagMultParcelas(1); setValeValidacao(null); setValeNumero(""); setPagValor(""); }}>
                        <optgroup label="Métodos de Pagamento">
                          {FORMAS_PAGAMENTO.filter(f => f !== "Múltiplas").map(f => <option key={f} value={f}>{f}</option>)}
                        </optgroup>
                      </Sel>
                    </div>
                    {pagMultForma === "Vale-Troca" ? (
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
                          <button type="button" onClick={validarValeTroca}
                            disabled={!valeNumero.trim() || valeValidando}
                            className="px-3 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                            {valeValidando ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-28">
                          <Label>
                            Valor{restante > 0 && <span className="ml-1 font-normal text-xs" style={{ color: "#9CA3AF" }}>(restante: {fmt(restante)})</span>}
                          </Label>
                          <input type="text" value={pagValor}
                            onChange={e => setPagValor(e.target.value)}
                            placeholder={restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00"}
                            onKeyDown={e => e.key === "Enter" && handleAddPagamento()}
                            className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                        </div>
                        {pagMultForma === "Cartão de Crédito" && (() => {
                          const valCC = parseFloat(pagValor.replace(",", ".")) || restante;
                          const opcoesCC = condicoesMp(valCC);
                          const maxCC = opcoesCC.length > 1 ? parseInt(opcoesCC[opcoesCC.length - 1]) : 1;
                          const parcelasOk = pagMultParcelas <= maxCC ? pagMultParcelas : 1;
                          if (parcelasOk !== pagMultParcelas) setPagMultParcelas(parcelasOk);
                          return (
                            <div className="min-w-28">
                              <Label>Parcelas</Label>
                              <Sel value={parcelasOk} onChange={e => setPagMultParcelas(Number(e.target.value))}>
                                {opcoesCC.map((c, i) => <option key={c} value={i === 0 ? 1 : i + 1}>{c}</option>)}
                              </Sel>
                            </div>
                          );
                        })()}
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

                  {pagamentos.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {pagamentos.map(p => (
                        <div key={p._key} className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }}>
                          <span style={{ color: "#374151" }}>
                            {p.forma}
                            {p.vale_numero && <span className="ml-1.5 text-xs font-mono" style={{ color: "#6B7280" }}>({p.vale_numero})</span>}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(p.valor)}</span>
                            <button onClick={() => handleRemovePagamento(p)} className="text-gray-300 hover:text-red-400"><X size={13} /></button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
                        <span style={{ color: "#6B7280" }}>Restante a pagar</span>
                        <span className="tabular-nums font-semibold" style={{ color: restante > 0.01 ? "#D97706" : "#059669" }}>{fmt(restante)}</span>
                      </div>
                    </div>
                  )}

                  {/* Pix dentro de Múltiplas — um widget por entrada */}
                  {totalVenda > 0 && pagamentos.filter(p => p.forma === "Pix").map(pItem => (
                    <div key={pItem._key} className="mt-3">
                      <PixQrInline
                        vendaId={vendaId ?? null}
                        numeroVenda={numeroVenda || "Nova"}
                        valor={pItem.valor}
                        endpoint="criar-pix-instore"
                        pagamentoId={pItem.db_id}
                        obterVendaId={!vendaId ? salvarRascunho : undefined}
                        onPagamentoConfirmado={(id: number) => concluirVenda(id)}
                      />
                    </div>
                  ))}

                  {/* Cartão dentro de Múltiplas — um widget por entrada */}
                  {totalVenda > 0 && pagamentos.filter(p => p.forma === "Cartão de Crédito").map(pItem => (
                    <div key={pItem._key} className="mt-3">
                      <CartaoInline
                        vendaId={vendaId}
                        numeroVenda={numeroVenda || "Nova"}
                        valor={pItem.valor}
                        installments={pItem.parcelas || pagMultParcelas}
                        pagamentoId={pItem.db_id}
                        obterVendaId={vendaId ? undefined : salvarRascunho}
                        onPagamentoConfirmado={(id) => concluirVenda(id)}
                      />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Resumo totais */}
            <div className="pt-4 border-t space-y-1.5" style={{ borderColor: C.cremeBorder }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#6B7280" }}>Subtotal produtos</span>
                <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(totalProdutos)}</span>
              </div>
              {totalDesconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Desconto</span>
                  <span className="tabular-nums" style={{ color: "#D97706" }}>−{fmt(totalDesconto)}</span>
                </div>
              )}
              {totalFrete > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Frete</span>
                  <span className="tabular-nums" style={{ color: "#374151" }}>+{fmt(totalFrete)}</span>
                </div>
              )}
              {pagamentos.length > 0 && (
                <div className="pt-1.5 pb-0.5 space-y-1">
                  {pagamentos.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span style={{ color: "#6B7280" }}>{p.forma}{p.parcelas && p.parcelas > 1 ? ` (${p.parcelas}×)` : ""}</span>
                      <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(p.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
                <span style={{ color: C.esmeralda }}>Total</span>
                <span className="tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalVenda)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── PASSO 6: Finalizar ── */}
        {step === 6 && (
          <div className="p-6 space-y-5">
            <h3 className="text-lg font-semibold" style={{ color: "#1A1A1A" }}>
              <FileText size={18} className="inline mr-2" style={{ color: C.esmeralda }} />
              Resumo da Venda
            </h3>

            {/* Alerta rastreio */}
            {modoEntrega && modoEntrega !== "loja" && modoEntrega !== "motoboy" && modoEntrega !== "uber" && !numeroRastreio && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB", color: "#92400E" }}>
                <AlertCircle size={16} /> Número de rastreio não informado. Você pode informar depois na venda.
              </div>
            )}

            {/* Card resumo */}
            <div className="rounded-xl border divide-y" style={{ borderColor: C.cremeBorder }}>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#6B7280" }}>Cliente</span>
                <span className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{cliente?.nome ?? "—"}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#6B7280" }}>Tipo</span>
                <span className="text-sm font-semibold capitalize" style={{ color: "#1A1A1A" }}>{tipoVenda ?? "—"}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#6B7280" }}>Entrega</span>
                <span className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                  {modoEntrega === "loja" ? "Retirada na Loja" : modoEntrega === "correios" ? "Correios" : modoEntrega === "transportadora" ? "Transportadora" : modoEntrega === "motoboy" ? "Motoboy" : modoEntrega === "uber" ? "Uber" : "—"}
                </span>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium mb-2" style={{ color: "#6B7280" }}>Itens ({itens.length})</p>
                <div className="space-y-1">
                  {itens.map(i => (
                    <div key={i._key} className="flex justify-between text-sm">
                      <span style={{ color: "#374151" }}>{i.nome_produto} ×{i.quantidade}</span>
                      <span className="tabular-nums" style={{ color: C.esmeralda }}>{fmt(i.total_item)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "#6B7280" }}>Forma de Pagamento</span>
                <span className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{pagForma}</span>
              </div>
              {totalFrete > 0 && (
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "#6B7280" }}>Frete</span>
                  <span className="text-sm tabular-nums" style={{ color: "#374151" }}>{fmt(totalFrete)}</span>
                </div>
              )}
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: C.cremeBg }}>
                <span className="text-base font-bold" style={{ color: C.esmeralda }}>Total</span>
                <span className="text-base font-bold tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalVenda)}</span>
              </div>
            </div>

            {temAReceber && !aprovacaoEnviada && (
              <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB", color: "#92400E" }}>
                Esta venda inclui &quot;A Receber&quot; — será encaminhada para aprovação do gerente ao concluir.
              </div>
            )}

            {saveErr && <p className="text-sm text-red-600">{saveErr}</p>}
          </div>
        )}

        {/* Navigation footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={voltar}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
              >
                <ArrowLeft size={14} /> Voltar
              </button>
            )}
            <Link href="/vendas" className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border no-underline" style={{ borderColor: "#FCA5A5", color: "#EF4444" }}>
              Cancelar
            </Link>
          </div>

          {saveErr && <p className="text-sm text-red-600 flex-1 text-center whitespace-pre-line">{saveErr}</p>}

          {step < 6 && !(step === 3 && precisaAprovacaoDesconto) && (
            <button
              onClick={avancar}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Próximo <ArrowRight size={14} />
            </button>
          )}
          {step === 3 && precisaAprovacaoDesconto && (
            <button
              onClick={pedirAprovacaoDesconto}
              disabled={pedindoAprovacao || saving}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#EA580C", color: C.creme }}
            >
              {pedindoAprovacao ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Solicitar Aprovação
            </button>
          )}
          {step === 6 && (
            <button
              onClick={() => concluirVenda()}
              disabled={concluindo || (pagForma === "Múltiplas" && !pagamentoCobre)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {concluindo ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Salvar Venda
            </button>
          )}
        </div>
      </div>

      {/* Modal pós-conclusão */}
      {showModalFim && vendaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl border shadow-2xl w-full max-w-md mx-4 p-6 space-y-5" style={{ borderColor: C.cremeBorder }}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: C.esmeraldaLt }}>
                <CheckCircle size={32} style={{ color: C.esmeralda }} />
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: "#1A1A1A" }}>
                  Venda {numeroVenda} criada com sucesso!
                </h3>
                {aprovacaoDescontoEnviada && (
                  <p className="text-sm mt-1" style={{ color: "#EA580C" }}>
                    Aguardando aprovação de desconto pelo administrador
                  </p>
                )}
                {aprovacaoEnviada && (
                  <p className="text-sm mt-1" style={{ color: "#D97706" }}>
                    Aguardando aprovação do gerente (A Receber)
                  </p>
                )}
              </div>
            </div>

            {aprovacaoDescontoEnviada ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-center gap-2 py-3 text-sm rounded-xl" style={{ backgroundColor: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}>
                  <AlertCircle size={16} className="flex-shrink-0" /> Venda salva como rascunho — aguardando aprovação do administrador para liberar.
                </div>
                <button
                  onClick={() => router.push(`/vendas/${vendaId}`)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}
                >
                  <ChevronRight size={16} /> Ver Venda
                </button>
              </div>
            ) : tipoVenda === "servico" ? (
              <div className="flex flex-col gap-3">
                {ordemCriada ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm rounded-lg" style={{ backgroundColor: "#ECFDF5", color: "#065F46" }}>
                    <CheckCircle size={16} /> Ordem {ordemCriada.numero_ordem} criada automaticamente
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm rounded-lg" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                    <AlertCircle size={16} /> Ordem de serviço não foi criada — crie manualmente
                  </div>
                )}
                {ordemCriada && (
                  <button
                    onClick={() => router.push(`/ordens/${ordemCriada.id}`)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}
                  >
                    <ChevronRight size={16} /> Ver Ordem de Serviço
                  </button>
                )}
                <button
                  onClick={() => router.push(`/vendas/${vendaId}`)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium border"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }}
                >
                  Ver Venda
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-center" style={{ color: "#6B7280" }}>
                  Deseja abrir uma ordem para esta venda?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      const tipo = tipoParaOrdem();
                      router.push(`/ordens?nova=1&tipo=${tipo}&cliente_id=${cliente?.id ?? ""}&venda_id=${vendaId}&cliente_nome=${encodeURIComponent(cliente?.nome ?? "")}`);
                    }}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}
                  >
                    <ChevronRight size={16} /> Sim, abrir ordem
                  </button>
                  <button
                    onClick={() => router.push(`/vendas/${vendaId}`)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium border"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                  >
                    Não, ir para a venda
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Ordem de Serviço — pré-preenchido com dados da venda */}
      {showOrdemModal && cliente && vendaId && (
        <NovaOrdemServicoBaseModal
          isOpen={showOrdemModal}
          onClose={() => setShowOrdemModal(false)}
          onSuccess={() => router.push(`/vendas/${vendaId}`)}
          userId={userId}
          userName={userName}
          tipoOrdem="servico_venda"
          initialData={{
            cliente: { id: cliente.id, nome: cliente.nome, cpf_cnpj: cliente.cpf_cnpj, telefone: cliente.telefone, celular: cliente.celular },
            venda:   { id: vendaId, numero_venda: numeroVenda, data_venda: new Date().toISOString(), total_venda: totalVenda, situacao: "aprovado", qtd_itens: itens.length },
          }}
        />
      )}

      {/* Toast Vale-Troca: troco gerado */}
      {valeTrocoToast && (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-xl shadow-lg border p-4 max-w-sm"
          style={{ borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" }}
        >
          <div className="flex items-start gap-2">
            <Ticket size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#065F46" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "#065F46" }}>Novo vale-troco gerado!</p>
              <p className="text-xs mt-0.5" style={{ color: "#065F46" }}>
                <strong>{valeTrocoToast.numero}</strong> — {fmt(valeTrocoToast.valor)}
              </p>
            </div>
            <button onClick={() => setValeTrocoToast(null)} className="p-1 rounded hover:bg-white/50" style={{ color: "#065F46" }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
