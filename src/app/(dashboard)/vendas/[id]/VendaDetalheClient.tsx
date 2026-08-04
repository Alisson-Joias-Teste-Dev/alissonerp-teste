"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Search, X, Plus, Loader2, CheckCircle, XCircle, AlertCircle,
  Truck, Video, RefreshCw, Share2, Download,
  Check as CheckIcon, FileText, UserPlus, MapPin, Pencil,
  RotateCcw, ArrowRight, PackageCheck, ScanLine, Bike, AlertTriangle, Factory,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { maskCpfCnpj, maskCelular, onlyDigits } from "@/lib/formatters";
import { gerarPDFOrcamento } from "@/lib/gerar-pdf-orcamento";
import type { OrcamentoPDF } from "@/lib/gerar-pdf-orcamento";
import MercadoPagoCobranca from "@/components/vendas/MercadoPagoCobranca";
import PagBankCobranca from "@/components/vendas/PagBankCobranca";
import PagBankQrInline from "@/components/vendas/PagBankQrInline";
import PixQrInline from "@/components/vendas/PixQrInline";
import CartaoInline from "@/components/vendas/CartaoInline";
import PagamentoForm, { type PagamentoEntry, fmt as fmtPagamento } from "@/components/vendas/PagamentoForm";
import PainelCrediario from "@/components/vendas/PainelCrediario";
import { calcularCrediPreview, type CrediTipo } from "@/lib/credi-preview";
import UpgradeItemFields from "@/components/vendas/UpgradeItemFields";
import EmitirNfceModal from "@/components/fiscal/EmitirNfceModal";
import NotaFiscalDetalheModal from "@/components/fiscal/NotaFiscalDetalheModal";
// REGRA DE NEGÓCIO: modal de entrega (parcial/total) da venda
import MarcarEntregaModal from "@/components/entregas/MarcarEntregaModal";
import AbrirOrdemAliancaModal from "@/components/vendas/AbrirOrdemAliancaModal";
// REGRA DE NEGÓCIO (V3): modal de solicitação de frete avulso, aberto de
// dentro da venda com modoSolicitacao (vendaId fixado, ver props abaixo)
import FreteAvulsoModal from "@/components/entregas/FreteAvulsoModal";
// REGRA DE NEGÓCIO (BLOCO 3 — fonte única de permissão): quem pode SOLICITAR
// frete avulso vem de src/lib/permissoes/frete-avulso.ts — backend
// (route.ts) e este front usam o MESMO predicado. NUNCA reescrever a lista
// aqui (ver comentário completo no módulo).
import { podeSolicitarFreteAvulso } from "@/lib/permissoes/frete-avulso";
import { enderecoDaVenda } from "@/components/endereco/EnderecoForm";
import { useErrorStore } from "@/stores/errorStore";
import { getPublicUrl } from "@/lib/storage-url";
// REGRA DE NEGOCIO: helpers de rodio (Frente A — 30/05/2026)
import { isServicoRodioProduto, calcularPreviewRodioPorSkuBase, getPctRodio, round2, SKU_RODIO_CANONICO } from "@/lib/servico-rodio";

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
  /** Percentual do servico automatico sobre joia base (ex: 0.30 = 30% para rodio).
   *  NULL = usa PCT_RODIO_DEFAULT. Frente C do Plano de Acao (30/05/2026). */
  pct_calculo_servico?: number | null;
}
interface FaixaComissao { desconto_pct: number; comissao_pct: number; }
interface ItemVenda {
  id?: number; _key: string; produto_id: number | null; nome_produto: string; sku: string;
  quantidade: number; preco_lista: number; pct_desconto: number;
  preco_unitario: number; total_item: number; pct_comissao: number;
  valor_comissao: number; peso_estimado: number | null; unidade: string | null;
  observacao?: string | null;
  /** Preço CHEIO da campanha (migration 366). Num item em promoção,
   *  `preco_lista` guarda o preço PROMOCIONAL — este é o de verdade, e é dele
   *  que sai a faixa de comissão. Igual a `preco_lista` fora de promoção.
   *  Sem ele a tela mostrava "lista 599,00 · % Desc — · comissão 0,50%" e não
   *  havia como a consultora entender de onde saiu o 0,50%.
   *  Ver docs/regras-negocio/comercial.md §2.1.2. */
  preco_lista_cheio?: number | null;
  promocao_nome?: string | null;
  /** Markup gravado quando o item vem de orçamento (aliança/peça). Quando
   *  presente, a comissão usa commissionForMarkup (curva). Quando null,
   *  cai na faixas_comissao por desconto. */
  markup_aplicado?: number | null;
  personalizacao?: { valor?: string; preco_por_letra?: number; peso_por_letra?: number } | null;
  /** Dados de upgrade (nulo se não for item upgrade) */
  upgrade?: {
    peso_gramas: number;
    peso_liquido: number;
    quebra_percentual: number;
    valor_por_grama: number;
    foto_balanca_path: string;
    cofre_registrado: boolean;
  } | null;
}
interface PagamentoServer {
  id: number; forma: string; gateway: string | null; valor: number;
  parcelas: number; status: string; data_confirmacao: string | null;
  valor_liquido?: number | null;  // valor que cai na conta MP (bruto - taxas)
  taxas_mp?: number | null;        // total deduzido (MP fee + adquirência)
  ouro_peso?: number | null;
  ouro_valor_grama?: number | null;
  ouro_foto_path?: string | null;
}
interface Vendedor { id_vendedor: number; nome: string; }
interface FormaEnvio { id: number; nome: string; id_api: string; }
interface FormaFrete { id: number; nome: string; codigo: string; id_api_logistica: string; }

interface Venda {
  id: number; numero_venda: string;
  cliente_id: number | null; cliente_nome: string | null; cliente_cpf_cnpj: string | null;
  cliente_email: string | null; cliente_telefone: string | null; cliente_celular?: string | null;
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
  aprovacao_desconto_tarefa_id?: number | null;
  aprovacao_desconto_status?: string | null;
  aprovacao_cartao_desconto_tarefa_id?: number | null;
  aprovacao_cartao_desconto_status?: string | null;
  aprovacao_desconto_aprov_id?: number | null;
  desconto_aprovado_por_nome?: string | null;
  desconto_aprovado_em?: string | null;
  desconto_cartao_aprovado_por_nome?: string | null;
  desconto_cartao_aprovado_em?: string | null;
  entrega_sem_pagamento_aprovada?: boolean;
  saldo_financeiro_aberto?: number;
  entregue_com_pendencia_financeira?: boolean;
  entrega_devendo?: boolean;                  // tem A Receber pendente (levou devendo)
  entrega_excecao_status?: string | null;     // 'pendente' | 'aprovado' | null
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
    preco_lista_cheio?: number | null;
    promocao_nome?: string | null;
    markup_aplicado?: number | null;
    personalizacao?: { valor?: string; preco_por_letra?: number; peso_por_letra?: number } | null;
    /** Dados de upgrade (nulo se não for item upgrade) */
    upgrade?: {
      peso_gramas: number;
      peso_liquido: number;
      quebra_percentual: number;
      valor_por_grama: number;
      foto_balanca_path: string;
      cofre_registrado: boolean;
    } | null;
  }>;
  pagamentos: PagamentoServer[];
  ordens?: Array<{
    id: number; numero_ordem: string; tipo_ordem: string;
    situacao: string; status: string; created_at: string;
  }>;
  /** Venda de aliança já fechada e ainda SEM ordem na fábrica — falta confirmar
   *  o aro e abrir (a ordem de aliança não nasce mais na aprovação da venda). */
  alianca_sem_ordem?: boolean;
  /** Alianças: ficha de cada anel (só exibição — preenchido por /api/vendas/[id]). */
  aliancaRings?: Array<{
    anel: number; modelo: string | null; perfil: string | null;
    tamanho: string | null; largura: number | null; espessura: number | null;
    pedra: { tipo: string | null; qtd: number | null; tamanho_mm: number | null; aplicacao: string | null } | null;
    valorPedra: number | null;
    pedras: Array<{ tipo: string | null; corte: string | null; tamanho_mm: number | null; qtd: number | null; ct_total: number | null; preco_total_rs: number | null }>;
  }>;
  empresa_emitente_id?: number | null;
  nota_fiscal_id?: number | null;
  descontoThreshold?: number | null;
  /** Limite (%) de desconto acima do qual o Cartão de Crédito exige aprovação.
   *  Vem da config `limite_desconto_cartao_pct` (Configurações › Aprovadores). */
  limiteDescontoCartao?: number | null;
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
  em_rota: "Em Rota", entregue: "Entregue", cancelado: "Cancelado", concluido: "Concluído",
  virou_credito: "Virou crédito",
};
const SITUACAO_COLOR: Record<string, { bg: string; text: string }> = {
  rascunho:  { bg: "#F3F4F6", text: "#6B7280" },
  aprovado:  { bg: "#D1FAE5", text: "#065F46" },
  enviado:   { bg: "#DBEAFE", text: "#1D4ED8" },
  em_rota:   { bg: "#FFF7ED", text: "#9A3412" },
  entregue:  { bg: "#EDE9FE", text: "#5B21B6" },
  cancelado: { bg: "#FEE2E2", text: "#991B1B" },
  concluido: { bg: C.esmeraldaLt, text: C.esmeralda },
  virou_credito: { bg: "#FFFBEB", text: "#B45309" },
};
const PAG_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pendente:   { bg: "#FEF9C3", text: "#713F12" },
  confirmado: { bg: "#D1FAE5", text: "#065F46" },
  cancelado:  { bg: "#FEE2E2", text: "#991B1B" },
  estornado:  { bg: "#F3F4F6", text: "#6B7280" },
  // Dinheiro/Ouro recebido pelo motoboy na entrega, aguardando conferência do caixa.
  aguard_conferencia: { bg: "#FEF3C7", text: "#92400E" },
};
// Rótulo amigável do status (o badge não mostra o valor cru do banco).
const PAG_STATUS_LABEL: Record<string, string> = {
  aguard_conferencia: "aguard. conferência",
};

