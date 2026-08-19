"use client";

import {
  Plus, X, Loader2, CheckCircle, XCircle, AlertCircle, Ticket,
} from "lucide-react";
import CartaoInline from "@/components/vendas/CartaoInline";
import PixQrInline from "@/components/vendas/PixQrInline";
import PagBankCobranca from "@/components/vendas/PagBankCobranca";
import PagBankQrInline from "@/components/vendas/PagBankQrInline";
// REGRA DE NEGOCIO: painel embutido da 2a confirmacao do vale (codigo WhatsApp, brecha #1).
import ValeCodigoInline from "@/components/vendas/ValeCodigoInline";
// Formas que contam como cartão pro gate de desconto (fonte única, espelha o servidor).
import { ehFormaCartao } from "@/lib/desconto/precificar-item";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PagamentoEntry {
  _key: string;
  forma: string;
  valor: number;
  parcelas: number;
  vale_numero?: string;
  db_id?: number;
  ouro_peso?: number;
  ouro_valor_grama?: number;
  ouro_foto_file?: File;
  ouro_foto_path?: string;
}

export type ValidarOuroIAFn = (
  file: File,
  peso: number,
  setResult: (r: { match: boolean; mensagem: string } | null) => void,
  setLoading: (v: boolean) => void
) => Promise<void>;

