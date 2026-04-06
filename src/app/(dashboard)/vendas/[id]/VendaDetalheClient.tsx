"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Truck, Package,
  CreditCard, FileText, User, RefreshCw, Video, Share2, Copy, Check as CheckIcon,
  Download, Send,
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
interface ItemVenda {
  id:             number;
  produto_id:     number;
  nome_produto:   string;
  sku:            string | null;
  quantidade:     number;
  preco_lista:    number;
  pct_desconto:   number;
  preco_unitario: number;
  total_item:     number;
  pct_comissao:   number;
  valor_comissao: number;
  observacao:     string | null;
}

interface Pagamento {
  id:               number;
  forma:            string;
  gateway:          string | null;
  valor:            number;
  parcelas:         number;
  status:           string;
  data_confirmacao: string | null;
}

interface Venda {
  id:                  number;
  numero_venda:        string;
  cliente_id:          number | null;
  cliente_nome:        string | null;
  cliente_cpf_cnpj:    string | null;
  cliente_email:       string | null;
  cliente_telefone:    string | null;
  vendedor_id:         number | null;
  vendedor_nome:       string | null;
  data_venda:          string;
  data_entrega:        string | null;
  total_produtos:      number;
  total_desconto:      number;
  total_frete:         number;
  total_venda:         number;
  total_comissao:      number;
  total_pago:          number;
  situacao:            string;
  forma_envio:         string | null;
  forma_frete:         string | null;
  observacoes:         string | null;
  observacoes_internas: string | null;
  video_obs_interna:   string | null;
  tiny_sync_status:    string | null;
  bloqueado:           boolean;
  qtd_itens:           number;
  itens:               ItemVenda[];
  pagamentos:          Pagamento[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const SITUACAO_LABEL: Record<string, string> = {
  rascunho:  "Rascunho",
  aprovado:  "Aprovado",
  enviado:   "Enviado",
  cancelado: "Cancelado",
  concluido: "Concluído",
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

// Transições de situação permitidas
const PROXIMA_SITUACAO: Record<string, { label: string; value: string; icon: React.ElementType }[]> = {
  rascunho:  [{ label: "Aprovar", value: "aprovado",  icon: CheckCircle }],
  aprovado:  [{ label: "Marcar Enviado", value: "enviado", icon: Truck }, { label: "Concluir", value: "concluido", icon: CheckCircle }],
  enviado:   [{ label: "Concluir", value: "concluido", icon: CheckCircle }],
  cancelado: [],
  concluido: [],
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  vendaId:      number;
  role:         string;
  vendedorId:   number | null;
  isFullAccess: boolean;
}

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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function VendaDetalheClient({ vendaId, isFullAccess }: Props) {
  const router = useRouter();

  const [venda,    setVenda]    = useState<Venda | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [updating,  setUpdating]  = useState(false);
  const [updErr,    setUpdErr]    = useState("");
  const [sharing,   setSharing]   = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [enviandoTiny, setEnviandoTiny] = useState(false);
  const [tinyMsg, setTinyMsg]       = useState<{ type: "ok" | "erro"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/vendas/${vendaId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVenda(await res.json() as Venda);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar venda");
    } finally {
      setLoading(false);
    }
  }, [vendaId]);

  useEffect(() => { load(); }, [load]);

  async function changeSituacao(s: string) {
    if (!venda) return;
    setUpdating(true);
    setUpdErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: s }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setUpdErr(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setUpdating(false);
    }
  }

  async function cancelar() {
    if (!venda || !confirm("Cancelar esta venda?")) return;
    setUpdating(true);
    setUpdErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}/cancelar`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setUpdErr(e instanceof Error ? e.message : "Erro ao cancelar");
    } finally {
      setUpdating(false);
    }
  }

  async function confirmarPagamento(pagId: number) {
    if (!venda) return;
    setUpdating(true);
    setUpdErr("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}/pagamentos/${pagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado" }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setUpdErr(e instanceof Error ? e.message : "Erro ao confirmar pagamento");
    } finally {
      setUpdating(false);
    }
  }

  async function compartilhar() {
    if (!venda) return;
    setSharing(true);
    try {
      const res  = await fetch(`/api/vendas/${venda.id}/compartilhar`, { method: "POST" });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const url = `${window.location.origin}/orcamento/${data.token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback — silent
    } finally {
      setSharing(false);
    }
  }

