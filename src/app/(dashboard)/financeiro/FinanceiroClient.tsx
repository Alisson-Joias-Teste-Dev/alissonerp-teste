"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Wallet,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileUp,
  Landmark,
  Plus,
  X,
  Loader2,
  Link2,
  Save,
  TrendingUp,
  Calendar,
  Send,
  Banknote,
  CreditCard,
  Smartphone,
  CircleDollarSign,
  ShieldCheck,
} from "lucide-react";
import { dispararWebhook } from "@/lib/webhooks";
import PeriodoFiltro, { type Periodo, calcPeriodo } from "@/components/ui/PeriodoFiltro";

// ─── palette (tema claro/creme consistente com o resto do sistema) ───────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  vermelho:    "#DC2626",
  vermelhoLt:  "#FEE2E2",
  ambar:       "#D97706",
  ambarLt:     "#FEF3C7",
  verde:       "#059669",
  verdeLt:     "#D1FAE5",
  cinza:       "#6B7280",
  cinzaLt:     "#F3F4F6",
  cinzaBorder: "#E5E7EB",
};

// ─── types ───────────────────────────────────────────────────────────────────

interface CaixaDinheiro {
  id: number;
  forma: string;
  valor: number;
  caixa_baixa_id: number | null;
  data_confirmacao: string | null;
  numero_venda: string;
  vendedor_nome: string | null;
  venda_id: number;
}

interface CaixaBaixa {
  id: number;
  total: number;
  qtd_pagamentos: number;
  realizado_nome: string | null;
  obs: string | null;
  created_at: string;
}

interface ContaPagar {
  id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  situacao: string;
  categoria: string | null;
  obs: string | null;
  inter_pagamento_id?: string | null;
  inter_status?: string | null;
  inter_tipo?: string | null;
  inter_dados?: any;
  inter_enviado_em?: string | null;
  inter_erro?: string | null;
}

interface ContaReceber {
  id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_recebimento: string | null;
  situacao: string;
  categoria: string | null;
  obs: string | null;
  venda_erp_id?: number | null;
  venda_created_at?: string | null;
  venda_numero?: string | null;
  valor_liquido?: number | null;
  taxas_mp?: number | null;
}

interface Extrato {
  id: number;
  banco: string | null;
  arquivo_nome: string | null;
  processado: boolean;
  total_lancamentos: number;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
}

interface Lancamento {
  id: number;
  fitid: string | null;
  tipo: string | null;
  valor: number;
  data_transacao: string | null;
  descricao: string | null;
  memo: string | null;
  conciliado: boolean;
  extrato_id: number | null;
  banco: string | null;
}

interface CofreOuro {
  total_transacoes: number;
  total_gramas: number;
  total_valor_brl: number;
  preco_medio_grama: number;
  transacoes_30d: number;
  gramas_30d: number;
  valor_brl_30d: number;
}

interface ConciliacaoPendente {
  id: number;
  venda_id: number | null;
  numero_venda: string | null;
  valor: number;
  gateway_id: string | null;
  gateway: string | null;
  data_confirmacao: string | null;
  created_at: string;
  cliente_nome: string | null;
}

interface Props {
  pagar: ContaPagar[];
  receber: ContaReceber[];
  extratos: Extrato[];
  lancamentos: Lancamento[];
  caixaPagamentos: CaixaDinheiro[];
  caixaBaixas: CaixaBaixa[];
  userRole: string | null;
  defaultTab?: Tab;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

const isVencido = (d: string | null, situacao: string) => {
  if (situacao !== "pendente" || !d) return false;
  const venc = d.slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);
  return venc < hoje;
};

const diasAte = (d: string | null) => {
  if (!d) return Infinity;
  const alvo = new Date(d.slice(0, 10) + "T00:00:00Z");
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};

const SITUACAO: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  pendente:   { label: "Pendente",   bg: C.ambarLt,    color: C.ambar,    icon: Clock },
  pago:       { label: "Pago",       bg: C.verdeLt,    color: C.verde,    icon: CheckCircle },
  recebido:   { label: "Recebido",   bg: C.verdeLt,    color: C.verde,    icon: CheckCircle },
  cancelado:  { label: "Cancelado",  bg: C.cinzaLt,    color: C.cinza,    icon: X },
  vencido:    { label: "Vencido",    bg: C.vermelhoLt, color: C.vermelho, icon: AlertTriangle },
};

// ─── Card KPI ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, valueColor, sub, icon: Icon, accent,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  sub?: string;
  icon?: any;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 border" style={{ borderColor: C.cremeBorder }}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>{label}</p>
        {Icon && <Icon size={14} style={{ color: accent ?? C.esmeralda }} />}
      </div>
      <p className="text-xl font-semibold tabular-nums" style={{ color: valueColor ?? "#1A1A1A" }}>
        {value}
      </p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: C.cinza }}>{sub}</p>}
    </div>
  );
}

// ─── ContaRow ────────────────────────────────────────────────────────────────

function ContaRow({
  descricao, valor, valorLiquido, taxasMp, vencimento, liquidacao,
  situacao, categoria, vencido, onAction, actionLabel, actionLoading,
  vendaId, vendaNumero, vendaCreatedAt,
}: {
  descricao: string;
  valor: number;
  valorLiquido?: number | null;
  taxasMp?: number | null;
  vencimento: string | null;
  liquidacao: string | null;
  situacao: string;
  categoria: string | null;
  vencido: boolean;
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
  vendaId?: number | null;
  vendaNumero?: string | null;
  vendaCreatedAt?: string | null;
}) {
  const st = vencido ? SITUACAO["vencido"] : (SITUACAO[situacao] ?? { label: situacao, bg: C.cinzaLt, color: C.cinza, icon: Clock });
  const Icon = st.icon;
  const temLiquidoDiferente = valorLiquido != null && valorLiquido > 0 && Math.abs(valorLiquido - valor) > 0.001;
  const fmtDatetime = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  return (
    <tr className="hover:bg-stone-50 transition-colors border-b" style={{ borderColor: C.cremeBorder }}>
      <td className="px-4 py-3 max-w-[260px]">
        {vendaId ? (
          <a href={`/vendas/${vendaId}`} className="text-sm truncate font-medium block hover:underline" style={{ color: C.esmeralda }}>
            {vendaNumero ? `Venda #${vendaNumero}` : descricao}
          </a>
        ) : (
          <p className="text-sm truncate font-medium" style={{ color: "#1A1A1A" }}>{descricao}</p>
        )}
        {vendaCreatedAt && (
          <p className="text-[11px]" style={{ color: C.cinza }}>{fmtDatetime(vendaCreatedAt)}</p>
        )}
        {!vendaCreatedAt && categoria && <p className="text-[11px]" style={{ color: C.cinza }}>{categoria}</p>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: vencido ? C.vermelho : "#374151" }}>
        {fmt(Number(valor))}
        {temLiquidoDiferente && (
          <div className="text-[10px] mt-0.5 font-normal" style={{ color: C.verde }}>
            líquido {fmt(Number(valorLiquido))}
            {taxasMp != null && taxasMp > 0 && (
              <span style={{ color: C.ambar }}> (−{fmt(Number(taxasMp))})</span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: vencido ? C.vermelho : "#374151" }}>
        {fmtDate(vencimento)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: C.cinza }}>
        {fmtDate(liquidacao)}
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: st.bg, color: st.color }}
        >
          <Icon size={10} />
          {st.label}
        </span>
      </td>
      {onAction && situacao === "pendente" && (
        <td className="px-4 py-3 text-right">
          <button
            onClick={onAction}
            disabled={actionLoading}
            className="text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-30 transition-opacity inline-flex items-center gap-1 whitespace-nowrap"
            style={{ backgroundColor: C.verdeLt, color: C.verde }}
          >
            {actionLoading ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
            {actionLabel}
          </button>
        </td>
      )}
      {onAction && situacao !== "pendente" && <td className="px-4 py-3" />}
    </tr>
  );
}

