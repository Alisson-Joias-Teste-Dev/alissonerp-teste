"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Search, X, Plus, Loader2, CheckCircle, XCircle,
  Truck, Video, RefreshCw, Share2, Download,
  Check as CheckIcon, FileText, UserPlus, MapPin, Pencil,
} from "lucide-react";
import { gerarPDFOrcamento } from "@/lib/gerar-pdf-orcamento";
import type { OrcamentoPDF } from "@/lib/gerar-pdf-orcamento";

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
}
interface FaixaComissao { desconto_pct: number; comissao_pct: number; }
interface ItemVenda {
  id?: number; _key: string; produto_id: number; nome_produto: string; sku: string;
  quantidade: number; preco_lista: number; pct_desconto: number;
  preco_unitario: number; total_item: number; pct_comissao: number;
  valor_comissao: number; peso_estimado: number | null; unidade: string | null;
  observacao?: string | null;
}
interface PagamentoServer {
  id: number; forma: string; gateway: string | null; valor: number;
  parcelas: number; status: string; data_confirmacao: string | null;
}
interface Vendedor { id_vendedor: number; nome: string; }
interface FormaEnvio { id: number; nome: string; id_api: string; }
interface FormaFrete { id: number; nome: string; codigo: string; id_api_logistica: string; }

interface Venda {
  id: number; numero_venda: string;
  cliente_id: number | null; cliente_nome: string | null; cliente_cpf_cnpj: string | null;
  cliente_email: string | null; cliente_telefone: string | null;
  vendedor_id: number | null; vendedor_nome: string | null;
  data_venda: string; data_entrega: string | null;
  total_produtos: number; total_desconto: number; total_frete: number;
  total_venda: number; total_comissao: number; total_pago: number;
  situacao: string; forma_envio: string | null; forma_frete: string | null;
  observacoes: string | null; observacoes_internas: string | null;
  video_obs_interna: string | null; tiny_sync_status: string | null;
  tiny_pedido_id: string | null; bloqueado: boolean; qtd_itens: number;
  created_at?: string | null;
  endereco_entrega?: string | null; endereco_entrega_numero?: string | null;
  endereco_entrega_complemento?: string | null; endereco_entrega_bairro?: string | null;
  endereco_entrega_cidade?: string | null; endereco_entrega_cep?: string | null;
  endereco_entrega_uf?: string | null;
  cliente_endereco?: string | null; cliente_numero?: string | null;
  cliente_complemento?: string | null; cliente_bairro?: string | null;
  cliente_municipio?: string | null; cliente_cep?: string | null; cliente_uf?: string | null;
  itens: Array<{
    id: number; produto_id: number; nome_produto: string; sku: string | null;
    quantidade: number; preco_lista: number; pct_desconto: number;
    preco_unitario: number; total_item: number; pct_comissao: number;
    valor_comissao: number; observacao: string | null; peso_estimado?: number | null;
  }>;
  pagamentos: PagamentoServer[];
  ordens?: Array<{
    id: number; numero_ordem: string; tipo_ordem: string;
    situacao: string; status: string; created_at: string;
  }>;
}

const FORMAS_PAGAMENTO = [
  "Dinheiro", "Cartão de Crédito", "Cartão de Débito",
  "Vale-Troca", "Pix", "Ouro", "A Receber", "Múltiplas",
];
const GATEWAYS   = ["Mercado Pago", "PagSeguro", "Cielo", "Stone", "Getnet", "Rede", "Outro"];
const BANDEIRAS  = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outro"];
const CONDICOES  = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
const COM_PARCELAS = ["Cartão de Crédito", "Vale-Troca"];
const COM_CARTAO   = ["Cartão de Crédito", "Cartão de Débito", "Pix"];

function hoje() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
interface ParcelaRow { num: number; dias: number; data: string; valor: number; }

const SITUACAO_LABEL: Record<string, string> = {
  rascunho: "Rascunho", aprovado: "Aprovado", enviado: "Enviado",
  cancelado: "Cancelado", concluido: "Concluído",
};
const SITUACAO_COLOR: Record<string, { bg: string; text: string }> = {
  rascunho:  { bg: "#F3F4F6", text: "#6B7280" },
  aprovado:  { bg: "#D1FAE5", text: "#065F46" },
  enviado:   { bg: "#DBEAFE", text: "#1D4ED8" },
  cancelado: { bg: "#FEE2E2", text: "#991B1B" },
  concluido: { bg: C.esmeraldaLt, text: C.esmeralda },
};
const PAG_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pendente:   { bg: "#FEF9C3", text: "#713F12" },
  confirmado: { bg: "#D1FAE5", text: "#065F46" },
  cancelado:  { bg: "#FEE2E2", text: "#991B1B" },
  estornado:  { bg: "#F3F4F6", text: "#6B7280" },
};