  // ── Gerar PDF (client-side) ──────────────────────────────────────────────────
  async function gerarPdf() {
    if (!venda) return;
    setGerandoPdf(true);
    try {
      const dados: OrcamentoPDF = {
        numero_venda:    venda.numero_venda,
        cliente_nome:    venda.cliente_nome ?? "Sem cliente",
        cliente_email:   venda.cliente_email ?? undefined,
        cliente_telefone: venda.cliente_telefone ?? undefined,
        cliente_cpf_cnpj: venda.cliente_cpf_cnpj ?? undefined,
        data_venda:      venda.data_venda,
        data_entrega:    venda.data_entrega ?? undefined,
        total_produtos:  venda.total_produtos,
        total_desconto:  venda.total_desconto,
        total_frete:     venda.total_frete,
        total_venda:     venda.total_venda,
        forma_envio:     venda.forma_envio ?? undefined,
        observacoes:     venda.observacoes ?? undefined,
        itens: venda.itens.map((i) => ({
          nome:           i.nome_produto,
          sku:            i.sku ?? "—",
          quantidade:     i.quantidade,
          preco_lista:    i.preco_lista,
          desconto_pct:   i.pct_desconto,
          preco_unitario: i.preco_unitario,
          total:          i.total_item,
        })),
      };
      const doc = gerarPDFOrcamento(dados);
      doc.save(`orcamento-${venda.numero_venda}.pdf`);
    } catch {
      // silent fallback
    } finally {
      setGerandoPdf(false);
    }
  }