export type ValidarValeFn = (
  numero: string,
  setResult: (r: { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null) => void,
  setLoading: (v: boolean) => void
) => Promise<void>;

export type UploadOuroFotoFn = (file: File, vendaId: number) => Promise<string | null>;

export interface PagamentoFormProps {
  // Core
  totalVenda: number;
  vendaId: number | null;
  numeroVenda: string;

  // Mode
  mode: "criacao" | "edicao";

  // Gateways (from API)
  gateways: { id: number; nome: string }[];

  // ── Payment form state (controlled) ────────────────────────────────────────
  pagForma: string;
  setPagForma: (v: string) => void;
  pagGateway: string;
  setPagGateway: (v: string) => void;
  pagCondicao: string;
  setPagCondicao: (v: string) => void;

  // Múltiplas state
  payments: PagamentoEntry[];
  setPayments: (p: PagamentoEntry[]) => void;
  multForma: string;
  setMultForma: (v: string) => void;
  multParcelas: number;
  setMultParcelas: (v: number) => void;
  multValor: string;
  setMultValor: (v: string) => void;

  // Vale-Troca state
  valeNumero: string;
  setValeNumero: (v: string) => void;
  valeValidando: boolean;
  setValeValidando: (v: boolean) => void;
  valeValidacao: { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null;
  setValeValidacao: (v: { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null) => void;

  // Vale-Troca múltiplas state
  multValeNumero: string;
  setMultValeNumero: (v: string) => void;
  multValeValidando: boolean;
  setMultValeValidando: (v: boolean) => void;
  multValeValidacao: { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null;
  setMultValeValidacao: (v: { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null) => void;

  // Ouro single state
  ouroPeso: string;
  setOuroPeso: (v: string) => void;
  ouroValorGrama: string;
  setOuroValorGrama: (v: string) => void;
  ouroFotoFile: File | null;
  setOuroFotoFile: (v: File | null) => void;
  ouroFotoPreview: string | null;
  setOuroFotoPreview: (v: string | null) => void;
  ouroValidacaoIA: { match: boolean; mensagem: string } | null;
  setOuroValidacaoIA: (v: { match: boolean; mensagem: string } | null) => void;
  ouroValidando: boolean;
  setOuroValidando: (v: boolean) => void;

  // Ouro múltiplas state
  multOuroPeso: string;
  setMultOuroPeso: (v: string) => void;
  multOuroValorGrama: string;
  setMultOuroValorGrama: (v: string) => void;
  multOuroFotoFile: File | null;
  setMultOuroFotoFile: (v: File | null) => void;
  multOuroFotoPreview: string | null;
  setMultOuroFotoPreview: (v: string | null) => void;
  multOuroValidacaoIA: { match: boolean; mensagem: string } | null;
  setMultOuroValidacaoIA: (v: { match: boolean; mensagem: string } | null) => void;
  multOuroValidando: boolean;
  setMultOuroValidando: (v: boolean) => void;

  // Manual (MP) state
  mpManualId: string;
  setMpManualId: (v: string) => void;
  mpManualLoading: boolean;
  setMpManualLoading: (v: boolean) => void;
  mpManualMsg: { text: string; ok: boolean } | null;
  setMpManualMsg: (v: { text: string; ok: boolean } | null) => void;

  // Valor do formulário simples (não-Múltiplas) — usado em mode="edicao"
  pagFormValor: string;
  setPagFormValor: (v: string) => void;

  // Saving state
  saving: boolean;

  // ── Functions ──────────────────────────────────────────────────────────────
  validarOuroIA: ValidarOuroIAFn;
  validarValeTroca: ValidarValeFn;
  handleAddPagamento: (valorManual?: string) => void;
  handleRemovePagamento: (p: PagamentoEntry) => void;
  handleMpManual: () => void;
  handleAddMultOuro: () => void;
  /**
   * Registro IMEDIATO de Vale-Troca dentro de Múltiplas (modo edicao/detalhe).
   * Quando fornecida, o botao "Adicionar" do vale em Múltiplas registra na hora
   * (igual ao Ouro), passando pela 2a confirmacao do dono (token WhatsApp).
   * Quando AUSENTE (nova venda), o vale apenas entra na lista `payments` e e
   * aplicado no "Concluir venda" — comportamento original, NAO mexer.
   */
  handleAddValeMultipla?: (valeNumero: string, valor: number) => void;
  /**
   * Aplicar vale-troca COM dono via codigo (painel ValeCodigoInline) — fluxo SINGLE.
   * Recebe o numero do vale e o codigo confirmado pelo dono. Detalhe: faz o POST.
   * Nova venda: guarda o codigo (aplica no Concluir). So renderiza para vale com
   * dono (valeValidacao.cliente_id != null); promocional usa o botao normal.
   */
  onAplicarVale?: (valeNumero: string, codigo: string) => Promise<void> | void;
  /** Igual ao onAplicarVale, porem para o fluxo MULTIPLAS (recebe tambem o valor). */
  onAplicarMultVale?: (valeNumero: string, valor: number, codigo: string) => Promise<void> | void;
  /** Texto do botao de aplicar no painel do vale (default "Registrar pagamento"). */
  valeBotaoLabel?: string;
  obterVendaId?: () => Promise<{ id: number; numero_venda: string }>;
  onPagamentoConfirmado?: (vendaId: number) => void;

  // Edicao-mode specific
  uploadOuroFoto?: UploadOuroFotoFn;
  onReload?: () => void;

  // Callbacks (edicao mode)
  onPaymentSaved?: () => void;

  // Extra
  showAReceberWarning?: boolean;

  // Bloqueio de cartão por desconto acima do limite configurado
  cartaoBloqueado?: boolean;
  /** Limite (%) do cartão, pra mostrar na mensagem. Vem da config
   *  `limite_desconto_cartao_pct` via o caller. Default 20 = default do backend. */
  limiteDescontoCartao?: number;
  onSolicitarAprovacaoCartao?: () => void;
  solicitandoAprovacaoCartao?: boolean;

  // Regra de promocao: limite de parcelas no cartao para vendas que contem
  // produtos em campanha (migration 257). NULL = sem limite (default 12x).
  maxParcelasPromo?: number | null;
  /** Nome(s) das campanhas que impuseram o limite — exibido no aviso. */
  nomesPromosNaVenda?: string[];

  /**
   * Role do usuario logado. Hoje decide só se "Manual (PagBank)" aparece no
   * seletor (admin/dev). "Manual (MP)" aparece pra todos desde 17/07 — ver
   * FORMAS_RESTRITAS_ADMIN. Ausente = mostra tudo (compatibilidade).
   */
  role?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Métodos de pagamento fixos (não dependem de gateways do banco) */
const FORMAS_PAGAMENTO_BASE = [
  "Dinheiro", "Cartão de Crédito", "Pix", "Ouro",
  "Vale-Troca", "A Receber", "Ação Marketing", "Múltiplas", "Manual (MP)", "Manual (PagBank)",
];

/**
 * Formas restritas a admin/dev no seletor.
 *
 * 17/07 (decisão do Jonathan): **Manual (MP) SAIU daqui — volta a aparecer pra
 * todos.** Motivo dele: no fluxo da loja o "Manual (MP)" não é cobrança no
 * cartão (é confirmação por ID de transação do MP), então nem entra no limite
 * de 20% do cartão nem precisa ficar escondido. Manual (PagBank) CONTINUA
 * restrito — não foi pedido pra liberar.
 * (Contexto: o PR #99, 17/07, tinha escondido as DUAS de quem não é admin.)
 *
 * ATENÇÃO — anda junto com FORMAS_PAGAMENTO_CARTAO (precificar-item.ts): Manual
 * (MP) está liberado E fora da trava do cartão PORQUE não é tratado como cartão.
 * Se um dia ele voltar a ser cobrança no cartão, as duas coisas mudam juntas:
 * volta pra trava E (se for esconder de novo) volta pra esta lista.
 */
export const FORMAS_RESTRITAS_ADMIN = ["Manual (PagBank)"];
const ROLES_FORMAS_MANUAIS = ["admin", "desenvolvedor"];

const CONDICOES = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
const COM_CARTAO = ["Cartão de Crédito", "Pix"];

function condicoesMp(valor: number) {
  const max = Math.min(12, Math.floor(valor / 100));
  return CONDICOES.filter(c => c === "À vista" || parseInt(c) <= max);
}
/** Aplica um teto adicional na lista de parcelas (mantém "À vista"). */
function aplicarCap(lista: string[], cap: number | null | undefined): string[] {
  if (cap == null || cap >= 12) return lista;
  const teto = Math.max(1, Math.floor(cap));
  return lista.filter(c => c === "À vista" || parseInt(c) <= teto);
}
export function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PagamentoForm({
  totalVenda,
  vendaId,
  numeroVenda,
  mode,
  gateways,
  // Payment form
  pagForma, setPagForma,
  pagGateway, setPagGateway,
  pagCondicao, setPagCondicao,
  // Múltiplas
  payments, setPayments,
  multForma, setMultForma,
  multParcelas, setMultParcelas,
  multValor, setMultValor,
  // Vale-Troca
  valeNumero, setValeNumero,
  valeValidando, setValeValidando,
  valeValidacao, setValeValidacao,
  // Vale-Troca múltiplas
  multValeNumero, setMultValeNumero,
  multValeValidando, setMultValeValidando,
  multValeValidacao, setMultValeValidacao,
  // Ouro
  ouroPeso, setOuroPeso,
  ouroValorGrama, setOuroValorGrama,
  setOuroFotoFile,
  ouroFotoPreview, setOuroFotoPreview,
  ouroValidacaoIA, setOuroValidacaoIA,
  ouroValidando, setOuroValidando,
  // Ouro múltiplas
  multOuroPeso, setMultOuroPeso,
  multOuroValorGrama, setMultOuroValorGrama,
  multOuroFotoFile, setMultOuroFotoFile,
  multOuroFotoPreview, setMultOuroFotoPreview,
  multOuroValidacaoIA, setMultOuroValidacaoIA,
  multOuroValidando, setMultOuroValidando,
  // Manual (MP)
  mpManualId, setMpManualId,
  mpManualLoading, setMpManualLoading,
  mpManualMsg, setMpManualMsg,
  // Valor form simples
  pagFormValor, setPagFormValor,
  // Saving
  saving,
  // Functions
  validarOuroIA,
  validarValeTroca,
  handleAddPagamento,
  handleRemovePagamento,
  handleMpManual,
  handleAddMultOuro,
  handleAddValeMultipla,
  onAplicarVale,
  onAplicarMultVale,
  valeBotaoLabel,
  obterVendaId,
  onPagamentoConfirmado,
  onPaymentSaved: _onPaymentSaved,
  showAReceberWarning,
  cartaoBloqueado,
  limiteDescontoCartao,
  onSolicitarAprovacaoCartao,
  solicitandoAprovacaoCartao,
  maxParcelasPromo,
  nomesPromosNaVenda,
  role,
}: PagamentoFormProps) {
  const podeVerRestritas = role == null || ROLES_FORMAS_MANUAIS.includes(role);
  const formasPagamento = podeVerRestritas
    ? FORMAS_PAGAMENTO_BASE
    : FORMAS_PAGAMENTO_BASE.filter(f => !FORMAS_RESTRITAS_ADMIN.includes(f));
  const totalMult = payments.reduce((s, p) => s + p.valor, 0);
  const restante = +(totalVenda - totalMult).toFixed(2);

  /** REGRA DE NEGÓCIO (16/07, decisão do Jonathan): o bloqueio por desconto
   *  acima do limite do cartão vale pras 3 formas de cartão (Cartão de Crédito,
   *  Manual (MP), Manual (PagBank)) — antes só a primeira era barrada, então
   *  bastava lançar por um dos Manual pra pular a aprovação. As demais formas
   *  (Dinheiro/Pix/Ouro/Vale/A Receber) NÃO são afetadas por esta trava.
   *  Espelha o gate do servidor (POST /api/vendas/[id]/pagamentos, ehFormaCartao). */
  const bloqueioCartaoAtivo = (cartaoBloqueado ?? false) && ehFormaCartao(pagForma);

  return (
    <div className="space-y-4">
      {/* Forma de pagamento */}
      <div>
        <Label>Forma de recebimento</Label>
        <Sel
          value={pagForma}
          onChange={e => { setPagForma(e.target.value); setPagCondicao("À vista"); }}
          className="w-56"
        >
          <optgroup label="Métodos de Pagamento">
            {formasPagamento.map(f => <option key={f} value={f}>{f}</option>)}
          </optgroup>
        </Sel>
      </div>

      {/* Dinheiro */}
      {["Dinheiro"].includes(pagForma) && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: C.cremeBorder }}>
          <p className="text-sm" style={{ color: "#6B7280" }}>Pagamento em dinheiro.</p>
          {mode === "edicao" && (
            <div>
              <Label>Valor</Label>
              <input
                type="text"
                value={pagFormValor}
                onChange={e => setPagFormValor(e.target.value)}
                placeholder={totalVenda.toFixed(2).replace(".", ",")}
                className="w-48 border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
            </div>
          )}
        </div>
      )}

      {/* Ouro (single) */}
      {pagForma === "Ouro" && (
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: C.cremeBorder }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Peso (g)</Label>
              <input type="number" step="0.001" value={ouroPeso}
                onChange={e => { setOuroPeso(e.target.value); setOuroValidacaoIA(null); setOuroFotoFile(null); setOuroFotoPreview(null); }}
                placeholder="0.000"
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            <div>
              <Label>Valor da grama (R$)</Label>
              <input type="number" step="0.01" value={ouroValorGrama}
                onChange={e => setOuroValorGrama(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
          </div>
          {ouroPeso && ouroValorGrama && (() => {
            const p = parseFloat(ouroPeso.replace(",", ".")); const vg = parseFloat(ouroValorGrama.replace(",", "."));
            if (p > 0 && vg > 0) return <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>Total: {fmt(p * vg)}</p>;
            return null;
          })()}
          <div>
            <Label>Foto da balança (obrigatória)</Label>
            <input type="file" accept="image/*" capture="environment"
              onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                setOuroFotoFile(file); setOuroFotoPreview(URL.createObjectURL(file)); setOuroValidacaoIA(null);
                const p = parseFloat(ouroPeso.replace(",", "."));
                if (p > 0) await validarOuroIA(file, p, setOuroValidacaoIA, setOuroValidando);
              }}
              className="w-full text-sm" />
            {ouroValidando && <p className="text-xs mt-1" style={{ color: "#6B7280" }}>Validando com IA...</p>}
            {ouroFotoPreview && <img src={ouroFotoPreview} alt="Balança" className="mt-2 h-24 rounded object-cover" />}
            {ouroValidacaoIA && (
              <div className={`mt-2 flex items-center gap-2 text-xs rounded px-3 py-2 ${ouroValidacaoIA.match ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {ouroValidacaoIA.match ? <CheckCircle size={13} /> : <XCircle size={13} />}
                {ouroValidacaoIA.mensagem}
              </div>
            )}
          </div>
        </div>
      )}

      {/* A Receber usa o bloco multi-forma abaixo (criação E edição): monta todas as formas,
          "A Receber" é uma das linhas, e o restante precisa fechar. */}

      {showAReceberWarning && (
        <div className="rounded-lg border px-4 py-3 text-xs" style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
          Vendas com &quot;A Receber&quot; requerem aprovação do gerente de loja.
        </div>
      )}

      {/* Cartão de Crédito / Pix gateway + condição + valor */}
      {COM_CARTAO.includes(pagForma) && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Gateway</Label>
              <Sel value={pagGateway} onChange={e => setPagGateway(e.target.value)}>
                {gateways.filter(g => g.nome === "Mercado Pago" || g.nome === "PagBank").map(g => <option key={g.id} value={g.nome}>{g.nome}</option>)}
              </Sel>
            </div>
            {pagForma === "Cartão de Crédito" && (
              <div>
                <Label>Condição de Pagamento</Label>
                <Sel value={pagCondicao} onChange={e => setPagCondicao(e.target.value)}>
                  {aplicarCap(
                    pagGateway === "Mercado Pago" ? condicoesMp(totalVenda) : CONDICOES,
                    maxParcelasPromo,
                  ).map(c => <option key={c} value={c}>{c}</option>)}
                </Sel>
                {maxParcelasPromo != null && maxParcelasPromo < 12 && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Limitado a {maxParcelasPromo}x pela promoção
                    {nomesPromosNaVenda && nomesPromosNaVenda.length > 0
                      ? ` (${nomesPromosNaVenda.join(", ")})`
                      : ""}.
                  </p>
                )}
              </div>
            )}
          </div>
          {mode === "edicao" && (
            <div>
              <Label>Valor</Label>
              <input
                type="text"
                value={pagFormValor}
                onChange={e => setPagFormValor(e.target.value)}
                placeholder={totalVenda.toFixed(2).replace(".", ",")}
                className="w-48 border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }}
              />
            </div>
          )}
        </>
      )}

      {/* Vale-Troca */}
      {pagForma === "Vale-Troca" && totalVenda > 0 && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.esmeraldaLt }}>
          <div className="flex items-center gap-2">
            <Ticket size={16} style={{ color: C.esmeralda }} />
            <span className="text-sm font-medium" style={{ color: C.esmeralda }}>Informe o número do Vale-Troca</span>
          </div>
          <div className="flex gap-2">
            <input type="text" value={valeNumero}
              onChange={e => { setValeNumero(e.target.value); setValeValidacao(null); }}
              placeholder="VT-00001"
              className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white"
              style={{ borderColor: C.cremeBorder, color: "#374151" }}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), validarValeTroca(valeNumero, setValeValidacao, setValeValidando))}
            />
            <button
              onClick={() => validarValeTroca(valeNumero, setValeValidacao, setValeValidando)}
              disabled={!valeNumero.trim() || valeValidando}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}>
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
          {/* Vale COM dono: painel da 2a confirmacao (codigo WhatsApp). Promocional aplica direto. */}
          {valeValidacao?.ok && valeValidacao.cliente_id != null && onAplicarVale && (
            <ValeCodigoInline
              key={valeNumero}
              valeNumero={valeNumero}
              botaoLabel={valeBotaoLabel ?? "Registrar pagamento"}
              onAplicar={({ vale_codigo }) => onAplicarVale(valeNumero.trim(), vale_codigo)}
            />
          )}
        </div>
      )}

      {/* Pix — Mercado Pago */}
      {pagForma === "Pix" && totalVenda > 0 && mode === "criacao" && pagGateway === "Mercado Pago" && (
        <PixQrInline
          vendaId={vendaId ?? null}
          numeroVenda={numeroVenda || "Nova"}
          valor={totalVenda}
          endpoint="criar-pix-instore"
          obterVendaId={mode === "criacao" && !vendaId ? obterVendaId : undefined}
          onPagamentoConfirmado={() => {
            /**
             * REGRA DE NEGÓCIO: confirmação PagBank em criação precisa devolver
             * o ID da venda para a tela avançar/abrir detalhe corretamente.
             * O QUE: adapta callback sem argumento do modal para o contrato do form.
             * POR QUE: PagBankCobranca só sinaliza confirmação; o form conhece vendaId.
             * IMPACTO SE REMOVIDO: confirmação compila quebrada ou não navega após pagar.
             */
            if (vendaId) onPagamentoConfirmado?.(vendaId);
          }}
        />
      )}

      {/* Pix — PagBank */}
      {pagForma === "Pix" && totalVenda > 0 && mode === "criacao" && pagGateway === "PagBank" && (
        <PagBankQrInline
          vendaId={vendaId ?? null}
          numeroVenda={numeroVenda || "Nova"}
          valor={totalVenda}
          obterVendaId={mode === "criacao" && !vendaId ? obterVendaId : undefined}
          onPagamentoConfirmado={() => {
            /**
             * REGRA DE NEGÓCIO: confirmação PagBank em criação precisa devolver
             * o ID da venda para a tela avançar/abrir detalhe corretamente.
             * O QUE: adapta callback sem argumento do modal para o contrato do form.
             * POR QUE: PagBankCobranca só sinaliza confirmação; o form conhece vendaId.
             * IMPACTO SE REMOVIDO: confirmação compila quebrada ou não navega após pagar.
             */
            if (vendaId) onPagamentoConfirmado?.(vendaId);
          }}
        />
      )}

      {/* ── Bloqueio por desconto acima do limite do cartão ──
          Só "Cartão de Crédito" (ver FORMAS_PAGAMENTO_CARTAO). Substitui o
          painel de cobrança da forma escolhida pelo aviso + botão de solicitar. */}
      {bloqueioCartaoAtivo && (
        <div className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: "#FED7AA", backgroundColor: "#FFF7ED" }}>
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#9A3412" }} />
            <div className="text-xs flex-1" style={{ color: "#9A3412" }}>
              <p className="font-medium">Pagamento no cartão bloqueado</p>
              <p className="mt-1">
                Este pedido possui itens com desconto acima de {limiteDescontoCartao ?? 20}%. Para pagar em {pagForma}, solicite aprovação.
                As outras formas seguem liberadas.
              </p>
            </div>
          </div>
          {onSolicitarAprovacaoCartao && (
            <button
              onClick={onSolicitarAprovacaoCartao}
              disabled={solicitandoAprovacaoCartao}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "#C2410C", color: "#fff" }}>
              {solicitandoAprovacaoCartao ? <Loader2 size={14} className="animate-spin" /> : null}
              Solicitar Aprovação
            </button>
          )}
        </div>
      )}

      {/* Cartão inline — Mercado Pago */}
      {pagForma === "Cartão de Crédito" && !bloqueioCartaoAtivo && totalVenda > 0 && mode === "criacao" && pagGateway === "Mercado Pago" && (() => {
        const installments = pagCondicao === "À vista" ? 1 : parseInt(pagCondicao) || 1;
        return (
          <CartaoInline
            vendaId={vendaId}
            numeroVenda={numeroVenda || "Nova"}
            valor={totalVenda}
            installments={installments}
            obterVendaId={mode === "criacao" && !vendaId ? obterVendaId : undefined}
            onPagamentoConfirmado={onPagamentoConfirmado ?? (() => {})}
          />
        );
      })()}

      {/* Cartão inline — PagBank */}
      {pagForma === "Cartão de Crédito" && !bloqueioCartaoAtivo && totalVenda > 0 && mode === "criacao" && pagGateway === "PagBank" && (
        <PagBankCobranca
          vendaId={vendaId ?? 0}
          numeroVenda={numeroVenda || "Nova"}
          valorSugerido={totalVenda}
          situacao={"rascunho"}
          bloqueado={cartaoBloqueado ?? false}
          onPagamentoConfirmado={() => {
            /**
             * REGRA DE NEGÓCIO: confirmação PagBank em criação precisa devolver
             * o ID da venda para a tela avançar/abrir detalhe corretamente.
             * O QUE: adapta callback sem argumento do modal para o contrato do form.
             * POR QUE: PagBankCobranca só sinaliza confirmação; o form conhece vendaId.
             * IMPACTO SE REMOVIDO: confirmação compila quebrada ou não navega após pagar.
             */
            if (vendaId) onPagamentoConfirmado?.(vendaId);
          }}
        />
      )}

      {/* Manual (MP) */}
      {pagForma === "Manual (MP)" && !bloqueioCartaoAtivo && vendaId && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder }}>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            Cole o ID do pagamento do Mercado Pago. O sistema vai consultar o MP e registrar automaticamente se estiver aprovado.
          </p>
          <div>
            <Label>ID do Pagamento (MP)</Label>
            <input type="text" value={mpManualId}
              onChange={e => { setMpManualId(e.target.value); setMpManualMsg(null); }}
              placeholder="ex: 123456789"
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
              style={{ borderColor: C.cremeBorder, color: "#374151" }} />
          </div>
          {mpManualMsg && (
            <p className="text-xs font-medium" style={{ color: mpManualMsg.ok ? "#059669" : "#DC2626" }}>
              {mpManualMsg.text}
            </p>
          )}
          <button onClick={handleMpManual}
            disabled={mpManualLoading || !mpManualId.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {mpManualLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Verificar e Registrar
          </button>
        </div>
      )}

      {/* Manual (PagBank) */}
      {pagForma === "Manual (PagBank)" && !bloqueioCartaoAtivo && vendaId && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder }}>
          <p className="text-xs" style={{ color: "#6B7280" }}>
            Cole o ID do pedido ou cobrança do PagBank. O sistema vai consultar o PagBank e registrar automaticamente se estiver aprovado.
          </p>
          <div>
            <Label>ID do Pedido/Cobrança (PagBank)</Label>
            <input type="text" value={mpManualId}
              onChange={e => setMpManualId(e.target.value)}
              placeholder="ex: ORDE_123456789 ou CHAR_987654321"
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
              style={{ borderColor: C.cremeBorder, color: "#374151" }} />
          </div>
          {mpManualMsg && (
            <p className="text-xs font-medium" style={{ color: mpManualMsg.ok ? "#059669" : "#DC2626" }}>
              {mpManualMsg.text}
            </p>
          )}
          <button
            onClick={async () => {
              if (!vendaId) return;
              setMpManualLoading(true);
              setMpManualMsg(null);
              try {
                const res = await fetch(`/api/vendas/${vendaId}/pagbank/verificar-manual`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ payment_id: mpManualId.trim() }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erro ao verificar PagBank");
                setMpManualMsg({ text: `Pagamento PagBank confirmado! R$ ${(data as any).pb_valor?.toFixed(2) ?? "?"}`, ok: true });
                onPagamentoConfirmado?.(vendaId);
              } catch (err) {
                setMpManualMsg({ text: err instanceof Error ? err.message : "Erro ao verificar", ok: false });
              } finally {
                setMpManualLoading(false);
              }
            }}
            disabled={mpManualLoading || !mpManualId.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {mpManualLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Verificar e Registrar
          </button>
        </div>
      )}

      {/* Múltiplas (e "A Receber": mesma mecânica multi-forma — montar todas as formas
          até o restante fechar; "A Receber" é uma das linhas, com seu plano no painel). */}
      {(pagForma === "Múltiplas" || pagForma === "A Receber") && (() => {
        const multFormas = formasPagamento.filter(f => f !== "Múltiplas");
        return (
          <div>
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <div className="flex-1 min-w-36">
                <Label>Forma</Label>
                <Sel value={multForma} onChange={e => {
                  const v = e.target.value;
                  setMultForma(v); setMultParcelas(1);
                  setMultValeValidacao(null); setMultValeNumero(""); setMultValor("");
                  setMultOuroPeso(""); setMultOuroValorGrama(""); setMultOuroFotoFile(null); setMultOuroFotoPreview(null); setMultOuroValidacaoIA(null);
                }}>
                  <optgroup label="Métodos de Pagamento">
                    {multFormas.map(f => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                </Sel>
              </div>

              {multForma === "Ouro" ? null : multForma === "Vale-Troca" ? (
                <div className="flex-1 min-w-48 flex gap-2">
                  <div className="flex-1">
                    <Label>Número do Vale</Label>
                    <input type="text" value={multValeNumero}
                      onChange={e => { setMultValeNumero(e.target.value); setMultValeValidacao(null); setMultValor(""); }}
                      placeholder="VT-00001"
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                      style={{ borderColor: multValeValidacao?.ok ? "#6EE7B7" : C.cremeBorder, color: "#374151" }}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), validarValeTroca(multValeNumero, setMultValeValidacao, setMultValeValidando))} />
                  </div>
                  <div className="flex items-end">
                    <button type="button"
                      onClick={() => validarValeTroca(multValeNumero, setMultValeValidacao, setMultValeValidando)}
                      disabled={!multValeNumero.trim() || multValeValidando}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                      style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      {multValeValidando ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
                    </button>
                  </div>
                </div>
              ) : multForma === "Manual (MP)" ? (
                <div className="flex-1 min-w-48">
                  <Label>ID do Pagamento (MP)</Label>
                  <input type="text" value={mpManualId}
                    onChange={e => { setMpManualId(e.target.value); setMpManualMsg(null); }}
                    placeholder="ex: 123456789"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                    onKeyDown={e => e.key === "Enter" && handleMpManual()} />
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-28">
                    <Label>
                      Valor{restante > 0 && <span className="ml-1 font-normal text-xs" style={{ color: "#9CA3AF" }}>(restante: {fmt(restante)})</span>}
                    </Label>
                    <input type="text" value={multValor}
                      onChange={e => setMultValor(e.target.value)}
                      placeholder={restante > 0 ? restante.toFixed(2).replace(".", ",") : "0,00"}
                      onKeyDown={e => e.key === "Enter" && handleAddPagamento()}
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                  </div>
                  {multForma === "Cartão de Crédito" && (() => {
                    const valCC = parseFloat(multValor.replace(",", ".")) || restante;
                    const opcoesCC = aplicarCap(condicoesMp(valCC), maxParcelasPromo);
                    const maxCC = opcoesCC.length > 1 ? parseInt(opcoesCC[opcoesCC.length - 1]) : 1;
                    const parcelasOk = multParcelas <= maxCC ? multParcelas : 1;
                    if (parcelasOk !== multParcelas) setMultParcelas(parcelasOk);
                    return (
                      <div className="min-w-28">
                        <Label>Parcelas</Label>
                        <Sel value={parcelasOk} onChange={e => setMultParcelas(Number(e.target.value))}>
                          {opcoesCC.map((c, i) => <option key={c} value={i === 0 ? 1 : i + 1}>{c}</option>)}
                        </Sel>
                      </div>
                    );
                  })()}
                </>
              )}
              {multForma !== "Ouro" && !(multForma === "Vale-Troca" && multValeValidacao?.ok && multValeValidacao.cliente_id != null && onAplicarMultVale) && (
                <button onClick={() => {
                    if (multForma === "Vale-Troca") {
                      if (!multValeValidacao?.ok || !multValeValidacao.valor_disponivel) return;
                      const valorValeDisp = Math.min(multValeValidacao.valor_disponivel, restante);
                      // Edicao (detalhe): registra na hora com a 2a confirmacao do dono
                      // (token). Nova venda: acumula na lista e aplica no "Concluir".
                      if (handleAddValeMultipla) {
                        handleAddValeMultipla(multValeNumero.trim(), valorValeDisp);
                      } else {
                        setPayments([...payments, { _key: Math.random().toString(36).slice(2), forma: "Vale-Troca", valor: valorValeDisp, parcelas: 1, vale_numero: multValeNumero.trim() }]);
                      }
                      setMultValeNumero(""); setMultValeValidacao(null); setMultValor("");
                    } else if (multForma === "Manual (MP)") {
                      handleMpManual();
                    } else {
                      handleAddPagamento(multValor);
                    }
                  }}
                  disabled={saving || restante <= 0 || (multForma === "Vale-Troca" ? !multValeValidacao?.ok : false) || (multForma === "Manual (MP)" ? (mpManualLoading || !mpManualId.trim()) : false)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  {multForma === "Manual (MP)"
                    ? <>{mpManualLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={13} />} Verificar</>
                    : <><Plus size={13} /> Adicionar</>
                  }
                </button>
              )}
              {/* Feedback Manual (MP) no Múltiplas */}
              {multForma === "Manual (MP)" && mpManualMsg && (
                <p className="text-xs font-medium mt-1" style={{ color: mpManualMsg.ok ? "#059669" : "#DC2626" }}>
                  {mpManualMsg.text}
                </p>
              )}
            </div>

            {/* Vale COM dono (Múltiplas): painel da 2a confirmação (código WhatsApp). Promocional usa "Adicionar". */}
            {multForma === "Vale-Troca" && multValeValidacao?.ok && multValeValidacao.cliente_id != null && onAplicarMultVale && (
              <ValeCodigoInline
                key={multValeNumero}
                valeNumero={multValeNumero}
                botaoLabel="Adicionar vale"
                onAplicar={async ({ vale_codigo }) => {
                  await onAplicarMultVale(multValeNumero.trim(), Math.min(multValeValidacao.valor_disponivel ?? 0, restante), vale_codigo);
                  setMultValeNumero(""); setMultValeValidacao(null); setMultValor("");
                }}
              />
            )}

            {/* Ouro no fluxo Múltiplas */}
            {multForma === "Ouro" && (
              <div className="rounded-lg border p-3 mb-3 space-y-3" style={{ borderColor: C.cremeBorder }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Peso (g)</Label>
                    <input type="number" step="0.001" value={multOuroPeso}
                      onChange={e => { setMultOuroPeso(e.target.value); setMultOuroValidacaoIA(null); setMultOuroFotoFile(null); setMultOuroFotoPreview(null); }}
                      placeholder="0.000"
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                  </div>
                  <div>
                    <Label>Valor da grama (R$)</Label>
                    <input type="number" step="0.01" value={multOuroValorGrama}
                      onChange={e => setMultOuroValorGrama(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.cremeBorder, color: "#374151" }} />
                  </div>
                </div>
                {multOuroPeso && multOuroValorGrama && (() => {
                  const p = parseFloat(multOuroPeso.replace(",", ".")); const vg = parseFloat(multOuroValorGrama.replace(",", "."));
                  if (p > 0 && vg > 0) return <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>Total: {fmt(p * vg)}</p>;
                  return null;
                })()}
                <div>
                  <Label>Foto da balança</Label>
                  <input type="file" accept="image/*" capture="environment"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setMultOuroFotoFile(file); setMultOuroFotoPreview(URL.createObjectURL(file)); setMultOuroValidacaoIA(null);
                      const p = parseFloat(multOuroPeso.replace(",", "."));
                      if (p > 0) await validarOuroIA(file, p, setMultOuroValidacaoIA, setMultOuroValidando);
                    }}
                    className="w-full text-sm" />
                  {multOuroValidando && <p className="text-xs mt-1" style={{ color: "#6B7280" }}>Validando com IA...</p>}
                  {multOuroFotoPreview && <img src={multOuroFotoPreview} alt="Balança" className="mt-2 h-20 rounded object-cover" />}
                  {multOuroValidacaoIA && (
                    <div className={`mt-2 flex items-center gap-2 text-xs rounded px-3 py-2 ${multOuroValidacaoIA.match ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {multOuroValidacaoIA.match ? <CheckCircle size={13} /> : <XCircle size={13} />}
                      {multOuroValidacaoIA.mensagem}
                    </div>
                  )}
                </div>
                <button
                  disabled={restante <= 0 || !multOuroValidacaoIA?.match || !multOuroFotoFile || multOuroValidando}
                  onClick={handleAddMultOuro}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                  <Plus size={13} /> Adicionar Ouro
                </button>
              </div>
            )}

            {payments.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {payments.map(p => (
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
            {totalVenda > 0 && payments.filter(p => p.forma === "Pix").map(pItem => (
              <div key={pItem._key} className="mt-3">
                <PixQrInline
                  vendaId={vendaId ?? null}
                  numeroVenda={numeroVenda || "Nova"}
                  valor={pItem.valor}
                  endpoint="criar-pix-instore"
                  pagamentoId={pItem.db_id}
                  obterVendaId={mode === "criacao" && !vendaId ? obterVendaId : undefined}
                  onPagamentoConfirmado={onPagamentoConfirmado ?? (() => {})}
                />
              </div>
            ))}

            {/* Cartão dentro de Múltiplas — um widget por entrada */}
            {totalVenda > 0 && payments.filter(p => p.forma === "Cartão de Crédito").map(pItem => (
              <div key={pItem._key} className="mt-3">
                <CartaoInline
                  vendaId={vendaId}
                  numeroVenda={numeroVenda || "Nova"}
                  valor={pItem.valor}
                  installments={pItem.parcelas || multParcelas}
                  pagamentoId={pItem.db_id}
                  obterVendaId={mode === "criacao" && !vendaId ? obterVendaId : undefined}
                  onPagamentoConfirmado={onPagamentoConfirmado ?? (() => {})}
                />
              </div>
            ))}
          </div>
        );
      })()}

      {/* Botão Registrar (modo edição, formulário simples não-gateway).
          Vale COM dono: o botão fica no painel ValeCodigoInline (acima) — esconde este.
          bloqueioCartaoAtivo: esconde o botão nas formas de cartão quando o desconto
          passa do limite e ainda não foi aprovado (o servidor recusaria com 409). */}
      {mode === "edicao" && vendaId && !bloqueioCartaoAtivo && pagForma !== "Múltiplas" && pagForma !== "A Receber" && pagForma !== "Manual (MP)" &&
        !(pagForma === "Vale-Troca" && valeValidacao?.ok && valeValidacao.cliente_id != null && onAplicarVale) && (
        <button
          onClick={() => handleAddPagamento(pagFormValor || undefined)}
          disabled={saving || totalVenda <= 0 || (pagForma === "Ouro" && (!ouroValidacaoIA?.match || !ouroFotoPreview || !parseFloat(ouroPeso.replace(",", ".")) || !parseFloat(ouroValorGrama.replace(",", "."))))}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={13} />}
          Registrar Pagamento{pagForma === "Ouro" ? " em Ouro" : ""}
        </button>
      )}

      {/* A Receber warning banner (criacao mode only) */}
      {mode === "criacao" && payments.some(p => p.forma === "A Receber") && (
        <div className="rounded-lg border px-4 py-3 text-xs" style={{ backgroundColor: "#FEF9C3", borderColor: "#FDE68A", color: "#713F12" }}>
          Vendas com &quot;A Receber&quot; requerem aprovação do gerente de loja.
        </div>
      )}
    </div>
  );
}