const PROXIMA_SITUACAO: Record<string, { label: string; value: string; icon: typeof CheckCircle }[]> = {
  rascunho:  [{ label: "Aprovar", value: "aprovado", icon: CheckCircle }],
  aprovado:  [{ label: "Marcar Enviado", value: "enviado", icon: Truck }, { label: "Concluir", value: "concluido", icon: CheckCircle }],
  enviado:   [{ label: "Concluir", value: "concluido", icon: CheckCircle }],
  cancelado: [],
  concluido: [],
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function uid() { return Math.random().toString(36).slice(2); }

const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// ─── Autocomplete ─────────────────────────────────────────────────────────────
function Autocomplete<T>({ placeholder, onSearch, renderItem, onSelect, selectedLabel, onClear, disabled }: {
  placeholder: string; onSearch: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode; onSelect: (item: T) => void;
  selectedLabel?: string | null; onClear: () => void; disabled?: boolean;
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
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border" style={{ borderColor: C.cremeBorder, opacity: disabled ? 0.6 : 1 }}>
      <span className="text-sm" style={{ color: "#374151" }}>{selectedLabel}</span>
      {!disabled && <button onClick={onClear} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>}
    </div>
  );
  if (disabled) return (
    <div className="rounded-lg px-3 py-2.5 border text-sm" style={{ borderColor: C.cremeBorder, color: "#9CA3AF", backgroundColor: C.cremeBg }}>—</div>
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

// ─── Layout components ────────────────────────────────────────────────────────
function Secao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-6 border-b ${className}`} style={{ borderColor: C.cremeBorder }}>{children}</div>;
}
function STitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mb-4" style={{ color: "#1A1A1A" }}>{children}</h3>;
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  vendaId: number;
  role: string;
  vendedorId: number | null;
  isFullAccess: boolean;
  maxDesconto: number;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function VendaDetalheClient({ vendaId, role, isFullAccess, maxDesconto }: Props) {
  const router = useRouter();

  // ── Server data ─────────────────────────────────────────────────────────────
  const [venda, setVenda] = useState<Venda | null>(null);
  const [loadingVenda, setLoadingVenda] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ── Reference data ──────────────────────────────────────────────────────────
  const [faixas, setFaixas] = useState<FaixaComissao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [formaEnvioOpts, setFormaEnvioOpts] = useState<FormaEnvio[]>([]);
  const [formaFreteAll, setFormaFreteAll] = useState<FormaFrete[]>([]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [vendedorSel, setVendedorSel] = useState<number | "">("");
  const [dataVenda, setDataVenda] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [totalFrete, setTotalFrete] = useState(0);
  const [formaEnvioId, setFormaEnvioId] = useState<number | "">("");
  const [formaFreteId, setFormaFreteId] = useState<number | "">("");
  const [observacoes, setObservacoes] = useState("");
  const [obsInternas, setObsInternas] = useState("");

  // ── Video ───────────────────────────────────────────────────────────────────
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoObsInterna, setVideoObsInterna] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadErr, setVideoUploadErr] = useState("");

  // ── Product add ─────────────────────────────────────────────────────────────
  const [produtoSel, setProdutoSel] = useState<Produto | null>(null);
  const [qtd, setQtd] = useState(1);
  const [pctDesconto, setPctDesconto] = useState(0);
  const [descontoErr, setDescontoErr] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [prodTab, setProdTab] = useState<"produtos" | "comissoes">("produtos");

  // ── Payment add ─────────────────────────────────────────────────────────────
  const [addingPag, setAddingPag] = useState(false);
  const [newPagForma, setNewPagForma] = useState("Dinheiro");
  const [newPagValor, setNewPagValor] = useState("");
  const [newPagGateway, setNewPagGateway] = useState("Mercado Pago");
  const [newPagBandeira, setNewPagBandeira] = useState("Outro");
  const [newPagParcelas, setNewPagParcelas] = useState(1);
  const [newPagCondicao, setNewPagCondicao] = useState("À vista");
  const [parcelasRows, setParcelasRows] = useState<ParcelaRow[]>([]);
  const [multPagForma, setMultPagForma] = useState("Dinheiro");
  const [multPagValor, setMultPagValor] = useState("");
  const [multPagamentos, setMultPagamentos] = useState<Array<{ _key: string; forma: string; valor: number }>>([]);

  // ── Modals & delivery address ────────────────────────────────────────────────
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

  // ── Action states ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // ── Load venda ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadingVenda(true); setLoadError("");
    try {
      const res = await fetch(`/api/vendas/${vendaId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVenda(await res.json() as Venda);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Erro ao carregar"); }
    finally { setLoadingVenda(false); }
  }, [vendaId]);

  useEffect(() => { load(); }, [load]);

  // Load ref data
  useEffect(() => {
    fetch("/api/vendas/faixas-comissao").then(r => r.json()).then(setFaixas).catch(() => {});
    fetch("/api/vendas/forma-envio").then(r => r.json()).then((d: { envio: FormaEnvio[]; frete: FormaFrete[] }) => {
      setFormaEnvioOpts(d.envio ?? []); setFormaFreteAll(d.frete ?? []);
    }).catch(() => {});
    if (isFullAccess) fetch("/api/vendedores").then(r => r.json()).then(setVendedores).catch(() => {});
  }, [isFullAccess]);

  // ── Hydrate form from venda ─────────────────────────────────────────────────
  useEffect(() => {
    if (!venda) return;
    setCliente(venda.cliente_id ? {
      id: venda.cliente_id, nome: venda.cliente_nome ?? "",
      cpf_cnpj: venda.cliente_cpf_cnpj, email: venda.cliente_email, telefone: venda.cliente_telefone,
    } : null);
    setVendedorSel(venda.vendedor_id ?? "");
    setDataVenda(venda.data_venda?.slice(0, 10) ?? "");
    setDataEntrega(venda.data_entrega?.slice(0, 10) ?? "");
    setTotalFrete(venda.total_frete);
    setObservacoes(venda.observacoes ?? "");
    setObsInternas(venda.observacoes_internas ?? "");
    setVideoObsInterna(venda.video_obs_interna ?? null);
    setVideoPreviewUrl(venda.video_obs_interna ?? null);
    // Hydrate delivery address
    if (venda.endereco_entrega) {
      setEndEntrega({
        cep: venda.endereco_entrega_cep ?? "", logradouro: venda.endereco_entrega ?? "",
        numero: venda.endereco_entrega_numero ?? "", complemento: venda.endereco_entrega_complemento ?? "",
        bairro: venda.endereco_entrega_bairro ?? "", cidade: venda.endereco_entrega_cidade ?? "",
        uf: venda.endereco_entrega_uf ?? "",
      });
      setMesmoEndereco(false);
      setShowEndEntrega(true);
    }
    setIsDirty(false);
  }, [venda]);

  // Match forma_envio/frete by name after ref data loads
  useEffect(() => {
    if (!venda || formaEnvioOpts.length === 0) return;
    const envio = formaEnvioOpts.find(e => e.nome === venda.forma_envio);
    if (envio) setFormaEnvioId(envio.id);
    if (venda.forma_frete && formaFreteAll.length > 0) {
      const frete = formaFreteAll.find(f => f.nome === venda.forma_frete);
      if (frete) setFormaFreteId(frete.id);
    }
  }, [venda, formaEnvioOpts, formaFreteAll]);

  // ── Editability ─────────────────────────────────────────────────────────────
  const ROLES_EDITAR_APROVADO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];
  const podeEditarAprovado = ROLES_EDITAR_APROVADO.includes(role);

  const edit = useMemo(() => {
    if (!venda || venda.bloqueado || venda.situacao === "cancelado")
      return { full: false, limited: false, metadata: false, readOnly: true };
    if (venda.situacao === "rascunho")
      return { full: true, limited: true, metadata: true, readOnly: false };
    if (venda.situacao === "aprovado")
      return { full: false, limited: podeEditarAprovado, metadata: podeEditarAprovado, readOnly: !podeEditarAprovado };
    if (venda.situacao === "enviado")
      return { full: false, limited: false, metadata: podeEditarAprovado, readOnly: !podeEditarAprovado };
    return { full: false, limited: false, metadata: false, readOnly: true };
  }, [venda, podeEditarAprovado]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const itens: ItemVenda[] = useMemo(() =>
    (venda?.itens ?? []).map(i => ({
      id: i.id, _key: `srv-${i.id}`, produto_id: i.produto_id,
      nome_produto: i.nome_produto, sku: i.sku ?? "", quantidade: i.quantidade,
      preco_lista: i.preco_lista, pct_desconto: i.pct_desconto,
      preco_unitario: i.preco_unitario, total_item: i.total_item,
      pct_comissao: i.pct_comissao, valor_comissao: i.valor_comissao,
      peso_estimado: i.peso_estimado ?? null, unidade: null, observacao: i.observacao,
    })),
  [venda]);

  const totalProdutos = itens.reduce((s, i) => s + i.total_item, 0);
  const totalDesconto = itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);
  const totalComissao = itens.reduce((s, i) => s + i.valor_comissao, 0);
  const totalVenda = totalProdutos + totalFrete;

  // ── Parcelas (geradas quando condição ou total mudam, apenas se sem pagamentos) ──
  useEffect(() => {
    if (!venda || venda.pagamentos.length > 0) return;
    const n = newPagCondicao === "À vista" ? 1 : parseInt(newPagCondicao);
    const tv = totalVenda;
    const base = tv > 0 ? +(tv / n).toFixed(2) : 0;
    const rows: ParcelaRow[] = Array.from({ length: n }, (_, i) => ({
      num: i + 1, dias: 30 * (i + 1), data: addDays(hoje(), 30 * (i + 1)),
      valor: i === n - 1 ? +(tv - base * (n - 1)).toFixed(2) : base,
    }));
    setParcelasRows(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPagCondicao, totalVenda, venda?.pagamentos?.length]);

  function equalizarParcelas() {
    const n = parcelasRows.length; if (!n) return;
    const tv = totalVenda;
    const base = +(tv / n).toFixed(2);
    setParcelasRows(prev => prev.map((r, i) => ({
      ...r, valor: i === n - 1 ? +(tv - base * (n - 1)).toFixed(2) : base,
    })));
  }
  function updateParcelaRow(i: number, field: "dias" | "data" | "valor", raw: string) {
    const tv = totalVenda;
    setParcelasRows(prev => {
      const updated = prev.map((r, idx) => {
        if (idx !== i) return r;
        if (field === "dias") { const d = parseInt(raw) || 0; return { ...r, dias: d, data: addDays(hoje(), d) }; }
        if (field === "data") {
          if (raw.length !== 10) return { ...r, data: raw };
          const dias = Math.round((new Date(raw + "T12:00:00").getTime() - new Date(hoje() + "T12:00:00").getTime()) / 86400000);
          return { ...r, data: raw, dias };
        }
        return { ...r, valor: parseFloat(raw.replace(",", ".")) || 0 };
      });
      if (field === "valor" && i < updated.length - 1) {
        const sumOthers = updated.slice(0, -1).reduce((s, r) => s + r.valor, 0);
        updated[updated.length - 1] = { ...updated[updated.length - 1], valor: Math.max(0, +(tv - sumOthers).toFixed(2)) };
      }
      return updated;
    });
  }

  const formaFreteOpts = formaFreteAll.filter(f => {
    const envio = formaEnvioOpts.find(e => e.id === formaEnvioId);
    return envio ? f.id_api_logistica === envio.id_api : false;
  });

  // ── Commission lookup ───────────────────────────────────────────────────────
  function getComissao(pct: number): number {
    const faixa = faixas.find(f => f.desconto_pct === Math.round(pct));
    if (!faixa || pct > 30) return 0;
    return faixa.comissao_pct;
  }

  function calcItem(produto: Produto, q: number, pct: number) {
    const precoLista = produto.preco_venda ?? 0;
    const precoUnit = precoLista * (1 - pct / 100);
    const totalItem = precoUnit * q;
    const pctComissao = getComissao(pct);
    return {
      produto_id: produto.id, nome_produto: produto.nome, sku: produto.sku,
      quantidade: q, preco_lista: precoLista, pct_desconto: pct,
      preco_unitario: precoUnit, total_item: totalItem,
      pct_comissao: pctComissao, valor_comissao: totalItem * pctComissao / 100,
      peso_estimado: produto.peso_precificado, unidade: produto.unidade,
    };
  }

  // ── Item actions (immediate save) ───────────────────────────────────────────
  async function handleAddItem() {
    if (!produtoSel || !venda) return;
    if (pctDesconto > maxDesconto) { setDescontoErr(`Máximo: ${maxDesconto}%`); return; }
    const item = calcItem(produtoSel, qtd, pctDesconto);
    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/itens`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
      setProdutoSel(null); setQtd(1); setPctDesconto(0); setDescontoErr(""); setAddingItem(false);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao adicionar item"); }
    finally { setUpdating(false); }
  }

  async function handleRemoveItem(itemId: number) {
    if (!venda) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/itens/${itemId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao remover item"); }
    finally { setUpdating(false); }
  }

  async function handleUpdateItem(itemId: number, field: "quantidade" | "pct_desconto", raw: string) {
    if (!venda) return;
    const val = Number(raw);
    if (isNaN(val) || val < 0) return;
    if (field === "pct_desconto" && val > maxDesconto) return;
    if (field === "quantidade" && val < 1) return;

    const item = venda.itens.find(i => i.id === itemId);
    if (!item) return;

    const newQtd = field === "quantidade" ? val : item.quantidade;
    const newDesc = field === "pct_desconto" ? val : item.pct_desconto;
    const precoUnit = item.preco_lista * (1 - newDesc / 100);
    const totalItem = precoUnit * newQtd;
    const pctComissao = getComissao(newDesc);
    const valorComissao = totalItem * pctComissao / 100;

    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/itens/${itemId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade: newQtd, pct_desconto: newDesc,
          preco_unitario: precoUnit, total_item: totalItem,
          pct_comissao: pctComissao, valor_comissao: valorComissao,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao atualizar item"); }
    finally { setUpdating(false); }
  }

  // ── Payment actions (immediate save) ────────────────────────────────────────
  async function handleAddPagamento() {
    if (!venda) return;
    const v = parseFloat(newPagValor.replace(",", "."));
    if (!v || v <= 0) return;
    setUpdating(true);
    try {
      const parcelas = newPagCondicao === "À vista" ? 1 : parseInt(newPagCondicao) || newPagParcelas;
      const body: Record<string, unknown> = { forma: newPagForma, valor: v, parcelas };
      if (["Cartão de Crédito", "Cartão de Débito"].includes(newPagForma)) {
        body.gateway = newPagGateway;
      }
      const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
      setNewPagValor(""); setAddingPag(false);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao adicionar pagamento"); }
    finally { setUpdating(false); }
  }

  async function handleRemovePagamento(pagId: number) {
    if (!venda) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${pagId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao remover pagamento"); }
    finally { setUpdating(false); }
  }

  async function confirmarPagamento(pagId: number) {
    if (!venda) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${pagId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao confirmar pagamento"); }
    finally { setUpdating(false); }
  }

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
      markDirty();
      setShowNovoCliente(false);
      setNovoClienteForm({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao criar cliente"); }
    finally { setSavingCliente(false); }
  }

  // ── Save scalar fields ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!venda) return;
    setSaving(true); setSaveErr("");
    try {
      const patch: Record<string, unknown> = {};
      if (edit.full) {
        if (cliente?.id !== venda.cliente_id) patch.cliente_id = cliente?.id ?? null;
        if ((vendedorSel || null) !== (venda.vendedor_id ?? null)) patch.vendedor_id = vendedorSel || null;
        if (dataVenda !== (venda.data_venda?.slice(0, 10) ?? "")) patch.data_venda = dataVenda;
      }
      if (edit.limited) {
        if (dataEntrega !== (venda.data_entrega?.slice(0, 10) ?? "")) patch.data_entrega = dataEntrega || null;
        if (totalFrete !== venda.total_frete) patch.total_frete = totalFrete;
        const envioNome = formaEnvioOpts.find(e => e.id === formaEnvioId)?.nome ?? null;
        const freteNome = formaFreteAll.find(f => f.id === formaFreteId)?.nome ?? null;
        if (envioNome !== (venda.forma_envio ?? null)) patch.forma_envio = envioNome;
        if (freteNome !== (venda.forma_frete ?? null)) patch.forma_frete = freteNome;
      }
      if (edit.metadata) {
        if (observacoes !== (venda.observacoes ?? "")) patch.observacoes = observacoes || null;
        if (obsInternas !== (venda.observacoes_internas ?? "")) patch.observacoes_internas = obsInternas || null;
        if (videoObsInterna !== (venda.video_obs_interna ?? null)) patch.video_obs_interna = videoObsInterna;
      }
      // Endereço de entrega
      if (!mesmoEndereco && showEndEntrega) {
        patch.endereco_entrega = endEntrega.logradouro || null;
        patch.endereco_entrega_numero = endEntrega.numero || null;
        patch.endereco_entrega_complemento = endEntrega.complemento || null;
        patch.endereco_entrega_bairro = endEntrega.bairro || null;
        patch.endereco_entrega_cidade = endEntrega.cidade || null;
        patch.endereco_entrega_cep = endEntrega.cep || null;
        patch.endereco_entrega_uf = endEntrega.uf || null;
      }
      if (Object.keys(patch).length > 0) {
        const res = await fetch(`/api/vendas/${venda.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  // ── Status change ───────────────────────────────────────────────────────────
  async function changeSituacao(s: string) {
    if (!venda) return;
    setUpdating(true); setSaveErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: s }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.ordem_criada) {
        alert(`Ordem ${d.ordem_criada} aberta automaticamente!`);
      }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao atualizar status"); }
    finally { setUpdating(false); }
  }

  async function cancelar() {
    if (!venda || !confirm("Cancelar esta venda?")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/cancelar`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao cancelar"); }
    finally { setUpdating(false); }
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────
  async function gerarPdf() {
    if (!venda) return;
    setGerandoPdf(true);
    try {
      // Montar endereço de entrega (preferir entrega, fallback cliente)
      const endEntrega = venda.endereco_entrega
        ? [venda.endereco_entrega, venda.endereco_entrega_numero ? `nº ${venda.endereco_entrega_numero}` : null,
           venda.endereco_entrega_complemento, venda.endereco_entrega_bairro,
           venda.endereco_entrega_cidade, venda.endereco_entrega_uf,
           venda.endereco_entrega_cep ? `CEP: ${venda.endereco_entrega_cep}` : null].filter(Boolean).join(", ")
        : [venda.cliente_endereco, venda.cliente_numero ? `nº ${venda.cliente_numero}` : null,
           venda.cliente_complemento, venda.cliente_bairro, venda.cliente_municipio, venda.cliente_uf,
           venda.cliente_cep ? `CEP: ${venda.cliente_cep}` : null].filter(Boolean).join(", ") || undefined;

      const dados: OrcamentoPDF = {
        numero_venda: venda.numero_venda,
        cliente_nome: venda.cliente_nome ?? "Sem cliente",
        cliente_email: venda.cliente_email ?? undefined,
        cliente_telefone: venda.cliente_telefone ?? undefined,
        cliente_cpf_cnpj: venda.cliente_cpf_cnpj ?? undefined,
        vendedor_nome: venda.vendedor_nome ?? undefined,
        endereco_entrega: endEntrega,
        data_venda: venda.data_venda,
        data_entrega: venda.data_entrega ?? undefined,
        created_at: venda.created_at ?? undefined,
        total_produtos: venda.total_produtos, total_desconto: venda.total_desconto,
        total_frete: venda.total_frete, total_venda: venda.total_venda,
        forma_envio: venda.forma_envio ?? undefined, observacoes: venda.observacoes ?? undefined,
        itens: venda.itens.map(i => ({
          nome: i.nome_produto, sku: i.sku ?? "—", quantidade: i.quantidade,
          preco_lista: i.preco_lista, desconto_pct: i.pct_desconto,
          preco_unitario: i.preco_unitario, total: i.total_item,
        })),
        pagamentos: venda.pagamentos.map(p => ({
          forma: p.forma, gateway: p.gateway ?? null,
          parcelas: p.parcelas, valor: Number(p.valor),
        })),
      };
      gerarPDFOrcamento(dados).save(`pedido-${venda.numero_venda}.pdf`);
    } catch { /* silent */ }
    finally { setGerandoPdf(false); }
  }

  // ── Share ───────────────────────────────────────────────────────────────────
  async function compartilhar() {
    if (!venda) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/compartilhar`, { method: "POST" });
      const data = await res.json() as { token?: string };
      if (!res.ok) throw new Error("Erro");
      await navigator.clipboard.writeText(`${window.location.origin}/orcamento/${data.token}`);
      setCopied(true); setTimeout(() => setCopied(false), 3000);
    } catch { /* silent */ }
    finally { setSharing(false); }
  }

  // ── Video ───────────────────────────────────────────────────────────────────
  async function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoPreviewUrl && videoPreviewUrl !== venda?.video_obs_interna) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setVideoObsInterna(null); setVideoUploadErr(""); setUploadingVideo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject; reader.readAsDataURL(file);
      });
      const res = await fetch("/api/vendas/upload-video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mime: file.type, filename: file.name }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setVideoObsInterna(data.url ?? null);
      setIsDirty(true);
    } catch (err) { setVideoUploadErr(err instanceof Error ? err.message : "Erro ao enviar vídeo"); }
    finally { setUploadingVideo(false); }
  }

  function handleRemoveVideo() {
    if (videoPreviewUrl && videoPreviewUrl !== venda?.video_obs_interna) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null); setVideoObsInterna(null); setVideoUploadErr("");
    if (videoInputRef.current) videoInputRef.current.value = "";
    setIsDirty(true);
  }

  // ── Dirty tracking helper ───────────────────────────────────────────────────
  function markDirty() { if (!isDirty) setIsDirty(true); }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadingVenda) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={28} className="animate-spin" style={{ color: C.esmeralda }} /></div>;
  }
  if (loadError || !venda) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-red-600 mb-4">{loadError || "Venda não encontrada"}</p>
        <Link href="/vendas" className="text-sm underline" style={{ color: C.esmeralda }}>Voltar</Link>
      </div>
    );
  }

  const situacaoStyle = SITUACAO_COLOR[venda.situacao] ?? SITUACAO_COLOR.rascunho;
  const proximasAcoes = PROXIMA_SITUACAO[venda.situacao] ?? [];
  const podeCancelar = isFullAccess && !["cancelado", "concluido"].includes(venda.situacao);

  // Validação para aprovar: cliente + itens + pagamento obrigatórios
  const podeAprovar = !!(
    venda.cliente_id &&
    itens.length > 0 &&
    venda.pagamentos.length > 0
  );

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
              {venda.numero_venda}
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: situacaoStyle.bg, color: situacaoStyle.text }}>
              {SITUACAO_LABEL[venda.situacao] ?? venda.situacao}
            </span>
            {venda.tiny_pedido_id && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#DBEAFE", color: "#1E40AF" }}>
                Tiny #{venda.tiny_pedido_id}
              </span>
            )}
            {venda.bloqueado && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Bloqueada</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={gerarPdf} disabled={gerandoPdf}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-gray-50"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
            {gerandoPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF
          </button>
          <button onClick={compartilhar} disabled={sharing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-gray-50"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
            {sharing ? <Loader2 size={13} className="animate-spin" /> : copied ? <CheckIcon size={13} /> : <Share2 size={13} />}
            {copied ? "Copiado!" : "Compartilhar"}
          </button>
          <button onClick={load} disabled={loadingVenda || updating}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40" style={{ color: "#6B7280" }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Banner de erro (Tiny, status, etc.) ── */}
      {saveErr && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-start gap-2"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}>
          <XCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Erro ao processar</p>
            <p className="text-xs mt-0.5">{saveErr}</p>
          </div>
          <button onClick={() => setSaveErr("")} className="shrink-0 p-0.5 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: C.cremeBorder }}>

        {/* ── 1. Cliente + Vendedor ── */}
        <Secao>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label required>Cliente</Label>
              <Autocomplete<Cliente>
                placeholder="Digite para buscar cliente..."
                onSearch={async q => { const r = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(q)}`); return r.json(); }}
                renderItem={c => (
                  <div>
                    <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{c.nome}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>{c.cpf_cnpj ?? c.telefone ?? "—"}</p>
                  </div>
                )}
                onSelect={c => { setCliente(c); markDirty(); }}
                selectedLabel={cliente ? `${cliente.nome}${cliente.cpf_cnpj ? ` · ${cliente.cpf_cnpj}` : ""}` : null}
                onClear={() => { setCliente(null); markDirty(); }}
                disabled={!edit.full}
              />
              {cliente && (
                <>
                  <p className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>
                    {[cliente.email, cliente.telefone].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setShowDadosCliente(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <FileText size={12} /> Dados
                    </button>
                    <button onClick={() => setShowNovoCliente(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      <UserPlus size={12} /> Novo Cliente
                    </button>
                    <button onClick={() => setShowEndEntrega(!showEndEntrega)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                      style={{ borderColor: showEndEntrega ? C.esmeralda : C.cremeBorder, color: C.esmeralda, backgroundColor: showEndEntrega ? C.esmeraldaLt : "transparent" }}>
                      <MapPin size={12} /> End. Entrega
                    </button>
                  </div>
                </>
              )}
              {!cliente && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setShowNovoCliente(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                    <UserPlus size={12} /> Novo Cliente
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label required>Vendedor</Label>
              {isFullAccess && edit.full ? (
                <Select value={vendedorSel} onChange={e => { setVendedorSel(e.target.value === "" ? "" : Number(e.target.value)); markDirty(); }}>
                  <option value="">Selecione um vendedor</option>
                  {vendedores.map(v => <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>)}
                </Select>
              ) : (
                <div className="border rounded-lg px-3 py-2.5 text-sm" style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: C.cremeBg }}>
                  {venda.vendedor_nome ?? "—"}
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
                <input type="checkbox" checked={mesmoEndereco} onChange={e => { setMesmoEndereco(e.target.checked); markDirty(); }}
                  className="rounded border-gray-300" />
                Mesmo do cliente
              </label>
            </div>
            {mesmoEndereco && cliente ? (
              <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                {[cliente.endereco, cliente.numero, cliente.complemento, cliente.bairro, cliente.municipio, cliente.uf, cliente.cep].filter(Boolean).join(", ") || "Endereço não cadastrado no cliente"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label required>CEP</Label>
                  <Input value={endEntrega.cep} placeholder="00000-000"
                    onChange={e => { const v = e.target.value; setEndEntrega(p => ({ ...p, cep: v })); markDirty(); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "entrega"); }} />
                </div>
                <div className="md:col-span-2">
                  <Label required>Logradouro</Label>
                  <Input value={endEntrega.logradouro} onChange={e => { setEndEntrega(p => ({ ...p, logradouro: e.target.value })); markDirty(); }} />
                </div>
                <div>
                  <Label required>Número</Label>
                  <Input value={endEntrega.numero} onChange={e => { setEndEntrega(p => ({ ...p, numero: e.target.value })); markDirty(); }} />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input value={endEntrega.complemento} onChange={e => { setEndEntrega(p => ({ ...p, complemento: e.target.value })); markDirty(); }} />
                </div>
                <div>
                  <Label required>Bairro</Label>
                  <Input value={endEntrega.bairro} onChange={e => { setEndEntrega(p => ({ ...p, bairro: e.target.value })); markDirty(); }} />
                </div>
                <div>
                  <Label required>Cidade</Label>
                  <Input value={endEntrega.cidade} onChange={e => { setEndEntrega(p => ({ ...p, cidade: e.target.value })); markDirty(); }} />
                </div>
                <div>
                  <Label required>UF</Label>
                  <Input value={endEntrega.uf} maxLength={2} onChange={e => { setEndEntrega(p => ({ ...p, uf: e.target.value.toUpperCase() })); markDirty(); }} />
                </div>
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
                        <div><Label>CEP</Label><Input value={editClienteForm.cep} placeholder="00000-000" onChange={e => { const v = e.target.value; setEditClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente").then(() => { setEditClienteForm(prev => ({ ...prev, endereco: novoClienteForm.endereco || prev.endereco, bairro: novoClienteForm.bairro || prev.bairro, municipio: novoClienteForm.municipio || prev.municipio, uf: novoClienteForm.uf || prev.uf })); }); }} /></div>
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
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>CPF/CNPJ</span><p style={{ color: "#1A1A1A" }}>{cliente.cpf_cnpj || "—"}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Email</span><p style={{ color: "#1A1A1A" }}>{cliente.email || "—"}</p></div>
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Telefone</span><p style={{ color: "#1A1A1A" }}>{cliente.telefone || "—"}</p></div>
                      {cliente.celular && <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Celular</span><p style={{ color: "#1A1A1A" }}>{cliente.celular}</p></div>}
                    </div>
                    <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço de Cobrança</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Logradouro</span><p style={{ color: "#1A1A1A" }}>{cliente.endereco || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Número</span><p style={{ color: "#1A1A1A" }}>{cliente.numero || "—"}</p></div>
                        <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Complemento</span><p style={{ color: "#1A1A1A" }}>{cliente.complemento || "—"}</p></div>
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
                    <div>
                      <Label>CEP</Label>
                      <Input value={novoClienteForm.cep} placeholder="00000-000"
                        onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v, "novoCliente"); }} />
                    </div>
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
                <button onClick={() => setShowNovoCliente(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                <button onClick={handleCriarCliente} disabled={savingCliente}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
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
              <Input type="date" value={dataVenda} disabled={!edit.full}
                onChange={e => { setDataVenda(e.target.value); markDirty(); }} />
            </div>
            <div>
              <Label required>Data de Entrega</Label>
              <Input type="date" value={dataEntrega} disabled={!edit.limited}
                onChange={e => { setDataEntrega(e.target.value); markDirty(); }} />
            </div>
            <div>
              <Label>Frete Pago pelo Cliente</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#9CA3AF" }}>R$</span>
                <input type="number" min={0} step={0.01} value={totalFrete || ""}
                  disabled={!edit.limited}
                  onChange={e => { setTotalFrete(Number(e.target.value) || 0); markDirty(); }}
                  placeholder="0,00"
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none disabled:opacity-50"
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
                      {["Nº", "Descrição", "Código (SKU)", "Qtde", "UN", "Preço lista", "% Desc", ...(edit.limited ? ["R$ Desc"] : []), "Preço un", "Preço total", ...(edit.limited ? [""] : [])].map(h => (
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
                        <td className="px-3 py-2.5 max-w-[180px] truncate font-medium" style={{ color: "#1A1A1A" }}>{item.nome_produto}</td>
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{item.sku}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "#374151" }}>
                          {edit.limited && item.id ? (
                            <input type="number" min={1} defaultValue={item.quantidade}
                              onBlur={e => handleUpdateItem(item.id!, "quantidade", e.target.value)}
                              className="w-14 border rounded px-1.5 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                          ) : item.quantidade}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "#9CA3AF" }}>{item.unidade ?? "un"}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_lista)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center" style={{ color: item.pct_desconto > 0 ? "#D97706" : "#9CA3AF" }}>
                          {edit.limited && item.id ? (
                            <input type="number" min={0} max={maxDesconto} step={1} defaultValue={item.pct_desconto}
                              onBlur={e => handleUpdateItem(item.id!, "pct_desconto", e.target.value || "0")}
                              className="w-20 border rounded px-1.5 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                          ) : (item.pct_desconto > 0 ? `${item.pct_desconto}%` : "—")}
                        </td>
                        {edit.limited && (
                          <td className="px-3 py-2.5">
                            <input type="text"
                              defaultValue={item.pct_desconto > 0 ? (item.preco_lista * item.pct_desconto / 100).toFixed(2).replace(".", ",") : ""}
                              onBlur={e => {
                                const valorDesc = parseFloat((e.target.value || "0").replace(",", ".")) || 0;
                                const pct = item.preco_lista > 0 ? Math.min(maxDesconto, (valorDesc / item.preco_lista) * 100) : 0;
                                handleUpdateItem(item.id!, "pct_desconto", String(Math.round(pct * 100) / 100));
                              }}
                              placeholder="0,00"
                              className="w-20 border rounded px-1.5 py-1 text-sm text-right outline-none" style={{ borderColor: C.cremeBorder }} />
                          </td>
                        )}
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_unitario)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(item.total_item)}</td>
                        {edit.limited && (
                          <td className="px-3 py-2.5">
                            <button onClick={() => item.id && handleRemoveItem(item.id)} disabled={updating}
                              className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40">
                              <X size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add item panel */}
              {addingItem && edit.limited && (
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
                      <button onClick={handleAddItem} disabled={!!descontoErr || pctDesconto > maxDesconto || updating}
                        className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                        {updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Confirmar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {edit.limited && (
                <button onClick={() => setAddingItem(true)} disabled={addingItem}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                  <Plus size={14} /> adicionar outro item
                </button>
              )}

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

        {/* ── 4. Pagamentos ── */}
        <Secao>
          <STitle>Pagamento</STitle>

          {/* Pagamentos já registrados */}
          {venda.pagamentos.length > 0 && (
            <div className="space-y-2 mb-4">
              {venda.pagamentos.map(pag => {
                const sc = PAG_STATUS_COLOR[pag.status] ?? PAG_STATUS_COLOR.pendente;
                return (
                  <div key={pag.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: C.cremeBorder }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                        {pag.forma}{pag.parcelas > 1 ? ` ${pag.parcelas}×` : ""}
                        {pag.gateway && <span className="text-xs ml-1" style={{ color: "#9CA3AF" }}>via {pag.gateway}</span>}
                      </p>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>
                        {pag.data_confirmacao ? `Confirmado em ${fmtDate(pag.data_confirmacao)}` : "Sem confirmação"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: sc.bg, color: sc.text }}>{pag.status}</span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(pag.valor)}</span>
                      {isFullAccess && pag.status === "pendente" && (
                        <button onClick={() => confirmarPagamento(pag.id)} disabled={updating}
                          className="text-xs px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}>Confirmar</button>
                      )}
                      {edit.limited && (
                        <button onClick={() => handleRemovePagamento(pag.id)} disabled={updating}
                          className="text-gray-300 hover:text-red-400 disabled:opacity-40"><X size={13} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 space-y-1 border-t" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Pago (confirmado)</span>
                  <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(venda.total_pago)}</span>
                </div>
                {venda.total_venda - venda.total_pago > 0.01 && (
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span style={{ color: "#D97706" }}>Saldo pendente</span>
                    <span className="tabular-nums" style={{ color: "#D97706" }}>{fmt(venda.total_venda - venda.total_pago)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Formulário de pagamento (mesmo layout da nova venda) */}
          {edit.limited && venda.pagamentos.length === 0 && (
            <>
              <p className="text-sm mb-4" style={{ color: "#6B7280" }}>Selecione a forma de recebimento do valor total</p>

              <div className="mb-4">
                <Label>Forma de recebimento</Label>
                <Select value={newPagForma} onChange={e => { setNewPagForma(e.target.value); setNewPagParcelas(1); }}>
                  <optgroup label="Métodos de Pagamento">
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                </Select>
              </div>

              {/* Dinheiro */}
              {["Dinheiro", "Ouro", "A Receber"].includes(newPagForma) && (
                <div className="rounded-lg border px-4 py-3 text-sm mb-4" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                  Pagamento em {newPagForma.toLowerCase()}. Não há campos adicionais necessários.
                </div>
              )}

              {/* Cartão Crédito / Débito — gateway + bandeira + condição */}
              {COM_CARTAO.includes(newPagForma) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <Label>Gateway</Label>
                    <Select value={newPagGateway} onChange={e => setNewPagGateway(e.target.value)}>
                      {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Bandeira</Label>
                    <Select value={newPagBandeira} onChange={e => setNewPagBandeira(e.target.value)}>
                      {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
                    </Select>
                  </div>
                  {newPagForma === "Cartão de Crédito" && (
                    <div>
                      <Label>Condição de Pagamento</Label>
                      <Select value={newPagCondicao} onChange={e => setNewPagCondicao(e.target.value)}>
                        {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Ouro / A Receber / Pix / Vale-Troca — só condição */}
              {COM_PARCELAS.includes(newPagForma) && !COM_CARTAO.includes(newPagForma) && newPagForma !== "Dinheiro" && (
                <div className="mb-4 w-56">
                  <Label>Condição de Pagamento</Label>
                  <Select value={newPagCondicao} onChange={e => setNewPagCondicao(e.target.value)}>
                    {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              )}

              {/* Tabela de parcelas */}
              {COM_PARCELAS.includes(newPagForma) && parcelasRows.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#374151" }}>Detalhamento das parcelas</p>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>Configure o valor e data de cada parcela. Valores editados não serão redistribuídos automaticamente.</p>
                    </div>
                    <button onClick={equalizarParcelas}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
                      style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                      ↺ Equalizar
                    </button>
                  </div>
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    <table className="w-full text-sm">
                      <thead style={{ backgroundColor: C.cremeBg }}>
                        <tr>
                          {["Nº", "Dias", "Data", "Valor"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parcelasRows.map((row, i) => (
                          <tr key={i} className="border-t" style={{ borderColor: C.cremeBorder }}>
                            <td className="px-3 py-2.5 text-xs w-8" style={{ color: "#9CA3AF" }}>{row.num}</td>
                            <td className="px-3 py-2.5 w-24">
                              <input type="number" value={row.dias} min={0} onChange={e => updateParcelaRow(i, "dias", e.target.value)}
                                className="w-16 border rounded px-2 py-1 text-sm text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                            </td>
                            <td className="px-3 py-2.5 w-40">
                              <input type="date" value={row.data} onChange={e => updateParcelaRow(i, "data", e.target.value)}
                                className="border rounded px-2 py-1 text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
                            </td>
                            <td className="px-3 py-2.5">
                              <input type="text" value={row.valor.toFixed(2).replace(".", ",")} onChange={e => updateParcelaRow(i, "valor", e.target.value)}
                                className="w-full border rounded px-2 py-1 text-sm outline-none text-right tabular-nums" style={{ borderColor: C.cremeBorder }} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="grid grid-cols-2 border-t px-4 py-3 text-sm" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>Total da venda</p>
                        <p className="font-bold tabular-nums" style={{ color: "#374151" }}>{fmt(totalVenda)}</p>
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: "#9CA3AF" }}>Total das parcelas</p>
                        {(() => {
                          const soma = parcelasRows.reduce((s, r) => s + r.valor, 0);
                          const ok = Math.abs(soma - totalVenda) < 0.02;
                          return <p className="font-bold tabular-nums" style={{ color: ok ? "#059669" : "#D97706" }}>{fmt(soma)}</p>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Múltiplas */}
              {newPagForma === "Múltiplas" && (() => {
                const totalMult = multPagamentos.reduce((s, p) => s + p.valor, 0);
                const restante = +(totalVenda - totalMult).toFixed(2);
                return (
                  <div className="mb-4">
                    <div className="flex flex-wrap items-end gap-2 mb-3">
                      <div className="flex-1 min-w-36">
                        <Label>Forma</Label>
                        <Select value={multPagForma} onChange={e => setMultPagForma(e.target.value)}>
                          <optgroup label="Métodos de Pagamento">
                            {FORMAS_PAGAMENTO.filter(f => f !== "Múltiplas").map(f => <option key={f} value={f}>{f}</option>)}
                          </optgroup>
                        </Select>
                      </div>
                      <div className="flex-1 min-w-28">
                        <Label>Valor{restante > 0 && <span className="ml-1 font-normal text-xs" style={{ color: "#9CA3AF" }}>(restante: {fmt(restante)})</span>}</Label>
                        <input type="text" value={multPagValor} onChange={e => setMultPagValor(e.target.value)}
                          placeholder={restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00"}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const v = parseFloat(multPagValor.replace(",", ".")) || 0;
                              if (v > 0 && restante > 0) {
                                setMultPagamentos(prev => [...prev, { _key: Math.random().toString(36).slice(2), forma: multPagForma, valor: Math.min(v, restante) }]);
                                setMultPagValor("");
                              }
                            }
                          }}
                          className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                      </div>
                      <button onClick={() => {
                          const v = parseFloat(multPagValor.replace(",", ".")) || 0;
                          if (v > 0 && restante > 0) {
                            setMultPagamentos(prev => [...prev, { _key: Math.random().toString(36).slice(2), forma: multPagForma, valor: Math.min(v, restante) }]);
                            setMultPagValor("");
                          }
                        }} disabled={restante <= 0}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                        <Plus size={13} /> Adicionar
                      </button>
                    </div>
                    {multPagamentos.length > 0 && (
                      <div className="space-y-1.5">
                        {multPagamentos.map(p => (
                          <div key={p._key} className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }}>
                            <span style={{ color: "#374151" }}>{p.forma}</span>
                            <div className="flex items-center gap-3">
                              <span className="tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(p.valor)}</span>
                              <button onClick={() => setMultPagamentos(prev => prev.filter(x => x._key !== p._key))} className="text-gray-300 hover:text-red-400"><X size={13} /></button>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
                          <span style={{ color: "#6B7280" }}>Restante a pagar</span>
                          <span className="tabular-nums font-semibold" style={{ color: restante > 0.01 ? "#D97706" : "#059669" }}>{fmt(restante)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Categoria */}
              <div className="rounded-lg border px-4 py-3 text-sm mb-4" style={{ borderColor: C.cremeBorder }}>
                <span className="font-medium" style={{ color: "#374151" }}>Categoria:</span>
                <span className="ml-1" style={{ color: "#6B7280" }}>01.01 - Vendas de Produtos e serviço</span>
              </div>

              {/* Botão registrar pagamento */}
              {newPagForma !== "Múltiplas" ? (
                <button onClick={() => {
                    setNewPagValor(totalVenda.toFixed(2).replace(".", ","));
                    handleAddPagamento();
                  }} disabled={updating || totalVenda <= 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  {updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={13} />} Registrar Pagamento
                </button>
              ) : (
                <button onClick={async () => {
                    if (multPagamentos.length === 0) return;
                    setUpdating(true);
                    try {
                      for (const p of multPagamentos) {
                        const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ forma: p.forma, valor: p.valor, parcelas: 1 }),
                        });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Erro"); }
                      }
                      await load();
                      setMultPagamentos([]);
                    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao registrar pagamentos"); }
                    finally { setUpdating(false); }
                  }} disabled={updating || multPagamentos.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  {updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={13} />} Registrar Pagamentos ({multPagamentos.length})
                </button>
              )}
            </>
          )}

          {/* Botão adicionar mais quando já tem pagamentos */}
          {edit.limited && venda.pagamentos.length > 0 && (
            <>
              {addingPag ? (
                <div className="p-4 rounded-xl border mb-3 mt-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium" style={{ color: "#374151" }}>Adicionar pagamento</p>
                    <button onClick={() => setAddingPag(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Forma</Label>
                      <Select value={newPagForma} onChange={e => setNewPagForma(e.target.value)}>
                        {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                      </Select>
                    </div>
                    {["Cartão de Crédito", "Cartão de Débito"].includes(newPagForma) && (
                      <>
                        <div>
                          <Label>Gateway</Label>
                          <Select value={newPagGateway} onChange={e => setNewPagGateway(e.target.value)}>
                            {GATEWAYS.map(g => <option key={g} value={g}>{g}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label>Bandeira</Label>
                          <Select value={newPagBandeira} onChange={e => setNewPagBandeira(e.target.value)}>
                            {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
                          </Select>
                        </div>
                      </>
                    )}
                    <div>
                      <Label>Valor</Label>
                      <input type="text" value={newPagValor} onChange={e => setNewPagValor(e.target.value)}
                        placeholder="0,00" onKeyDown={e => e.key === "Enter" && handleAddPagamento()}
                        className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                    </div>
                    <div>
                      <Label>Parcelas</Label>
                      <Select value={newPagParcelas} onChange={e => setNewPagParcelas(Number(e.target.value))}>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x</option>)}
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button onClick={handleAddPagamento} disabled={updating}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                      style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      {updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={13} />} Adicionar
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => {
                    const totalPago = venda.pagamentos.reduce((s, p) => s + Number(p.valor), 0);
                    const pendente = totalVenda - totalPago;
                    setNewPagValor(pendente > 0 ? pendente.toFixed(2).replace(".", ",") : "");
                    setAddingPag(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80 mt-3"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                  <Plus size={14} /> adicionar pagamento
                </button>
              )}
            </>
          )}

          {/* Totals */}
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
        </Secao>

        {/* ── 5. Transportador e Frete ── */}
        <Secao>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
              <Truck size={18} style={{ color: C.esmeralda }} />
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color: "#1A1A1A" }}>Transportador e Frete</p>
              <p className="text-xs" style={{ color: "#6B7280" }}>Forma de Envio</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label required>Forma de Envio</Label>
              <Select value={formaEnvioId} disabled={!edit.limited}
                onChange={e => { setFormaEnvioId(e.target.value === "" ? "" : Number(e.target.value)); setFormaFreteId(""); markDirty(); }}>
                <option value="">Selecione a forma de envio</option>
                {formaEnvioOpts.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
            </div>
            <div>
              <Label required>Forma de Frete</Label>
              <Select value={formaFreteId} disabled={!edit.limited || !formaEnvioId || formaFreteOpts.length === 0}
                onChange={e => { setFormaFreteId(e.target.value === "" ? "" : Number(e.target.value)); markDirty(); }}
                style={{ opacity: (!edit.limited || !formaEnvioId || formaFreteOpts.length === 0) ? 0.5 : 1 }}>
                <option value="">Selecione a forma de frete</option>
                {formaFreteOpts.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Select>
            </div>
          </div>
        </Secao>

        {/* ── 6. Dados Adicionais ── */}
        <Secao>
          <STitle>Dados Adicionais</STitle>
          <div className="space-y-4">
            <div>
              <Label>Observações</Label>
              <textarea rows={3} value={observacoes} disabled={!edit.metadata}
                onChange={e => { setObservacoes(e.target.value); markDirty(); }}
                placeholder="Digite observações sobre o pedido..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none disabled:opacity-50"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            <div>
              <Label>Observações Internas</Label>
              <textarea rows={3} value={obsInternas} disabled={!edit.metadata}
                onChange={e => { setObsInternas(e.target.value); markDirty(); }}
                placeholder="Digite observações internas (uso interno)..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none disabled:opacity-50"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            {isFullAccess && (
              <div>
                <Label>Vídeo Interno</Label>
                {!videoPreviewUrl ? (
                  edit.metadata ? (
                    <label className="flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed cursor-pointer py-6 transition-colors hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                      <Video size={22} style={{ color: "#9CA3AF" }} />
                      <span className="text-sm" style={{ color: "#9CA3AF" }}>Gravar ou selecionar vídeo</span>
                      <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoSelect} />
                    </label>
                  ) : (
                    <div className="rounded-lg border px-4 py-6 text-center text-sm" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>Sem vídeo</div>
                  )
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
                      {edit.metadata && (
                        <button type="button" onClick={handleRemoveVideo} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400"><X size={12} /> Remover</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Secao>

        {/* ── 7. Ordens vinculadas ── */}
        {venda.ordens && venda.ordens.length > 0 && (
          <Secao>
            <STitle>Ordens Vinculadas</STitle>
            <div className="space-y-2">
              {venda.ordens.map(ord => {
                const statusColor: Record<string, { bg: string; text: string }> = {
                  aguardando: { bg: "#FEF3C7", text: "#92400E" },
                  em_andamento: { bg: "#DBEAFE", text: "#1E40AF" },
                  concluido: { bg: "#D1FAE5", text: "#065F46" },
                  cancelado: { bg: "#FEE2E2", text: "#991B1B" },
                };
                const sc = statusColor[ord.status] ?? { bg: "#F3F4F6", text: "#6B7280" };
                const tipoLabel: Record<string, string> = {
                  fabricacao: "Fabricação", garantia: "Garantia", servico_venda: "Serviço",
                  reposicao_venda: "Reposição Venda", reposicao_loja: "Reposição Loja",
                  compra_fornecedor: "Compra", servico_interno: "Serviço Interno",
                };
                return (
                  <Link key={ord.id} href={`/ordens/${ord.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-stone-50 transition-colors no-underline"
                    style={{ borderColor: C.cremeBorder }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold" style={{ color: C.esmeralda }}>{ord.numero_ordem}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
                        {tipoLabel[ord.tipo_ordem] ?? ord.tipo_ordem}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        {ord.status}
                      </span>
                      <ArrowLeft size={14} style={{ color: "#9CA3AF", transform: "rotate(180deg)" }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Secao>
        )}

        {/* ── Footer ── */}
        <div className="px-6 py-5 flex items-center justify-between gap-3">
          {saveErr && <p className="text-sm text-red-600 flex-1">{saveErr}</p>}

          <div className="flex items-center gap-2">
            {podeCancelar && (
              <button onClick={cancelar} disabled={updating}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-50"
                style={{ borderColor: "#FCA5A5", color: "#EF4444" }}>
                {updating ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Cancelar Venda
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isDirty && (
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-40 transition-opacity hover:opacity-80"
                style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                Salvar Alterações
              </button>
            )}
            {proximasAcoes.map(acao => {
              const needsValidation = acao.value === "aprovado" || acao.value === "concluido";
              const isDisabled = updating || saving || (needsValidation && !podeAprovar);
              return (
                <div key={acao.value} className="relative group">
                  <button onClick={() => changeSituacao(acao.value)} disabled={isDisabled}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    {updating ? <Loader2 size={14} className="animate-spin" /> : <acao.icon size={14} />}
                    {acao.label}
                  </button>
                  {needsValidation && !podeAprovar && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-52 p-2 rounded-lg border bg-white shadow-lg text-xs" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                      Preencha antes:
                      {!venda.cliente_id && <p className="text-red-500">• Cliente</p>}
                      {itens.length === 0 && <p className="text-red-500">• Produtos</p>}
                      {venda.pagamentos.length === 0 && <p className="text-red-500">• Pagamento</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