// ─── Gráfico Evolução Mensal (barras simples) ────────────────────────────────
function EvolucaoMensal({ pagar, receber }: { pagar: ContaPagar[]; receber: ContaReceber[] }) {
  const meses = useMemo(() => {
    const hoje = new Date();
    const arr: { mes: string; label: string; receber: number; pagar: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      arr.push({ mes: ym, label, receber: 0, pagar: 0 });
    }
    const mapa = new Map(arr.map(m => [m.mes, m]));
    pagar.forEach(p => {
      if (!p.data_vencimento) return;
      const ym = p.data_vencimento.slice(0, 7);
      const m = mapa.get(ym);
      if (m) m.pagar += Number(p.valor);
    });
    receber.forEach(r => {
      if (!r.data_vencimento) return;
      const ym = r.data_vencimento.slice(0, 7);
      const m = mapa.get(ym);
      if (m) m.receber += Number(r.valor);
    });
    return arr;
  }, [pagar, receber]);

  const maxVal = Math.max(1, ...meses.flatMap(m => [m.receber, m.pagar]));

  return (
    <div className="rounded-xl bg-white p-4 border" style={{ borderColor: C.cremeBorder }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} style={{ color: C.esmeralda }} />
          <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Evolução Mensal</p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1" style={{ color: C.cinza }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: C.verde }} /> A Receber
          </span>
          <span className="flex items-center gap-1" style={{ color: C.cinza }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: C.ambar }} /> A Pagar
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 h-32">
        {meses.map(m => (
          <div key={m.mes} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="flex items-end gap-1 h-24 w-full justify-center">
              <div
                className="w-3 rounded-t"
                style={{
                  backgroundColor: C.verde,
                  height: `${(m.receber / maxVal) * 100}%`,
                  minHeight: m.receber > 0 ? 2 : 0,
                }}
                title={`A Receber: ${fmt(m.receber)}`}
              />
              <div
                className="w-3 rounded-t"
                style={{
                  backgroundColor: C.ambar,
                  height: `${(m.pagar / maxVal) * 100}%`,
                  minHeight: m.pagar > 0 ? 2 : 0,
                }}
                title={`A Pagar: ${fmt(m.pagar)}`}
              />
            </div>
            <p className="text-[10px] capitalize" style={{ color: C.cinza }}>{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Inter ───────────────────────────────────────────────────────────────────

const INTER_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pendente_aprovacao:   { label: "Aguardando aprovação",         bg: C.ambarLt,    color: C.ambar },
  aguardando_execucao:  { label: "Aprovada, aguardando pagto",   bg: "#DBEAFE",    color: "#1D4ED8" },
  pago:                 { label: "Pago via Inter",               bg: C.verdeLt,    color: C.verde },
  rejeitado:            { label: "Rejeitada",                    bg: C.vermelhoLt, color: C.vermelho },
  cancelado:            { label: "Cancelada",                    bg: C.cinzaLt,    color: C.cinza },
};

type InterTipo = "pix" | "boleto" | "ted";
type InterPixSub = "chave" | "qrcode";

function InterBadge({ conta }: { conta: ContaPagar }) {
  if (!conta.inter_pagamento_id && !conta.inter_status) return <span className="text-[11px]" style={{ color: C.cinza }}>—</span>;
  const status = conta.inter_status ?? "pendente_aprovacao";
  const meta = INTER_STATUS[status] ?? { label: status, bg: C.cinzaLt, color: C.cinza };
  const tooltip = [
    conta.inter_tipo ? `Tipo: ${conta.inter_tipo.toUpperCase()}` : null,
    conta.inter_enviado_em ? `Enviado em: ${new Date(conta.inter_enviado_em).toLocaleString("pt-BR")}` : null,
    conta.inter_erro ? `Erro: ${conta.inter_erro}` : null,
  ].filter(Boolean).join("\n");
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function InterModal({
  conta, onClose, onSent,
}: {
  conta: ContaPagar;
  onClose: () => void;
  onSent: (resp: { inter_pagamento_id: string; inter_status: string; inter_tipo: string; inter_enviado_em: string }) => void;
}) {
  const [tipo, setTipo] = useState<InterTipo>("pix");
  const [pixSub, setPixSub] = useState<InterPixSub>("chave");
  const [chave, setChave] = useState("");
  const [qrcode, setQrcode] = useState("");
  const [descricao, setDescricao] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta_, setConta_] = useState("");
  const [digito, setDigito] = useState("");
  const [tipoConta, setTipoConta] = useState<"CC" | "CP">("CC");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [nomeFavorecido, setNomeFavorecido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido = useMemo(() => {
    if (tipo === "pix") {
      if (pixSub === "chave") return chave.trim().length > 0;
      return qrcode.trim().length > 0;
    }
    if (tipo === "boleto") return codigoBarras.trim().length > 0;
    return [banco, agencia, conta_, digito, cpfCnpj, nomeFavorecido].every(s => s.trim().length > 0);
  }, [tipo, pixSub, chave, qrcode, codigoBarras, banco, agencia, conta_, digito, cpfCnpj, nomeFavorecido]);

  async function enviar() {
    if (!valido) return;
    setEnviando(true);
    setErro(null);
    let dados: any = {};
    if (tipo === "pix") {
      dados = pixSub === "chave"
        ? { chave: chave.trim(), descricao: descricao.trim() || undefined }
        : { qrcode: qrcode.trim(), descricao: descricao.trim() || undefined };
    } else if (tipo === "boleto") {
      dados = { codigoBarras: codigoBarras.trim() };
    } else {
      dados = {
        banco: banco.trim(), agencia: agencia.trim(), conta: conta_.trim(), digito: digito.trim(),
        tipoConta, cpfCnpj: cpfCnpj.trim(), nomeFavorecido: nomeFavorecido.trim(),
      };
    }
    try {
      const res = await fetch(`/api/financeiro/inter/enviar/${conta.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, dados }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(json?.error || "Erro ao enviar ao Inter");
        setEnviando(false);
        return;
      }
      onSent({
        inter_pagamento_id: json.inter_pagamento_id ?? json.pagamento_id ?? json.id ?? "",
        inter_status: json.inter_status ?? json.status ?? "pendente_aprovacao",
        inter_tipo: tipo,
        inter_enviado_em: json.inter_enviado_em ?? new Date().toISOString(),
      });
    } catch (e: any) {
      setErro(e?.message || "Erro de rede");
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border w-full max-w-[500px] max-h-[90vh] overflow-y-auto"
        style={{ borderColor: C.cremeBorder }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Enviar ao Banco Inter</h3>
            <p className="text-[11px] mt-0.5" style={{ color: C.cinza }}>{conta.descricao} · {fmt(Number(conta.valor))}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100" aria-label="Fechar">
            <X size={16} style={{ color: C.cinza }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {erro && (
            <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: C.vermelhoLt, color: C.vermelho }}>
              {erro}
            </div>
          )}

          <Field label="Tipo de Pagamento">
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as InterTipo)}
              className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border"
              style={{ borderColor: C.cremeBorder, color: "#374151" }}
            >
              <option value="pix">Pix</option>
              <option value="boleto">Boleto</option>
              <option value="ted">TED</option>
            </select>
          </Field>

          {tipo === "pix" && (
            <>
              <div className="flex gap-4 text-xs" style={{ color: "#374151" }}>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={pixSub === "chave"} onChange={() => setPixSub("chave")} />
                  Chave Pix
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={pixSub === "qrcode"} onChange={() => setPixSub("qrcode")} />
                  Copia e Cola (QR Code)
                </label>
              </div>
              {pixSub === "chave" ? (
                <Field label="Chave Pix">
                  <Input value={chave} onChange={e => setChave(e.target.value)} placeholder="CPF, CNPJ, email, celular ou chave aleatória" />
                </Field>
              ) : (
                <Field label="Pix Copia e Cola">
                  <textarea
                    value={qrcode}
                    onChange={e => setQrcode(e.target.value)}
                    rows={4}
                    placeholder="Cole o código Pix copia-e-cola aqui"
                    className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border resize-none font-mono"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                  />
                </Field>
              )}
              <Field label="Descrição (opcional)">
                <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do pagamento" />
              </Field>
            </>
          )}

          {tipo === "boleto" && (
            <Field label="Código de Barras / Linha Digitável">
              <Input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} placeholder="Código de barras ou linha digitável" />
            </Field>
          )}

          {tipo === "ted" && (
            <>
              <Field label="Banco">
                <Input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Código do banco, ex: 341 (Itaú)" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Agência">
                  <Input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0000" />
                </Field>
                <Field label="Conta + Dígito">
                  <div className="flex gap-2">
                    <Input value={conta_} onChange={e => setConta_(e.target.value)} placeholder="Conta" />
                    <Input value={digito} onChange={e => setDigito(e.target.value)} placeholder="Dígito" className="w-20" />
                  </div>
                </Field>
              </div>
              <Field label="Tipo de Conta">
                <select
                  value={tipoConta}
                  onChange={e => setTipoConta(e.target.value as "CC" | "CP")}
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }}
                >
                  <option value="CC">Conta Corrente</option>
                  <option value="CP">Conta Poupança</option>
                </select>
              </Field>
              <Field label="CPF/CNPJ do Favorecido">
                <Input value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00" />
              </Field>
              <Field label="Nome do Favorecido">
                <Input value={nomeFavorecido} onChange={e => setNomeFavorecido(e.target.value)} placeholder="Nome completo" />
              </Field>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <button
            onClick={onClose}
            disabled={enviando}
            className="px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-40"
            style={{ borderColor: C.cremeBorder, color: C.cinza, backgroundColor: "white" }}
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!valido || enviando}
            className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar ao Inter
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ContaPagarRow (com coluna Inter) ────────────────────────────────────────

function ContaPagarRow({
  conta, vencido, onMarcarPago, onEnviarInter, payLoading,
}: {
  conta: ContaPagar;
  vencido: boolean;
  onMarcarPago: () => void;
  onEnviarInter: () => void;
  payLoading: boolean;
}) {
  const st = vencido ? SITUACAO["vencido"] : (SITUACAO[conta.situacao] ?? { label: conta.situacao, bg: C.cinzaLt, color: C.cinza, icon: Clock });
  const Icon = st.icon;
  const temInter = !!conta.inter_pagamento_id || !!conta.inter_status;
  return (
    <tr className="hover:bg-stone-50 transition-colors border-b" style={{ borderColor: C.cremeBorder }}>
      <td className="px-4 py-3 max-w-[260px]">
        <p className="text-sm truncate font-medium" style={{ color: "#1A1A1A" }}>{conta.descricao}</p>
        {conta.categoria && <p className="text-[11px]" style={{ color: C.cinza }}>{conta.categoria}</p>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: vencido ? C.vermelho : "#374151" }}>
        {fmt(Number(conta.valor))}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: vencido ? C.vermelho : "#374151" }}>
        {fmtDate(conta.data_vencimento)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: C.cinza }}>
        {fmtDate(conta.data_pagamento)}
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: st.bg, color: st.color }}
        >
          <Icon size={10} />
          {st.label}
        </span>
      </td>
      <td className="px-4 py-3">
        {temInter ? (
          <InterBadge conta={conta} />
        ) : conta.situacao === "pendente" ? (
          <button
            onClick={onEnviarInter}
            className="text-[11px] px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1 whitespace-nowrap transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#FF7A00", color: "white" }}
          >
            <Send size={10} />
            Enviar ao Inter
          </button>
        ) : (
          <span className="text-[11px]" style={{ color: C.cinza }}>—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {conta.situacao === "pendente" && (
          <button
            onClick={onMarcarPago}
            disabled={payLoading}
            className="text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-30 transition-opacity inline-flex items-center gap-1 whitespace-nowrap"
            style={{ backgroundColor: C.verdeLt, color: C.verde }}
          >
            {payLoading ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
            Marcar como Pago
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── TabPagar ────────────────────────────────────────────────────────────────

function TabPagar({ pagar }: { pagar: ContaPagar[] }) {
  const [filtro, setFiltro] = useState("todos");
  const [lista, setLista] = useState(pagar);
  const [showForm, setShowForm] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [interModalConta, setInterModalConta] = useState<ContaPagar | null>(null);
  const [form, setForm] = useState({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });

  const totalPendente = lista.filter(p => p.situacao === "pendente").reduce((s, p) => s + Number(p.valor), 0);
  const totalVencido = lista.filter(p => isVencido(p.data_vencimento, p.situacao)).reduce((s, p) => s + Number(p.valor), 0);
  const total7  = lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) >= 0 && diasAte(p.data_vencimento) <= 7).reduce((s, p) => s + Number(p.valor), 0);
  const total15 = lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) >= 0 && diasAte(p.data_vencimento) <= 15).reduce((s, p) => s + Number(p.valor), 0);
  const total30 = lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) >= 0 && diasAte(p.data_vencimento) <= 30).reduce((s, p) => s + Number(p.valor), 0);

  const qtdAtrasado  = lista.filter(p => isVencido(p.data_vencimento, p.situacao)).length;
  const qtdVenceHoje = lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) === 0).length;
  const qtdAVencer   = lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) > 0).length;

  const filtradas = useMemo(() => {
    if (filtro === "atrasado")   return lista.filter(p => isVencido(p.data_vencimento, p.situacao));
    if (filtro === "vence_hoje") return lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) === 0);
    if (filtro === "a_vencer")   return lista.filter(p => p.situacao === "pendente" && diasAte(p.data_vencimento) > 0);
    if (filtro === "todos") return lista;
    return lista.filter(p => p.situacao === filtro);
  }, [lista, filtro]);

  async function handleNovaConta() {
    if (!form.descricao.trim() || !form.valor) return;
    setFormSaving(true);
    const res = await fetch("/api/financeiro/contas-pagar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || undefined,
        categoria: form.categoria || undefined,
        obs: form.obs || undefined,
      }),
    });
    setFormSaving(false);
    if (res.ok) {
      const nova = await res.json();
      setLista(prev => [{
        id: nova.id,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || null,
        data_pagamento: null,
        situacao: "pendente",
        categoria: form.categoria || null,
        obs: form.obs || null,
      }, ...prev]);
      setForm({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });
      setShowForm(false);
    } else {
      const data = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      alert(data.error || "Erro ao criar conta a pagar");
    }
  }

  async function marcarPago(id: number) {
    setActionId(id);
    const res = await fetch(`/api/financeiro/contas-pagar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao: "pago", data_pagamento: new Date().toISOString().slice(0, 10) }),
    });
    if (res.ok) {
      setLista(prev => prev.map(p => p.id === id ? { ...p, situacao: "pago", data_pagamento: new Date().toISOString().slice(0, 10) } : p));
    } else {
      const data = await res.json().catch(() => ({ error: "Erro" }));
      alert(data.error || "Erro ao marcar como pago");
    }
    setActionId(null);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Vencido" value={fmt(totalVencido)} valueColor={C.vermelho} icon={AlertTriangle} accent={C.vermelho} sub="pagamentos em atraso" />
        <KpiCard label="Próx. 7 dias"   value={fmt(total7)}  valueColor={C.ambar} icon={Calendar} accent={C.ambar} />
        <KpiCard label="Próx. 15 dias"  value={fmt(total15)} valueColor={C.ambar} icon={Calendar} accent={C.ambar} />
        <KpiCard label="Próx. 30 dias"  value={fmt(total30)} valueColor={C.ambar} icon={Calendar} accent={C.ambar} />
      </div>

      {/* Nova conta + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancelar" : "Nova Conta a Pagar"}
        </button>

        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: "todos",      label: "Todos" },
            { key: "atrasado",   label: `Atrasado${qtdAtrasado > 0 ? ` (${qtdAtrasado})` : ""}`,     color: C.vermelho },
            { key: "vence_hoje", label: `Vence Hoje${qtdVenceHoje > 0 ? ` (${qtdVenceHoje})` : ""}`, color: C.ambar },
            { key: "a_vencer",   label: `A Vencer${qtdAVencer > 0 ? ` (${qtdAVencer})` : ""}` },
            { key: "pago",       label: "Pago" },
            { key: "cancelado",  label: "Cancelado" },
          ] as { key: string; label: string; color?: string }[]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors border"
              style={{
                backgroundColor: filtro === key ? (color ?? C.esmeralda) : "white",
                borderColor: filtro === key ? (color ?? C.esmeralda) : (color ? `${color}44` : C.cremeBorder),
                color: filtro === key ? "white" : (color ?? C.cinza),
                fontWeight: filtro === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Form nova conta */}
      {showForm && (
        <div className="rounded-xl bg-white p-5 border space-y-3" style={{ borderColor: C.cremeBorder }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Descrição *">
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </Field>
            <Field label="Valor *">
              <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            </Field>
            <Field label="Vencimento">
              <Input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
            </Field>
            <Field label="Categoria">
              <Input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
            </Field>
          </div>
          <Field label="Observações">
            <Input value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
          </Field>
          <button
            onClick={handleNovaConta}
            disabled={formSaving || !form.descricao.trim() || !form.valor}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {formSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl bg-white overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Descrição", "Valor", "Vencimento", "Pagamento", "Situação", "Inter", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.cinza }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: C.cinza }}>Nenhuma conta encontrada</td></tr>
              ) : (
                filtradas.map(p => (
                  <ContaPagarRow
                    key={p.id}
                    conta={p}
                    vencido={!!isVencido(p.data_vencimento, p.situacao)}
                    onMarcarPago={() => marcarPago(p.id)}
                    onEnviarInter={() => setInterModalConta(p)}
                    payLoading={actionId === p.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        {interModalConta && (
          <InterModal
            conta={interModalConta}
            onClose={() => setInterModalConta(null)}
            onSent={(resp) => {
              setLista(prev => prev.map(p => p.id === interModalConta.id ? {
                ...p,
                inter_pagamento_id: resp.inter_pagamento_id,
                inter_status: resp.inter_status,
                inter_tipo: resp.inter_tipo,
                inter_enviado_em: resp.inter_enviado_em,
                inter_erro: null,
              } : p));
              setInterModalConta(null);
            }}
          />
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <p className="text-xs" style={{ color: C.cinza }}>{filtradas.length} conta(s)</p>
          <p className="text-xs tabular-nums font-medium" style={{ color: C.ambar }}>
            Total pendente: {fmt(totalPendente)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── TabReceber ──────────────────────────────────────────────────────────────

// Periodo + calcPeriodo importados de @/components/ui/PeriodoFiltro

function TabReceber({ receber, saldoLiquido }: { receber: ContaReceber[]; saldoLiquido: number }) {
  const [filtro, setFiltro] = useState("todos");
  const [lista, setLista] = useState(receber);
  const [showPendentes, setShowPendentes] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [form, setForm] = useState({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });
  const [periodo, setPeriodo] = useState<Periodo>("30dias");
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [mes, setMes] = useState(hoje.slice(0, 7));

  const isRecebido = (s: string) => s === "pago" || s === "recebido";

  const { ini, fim } = calcPeriodo(periodo, { dataInicio, dataFim, mes });
  const recebidoNoPeriodo = lista.filter(r =>
    isRecebido(r.situacao) &&
    r.data_recebimento != null &&
    r.data_recebimento.slice(0, 10) >= ini &&
    r.data_recebimento.slice(0, 10) <= fim
  );

  const totalPendente = lista.filter(r => r.situacao === "pendente").reduce((s, r) => s + Number(r.valor), 0);
  const totalVencido  = lista.filter(r => isVencido(r.data_vencimento, r.situacao)).reduce((s, r) => s + Number(r.valor), 0);
  const totalLiquido  = recebidoNoPeriodo.reduce((s, r) => s + Number(r.valor_liquido ?? r.valor), 0);
  const totalTaxas    = recebidoNoPeriodo.reduce((s, r) => s + Number(r.taxas_mp ?? 0), 0);
  const total7  = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) >= 0 && diasAte(r.data_vencimento) <= 7).reduce((s, r) => s + Number(r.valor), 0);
  const total15 = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) >= 0 && diasAte(r.data_vencimento) <= 15).reduce((s, r) => s + Number(r.valor), 0);
  const total30 = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) >= 0 && diasAte(r.data_vencimento) <= 30).reduce((s, r) => s + Number(r.valor), 0);

  const qtdAtrasadoR  = lista.filter(r => isVencido(r.data_vencimento, r.situacao)).length;
  const qtdVenceHojeR = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) === 0).length;
  const qtdAVencerR   = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) > 0).length;

  const filtradas = useMemo(() => {
    let base: ContaReceber[];
    if (filtro === "atrasado")   base = lista.filter(r => isVencido(r.data_vencimento, r.situacao));
    else if (filtro === "vence_hoje") base = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) === 0);
    else if (filtro === "a_vencer")   base = lista.filter(r => r.situacao === "pendente" && diasAte(r.data_vencimento) > 0);
    else if (filtro === "todos") base = lista;
    else if (filtro === "recebido") base = lista.filter(r => isRecebido(r.situacao));
    else base = lista.filter(r => r.situacao === filtro);
    return base.filter(r => {
      if (!isRecebido(r.situacao)) return true;
      if (!r.data_recebimento) return true;
      const d = r.data_recebimento.slice(0, 10);
      return d >= ini && d <= fim;
    });
  }, [lista, filtro, ini, fim]);

  async function handleNovaConta() {
    if (!form.descricao.trim() || !form.valor) return;
    setFormSaving(true);
    const res = await fetch("/api/financeiro/contas-receber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || undefined,
        categoria: form.categoria || undefined,
        obs: form.obs || undefined,
      }),
    });
    setFormSaving(false);
    if (res.ok) {
      const nova = await res.json();
      setLista(prev => [{
        id: nova.id,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || null,
        data_recebimento: null,
        situacao: "pendente",
        categoria: form.categoria || null,
        obs: form.obs || null,
      }, ...prev]);
      setForm({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });
      setShowForm(false);
    } else {
      const data = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      alert(data.error || "Erro ao criar conta a receber");
    }
  }

  async function marcarRecebido(id: number) {
    setActionId(id);
    const res = await fetch(`/api/financeiro/contas-receber/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao: "pago", data_recebimento: new Date().toISOString().slice(0, 10) }),
    });
    if (res.ok) {
      setLista(prev => prev.map(r => r.id === id ? { ...r, situacao: "pago", data_recebimento: new Date().toISOString().slice(0, 10) } : r));
    } else {
      const data = await res.json().catch(() => ({ error: "Erro" }));
      alert(data.error || "Erro ao marcar como recebido");
    }
    setActionId(null);
  }

  const pendentes = lista.filter(r => r.situacao === "pendente");

  return (
    <div className="space-y-5">

      {/* Card Saldo Líquido — clicável */}
      <div>
        <button
          onClick={() => setShowPendentes(v => !v)}
          className="w-full text-left rounded-xl bg-white px-5 py-4 border flex items-center justify-between gap-3 hover:shadow-sm transition-shadow"
          style={{ borderColor: saldoLiquido >= 0 ? C.verde : C.vermelho, borderWidth: 1.5 }}
        >
          <div>
            <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Saldo Líquido Pendente</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: saldoLiquido >= 0 ? C.verde : C.vermelho }}>
              {fmt(saldoLiquido)}
            </p>
            <p className="text-xs mt-1" style={{ color: C.cinza }}>
              {pendentes.length} conta{pendentes.length !== 1 ? "s" : ""} pendente{pendentes.length !== 1 ? "s" : ""} · clique para ver detalhes
            </p>
          </div>
          <TrendingUp size={28} style={{ color: saldoLiquido >= 0 ? C.verde : C.vermelho, opacity: 0.4, flexShrink: 0 }} />
        </button>

        {showPendentes && (
          <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Descrição</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Vencimento</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {pendentes.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: C.cinza }}>Nenhuma conta pendente.</td></tr>
                  )}
                  {pendentes.map(r => {
                    const vencido = isVencido(r.data_vencimento, r.situacao);
                    const dias = diasAte(r.data_vencimento);
                    return (
                      <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-4 py-3 font-medium" style={{ color: "#1A1A1A" }}>
                          {r.venda_erp_id ? (
                            <a href={`/vendas/${r.venda_erp_id}`} className="hover:underline" style={{ color: C.esmeralda }}>
                              {r.descricao}
                            </a>
                          ) : r.descricao}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: vencido ? C.vermelho : C.cinza }}>
                          {fmtDate(r.data_vencimento)}
                        </td>
                        <td className="px-4 py-3">
                          {vencido ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: C.vermelhoLt, color: C.vermelho }}>
                              <AlertTriangle size={11} /> Vencido há {Math.abs(dias)} dia{Math.abs(dias) !== 1 ? "s" : ""}
                            </span>
                          ) : r.data_vencimento ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: C.verdeLt, color: C.verde }}>
                              <Clock size={11} /> Vence em {dias} dia{dias !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: C.cinza }}>Sem vencimento</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: vencido ? C.vermelho : "#374151" }}>
                          {fmt(Number(r.valor))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <p className="text-xs" style={{ color: C.vermelho }}>
                {pendentes.filter(r => isVencido(r.data_vencimento, r.situacao)).length} vencida{pendentes.filter(r => isVencido(r.data_vencimento, r.situacao)).length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs tabular-nums font-medium" style={{ color: C.cinza }}>
                Total pendente: <strong>{fmt(totalPendente)}</strong>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Vencido" value={fmt(totalVencido)} valueColor={C.vermelho} icon={AlertTriangle} accent={C.vermelho} sub="recebimentos em atraso" />
        <KpiCard label="Próx. 7 dias"   value={fmt(total7)}  valueColor={C.verde} icon={Calendar} accent={C.verde} />
        <KpiCard label="Próx. 15 dias"  value={fmt(total15)} valueColor={C.verde} icon={Calendar} accent={C.verde} />
        <KpiCard label="Próx. 30 dias"  value={fmt(total30)} valueColor={C.verde} icon={Calendar} accent={C.verde} />
      </div>

      {/* Recebido líquido com filtro de período */}
      <div className="rounded-xl bg-white border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <p className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>Já Recebido</p>
          <PeriodoFiltro
            periodo={periodo} onPeriodoChange={setPeriodo}
            dataInicio={dataInicio} dataFim={dataFim}
            onDataInicioChange={setDataInicio} onDataFimChange={setDataFim}
            mes={mes} onMesChange={setMes}
          />
        </div>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Total líquido recebido</p>
            <p className="text-xl font-semibold tabular-nums mt-0.5" style={{ color: C.verde }}>{fmt(totalLiquido)}</p>
            <p className="text-[11px] mt-0.5" style={{ color: C.cinza }}>{recebidoNoPeriodo.length} recebimento{recebidoNoPeriodo.length !== 1 ? "s" : ""} no período</p>
          </div>
          {totalTaxas > 0 && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Taxas MP</p>
              <p className="text-sm tabular-nums" style={{ color: C.ambar }}>−{fmt(totalTaxas)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nova conta + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancelar" : "Nova Conta a Receber"}
        </button>

        <div className="flex gap-1.5 flex-wrap">
          {([
            { key: "todos",      label: "Todos" },
            { key: "atrasado",   label: `Atrasado${qtdAtrasadoR > 0 ? ` (${qtdAtrasadoR})` : ""}`,     color: C.vermelho },
            { key: "vence_hoje", label: `Vence Hoje${qtdVenceHojeR > 0 ? ` (${qtdVenceHojeR})` : ""}`, color: C.ambar },
            { key: "a_vencer",   label: `A Vencer${qtdAVencerR > 0 ? ` (${qtdAVencerR})` : ""}` },
            { key: "recebido",   label: "Recebido" },
            { key: "cancelado",  label: "Cancelado" },
          ] as { key: string; label: string; color?: string }[]).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors border"
              style={{
                backgroundColor: filtro === key ? (color ?? C.esmeralda) : "white",
                borderColor: filtro === key ? (color ?? C.esmeralda) : (color ? `${color}44` : C.cremeBorder),
                color: filtro === key ? "white" : (color ?? C.cinza),
                fontWeight: filtro === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Form nova conta */}
      {showForm && (
        <div className="rounded-xl bg-white p-5 border space-y-3" style={{ borderColor: C.cremeBorder }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Descrição *"><Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></Field>
            <Field label="Valor *"><Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} /></Field>
            <Field label="Vencimento"><Input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} /></Field>
            <Field label="Categoria"><Input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} /></Field>
          </div>
          <Field label="Observações"><Input value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} /></Field>
          <button
            onClick={handleNovaConta}
            disabled={formSaving || !form.descricao.trim() || !form.valor}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {formSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl bg-white overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Descrição", "Valor", "Vencimento", "Recebimento", "Situação", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.cinza }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: C.cinza }}>Nenhuma conta encontrada</td></tr>
              ) : (
                filtradas.map(r => (
                  <ContaRow
                    key={r.id}
                    descricao={r.descricao}
                    valor={r.valor}
                    valorLiquido={r.valor_liquido}
                    taxasMp={r.taxas_mp}
                    vencimento={r.data_vencimento}
                    liquidacao={r.data_recebimento}
                    situacao={r.situacao}
                    categoria={r.categoria}
                    vencido={!!isVencido(r.data_vencimento, r.situacao)}
                    onAction={() => marcarRecebido(r.id)}
                    actionLabel="Marcar como Recebido"
                    actionLoading={actionId === r.id}
                    vendaId={r.venda_erp_id}
                    vendaNumero={r.venda_numero}
                    vendaCreatedAt={r.venda_created_at}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <p className="text-xs" style={{ color: C.cinza }}>{filtradas.length} conta(s)</p>
          <p className="text-xs tabular-nums font-medium" style={{ color: C.verde }}>
            Total a receber: {fmt(totalPendente)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── TabConciliacao ──────────────────────────────────────────────────────────

function TabConciliacao({ extratos: extratosInit, lancamentos: lancamentosInit }: { extratos: Extrato[]; lancamentos: Lancamento[] }) {
  const [extratosList, setExtratosList] = useState(extratosInit);
  const [lancamentosList, setLancamentosList] = useState(lancamentosInit);
  const [extratoSel, setExtratoSel] = useState<number | null>(extratosInit[0]?.id ?? null);
  const [reprocessando, setReprocessando] = useState<number | null>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inseridos: number; duplicados: number } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sugestoes, setSugestoes] = useState<Array<{
    lancamento: { id: number; valor: number; descricao: string | null; data_transacao: string | null; tipo: string };
    tipo_match: string;
    matches: Array<{ id: number; valor: number; descricao: string | null; fornecedor_nome?: string; cliente_nome?: string }>;
  }>>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  const carregarSugestoes = useCallback(async () => {
    setLoadingSugestoes(true);
    try {
      const res = await fetch("/api/financeiro/conciliar");
      if (res.ok) {
        const data = await res.json();
        setSugestoes(data.sugestoes ?? []);
      }
    } catch (e) { console.error("Erro ao carregar sugestões:", e); }
    setLoadingSugestoes(false);
  }, []);

  useEffect(() => { carregarSugestoes(); }, [carregarSugestoes]);

  async function handleUploadOFX(file: File) {
    if (!file.name.toLowerCase().endsWith(".ofx")) {
      setUploadError("Apenas arquivos .ofx são aceitos");
      return;
    }
    setUploading(true);
    setUploadResult(null);
    setUploadError("");
    const fd = new FormData();
    fd.append("arquivo", file);
    try {
      const res = await fetch("/api/financeiro/upload-ofx", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setUploadResult({ inseridos: data.inseridos, duplicados: data.duplicados });
        const [eRes, lRes] = await Promise.all([
          fetch("/api/financeiro/extratos"),
          fetch("/api/financeiro/lancamentos"),
        ]);
        if (eRes.ok) { const e = await eRes.json(); setExtratosList(e); }
        if (lRes.ok) { const l = await lRes.json(); setLancamentosList(l); }
        carregarSugestoes();
      } else {
        setUploadError(data.error ?? "Erro ao processar OFX");
      }
    } catch {
      setUploadError("Falha no upload");
    }
    setUploading(false);
    setTimeout(() => { setUploadResult(null); setUploadError(""); }, 6000);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUploadOFX(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUploadOFX(file);
    e.target.value = "";
  }

  async function confirmarConciliacao(lancamentoId: number, match: { id: number }, tipoMatch: string) {
    setConfirmandoId(lancamentoId);
    const body: Record<string, number> = { lancamento_id: lancamentoId };
    if (tipoMatch === "conta_pagar") body.conta_pagar_id = match.id;
    else body.conta_receber_id = match.id;
    try {
      const res = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSugestoes(prev => prev.filter(s => s.lancamento.id !== lancamentoId));
        setLancamentosList(prev => prev.map(l => l.id === lancamentoId ? { ...l, conciliado: true } : l));
      }
    } catch { /* silenciar */ }
    setConfirmandoId(null);
  }

  async function handleReprocessar(extratoId: number) {
    setReprocessando(extratoId);
    await dispararWebhook("processar-ofx", { extrato_id: extratoId });
    setReprocessando(null);
  }

  const lancamentos = lancamentosList;
  const extratos = extratosList;

  const lançamentosFiltrados = useMemo(
    () => (extratoSel ? lancamentos.filter(l => l.extrato_id === extratoSel) : lancamentos),
    [lancamentos, extratoSel]
  );

  const totalC = lançamentosFiltrados.filter(l => l.tipo === "C").reduce((s, l) => s + Number(l.valor), 0);
  const totalD = lançamentosFiltrados.filter(l => l.tipo === "D").reduce((s, l) => s + Number(l.valor), 0);
  const conciliados = lançamentosFiltrados.filter(l => l.conciliado).length;

  return (
    <div className="space-y-5">
      {/* Upload OFX */}
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "#1A1A1A" }}>Importar Extrato OFX</p>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl p-8 text-center cursor-pointer transition-colors bg-white"
          style={{
            backgroundColor: dragging ? C.esmeraldaLt : "white",
            border: `2px dashed ${dragging ? C.esmeralda : C.cremeBorder}`,
          }}
        >
          <input ref={fileInputRef} type="file" accept=".ofx" onChange={handleFileSelect} className="hidden" />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" style={{ color: C.esmeralda }} />
              <p className="text-sm" style={{ color: C.cinza }}>Processando arquivo...</p>
            </div>
          ) : (
            <>
              <FileUp size={28} className="mx-auto mb-2" style={{ color: C.cinza }} />
              <p className="text-sm font-medium" style={{ color: "#374151" }}>
                Arraste um arquivo .ofx ou clique para selecionar
              </p>
            </>
          )}
        </div>
        {uploadResult && (
          <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: C.verdeLt, color: C.verde }}>
            <CheckCircle size={13} /> {uploadResult.inseridos} inseridos, {uploadResult.duplicados} duplicados
          </div>
        )}
        {uploadError && (
          <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: C.vermelhoLt, color: C.vermelho }}>
            <AlertTriangle size={13} /> {uploadError}
          </div>
        )}
      </div>

      {/* Sugestões de conciliação */}
      {sugestoes.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: "#1A1A1A" }}>
            Sugestões de Conciliação ({sugestoes.length})
          </p>
          <div className="space-y-2">
            {sugestoes.map(s => (
              <div key={s.lancamento.id} className="rounded-xl bg-white p-4 border" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-semibold"
                        style={{
                          backgroundColor: s.lancamento.tipo === "C" ? C.verdeLt : C.vermelhoLt,
                          color: s.lancamento.tipo === "C" ? C.verde : C.vermelho,
                        }}
                      >
                        {s.lancamento.tipo === "C" ? "Entrada" : "Saída"}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: "#1A1A1A" }}>{fmt(s.lancamento.valor)}</span>
                      <span className="text-xs" style={{ color: C.cinza }}>{fmtDate(s.lancamento.data_transacao)}</span>
                    </div>
                    <p className="text-sm truncate" style={{ color: "#374151" }}>{s.lancamento.descricao ?? "Sem descrição"}</p>
                  </div>
                  <Link2 size={14} style={{ color: C.cinza }} />
                </div>
                <div className="space-y-1.5">
                  {s.matches.map(m => (
                    <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: C.cremeBg }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate font-medium" style={{ color: "#374151" }}>
                          {m.descricao ?? (s.tipo_match === "conta_pagar" ? (m as Record<string, unknown>).fornecedor_nome as string : (m as Record<string, unknown>).cliente_nome as string) ?? "—"}
                        </p>
                        <p className="text-[11px] tabular-nums" style={{ color: C.cinza }}>{fmt(m.valor)}</p>
                      </div>
                      <button
                        onClick={() => confirmarConciliacao(s.lancamento.id, m, s.tipo_match)}
                        disabled={confirmandoId === s.lancamento.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-30 transition-opacity inline-flex items-center gap-1 whitespace-nowrap"
                        style={{ backgroundColor: C.verde, color: "white" }}
                      >
                        {confirmandoId === s.lancamento.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                        Confirmar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingSugestoes && (
        <div className="flex items-center gap-2 text-xs" style={{ color: C.cinza }}>
          <Loader2 size={12} className="animate-spin" /> Carregando sugestões...
        </div>
      )}

      {/* Extratos */}
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: "#1A1A1A" }}>Extratos importados</p>
        {extratos.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center border border-dashed" style={{ borderColor: C.cremeBorder }}>
            <FileUp size={24} className="mx-auto mb-2" style={{ color: C.cinza }} />
            <p className="text-sm" style={{ color: C.cinza }}>
              Nenhum extrato importado. Arraste um arquivo .ofx acima.
            </p>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {extratos.map(e => (
              <button
                key={e.id}
                onClick={() => setExtratoSel(e.id)}
                className="rounded-lg px-3 py-2 text-left transition-colors bg-white border"
                style={{
                  borderColor: extratoSel === e.id ? C.esmeralda : C.cremeBorder,
                  backgroundColor: extratoSel === e.id ? C.esmeraldaLt : "white",
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Landmark size={12} style={{ color: C.esmeralda }} />
                  <span className="text-xs font-medium" style={{ color: "#1A1A1A" }}>
                    {e.banco ?? "Banco"} — #{e.id}
                  </span>
                  {e.processado && <CheckCircle size={11} style={{ color: C.verde }} />}
                </div>
                <p className="text-[10px]" style={{ color: C.cinza }}>
                  {e.total_lancamentos} lançamentos · {fmtDate(e.data_inicio)}
                  {e.data_fim ? ` – ${fmtDate(e.data_fim)}` : ""}
                </p>
                <button
                  onClick={ev => { ev.stopPropagation(); handleReprocessar(e.id); }}
                  disabled={reprocessando === e.id}
                  className="mt-1.5 text-[10px] flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30"
                  style={{ color: C.esmeralda }}
                >
                  <RefreshCw size={9} className={reprocessando === e.id ? "animate-spin" : ""} />
                  {reprocessando === e.id ? "Enviando..." : "Reprocessar"}
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini stats extrato */}
      {extratoSel && lançamentosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Lançamentos" value={lançamentosFiltrados.length} />
          <KpiCard label="Entradas (C)" value={fmt(totalC)} valueColor={C.verde} />
          <KpiCard label="Saídas (D)" value={fmt(totalD)} valueColor={C.vermelho} />
          <KpiCard label="Conciliados" value={conciliados} valueColor={conciliados > 0 ? C.verde : C.cinza} />
        </div>
      )}

      {/* Tabela lançamentos */}
      {lançamentosFiltrados.length > 0 && (
        <div className="rounded-xl bg-white overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                  {["Data", "Tipo", "Valor", "Descrição", "FITID", "Conciliado"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.cinza }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lançamentosFiltrados.map(l => (
                  <tr key={l.id} className="hover:bg-stone-50 transition-colors border-b" style={{ borderColor: C.cremeBorder }}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "#374151" }}>{fmtDate(l.data_transacao)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-semibold"
                        style={{
                          backgroundColor: l.tipo === "C" ? C.verdeLt : C.vermelhoLt,
                          color: l.tipo === "C" ? C.verde : C.vermelho,
                        }}
                      >
                        {l.tipo === "C" ? "↑ Entrada" : "↓ Saída"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: l.tipo === "C" ? C.verde : C.vermelho }}>
                      {fmt(Number(l.valor))}
                    </td>
                    <td className="px-4 py-3 max-w-[240px] truncate text-sm" style={{ color: "#374151" }}>{l.descricao ?? l.memo ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[10px]" style={{ color: C.cinza }}>{l.fitid ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {l.conciliado
                        ? <CheckCircle size={14} style={{ color: C.verde }} className="mx-auto" />
                        : <RefreshCw size={12} style={{ color: C.cinza }} className="mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TabConciliacaoPendente ───────────────────────────────────────────────────

function TabConciliacaoPendente() {
  const [lista, setLista] = useState<ConciliacaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [modalItem, setModalItem] = useState<ConciliacaoPendente | null>(null);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/financeiro/conciliacao-pendente?periodo=30")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setLista(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function marcarConciliado() {
    if (!modalItem) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/financeiro/conciliacao-pendente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamento_id: modalItem.id, obs: obs.trim() || undefined }),
      });
      if (res.ok) {
        setLista(prev => prev.filter(p => p.id !== modalItem.id));
        setModalItem(null);
        setObs("");
      } else {
        const d = await res.json().catch(() => ({}));
        setErro(d.error || "Erro ao conciliar");
      }
    } catch { setErro("Erro de rede"); }
    setSalvando(false);
    setConfirmandoId(null);
  }

  const fmtDatetime = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho explicativo */}
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: C.ambarLt, backgroundColor: "#FFFBEB" }}>
        <ShieldCheck size={18} style={{ color: C.ambar, flexShrink: 0, marginTop: 1 }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Pagamentos Manuais Aguardando Verificação</p>
          <p className="text-xs mt-0.5" style={{ color: "#B45309" }}>
            Estes pagamentos foram confirmados manualmente (ID MP digitado pelo vendedor). Verifique cada ID no site do Mercado Pago e marque como conciliado após conferência.
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl bg-white overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Venda", "Cliente", "Valor", "ID MP", "Gateway", "Confirmado em", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-semibold" style={{ color: C.cinza }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center">
                  <Loader2 size={18} className="animate-spin mx-auto" style={{ color: C.cinza }} />
                </td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: C.cinza }}>
                  Nenhuma conciliação pendente — tudo conferido! ✓
                </td></tr>
              ) : lista.map(p => (
                <tr key={p.id} className="hover:bg-stone-50 transition-colors border-b" style={{ borderColor: C.cremeBorder }}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.venda_id ? (
                      <a href={`/vendas/${p.venda_id}`} className="text-sm font-medium hover:underline" style={{ color: C.esmeralda }}>
                        {p.numero_venda ? `#${p.numero_venda}` : `Venda ${p.venda_id}`}
                      </a>
                    ) : <span className="text-sm" style={{ color: C.cinza }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm max-w-[160px] truncate" style={{ color: "#374151" }}>
                    {p.cliente_nome ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: "#374151" }}>
                    {fmt(p.valor)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] max-w-[140px] truncate" style={{ color: C.cinza }} title={p.gateway_id ?? ""}>
                    {p.gateway_id ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: C.cinza }}>{p.gateway ?? "—"}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: C.cinza }}>{fmtDatetime(p.data_confirmacao)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setModalItem(p); setObs(""); setErro(null); }}
                      disabled={confirmandoId === p.id}
                      className="text-[11px] px-2.5 py-1 rounded-lg font-medium inline-flex items-center gap-1 whitespace-nowrap transition-opacity hover:opacity-90"
                      style={{ backgroundColor: C.verdeLt, color: C.verde }}
                    >
                      <CheckCircle size={10} />
                      Marcar Conciliado
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <p className="text-xs" style={{ color: C.cinza }}>{lista.length} pendente{lista.length !== 1 ? "s" : ""}</p>
          <p className="text-xs tabular-nums font-medium" style={{ color: C.ambar }}>
            Total: {fmt(lista.reduce((s, p) => s + p.valor, 0))}
          </p>
        </div>
      </div>

      {/* Modal confirmar conciliação */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => { setModalItem(null); setObs(""); }}>
          <div
            className="bg-white rounded-2xl border w-full max-w-[420px]"
            style={{ borderColor: C.cremeBorder }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <div>
                <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Confirmar Conciliação</h3>
                <p className="text-[11px] mt-0.5" style={{ color: C.cinza }}>
                  ID MP: {modalItem.gateway_id ?? "—"} · {fmt(modalItem.valor)}
                </p>
              </div>
              <button onClick={() => { setModalItem(null); setObs(""); }} className="p-1 rounded-lg hover:bg-stone-100">
                <X size={16} style={{ color: C.cinza }} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs" style={{ color: C.cinza }}>
                Confirme que verificou este ID no Mercado Pago e o pagamento foi recebido corretamente.
              </p>
              {erro && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: C.vermelhoLt, color: C.vermelho }}>{erro}</div>
              )}
              <Field label="Observação (opcional)">
                <Input
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Ex: Conferido no painel MP às 14h"
                />
              </Field>
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <button
                onClick={() => { setModalItem(null); setObs(""); }}
                disabled={salvando}
                className="px-4 py-2 rounded-lg text-sm border font-medium disabled:opacity-40"
                style={{ borderColor: C.cremeBorder, color: C.cinza, backgroundColor: "white" }}
              >
                Cancelar
              </button>
              <button
                onClick={marcarConciliado}
                disabled={salvando}
                className="px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field + Input helpers ────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg bg-white px-3 py-2 text-sm outline-none border ${props.className ?? ""}`}
      style={{ borderColor: C.cremeBorder, color: "#374151", ...(props.style ?? {}) }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── TabCaixa ────────────────────────────────────────────────────────────────
// palette escuro igual ao dashboard de ouro
const D = {
  bg:      "#0F2922",
  border:  "#1C3D32",
  muted:   "#4A7568",
  sage:    "#80A795",
  verde:   "#4A9F73",
  vermelho:"#E05C5C",
  dourado: "#DB9864",
};

function TabCaixa({ caixa, baixas: baixasInit, podeBaixar }: {
  caixa: CaixaDinheiro[];
  baixas: CaixaBaixa[];
  podeBaixar: boolean;
}) {
  const [baixas, setBaixas] = useState(baixasInit);
  const [caixaList, setCaixaList] = useState(caixa);
  const [dando, setDando] = useState(false);
  const [obs, setObs] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<"pendentes" | "historico">("pendentes");
  const [formaFiltro, setFormaFiltro] = useState<string>("Todos");
  const [gatewaysFiltro, setGatewaysFiltro] = useState<string[]>([]);
  const [estornoTarget, setEstornoTarget] = useState<CaixaDinheiro | null>(null);
  const [estornando, setEstornando] = useState(false);
  const [estornoErro, setEstornoErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/configuracoes/gateways")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setGatewaysFiltro(d.filter((g: any) => g.ativo && g.nome !== "Banco").map((g: any) => g.nome)); })
      .catch(() => {});
  }, []);

  // Mapeia formas legadas para o gateway correspondente
  const MP_FORMAS = ["Cartão de Crédito", "Pix", "PIX", "Manual (MP)", "Mercado Pago"];
  function gatewayEfetivo(forma: string) {
    if (MP_FORMAS.includes(forma)) return "Mercado Pago";
    return forma;
  }

  const [periodoC, setPeriodoC] = useState<Periodo>("30dias");
  const hojeStr = new Date().toISOString().slice(0, 10);
  const [dataInicioC, setDataInicioC] = useState(hojeStr);
  const [dataFimC, setDataFimC] = useState(hojeStr);
  const [mesC, setMesC] = useState(hojeStr.slice(0, 7));
  const { ini: cIni, fim: cFim } = calcPeriodo(periodoC, { dataInicio: dataInicioC, dataFim: dataFimC, mes: mesC });

  const inPeriod = (d: string | null) => !!d && d.slice(0, 10) >= cIni && d.slice(0, 10) <= cFim;
  const sumList  = (list: CaixaDinheiro[]) => list.reduce((s, r) => s + Number(r.valor), 0);

  // Apenas Dinheiro tem baixa física
  const pendentes = caixaList.filter(r => r.forma === "Dinheiro" && r.caixa_baixa_id == null);
  const totalPendente = sumList(pendentes);

  const byForma        = (f: string) => caixaList.filter(r => r.forma === f);
  const byFormaPeriodo = (f: string) => byForma(f).filter(r => inPeriod(r.data_confirmacao));

  // Métricas Dinheiro (para a view específica)
  const entradasDinheiroAntes = sumList(byForma("Dinheiro").filter(r => !!r.data_confirmacao && r.data_confirmacao.slice(0, 10) < cIni));
  const saidasAntes    = baixas.filter(b => !!b.created_at && b.created_at.slice(0, 10) < cIni).reduce((s, b) => s + b.total, 0);
  const saldoAnterior  = entradasDinheiroAntes - saidasAntes;
  const saidasPeriodo  = baixas.filter(b => inPeriod(b.created_at)).reduce((s, b) => s + b.total, 0);
  const saldoPeriodoDin = sumList(byFormaPeriodo("Dinheiro")) - saidasPeriodo;

  const listaFiltrada = (formaFiltro === "Todos" ? caixaList : caixaList.filter(r => gatewayEfetivo(r.forma) === formaFiltro))
    .filter(r => inPeriod(r.data_confirmacao));

  const showBaixa = formaFiltro === "Todos" || formaFiltro === "Dinheiro";

  const fmtDatetime = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const FORMA_COLOR: Record<string, { bg: string; text: string }> = {
    "Mercado Pago": { bg: "#EFF6FF",    text: "#1D4ED8" },
    "Dinheiro":     { bg: C.verdeLt,    text: C.verde },
    "Ouro":         { bg: "#FEF3C7",    text: "#92400E" },
    "Banco":        { bg: "#F3E8FF",    text: "#7C3AED" },
  };
  const gatewayColor = (f: string) => FORMA_COLOR[gatewayEfetivo(f)] ?? { bg: C.cinzaLt, text: C.cinza };

  async function confirmarEstorno() {
    if (!estornoTarget) return;
    setEstornando(true);
    setEstornoErro(null);
    try {
      const res = await fetch(`/api/vendas/${estornoTarget.venda_id}/pagamentos/${estornoTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "estornado" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setEstornoErro(json.error || "Erro ao estornar"); setEstornando(false); return; }
      setCaixaList(prev => prev.filter(r => r.id !== estornoTarget.id));
      setEstornoTarget(null);
    } catch { setEstornoErro("Erro de rede"); }
    setEstornando(false);
  }

  async function darBaixa() {
    setDando(true);
    setErro(null);
    try {
      const res = await fetch("/api/financeiro/caixa/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obs: obs.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Erro ao dar baixa"); setDando(false); return; }
      setBaixas(prev => [{ id: json.id, total: json.total, qtd_pagamentos: json.qtd_pagamentos, realizado_nome: json.realizado_nome, obs: obs.trim() || null, created_at: json.created_at }, ...prev]);
      setCaixaList(prev => prev.map(r => r.forma === "Dinheiro" && r.caixa_baixa_id == null ? { ...r, caixa_baixa_id: json.id } : r));
      setObs("");
      setShowConfirm(false);
      setViewTab("historico");
    } catch { setErro("Erro de rede"); }
    setDando(false);
  }

  const PagamentosTable = ({ lista, showForma, showEstornar }: { lista: CaixaDinheiro[]; showForma?: boolean; showEstornar?: boolean }) => {
    const colCount = 4 + (showForma ? 1 : 0) + (showEstornar ? 1 : 0);
    return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Venda</th>
              {showForma && <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Forma</th>}
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Consultora</th>
              <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Data</th>
              <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Valor</th>
              {showEstornar && <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Ação</th>}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-sm" style={{ color: C.cinza }}>Nenhum registro.</td></tr>
            )}
            {lista.map(r => {
              const fc = gatewayColor(r.forma);
              return (
                <tr key={r.id} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: C.cremeBorder }}>
                  <td className="px-4 py-3">
                    <a href={`/vendas/${r.venda_id}`} className="font-semibold hover:underline" style={{ color: C.esmeralda }}>#{r.numero_venda}</a>
                  </td>
                  {showForma && (
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: fc.bg, color: fc.text }}>{r.forma}</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>{r.vendedor_nome || <span style={{ color: C.cinza }}>—</span>}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: C.cinza }}>{fmtDatetime(r.data_confirmacao)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.verde }}>{fmt(Number(r.valor))}</td>
                  {showEstornar && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEstornoErro(null); setEstornoTarget(r); }}
                        className="text-xs px-2.5 py-1 rounded-lg border font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1"
                        style={{ borderColor: C.vermelho, color: C.vermelho, backgroundColor: "white" }}
                      >
                        <RefreshCw size={11} /> Estornar
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lista.length > 0 && (
        <div className="px-4 py-3 border-t flex justify-end" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <p className="text-xs tabular-nums font-medium" style={{ color: C.verde }}>
            Total: {fmt(sumList(lista))}
          </p>
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.cinza }}>
          Caixa — Financeiro do Período
        </p>
        <PeriodoFiltro
          periodo={periodoC} onPeriodoChange={setPeriodoC}
          dataInicio={dataInicioC} dataFim={dataFimC}
          onDataInicioChange={setDataInicioC} onDataFimChange={setDataFimC}
          mes={mesC} onMesChange={setMesC}
        />
      </div>

      {/* Filtro por gateway */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {["Todos", ...gatewaysFiltro].map(f => {
          const fc = f === "Todos" ? null : FORMA_COLOR[f];
          const isActive = formaFiltro === f;
          return (
            <button key={f} onClick={() => setFormaFiltro(f)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors border font-medium"
              style={{
                backgroundColor: isActive ? (fc?.text ?? C.esmeralda) : "white",
                borderColor: isActive ? (fc?.text ?? C.esmeralda) : C.cremeBorder,
                color: isActive ? "white" : (fc?.text ?? C.cinza),
              }}
            >{f}</button>
          );
        })}
      </div>

      {/* KPI Cards */}
      {formaFiltro === "Todos" ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Total no Período"  value={fmt(sumList(listaFiltrada))}                   valueColor={C.esmeralda}  icon={Wallet}          accent={C.esmeralda} />
          <KpiCard label="Mercado Pago"      value={fmt(sumList(listaFiltrada.filter(r => gatewayEfetivo(r.forma) === "Mercado Pago")))} valueColor="#1D4ED8" icon={Smartphone} accent="#1D4ED8" />
          <KpiCard label="Dinheiro"          value={fmt(sumList(byFormaPeriodo("Dinheiro")))}      valueColor={C.verde}      icon={Banknote}        accent={C.verde}      sub={`${pendentes.length} sem baixa`} />
          <KpiCard label="Ouro"              value={fmt(sumList(listaFiltrada.filter(r => gatewayEfetivo(r.forma) === "Ouro")))}         valueColor="#92400E" icon={TrendingUp} accent="#92400E" />
          <KpiCard label="Baixas Realizadas" value={fmt(saidasPeriodo)}                            valueColor={C.vermelho}   icon={ArrowUpCircle}   accent={C.vermelho} />
        </div>
      ) : formaFiltro === "Dinheiro" ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Saldo Anterior"    value={fmt(saldoAnterior)}                    valueColor={C.cinza}                                           icon={Wallet}          accent={C.cinza} />
          <KpiCard label="Entradas"          value={fmt(sumList(byFormaPeriodo("Dinheiro")))} valueColor={C.verde}                                        icon={ArrowDownCircle} accent={C.verde} />
          <KpiCard label="Saídas"            value={fmt(saidasPeriodo)}                    valueColor={C.vermelho}                                        icon={ArrowUpCircle}   accent={C.vermelho} />
          <KpiCard label="Saldo do Período"  value={fmt(saldoPeriodoDin)}                  valueColor={saldoPeriodoDin >= 0 ? C.verde : C.vermelho}       icon={TrendingUp}      accent={saldoPeriodoDin >= 0 ? C.verde : C.vermelho} />
          <div className="rounded-xl bg-white p-4 border" style={{ borderColor: C.ambar + "99" }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.cinza }}>Saldo Atual</p>
                <span className="text-[8px] font-medium px-1.5 py-px rounded-full" style={{ backgroundColor: C.ambarLt, color: C.ambar }}>⚡ tempo real</span>
              </div>
              <Banknote size={14} style={{ color: C.ambar }} />
            </div>
            <p className="text-xl font-semibold tabular-nums" style={{ color: totalPendente > 0 ? C.ambar : C.cinza }}>{fmt(totalPendente)}</p>
            <p className="text-[11px] mt-0.5" style={{ color: C.cinza }}>{pendentes.length} sem baixa</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard label="Total no Período" value={fmt(sumList(listaFiltrada))}                                     valueColor={C.esmeralda} icon={ArrowDownCircle} accent={C.esmeralda} />
          <KpiCard label="Qtd. Transações"  value={String(listaFiltrada.length)}                                   valueColor={C.cinza}     icon={Landmark}        accent={C.cinza} />
          <KpiCard label="Total Histórico"  value={fmt(sumList(caixaList.filter(r => gatewayEfetivo(r.forma) === formaFiltro)))}   valueColor={C.cinza}     icon={TrendingUp}      accent={C.cinza} />
        </div>
      )}

      {/* Baixa de Dinheiro */}
      {showBaixa && podeBaixar && pendentes.length > 0 && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.ambar, backgroundColor: "#FFFBEB" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold" style={{ color: "#92400E" }}>
                {pendentes.length} pagamento{pendentes.length !== 1 ? "s" : ""} em dinheiro aguardando baixa · {fmt(totalPendente)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: C.ambar }}>Dinheiro físico que precisa ser retirado do caixa e registrado</p>
            </div>
            <button onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              <CheckCircle size={14} /> Dar Baixa no Caixa
            </button>
          </div>
        </div>
      )}

      {showBaixa && !podeBaixar && pendentes.length > 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-center gap-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.ambarLt }}>
          <AlertTriangle size={14} style={{ color: C.ambar }} />
          <p className="text-xs" style={{ color: C.ambar }}>
            {pendentes.length} pagamento{pendentes.length !== 1 ? "s" : ""} em dinheiro ({fmt(totalPendente)}) — apenas gerentes e admins podem dar baixa.
          </p>
        </div>
      )}

      {/* Modal confirmação baixa */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-2xl border w-full max-w-md p-6 space-y-4" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Confirmar Baixa de Caixa</h3>
            <div className="rounded-xl p-4 border space-y-1" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Total a baixar</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: C.esmeralda }}>{fmt(totalPendente)}</p>
              <p className="text-xs" style={{ color: C.cinza }}>{pendentes.length} pagamento{pendentes.length !== 1 ? "s" : ""} em dinheiro</p>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "#374151" }}>Observação (opcional)</label>
              <input value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Ex: Entregue ao caixa central, cofre, etc."
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} />
            </div>
            {erro && <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: C.vermelhoLt, color: C.vermelho }}>{erro}</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} disabled={dando}
                className="px-4 py-2 rounded-lg text-sm border font-medium disabled:opacity-40"
                style={{ borderColor: C.cremeBorder, color: C.cinza }}>Cancelar</button>
              <button onClick={darBaixa} disabled={dando}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                {dando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmar Baixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmação estorno */}
      {estornoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !estornando && setEstornoTarget(null)}>
          <div className="bg-white rounded-2xl border w-full max-w-md p-6 space-y-4" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold" style={{ color: "#1A1A1A" }}>Estornar Pagamento</h3>
            <div className="rounded-xl p-4 border space-y-1" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: C.cinza }}>Venda #{estornoTarget.numero_venda} · {estornoTarget.forma}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: C.vermelho }}>{fmt(Number(estornoTarget.valor))}</p>
              <p className="text-xs" style={{ color: C.cinza }}>{estornoTarget.vendedor_nome ?? "—"} · {fmtDatetime(estornoTarget.data_confirmacao)}</p>
            </div>
            <p className="text-xs" style={{ color: C.cinza }}>
              Este pagamento será marcado como <strong>estornado</strong>. Se todos os pagamentos da venda forem estornados, ela poderá ser cancelada na tela da venda.
            </p>
            {estornoErro && <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: C.vermelhoLt, color: C.vermelho }}>{estornoErro}</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setEstornoTarget(null)} disabled={estornando}
                className="px-4 py-2 rounded-lg text-sm border font-medium disabled:opacity-40"
                style={{ borderColor: C.cremeBorder, color: C.cinza }}>Cancelar</button>
              <button onClick={confirmarEstorno} disabled={estornando}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: C.vermelho, color: "white" }}>
                {estornando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs (Dinheiro) ou tabela simples (outros) */}
      {formaFiltro === "Dinheiro" ? (
        <>
          <div className="flex gap-1 rounded-xl p-1 border" style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}>
            {(["pendentes", "historico"] as const).map(t => (
              <button key={t} onClick={() => setViewTab(t)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                style={{ backgroundColor: viewTab === t ? C.esmeralda : "transparent", color: viewTab === t ? C.creme : C.cinza }}>
                {t === "pendentes" ? `Pendentes de Baixa (${pendentes.length})` : `Histórico de Baixas (${baixas.length})`}
              </button>
            ))}
          </div>

          {viewTab === "pendentes" && <PagamentosTable lista={pendentes} showEstornar={podeBaixar} />}
          {viewTab === "historico" && (
            <div className="space-y-3">
              {baixas.length === 0 && (
                <div className="rounded-xl border p-6 text-center" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-sm" style={{ color: C.cinza }}>Nenhuma baixa registrada ainda.</p>
                </div>
              )}
              {baixas.map(b => {
                const pagsDaBaixa = caixaList.filter(r => r.caixa_baixa_id === b.id);
                return (
                  <details key={b.id} className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                    <summary className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none list-none" style={{ backgroundColor: C.cremeBg }}>
                      <div className="flex items-center gap-3">
                        <CheckCircle size={14} style={{ color: C.verde }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Baixa #{b.id} · {fmt(b.total)}</p>
                          <p className="text-[11px]" style={{ color: C.cinza }}>
                            {b.qtd_pagamentos} pagamento{b.qtd_pagamentos !== 1 ? "s" : ""} · por {b.realizado_nome ?? "—"} · {fmtDatetime(b.created_at)}
                          </p>
                        </div>
                      </div>
                      {b.obs && <span className="text-xs italic" style={{ color: C.cinza }}>{b.obs}</span>}
                    </summary>
                    <PagamentosTable lista={pagsDaBaixa} />
                  </details>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <PagamentosTable lista={listaFiltrada} showForma={formaFiltro !== "Dinheiro"} showEstornar={podeBaixar} />
      )}
    </div>
  );
}

type Tab = "pagar" | "receber" | "caixa" | "conciliacao_pendente" | "bancario";

export default function FinanceiroClient({ pagar, receber, extratos, lancamentos, caixaPagamentos, caixaBaixas, userRole, defaultTab }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? "pagar");
  const [cofre, setCofre] = useState<CofreOuro | null>(null);

  useEffect(() => {
    fetch("/api/financeiro/cofre-ouro")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.total_transacoes > 0) setCofre(d); })
      .catch(() => {});
  }, []);

  const isFinanceiro = ["admin", "desenvolvedor", "gerente_fabrica", "gerente_loja"].includes(userRole ?? "");

  const totalReceber = receber.filter(r => r.situacao === "pendente").reduce((s, r) => s + Number(r.valor), 0);

  const tabs: { key: Tab; label: string; icon: any; badge?: string }[] = [
    { key: "pagar",   label: "A Pagar",   icon: ArrowUpCircle,   badge: pagar.filter(p => p.situacao === "pendente").length > 0 ? String(pagar.filter(p => p.situacao === "pendente").length) : undefined },
    { key: "receber", label: "A Receber", icon: ArrowDownCircle, badge: receber.filter(r => r.situacao === "pendente").length > 0 ? String(receber.filter(r => r.situacao === "pendente").length) : undefined },
    { key: "caixa",   label: "Caixa",     icon: Banknote,        badge: caixaPagamentos.filter(r => r.forma === "Dinheiro" && r.caixa_baixa_id == null).length > 0 ? String(caixaPagamentos.filter(r => r.forma === "Dinheiro" && r.caixa_baixa_id == null).length) : undefined },
    { key: "bancario", label: "Bancário", icon: Landmark },
    ...(isFinanceiro ? [{ key: "conciliacao_pendente" as Tab, label: "Conciliação MP", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="px-3 md:px-6 py-4 md:py-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-7 rounded-full" style={{ backgroundColor: C.esmeralda }} />
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "#1A1A1A" }}>
            Financeiro
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.cinza }}>
            Contas a Pagar / Receber · Conciliação Bancária
          </p>
        </div>
      </div>

      {/* Card Cofre de Ouro (só aparece se há transações em ouro) */}
      {cofre && (
        <div className="rounded-xl border p-4" style={{ borderColor: "#D97706", backgroundColor: "#FFFBEB" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <CircleDollarSign size={18} style={{ color: "#D97706" }} />
              <p className="text-sm font-semibold" style={{ color: "#92400E" }}>Cofre de Ouro</p>
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "#B45309" }}>Últimos 30d</p>
                <p className="text-base font-bold tabular-nums" style={{ color: "#92400E" }}>
                  {cofre.gramas_30d.toFixed(2)}g
                </p>
                <p className="text-[11px]" style={{ color: "#B45309" }}>{fmt(cofre.valor_brl_30d)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "#B45309" }}>Total acumulado</p>
                <p className="text-base font-bold tabular-nums" style={{ color: "#92400E" }}>
                  {cofre.total_gramas.toFixed(2)}g
                </p>
                <p className="text-[11px]" style={{ color: "#B45309" }}>{fmt(cofre.total_valor_brl)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "#B45309" }}>Preço médio/g</p>
                <p className="text-base font-bold tabular-nums" style={{ color: "#92400E" }}>
                  {fmt(cofre.preco_medio_grama)}
                </p>
                <p className="text-[11px]" style={{ color: "#B45309" }}>{cofre.total_transacoes} transação(ões)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {tab === "pagar"                && <TabPagar pagar={pagar} />}
      {tab === "receber"              && <TabReceber receber={receber} saldoLiquido={totalReceber} />}
      {tab === "caixa"                && <TabCaixa caixa={caixaPagamentos} baixas={caixaBaixas} podeBaixar={["admin","desenvolvedor","gerente_loja","gerente_fabrica"].includes(userRole ?? "")} />}
      {tab === "bancario"             && <TabConciliacao extratos={extratos} lancamentos={lancamentos} />}
      {tab === "conciliacao_pendente" && <TabConciliacaoPendente />}
    </div>
  );
}
