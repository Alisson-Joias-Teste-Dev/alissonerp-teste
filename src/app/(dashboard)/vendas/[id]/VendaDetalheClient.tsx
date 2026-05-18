"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Search, X, Plus, Loader2, CheckCircle, XCircle, AlertCircle,
  Truck, Video, RefreshCw, Share2, Download,
  Check as CheckIcon, FileText, UserPlus, MapPin, Pencil,
  RotateCcw, ArrowRight, PackageCheck, ScanLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { maskCpfCnpj } from "@/lib/formatters";
import { gerarPDFOrcamento } from "@/lib/gerar-pdf-orcamento";
import type { OrcamentoPDF } from "@/lib/gerar-pdf-orcamento";
import MercadoPagoCobranca from "@/components/vendas/MercadoPagoCobranca";
import PixQrInline from "@/components/vendas/PixQrInline";
import CartaoInline from "@/components/vendas/CartaoInline";
import PagamentoForm, { type PagamentoEntry, fmt as fmtPagamento } from "@/components/vendas/PagamentoForm";
import EmitirNfceModal from "@/components/fiscal/EmitirNfceModal";
import NotaFiscalDetalheModal from "@/components/fiscal/NotaFiscalDetalheModal";
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
}
interface FaixaComissao { desconto_pct: number; comissao_pct: number; }
interface ItemVenda {
  id?: number; _key: string; produto_id: number | null; nome_produto: string; sku: string;
  quantidade: number; preco_lista: number; pct_desconto: number;
  preco_unitario: number; total_item: number; pct_comissao: number;
  valor_comissao: number; peso_estimado: number | null; unidade: string | null;
  observacao?: string | null;
  /** Markup gravado quando o item vem de orçamento (aliança/peça). Quando
   *  presente, a comissão usa commissionForMarkup (curva). Quando null,
   *  cai na faixas_comissao por desconto. */
  markup_aplicado?: number | null;
  personalizacao?: { valor?: string; preco_por_letra?: number; peso_por_letra?: number } | null;
}
interface PagamentoServer {
  id: number; forma: string; gateway: string | null; valor: number;
  parcelas: number; status: string; data_confirmacao: string | null;
  valor_liquido?: number | null;  // valor que cai na conta MP (bruto - taxas)
  taxas_mp?: number | null;        // total deduzido (MP fee + adquirência)
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
  tiny_pedido_id: string | null; tiny_sync_erro: string | null; bloqueado: boolean; qtd_itens: number;
  cliente_id_tiny?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  credito_gerente_usado?: number;
  aprovacao_credito_tipo?: string | null;
  aprovacao_credito_tarefa_id?: number | null;
  aprovacao_credito_status?: string | null;
  aprovacao_credito_responsavel_nome?: string | null;
  aprovacao_tarefa_tags?: string[] | string | null;
  aprovacao_desconto_aprov_id?: number | null;
  desconto_aprovado_por_nome?: string | null;
  desconto_aprovado_em?: string | null;
  desconto_cartao_aprovado_por_nome?: string | null;
  desconto_cartao_aprovado_em?: string | null;
  endereco_entrega?: string | null; endereco_entrega_numero?: string | null;
  endereco_entrega_complemento?: string | null; endereco_entrega_bairro?: string | null;
  endereco_entrega_cidade?: string | null; endereco_entrega_cep?: string | null;
  endereco_entrega_uf?: string | null;
  cliente_endereco?: string | null; cliente_numero?: string | null;
  cliente_complemento?: string | null; cliente_bairro?: string | null;
  cliente_municipio?: string | null; cliente_cep?: string | null; cliente_uf?: string | null;
  itens: Array<{
    id: number; produto_id: number | null; nome_produto: string; sku: string | null;
    quantidade: number; preco_lista: number; pct_desconto: number;
    preco_unitario: number; total_item: number; pct_comissao: number;
    valor_comissao: number; observacao: string | null; peso_estimado?: number | null;
    markup_aplicado?: number | null;
    personalizacao?: { valor?: string; preco_por_letra?: number; peso_por_letra?: number } | null;
  }>;
  pagamentos: PagamentoServer[];
  ordens?: Array<{
    id: number; numero_ordem: string; tipo_ordem: string;
    situacao: string; status: string; created_at: string;
  }>;
  empresa_emitente_id?: number | null;
  nota_fiscal_id?: number | null;
  devolucoes?: Array<{
    id: number;
    numero: string;
    tipo: "parcial" | "total";
    status: string;
    tipo_compensacao: "vale_troca" | "reembolso_mp" | "reembolso_manual";
    valor_total_devolvido: number;
    valor_compensacao: number;
    created_at: string;
  }>;
}