const PROXIMA_SITUACAO: Record<string, { label: string; value: string; icon: typeof CheckCircle }[]> = {
  rascunho:  [{ label: "Salvar Venda",    value: "aprovado", icon: CheckCircle }],
  aprovado:  [],
  em_rota:   [],
  enviado:   [],
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

  // Só a direção reatribui o vendedor da venda (afeta comissão). Consultora e
  // gerente_loja não podem trocar — fica só leitura. Casa com o backend
  // (CAMPOS_ADMIN_ONLY / ROLES_FINANCEIRO em /api/vendas/[id]).
  const podeTrocarVendedor = ["diretor", "admin", "desenvolvedor"].includes(role);

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
  // REGRA DE NEGOCIO (Ródio automatico — Frente A, 30/05/2026):
  // O que: campos para coletar SKU base e exibir preview quando o produto selecionado e rodio.
  // Por que: espelha comportamento do NovaVendaClientV2 — sem isso, o backend rejeita
  //   a adicao de servico de rodio exigindo personalizacao.valor com SKU base.
  const [rodioSkuBase, setRodioSkuBase] = useState("");
  const [rodioPreviewValor, setRodioPreviewValor] = useState<number | null>(null);
  const [rodioValidando, setRodioValidando] = useState(false);
  const [rodioErro, setRodioErro] = useState("");
  // ── Upgrade (produto_upgrade_config)
  // REGRA DE NEGOCIO: detecta se o produto selecionado e upgrade
  // e gerencia campos especificos (peso, foto, quebra).
  // POR QUE: o VendaDetalheClient nao tinha tratamento de upgrade,
  // impedindo adicionar/editar upgrades pelo detalhe da venda.
  const [isUpgradeProduto, setIsUpgradeProduto] = useState(false);
  const [upgradeValorPorGrama, setUpgradeValorPorGrama] = useState(0);
  const [upgradeQuebraPct, setUpgradeQuebraPct] = useState(10);
  const [upgradePesoGramas, setUpgradePesoGramas] = useState("");
  const [upgradeFotoB64, setUpgradeFotoB64] = useState<string | null>(null);
  const [upgradeFotoPreview, setUpgradeFotoPreview] = useState<string | null>(null);
  const [upgradeFotoPath, setUpgradeFotoPath] = useState<string | null>(null);
  const [uploadingUpgradeFoto, setUploadingUpgradeFoto] = useState(false);
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
  // Plano do crediário (forma "A Receber") no detalhe — espelha o wizard.
  // Grava credi_tipo/credi_param no pagamento; o gatilho gera as parcelas/sinal na
  // aprovação (migrations 317/318). Só aparece em rascunho (regra da porta única).
  const [crediTipo, setCrediTipo] = useState<CrediTipo>("meses");
  const [crediParcelas, setCrediParcelas] = useState(3);
  const [crediDiaVenc, setCrediDiaVenc] = useState(10);
  const [crediDias, setCrediDias] = useState(15);
  const [parcelasRows, setParcelasRows] = useState<ParcelaRow[]>([]);
  const [multPagForma, setMultPagForma] = useState("Dinheiro");
  const [multPagValor, setMultPagValor] = useState("");
  // UX: ao escolher "A Receber", a 1ª linha a montar já vem como "A Receber" (só digita o valor).
  useEffect(() => {
    if (newPagForma === "A Receber") setMultPagForma("A Receber");
    else if (newPagForma === "Múltiplas") setMultPagForma("Dinheiro");
  }, [newPagForma]);
  const [multPagamentos, setMultPagamentos] = useState<Array<{ _key: string; forma: string; valor: number; ouro_peso?: number; ouro_valor_grama?: number; ouro_foto_path?: string }>>([]);

  // ── Manual MP ───────────────────────────────────────────────────────────────
  const [mpManualId, setMpManualId] = useState("");
  const [mpManualLoading, setMpManualLoading] = useState(false);
  const [mpManualMsg, setMpManualMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Manual MP inline (pagamento pendente na venda) ──────────────────────────
  const [mpManualPagId, setMpManualPagId] = useState<number | null>(null);
  // Etapa 4 — qual pagamento 'Na Entrega' está abrindo o seletor de forma p/ cobrar
  const [cobrarPagId, setCobrarPagId] = useState<number | null>(null);
  const [mpManualPagIdValue, setMpManualPagIdValue] = useState("");
  const [mpManualPagLoading, setMpManualPagLoading] = useState(false);
  const [mpManualPagMsg, setMpManualPagMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Registrar Recebimento A Receber ─────────────────────────────────────────
  const [recebimentoPagId, setRecebimentoPagId] = useState<number | null>(null);
  const [recebimentoTipo, setRecebimentoTipo] = useState<
    "Dinheiro" | "Cartão de Crédito" | "Pix" | "Ouro" | "Vale-Troca" | "Manual (MP)" | null
  >(null);
  const [recebimentoMpId, setRecebimentoMpId] = useState("");
  const [recebimentoValor, setRecebimentoValor] = useState("");
  const [recebimentoLoading, setRecebimentoLoading] = useState(false);
  const [recebimentoMsg, setRecebimentoMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Ouro no recebimento
  const [recOuroPeso, setRecOuroPeso] = useState("");
  const [recOuroValorGrama, setRecOuroValorGrama] = useState("");
  const [recOuroFotoFile, setRecOuroFotoFile] = useState<File | null>(null);
  const [recOuroFotoPreview, setRecOuroFotoPreview] = useState<string | null>(null);
  const [recOuroUploading, setRecOuroUploading] = useState(false);

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
  const [gateways, setGateways] = useState<{ id: number; nome: string }[]>([
    { id: 1, nome: "Mercado Pago" },
    { id: 2, nome: "PagBank" },
  ]);
  useEffect(() => {
    fetch("/api/configuracoes/gateways").then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        const lista = d.filter((g: any) => g.ativo);
        // Garante que PagBank aparece mesmo antes do migration ser aplicado
        if (!lista.some((g: any) => g.nome === "PagBank")) {
          lista.push({ id: 999, nome: "PagBank" });
        }
        setGateways(lista);
      }
      // Pitfall §3: erro de carga não pode ser silencioso
    }).catch(() => useErrorStore.getState().push("Erro ao carregar gateways de pagamento", { level: "warning" }));
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
  const [saveInfo, setSaveInfo] = useState("");
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
  // REGRA DE NEGÓCIO: controla a abertura do modal de Marcar Entrega — permite
  // registrar entregas parciais ou totais dos itens da venda aprovada.
  const [showMarcarEntrega, setShowMarcarEntrega] = useState(false);
  // REGRA DE NEGÓCIO (V3): controla a abertura do modal de Solicitar Frete
  // Avulso — a consultora dona da venda pede diretamente daqui, sem passar
  // pelo menu Entregas (ver botão/status na barra de banners abaixo).
  const [showFreteAvulsoModal, setShowFreteAvulsoModal] = useState(false);

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
  // Confirmação do aro + abertura da ordem de aliança (ver banner e modal).
  const [abrirOrdemAberto, setAbrirOrdemAberto] = useState(false);
  const [ordemAbertaMsg, setOrdemAbertaMsg] = useState("");

  // ── Load venda ──────────────────────────────────────────────────────────────
  // silent=true: recarrega os dados da venda SEM trocar a tela pelo spinner de
  // loading (linha "if (loadingVenda) return <spinner>"). REGRA: o auto-salvar e
  // o ouvinte realtime precisam atualizar o updated_at (trava de concorrencia)
  // por baixo dos panos. Sem o silent, cada autosave disparava o spinner de tela
  // inteira e o formulario "piscava/recarregava sozinho" enquanto o usuario digitava.
  // IMPACTO se remover o silent: volta o bug de a tela recarregar sozinha ao digitar.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadingVenda(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/vendas/${vendaId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVenda(await res.json() as Venda);
    } catch (e) { if (!silent) setLoadError(e instanceof Error ? e.message : "Erro ao carregar"); }
    finally { if (!silent) setLoadingVenda(false); }
  }, [vendaId]);

  useEffect(() => { load(); }, [load]);

  // ── Solicitar aprovação para entregar DEVENDO (crediário ②) ──────────────────
  // A consultora pede com antecedência; no dia da entrega o portão já está liberado.
  const [solicitandoEntrega, setSolicitandoEntrega] = useState(false);
  const handleSolicitarAprovacaoEntrega = useCallback(async () => {
    if (solicitandoEntrega) return;
    setSolicitandoEntrega(true);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/solicitar-aprovacao-entrega`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { alert(data?.error ?? "Falha ao solicitar aprovação."); return; }
      await load();
    } catch {
      alert("Falha ao solicitar aprovação. Tente novamente.");
    } finally {
      setSolicitandoEntrega(false);
    }
  }, [vendaId, solicitandoEntrega, load]);

  // Saldo de entrega por item (qtd vendida − já entregue) — para mostrar na tela
  // quando houve entrega PARCIAL (ex.: 1 de 2 já entregue). Decisão Jonathan 12/06:
  // o sistema precisa MOSTRAR o que já foi entregue.
  const [saldoEntrega, setSaldoEntrega] = useState<Array<{
    itemVendaId: number; nomeProduto: string; qtdVendida: number; qtdEntregue: number; saldoPendente: number; bloqueadoReposicao?: boolean;
  }>>([]);
  const [bloqueioVendaInteira, setBloqueioVendaInteira] = useState(false);
  useEffect(() => {
    if (!venda || !["aprovado", "enviado", "em_rota"].includes(venda.situacao)) { setSaldoEntrega([]); setBloqueioVendaInteira(false); return; }
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/entregas-venda/saldo-pendente?venda_id=${vendaId}&todos=1`);
        if (res.ok) { const d = await res.json(); if (!cancelado) { setSaldoEntrega(d.itens ?? []); setBloqueioVendaInteira(!!d.bloqueioVendaInteira); } }
      } catch { /* silencioso */ }
    })();
    return () => { cancelado = true; };
  }, [venda, vendaId]);
  const entregaParcialResumo = saldoEntrega.filter((i) => i.qtdEntregue > 0);
  const faltamEntregar = saldoEntrega.reduce((s, i) => s + i.saldoPendente, 0);
  // Mapa item_venda_id → entrega (pra mostrar "X de Y entregue" em cada item)
  const entregaPorItem = new Map(saldoEntrega.map((i) => [i.itemVendaId, i]));
  // Reposição por item: há item PRONTO para entregar (saldo > 0 e não bloqueado)?
  const temItemEntregavel = saldoEntrega.some((i) => i.saldoPendente > 0 && !i.bloqueadoReposicao);
  const itemReposicaoBloqueado = saldoEntrega.find((i) => i.saldoPendente > 0 && i.bloqueadoReposicao);

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
      }, () => { load(true); }) // silencioso: nao pisca a tela ao salvar/aprovar
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
    if (isFullAccess || podeTrocarVendedor) fetch("/api/vendedores").then(r => r.json()).then(setVendedores)
      .catch(() => push("Erro ao carregar vendedores", { level: "warning" }));
  }, [isFullAccess, podeTrocarVendedor]);

  // ── Hydrate form from venda ─────────────────────────────────────────────────
  useEffect(() => {
    if (!venda) return;
    setCliente(venda.cliente_id ? {
      id: venda.cliente_id, nome: venda.cliente_nome ?? "",
      cpf_cnpj: venda.cliente_cpf_cnpj, email: venda.cliente_email, telefone: venda.cliente_telefone,
      celular: venda.cliente_celular ?? null,
      endereco: venda.cliente_endereco ?? null, numero: venda.cliente_numero ?? null,
      complemento: venda.cliente_complemento ?? null, bairro: venda.cliente_bairro ?? null,
      municipio: venda.cliente_municipio ?? null, cep: venda.cliente_cep ?? null, uf: venda.cliente_uf ?? null,
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
  const edit = useMemo(() => {
    if (!venda || venda.bloqueado || ["cancelado", "concluido"].includes(venda.situacao))
      return { full: false, limited: false, metadata: false, readOnly: true, pagamento: false };
    if (venda.situacao === "rascunho")
      return { full: true, limited: true, metadata: true, readOnly: false, pagamento: true };
    if (venda.situacao === "aprovado" || venda.situacao === "enviado")
      return { full: false, limited: false, metadata: false, readOnly: true, pagamento: true };
    if (venda.situacao === "entregue")
      return { full: false, limited: false, metadata: false, readOnly: true, pagamento: false };
    return { full: false, limited: false, metadata: false, readOnly: true, pagamento: false };
  }, [venda]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const itens: ItemVenda[] = useMemo(() =>
    (venda?.itens ?? []).map(i => ({
      id: i.id, _key: `srv-${i.id}`, produto_id: i.produto_id,
      nome_produto: i.nome_produto, sku: i.sku ?? "", quantidade: i.quantidade,
      preco_lista: i.preco_lista, pct_desconto: i.pct_desconto,
      preco_unitario: i.preco_unitario, total_item: i.total_item,
      pct_comissao: i.pct_comissao, valor_comissao: i.valor_comissao,
      peso_estimado: i.peso_estimado ?? null, unidade: null, observacao: i.observacao,
      preco_lista_cheio: i.preco_lista_cheio ?? null,
      promocao_nome: i.promocao_nome ?? null,
      markup_aplicado: i.markup_aplicado ?? null,
      personalizacao: i.personalizacao ?? null,
      upgrade: i.upgrade ?? null,
    })),
  [venda]);

  // ── Alianças: separar cada anel na exibição (display only — ver /api/vendas/[id]) ──
  // O QUE: quando o item é uma aliança (par), mostramos um anel por linha com
  // tamanho/aro e pedra. POR QUE: antes vinha "tudo junto" numa linha só.
  // Só separa quando há EXATAMENTE um item de aliança e temos as fichas dos anéis
  // (evita mapear errado se a venda tiver mais de uma aliança). É só exibição:
  // preço/quantidade/comissão totais não mudam (divididos igualmente entre os anéis).
  const aliancaRings = venda?.aliancaRings ?? [];
  const aliancaItemIdxs = itens
    .map((it, i) => (/^alian[çc]a/i.test(it.nome_produto) ? i : -1))
    .filter((i) => i >= 0);
  const splitAliancaIdx = aliancaRings.length > 0 && aliancaItemIdxs.length === 1 ? aliancaItemIdxs[0] : -1;

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

  // ─── Upgrade (produto_upgrade_config) ────────────────────────────────────────
  // REGRA DE NEGOCIO: espelha NovaVendaClientV2.tsx — detecta se o produto
  // selecionado e upgrade e carrega a config (valor_por_grama, quebra_percentual).
  // POR QUE: sem esta deteccao, o produto upgrade e tratado como item comum no
  // detalhe da venda, sem os campos obrigatorios de peso e foto.
  async function checkUpgradeConfig(produtoId: number) {
    try {
      const res = await fetch(`/api/produtos/upgrade-config?produto_id=${produtoId}`);
      if (!res.ok) { setIsUpgradeProduto(false); return; }
      const config = await res.json();
      if (config) {
        setIsUpgradeProduto(true);
        setUpgradeValorPorGrama(config.valor_por_grama);
        setUpgradeQuebraPct(config.quebra_percentual);
      } else {
        setIsUpgradeProduto(false);
      }
    } catch {
      setIsUpgradeProduto(false);
    }
  }

  // REGRA DE NEGOCIO: faz upload da foto da balanca para o bucket
  // pagamento-fotos e retorna o path para uso no item da venda.
  async function handleUpgradeFotoUpload(b64: string): Promise<string | null> {
    setUploadingUpgradeFoto(true);
    try {
      const res = await fetch("/api/produtos/upgrade/foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_base64: b64 }),
      });
      if (!res.ok) throw new Error("Upload falhou");
      const data = await res.json() as { path: string };
      setUpgradeFotoPath(data.path);
      return data.path;
    } catch {
      setUpgradeFotoPath(null);
      return null;
    } finally {
      setUploadingUpgradeFoto(false);
    }
  }

  // Reseta estado de upgrade ao fechar ou limpar produto
  function resetUpgradeState() {
    setIsUpgradeProduto(false);
    setUpgradeValorPorGrama(0);
    setUpgradeQuebraPct(10);
    setUpgradePesoGramas("");
    setUpgradeFotoB64(null);
    setUpgradeFotoPreview(null);
    setUpgradeFotoPath(null);
  }

  // ── Item actions (immediate save) ───────────────────────────────────────────
  // REGRA DE NEGOCIO (Ródio automatico — Frente A, 30/05/2026):
  // O que: quando o produto selecionado e servico de rodio, exige SKU base da joia,
  //   calcula preview em pct_calculo_servico % do preco da joia no frontend,
  //   e envia personalizacao.valor para o backend recalcular server-side.
  // Por que: sem este bloco, o backend rejeita o item com erro 400
  //   "Servico de rodio exige SKU base da joia". O detalhe da venda nunca
  //   teve este tratamento — foi esquecido quando a regra foi implementada.
  // Impacto: remover este bloco REABRE o bug original — servico de rodio
  //   nao funciona na tela de detalhe da venda.
  async function handleAddItem() {
    if (!produtoSel || !venda) return;
    if (pctDesconto > maxDesconto) { setDescontoErr(`Máximo: ${maxDesconto}%`); return; }

    let item: Record<string, unknown> = calcItem(produtoSel, qtd, pctDesconto);

    // ── Upgrade: valida peso e foto obrigatorios ───────────────────────
    // REGRA DE NEGOCIO: para upgrade, qtd e sempre 1 e o preco e
    // calculado como peso_gramas × valor_por_grama. Peso e foto da
    // balanca sao obrigatorios.
    let upgradePayload: Record<string, unknown> | null = null;
    if (isUpgradeProduto) {
      const pesoNum = parseFloat(upgradePesoGramas.replace(",", "."));
      if (!pesoNum || pesoNum <= 0) {
        setDescontoErr("Informe o peso do metal antes de adicionar o upgrade.");
        return;
      }
      if (!upgradeFotoPath) {
        setDescontoErr("Anexe a foto da balanca antes de adicionar o upgrade.");
        return;
      }
      upgradePayload = {
        peso_gramas: pesoNum,
        foto_balanca_path: upgradeFotoPath,
        valor_por_grama: upgradeValorPorGrama,
        quebra_percentual: upgradeQuebraPct,
        peso_liquido: Math.round(pesoNum * (1 - upgradeQuebraPct / 100) * 10000) / 10000,
      };

      // Recalcula valores do item com base no upgrade
      const valorLista = Math.round(pesoNum * upgradeValorPorGrama * 100) / 100;
      const valorUnitario = Math.round(valorLista * (1 - pctDesconto / 100) * 100) / 100;
      const totalUpgrade = valorUnitario;
      const pctComissaoUpgrade = getComissao(pctDesconto);
      item = {
        ...item,
        ...upgradePayload,
        quantidade: 1,
        preco_lista: valorLista,
        preco_unitario: valorUnitario,
        total_item: totalUpgrade,
        pct_comissao: pctComissaoUpgrade,
        valor_comissao: Math.round(totalUpgrade * (pctComissaoUpgrade / 100) * 100) / 100,
        peso_estimado: pesoNum,
        upgrade: upgradePayload,
      };
    }

    // ── Ródio: valida SKU base e recalcula preços ─────────────────────────────
    if (isServicoRodioProduto(produtoSel)) {
      if (!rodioSkuBase.trim()) {
        setRodioErro("Informe o SKU base da joia para calcular o rodio automaticamente.");
        return;
      }
      setRodioValidando(true);
      setRodioErro("");
      let precoRodio: number | null = null;
      try {
        precoRodio = await calcularPreviewRodioPorSkuBase(
          rodioSkuBase.trim(),
          getPctRodio(produtoSel),
        );
      } finally {
        setRodioValidando(false);
      }
      if (precoRodio == null) {
        setRodioErro(`Nao foi possivel calcular o rodio para SKU ${rodioSkuBase}. Verifique se o SKU existe e tem preco.`);
        return;
      }
      setRodioPreviewValor(precoRodio);

      const totalRodio = round2(precoRodio * qtd);
      const skuBaseUpper = rodioSkuBase.trim().toUpperCase();
      item = {
        ...item,
        // SKU composto evita violar a constraint de unicidade (venda_id, produto_id, sku)
        // no banco — cada joia base gera um SKU unico (ex: SRV-RODIO-AJ1519)
        sku: `${item.sku ?? SKU_RODIO_CANONICO}-${skuBaseUpper}`,
        preco_lista: precoRodio,
        preco_unitario: precoRodio,
        total_item: totalRodio,
        valor_comissao: round2(totalRodio * (Number(item.pct_comissao ?? 0) / 100)),
        personalizacao: { valor: skuBaseUpper },
      };
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/itens`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
      await load();
      setProdutoSel(null); setQtd(1); setPctDesconto(0); setDescontoErr(""); setAddingItem(false);
      // Limpa estado do rodio apos sucesso
      setRodioSkuBase(""); setRodioPreviewValor(null); setRodioErro("");
      // Limpa estado de upgrade apos sucesso
      resetUpgradeState();
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
      if (novoPreco < 0) return;
      // REGRA DE NEGOCIO: markup (preco acima da lista) e permitido — consultora pode
      // vender produto mais caro sem aprovacao. Nesse caso pct_desconto = 0.
      let pct = novoPreco > item.preco_lista
        ? 0
        : ((item.preco_lista - novoPreco) / item.preco_lista) * 100;
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
    setSaveErr(""); // limpa erro de tentativa anterior — um sucesso nao pode deixar banner velho na tela
    try {
      const parcelas = newPagCondicao === "À vista" ? 1 : parseInt(newPagCondicao) || newPagParcelas;
      const body: Record<string, unknown> = { forma: newPagForma, valor: v, parcelas };
      if (newPagForma === "Cartão de Crédito") {
        body.gateway = newPagGateway;
      }
      if (newPagForma === "Vale-Troca") {
        // Promocional (sem dono) aplica direto. Vale COM dono usa o painel ValeCodigoInline.
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
      // Fluxo novo 06/2026: pagamento quitado não conclui mais a venda
      setMpManualMsg({ text: `Pagamento verificado e registrado! Valor: R$ ${Number(data.valor_registrado).toFixed(2).replace(".", ",")}${data.pagamento_quitado ? " — venda quitada." : ""}`, ok: true });
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

  /**
   * handleRegistrarRecebimento — Confirma o recebimento inline de um "A Receber".
   *
   * Três caminhos:
   *   1. Manual (MP): verifica pagamento na API do Mercado Pago (verificar-manual)
   *   2. Ouro: faz upload da foto da balança → confirma com ouro_peso/grama/foto
   *   3. Demais (Dinheiro, Cartão, Pix, VT): confirmação direta via /confirmar
   *
   * Para Ouro: o valor pago = peso * valor_grama (calculado, não digitado).
   * Para os demais: aceita valor_pago do campo recebimentoValor (split se parcial).
   *
   * ⚠️ REGRA DE OURO #6: se valor_pago < valor_total → split de crédito.
   *    O endpoint /confirmar cuida do resto (criar nova conta, novo pagamento, etc).
   */
  async function handleRegistrarRecebimento() {
    if (!venda || !recebimentoPagId || !recebimentoTipo) return;
    setRecebimentoLoading(true);
    setRecebimentoMsg(null);
    try {
      if (recebimentoTipo === "Manual (MP)") {
        if (!recebimentoMpId.trim()) { setRecebimentoMsg({ text: "Informe o ID do pagamento", ok: false }); setRecebimentoLoading(false); return; }
        const res = await fetch(`/api/vendas/${venda.id}/mercado-pago/verificar-manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: recebimentoMpId.trim(), pagamento_id: recebimentoPagId }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        setRecebimentoMsg({ text: `Confirmado! R$ ${Number(d.valor_registrado).toFixed(2).replace(".", ",")}${d.pagamento_quitado ? " — venda quitada." : ""}`, ok: true });
        setRecebimentoPagId(null);
        setRecebimentoTipo(null);
        setRecebimentoMpId("");
        await load();
      } else if (recebimentoTipo === "Ouro") {
        // Ouro: upload foto + confirmar
        const p = parseFloat(recOuroPeso.replace(",", "."));
        const vg = parseFloat(recOuroValorGrama.replace(",", "."));
        if (!p || p <= 0) { setRecebimentoMsg({ text: "Informe o peso do ouro", ok: false }); setRecebimentoLoading(false); return; }
        if (!vg || vg <= 0) { setRecebimentoMsg({ text: "Informe o valor da grama", ok: false }); setRecebimentoLoading(false); return; }
        if (!recOuroFotoFile) { setRecebimentoMsg({ text: "Foto da balança obrigatória", ok: false }); setRecebimentoLoading(false); return; }

        setRecOuroUploading(true);
        const supabase = createClient();
        const ext = recOuroFotoFile.name.split(".").pop() ?? "jpg";
        const fotoPath = `pagamentos/${venda.id}/recebimento-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("pagamento-fotos").upload(fotoPath, recOuroFotoFile, { contentType: recOuroFotoFile.type });
        if (uploadErr) throw new Error("Erro ao enviar foto: " + uploadErr.message);

        const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${recebimentoPagId}/confirmar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forma_recebimento: recebimentoTipo,
            valor_pago: p * vg,
            ouro_peso: p,
            ouro_valor_grama: vg,
            ouro_foto_path: fotoPath,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        setRecebimentoMsg({ text: `Confirmado! R$ ${(p * vg).toFixed(2).replace(".", ",")}`, ok: true });
        setRecebimentoPagId(null);
        setRecebimentoTipo(null);
        setRecOuroPeso(""); setRecOuroValorGrama(""); setRecOuroFotoFile(null); setRecOuroFotoPreview(null);
        await load();
      } else {
        // Demais formas: Dinheiro, Cartão, Pix, Vale-Troca
        const valor = parseFloat(recebimentoValor.replace(",", "."));
        const body: Record<string, unknown> = { forma_recebimento: recebimentoTipo };
        if (valor > 0) body.valor_pago = valor;

        const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${recebimentoPagId}/confirmar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        if (d.pagamento_parcial) {
          setRecebimentoMsg({ text: `Parcial de R$ ${Number(d.valor_pago).toFixed(2).replace(".", ",")} confirmado. Restante: R$ ${Number(d.valor_restante).toFixed(2).replace(".", ",")} — novo crédito gerado.`, ok: true });
        }
        setRecebimentoPagId(null);
        setRecebimentoTipo(null);
        setRecebimentoValor("");
        await load();
      }
    } catch (e) {
      setRecebimentoMsg({ text: e instanceof Error ? e.message : "Erro ao confirmar recebimento", ok: false });
    } finally {
      setRecebimentoLoading(false);
      setRecOuroUploading(false);
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

  // Etapa 4 (Pagamento na Entrega): registra a forma REAL usada pelo cliente na
  // entrega. Confirma o saldo 'Na Entrega' e baixa a conta a receber (gatilho 297),
  // destravando a entrega ("não entrega sem pagar").
  async function cobrarEntrega(forma: string) {
    if (!venda) return;
    setUpdating(true);
    setSaveErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}/cobrar-entrega`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forma }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setCobrarPagId(null);
      await load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao cobrar na entrega");
    } finally {
      setUpdating(false);
    }
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
        // Fluxo novo 06/2026: pagamento quitado não conclui mais a venda —
        // o status só muda na entrega (em_rota → entregue).
        if (d.todos_pagos) alert("Todos os pagamentos confirmados — venda quitada!");
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

  /**
   * REGRA DE NEGÓCIO (16/07, pedido do Jonathan): pede de uma vez TODAS as
   * aprovações pendentes da venda (desconto + cartão), pra consultora não ter
   * que clicar em dois banners.
   *
   * O QUÊ: dispara os POSTs em sequência e junta o resultado. Cada pedido é
   *   independente: se um falhar, o outro segue e a falha é reportada.
   * O PORQUÊ: os botões individuais CONTINUAM existindo — se a venda vai ser
   *   paga no Pix, ela pede só o desconto e não incomoda o aprovador com uma
   *   aprovação de cartão que não vai usar. Este botão é atalho, não substituto.
   * O IMPACTO: só aparece quando há 2+ pendentes (ver aprovacoesPendentes).
   * NOTA: pedir cartão junto só funciona porque o guard do backend foi
   *   liberado pra cartao_desconto em 16/07 (solicitar-aprovacao/route.ts) —
   *   antes dava 409 "solicite o desconto primeiro".
   */
  async function solicitarTodasAprovacoes() {
    if (!venda) return;
    setUpdating(true); setSaveErr("");
    const pedidos: { tipo: string; label: string }[] = [];
    if (precisaSolicitarDesconto) pedidos.push({ tipo: "desconto", label: "Desconto" });
    if (precisaSolicitarDescontoCartao) pedidos.push({ tipo: "cartao_desconto", label: "Cartão" });
    const falhas: string[] = [];
    for (const p of pedidos) {
      try {
        const res = await fetch(`/api/vendas/${venda.id}/solicitar-aprovacao`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: p.tipo }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error((d.error as string | undefined) ?? `HTTP ${res.status}`);
      } catch (e) {
        falhas.push(`${p.label}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    await load();
    setUpdating(false);
    if (falhas.length > 0) {
      setSaveErr(
        falhas.length === pedidos.length
          ? `Nenhuma solicitação foi enviada — ${falhas.join(" | ")}`
          : `Enviadas com 1 falha — ${falhas.join(" | ")}`,
      );
    }
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
        body: JSON.stringify({ id: cliente.id, ...editClienteForm, celular: onlyDigits(editClienteForm.celular) }),
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
        body: JSON.stringify({ ...novoClienteForm, celular: onlyDigits(novoClienteForm.celular) }),
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
        // REGRA DE NEGÓCIO (troca de cliente em rascunho — jul/2026):
        // Só mandar cliente_id quando um cliente DE VERDADE está selecionado.
        // O QUÊ: nunca autosalvar cliente_id nulo.
        // POR QUÊ: ao trocar o cliente a consultora primeiro LIMPA o campo (cliente = null)
        //   e só depois busca/escolhe o novo — isso leva mais que os 1,5s do autosave.
        //   Se o autosave disparasse com cliente vazio, mandava cliente_id=null; o backend
        //   faz COALESCE(null, cliente_id) e MANTÉM o cliente antigo, e o reload seguinte
        //   "volta" o cliente antigo no meio da edição (a tela parecia recarregar sozinha
        //   e não deixava trocar). Cliente é obrigatório, então null nunca é um save válido.
        // IMPACTO SE ALTERADO: volta o bug de o campo Cliente resetar/recarregar ao trocar.
        if (cliente?.id && cliente.id !== venda.cliente_id) patch.cliente_id = cliente.id;
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
            // REGRA DE NEGÓCIO: o backend protege contra concorrência comparando
            // client_updated_at com updated_at do banco. Se divergirem, a venda
            // foi alterada por outro usuário/sessão.
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
mensagemBloqueio: (d.error as string | undefined) ?? "Esta alteração precisa de aprovação.",
              });
              setSolicitarMotivo("");
              setSolicitarErro("");
              setSolicitarSucesso(false);
              return;
            }
          }
          throw new Error(d.error ?? `HTTP ${res.status}`);
        }
        // REGRA DE NEGÓCIO: após salvar com sucesso, sincroniza o estado local
        // com o servidor. O updated_at do banco é atualizado a cada write;
        // o frontend precisa do novo valor para o optimistic locking do próximo
        // save (client_updated_at). Sem esta recarga, o próximo save envia
        // o timestamp antigo e recebe erro 409 "modificado por outro usuário".
        // O QUE: recarrega os dados da venda do servidor após save bem-sucedido.
        // POR QUE: o servidor faz updated_at = now() a cada UPDATE e o frontend
        // precisa do valor exato para a checagem de concorrência.
        // IMPACTO SE REMOVIDO: todo segundo save consecutivo falha com 409.
        // silent=true: atualiza o updated_at sem trocar a tela pelo spinner
        // (antes, o autosave "recarregava a pagina sozinha" enquanto digitava).
        await load(true);
      }
      setIsDirty(false);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  // Extrai o nome do campo que o backend bloqueou a partir da mensagem de erro.
  // Backend retorna algo como: `O campo "situacao" só pode ser alterado...`
  function detectarCampoBloqueado(patch: Record<string, unknown>, errorMsg: string | undefined): string | null {
    const ADMIN_ONLY = ["situacao", "cliente_id", "vendedor_id", "data_venda"];
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
    setUpdating(true); setSaveErr(""); setSaveInfo("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: s, client_updated_at: venda.updated_at }),
      });
      // Lê como texto primeiro para evitar crash se resposta não for JSON
      // (ex.: erro de trigger do banco que vira HTML 500).
      const _text = await res.text();
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(_text); } catch { /* corpo não-JSON — usa texto como fallback no throw abaixo */ }

      if (res.status === 409 && typeof d.error === "string" && d.error.includes("Conflito")) {
        setSaveErr("Esta venda foi modificada por outro usuário. Recarregue a página.");
        return;
      }
      // Backend bloqueou troca de situacao por exigir admin — abre modal
      if (res.status === 403 && d.solicitar === true) {
        setSolicitarPayload({
          tipo: "venda_campo",
          campo: "situacao",
          valor_solicitado: s,
          mensagemBloqueio: (d.error as string | undefined) ?? "Esta alteração precisa de aprovação.",
        });
        setSolicitarMotivo("");
        setSolicitarErro("");
        setSolicitarSucesso(false);
        return;
      }
      if (!res.ok) throw new Error((d.error as string | undefined) ?? `HTTP ${res.status}`);
      if (d.precisa_aprovacao_entrega) {
        // REGRA DE NEGOCIO: Automacao de Estoque 2.0 nao marca entregue quando
        // ha saldo aberto; o backend cria tarefa de aprovacao e a baixa de
        // estoque so acontece se o aprovador liberar.
        // IMPACTO SE REMOVIDO: usuario recebe falso erro apesar da solicitacao
        // ter sido criada corretamente e pode repetir a acao sem necessidade.
        setSaveInfo((d.message as string | undefined) ?? "Entrega sem pagamento total enviada para aprovação. O pedido ainda não foi marcado como entregue.");
        await load();
        return;
      }
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
      if (!res.ok) {
        const _errText = await res.text();
        let _errData: Record<string, unknown> = {};
        try { _errData = JSON.parse(_errText); } catch { /* ignora */ }
        throw new Error(((_errData.error as string) ?? _errText.slice(0, 300)) || `HTTP ${res.status}`);
      }
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
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch { data = { error: "Resposta inesperada do servidor. Tente novamente." }; }
      if (!res.ok) throw new Error((data.error as string) ?? "Erro ao sincronizar cliente");
      setClienteSyncMsg("Cliente enviado ao Tiny com sucesso!");
      setVenda(prev => prev ? { ...prev, cliente_id_tiny: (data.tiny_id as number) ?? prev.cliente_id_tiny } : prev);
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

  // ── Frete avulso solicitado a partir da venda (V3) ──────────────────────────
  // REGRA DE NEGÓCIO (BLOCO 3 — fonte única de permissão): quem PODE solicitar
  // (o cargo) vem de podeSolicitarFreteAvulso() (src/lib/permissoes/frete-avulso.ts)
  // — o MESMO predicado usado pelo backend (route.ts) e testado na matriz
  // papel×capacidade. Antes essa lista vivia solta aqui (inline), causando a
  // classe de bug "front libera um papel, backend 403" (ex.: diretor).
  // IMPACTO SE VOLTAR A LISTA INLINE: reabre a divergência front/backend.
  // QUANDO (decisão Jonathan) — isto AQUI continua local, é regra da VENDA,
  // não de cargo: a janela INTEIRA da entrega — 'aprovado' (antes de sair),
  // 'em_rota' (entrega a caminho) e 'entregue'. O QUE: 'entregue' entra de
  // propósito, não é engano. POR QUÊ: existe corrida complementar DEPOIS da
  // entrega — o caso real é "levar a aliança que ficou para ajuste". Cortar em
  // 'em_rota' mataria justamente esse cenário.
  // Fora da lista: 'rascunho' (venda ainda não fechada), 'cancelado' e
  // 'virou_credito' (não há mais entrega a fazer).
  // ⚠️ 'enviado'/'concluido' NÃO entram: são situações APOSENTADAS (ver
  // src/lib/vendas-situacoes.ts) — nenhuma venda transiciona para elas desde
  // 06/2026, o fluxo atual é rascunho → aprovado → em_rota → entregue.
  // IMPACTO SE ALTERADO: tirar 'entregue' esconde o botão no cenário de ajuste
  // pós-entrega; incluir 'rascunho' deixaria pedir frete de venda não fechada.
  const podeSolicitarFreteAvulsoAqui =
    podeSolicitarFreteAvulso(role) &&
    ["aprovado", "em_rota", "entregue"].includes(venda.situacao);
  // REGRA DE NEGÓCIO (migration 355 — endereço estruturado): endereço
  // sugerido para pré-preencher o EnderecoForm do modal de frete avulso —
  // CAMPO A CAMPO (enderecoDaVenda), não mais concatenado num texto único.
  const enderecoInicialFreteAvulso = enderecoDaVenda(venda);

  // REGRA DE NEGÓCIO (12/06 — Jonathan): reposição bloqueia a entrega POR ITEM
  // (ver temItemEntregavel/bloqueioVendaInteira acima, vindos do saldo-pendente):
  // o item da reposição espera, mas os itens prontos podem ser entregues. A regra
  // do botão "Marcar Entrega" usa essas flags.
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

  // Crédito A Receber — usa campo próprio (aprovacao_credito_tarefa_id)
  const temAReceber = venda.pagamentos.some(p => p.forma === "A Receber" && p.status === "pendente");
  // A tarefa de aprovação de crédito termina com status "aprovada" (gerente/diretor
  // aprovou). Tarefas antigas usavam "concluida" — aceitar ambos evita que a venda já
  // aprovada continue exibindo "Solicitar Aprovação" em vez do link do Crediário.
  const creditoTarefaConcluida = ["concluida", "aprovada"].includes(venda.aprovacao_credito_status ?? "");
  const aguardandoAprovacaoCredito = !!venda.aprovacao_credito_tarefa_id && venda.aprovacao_credito_status === "aguardando_aprovacao";
  const creditoFoiAprovado = !!venda.aprovacao_credito_tipo && creditoTarefaConcluida;

  // Porta única do Crediário: numa venda já aprovada, o "A Receber" pendente virou uma
  // conta no Crediário. O recebimento desse saldo acontece SÓ na tela do Crediário — a
  // venda não oferece "completar/adicionar pagamento" pra ele, senão vira recebimento
  // fantasma (venda fica "paga" e a conta a receber some sem baixa).
  const aReceberNoCrediario = temAReceber &&
    ["aprovado", "confirmado", "concluido", "entregue"].includes(venda.situacao);

  // Porta única (parte 2): só rascunho pode ganhar pagamento novo pela tela da venda.
  // Depois de aprovada, pagamento novo entra pelo Crediário (A Receber) ou pelos botões
  // de cobrança da própria linha (Na Entrega, gateway). Some "adicionar/completar pagamento".
  const vendaEmRascunho = venda.situacao === "rascunho";

  // Soma de TODAS as linhas de pagamento (inclusive pendentes/aguardando aprovação).
  // Se já cobrem o total da venda, o pagamento está completo — não faz sentido
  // "adicionar/completar" (ex.: um "A Receber" ainda não confirmado que já bate o total).
  // Ao remover a linha no "x", a soma cai e os botões liberam de novo.
  const totalEmPagamentos = venda.pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const pagamentoCobreTotal = totalEmPagamentos + 0.01 >= venda.total_venda;

  /**
   * REGRA DE NEGÓCIO (17/07, decisão do Jonathan): "crédito aprovado, mas a
   * venda não". Aprovar o crédito e aprovar a venda são 2 passos; o 2º
   * (approveVenda) pode falhar por motivo OPERACIONAL — o clássico é cliente
   * sem celular. Quando falha, a aprovação do crédito CONTINUA valendo (não
   * voltamos a tarefa pra fila: "pedir aprovação é chato") e alguém precisa
   * corrigir o cadastro e aprovar a venda na mão. Sem esta faixa, quem abre a
   * venda não tem como saber disso — o aprovador via 200 "sucesso".
   *
   * DEDUZIDO, não gravado (decisão do Jonathan: sem migration). Os 3 estados se
   * separam sozinhos, porque quando a venda aprova de fato o
   * `aprovacao_credito_tarefa_id` é LIMPO (vendas-credito-aprovar.ts):
   *   - aprovou              → campo NULL          → creditoFoiAprovado=false aqui
   *   - esperando pagamento  → campo preenchido + AINDA há pagamento não-"A
   *     Receber" pendente  → NÃO é falha, não mostra (espera legítima)
   *   - approveVenda falhou  → campo preenchido + todos os outros já confirmados
   * A 3ª condição espelha `todosOutrosConfirmados` da lib (linhas 380-385):
   * COUNT de pagamentos com forma != 'A Receber' e status 'pendente' = 0.
   * IMPACTO SE A REGRA DA LIB MUDAR: a faixa pode aparecer na hora errada — é
   * só um aviso com botão, não trava nada, mas tem que andar junto.
   */
  const outrosPagamentosConfirmados = !venda.pagamentos.some(
    p => p.forma !== "A Receber" && p.status === "pendente",
  );
  const creditoAprovadoVendaNao = creditoFoiAprovado && vendaEmRascunho && outrosPagamentosConfirmados;

  // Desconto acima do limite — usa campo próprio (aprovacao_desconto_tarefa_id)
  const isDescontoApproval = !!venda.aprovacao_desconto_tarefa_id && venda.aprovacao_desconto_status === "aguardando_aprovacao";

  // Cartão de crédito com desconto >20% — usa campo próprio (aprovacao_cartao_desconto_tarefa_id)
  const isCartaoApproval = !!venda.aprovacao_cartao_desconto_tarefa_id && venda.aprovacao_cartao_desconto_status === "aguardando_aprovacao";

  const temPagamentoPendente = venda.pagamentos.some(p => p.status === "pendente");
  const temManualMpPendente = venda.pagamentos.some(p => p.forma === "Manual (MP)" && p.status === "pendente");
  const podeAprovarConcluir = venda.situacao === "aprovado" && temPagamentoPendente;
  const descontoThreshold = venda.descontoThreshold ?? 30;
  const temDescontoAlto = venda.itens.some(i => Number(i.pct_desconto) > descontoThreshold);
  // REGRA DE NEGÓCIO #1: verifica campo próprio de desconto, não de crédito
  const precisaSolicitarDesconto = temDescontoAlto && !venda.desconto_aprovado_por_nome && !venda.aprovacao_desconto_tarefa_id && venda.situacao === "rascunho";
  // REGRA DE NEGÓCIO (Fase 5, fix 16/07): limite do cartão vem da config
  // (limite_desconto_cartao_pct), não mais `const = 20` cravado aqui — a tela
  // ficava dizendo "acima de 20%" mesmo com a config em 30, divergindo do gate
  // real do servidor. Fallback 20 = mesmo default do backend (LIMITE_DESCONTO_CARTAO_PADRAO).
  const LIMITE_DESCONTO_CARTAO = venda.limiteDescontoCartao ?? 20;
  const temDescontoCartao = venda.itens.some(i => Number(i.pct_desconto) > LIMITE_DESCONTO_CARTAO);
  const descontoCartaoAprovado = !!venda.desconto_cartao_aprovado_por_nome;
  const cartaoBloqueado = temDescontoCartao && !descontoCartaoAprovado;
  // REGRA DE NEGÓCIO #1: verifica campo próprio de cartão, não de crédito
  const precisaSolicitarDescontoCartao = cartaoBloqueado && !venda.aprovacao_cartao_desconto_tarefa_id && venda.situacao === "rascunho";
  // REGRA DE NEGÓCIO (16/07): quantas aprovações esta venda ainda precisa pedir.
  // Só com 2+ o atalho "Solicitar todas" faz sentido — com 1 o banner individual
  // já resolve e um botão a mais só polui.
  const aprovacoesPendentes = [precisaSolicitarDesconto, precisaSolicitarDescontoCartao].filter(Boolean).length;
  // REGRA DE NEGOCIO: Automacao de Estoque 2.0.
  // O QUE: badge visual e derivado do backend quando venda entregue ainda tem
  // saldo aberto aprovado por excecao.
  // POR QUE: ao quitar o A Receber, o backend deixa de enviar pendencia e o selo
  // volta automaticamente para Entregue.
  // IMPACTO SE REMOVIDO: equipe perde visibilidade de pedidos entregues sem
  // pagamento total.
  const entregueComPendenciaFinanceira = !!venda.entregue_com_pendencia_financeira;

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
            {/* Venda aprovada mas ainda com pagamento em aberto (ex.: A Receber no
                Crediário). O status segue "Aprovado"; a tag avisa que falta receber. */}
            {venda.situacao === "aprovado" && temPagamentoPendente && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                Pagamento pendente
              </span>
            )}
            {entregueComPendenciaFinanceira && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                Entregue com pendência financeira
              </span>
            )}
            {/* Entrega PARCIAL — mostra que parte já foi entregue (Jonathan 12/06) */}
            {entregaParcialResumo.length > 0 && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: "#DBEAFE", color: "#1E40AF" }}
                title={entregaParcialResumo.map((i) => `${i.nomeProduto}: ${i.qtdEntregue} de ${i.qtdVendida} entregue(s)`).join("\n")}>
                Entrega parcial — falta(m) {faltamEntregar} un.
              </span>
            )}
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
          ) : venda && venda.situacao !== "rascunho" ? (
            // Emitir NFC-e escondido em rascunho: nota fiscal só pode ser emitida de venda firmada
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
          <button onClick={() => load()} disabled={loadingVenda || updating}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40" style={{ color: "#6B7280" }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Banner informativo (aprovacoes pendentes, etc.) ── */}
      {saveInfo && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-start gap-2"
          style={{ backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }}>
          <CheckCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Solicitação registrada</p>
            <p className="text-xs mt-0.5">{saveInfo}</p>
          </div>
          <button onClick={() => setSaveInfo("")} className="shrink-0 p-0.5 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

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
      {aguardandoAprovacaoCredito && (
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

      {/* ── Banner: crédito aprovado, mas a venda não (approveVenda falhou) ──
           Laranja, não amarelo-"aguardando": aqui não há espera — a decisão já
           foi tomada e a bola está com quem abriu a venda. Ver a dedução em
           `creditoAprovadoVendaNao`. */}
      {creditoAprovadoVendaNao && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-2"
          style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#7C2D12" }}>
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm font-medium break-words">
              Crédito aprovado — falta aprovar a venda. A aprovação automática não passou
              (geralmente cadastro do cliente incompleto, ex.: sem celular). Corrija o cadastro
              e aprove a venda.
            </p>
          </div>
        </div>
      )}

      {ordemAbertaMsg && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center gap-2"
          style={{ backgroundColor: "#D1FAE5", borderColor: "#A7F3D0", color: "#065F46" }}>
          <CheckCircle size={16} className="shrink-0" />
          <p className="text-sm font-medium">{ordemAbertaMsg}</p>
        </div>
      )}

      {/* ── Banner: aliança vendida SEM ordem na fábrica ──
          REGRA DE NEGÓCIO (27/07/2026, Jonathan): a ordem de aliança não nasce
          mais junto com a aprovação da venda, porque o cliente muitas vezes
          ainda não sabe o tamanho do dedo e a consultora chutava um aro só pra
          fechar a venda — a fábrica recebia a numeração errada. Agora alguém
          confirma o aro e abre a ordem aqui.
          IMPACTO SE REMOVIDO: a venda pode ficar esquecida sem nunca chegar na
          fábrica — este banner é o que cobra a abertura. */}
      {venda.alianca_sem_ordem && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-3 flex-wrap"
          style={{ backgroundColor: "#FEF3C7", borderColor: "#FDE68A", color: "#92400E" }}>
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={16} className="shrink-0" />
            <p className="text-sm font-medium break-words">
              Aliança sem ordem na fábrica — confirme o aro com o cliente para abrir a ordem.
            </p>
          </div>
          <button onClick={() => setAbrirOrdemAberto(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
            style={{ backgroundColor: C.esmeralda, color: "#fff" }}>
            Confirmar aro e abrir ordem →
          </button>
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
          {venda.aprovacao_desconto_tarefa_id && (
            <a href={`/tarefas/${venda.aprovacao_desconto_tarefa_id}`}
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

      {/* ── Atalho: pedir todas as aprovações de uma vez ──
          Aparece só com 2+ pendentes. Os banners individuais abaixo continuam —
          quem vai receber no Pix pede só o desconto (decisão do Jonathan, 16/07). */}
      {aprovacoesPendentes >= 2 && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-3"
          style={{ backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#5B21B6" }}>
          <p className="text-sm font-medium">
            Esta venda precisa de {aprovacoesPendentes} aprovações. Você pode pedir todas de uma vez ou uma por uma abaixo.
          </p>
          <button onClick={solicitarTodasAprovacoes} disabled={updating}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-50"
            style={{ backgroundColor: "#6D28D9", color: "#fff" }}>
            {updating ? "Enviando..." : `Solicitar todas (${aprovacoesPendentes})`}
          </button>
        </div>
      )}

      {/* ── Banner: desconto >30% sem aprovação solicitada ── */}
      {precisaSolicitarDesconto && (
        <div className="mb-3 px-4 py-3 rounded-lg border flex items-center justify-between gap-3"
          style={{ backgroundColor: "#FFF7ED", borderColor: "#FED7AA", color: "#9A3412" }}>
          <p className="text-sm font-medium">
            Esta venda tem desconto acima de {descontoThreshold}%. É necessário solicitar aprovação do administrador antes de prosseguir.
          </p>
          <button onClick={async () => {
              setUpdating(true); setSaveErr("");
              try {
                const res = await fetch(`/api/vendas/${venda.id}/solicitar-aprovacao`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tipo: "desconto" }),
                });
                const d = await res.json();
        if (!res.ok) throw new Error((d.error as string | undefined) ?? `HTTP ${res.status}`);
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
            Esta venda tem itens com desconto acima de {LIMITE_DESCONTO_CARTAO}%. Para pagar no cartão de crédito, solicite aprovação.
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

      {/* ── Entrega "levou devendo" (crediário ②): solicitar aprovação do SEO ANTES da entrega ── */}
      {venda.entrega_devendo && (venda.situacao === "aprovado" || venda.situacao === "em_rota") && (
        venda.entrega_excecao_status === "aprovado" ? (
          <div className="mb-3 px-4 py-2 rounded-lg border flex items-center gap-2"
            style={{ backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#065F46" }}>
            <CheckCircle size={14} className="shrink-0" />
            <p className="text-xs font-medium">Entrega devendo aprovada — pode entregar normalmente.</p>
          </div>
        ) : venda.entrega_excecao_status === "pendente" ? (
          <div className="mb-3 px-4 py-2 rounded-lg border flex items-center gap-2"
            style={{ backgroundColor: "#EFF6FF", borderColor: "#93C5FD", color: "#1E40AF" }}>
            <CheckCircle size={14} className="shrink-0" />
            <p className="text-xs font-medium">Aprovação de entrega solicitada — aguardando o SEO.</p>
          </div>
        ) : (
          <button
            onClick={handleSolicitarAprovacaoEntrega}
            disabled={solicitandoEntrega}
            className="mb-3 w-full px-4 py-2.5 rounded-lg border flex items-center gap-2 text-left transition-all disabled:opacity-60 hover:brightness-95"
            style={{ backgroundColor: "#FFFBEB", borderColor: "#FCD34D", color: "#92400E" }}
          >
            <CheckCircle size={15} className="shrink-0" />
            <span className="text-sm font-medium">
              {solicitandoEntrega ? "Solicitando..." : "Solicitar aprovação para entregar devendo"}
            </span>
            <span className="ml-auto text-xs opacity-80">peça com antecedência</span>
          </button>
        )
      )}

      {/* ── Solicitar frete avulso (atalho contextual da venda) ──
          REGRA DE NEGÓCIO (decisão do Jonathan, 21/07): a venda deixou de
          acompanhar o STATUS da solicitação (aguardando/liberada/recusada) —
          esse acompanhamento agora é só no módulo Tarefas, que passou a ser o
          lugar único das solicitações. Aqui fica só o atalho: a venda já é
          conhecida, então abrir o modal direto (modoSolicitacao, ver abaixo)
          poupa quem solicita de buscar a venda de novo. Tentar solicitar de
          novo pra uma venda que já tem solicitação em aberto é barrado pelo
          backend (POST /api/entregas-venda/frete-avulso), que devolve
          mensagem clara — não duplicar essa checagem aqui.
          IMPACTO SE REMOVIDO: quem solicita perde o atalho de dentro da
          própria venda e passa a depender só da busca de venda dentro do
          Tarefas. */}
      {podeSolicitarFreteAvulsoAqui && (
        <button
          onClick={() => setShowFreteAvulsoModal(true)}
          className="mb-3 w-full px-4 py-2.5 rounded-lg border flex items-center gap-2 text-left transition-all hover:brightness-95"
          style={{ backgroundColor: "#FAFAF7", borderColor: C.cremeBorder, color: C.esmeralda }}
        >
          <Bike size={15} className="shrink-0" />
          <span className="text-sm font-medium">Solicitar frete avulso</span>
        </button>
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
              {podeTrocarVendedor && edit.full ? (
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
                      <div><Label>Celular (WhatsApp)</Label><Input value={maskCelular(editClienteForm.celular)} placeholder="(85) 99999-9999" inputMode="tel" onChange={e => setEditClienteForm(p => ({ ...p, celular: onlyDigits(e.target.value) }))} /></div>
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
                      <div><span className="text-xs font-medium" style={{ color: "#6B7280" }}>Celular (WhatsApp)</span><p style={{ color: "#1A1A1A" }}>{cliente.celular ? maskCelular(cliente.celular) : "—"}</p></div>
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
                  <div><Label>Celular (WhatsApp)</Label><Input value={maskCelular(novoClienteForm.celular)} placeholder="(85) 99999-9999" inputMode="tel" onChange={e => setNovoClienteForm(p => ({ ...p, celular: onlyDigits(e.target.value) }))} /></div>
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
              {/* Data da venda é fixa: não editável nem em rascunho (decisão Jonathan). */}
              <Input type="date" value={dataVenda} disabled
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
                    {itens.map((item, idx) => {
                      // ── Promoção: o que explica a comissão nesta linha ──────────
                      // Num item em campanha, `preco_lista` é o preço PROMOCIONAL.
                      // O que puxa a faixa é o desconto contra o preço CHEIO. Sem
                      // mostrar isso, a linha fica "lista 599,00 · % Desc — ·
                      // comissão 0,50%" e a consultora abre chamado — com razão,
                      // porque pela tela não existe desconto nenhum.
                      // % Desc continua sendo o desconto de ALÇADA (sobre o promo)
                      // e fica "—" mesmo: promoção é pré-aprovada, não pede
                      // aprovação. Ver docs/regras-negocio/comercial.md §2.1.2.
                      const cheioItem = Number(item.preco_lista_cheio ?? item.preco_lista);
                      const emPromocao = cheioItem > Number(item.preco_lista);
                      return (<Fragment key={item._key}>
                      <tr className="border-t hover:bg-stone-50" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-2 py-2 tabular-nums" style={{ color: "#9CA3AF" }}>{idx + 1}</td>
                        {/* Descrição: nome QUEBRA em até 2 linhas (whitespace-normal + break-words + maxWidth)
                            em vez de esticar a linha. REGRA: nome longo de joia (ex. "Corrente Elo Cartier...")
                            estava com whitespace-nowrap e empurrava as colunas pra fora, e o overflow-hidden
                            do wrapper (linha ~2860) cortava o "Preço total" na direita. IMPACTO se voltar
                            o nowrap: a coluna Total volta a ser cortada em telas/cartão de 1280px. (Jonathan 24/06) */}
                        <td className="px-2 py-2 font-medium whitespace-normal break-words" style={{ color: "#1A1A1A", maxWidth: "220px" }} title={item.nome_produto}>
                          {item.nome_produto}
                          {item.upgrade && (
                            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                              style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
                              Upgrade
                            </span>
                          )}
                          {emPromocao && (
                            <div className="mt-1">
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "#E8F0EC", color: "#184036" }}>
                                promoção{item.promocao_nome ? ` · ${item.promocao_nome}` : ""}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 font-mono" style={{ color: "#6B7280" }}>{item.sku}</td>
                        <td className="px-2 py-2 text-center tabular-nums" style={{ color: "#374151" }}>
                          {edit.limited && item.id ? (
                            <input type="number" min={1} defaultValue={item.quantidade}
                              onBlur={e => handleUpdateItem(item.id!, "quantidade", e.target.value)}
                              className="w-12 border rounded px-1 py-0.5 text-xs text-center outline-none" style={{ borderColor: C.cremeBorder }} />
                          ) : item.quantidade}
                          {/* Quanto deste item já foi entregue (Jonathan 12/06) — na coluna
                              Qtde porque a do nome tem truncate e escondia o badge. */}
                          {(() => {
                            const ent = item.id ? entregaPorItem.get(item.id) : undefined;
                            if (!ent || ent.qtdEntregue <= 0) return null;
                            const completo = ent.saldoPendente <= 0;
                            return (
                              <div className="mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full inline-block whitespace-nowrap"
                                style={{ backgroundColor: completo ? "#D1FAE5" : "#DBEAFE", color: completo ? "#065F46" : "#1E40AF" }}
                                title={`${ent.qtdEntregue} de ${ent.qtdVendida} entregue(s)`}>
                                {completo ? "✓ entregue" : `entregue ${ent.qtdEntregue}/${ent.qtdVendida}`}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-2" style={{ color: "#9CA3AF" }}>{item.unidade ?? "un"}</td>
                        <td className="px-2 py-2 tabular-nums" style={{ color: "#374151" }}>
                          {fmt(item.preco_lista)}
                          {emPromocao && (
                            <div className="text-[10px]" style={{ color: "#9CA3AF" }}>
                              cheio <span style={{ textDecoration: "line-through" }}>{fmt(cheioItem)}</span>
                            </div>
                          )}
                        </td>
                        {(() => {
                          const editandoPreco = localPrecoUn[item.id!] !== undefined;
                          const effPct = editandoPreco
                            ? (() => {
                                const p = parseFloat((localPrecoUn[item.id!] || "0").replace(",", ".")) || 0;
                                return p > 0 && item.preco_lista > 0
                                  ? Math.max(0, Math.round(((item.preco_lista - p) / item.preco_lista) * 10000) / 100)
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
                          // Desconto que decide a FAIXA: contra o preço CHEIO da
                          // campanha, não contra o promocional. É o número que a
                          // consultora precisa ver pra conferir na tabela de faixas.
                          const descComissao = cheioItem > 0
                            ? Math.max(0, Math.round(((cheioItem - effPrecoUn) / cheioItem) * 10000) / 100)
                            : 0;
                          // Ao editar, a prévia usa a MESMA base do servidor. Antes
                          // era getComissao(effPct), que ignora promoção: a tela
                          // mostrava 4,00% e o valor virava 0,50% depois de salvar.
                          const effPctComissao = editandoDesc ? getComissao(descComissao) : item.pct_comissao;
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
                          {emPromocao && (
                            <div className="text-[10px]" style={{ color: "#184036" }}>
                              promo {(((cheioItem - item.preco_lista) / cheioItem) * 100).toFixed(2).replace(".", ",")}%
                            </div>
                          )}
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
                                if (novoPreco > 0) {
                                  // markup: preco acima da lista sem aprovacao → pct = 0
                                  const pct = novoPreco > item.preco_lista
                                    ? 0
                                    : Math.round(((item.preco_lista - novoPreco) / item.preco_lista) * 10000) / 100;
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
                          {emPromocao && (
                            <div className="text-[10px] font-normal" style={{ color: "#9CA3AF" }}>
                              faixa de {descComissao.toFixed(2).replace(".", ",")}%
                            </div>
                          )}
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
                      {item.upgrade && (
                        <tr key={`${item._key}-upgrade`} style={{ backgroundColor: "#F0F7F4" }}>
                          <td colSpan={20} className="px-4 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
                            {/**
                             * REGRA DE NEGOCIO (Produto Upgrade): o ouro do
                             * cliente precisa ficar rastreável na venda antes
                             * de entrar no cofre. O QUE: exibe foto anexada,
                             * peso bruto e peso futuro apos quebra. POR QUE:
                             * a empresa assume responsabilidade pelo metal ao
                             * fechar a venda. IMPACTO SE REMOVIDO: vendedor e
                             * gerente perdem evidência visual e operacional do
                             * ouro recebido.
                             */}
                            <div className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: "#B7E4CF", backgroundColor: "#FFFFFF" }}>
                              <a
                                href={getPublicUrl("pagamento-fotos", item.upgrade.foto_balanca_path)}
                                target="_blank"
                                rel="noreferrer"
                                className="block shrink-0"
                                title="Abrir foto da balança"
                              >
                                <img
                                  src={getPublicUrl("pagamento-fotos", item.upgrade.foto_balanca_path)}
                                  alt="Foto da balança do upgrade"
                                  className="w-24 h-16 object-cover rounded-md border"
                                  style={{ borderColor: C.cremeBorder }}
                                />
                              </a>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>
                                    Rastro do Ouro - Upgrade
                                  </span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: item.upgrade.cofre_registrado ? "#D1FAE5" : "#FEF3C7", color: item.upgrade.cofre_registrado ? "#065F46" : "#92400E" }}>
                                    {item.upgrade.cofre_registrado
                                      ? "Cofre registrado"
                                      : venda?.situacao === "aprovado"
                                        ? "Aguardando registro no cofre"
                                        : "Aguardando aprovação da venda"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <p style={{ color: "#6B7280" }}>Peso bruto recebido</p>
                                    <p className="font-mono font-semibold" style={{ color: "#1A1A1A" }}>{item.upgrade.peso_gramas.toFixed(2)}g</p>
                                  </div>
                                  <div>
                                    <p style={{ color: "#6B7280" }}>Quebra futura</p>
                                    <p className="font-mono font-semibold" style={{ color: "#D97706" }}>{item.upgrade.quebra_percentual.toFixed(2)}%</p>
                                  </div>
                                  <div>
                                    <p style={{ color: "#6B7280" }}>Peso após quebra</p>
                                    <p className="font-mono font-semibold" style={{ color: "#065F46" }}>{item.upgrade.peso_liquido.toFixed(2)}g</p>
                                  </div>
                                  <div>
                                    <p style={{ color: "#6B7280" }}>Valor por grama</p>
                                    <p className="font-mono font-semibold" style={{ color: C.esmeralda }}>{fmt(item.upgrade.valor_por_grama)}/g</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {item.personalizacao?.valor && (
                        <tr key={`${item._key}-pers`} style={{ backgroundColor: "#FFFCF5" }}>
                          <td colSpan={20} className="px-4 py-2 border-t" style={{ borderColor: C.cremeBorder }}>
                            <div className="flex items-center gap-2 flex-wrap pl-3 border-l-2" style={{ borderColor: "#D4A843" }}>
                              {/*
                                REGRA DE NEGOCIO:
                                - O que: para o item SRV-RODIO, o rótulo da personalização deve ser "SKU base".
                                - Por que: no fluxo de ródio, o valor salvo em personalizacao.valor representa o SKU da joia base, não um nome gravado.
                                - Impacto: sem essa distinção, a tela induz erro operacional ao mostrar "Nome a gravar" para um dado técnico de rastreabilidade.
                              */}
                              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>
                                🏷️ {((item.sku ?? "").toUpperCase() === "SRV-RODIO" || /rodio|rhodio/i.test(item.nome_produto)) ? "SKU base" : "Nome a gravar"}
                              </span>
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#FFF8E6", color: "#92400E", letterSpacing: "0.08em" }}>
                                {item.personalizacao.valor.toUpperCase()}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* ALIANÇA: detalhe dos anéis do par (só exibição). Mostra modelo,
                          tamanho/aro e a pedra COM seu valor — deixando claro que a pedra
                          é cobrada (entra no preço do par). Não altera preço/desconto/comissão,
                          que continuam editáveis na linha do item acima. */}
                      {idx === splitAliancaIdx && aliancaRings.length > 0 && (
                        <tr key={`${item._key}-aneis`} style={{ backgroundColor: "#FBFAF7" }}>
                          <td colSpan={20} className="px-4 py-2 border-t" style={{ borderColor: C.cremeBorder }}>
                            <div className="flex flex-col gap-1 pl-3 border-l-2" style={{ borderColor: C.esmeralda }}>
                              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>Anéis do par</span>
                              {aliancaRings.map((r) => (
                                <div key={r.anel} className="text-xs" style={{ color: "#374151" }}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">Anel {r.anel}{r.modelo ? ` — ${r.modelo}` : ""}</span>
                                    <span style={{ color: "#6B7280" }}>{r.tamanho ?? "—"}{r.largura != null ? ` · ${String(r.largura).replace(".", ",")}mm` : ""}</span>
                                  </div>
                                  {r.pedras.length > 0 ? (
                                    // Cada pedra do anel numa linha (tipo · tamanho · lapidação · qtd · quilates · valor)
                                    <div className="mt-0.5 pl-3 flex flex-col gap-0.5 items-start">
                                      {r.pedras.map((p, pi) => (
                                        <span key={pi} className="px-1.5 py-0.5 rounded-full text-[11px]" style={{ backgroundColor: "#EDE9FE", color: "#5B21B6" }}>
                                          💎 {p.tipo ?? "pedra"}{p.tamanho_mm != null ? ` ${String(p.tamanho_mm).replace(".", ",")}mm` : ""}{p.corte ? ` · ${p.corte}` : ""}{p.qtd ? ` · ×${p.qtd}` : ""}{p.ct_total != null ? ` · ${String(p.ct_total).replace(".", ",")}ct` : ""}{p.preco_total_rs != null ? ` · ${fmt(p.preco_total_rs)}` : ""}
                                        </span>
                                      ))}
                                    </div>
                                  ) : r.pedra ? (
                                    <div className="mt-0.5 pl-3">
                                      <span className="px-1.5 py-0.5 rounded-full text-[11px]" style={{ backgroundColor: "#EDE9FE", color: "#5B21B6" }}>
                                        💎 {r.pedra.tipo ?? "pedra"}{r.pedra.tamanho_mm != null ? ` ${String(r.pedra.tamanho_mm).replace(".", ",")}mm` : ""}{r.pedra.qtd ? ` ×${r.pedra.qtd}` : ""}{r.valorPedra != null ? ` · ${fmt(r.valorPedra)}` : ""}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] pl-3" style={{ color: "#9CA3AF" }}>sem pedra</span>
                                  )}
                                </div>
                              ))}
                              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>A pedra está inclusa no preço do par (ouro + pedra).</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>);
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add item panel */}
              {addingItem && edit.limited && (
                <div className="mb-3 p-4 rounded-xl border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium" style={{ color: "#374151" }}>Adicionar produto</p>
                    <button onClick={() => { setAddingItem(false); setProdutoSel(null); setDescontoErr(""); setRodioSkuBase(""); setRodioPreviewValor(null); setRodioErro(""); resetUpgradeState(); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
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
                    onSelect={p => { setProdutoSel(p); setPctDesconto(0); setDescontoErr(""); setRodioSkuBase(""); setRodioPreviewValor(null); setRodioErro(""); void checkUpgradeConfig(p.id); }}
                    selectedLabel={produtoSel ? `${produtoSel.nome} · ${fmt(produtoSel.preco_venda ?? 0)}` : null}
                    onClear={() => { setProdutoSel(null); setDescontoErr(""); setRodioSkuBase(""); setRodioPreviewValor(null); setRodioErro(""); resetUpgradeState(); }}
                  />
                  {produtoSel && (
                    isUpgradeProduto ? (
                      /* Layout para produto upgrade — campos de peso, foto e quebra */
                      <div className="mt-3 space-y-3">
                        <UpgradeItemFields
                          valorPorGrama={upgradeValorPorGrama}
                          quebraPercentual={upgradeQuebraPct}
                          pesoGramas={upgradePesoGramas}
                          onPesoChange={setUpgradePesoGramas}
                          fotoB64={upgradeFotoB64}
                          fotoPreview={upgradeFotoPreview}
                          fotoPath={upgradeFotoPath}
                          uploadingFoto={uploadingUpgradeFoto}
                          onFotoChange={(b64, preview) => {
                            setUpgradeFotoB64(b64);
                            setUpgradeFotoPreview(preview);
                          }}
                          onFotoUpload={handleUpgradeFotoUpload}
                          disabled={false}
                        />
                        {/* Desconto (abaixo dos campos de upgrade) */}
                        {upgradeValorPorGrama > 0 && (
                          <div className="flex items-center gap-3 pt-1">
                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>% Desconto <span style={{ color: "#9CA3AF" }}>(máx {maxDesconto}%)</span></label>
                              <input type="number" min={0} max={maxDesconto} step={1} value={pctDesconto}
                                onChange={e => { const v = Number(e.target.value) || 0; setPctDesconto(v); setDescontoErr(v > maxDesconto ? `Máximo: ${maxDesconto}%` : ""); }}
                                onBlur={e => { if (e.target.value === "") setPctDesconto(0); }}
                                className="w-24 border rounded-lg px-2 py-1.5 text-sm outline-none text-center"
                                style={{ borderColor: descontoErr ? "#EF4444" : C.cremeBorder }} />
                              {descontoErr && <p className="text-[11px] text-red-500 mt-0.5">{descontoErr}</p>}
                            </div>
                            <button onClick={() => void handleAddItem()} disabled={!!descontoErr || pctDesconto > maxDesconto || updating}
                              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
                              style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                              {updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Confirmar
                            </button>
                          </div>
                        )}
                      </div>
                    ) : isServicoRodioProduto(produtoSel) ? (
                      /* Layout inline 5 colunas para servico de rodio (Frente A — 30/05/2026) */
                      <div className="mt-3 space-y-2">
                        {/* Linha 1: SKU base (full width) */}
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>SKU da joia base</label>
                          <input
                            type="text"
                            value={rodioSkuBase}
                            onChange={(e) => { setRodioSkuBase(e.target.value.toUpperCase()); setRodioErro(""); }}
                            placeholder="Ex: AJ1519"
                            className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none"
                            style={{ borderColor: rodioErro ? "#DC2626" : C.cremeBorder }}
                          />
                          {rodioErro && <p className="text-[11px] mt-0.5" style={{ color: "#DC2626" }}>{rodioErro}</p>}
                        </div>
                        {/* Linha 2: Qtd | Desconto | Preview valor automatico | Confirmar */}
                        <div className="grid grid-cols-4 gap-2 items-end">
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
                            <label className="block text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Valor automático</label>
                            <div className="border rounded-lg px-2 py-1.5 text-sm text-center tabular-nums" style={{ borderColor: C.cremeBorder, backgroundColor: "#ECFDF5", color: "#065F46" }}>
                              {rodioPreviewValor != null && !rodioErro
                                ? `${fmt(rodioPreviewValor)} (${Math.round(getPctRodio(produtoSel) * 100)}%)`
                                : rodioValidando ? "Calculando..." : "—"}
                            </div>
                          </div>
                          <button onClick={() => void handleAddItem()}
                            disabled={rodioValidando || !!descontoErr || pctDesconto > maxDesconto || updating}
                            className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
                            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                            {rodioValidando || updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Confirmar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Layout padrao 4 colunas para produtos normais (sem alteracao) */
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
                        <button onClick={() => void handleAddItem()} disabled={!!descontoErr || pctDesconto > maxDesconto || updating}
                          className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                          {updating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Confirmar
                        </button>
                      </div>
                    )
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
                      <td className="px-3 py-2.5 max-w-[180px] truncate" style={{ color: "#1A1A1A" }}>
                        {item.nome_produto}
                        {item.upgrade && (
                          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                            style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
                            Upgrade
                          </span>
                        )}
                      </td>
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
                const isNaEntrega = pag.forma === "Na Entrega";
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
                        {/* Ouro: peso + grama + foto */}
                        {pag.ouro_foto_path && (
                          <div className="mt-1.5 flex items-start gap-2">
                            <a
                              href={getPublicUrl("pagamento-fotos", pag.ouro_foto_path)}
                              target="_blank" rel="noreferrer"
                              className="shrink-0"
                            >
                              <img
                                src={getPublicUrl("pagamento-fotos", pag.ouro_foto_path)}
                                alt="Balança ouro"
                                className="h-12 rounded object-cover border"
                                style={{ borderColor: C.cremeBorder, maxWidth: 80 }}
                              />
                            </a>
                            <div className="text-[11px]" style={{ color: "#6B7280" }}>
                              {pag.ouro_peso != null && <span>{Number(pag.ouro_peso).toFixed(3)}g</span>}
                              {pag.ouro_valor_grama != null && <span> × R$ {Number(pag.ouro_valor_grama).toFixed(2)}/g</span>}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Badge de status */}
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: sc.bg, color: sc.text }}>{PAG_STATUS_LABEL[pag.status] ?? pag.status}</span>
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
                            href={`/crediario?venda=${venda.id}`}
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

                        {/* Na Entrega pendente → cobrar com a forma real (Etapa 4) */}
                        {isNaEntrega && pag.status === "pendente" &&
                          (isFullAccess || ["gerente_loja", "diretor", "consultora"].includes(role)) && (
                          cobrarPagId === pag.id ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {["Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito"].map(f => (
                                <button key={f} onClick={() => cobrarEntrega(f)} disabled={updating}
                                  className="text-[11px] px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                                  {f}
                                </button>
                              ))}
                              <button onClick={() => setCobrarPagId(null)} disabled={updating}
                                className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "#9CA3AF" }}>
                                cancelar
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => { setCobrarPagId(pag.id); setSaveErr(""); }} disabled={updating}
                              className="text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-50"
                              style={{ backgroundColor: "#D97706", color: "#fff" }}>
                              Cobrar na entrega
                            </button>
                          )
                        )}

                        {/* Outros pagamentos pendentes → confirmar manual */}
                        {!isAReceber && !isNaEntrega && pag.forma !== "Manual (MP)" && !isPix && !isCartao && pag.status === "pendente" &&
                          (isFullAccess || ["gerente_loja", "diretor"].includes(role)) && (
                          <button onClick={() => confirmarPagamento(pag.id, pag.forma)} disabled={updating}
                            className="text-xs px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                            Confirmar
                          </button>
                        )}

                        {/* Remover (x) só em rascunho. Nunca remove A Receber com crédito
                            aprovado (vira conta no Crediário — pagamento só por lá). Depois
                            de aprovada, nada na venda é mexido. */}
                        {edit.pagamento && pag.status === "pendente" && vendaEmRascunho && !creditoAprovado && (
                          <button onClick={() => handleRemovePagamento(pag.id)} disabled={updating}
                            className="text-gray-300 hover:text-red-400 disabled:opacity-40"><X size={13} /></button>
                        )}
                      </div>
                    </div>

                    {/* A Receber — fluxo de recebimento inline */}
                    {/* REGRA DE OURO #3: o seletor de forma preenche o campo 'gateway'
                       do pagamento_venda, que é renderizado como "via {gateway}" abaixo
                       (linha ~2633). Sem isso, o card mostra só "A Receber" sem indicar
                       como foi pago. Ver AGENTS.md. */}
                    {isAReceber && pag.status === "pendente" && recebimentoPagId === pag.id && (
                      <div className="px-3 pb-3 pt-2 border-t space-y-2" style={{ borderColor: C.cremeBorder }}>
                        {recebimentoMsg && (
                          <p className="text-xs font-medium" style={{ color: recebimentoMsg.ok ? "#059669" : "#DC2626" }}>
                            {recebimentoMsg.text}
                          </p>
                        )}
                        {recebimentoTipo === null && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500">Como foi pago?</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(["Dinheiro", "Cartão de Crédito", "Pix", "Ouro", "Vale-Troca", "Manual (MP)"] as const).map(f => (
                                <button
                                  key={f}
                              onClick={() => {
                                setRecebimentoTipo(f);
                                setRecebimentoMsg(null);
                                if (f === "Manual (MP)") {
                                  setRecebimentoMpId("");
                                } else {
                                  setRecebimentoValor(pag.valor.toFixed(2).replace(".", ","));
                                }
                              }}
                                  className="text-xs px-3 py-1.5 rounded-lg font-medium border text-left"
                                  style={{
                                    borderColor: f === "Manual (MP)" ? "#0070E0" : C.cremeBorder,
                                    color: f === "Manual (MP)" ? "#0070E0" : C.esmeralda,
                                  }}>
                                  {f}
                                </button>
                              ))}
                            </div>
                            <button onClick={() => setRecebimentoPagId(null)} className="text-gray-400 hover:text-gray-600">
                              <X size={13} />
                            </button>
                          </div>
                        )}

                        {/* Manual (MP) → ID + verificação */}
                        {recebimentoTipo === "Manual (MP)" && (
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

                        {/* Demais formas → valor + confirmação (+ Ouro: peso/grama/foto) */}
                        {recebimentoTipo && recebimentoTipo !== "Manual (MP)" && (
                          <div className="space-y-2">
                            {/* Valor */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Valor pago:</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={recebimentoTipo === "Ouro"
                                  ? ((() => {
                                      const p = parseFloat(recOuroPeso.replace(",", "."));
                                      const g = parseFloat(recOuroValorGrama.replace(",", "."));
                                      return p > 0 && g > 0 ? (p * g).toFixed(2).replace(".", ",") : "";
                                    })())
                                  : recebimentoValor}
                                onChange={e => setRecebimentoValor(e.target.value)}
                                placeholder={pag.valor.toFixed(2).replace(".", ",")}
                                readOnly={recebimentoTipo === "Ouro"}
                                className="w-28 text-xs font-mono font-semibold border rounded-lg px-2 py-1 outline-none"
                                style={{
                                  borderColor: C.cremeBorder,
                                  color: C.esmeralda,
                                  background: recebimentoTipo === "Ouro" ? "#f5f5f5" : "#fff",
                                }}
                              />
                              <span className="text-xs text-gray-400">de R$ {pag.valor.toFixed(2).replace(".", ",")}</span>
                            </div>

                        {/* Ouro: peso + grama + foto */}
                        {/* REGRA DE OURO #4 e #5: foto do ouro com thumbnail clicável,
                           usando getPublicUrl("pagamento-fotos", path) via proxy.
                           Exibe peso (3 casas) e valor/grama (2 casas).
                           Só aparece se ouro_foto_path não for nulo. */}
                            {recebimentoTipo === "Ouro" && (
                              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: C.cremeBorder }}>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <div className="text-[11px] text-gray-500 mb-0.5">Peso (g)</div>
                                    <input type="number" step="0.001" value={recOuroPeso}
                                      onChange={e => setRecOuroPeso(e.target.value)}
                                      placeholder="0.000"
                                      className="w-full text-xs border rounded-lg px-2 py-1 outline-none"
                                      style={{ borderColor: C.cremeBorder }} />
                                  </div>
                                  <div>
                                    <div className="text-[11px] text-gray-500 mb-0.5">Valor grama (R$)</div>
                                    <input type="number" step="0.01" value={recOuroValorGrama}
                                      onChange={e => setRecOuroValorGrama(e.target.value)}
                                      placeholder="0.00"
                                      className="w-full text-xs border rounded-lg px-2 py-1 outline-none"
                                      style={{ borderColor: C.cremeBorder }} />
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-gray-500 mb-0.5">Foto da balança</div>
                                  <input type="file" accept="image/*" capture="environment"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setRecOuroFotoFile(file);
                                      setRecOuroFotoPreview(URL.createObjectURL(file));
                                    }}
                                    className="w-full text-xs" />
                                  {recOuroFotoPreview && (
                                    <img src={recOuroFotoPreview} alt="Balança"
                                      className="mt-1 h-16 rounded object-cover" />
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleRegistrarRecebimento}
                                disabled={recebimentoLoading || recOuroUploading}
                                className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                                {recebimentoLoading || recOuroUploading
                                  ? <Loader2 size={12} className="animate-spin inline" />
                                  : "Confirmar"}
                              </button>
                              <button onClick={() => {
                                setRecebimentoTipo(null);
                                setRecebimentoValor("");
                                setRecOuroPeso(""); setRecOuroValorGrama("");
                                setRecOuroFotoFile(null); setRecOuroFotoPreview(null);
                              }} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                            </div>
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

                    {/* Pix inline MP — usa gateway salvo no pagamento, ou fallback newPagGateway */}
                    {isPix && pag.status === "pendente" && (
                      pag.gateway
                        ? pag.gateway.includes("Mercado Pago")
                        : newPagGateway === "Mercado Pago"
                    ) && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: C.cremeBorder }}>
                        <PixQrInline
                          vendaId={venda.id}
                          numeroVenda={venda.numero_venda}
                          valor={pag.valor}
                          endpoint="criar-pix-instore"
                          pagamentoId={pag.id}
                          onPagamentoConfirmado={() => load()}
                        />
                      </div>
                    )}
                    {/* Pix inline PagBank — usa gateway salvo no pagamento, ou fallback newPagGateway */}
                    {isPix && pag.status === "pendente" && (
                      pag.gateway
                        ? pag.gateway.includes("PagBank")
                        : newPagGateway === "PagBank"
                    ) && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: C.cremeBorder }}>
                        <PagBankQrInline
                          vendaId={venda.id}
                          numeroVenda={venda.numero_venda}
                          valor={pag.valor}
                          pagamentoId={pag.id}
                          onPagamentoConfirmado={() => load()}
                        />
                      </div>
                    )}

                    {/* Cartão de Crédito inline MP — usa gateway salvo no pagamento, ou fallback newPagGateway */}
                    {isCartao && pag.status === "pendente" && (
                      pag.gateway
                        ? pag.gateway.includes("Mercado Pago")
                        : newPagGateway === "Mercado Pago"
                    ) && (
                      <div className="px-3 pb-3 border-t" style={{ borderColor: C.cremeBorder }}>
                        {cartaoBloqueado ? (
                          <div className="flex items-start gap-2 p-3 rounded-lg"
                            style={{ backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}>
                            <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: "#9A3412" }} />
                            <div className="text-xs" style={{ color: "#9A3412" }}>
                              <p className="font-medium">Cartão de crédito bloqueado</p>
                              <p>Este pedido possui itens com desconto acima de {LIMITE_DESCONTO_CARTAO}%. Aguarde aprovação para pagar no cartão.</p>
                            </div>
                          </div>
                        ) : (
                          <CartaoInline
                            vendaId={venda.id}
                            numeroVenda={venda.numero_venda}
                            valor={pag.valor}
                            installments={pag.parcelas || 1}
                            pagamentoId={pag.id}
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
                    {edit.pagamento && !addingPag && vendaEmRascunho && !pagamentoCobreTotal && (
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
                    {/* Porta única: saldo "A Receber" de venda aprovada só recebe no Crediário */}
                    {aReceberNoCrediario && (
                      <a href={`/crediario?venda=${venda.id}`}
                        className="w-full mt-1 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-1"
                        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, color: C.esmeralda, textDecoration: "none" }}>
                        Receber este saldo no Crediário →
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Cobrança gateway (link online + maquininha) ── */}
          {/* Esconde quando as linhas de pagamento já cobrem o total (ex.: A Receber
              pendente que preenche o saldo): não faz sentido "cobrar" de novo — esse
              saldo é recebido pela tela do Crediário. Espelha o gate do botão
              "Completar pagamento" e a trava do banco (migration 333/335). */}
          {!pagamentoCobreTotal && newPagGateway === "Mercado Pago" && (
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
                  if (d.situacao === "concluido") return true;
                  const temMpConfirmado = (d.pagamentos ?? []).some(
                    p => (p.gateway === "Mercado Pago Online" || p.gateway === "Mercado Pago Point")
                      && p.status === "confirmado"
                  );
                  return temMpConfirmado;
                },
              }}
            />
          )}
          {!pagamentoCobreTotal && newPagGateway === "PagBank" && (
            <PagBankCobranca
              vendaId={venda.id}
              numeroVenda={venda.numero_venda}
              valorSugerido={Math.max(0, venda.total_venda - venda.total_pago)}
              situacao={venda.situacao}
              bloqueado={venda.bloqueado}
              onPagamentoConfirmado={load}
            />
          )}

          {/* ── Formulário de pagamento padronizado ── */}
          {edit.pagamento && (() => {
            const saldoPendente = Math.max(0, totalVenda - (venda?.total_pago ?? 0));

            // Painel de parcelamento do crediário: aparece quando a forma é "A Receber".
            // valorBase = o que está sendo lançado a prazo (valor digitado ou o saldo).
            // Cobre A Receber sozinho E A Receber parcial (depois de outros pagamentos).
            const mostrarCrediDet = newPagForma === "A Receber";
            // valorBase do preview = soma das linhas "A Receber" já adicionadas; se ainda não
            // tem nenhuma, usa o que está sendo digitado no multi-forma (ou o saldo).
            const aReceberNasLinhasDet = edicaoPayments.filter(p => p.forma === "A Receber").reduce((s, p) => s + p.valor, 0);
            const crediValorBaseDet = aReceberNasLinhasDet > 0
              ? aReceberNasLinhasDet
              : (parseFloat((multPagValor || "").replace(",", ".")) || saldoPendente);
            const crediPreviewDet = mostrarCrediDet
              ? calcularCrediPreview({ tipo: crediTipo, valorBase: crediValorBaseDet, parcelas: crediParcelas, diaVenc: crediDiaVenc, dias: crediDias })
              : [];

            // Função de add pagamento (modo edição: salva imediato)
            // Aceita valor opcional — útil quando chamado do Múltiplas (usa multValor)
            const handleEdicaoAdd = async (valorManual?: string) => {
              if (!venda) return;
              setUpdating(true);
              setSaveErr(""); // limpa erro de tentativa anterior (ex.: "codigo incorreto" do meio)
              try {
                const v = valorManual ? parseFloat(valorManual.replace(",", ".")) : parseFloat(newPagValor.replace(",", ".")) || saldoPendente;
                if (!v || v <= 0) return;
                // No multi-forma (Múltiplas OU A Receber) a forma da LINHA vem do seletor interno
                // (multPagForma); na forma única, vem da forma de recebimento (newPagForma).
                const ehMulti = newPagForma === "Múltiplas" || newPagForma === "A Receber";
                const formaLinha = ehMulti ? multPagForma : newPagForma;
                // A Receber: nº de parcelas vem do plano mensal (igual wizard); demais formas
                // usam a condição de parcelamento normal.
                const parcelas = formaLinha === "A Receber"
                  ? (crediTipo === "meses" ? Math.max(1, crediParcelas) : 1)
                  : (newPagCondicao === "À vista" ? 1 : parseInt(newPagCondicao) || 1);
                const body: Record<string, unknown> = { forma: formaLinha, valor: v, parcelas };
                if (formaLinha === "Cartão de Crédito" || formaLinha === "Pix") body.gateway = newPagGateway;
                if (formaLinha === "A Receber") {
                  // Plano de parcelamento do crediário (migrations 317/318). Mesmo mapeamento
                  // do wizard: 'meses'→dia do vencimento; 'dias'→nº de dias.
                  body.credi_tipo = crediTipo;
                  body.credi_param = crediTipo === "meses" ? crediDiaVenc : crediTipo === "dias" ? crediDias : null;
                }
                if (formaLinha === "Vale-Troca") {
                  // Promocional (sem dono) aplica direto. Vale COM dono passa pelo painel
                  // ValeCodigoInline (onAplicarVale=aplicarValeSingleComCodigo) — nao cai aqui.
                  body.vale_numero = valeNumero.trim();
                }
                if (formaLinha === "Ouro") {
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

            // POST de um pagamento Vale-Troca no detalhe (registra na hora). codigo
            // presente = vale COM dono (2a confirmacao); ausente = promocional.
            const postPagamentoVale = async (valeNum: string, valor: number, codigo?: string) => {
              if (!venda) return;
              const body: Record<string, unknown> = { forma: "Vale-Troca", valor, parcelas: 1, vale_numero: valeNum };
              if (codigo) body.vale_codigo = codigo;
              const res = await fetch(`/api/vendas/${venda.id}/pagamentos`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
              await load();
            };

            // Múltiplas PROMOCIONAL (sem dono): plain "Adicionar" — erro vai pro banner.
            const aplicarValeMultPromo = async (valeNum: string, valor: number) => {
              setUpdating(true); setSaveErr("");
              try { await postPagamentoVale(valeNum, valor); }
              catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao aplicar vale-troca"); }
              finally { setUpdating(false); }
            };

            // Múltiplas COM dono: chamado pelo painel — RELANCA o erro pra aparecer inline no painel.
            const aplicarValeMultComCodigo = async (valeNum: string, valor: number, codigo: string) => {
              setUpdating(true); setSaveErr("");
              try { await postPagamentoVale(valeNum, valor, codigo); }
              finally { setUpdating(false); }
            };

            // Single COM dono: chamado pelo painel — RELANCA o erro pra aparecer inline no painel.
            const aplicarValeSingleComCodigo = async (valeNum: string, codigo: string) => {
              setUpdating(true); setSaveErr("");
              try {
                const valor = parseFloat((newPagValor || "").replace(",", ".")) || saldoPendente;
                await postPagamentoVale(valeNum, valor, codigo);
                setNewPagValor(""); setValeNumero(""); setValeValidacao(null); setAddingPag(false);
              } finally { setUpdating(false); }
            };

            return venda.pagamentos.length === 0 ? (
              // Sem pagamentos: formulário completo padronizado
              <div className="mt-2">
                <PagamentoForm
                  totalVenda={totalVenda}
                  vendaId={venda.id}
                  numeroVenda={venda.numero_venda}
                  mode="edicao"
                  role={role}
                  gateways={gateways.length > 0 ? gateways : [{ id: 1, nome: "Mercado Pago" }, { id: 2, nome: "PagBank" }]}
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
                  handleAddValeMultipla={aplicarValeMultPromo}
                  onAplicarMultVale={aplicarValeMultComCodigo}
                  onAplicarVale={aplicarValeSingleComCodigo}
                  onPaymentSaved={load}
                  cartaoBloqueado={cartaoBloqueado}
                  limiteDescontoCartao={LIMITE_DESCONTO_CARTAO}
                  onSolicitarAprovacaoCartao={solicitarAprovacaoCartao}
                  solicitandoAprovacaoCartao={updating}
                />
                {mostrarCrediDet && (
                  <div className="mt-3">
                    <PainelCrediario
                      tipo={crediTipo} setTipo={setCrediTipo}
                      parcelas={crediParcelas} setParcelas={setCrediParcelas}
                      diaVenc={crediDiaVenc} setDiaVenc={setCrediDiaVenc}
                      dias={crediDias} setDias={setCrediDias}
                      preview={crediPreviewDet}
                    />
                  </div>
                )}
              </div>
            ) : (
              // Já tem pagamentos: botão + formulário colapsável padronizado
              <>
                {(aReceberNoCrediario || !vendaEmRascunho || pagamentoCobreTotal) ? null : !addingPag ? (
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
                      role={role}
                      gateways={gateways.length > 0 ? gateways : [{ id: 1, nome: "Mercado Pago" }, { id: 2, nome: "PagBank" }]}
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
      if (!res.ok) {
        const _errText = await res.text();
        let _errData: Record<string, unknown> = {};
        try { _errData = JSON.parse(_errText); } catch { /* ignora */ }
        throw new Error(((_errData.error as string) ?? _errText.slice(0, 300)) || `HTTP ${res.status}`);
      }
                          await load();
                          setMultOuroPeso(""); setMultOuroValorGrama(""); setMultOuroFotoFile(null); setMultOuroFotoPreview(null); setMultOuroValidacaoIA(null);
                        } catch (e) { setSaveErr(e instanceof Error ? e.message : "Erro ao registrar pagamento em ouro"); }
                        finally { setUpdating(false); }
                      }}
                      handleAddValeMultipla={aplicarValeMultPromo}
                      onAplicarMultVale={aplicarValeMultComCodigo}
                      onAplicarVale={aplicarValeSingleComCodigo}
                      onPaymentSaved={() => { load(); setAddingPag(false); }}
                      cartaoBloqueado={cartaoBloqueado}
                      limiteDescontoCartao={LIMITE_DESCONTO_CARTAO}
                      onSolicitarAprovacaoCartao={solicitarAprovacaoCartao}
                      solicitandoAprovacaoCartao={updating}
                    />
                    {mostrarCrediDet && (
                      <div className="mt-3">
                        <PainelCrediario
                          tipo={crediTipo} setTipo={setCrediTipo}
                          parcelas={crediParcelas} setParcelas={setCrediParcelas}
                          diaVenc={crediDiaVenc} setDiaVenc={setCrediDiaVenc}
                          dias={crediDias} setDias={setCrediDias}
                          preview={crediPreviewDet}
                        />
                      </div>
                    )}
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
        {((venda.ordens && venda.ordens.length > 0) || venda.alianca_sem_ordem) && (
          <Secao>
            <STitle>Ordens Vinculadas</STitle>
            {/* Aliança sem ordem: a pendência aparece AQUI também, no lugar onde
                quem procura a ordem vai olhar primeiro. */}
            {venda.alianca_sem_ordem && (
              <div className="mb-2 p-3 rounded-lg border flex items-center justify-between gap-3 flex-wrap"
                style={{ backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Factory size={16} style={{ color: "#92400E" }} className="shrink-0" />
                  <p className="text-sm break-words" style={{ color: "#92400E" }}>
                    Nenhuma ordem aberta. A aliança só vai para a fábrica depois que o aro for confirmado.
                  </p>
                </div>
                <button onClick={() => setAbrirOrdemAberto(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
                  style={{ backgroundColor: C.esmeralda, color: "#fff" }}>
                  Confirmar aro e abrir ordem →
                </button>
              </div>
            )}
            <div className="space-y-2">
              {(venda.ordens ?? []).map(ord => {
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
            {/* REGRA DE NEGÓCIO: botão Marcar Entrega — substitui o antigo "Marcar Entregue".
                Abre o modal de entrega parcial/total com códigos de verificação.
                Visível apenas quando a venda já foi enviada, seguindo o fluxo:
                rascunho → aprovado (Salvar/Marcar Enviado) → enviado (Marcar Entrega). */}
            {["aprovado", "enviado", "em_rota"].includes(venda.situacao) && (
              <button
                onClick={() => {
                  // Reposição POR ITEM: só bloqueia se NÃO há nenhum item pronto.
                  // Tendo item entregável, abre o modal (o item da reposição é
                  // filtrado lá e no backend).
                  if (bloqueioVendaInteira) {
                    setSaveErr("Venda com reposição aberta sem item identificado. Conclua ou cancele a reposição antes de entregar.");
                    return;
                  }
                  if (!temItemEntregavel && itemReposicaoBloqueado) {
                    setSaveErr("Os itens pendentes aguardam reposição. Conclua a reposição para entregá-los.");
                    return;
                  }
                  setShowMarcarEntrega(true);
                }}
                disabled={bloqueioVendaInteira || (saldoEntrega.length > 0 && !temItemEntregavel)}
                title={itemReposicaoBloqueado ? `O item "${itemReposicaoBloqueado.nomeProduto}" aguarda reposição — os prontos podem ser entregues` : undefined}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                <PackageCheck size={16} />
                Marcar Entrega
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
    {/* REGRA DE NEGÓCIO: Modal de Marcar Entrega — exibido ao clicar no botão da barra de ações.
     * Recebe os itens da venda para cálculo de saldo pendente de cada item.
     * Ao fechar, reseta o estado showMarcarEntrega.
     * Ao concluir com sucesso, fecha o modal e recarrega os dados da venda. */}
    {showMarcarEntrega && venda && (
      <MarcarEntregaModal
        vendaId={venda.id}
        vendaItems={(venda.itens || []).map((item) => ({
          id: item.id,
          nomeProduto: item.nome_produto || "",
          sku: item.sku || "",
          quantidade: item.quantidade,
        }))}
        isOpen={showMarcarEntrega}
        onClose={() => setShowMarcarEntrega(false)}
        formaEnvioVenda={venda.forma_envio}
        onSuccess={(_entrega: unknown) => {
          setShowMarcarEntrega(false);
          load();
        }}
      />
    )}
    {/* REGRA DE NEGÓCIO (atalho contextual — ver comentário do botão acima):
     * Modal de Solicitar Frete Avulso aberto com a venda já definida.
     * vendaId fixo esconde o buscador de venda do modal; enderecoInicial
     * pré-preenche o textarea editável. Não recarrega mais a venda ao
     * solicitar (onSolicitado) — desde que o acompanhamento de status saiu
     * da tela da venda (passou pro Tarefas), não há mais nada aqui que
     * dependa desse refresh. */}
    {showFreteAvulsoModal && venda && (
      <FreteAvulsoModal
        isOpen={showFreteAvulsoModal}
        onClose={() => setShowFreteAvulsoModal(false)}
        onCriado={() => setShowFreteAvulsoModal(false)}
        modoSolicitacao
        vendaId={venda.id}
        enderecoInicial={enderecoInicialFreteAvulso}
      />
    )}
    {/* Confirmação do aro antes de a ordem de aliança ir para a fábrica. */}
    {abrirOrdemAberto && venda && (
      <AbrirOrdemAliancaModal
        vendaId={venda.id}
        onClose={() => setAbrirOrdemAberto(false)}
        onSucesso={(numeroOrdem) => {
          setAbrirOrdemAberto(false);
          setOrdemAbertaMsg(`Ordem ${numeroOrdem} aberta para a fábrica.`);
          load();
        }}
      />
    )}
    </>
  );
}