  // ── Enviar pro Tiny ──────────────────────────────────────────────────────────
  async function enviarTiny() {
    if (!venda) return;
    setEnviandoTiny(true);
    setTinyMsg(null);
    try {
      const res = await fetch(`/api/vendas/${venda.id}/enviar-tiny`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTinyMsg({ type: "ok", text: data.message ?? "Enviado com sucesso" });
      await load();
    } catch (e) {
      setTinyMsg({ type: "erro", text: e instanceof Error ? e.message : "Erro ao enviar" });
    } finally {
      setEnviandoTiny(false);
      setTimeout(() => setTinyMsg(null), 6000);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin" style={{ color: C.esmeralda }} />
      </div>
    );
  }

  if (error || !venda) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-red-600 mb-4">{error || "Venda não encontrada"}</p>
        <Link href="/vendas" className="text-sm underline" style={{ color: C.esmeralda }}>
          Voltar para vendas
        </Link>
      </div>
    );
  }

  const situacaoStyle   = SITUACAO_COLOR[venda.situacao] ?? SITUACAO_COLOR.rascunho;
  const proximasAcoes   = PROXIMA_SITUACAO[venda.situacao] ?? [];
  const podeCancelar    = isFullAccess && !["cancelado", "concluido"].includes(venda.situacao);
  const totalDesconto   = venda.itens.reduce((s, i) => s + (i.preco_lista - i.preco_unitario) * i.quantidade, 0);

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl mx-auto pb-24">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/vendas"
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            style={{ color: "#6B7280" }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className="text-xl font-semibold"
                style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
              >
                {venda.numero_venda}
              </h2>
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: situacaoStyle.bg, color: situacaoStyle.text }}
              >
                {SITUACAO_LABEL[venda.situacao] ?? venda.situacao}
              </span>
              {venda.bloqueado && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  Bloqueada
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              {fmtDate(venda.data_venda)}
              {venda.vendedor_nome && ` · ${venda.vendedor_nome}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Gerar PDF */}
          <button
            onClick={gerarPdf}
            disabled={gerandoPdf || loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-gray-50"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            title="Baixar PDF do orçamento"
          >
            {gerandoPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            PDF
          </button>

          {/* Enviar pro Tiny — só fullAccess */}
          {isFullAccess && (
            <button
              onClick={enviarTiny}
              disabled={enviandoTiny || loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-gray-50"
              style={{
                borderColor: venda.tiny_sync_status === "sincronizado" ? "#86EFAC" : C.cremeBorder,
                color: venda.tiny_sync_status === "erro" ? "#EF4444" : C.esmeralda,
              }}
              title={
                venda.tiny_sync_status === "sincronizado"
                  ? "Reenviar para o Tiny"
                  : venda.tiny_sync_status === "erro"
                    ? "Tentar novamente — houve erro"
                    : "Enviar pedido ao Tiny"
              }
            >
              {enviandoTiny ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {venda.tiny_sync_status === "sincronizado" ? "Reenvar Tiny" : "Enviar Tiny"}
            </button>
          )}

          {/* Compartilhar link */}
          <button
            onClick={compartilhar}
            disabled={sharing || loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 hover:bg-gray-50"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            title="Copiar link do orçamento"
          >
            {sharing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : copied ? (
              <CheckIcon size={13} />
            ) : (
              <Share2 size={13} />
            )}
            {copied ? "Copiado!" : "Compartilhar"}
          </button>

          {/* Reload */}
          <button
            onClick={load}
            disabled={loading || updating}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
            style={{ color: "#6B7280" }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Toast Tiny */}
      {tinyMsg && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-xs font-medium text-center"
          style={{
            backgroundColor: tinyMsg.type === "ok" ? "#D1FAE5" : "#FEE2E2",
            color: tinyMsg.type === "ok" ? "#065F46" : "#991B1B",
          }}
        >
          {tinyMsg.text}
        </div>
      )}

      <div className="flex flex-col gap-4">

        {/* ── Cliente ── */}
        <Section icon={User} title="Cliente">
          {venda.cliente_nome ? (
            <div className="space-y-0.5">
              <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{venda.cliente_nome}</p>
              {venda.cliente_cpf_cnpj && (
                <p className="text-xs" style={{ color: "#6B7280" }}>{venda.cliente_cpf_cnpj}</p>
              )}
              <div className="flex gap-3 flex-wrap mt-1">
                {venda.cliente_email && (
                  <p className="text-xs" style={{ color: "#6B7280" }}>{venda.cliente_email}</p>
                )}
                {venda.cliente_telefone && (
                  <p className="text-xs" style={{ color: "#6B7280" }}>{venda.cliente_telefone}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#9CA3AF" }}>Sem cliente vinculado</p>
          )}
        </Section>

        {/* ── Produtos ── */}
        <Section icon={Package} title={`Produtos (${venda.qtd_itens})`}>
          {venda.itens.length === 0 ? (
            <p className="text-sm text-center py-3" style={{ color: "#9CA3AF" }}>Nenhum produto</p>
          ) : (
            <div className="space-y-2">
              {venda.itens.map(item => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                  style={{ borderColor: C.cremeBorder }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{item.nome_produto}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      {item.sku && `${item.sku} · `}
                      {item.quantidade}× {fmt(item.preco_lista)}
                      {item.pct_desconto > 0 && ` −${item.pct_desconto}%`}
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs font-semibold tabular-nums" style={{ color: C.esmeralda }}>
                        {fmt(item.total_item)}
                      </span>
                      {isFullAccess && item.pct_comissao > 0 && (
                        <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                          Comissão: {item.pct_comissao}% = {fmt(item.valor_comissao)}
                        </span>
                      )}
                    </div>
                    {item.observacao && (
                      <p className="text-xs mt-1 italic" style={{ color: "#9CA3AF" }}>{item.observacao}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Totais */}
              <div className="pt-2 space-y-1 border-t" style={{ borderColor: C.cremeBorder }}>
                {[
                  { label: "Produtos",   value: venda.total_produtos, show: true },
                  { label: "Desconto",   value: -totalDesconto,        show: totalDesconto > 0 },
                  { label: "Frete",      value: venda.total_frete,     show: venda.total_frete > 0 },
                  { label: "Total",      value: venda.total_venda,     show: true, bold: true },
                ].filter(r => r.show).map(r => (
                  <div key={r.label} className={`flex items-center justify-between text-sm ${r.bold ? "font-semibold" : ""}`}>
                    <span style={{ color: r.bold ? C.esmeralda : "#6B7280" }}>{r.label}</span>
                    <span className="tabular-nums" style={{ color: r.bold ? C.esmeralda : "#374151" }}>
                      {fmt(r.value ?? 0)}
                    </span>
                  </div>
                ))}
                {isFullAccess && venda.total_comissao > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
                    <span>Comissão total</span>
                    <span className="tabular-nums">{fmt(venda.total_comissao)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* ── Pagamentos ── */}
        <Section icon={CreditCard} title="Pagamentos">
          {venda.pagamentos.length === 0 ? (
            <p className="text-sm text-center py-3" style={{ color: "#9CA3AF" }}>Nenhum pagamento</p>
          ) : (
            <div className="space-y-2">
              {venda.pagamentos.map(pag => {
                const sc = PAG_STATUS_COLOR[pag.status] ?? PAG_STATUS_COLOR.pendente;
                return (
                  <div
                    key={pag.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                    style={{ borderColor: C.cremeBorder }}
                  >
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
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                      >
                        {pag.status}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: C.esmeralda }}>
                        {fmt(pag.valor)}
                      </span>
                      {isFullAccess && pag.status === "pendente" && (
                        <button
                          onClick={() => confirmarPagamento(pag.id)}
                          disabled={updating}
                          className="text-xs px-2 py-1 rounded-lg font-medium disabled:opacity-50 transition-opacity"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}
                        >
                          Confirmar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Resumo pago / saldo */}
              <div className="pt-2 space-y-1 border-t" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "#6B7280" }}>Pago (confirmado)</span>
                  <span className="tabular-nums" style={{ color: "#374151" }}>{fmt(venda.total_pago)}</span>
                </div>
                {venda.total_venda - venda.total_pago > 0.01 && (
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span style={{ color: "#D97706" }}>Saldo pendente</span>
                    <span className="tabular-nums" style={{ color: "#D97706" }}>
                      {fmt(venda.total_venda - venda.total_pago)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* ── Envio ── */}
        {(venda.forma_envio || venda.data_entrega || venda.total_frete > 0) && (
          <Section icon={Truck} title="Envio">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {venda.forma_envio && (
                <>
                  <span style={{ color: "#6B7280" }}>Forma de envio</span>
                  <span style={{ color: "#374151" }}>{venda.forma_envio}</span>
                </>
              )}
              {venda.data_entrega && (
                <>
                  <span style={{ color: "#6B7280" }}>Entrega prevista</span>
                  <span style={{ color: "#374151" }}>{fmtDate(venda.data_entrega)}</span>
                </>
              )}
              {venda.total_frete > 0 && (
                <>
                  <span style={{ color: "#6B7280" }}>Frete</span>
                  <span style={{ color: "#374151" }} className="tabular-nums">{fmt(venda.total_frete)}</span>
                </>
              )}
            </div>
          </Section>
        )}

        {/* ── Observações ── */}
        {(venda.observacoes || venda.video_obs_interna) && (
          <Section icon={FileText} title="Observações">
            <div className="space-y-3">
              {venda.observacoes && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "#6B7280" }}>Observações ao cliente</p>
                  <p className="text-sm" style={{ color: "#374151" }}>{venda.observacoes}</p>
                </div>
              )}
              {isFullAccess && venda.video_obs_interna && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Video size={13} style={{ color: C.esmeralda }} />
                    <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Observação interna (vídeo)</p>
                  </div>
                  <video
                    src={venda.video_obs_interna}
                    controls
                    className="w-full rounded-lg bg-black max-h-56"
                  />
                </div>
              )}
            </div>
          </Section>
        )}

      </div>

      {/* ── Footer: ações de status ── */}
      {(proximasAcoes.length > 0 || podeCancelar) && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 border-t"
          style={{ backgroundColor: "#fff", borderColor: C.cremeBorder }}
        >
          {updErr && (
            <p className="text-xs text-red-600 text-center mb-2">{updErr}</p>
          )}
          <div className="flex gap-2 max-w-3xl mx-auto">
            {podeCancelar && (
              <button
                onClick={cancelar}
                disabled={updating}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-50 transition-opacity"
                style={{ borderColor: "#FCA5A5", color: "#EF4444" }}
              >
                {updating ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Cancelar
              </button>
            )}
            {proximasAcoes.map(acao => (
              <button
                key={acao.value}
                onClick={() => changeSituacao(acao.value)}
                disabled={updating}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {updating
                  ? <Loader2 size={14} className="animate-spin" />
                  : <acao.icon size={14} />
                }
                {acao.label}
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