const FORMAS_PAGAMENTO = [
  "Dinheiro", "Cartão de Crédito",
  "Vale-Troca", "Pix", "Ouro", "A Receber", "Múltiplas", "Manual (MP)",
];
const GATEWAYS   = ["Mercado Pago", "PagSeguro", "Cielo", "Stone", "Getnet", "Rede", "Outro"];
const BANDEIRAS  = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outro"];
const CONDICOES  = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
const COM_PARCELAS = ["Cartão de Crédito", "Vale-Troca"];
const COM_CARTAO   = ["Cartão de Crédito", "Pix"];

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
  entregue:  { bg: "#EDE9FE", text: "#5B21B6" },
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
  rascunho:  [{ label: "Salvar Venda",    value: "aprovado", icon: CheckCircle }],
  aprovado:  [{ label: "Marcar Enviado",  value: "enviado",  icon: Truck },
              { label: "Marcar Entregue", value: "entregue", icon: PackageCheck }],
  enviado:   [{ label: "Marcar Entregue", value: "entregue", icon: PackageCheck }],
  entregue:  [],
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
// fmtDateTime usa o timezone local do navegador (não UTC) porque
// data_confirmacao é TIMESTAMPTZ e queremos mostrar no horário de Brasília
function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  const data = date.toLocaleDateString("pt-BR");
  const hora = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} às ${hora}`;
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

// ─── RFID Section ─────────────────────────────────────────────────────────────
function RFIDSection({ vendaId, onUpdate }: { vendaId: number; onUpdate: () => void }) {
  const [vinculados, setVinculados] = useState<Array<{ id: string; epc: string; sku: string; nome: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [scanValue, setScanValue] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const fetchVinculados = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/vendas/${vendaId}/rfid`);
      if (r.ok) {
        const data = await r.json();
        setVinculados(data.vinculados ?? []);
        setScanMsg(null);
      }
    } finally { setLoading(false); }
  }, [vendaId]);

  useEffect(() => { fetchVinculados(); }, [fetchVinculados]);

  // Foca no input de scan sempre que a lista carregar
  useEffect(() => { if (!loading) scanRef.current?.focus(); }, [loading]);

  async function handleScan(code: string) {
    if (!code.trim()) return;
    setScanValue("");
    setScanMsg(null);
    try {
      const r = await fetch("/api/rfid/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: code.trim(), action: "vincular_venda", venda_id: vendaId }),
      });
      const data = await r.json();
      if (r.ok) {
        setScanMsg({ ok: true, text: `✅ ${data.rfid.produto} vinculado` });
        await fetchVinculados();
        onUpdate();
      } else {
        setScanMsg({ ok: false, text: `❌ ${data.error}` });
      }
    } catch {
      setScanMsg({ ok: false, text: "❌ Erro ao processar leitura" });
    }
    setTimeout(() => scanRef.current?.focus(), 100);
  }

  return (
    <div>
      {/* Scanner input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
          Ler etiqueta RFID
        </label>
        <div className="flex gap-2">
          <input
            ref={scanRef}
            type="text"
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleScan(scanValue); }}
            placeholder="Aponte o leitor aqui e escaneie..."
            className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
            style={{ borderColor: C.cremeBorder, color: "#374151" }}
            autoFocus
          />
          <button
            onClick={() => handleScan(scanValue)}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: C.esmeralda, color: C.creme }}
          >
            OK
          </button>
        </div>
        {scanMsg && (
          <p className={`text-xs mt-1.5 ${scanMsg.ok ? "text-green-600" : "text-red-500"}`}>
            {scanMsg.text}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1.5">
          Escaneie o código de barras ou RFID da peça. O sistema vincula automaticamente.
        </p>
      </div>

      {/* Vinculados */}
      {loading ? (
        <p className="text-sm" style={{ color: "#9CA3AF" }}>Carregando...</p>
      ) : vinculados.length > 0 ? (
        <div>
          <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "#6B7280" }}>
            Peças vinculadas ({vinculados.length})
          </p>
          <div className="space-y-1.5">
            {vinculados.map(r => (
              <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <CheckIcon size={14} style={{ color: "#16A34A" }} />
                <span className="font-mono text-xs text-gray-500">{r.epc.slice(-12)}</span>
                <span className="text-gray-700">{r.nome}</span>
                <span className="text-xs ml-auto px-1.5 py-0.5 rounded" style={{ background: r.status === "reservado" ? "#FEF3C7" : "#D1FAE5", color: r.status === "reservado" ? "#92400E" : "#065F46" }}>
                  {r.status === "reservado" ? "Reservado" : "Vendido"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "#9CA3AF" }}>
          Nenhuma peça vinculada. Escaneie as etiquetas acima.
        </p>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  vendaId: number;
  role: string;
  vendedorId: number | null;
  isFullAccess: boolean;
  maxDesconto: number;
  descontoAuthThreshold?: number;
}

interface PendingAuth {
  solicitacaoId: number | null;
  pct: number;
  status: "local" | "pendente" | "aprovado" | "rejeitado";
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function VendaDetalheClient({ vendaId, role, vendedorId, isFullAccess, maxDesconto, descontoAuthThreshold }: Props) {
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
  const [pendingAuths, setPendingAuths] = useState<Record<number, PendingAuth>>({});
  const [localPct, setLocalPct] = useState<Record<number, number>>({});
  const [localPrecoUn, setLocalPrecoUn] = useState<Record<number, string>>({});

  // ── Payment add ─────────────────────────────────────────────────────────────
  const [addingPag, setAddingPag] = useState(false);
  const [newPagForma, setNewPagForma] = useState("Dinheiro");
  const [newPagValor, setNewPagValor] = useState("");
  const [newPagGateway, setNewPagGateway] = useState("Mercado Pago");
  const [newPagBandeira, setNewPagBandeira] = useState("Outro");
  const [newPagParcelas, setNewPagParcelas] = useState(1);
  const [newPagCondicao, setNewPagCondicao] = useState("À vista");
  const [newPagValeNumero, setNewPagValeNumero] = useState("");
  const [parcelasRows, setParcelasRows] = useState<ParcelaRow[]>([]);
  const [multPagForma, setMultPagForma] = useState("Dinheiro");
  const [multPagValor, setMultPagValor] = useState("");
  const [multPagamentos, setMultPagamentos] = useState<Array<{ _key: string; forma: string; valor: number; ouro_peso?: number; ouro_valor_grama?: number; ouro_foto_path?: string }>>([]);

  // ── Manual MP ───────────────────────────────────────────────────────────────
  const [mpManualId, setMpManualId] = useState("");
  const [mpManualLoading, setMpManualLoading] = useState(false);
  const [mpManualMsg, setMpManualMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Manual MP inline (pagamento pendente na venda) ──────────────────────────
  const [mpManualPagId, setMpManualPagId] = useState<number | null>(null);
  const [mpManualPagIdValue, setMpManualPagIdValue] = useState("");
  const [mpManualPagLoading, setMpManualPagLoading] = useState(false);
  const [mpManualPagMsg, setMpManualPagMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Registrar Recebimento A Receber ─────────────────────────────────────────
  const [recebimentoPagId, setRecebimentoPagId] = useState<number | null>(null);
  const [recebimentoTipo, setRecebimentoTipo] = useState<"dinheiro" | "mp" | null>(null);
  const [recebimentoMpId, setRecebimentoMpId] = useState("");
  const [recebimentoLoading, setRecebimentoLoading] = useState(false);
  const [recebimentoMsg, setRecebimentoMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Ouro ────────────────────────────────────────────────────────────────────
  const [ouroPeso, setOuroPeso] = useState("");
  const [ouroValorGrama, setOuroValorGrama] = useState("");
  const [ouroFotoFile, setOuroFotoFile] = useState<File | null>(null);
  const [ouroFotoPreview, setOuroFotoPreview] = useState<string | null>(null);
  const [ouroValidacaoIA, setOuroValidacaoIA] = useState<{ match: boolean; mensagem: string } | null>(null);
  const [ouroValidando, setOuroValidando] = useState(false);
  const [ouroFotoPath, setOuroFotoPath] = useState<string | null>(null);
  // Ouro no fluxo Múltiplas
  const [multOuroPeso, setMultOuroPeso] = useState("");
  const [multOuroValorGrama, setMultOuroValorGrama] = useState("");
  const [multOuroFotoFile, setMultOuroFotoFile] = useState<File | null>(null);
  const [multOuroFotoPreview, setMultOuroFotoPreview] = useState<string | null>(null);
  const [multOuroValidacaoIA, setMultOuroValidacaoIA] = useState<{ match: boolean; mensagem: string } | null>(null);
  const [multOuroValidando, setMultOuroValidando] = useState(false);

  // ── Vale-Troca ───────────────────────────────────────────────────────────────
  const [valeNumero, setValeNumero] = useState("");
  const [valeValidando, setValeValidando] = useState(false);
  const [valeValidacao, setValeValidacao] = useState<{
    ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null;
  } | null>(null);
  const [multValeNumero, setMultValeNumero] = useState("");
  const [multValeValidando, setMultValeValidando] = useState(false);
  const [multValeValidacao, setMultValeValidacao] = useState<{
    ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null;
  } | null>(null);

  // ── Gateways dinâmicos ──────────────────────────────────────────────────────
  const [gateways, setGateways] = useState<{ id: number; nome: string }[]>([]);
  useEffect(() => {
    fetch("/api/configuracoes/gateways").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setGateways(d.filter((g: any) => g.ativo));
    }).catch(() => {});
  }, []);

  // ── PagamentoForm payments ──────────────────────────────────────────────────
  const [edicaoPayments, setEdicaoPayments] = useState<PagamentoEntry[]>([]);

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
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSaveRef    = useRef<() => Promise<void>>(async () => {});
  const [updating, setUpdating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [retryingTiny, setRetryingTiny] = useState(false);
  const [tinyRetryMsg, setTinyRetryMsg] = useState<string | null>(null);
  const [syncingCliente, setSyncingCliente] = useState(false);
  const [clienteSyncMsg, setClienteSyncMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [abrirNfce, setAbrirNfce] = useState(false);
  const [verNotaId, setVerNotaId] = useState<number | null>(null);

  // Modal de solicitação de alteração (quando o backend devolve 403 com solicitar:true)
  const [solicitarPayload, setSolicitarPayload] = useState<{
    tipo: "pagamento_status" | "venda_campo";
    campo?: string;
    pagamento_id?: number;
    valor_solicitado: unknown;
    mensagemBloqueio: string;
  } | null>(null);
  const [solicitarMotivo, setSolicitarMotivo] = useState("");
  const [solicitarEnviando, setSolicitarEnviando] = useState(false);
  const [solicitarErro, setSolicitarErro] = useState("");
  const [solicitarSucesso, setSolicitarSucesso] = useState(false);

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

  // Realtime: recarrega quando desconto_aprovado_por ou situacao mudam
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`venda-${vendaId}-changes`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "UPDATE",
        schema: "alissonerp",
        table: "vendas_erp",
        filter: `id=eq.${vendaId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [vendaId, load]);

  // Load ref data
  useEffect(() => {
    const { push } = useErrorStore.getState();
    fetch("/api/vendas/faixas-comissao").then(r => r.json()).then(setFaixas)
      .catch(() => push("Erro ao carregar faixas de comissão", { level: "warning" }));
    fetch("/api/vendas/forma-envio").then(r => r.json()).then((d: { envio: FormaEnvio[]; frete: FormaFrete[] }) => {
      setFormaEnvioOpts(d.envio ?? []); setFormaFreteAll(d.frete ?? []);
    }).catch(() => push("Erro ao carregar formas de envio/frete", { level: "warning" }));
    if (isFullAccess) fetch("/api/vendedores").then(r => r.json()).then(setVendedores)
      .catch(() => push("Erro ao carregar vendedores", { level: "warning" }));
  }, [isFullAccess]);

  // ── Hydrate form from venda ─────────────────────────────────────────────────
  useEffect(() => {
    if (!venda) return;
    setCliente(venda.cliente_id ? {
      id: venda.cliente_id, nome: venda.cliente_nome ?? "",
      cpf_cnpj: venda.cliente_cpf_cnpj, email: venda.cliente_email, telefone: venda.cliente_telefone,
    } : null);
    const vendedorAutoFill = venda.vendedor_id ?? vendedorId ?? "";
    setVendedorSel(vendedorAutoFill);
    // Se a venda não tem vendedor mas o usuário logado tem um vinculado, marca dirty para salvar
    if (!venda.vendedor_id && vendedorId) markDirty();
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
    const envioNome = venda.forma_envio?.toLowerCase();
    const envio = formaEnvioOpts.find(e => e.nome.toLowerCase() === envioNome);
    if (envio) setFormaEnvioId(envio.id);
    if (venda.forma_frete && formaFreteAll.length > 0) {
      const freteNome = venda.forma_frete.toLowerCase();
      const frete = formaFreteAll.find(f => f.nome.toLowerCase() === freteNome);
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
    if (venda.situacao === "aprovado") {
      return { full: false, limited: podeEditarAprovado, metadata: podeEditarAprovado, readOnly: !podeEditarAprovado };
    }
    if (venda.situacao === "enviado" || venda.situacao === "entregue")
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
      markup_aplicado: i.markup_aplicado ?? null,
      personalizacao: i.personalizacao ?? null,
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
    if (pct > 30) return 0.5;
    const faixa = faixas.find(f => f.desconto_pct === Math.round(pct));
    if (!faixa) return 0;
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

  async function handleUpdateItem(itemId: number, field: "quantidade" | "pct_desconto" | "preco_unitario", raw: string) {
    if (!venda) return;

    // Edição direta do "Preço Un": preserva o valor digitado pelo gerente
    // (sem round-trip por pct_desconto, que perde precisão: 2000 -> 2000,04).
    if (field === "preco_unitario") {
      const item = venda.itens.find(i => i.id === itemId);
      if (!item || item.preco_lista <= 0) return;
      const novoPreco = parseFloat(raw.replace(",", ".")) || 0;
      if (novoPreco < 0 || novoPreco > item.preco_lista) return;
      let pct = ((item.preco_lista - novoPreco) / item.preco_lista) * 100;
      if (pct > maxDesconto && venda.situacao !== "rascunho") return;
      pct = Math.round(pct * 100) / 100;

      const authThr = descontoAuthThreshold ?? maxDesconto;
      if (pct > authThr && venda.situacao !== "rascunho") {
        setPendingAuths(prev => ({ ...prev, [itemId]: { solicitacaoId: null, pct, status: "local" } }));
        return;
      } else {
        setPendingAuths(prev => {
          if (!prev[itemId]) return prev;
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }

      const newQtd        = item.quantidade;
      const precoUnit     = novoPreco;                             // preserva precisão digitada
      const totalItem     = precoUnit * newQtd;
      const pctComissao   = getComissao(pct);
      const valorComissao = totalItem * pctComissao / 100;

      setUpdating(true);
      try {
        const res = await fetch(`/api/vendas/${venda.id}/itens/${itemId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantidade: newQtd, pct_desconto: pct,
            preco_unitario: precoUnit, total_item: totalItem,
            pct_comissao: pctComissao, valor_comissao: valorComissao,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
        await load();
      } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao atualizar item"); }
      finally { setUpdating(false); }
      return;
    }

    const val = Number(raw);
    if (isNaN(val) || val < 0) return;
    if (field === "pct_desconto" && val > maxDesconto) return;
    if (field === "quantidade" && val < 1) return;

    const authThr = descontoAuthThreshold ?? maxDesconto;
    // Em rascunho, o fluxo de aprovação é no nível da venda (precisaAprovacaoDesconto),
    // então não bloqueia o PATCH aqui — deixa salvar e o banner de aprovação cuida do resto.
    if (venda.situacao !== "rascunho") {
      if (field === "pct_desconto" && val > authThr) {
        setPendingAuths(prev => ({
          ...prev,
          [itemId]: { solicitacaoId: null, pct: val, status: "local" },
        }));
        return;
      } else if (field === "pct_desconto" && val <= authThr) {
        setPendingAuths(prev => {
          if (!prev[itemId]) return prev;
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    }

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

  // ── Ouro helpers ─────────────────────────────────────────────────────────────
  async function validarOuroIA(file: File, peso: number, setter: (r: { match: boolean; mensagem: string } | null) => void, loadingSetter: (v: boolean) => void) {
    loadingSetter(true);
    setter(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("peso", String(peso));
      const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
      const result = await res.json() as { match: boolean; mensagem: string } & { error?: string };
      if (!res.ok) {
        setter({ match: false, mensagem: result.error || `Erro ${res.status} ao validar peso` });
      } else {
        setter(result);
      }
    } catch {
      setter({ match: false, mensagem: "Falha de conexão ao validar peso. Verifique sua internet." });
    } finally {
      loadingSetter(false);
    }
  }

  // ── Vale-Troca validar (callback-style para PagamentoForm) ──────────────────
  async function validarValeFn(
    numero: string,
    setResult: (r: { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null) => void,
    setLoading: (v: boolean) => void,
  ) {
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/vale-troca/validar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: numero.trim() }),
      });
      const d = await res.json() as { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null };
      setResult(d);
    } catch { setResult({ ok: false, erro: "Erro ao validar" }); }
    finally { setLoading(false); }
  }

  async function uploadOuroFoto(file: File, vendaIdParam: number): Promise<string | null> {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `pagamentos/${vendaIdParam}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("pagamento-fotos").upload(path, file, { contentType: file.type });
    if (error) { setSaveErr("Erro ao enviar foto: " + error.message); return null; }
    return path;
  }

  async function handleAddPagamentoOuro() {
    if (!venda) return;
    const peso = parseFloat(ouroPeso.replace(",", "."));
    const valorGrama = parseFloat(ouroValorGrama.replace(",", "."));
    if (!peso || peso <= 0) { setSaveErr("Informe o peso do ouro."); return; }
    if (!valorGrama || valorGrama <= 0) { setSaveErr("Informe o valor da grama."); return; }
    if (!ouroFotoFile) { setSaveErr("Foto da balança obrigatória."); return; }
    if (!ouroValidacaoIA?.match) { setSaveErr("O peso precisa ser confirmado pela IA antes de salvar."); return; }
    setUpdating(true);
    try {
      const path = await uploadOuroFoto(ouroFotoFile, venda.id);
      if (!path) { setUpdating(false); return; }
      const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forma: "Ouro", valor: peso * valorGrama, ouro_peso: peso, ouro_valor_grama: valorGrama, ouro_foto_path: path }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
      setOuroPeso(""); setOuroValorGrama(""); setOuroFotoFile(null); setOuroFotoPreview(null); setOuroValidacaoIA(null); setOuroFotoPath(null); setAddingPag(false);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao adicionar pagamento"); }
    finally { setUpdating(false); }
  }

  async function solicitarAutorizacaoItem(itemId: number) {
    const pending = pendingAuths[itemId];
    const item = venda?.itens.find(i => i.id === itemId);
    if (!pending || !item || pending.status !== "local") return;
    try {
      const res = await fetch("/api/vendas/solicitar-desconto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: vendaId,
          item_id: itemId,
          produto_nome: item.nome_produto,
          preco_lista: item.preco_lista,
          pct_desconto: pending.pct,
          preco_solicitado: item.preco_lista * (1 - pending.pct / 100),
        }),
      });
      if (res.ok) {
        const data = await res.json() as { id: number };
        setPendingAuths(prev => ({ ...prev, [itemId]: { ...prev[itemId], solicitacaoId: data.id, status: "pendente" } }));
      }
    } catch { /* ignora */ }
  }

  // Polling para autorizações pendentes no detalhe da venda (checa a cada 5s)
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
            await load();
            setPendingAuths(prev => {
              const next = { ...prev };
              delete next[Number(key)];
              return next;
            });
          } else if (data.status === "rejeitado") {
            setPendingAuths(prev => ({ ...prev, [Number(key)]: { ...prev[Number(key)], status: "rejeitado" } }));
          }
        } catch { /* ignora */ }
      }
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuths]);


  // ── Payment actions (immediate save) ────────────────────────────────────────
  async function handleAddPagamento(valorOverride?: number) {
    if (!venda) return;
    const v = valorOverride ?? parseFloat(newPagValor.replace(",", "."));
    if (!v || v <= 0) return;
    setUpdating(true);
    try {
      const parcelas = newPagCondicao === "À vista" ? 1 : parseInt(newPagCondicao) || newPagParcelas;
      const body: Record<string, unknown> = { forma: newPagForma, valor: v, parcelas };
      if (newPagForma === "Cartão de Crédito") {
        body.gateway = newPagGateway;
      }
      if (newPagForma === "Vale-Troca") {
        body.vale_numero = newPagValeNumero.trim();
      }
      if (newPagForma === "Ouro") {
        const peso = parseFloat(ouroPeso.replace(",", "."));
        const valorGrama = parseFloat(ouroValorGrama.replace(",", "."));
        if (!peso || peso <= 0) { setSaveErr("Informe o peso do ouro."); return; }
        if (!valorGrama || valorGrama <= 0) { setSaveErr("Informe o valor da grama."); return; }
        if (!ouroFotoFile) { setSaveErr("Foto da balança obrigatória."); return; }
        if (!ouroValidacaoIA?.match) { setSaveErr("O peso precisa ser confirmado pela IA antes de salvar."); return; }
        const path = await uploadOuroFoto(ouroFotoFile, venda.id);
        if (!path) return;
        body.ouro_peso = peso;
        body.ouro_valor_grama = valorGrama;
        body.ouro_foto_path = path;
        body.valor = +(peso * valorGrama).toFixed(2);
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

  async function handleMpManual() {
    if (!venda || !mpManualId.trim()) return;
    setMpManualLoading(true);
    setMpManualMsg(null);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/mercado-pago/verificar-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: mpManualId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMpManualMsg({ text: `Pagamento verificado e registrado! Valor: R$ ${Number(data.valor_registrado).toFixed(2).replace(".", ",")}${data.venda_concluida ? " — venda concluída." : ""}`, ok: true });
      setMpManualId("");
      await load();
    } catch (e) {
      setMpManualMsg({ text: e instanceof Error ? e.message : "Erro ao verificar pagamento", ok: false });
    } finally {
      setMpManualLoading(false);
    }
  }

  async function handleMpManualPag() {
    if (!venda || !mpManualPagId || !mpManualPagIdValue.trim()) return;
    setMpManualPagLoading(true);
    setMpManualPagMsg(null);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/mercado-pago/verificar-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: mpManualPagIdValue.trim(), pagamento_id: mpManualPagId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setMpManualPagMsg({ text: `Confirmado! R$ ${Number(d.valor_registrado).toFixed(2).replace(".", ",")}`, ok: true });
      setMpManualPagId(null);
      setMpManualPagIdValue("");
      await load();
    } catch (e) {
      setMpManualPagMsg({ text: e instanceof Error ? e.message : "Erro ao verificar", ok: false });
    } finally {
      setMpManualPagLoading(false);
    }
  }

  async function handleRegistrarRecebimento() {
    if (!venda || !recebimentoPagId) return;
    setRecebimentoLoading(true);
    setRecebimentoMsg(null);
    try {
      if (recebimentoTipo === "dinheiro") {
        const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${recebimentoPagId}/confirmar`, { method: "POST" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        setRecebimentoPagId(null);
        setRecebimentoTipo(null);
        await load();
      } else if (recebimentoTipo === "mp") {
        if (!recebimentoMpId.trim()) { setRecebimentoMsg({ text: "Informe o ID do pagamento", ok: false }); return; }
        const res = await fetch(`/api/vendas/${venda.id}/mercado-pago/verificar-manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: recebimentoMpId.trim(), pagamento_id: recebimentoPagId }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        setRecebimentoMsg({ text: `Confirmado! R$ ${Number(d.valor_registrado).toFixed(2).replace(".", ",")}${d.venda_concluida ? " — venda concluída." : ""}`, ok: true });
        setRecebimentoPagId(null);
        setRecebimentoTipo(null);
        setRecebimentoMpId("");
        await load();
      }
    } catch (e) {
      setRecebimentoMsg({ text: e instanceof Error ? e.message : "Erro ao confirmar recebimento", ok: false });
    } finally {
      setRecebimentoLoading(false);
    }
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

  async function confirmarPagamento(pagId: number, forma?: string) {
    if (!venda) return;
    setUpdating(true);
    try {
      // Para pagamentos "A Receber", usar endpoint dedicado que devolve saldo
      if (forma === "A Receber") {
        const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${pagId}/confirmar`, { method: "POST" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        if (d.venda_concluida) alert("Todos os pagamentos confirmados — venda concluída!");
      } else {
        const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${pagId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "confirmado" }),
        });
        if (!res.ok) {
          const d = await res.json();
          if (res.status === 403 && d.solicitar === true) {
            setSolicitarPayload({
              tipo: "pagamento_status",
              pagamento_id: pagId,
              valor_solicitado: "confirmado",
              mensagemBloqueio: d.error ?? "Confirmação precisa de aprovação.",
            });
            setSolicitarMotivo("");
            setSolicitarErro("");
            setSolicitarSucesso(false);
            return;
          }
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
      }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao confirmar pagamento"); }
    finally { setUpdating(false); }
  }

  // ── Enviar solicitação de alteração (modal aberto via 403 + solicitar:true) ──
  async function enviarSolicitacaoAlteracao() {
    if (!venda || !solicitarPayload) return;
    if (!solicitarMotivo.trim()) {
      setSolicitarErro("Informe o motivo da solicitação.");
      return;
    }
    setSolicitarEnviando(true);
    setSolicitarErro("");
    try {
      const body: Record<string, unknown> = {
        tipo: solicitarPayload.tipo,
        valor_solicitado: solicitarPayload.valor_solicitado,
        motivo: solicitarMotivo.trim(),
      };
      if (solicitarPayload.campo) body.campo = solicitarPayload.campo;
      if (solicitarPayload.pagamento_id) body.pagamento_id = solicitarPayload.pagamento_id;

      const res = await fetch(`/api/vendas/${venda.id}/solicitar-alteracao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setSolicitarSucesso(true);
    } catch (e) {
      setSolicitarErro(e instanceof Error ? e.message : "Erro ao enviar solicitação");
    } finally {
      setSolicitarEnviando(false);
    }
  }

  function fecharSolicitarModal() {
    setSolicitarPayload(null);
    setSolicitarMotivo("");
    setSolicitarErro("");
    setSolicitarSucesso(false);
  }

  // ── Solicitar aprovação para cartão de crédito (desconto >20%) ──────────
  async function solicitarAprovacaoCartao() {
    if (!venda) return;
    setUpdating(true); setSaveErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}/solicitar-aprovacao`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "cartao_desconto" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.aguardando_aprovacao_cartao) {
        alert("Solicitação de aprovação para cartão de crédito enviada.");
      }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao solicitar aprovação"); }
    finally { setUpdating(false); }
  }

  // ── Solicitar aprovação (com suporte a crédito gerente) ────────────────────
  async function solicitarAprovacao() {
    if (!venda) return;
    setUpdating(true); setSaveErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}/solicitar-aprovacao`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.aguardando_aprovacao_credito) {
        alert(d.message ?? "Venda enviada para aprovação");
      } else if (d.ordem_criada) {
        alert(`Venda aprovada! Ordem ${d.ordem_criada} criada.`);
      }
      await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao solicitar aprovação"); }
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
          body: JSON.stringify({ ...patch, client_updated_at: venda.updated_at }),
        });
        if (!res.ok) {
          const d = await res.json();
          if (res.status === 409 && d.error?.includes("Conflito")) {
            throw new Error("Esta venda foi modificada por outro usuário. Recarregue a página.");
          }
          // Backend bloqueou por ser campo restrito a admin — abre modal de solicitação.
          if (res.status === 403 && d.solicitar === true) {
            const campoBloqueado = detectarCampoBloqueado(patch, d.error);
            if (campoBloqueado) {
              setSolicitarPayload({
                tipo: "venda_campo",
                campo: campoBloqueado,
                valor_solicitado: patch[campoBloqueado],
                mensagemBloqueio: d.error ?? "Esta alteração precisa de aprovação.",
              });
              setSolicitarMotivo("");
              setSolicitarErro("");
              setSolicitarSucesso(false);
              return;
            }
          }
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
        // Atualiza referência local sem recarregar a página inteira
        setVenda(prev => prev ? { ...prev, ...patch } : prev);
      }
      setIsDirty(false);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  // Extrai o nome do campo que o backend bloqueou a partir da mensagem de erro.
  // Backend retorna algo como: `O campo "situacao" só pode ser alterado...`
  function detectarCampoBloqueado(patch: Record<string, unknown>, errorMsg: string | undefined): string | null {
    const ADMIN_ONLY = ["situacao", "total_frete", "cliente_id", "vendedor_id", "data_venda"];
    if (errorMsg) {
      const match = /"([a-z_]+)"/.exec(errorMsg);
      if (match && ADMIN_ONLY.includes(match[1])) return match[1];
    }
    // Fallback: primeiro campo admin-only do patch.
    for (const k of ADMIN_ONLY) {
      if (k in patch) return k;
    }
    return null;
  }

  // ── Status change ───────────────────────────────────────────────────────────
  async function changeSituacao(s: string) {
    if (!venda) return;
    setUpdating(true); setSaveErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: s, client_updated_at: venda.updated_at }),
      });
      const d = await res.json();
      if (res.status === 409 && d.error?.includes("Conflito")) {
        setSaveErr("Esta venda foi modificada por outro usuário. Recarregue a página.");
        return;
      }
      // Backend bloqueou troca de situacao por exigir admin — abre modal
      if (res.status === 403 && d.solicitar === true) {
        setSolicitarPayload({
          tipo: "venda_campo",
          campo: "situacao",
          valor_solicitado: s,
          mensagemBloqueio: d.error ?? "Esta alteração precisa de aprovação.",
        });
        setSolicitarMotivo("");
        setSolicitarErro("");
        setSolicitarSucesso(false);
        return;
      }
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.ordem_criada && d.tiny_warning) {
        alert(`Ordem ${d.ordem_criada} criada!\n\nAtenção: falha ao sincronizar com Tiny — ${d.tiny_warning}\nA venda ficará pendente de sync no Tiny.`);
      } else if (d.ordem_criada) {
        alert(`Ordem ${d.ordem_criada} aberta automaticamente!`);
      } else if (d.tiny_warning) {
        setSaveErr(`Aviso Tiny: ${d.tiny_warning}`);
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

  // ── Sync cliente para Tiny ───────────────────────────────────────────────────
  async function syncClienteTiny() {
    if (!venda?.cliente_id) return;
    setSyncingCliente(true);
    setClienteSyncMsg(null);
    try {
      const res = await fetch(`/api/contatos/${venda.cliente_id}/tiny-sync`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; tiny_id?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao sincronizar cliente");
      setClienteSyncMsg("Cliente enviado ao Tiny com sucesso!");
      setVenda(prev => prev ? { ...prev, cliente_id_tiny: data.tiny_id ?? prev.cliente_id_tiny } : prev);
    } catch (e) {
      setClienteSyncMsg(e instanceof Error ? e.message : "Erro ao sincronizar cliente");
    } finally {
      setSyncingCliente(false);
    }
  }

  // ── Share ───────────────────────────────────────────────────────────────────
  async function retryTiny() {
    if (!venda) return;
    setRetryingTiny(true);
    setTinyRetryMsg(null);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/tiny-resync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao reenviar");
      setTinyRetryMsg("Enviado para o Tiny com sucesso!");
      load();
    } catch (e) {
      setTinyRetryMsg(e instanceof Error ? e.message : "Erro ao reenviar para o Tiny");
    } finally {
      setRetryingTiny(false);
    }
  }

  function copiarFallback(texto: string) {
    const el = document.createElement("textarea");
    el.value = texto;
    el.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  async function compartilhar() {
    if (!venda) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/compartilhar`, { method: "POST" });
      const data = await res.json() as { token?: string };
      if (!res.ok) throw new Error("Erro");
      const url = `${window.location.origin}/orcamento/${data.token}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url).catch(() => copiarFallback(url));
      } else {
        copiarFallback(url);
      }
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
      markDirty();
    } catch (err) { setVideoUploadErr(err instanceof Error ? err.message : "Erro ao enviar vídeo"); }
    finally { setUploadingVideo(false); }
  }

  function handleRemoveVideo() {
    if (videoPreviewUrl && videoPreviewUrl !== venda?.video_obs_interna) URL.revokeObjectURL(videoPreviewUrl);
    setVideoPreviewUrl(null); setVideoObsInterna(null); setVideoUploadErr("");
    if (videoInputRef.current) videoInputRef.current.value = "";
    markDirty();
  }

  // ── Auto-save: latest-ref pattern garante closure sempre atualizada ────────
  handleSaveRef.current = handleSave;

  function markDirty() {
    setIsDirty(true);
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { handleSaveRef.current(); }, 1500);
  }

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
  const podeCancelar =
    (isFullAccess && !["cancelado", "concluido", "entregue"].includes(venda.situacao)) ||
    (role === "consultora" && venda.situacao === "rascunho");

  // Validação para aprovar: cliente + vendedor + forma_envio + itens + pagamento obrigatórios
  const podeAprovar = !!(
    venda.cliente_id &&
    vendedorSel !== "" &&
    formaEnvioId !== "" &&
    itens.length > 0 &&
    venda.pagamentos.length > 0
  );

  // Crédito gerente
  const temAReceber = venda.pagamentos.some(p => p.forma === "A Receber" && p.status === "pendente");
  const creditoTarefaConcluida = venda.aprovacao_credito_status === "concluida";
  const aguardandoAprovacaoCredito = !!venda.aprovacao_credito_tarefa_id && venda.aprovacao_credito_status === "aguardando_aprovacao";
  const creditoFoiAprovado = !!venda.aprovacao_credito_tipo && creditoTarefaConcluida;
  const isDescontoApproval = aguardandoAprovacaoCredito && (() => {
    const t = venda.aprovacao_tarefa_tags;
    const tags = Array.isArray(t) ? t : (typeof t === "string" ? t.replace(/[{}]/g, "").split(",") : []);
    return tags.includes("aprovacao_desconto");
  })();
  const temPagamentoPendente = venda.pagamentos.some(p => p.status === "pendente");
  const temManualMpPendente = venda.pagamentos.some(p => p.forma === "Manual (MP)" && p.status === "pendente");
  const podeAprovarConcluir = venda.situacao === "aprovado" && temPagamentoPendente;
  const temDescontoAlto = venda.itens.some(i => Number(i.pct_desconto) > 30);
  const precisaSolicitarDesconto = temDescontoAlto && !venda.desconto_aprovado_por_nome && !venda.aprovacao_credito_tarefa_id && venda.situacao === "rascunho";
  const LIMITE_DESCONTO_CARTAO = 20;
  const temDescontoCartao = venda.itens.some(i => Number(i.pct_desconto) > LIMITE_DESCONTO_CARTAO);
  const descontoCartaoAprovado = !!venda.desconto_cartao_aprovado_por_nome;
  const cartaoBloqueado = temDescontoCartao && !descontoCartaoAprovado;
  const isCartaoApproval = aguardandoAprovacaoCredito && (() => {
    const t = venda.aprovacao_tarefa_tags;
    const tags = Array.isArray(t) ? t : (typeof t === "string" ? t.replace(/[{}]/g, "").split(",") : []);
    return tags.includes("aprov_cartao_desconto");
  })();
  const precisaSolicitarDescontoCartao = cartaoBloqueado && !venda.aprovacao_credito_tarefa_id && venda.situacao === "rascunho";

  return (
    <>
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
            {venda.tiny_sync_status === "erro" && !venda.tiny_pedido_id && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={retryTiny}
                  disabled={retryingTiny}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-80 self-start"
                  style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                  title="Reenviar sincronização com o Tiny"
                >
                  {retryingTiny ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {retryingTiny ? "Reenviando..." : "Erro Tiny — Retentar"}
                </button>
                {venda.tiny_sync_erro && (
                  <span className="text-xs px-2 py-0.5 rounded-lg" style={{ backgroundColor: "#FFF5F5", color: "#991B1B", maxWidth: "320px", lineHeight: "1.3" }}>
                    {venda.tiny_sync_erro}
                  </span>
                )}
              </div>
            )}
            {tinyRetryMsg && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tinyRetryMsg.includes("sucesso") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                {tinyRetryMsg}
              </span>
            )}
            {venda.cliente_id && !venda.cliente_id_tiny && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={syncClienteTiny}
                  disabled={syncingCliente}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-80 self-start"
                  style={{ backgroundColor: "#FEF9C3", color: "#854D0E" }}
                  title="Enviar cliente ao Tiny para poder aprovar a venda"
                >
                  {syncingCliente ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {syncingCliente ? "Enviando..." : "Cliente sem Tiny — Sincronizar"}
                </button>
                {clienteSyncMsg && (
                  <span className={`text-xs px-2 py-0.5 rounded-lg ${clienteSyncMsg.includes("sucesso") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                    {clienteSyncMsg}
                  </span>
                )}
              </div>
            )}
            {venda.bloqueado && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Bloqueada</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {venda && venda.nota_fiscal_id ? (
            <button onClick={() => setVerNotaId(venda.nota_fiscal_id!)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
              style={{ borderColor: "#6EE7B7", color: "#065F46" }}
              title="Ver NFC-e emitida">
              <FileText size={13} /> NFC-e
            </button>
          ) : venda ? (
            <button onClick={() => setAbrirNfce(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              title="Emitir NFC-e">
              <FileText size={13} /> NFC-e
            </button>
          ) : null}
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

      {/* ── Banner aprovação de crédito pendente ── */}
      {aguardandoAprovacaoCredito && !isDescontoApproval && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-2"
          style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <p className="text-sm font-medium">
              Aguardando aprovação de crédito
              {venda.aprovacao_credito_tipo === "diretor" ? " (diretor — comissão será zerada)" : " (gerente de loja)"}
              {venda.aprovacao_credito_responsavel_nome ? ` — ${venda.aprovacao_credito_responsavel_nome}` : ""}
            </p>
          </div>
          {venda.aprovacao_credito_tarefa_id && (
            <a href={`/tarefas/${venda.aprovacao_credito_tarefa_id}`}
              className="text-xs font-semibold px-3 py-1 rounded-lg shrink-0"
              style={{ backgroundColor: "#FDE68A", color: "#713F12" }}>
              Ver Tarefa →
            </a>
          )}
        </div>
      )}

      {/* ── Banner: aprovação de desconto pendente ── */}
      {isDescontoApproval && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-2"
          style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <p className="text-sm font-medium">
              Aguardando aprovação de desconto
            </p>
          </div>
          {venda.aprovacao_desconto_aprov_id && (
            <a href={`/tarefas/${venda.aprovacao_desconto_aprov_id}`}
              className="text-xs font-semibold px-3 py-1 rounded-lg shrink-0"
              style={{ backgroundColor: "#FDE68A", color: "#713F12" }}>
              Ver Tarefa →
            </a>
          )}
        </div>
      )}

      {/* ── Banner: Manual (MP) pendente — bloqueia aprovação ── */}
      {temManualMpPendente && venda.situacao === "rascunho" && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", color: "#1E40AF" }}>
          <Loader2 size={16} className="animate-spin shrink-0" />
          <p className="text-sm font-medium">Confirme o pagamento Manual (MP) antes de aprovar a venda.</p>
        </div>
      )}

      {/* ── Banner: desconto >30% sem aprovação solicitada ── */}
      {precisaSolicitarDesconto && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-3"
          style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#9A3412" }}>
          <p className="text-sm font-medium">
            Esta venda tem desconto acima de 30%. É necessário solicitar aprovação do administrador antes de prosseguir.
          </p>
          <button onClick={async () => {
              setUpdating(true); setSaveErr("");
              try {
                const res = await fetch(`/api/vendas/${venda.id}/solicitar-aprovacao`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tipo: "desconto" }),
                });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
                await load();
              } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao solicitar aprovação"); }
              finally { setUpdating(false); }
            }} disabled={updating}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: "#C2410C", color: "#fff" }}>
            {updating ? <Loader2 size={12} className="animate-spin" /> : null}
            Solicitar Aprovação de Desconto
          </button>
        </div>
      )}

      {/* ── Banner aprovação de desconto pendente ── */}
      {isDescontoApproval && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#9A3412" }}>
          <Loader2 size={16} className="animate-spin shrink-0" />
          <p className="text-sm font-medium">
            Aguardando aprovação de desconto pelo administrador. Pagamento e conclusão bloqueados até a aprovação.
          </p>
        </div>
      )}

      {/* ── Banner: desconto >20% para cartão sem aprovação ── */}
      {precisaSolicitarDescontoCartao && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-3"
          style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#9A3412" }}>
          <p className="text-sm font-medium">
            Esta venda tem itens com desconto acima de 20%. Para pagar no cartão de crédito, solicite aprovação.
          </p>
          <button onClick={solicitarAprovacaoCartao} disabled={updating}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: "#C2410C", color: "#fff" }}>
            {updating ? <Loader2 size={12} className="animate-spin" /> : null}
            Solicitar Aprovação para Cartão
          </button>
        </div>
      )}

      {/* ── Banner aprovação de cartão pendente ── */}
      {isCartaoApproval && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
          <Loader2 size={16} className="animate-spin shrink-0" />
          <p className="text-sm font-medium">
            Aguardando aprovação para cartão de crédito. Pagamento no cartão bloqueado até a aprovação.
          </p>
        </div>
      )}

      {/* ── Badge cartão aprovado ── */}
      {venda.desconto_cartao_aprovado_por_nome && venda.desconto_cartao_aprovado_em && (
        <div className="mb-3 px-4 py-2 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" }}>
          <CheckCircle size={14} className="shrink-0" />
          <p className="text-xs font-medium">
            Cartão de crédito liberado por <strong>{venda.desconto_cartao_aprovado_por_nome}</strong>{" "}
            em {new Date(venda.desconto_cartao_aprovado_em).toLocaleDateString("pt-BR")}{" "}
            às {new Date(venda.desconto_cartao_aprovado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}

      {/* ── Badge desconto aprovado ── */}
      {venda.desconto_aprovado_por_nome && venda.desconto_aprovado_em && (
        <div className="mb-3 px-4 py-2 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#F0FDF4", borderColor: "#86EFAC", color: "#166534" }}>
          <CheckCircle size={14} className="shrink-0" />
          <p className="text-xs font-medium">
            Desconto liberado por <strong>{venda.desconto_aprovado_por_nome}</strong>{" "}
            em {new Date(venda.desconto_aprovado_em).toLocaleDateString("pt-BR")}{" "}
            às {new Date(venda.desconto_aprovado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      )}

      {/* ── Badge crédito gerente utilizado ── */}
      {venda.credito_gerente_usado != null && venda.credito_gerente_usado > 0 && (
        <div className="mb-3 px-4 py-2 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#DBEAFE", borderColor: "#93C5FD", color: "#1E40AF" }}>
          <CheckCircle size={14} className="shrink-0" />
          <p className="text-xs font-medium">
            Crédito gerente: {fmt(venda.credito_gerente_usado)}
            {venda.aprovacao_credito_tipo === "diretor" && " — Aprovado pelo diretor (comissão zerada)"}
          </p>
        </div>
      )}


      {/* ── Alerta: concluir bloqueado por pagamentos pendentes ── */}
      {podeAprovarConcluir && (
        <div className="mb-3 px-4 py-2 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#9A3412" }}>
          <XCircle size={14} className="shrink-0" />
          <p className="text-xs font-medium">
            Venda aprovada mas com pagamentos pendentes. Confirme os recebimentos para concluir.
          </p>
        </div>
      )}

      {/* ── Banner Devolucoes vinculadas a essa venda ── */}
      {venda.devolucoes && venda.devolucoes.length > 0 && (
        <div
          className="mb-3 px-4 py-3 rounded-lg border"
          style={{ backgroundColor: "#FEF3C7", borderColor: "#FDE68A" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <RotateCcw size={14} style={{ color: "#92400E" }} />
            <p className="text-sm font-medium" style={{ color: "#92400E" }}>
              {venda.devolucoes.length === 1
                ? "Esta venda possui 1 devolucao"
                : `Esta venda possui ${venda.devolucoes.length} devolucoes`}
            </p>
          </div>
          <div className="space-y-1.5">
            {venda.devolucoes.map((d) => (
              <Link
                key={d.id}
                href={`/devolucoes/${d.id}`}
                className="flex items-center justify-between gap-3 py-1.5 px-2 rounded bg-white/60 hover:bg-white transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs font-semibold" style={{ color: C.esmeralda }}>
                    {d.numero}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
                    {d.tipo === "total" ? "Total" : "Parcial"}
                  </span>
                  <span className="text-xs" style={{ color: "#6B7280" }}>
                    {d.status}
                  </span>
                </div>
                <span className="text-xs tabular-nums" style={{ color: "#374151" }}>
                  {fmt(d.valor_total_devolvido)}
                </span>
                <ArrowRight size={13} style={{ color: "#6B7280" }} />
              </Link>
            ))}
          </div>
        </div>
      )}

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
                onSelect={c => { setCliente(c); markDirty(); }}
                selectedLabel={cliente ? `${cliente.nome}${cliente.cpf_cnpj ? ` · ${maskCpfCnpj(cliente.cpf_cnpj)}` : ""}` : null}
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
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>CPF/CNPJ</span><p className="font-mono" style={{ color: "#1A1A1A" }}>{cliente.cpf_cnpj ? maskCpfCnpj(cliente.cpf_cnpj) : "—"}</p></div>
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
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Nº", "Descrição", "Código (SKU)", "Qtde", "UN", "Preço lista", "% Desc", ...(edit.limited ? ["R$ Desc"] : []), "Preço un", "Comissão", "Preço total", ...(edit.limited ? [""] : [])].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.length === 0 && !addingItem && (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-sm" style={{ color: "#9CA3AF" }}>Nenhum produto adicionado</td></tr>
                    )}
                    {itens.map((item, idx) => (<Fragment key={item._key}>
                      <tr className="border-t hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-2 py-2 tabular-nums" style={{ color: "#9CA3AF" }}>{idx + 1}</td>
                        <td className="px-2 py-2 max-w-[140px] truncate font-medium" style={{ color: "#1A1A1A" }}>{item.nome_produto}</td>
                        <td className="px-2 py-2 font-mono" style={{ color: "#6B7280" }}>{item.sku}</td>
                        <td className="px-2 py-2 text-center tabular-nums" style={{ color: "#374151" }}>
                          {edit.limited && item.id ? (
                            <input type="number" min={1} defaultValue={item.quantidade}
                              onBlur={e => handleUpdateItem(item.id!, "quantidade", e.target.value)}
                              className="w-12 border rounded px-1 py-0.5 text-xs text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                          ) : item.quantidade}
                        </td>
                        <td className="px-2 py-2" style={{ color: "#9CA3AF" }}>{item.unidade ?? "un"}</td>
                        <td className="px-2 py-2 tabular-nums" style={{ color: "#374151" }}>{fmt(item.preco_lista)}</td>
                        {(() => {
                          const editandoPreco = localPrecoUn[item.id!] !== undefined;
                          const effPct = editandoPreco
                            ? (() => {
                                const p = parseFloat((localPrecoUn[item.id!] || "0").replace(",", ".")) || 0;
                                return p > 0 && item.preco_lista > 0
                                  ? Math.round(((item.preco_lista - p) / item.preco_lista) * 10000) / 100
                                  : item.pct_desconto;
                              })()
                            : (localPct[item.id!] !== undefined ? localPct[item.id!] : item.pct_desconto);
                          const effPrecoUn = editandoPreco
                            ? (parseFloat((localPrecoUn[item.id!] || "0").replace(",", ".")) || item.preco_unitario)
                            : localPct[item.id!] !== undefined
                              ? item.preco_lista * (1 - localPct[item.id!] / 100)
                              : item.preco_unitario;
                          const effTotal    = effPrecoUn * item.quantidade;
                          const effDescVal  = item.preco_lista * effPct / 100;
                          const editandoDesc  = editandoPreco || localPct[item.id!] !== undefined;
                          const effPctComissao = editandoDesc ? getComissao(effPct) : item.pct_comissao;
                          const effValComissao = editandoDesc ? effTotal * effPctComissao / 100 : item.valor_comissao;
                          return (<>
                        <td className="px-2 py-2 tabular-nums text-center" style={{ color: effPct > 0 ? "#D97706" : "#9CA3AF" }}>
                          {edit.limited && item.id ? (
                            <div className="flex items-center gap-1">
                              <input type="number" min={0} max={maxDesconto} step={1}
                                value={effPct}
                                onChange={e => {
                                  const v = Math.min(maxDesconto, Math.max(0, Number(e.target.value) || 0));
                                  setLocalPct(prev => ({ ...prev, [item.id!]: v }));
                                }}
                                onBlur={() => {
                                  const v = localPct[item.id!] ?? item.pct_desconto;
                                  setLocalPct(prev => { const n = { ...prev }; delete n[item.id!]; return n; });
                                  void handleUpdateItem(item.id!, "pct_desconto", String(v));
                                }}
                                className="w-12 border rounded px-1 py-0.5 text-xs text-center outline-none"
                                style={{ borderColor: C.cremeBorder }} />
                              {pendingAuths[item.id!]?.status === "local" && (
                                <button onClick={() => void solicitarAutorizacaoItem(item.id!)}
                                  className="text-[10px] px-1 py-0.5 rounded font-semibold whitespace-nowrap"
                                  style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #D97706" }}>
                                  Pedir
                                </button>
                              )}
                              {pendingAuths[item.id!]?.status === "pendente" && (
                                <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: "#D97706" }}>⏳</span>
                              )}
                              {pendingAuths[item.id!]?.status === "rejeitado" && (
                                <span className="text-[10px] font-medium" style={{ color: "#EF4444" }}>✗</span>
                              )}
                            </div>
                          ) : (effPct > 0 ? `${effPct}%` : "—")}
                        </td>
                        {edit.limited && (
                          <td className="px-2 py-2 tabular-nums text-right" style={{ color: "#374151" }}>
                            {effDescVal > 0 ? effDescVal.toFixed(2).replace(".", ",") : "—"}
                          </td>
                        )}
                        <td className="px-2 py-2">
                          {edit.limited && item.id ? (
                            <input type="text"
                              value={localPrecoUn[item.id!] !== undefined ? localPrecoUn[item.id!] : effPrecoUn.toFixed(2).replace(".", ",")}
                              onChange={e => {
                                const raw = e.target.value;
                                setLocalPrecoUn(prev => ({ ...prev, [item.id!]: raw }));
                                const novoPreco = parseFloat(raw.replace(",", ".")) || 0;
                                if (novoPreco > 0 && novoPreco <= item.preco_lista) {
                                  const pct = Math.round(((item.preco_lista - novoPreco) / item.preco_lista) * 10000) / 100;
                                  setLocalPct(prev => ({ ...prev, [item.id!]: Math.min(maxDesconto, pct) }));
                                }
                              }}
                              onBlur={() => {
                                const raw = localPrecoUn[item.id!];
                                setLocalPct(prev => { const n = { ...prev }; delete n[item.id!]; return n; });
                                setLocalPrecoUn(prev => { const n = { ...prev }; delete n[item.id!]; return n; });
                                if (raw !== undefined) {
                                  void handleUpdateItem(item.id!, "preco_unitario", raw);
                                }
                              }}
                              placeholder="0,00"
                              className="w-20 border rounded px-1 py-0.5 text-xs text-right outline-none tabular-nums"
                              style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                          ) : (
                            <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(effPrecoUn)}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums whitespace-nowrap"
                          style={{ color: effPctComissao > 0 ? "#184036" : "#9CA3AF" }}>
                          {effPctComissao > 0 ? (
                            <span>
                              <strong>{effPctComissao.toFixed(2)}%</strong>
                              <span className="text-[10px] ml-1" style={{ color: "#6B7280" }}>
                                ({fmt(effValComissao)})
                              </span>
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(effTotal)}</td>
                          </>);
                        })()}
                        {edit.limited && (
                          <td className="px-2 py-2">
                            <button onClick={() => item.id && handleRemoveItem(item.id)} disabled={updating}
                              className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40">
                              <X size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                      {item.personalizacao?.valor && (
                        <tr key={`${item._key}-pers`} style={{ backgroundColor: "#FFFCF5" }}>
                          <td colSpan={20} className="px-4 py-2 border-t" style={{ borderColor: C.cremeBorder }}>
                            <div className="flex items-center gap-2 flex-wrap pl-3 border-l-2" style={{ borderColor: "#D4A843" }}>
                              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>🏷️ Nome a gravar</span>
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#FFF8E6", color: "#92400E", letterSpacing: "0.08em" }}>
                                {item.personalizacao.valor.toUpperCase()}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>))}
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
        <div style={isDescontoApproval ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
        <Secao>
          <STitle>Pagamento</STitle>

          {/* Pagamentos já registrados — cada um com ação inline */}
          {venda.pagamentos.length > 0 && (
            <div className="space-y-2 mb-4">
              {venda.pagamentos.map(pag => {
                const sc = PAG_STATUS_COLOR[pag.status] ?? PAG_STATUS_COLOR.pendente;
                const temLiquido = pag.valor_liquido != null && pag.valor_liquido > 0;
                const isAReceber = pag.forma === "A Receber";
                const isPix = pag.forma === "Pix";
                const isCartao = pag.forma === "Cartão de Crédito";
                const creditoAprovado = isAReceber && creditoFoiAprovado;
                return (
                  <div key={pag.id} className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    {/* Linha principal do pagamento */}
                    <div className="flex items-center justify-between p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>
                          {pag.forma}{pag.parcelas > 1 ? ` ${pag.parcelas}×` : ""}
                          {pag.gateway && <span className="text-xs ml-1" style={{ color: "#9CA3AF" }}>via {pag.gateway}</span>}
                        </p>
                        <p className="text-xs" style={{ color: "#9CA3AF" }}>
                          {pag.data_confirmacao ? `Confirmado em ${fmtDateTime(pag.data_confirmacao)}` : "Sem confirmação"}
                        </p>
                        {temLiquido && (
                          <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: "#059669" }}>
                            Líquido recebido: <b>{fmt(Number(pag.valor_liquido))}</b>
                            {pag.taxas_mp != null && pag.taxas_mp > 0 && (
                              <span style={{ color: "#D97706" }}> (taxa MP {fmt(Number(pag.taxas_mp))})</span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Badge de status */}
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: sc.bg, color: sc.text }}>{pag.status}</span>
                        {/* Badge crédito aprovado (A Receber) */}
                        {isAReceber && creditoAprovado && pag.status === "pendente" && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "#DBEAFE", color: "#1E40AF" }}>
                            crédito aprovado
                          </span>
                        )}
                        {/* Badge aguardando aprovação */}
                        {isAReceber && aguardandoAprovacaoCredito && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "#FEF9C3", color: "#713F12" }}>
                            aguardando aprovação
                          </span>
                        )}
                        <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(pag.valor)}</span>

                        {/* A Receber pendente + sem aprovação → botão solicitar aprovação */}
                        {isAReceber && pag.status === "pendente" && !aguardandoAprovacaoCredito && !creditoAprovado && (
                          <button onClick={solicitarAprovacao} disabled={updating}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-50"
                            style={{ backgroundColor: "#D97706", color: "#fff" }}>
                            Solicitar Aprovação
                          </button>
                        )}

                        {/* A Receber com crédito aprovado → gerenciar no Crediário */}
                        {isAReceber && pag.status === "pendente" && creditoAprovado && (
                          <a
                            href="/crediario"
                            className="text-xs px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1"
                            style={{ backgroundColor: C.esmeralda, color: C.creme, textDecoration: "none" }}>
                            Crediário →
                          </a>
                        )}

                        {/* Manual (MP) pendente → botão confirmar com ID (qualquer role) */}
                        {pag.forma === "Manual (MP)" && pag.status === "pendente" && (
                          mpManualPagId === pag.id ? null : (
                            <button
                              onClick={() => { setMpManualPagId(pag.id); setMpManualPagMsg(null); setMpManualPagIdValue(""); }}
                              className="text-xs px-2.5 py-1 rounded-lg font-medium"
                              style={{ backgroundColor: "#0070E0", color: "#fff" }}>
                              Informar ID do MP
                            </button>
                          )
                        )}

                        {/* Outros pagamentos pendentes → confirmar manual */}
                        {!isAReceber && pag.forma !== "Manual (MP)" && !isPix && !isCartao && pag.status === "pendente" &&
                          (isFullAccess || ["gerente_loja", "diretor"].includes(role)) && (
                          <button onClick={() => confirmarPagamento(pag.id, pag.forma)} disabled={updating}
                            className="text-xs px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                            Confirmar
                          </button>
                        )}

                        {edit.limited && pag.status === "pendente" && (
                          <button onClick={() => handleRemovePagamento(pag.id)} disabled={updating}
                            className="text-gray-300 hover:text-red-400 disabled:opacity-40"><X size={13} /></button>
                        )}
                      </div>
                    </div>

                    {/* A Receber — fluxo de recebimento inline */}
                    {isAReceber && pag.status === "pendente" && recebimentoPagId === pag.id && (
                      <div className="px-3 pb-3 pt-2 border-t space-y-2" style={{ borderColor: C.cremeBorder }}>
                        {recebimentoMsg && (
                          <p className="text-xs font-medium" style={{ color: recebimentoMsg.ok ? "#059669" : "#DC2626" }}>
                            {recebimentoMsg.text}
                          </p>
                        )}
                        {recebimentoTipo === null && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500 mr-1">Como foi pago?</p>
                            <button
                              onClick={() => setRecebimentoTipo("dinheiro")}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium border"
                              style={{ borderColor: C.esmeralda, color: C.esmeralda }}>
                              Dinheiro
                            </button>
                            <button
                              onClick={() => setRecebimentoTipo("mp")}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium border"
                              style={{ borderColor: "#0070E0", color: "#0070E0" }}>
                              Mercado Pago (ID)
                            </button>
                            <button onClick={() => setRecebimentoPagId(null)} className="text-gray-400 hover:text-gray-600 ml-auto"><X size={13} /></button>
                          </div>
                        )}
                        {recebimentoTipo === "dinheiro" && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">Confirmar recebimento em dinheiro de <strong>R$ {pag.valor.toFixed(2).replace(".", ",")}</strong>?</p>
                            <button
                              onClick={handleRegistrarRecebimento}
                              disabled={recebimentoLoading}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                              style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                              {recebimentoLoading ? <Loader2 size={12} className="animate-spin inline" /> : "Confirmar"}
                            </button>
                            <button onClick={() => setRecebimentoTipo(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                          </div>
                        )}
                        {recebimentoTipo === "mp" && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="ID do pagamento Mercado Pago"
                              value={recebimentoMpId}
                              onChange={e => { setRecebimentoMpId(e.target.value); setRecebimentoMsg(null); }}
                              className="flex-1 text-xs border rounded-lg px-2 py-1.5 outline-none"
                              style={{ borderColor: C.cremeBorder }}
                            />
                            <button
                              onClick={handleRegistrarRecebimento}
                              disabled={recebimentoLoading || !recebimentoMpId.trim()}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                              style={{ backgroundColor: "#0070E0", color: "#fff" }}>
                              {recebimentoLoading ? <Loader2 size={12} className="animate-spin inline" /> : "Verificar"}
                            </button>
                            <button onClick={() => setRecebimentoTipo(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual (MP) — campo ID inline */}
                    {pag.forma === "Manual (MP)" && pag.status === "pendente" && mpManualPagId === pag.id && (
                      <div className="px-3 pb-3 pt-2 border-t space-y-2" style={{ borderColor: C.cremeBorder }}>
                        {mpManualPagMsg && (
                          <p className="text-xs font-medium" style={{ color: mpManualPagMsg.ok ? "#059669" : "#DC2626" }}>
                            {mpManualPagMsg.text}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="ID do pagamento Mercado Pago"
                            value={mpManualPagIdValue}
                            onChange={e => { setMpManualPagIdValue(e.target.value); setMpManualPagMsg(null); }}
                            className="flex-1 text-xs border rounded-lg px-2 py-1.5 outline-none"
                            style={{ borderColor: C.cremeBorder }}
                          />
                          <button
                            onClick={handleMpManualPag}
                            disabled={mpManualPagLoading || !mpManualPagIdValue.trim()}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                            style={{ backgroundColor: "#0070E0", color: "#fff" }}>
                            {mpManualPagLoading ? <Loader2 size={12} className="animate-spin inline" /> : "Verificar e Confirmar"}
                          </button>
                          <button onClick={() => setMpManualPagId(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                        </div>
                      </div>
                    )}

                    {/* Pix inline — gerar QR direto nessa linha */}
                    {isPix && pag.status === "pendente" && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: C.cremeBorder }}>
                        <PixQrInline
                          vendaId={venda.id}
                          numeroVenda={venda.numero_venda}
                          valor={pag.valor}
                          endpoint="criar-pix-instore"
                          onPagamentoConfirmado={() => load()}
                        />
                      </div>
                    )}

                    {/* Cartão de Crédito inline */}
                    {isCartao && pag.status === "pendente" && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: C.cremeBorder }}>
                        {cartaoBloqueado ? (
                          <div className="flex items-start gap-2 p-3 rounded-lg"
                            style={{ backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}>
                            <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: "#9A3412" }} />
                            <div className="text-xs" style={{ color: "#9A3412" }}>
                              <p className="font-medium">Cartão de crédito bloqueado</p>
                              <p>Este pedido possui itens com desconto acima de 20%. Aguarde aprovação para pagar no cartão.</p>
                            </div>
                          </div>
                        ) : (
                          <CartaoInline
                            vendaId={venda.id}
                            numeroVenda={venda.numero_venda}
                            valor={pag.valor}
                            installments={pag.parcelas || 1}
                            onPagamentoConfirmado={() => load()}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="pt-2 space-y-1 border-t" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Pago (confirmado)</span>
                  <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(venda.total_pago)}</span>
                </div>
                {venda.total_venda - venda.total_pago > 0.01 && (
                  <>
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span style={{ color: "#D97706" }}>Saldo pendente</span>
                      <span className="tabular-nums" style={{ color: "#D97706" }}>{fmt(venda.total_venda - venda.total_pago)}</span>
                    </div>
                    {edit.limited && !addingPag && (
                      <button
                        onClick={() => {
                          const restante = (venda.total_venda - venda.total_pago).toFixed(2).replace(".", ",");
                          setNewPagValor(restante);
                          setNewPagForma("Dinheiro");
                          setAddingPag(true);
                        }}
                        className="w-full mt-1 py-1.5 rounded-lg text-xs font-semibold border"
                        style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB", color: "#92400E" }}>
                        + Completar pagamento — {fmt(venda.total_venda - venda.total_pago)}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Cobrança Mercado Pago (link online + maquininha Point) ── */}
          <MercadoPagoCobranca
            vendaId={venda.id}
            numeroVenda={venda.numero_venda}
            valorSugerido={Math.max(0, venda.total_venda - venda.total_pago)}
            situacao={venda.situacao}
            bloqueado={venda.bloqueado}
            onPagamentoConfirmado={load}
            vendaPolling={{
              pagamentoPendenteId: null,
              detectarConfirmacao: async () => {
                const r = await fetch(`/api/vendas/${venda.id}`);
                if (!r.ok) return false;
                const d = await r.json() as Venda;
                // Se a venda foi concluída ou se há novo pagamento MP confirmado
                if (d.situacao === "concluido") return true;
                const temMpConfirmado = (d.pagamentos ?? []).some(
                  p => (p.gateway === "Mercado Pago Online" || p.gateway === "Mercado Pago Point")
                    && p.status === "confirmado"
                );
                return temMpConfirmado;
              },
            }}
          />

          {/* ── Formulário de pagamento padronizado ── */}
          {edit.limited && (() => {
            const saldoPendente = Math.max(0, totalVenda - (venda?.total_pago ?? 0));

            // Função de add pagamento (modo edição: salva imediato)
            // Aceita valor opcional — útil quando chamado do Múltiplas (usa multValor)
            const handleEdicaoAdd = async (valorManual?: string) => {
              if (!venda) return;
              setUpdating(true);
              try {
                const v = valorManual ? parseFloat(valorManual.replace(",", ".")) : parseFloat(newPagValor.replace(",", ".")) || saldoPendente;
                if (!v || v <= 0) return;
                const parcelas = newPagCondicao === "À vista" ? 1 : parseInt(newPagCondicao) || 1;
                const body: Record<string, unknown> = { forma: newPagForma, valor: v, parcelas };
                if (newPagForma === "Cartão de Crédito") body.gateway = newPagGateway;
                if (newPagForma === "Vale-Troca") body.vale_numero = valeNumero.trim();
                if (newPagForma === "Ouro") {
                  const peso = parseFloat(ouroPeso.replace(",", "."));
                  const valorGrama = parseFloat(ouroValorGrama.replace(",", "."));
                  if (!peso || peso <= 0) { setSaveErr("Informe o peso do ouro."); return; }
                  if (!valorGrama || valorGrama <= 0) { setSaveErr("Informe o valor da grama."); return; }
                  if (!ouroFotoFile) { setSaveErr("Foto da balança obrigatória."); return; }
                  if (!ouroValidacaoIA?.match) { setSaveErr("O peso precisa ser confirmado pela IA antes de salvar."); return; }
                  const path = await uploadOuroFoto(ouroFotoFile, venda.id);
                  if (!path) return;
                  body.ouro_peso = peso;
                  body.ouro_valor_grama = valorGrama;
                  body.ouro_foto_path = path;
                  body.valor = +(peso * valorGrama).toFixed(2);
                }

                const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
                await load();
                setNewPagValor(""); setValeNumero(""); setValeValidacao(null);
                setOuroPeso(""); setOuroValorGrama(""); setOuroFotoFile(null); setOuroFotoPreview(null); setOuroValidacaoIA(null);
              } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro"); }
              finally { setUpdating(false); }
            };

            return venda.pagamentos.length === 0 ? (
              // Sem pagamentos: formulário completo padronizado
              <div className="mt-2">
                <PagamentoForm
                  totalVenda={totalVenda}
                  vendaId={venda.id}
                  numeroVenda={venda.numero_venda}
                  mode="edicao"
                  gateways={gateways.length > 0 ? gateways : [{ id: 1, nome: "Mercado Pago" }, { id: 2, nome: "PagSeguro" }, { id: 3, nome: "Cielo" }, { id: 4, nome: "Stone" }, { id: 5, nome: "Getnet" }, { id: 6, nome: "Rede" }, { id: 7, nome: "Outro" }]}
                  // Payment form
                  pagForma={newPagForma} setPagForma={setNewPagForma}
                  pagGateway={newPagGateway} setPagGateway={setNewPagGateway}
                  pagCondicao={newPagCondicao} setPagCondicao={setNewPagCondicao}
                  // Valor form simples
                  pagFormValor={newPagValor} setPagFormValor={setNewPagValor}
                  // Múltiplas
                  payments={edicaoPayments} setPayments={setEdicaoPayments}
                  multForma={multPagForma} setMultForma={setMultPagForma}
                  multParcelas={newPagParcelas} setMultParcelas={setNewPagParcelas}
                  multValor={multPagValor} setMultValor={setMultPagValor}
                  // Vale-Troca
                  valeNumero={valeNumero} setValeNumero={setValeNumero}
                  valeValidando={valeValidando} setValeValidando={setValeValidando}
                  valeValidacao={valeValidacao} setValeValidacao={setValeValidacao}
                  // Vale-Troca múltiplas
                  multValeNumero={multValeNumero} setMultValeNumero={setMultValeNumero}
                  multValeValidando={multValeValidando} setMultValeValidando={setMultValeValidando}
                  multValeValidacao={multValeValidacao} setMultValeValidacao={setMultValeValidacao}
                  // Ouro
                  ouroPeso={ouroPeso} setOuroPeso={setOuroPeso}
                  ouroValorGrama={ouroValorGrama} setOuroValorGrama={setOuroValorGrama}
                  ouroFotoFile={ouroFotoFile} setOuroFotoFile={setOuroFotoFile}
                  ouroFotoPreview={ouroFotoPreview} setOuroFotoPreview={setOuroFotoPreview}
                  ouroValidacaoIA={ouroValidacaoIA} setOuroValidacaoIA={setOuroValidacaoIA}
                  ouroValidando={ouroValidando} setOuroValidando={setOuroValidando}
                  // Ouro múltiplas
                  multOuroPeso={multOuroPeso} setMultOuroPeso={setMultOuroPeso}
                  multOuroValorGrama={multOuroValorGrama} setMultOuroValorGrama={setMultOuroValorGrama}
                  multOuroFotoFile={multOuroFotoFile} setMultOuroFotoFile={setMultOuroFotoFile}
                  multOuroFotoPreview={multOuroFotoPreview} setMultOuroFotoPreview={setMultOuroFotoPreview}
                  multOuroValidacaoIA={multOuroValidacaoIA} setMultOuroValidacaoIA={setMultOuroValidacaoIA}
                  multOuroValidando={multOuroValidando} setMultOuroValidando={setMultOuroValidando}
                  // Manual (MP)
                  mpManualId={mpManualId} setMpManualId={setMpManualId}
                  mpManualLoading={mpManualLoading} setMpManualLoading={setMpManualLoading}
                  mpManualMsg={mpManualMsg} setMpManualMsg={setMpManualMsg}
                  // Saving
                  saving={updating}
                  // Functions
                  validarOuroIA={validarOuroIA}
                  validarValeTroca={validarValeFn}
                  handleAddPagamento={handleEdicaoAdd}
                  handleRemovePagamento={(p) => setEdicaoPayments(prev => prev.filter(x => x._key !== p._key))}
                  handleMpManual={handleMpManual}
                  handleAddMultOuro={async () => {
                    if (!venda || !multOuroFotoFile) { setSaveErr("Foto da balança obrigatória."); return; }
                    setUpdating(true);
                    try {
                      const peso = parseFloat(multOuroPeso.replace(",", ".")); const vg = parseFloat(multOuroValorGrama.replace(",", "."));
                      if (!peso || peso <= 0) throw new Error("Informe o peso do ouro.");
                      if (!vg || vg <= 0) throw new Error("Informe o valor da grama.");
                      const totalMult = edicaoPayments.reduce((s, p) => s + p.valor, 0);
                      const restante = +(totalVenda - (venda?.total_pago ?? 0) - totalMult).toFixed(2);
                      const path = await uploadOuroFoto(multOuroFotoFile, venda.id);
                      if (!path) throw new Error("Erro ao enviar foto.");
                      const valorOuro = Math.min(+(peso * vg).toFixed(2), restante);
                      const body: Record<string, unknown> = { forma: "Ouro", valor: valorOuro, parcelas: 1, ouro_peso: peso, ouro_valor_grama: vg, ouro_foto_path: path };
                      const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
                      });
                      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
                      await load();
                      setMultOuroPeso(""); setMultOuroValorGrama(""); setMultOuroFotoFile(null); setMultOuroFotoPreview(null); setMultOuroValidacaoIA(null);
                    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao registrar pagamento em ouro"); }
                    finally { setUpdating(false); }
                  }}
                  onPaymentSaved={load}
                  cartaoBloqueado={cartaoBloqueado}
                  onSolicitarAprovacaoCartao={solicitarAprovacaoCartao}
                  solicitandoAprovacaoCartao={updating}
                />
              </div>
            ) : (
              // Já tem pagamentos: botão + formulário colapsável padronizado
              <>
                {!addingPag ? (
                  <button onClick={() => {
                      const pendente = Math.max(0, totalVenda - (venda?.total_pago ?? 0));
                      setNewPagValor(pendente > 0 ? pendente.toFixed(2).replace(".", ",") : "");
                      setAddingPag(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-opacity hover:opacity-80 mt-3"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                    <Plus size={14} /> adicionar pagamento
                  </button>
                ) : (
                  <div className="p-4 rounded-xl border mb-3 mt-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium" style={{ color: "#374151" }}>Adicionar pagamento</p>
                      <button onClick={() => setAddingPag(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                    <PagamentoForm
                      totalVenda={saldoPendente > 0 ? saldoPendente : totalVenda}
                      vendaId={venda.id}
                      numeroVenda={venda.numero_venda}
                      mode="edicao"
                      gateways={gateways.length > 0 ? gateways : [{ id: 1, nome: "Mercado Pago" }, { id: 2, nome: "PagSeguro" }, { id: 3, nome: "Cielo" }, { id: 4, nome: "Stone" }, { id: 5, nome: "Getnet" }, { id: 6, nome: "Rede" }, { id: 7, nome: "Outro" }]}
                      pagForma={newPagForma} setPagForma={setNewPagForma}
                      pagGateway={newPagGateway} setPagGateway={setNewPagGateway}
                      pagCondicao={newPagCondicao} setPagCondicao={setNewPagCondicao}
                      pagFormValor={newPagValor} setPagFormValor={setNewPagValor}
                      payments={edicaoPayments} setPayments={setEdicaoPayments}
                      multForma={multPagForma} setMultForma={setMultPagForma}
                      multParcelas={newPagParcelas} setMultParcelas={setNewPagParcelas}
                      multValor={multPagValor} setMultValor={setMultPagValor}
                      valeNumero={valeNumero} setValeNumero={setValeNumero}
                      valeValidando={valeValidando} setValeValidando={setValeValidando}
                      valeValidacao={valeValidacao} setValeValidacao={setValeValidacao}
                      multValeNumero={multValeNumero} setMultValeNumero={setMultValeNumero}
                      multValeValidando={multValeValidando} setMultValeValidando={setMultValeValidando}
                      multValeValidacao={multValeValidacao} setMultValeValidacao={setMultValeValidacao}
                      ouroPeso={ouroPeso} setOuroPeso={setOuroPeso}
                      ouroValorGrama={ouroValorGrama} setOuroValorGrama={setOuroValorGrama}
                      ouroFotoFile={ouroFotoFile} setOuroFotoFile={setOuroFotoFile}
                      ouroFotoPreview={ouroFotoPreview} setOuroFotoPreview={setOuroFotoPreview}
                      ouroValidacaoIA={ouroValidacaoIA} setOuroValidacaoIA={setOuroValidacaoIA}
                      ouroValidando={ouroValidando} setOuroValidando={setOuroValidando}
                      multOuroPeso={multOuroPeso} setMultOuroPeso={setMultOuroPeso}
                      multOuroValorGrama={multOuroValorGrama} setMultOuroValorGrama={setMultOuroValorGrama}
                      multOuroFotoFile={multOuroFotoFile} setMultOuroFotoFile={setMultOuroFotoFile}
                      multOuroFotoPreview={multOuroFotoPreview} setMultOuroFotoPreview={setMultOuroFotoPreview}
                      multOuroValidacaoIA={multOuroValidacaoIA} setMultOuroValidacaoIA={setMultOuroValidacaoIA}
                      multOuroValidando={multOuroValidando} setMultOuroValidando={setMultOuroValidando}
                      mpManualId={mpManualId} setMpManualId={setMpManualId}
                      mpManualLoading={mpManualLoading} setMpManualLoading={setMpManualLoading}
                      mpManualMsg={mpManualMsg} setMpManualMsg={setMpManualMsg}
                      saving={updating}
                      validarOuroIA={validarOuroIA}
                      validarValeTroca={validarValeFn}
                      handleAddPagamento={handleEdicaoAdd}
                      handleRemovePagamento={(p) => setEdicaoPayments(prev => prev.filter(x => x._key !== p._key))}
                      handleMpManual={handleMpManual}
                      handleAddMultOuro={async () => {
                        if (!venda || !multOuroFotoFile) { setSaveErr("Foto da balança obrigatória."); return; }
                        setUpdating(true);
                        try {
                          const peso = parseFloat(multOuroPeso.replace(",", ".")); const vg = parseFloat(multOuroValorGrama.replace(",", "."));
                          if (!peso || peso <= 0) throw new Error("Informe o peso do ouro.");
                          if (!vg || vg <= 0) throw new Error("Informe o valor da grama.");
                          const totalMultEd = edicaoPayments.reduce((s, p) => s + p.valor, 0);
                          const restanteEd = +(saldoPendente - totalMultEd).toFixed(2);
                          const path = await uploadOuroFoto(multOuroFotoFile, venda.id);
                          if (!path) throw new Error("Erro ao enviar foto.");
                          const valorOuro = Math.min(+(peso * vg).toFixed(2), restanteEd);
                          const body: Record<string, unknown> = { forma: "Ouro", valor: valorOuro, parcelas: 1, ouro_peso: peso, ouro_valor_grama: vg, ouro_foto_path: path };
                          const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
                          });
                          if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
                          await load();
                          setMultOuroPeso(""); setMultOuroValorGrama(""); setMultOuroFotoFile(null); setMultOuroFotoPreview(null); setMultOuroValidacaoIA(null);
                        } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao registrar pagamento em ouro"); }
                        finally { setUpdating(false); }
                      }}
                      onPaymentSaved={() => { load(); setAddingPag(false); }}
                      cartaoBloqueado={cartaoBloqueado}
                      onSolicitarAprovacaoCartao={solicitarAprovacaoCartao}
                      solicitandoAprovacaoCartao={updating}
                    />
                  </div>
                )}
              </>
            );
          })()}

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
        </div>

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

        {/* ── 6. Itens RFID ── */}
        <Secao>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
              <FileText size={18} style={{ color: C.esmeralda }} />
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color: "#1A1A1A" }}>Itens RFID</p>
              <p className="text-xs" style={{ color: "#6B7280" }}>Vincule os chips físicos a esta venda</p>
            </div>
          </div>
          <RFIDSection vendaId={vendaId} onUpdate={load} />
        </Secao>

        {/* ── 7. Dados Adicionais ── */}
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
            {saving && (
              <span className="text-xs flex items-center gap-1" style={{ color: "#9CA3AF" }}>
                <Loader2 size={12} className="animate-spin" /> Salvando...
              </span>
            )}
            {proximasAcoes.map(acao => {
              const needsValidation = acao.value === "aprovado" || acao.value === "concluido";
              const isConcluirBloqueado = acao.value === "concluido" && temPagamentoPendente;
              const isDisabled = updating || saving || (needsValidation && !podeAprovar) || isConcluirBloqueado || aguardandoAprovacaoCredito || (acao.value === "aprovado" && temManualMpPendente);

              // Quando tem A Receber → usar solicitarAprovacao em vez de changeSituacao
              // Consultora sem desconto alto aprova direto; só vai para aprovação se tiver A Receber ou desconto alto
              const usarSolicitarAprovacao = acao.value === "aprovado" && (temAReceber || (!isFullAccess && !["gerente_loja", "gerente_fabrica", "diretor"].includes(role) && temDescontoAlto));
              const btnLabel = aguardandoAprovacaoCredito && acao.value === "aprovado"
                ? "Aguardando Aprovação..."
                : usarSolicitarAprovacao ? "Enviar para Aprovação" : acao.label;
              const btnHandler = usarSolicitarAprovacao ? solicitarAprovacao : () => changeSituacao(acao.value);

              return (
                <div key={acao.value} className="relative group">
                  <button onClick={btnHandler} disabled={isDisabled}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                    {updating ? <Loader2 size={14} className="animate-spin" /> : <acao.icon size={14} />}
                    {btnLabel}
                  </button>
                  {isConcluirBloqueado && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-52 p-2 rounded-lg border bg-white shadow-lg text-xs" style={{ borderColor: C.cremeBorder, color: "#D97706" }}>
                      Confirme todos os pagamentos pendentes antes de concluir
                    </div>
                  )}
                  {needsValidation && !podeAprovar && !isConcluirBloqueado && (
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-52 p-2 rounded-lg border bg-white shadow-lg text-xs" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                      Preencha antes:
                      {!venda.cliente_id && <p className="text-red-500">• Cliente</p>}
                      {vendedorSel === "" && <p className="text-red-500">• Vendedor</p>}
                      {formaEnvioId === "" && <p className="text-red-500">• Forma de envio</p>}
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
    {abrirNfce && venda && (
      <EmitirNfceModal
        venda={{ id: venda.id, numero_venda: venda.numero_venda, total_venda: venda.total_venda, cliente_id: venda.cliente_id }}
        onClose={() => setAbrirNfce(false)}
        onSuccess={() => { load(); }}
      />
    )}
    {verNotaId && (
      <NotaFiscalDetalheModal notaId={verNotaId} onClose={() => setVerNotaId(null)} />
    )}
    {solicitarPayload && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl border" style={{ borderColor: C.cremeBorder }}>
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: C.cremeBorder }}>
            <h3 className="text-sm font-semibold" style={{ color: C.esmeralda }}>
              {solicitarSucesso ? "Solicitação enviada" : "Solicitar alteração ao administrador"}
            </h3>
            <button onClick={fecharSolicitarModal} className="p-1 rounded hover:bg-gray-100" aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
          {solicitarSucesso ? (
            <div className="p-5 text-sm space-y-3">
              <p className="text-green-700 font-medium">Solicitação enviada com sucesso!</p>
              <p className="text-gray-600">Aguarde aprovação do administrador. Você será notificado quando ela for processada.</p>
              <div className="flex justify-end pt-2">
                <button onClick={fecharSolicitarModal}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                {solicitarPayload.mensagemBloqueio}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: C.esmeralda }}>
                  Campo: <span className="font-mono">{solicitarPayload.campo ?? `pagamento ${solicitarPayload.pagamento_id}`}</span>
                </label>
                <div className="text-xs text-gray-600">
                  Novo valor solicitado: <span className="font-mono">{String(solicitarPayload.valor_solicitado)}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: C.esmeralda }}>
                  Motivo da solicitação *
                </label>
                <textarea
                  value={solicitarMotivo}
                  onChange={(e) => setSolicitarMotivo(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Explique por que esta alteração é necessária..."
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: C.cremeBorder }}
                  disabled={solicitarEnviando}
                />
              </div>
              {solicitarErro && (
                <p className="text-xs text-red-600">{solicitarErro}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={fecharSolicitarModal}
                  disabled={solicitarEnviando}
                  className="px-4 py-2 rounded-lg text-sm border disabled:opacity-50"
                  style={{ borderColor: C.cremeBorder }}>
                  Cancelar
                </button>
                <button onClick={enviarSolicitacaoAlteracao}
                  disabled={solicitarEnviando || !solicitarMotivo.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  {solicitarEnviando && <Loader2 size={14} className="animate-spin" />}
                  Enviar solicitação
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}
