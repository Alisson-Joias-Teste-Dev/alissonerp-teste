"use client";

import {
  Plus, X, Loader2, CheckCircle, XCircle, AlertCircle, Ticket,
} from "lucide-react";
import CartaoInline from "@/components/vendas/CartaoInline";
import PixQrInline from "@/components/vendas/PixQrInline";

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
  obterVendaId?: () => Promise<{ id: number; numero_venda: string }>;
  onPagamentoConfirmado?: (vendaId: number) => void;

  // Edicao-mode specific
  uploadOuroFoto?: UploadOuroFotoFn;
  onReload?: () => void;

  // Callbacks (edicao mode)
  onPaymentSaved?: () => void;

  // Extra
  showAReceberWarning?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Métodos de pagamento fixos (não dependem de gateways do banco) */
const FORMAS_PAGAMENTO_BASE = [
  "Dinheiro", "Cartão de Crédito", "Pix", "Ouro",
  "Vale-Troca", "A Receber", "Múltiplas", "Manual (MP)",
];

const CONDICOES = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
const COM_CARTAO = ["Cartão de Crédito", "Pix"];

function condicoesMp(valor: number) {
  const max = Math.min(12, Math.floor(valor / 100));
  return CONDICOES.filter(c => c === "À vista" || parseInt(c) <= max);
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
  mpManualLoading,
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
  obterVendaId,
  onPagamentoConfirmado,
  onPaymentSaved: _onPaymentSaved,
  showAReceberWarning,
}: PagamentoFormProps) {
  const formasPagamento = FORMAS_PAGAMENTO_BASE;
  const totalMult = payments.reduce((s, p) => s + p.valor, 0);
  const restante = +(totalVenda - totalMult).toFixed(2);

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

      {/* A Receber */}
      {pagForma === "A Receber" && totalVenda > 0 && (
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
          <p className="text-sm font-medium" style={{ color: "#374151" }}>A Receber — {fmt(totalVenda)}</p>
          <p className="text-xs" style={{ color: "#92400E" }}>
            {mode === "criacao"
              ? "Ao concluir, será solicitada aprovação do gerente de loja."
              : "Pagamento a receber. Aprovação de crédito necessária."}
          </p>
        </div>
      )}

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
                {gateways.filter(g => g.nome === "Mercado Pago").map(g => <option key={g.id} value={g.nome}>{g.nome}</option>)}
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
        </div>
      )}

      {/* Pix In-Store (só no modo criacao; edicao usa o botão Registrar) */}
      {pagForma === "Pix" && totalVenda > 0 && mode === "criacao" && (
        <PixQrInline
          vendaId={vendaId ?? null}
          numeroVenda={numeroVenda || "Nova"}
          valor={totalVenda}
          endpoint="criar-pix-instore"
          obterVendaId={mode === "criacao" && !vendaId ? obterVendaId : undefined}
          onPagamentoConfirmado={onPagamentoConfirmado ?? (() => {})}
        />
      )}

      {/* Cartão inline (só no modo criacao; edicao usa o botão Registrar) */}
      {pagForma === "Cartão de Crédito" && totalVenda > 0 && mode === "criacao" && (() => {
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

      {/* Manual (MP) */}
      {pagForma === "Manual (MP)" && vendaId && (
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

      {/* Múltiplas */}
      {pagForma === "Múltiplas" && (() => {
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
                    const opcoesCC = condicoesMp(valCC);
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
              {multForma !== "Ouro" && (
                <button onClick={() => {
                    if (multForma === "Vale-Troca") {
                      if (!multValeValidacao?.ok || !multValeValidacao.valor_disponivel) return;
                      const valorValeDisp = Math.min(multValeValidacao.valor_disponivel, restante);
                      setPayments([...payments, { _key: Math.random().toString(36).slice(2), forma: "Vale-Troca", valor: valorValeDisp, parcelas: 1, vale_numero: multValeNumero.trim() }]);
                      setMultValeNumero(""); setMultValeValidacao(null); setMultValor("");
                    } else if (multForma === "Manual (MP)") {
                      handleMpManual();
                    } else {
                      handleAddPagamento(multValor);
                    }
                  }}
                  disabled={restante <= 0 || (multForma === "Vale-Troca" ? !multValeValidacao?.ok : false) || (multForma === "Manual (MP)" ? (mpManualLoading || !mpManualId.trim()) : false)}
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

      {/* Botão Registrar (modo edição, formulário simples não-gateway) */}
      {mode === "edicao" && vendaId && pagForma !== "Múltiplas" && pagForma !== "Manual (MP)" && (
        <button
          onClick={() => handleAddPagamento(pagFormValor || undefined)}
          disabled={saving || totalVenda <= 0 || (pagForma === "Ouro" && (!ouroValidacaoIA?.match || !ouroFotoPreview))}
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
