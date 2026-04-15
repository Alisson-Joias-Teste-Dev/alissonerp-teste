"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, Loader2, CheckCircle, XCircle, Trash2,
  Send, FileText, CreditCard, Ticket, ArrowRight,
} from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface DevolucaoItem {
  id: number;
  devolucao_id: number;
  item_venda_id: number;
  produto_id: number;
  nome_produto: string | null;
  sku: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  condicao: "pendente" | "aprovado_retorno" | "reprovado_descarte" | "garantia";
  inspecao_por: string | null;
  inspecao_em: string | null;
  inspecao_observacao: string | null;
}

interface ValeTrocaSumario {
  id: number;
  numero: string;
  valor_original: number;
  valor_disponivel: number;
  status: string;
  venda_utilizado_id: number | null;
  utilizado_em: string | null;
  vale_origem_id: number | null;
  created_at: string;
}

interface Reembolso {
  id: number;
  metodo: string;
  valor: number;
  mp_payment_id: string | null;
  mp_refund_id: string | null;
  mp_status: string | null;
  mp_erro: string | null;
  conta_pagar_id: number | null;
  status: string;
  processado_em: string | null;
  created_at: string;
}

interface Devolucao {
  id: number;
  numero: string;
  venda_id: number;
  numero_venda: string;
  tipo: "parcial" | "total";
  motivo: string | null;
  status: string;
  tipo_compensacao: "vale_troca" | "reembolso_mp" | "reembolso_manual";
  valor_total_devolvido: number;
  valor_retido: number;
  valor_compensacao: number;
  percentual_retencao: number;
  foi_entregue: boolean;
  tarefa_id: number | null;
  criado_por: string | null;
  aprovador_id: string | null;
  aprovado_em: string | null;
  rejeitado_motivo: string | null;
  created_at: string;
  updated_at: string;
  cliente_nome: string | null;
  itens: DevolucaoItem[];
  vales_troca: ValeTrocaSumario[];
  reembolsos: Reembolso[];
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  rascunho:             { bg: "#F3F4F6", text: "#6B7280" },
  aguardando_aprovacao: { bg: "#FEF9C3", text: "#713F12" },
  aprovado:             { bg: "#DBEAFE", text: "#1E40AF" },
  rejeitado:            { bg: "#FEE2E2", text: "#991B1B" },
  concluido:            { bg: "#D1FAE5", text: "#065F46" },
  cancelado:            { bg: "#E5E7EB", text: "#374151" },
};

const CONDICAO_LABEL: Record<string, string> = {
  pendente:            "Pendente",
  aprovado_retorno:    "Aprovado p/ retorno",
  reprovado_descarte:  "Descarte",
  garantia:            "Garantia",
};
const CONDICAO_COLOR: Record<string, { bg: string; text: string }> = {
  pendente:            { bg: "#FEF9C3", text: "#713F12" },
  aprovado_retorno:    { bg: "#D1FAE5", text: "#065F46" },
  reprovado_descarte:  { bg: "#FEE2E2", text: "#991B1B" },
  garantia:            { bg: "#DBEAFE", text: "#1E40AF" },
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface Props { id: number; role: string; }

export default function DevolucaoDetalheClient({ id, role }: Props) {
  const router = useRouter();
  void role;

  const [dev, setDev] = useState<Devolucao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [inspModal, setInspModal] = useState<{
    itemId: number;
    condicao: DevolucaoItem["condicao"];
    observacao: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/devolucoes/${id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setDev((await res.json()) as Devolucao);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function solicitarAprovacao() {
    if (!dev) return;
    if (!confirm("Enviar devolução para aprovação?")) return;
    setUpdating(true);
    setError("");
    try {
      const res = await fetch(`/api/devolucoes/${dev.id}/solicitar-aprovacao`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao solicitar aprovação");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setUpdating(false);
    }
  }

  async function cancelar() {
    if (!dev) return;
    if (!confirm("Cancelar esta devolução?")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/devolucoes/${dev.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao cancelar");
      router.push("/devolucoes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setUpdating(false);
    }
  }

  function abrirInspecao(itemId: number, condicao: DevolucaoItem["condicao"]) {
    setInspModal({ itemId, condicao, observacao: "" });
  }

  async function confirmarInspecao() {
    if (!dev || !inspModal) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/devolucoes/${dev.id}/inspecionar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: inspModal.itemId,
          condicao: inspModal.condicao,
          observacao: inspModal.observacao || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao inspecionar");
      setInspModal(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setUpdating(false);
    }
  }

  async function concluir() {
    if (!dev) return;
    if (!confirm("Concluir devolução? Isso gerará vale/reembolso e movimentará estoque.")) return;
    setUpdating(true);
    setError("");
    try {
      const res = await fetch(`/api/devolucoes/${dev.id}/concluir`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erro ao concluir");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
      </div>
    );
  }

  if (!dev) {
    return (
      <div className="px-6 py-8 max-w-4xl mx-auto">
        <p className="text-center text-sm text-red-600">{error || "Devolução não encontrada"}</p>
        <div className="text-center mt-3">
          <Link href="/devolucoes" className="text-sm underline" style={{ color: C.esmeralda }}>
            ← Voltar à lista
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_COLOR[dev.status] ?? STATUS_COLOR.rascunho;
  const todosInspecionados = dev.itens.every((it) => it.condicao !== "pendente");

  return (
    <div className="px-3 md:px-6 py-4 md:py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/devolucoes" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full" style={{ backgroundColor: C.esmeralda }} />
            <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-playfair)", color: "#1A1A1A" }}>
              {dev.numero}
            </h2>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
            >
              {STATUS_LABEL[dev.status] ?? dev.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            disabled={loading || updating}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
            style={{ color: "#6B7280" }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div
          className="mb-3 px-4 py-3 rounded-lg border flex items-start gap-2"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}
        >
          <XCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">Erro</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Banner rejeitado */}
      {dev.status === "rejeitado" && dev.rejeitado_motivo && (
        <div
          className="mb-3 px-4 py-3 rounded-lg border"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}
        >
          <p className="text-sm font-medium">Devolução rejeitada</p>
          <p className="text-xs mt-0.5">{dev.rejeitado_motivo}</p>
        </div>
      )}

      {/* Resumo + vínculo venda */}
      <div className="rounded-xl border p-4 mb-4 bg-white" style={{ borderColor: C.cremeBorder }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <InfoCell label="Venda">
            <Link href={`/vendas/${dev.venda_id}`} className="font-medium underline" style={{ color: C.esmeralda }}>
              #{dev.numero_venda}
            </Link>
          </InfoCell>
          <InfoCell label="Cliente" value={dev.cliente_nome ?? "—"} />
          <InfoCell label="Tipo" value={dev.tipo} />
          <InfoCell label="Data" value={fmtDate(dev.created_at)} />
          <InfoCell label="Foi entregue" value={dev.foi_entregue ? "Sim" : "Não"} />
          <InfoCell label="Retenção" value={`${Number(dev.percentual_retencao).toFixed(0)}%`} />
          <InfoCell label="Via" value={
            dev.tipo_compensacao === "vale_troca" ? "🎟️ Vale-Troca"
              : dev.tipo_compensacao === "reembolso_mp" ? "💳 Reembolso MP"
              : "📄 Reembolso Manual"
          } />
          {dev.tarefa_id && (
            <InfoCell label="Tarefa aprovação">
              <Link href={`/tarefas`} className="text-sm underline" style={{ color: C.esmeralda }}>
                #{dev.tarefa_id}
              </Link>
            </InfoCell>
          )}
        </div>
        {dev.motivo && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
            <p className="text-xs font-medium mb-0.5" style={{ color: "#9CA3AF" }}>Motivo</p>
            <p className="text-sm" style={{ color: "#374151" }}>{dev.motivo}</p>
          </div>
        )}
      </div>

      {/* Cards valores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <ValorCard label="Valor Total Devolvido" valor={dev.valor_total_devolvido} cor="#1A1A1A" />
        <ValorCard label="Valor Retido" valor={dev.valor_retido} cor="#D97706" />
        <ValorCard label="Compensação" valor={dev.valor_compensacao} cor={C.esmeralda} destaque />
      </div>

      {/* Itens */}
      <div className="rounded-xl border overflow-hidden mb-4 bg-white" style={{ borderColor: C.cremeBorder }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <h3 className="text-sm font-bold" style={{ color: "#374151" }}>Itens</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: C.cremeBg }}>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Produto</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Qtd</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Unit.</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Subtotal</th>
                <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Condição</th>
                <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Observação</th>
                <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {dev.itens.map((it) => {
                const cc = CONDICAO_COLOR[it.condicao] ?? CONDICAO_COLOR.pendente;
                const podeInspecionar = dev.status === "aprovado" && it.condicao === "pendente";
                return (
                  <tr key={it.id} className="border-t" style={{ borderColor: C.cremeBorder }}>
                    <td className="px-3 py-2.5" style={{ color: "#1A1A1A" }}>
                      <p className="font-medium">{it.nome_produto ?? `Produto #${it.produto_id}`}</p>
                      {it.sku && <p className="text-xs" style={{ color: "#9CA3AF" }}>{it.sku}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#374151" }}>{it.quantidade}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(it.valor_unitario)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: C.esmeralda }}>{fmt(it.valor_total)}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: cc.bg, color: cc.text }}>
                        {CONDICAO_LABEL[it.condicao] ?? it.condicao}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[200px] truncate" style={{ color: "#6B7280" }}>
                      {it.inspecao_observacao ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {podeInspecionar && (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => abrirInspecao(it.id,"aprovado_retorno")}
                            disabled={updating}
                            title="Aprovar retorno"
                            className="p-1.5 rounded hover:bg-green-50 disabled:opacity-40"
                            style={{ color: "#065F46" }}
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => abrirInspecao(it.id,"reprovado_descarte")}
                            disabled={updating}
                            title="Descartar"
                            className="p-1.5 rounded hover:bg-red-50 disabled:opacity-40"
                          >
                            🗑️
                          </button>
                          <button
                            onClick={() => abrirInspecao(it.id,"garantia")}
                            disabled={updating}
                            title="Garantia"
                            className="p-1.5 rounded hover:bg-blue-50 disabled:opacity-40"
                          >
                            🔧
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compensação */}
      <div className="rounded-xl border p-4 mb-4 bg-white" style={{ borderColor: C.cremeBorder }}>
        <div className="flex items-center gap-2 mb-3">
          {dev.tipo_compensacao === "vale_troca" ? <Ticket size={16} style={{ color: C.esmeralda }} />
            : dev.tipo_compensacao === "reembolso_mp" ? <CreditCard size={16} style={{ color: C.esmeralda }} />
            : <FileText size={16} style={{ color: C.esmeralda }} />}
          <h3 className="text-sm font-bold" style={{ color: "#374151" }}>Compensação</h3>
        </div>

        {dev.tipo_compensacao === "vale_troca" && (
          <>
            {dev.vales_troca.length === 0 ? (
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                Vale-troca será gerado ao concluir a devolução.
              </p>
            ) : (
              <div className="space-y-2">
                {dev.vales_troca.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg border" style={{ borderColor: C.cremeBorder }}>
                    <div>
                      <Link href={`/vale-troca`} className="font-semibold text-sm underline" style={{ color: C.esmeralda }}>
                        {v.numero}
                      </Link>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>
                        Status: {v.status} {v.utilizado_em ? `— usado em venda #${v.venda_utilizado_id}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>Saldo</p>
                      <p className="font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(v.valor_disponivel)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(dev.tipo_compensacao === "reembolso_mp" || dev.tipo_compensacao === "reembolso_manual") && (
          <>
            {dev.reembolsos.length === 0 ? (
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                Reembolso será processado ao concluir a devolução.
              </p>
            ) : (
              <div className="space-y-2">
                {dev.reembolsos.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: "#374151" }}>{r.metodo}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: r.status === "concluido" ? "#D1FAE5" : r.status === "falhou" ? "#FEE2E2" : "#FEF9C3",
                          color: r.status === "concluido" ? "#065F46" : r.status === "falhou" ? "#991B1B" : "#713F12",
                        }}>
                        {r.status}
                      </span>
                    </div>
                    <p className="font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(r.valor)}</p>
                    {r.mp_payment_id && <p className="text-xs" style={{ color: "#9CA3AF" }}>MP Payment: {r.mp_payment_id}</p>}
                    {r.mp_refund_id && <p className="text-xs" style={{ color: "#9CA3AF" }}>MP Refund: {r.mp_refund_id}</p>}
                    {r.mp_erro && <p className="text-xs" style={{ color: "#991B1B" }}>Erro: {r.mp_erro}</p>}
                    {r.conta_pagar_id && <p className="text-xs" style={{ color: "#9CA3AF" }}>Conta a pagar: #{r.conta_pagar_id}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Ações */}
      {(dev.status === "rascunho" || dev.status === "aprovado") && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {dev.status === "rascunho" && (
            <>
              <button
                onClick={cancelar}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-40"
                style={{ borderColor: "#FECACA", color: "#991B1B" }}
              >
                <Trash2 size={14} /> Cancelar
              </button>
              <button
                onClick={solicitarAprovacao}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {updating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Solicitar Aprovação
              </button>
            </>
          )}
          {dev.status === "aprovado" && todosInspecionados && (
            <button
              onClick={concluir}
              disabled={updating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: "#059669", color: "#fff" }}
            >
              {updating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Concluir Devolução
            </button>
          )}
          {dev.status === "aprovado" && !todosInspecionados && (
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Inspecione todos os itens antes de concluir. <ArrowRight size={12} className="inline" />
            </p>
          )}
        </div>
      )}

      {/* Modal de Inspeção */}
      {inspModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => !updating && setInspModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl p-5"
            style={{ backgroundColor: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1" style={{ color: "#1A1A1A" }}>
              {inspModal.condicao === "aprovado_retorno" && "✅ Aprovar retorno ao estoque"}
              {inspModal.condicao === "reprovado_descarte" && "🗑️ Descartar item"}
              {inspModal.condicao === "garantia" && "🔧 Encaminhar para garantia"}
            </h3>
            <p className="text-xs mb-3" style={{ color: "#6B7280" }}>
              Observação (opcional):
            </p>
            <textarea
              value={inspModal.observacao}
              onChange={(e) => setInspModal({ ...inspModal, observacao: e.target.value })}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: C.cremeBorder }}
              placeholder="Ex: peça chegou riscada; embalagem aberta; etc"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setInspModal(null)}
                disabled={updating}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarInspecao}
                disabled={updating}
                className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {updating ? <Loader2 size={14} className="animate-spin inline" /> : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────

function InfoCell({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>{label}</p>
      {children ?? <p className="font-medium text-sm" style={{ color: "#1A1A1A" }}>{value ?? "—"}</p>}
    </div>
  );
}

function ValorCard({ label, valor, cor, destaque }: { label: string; valor: number; cor: string; destaque?: boolean }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: destaque ? C.esmeralda : C.cremeBorder,
        backgroundColor: destaque ? C.esmeraldaLt : "#fff",
      }}
    >
      <p className="text-xs" style={{ color: "#9CA3AF" }}>{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: cor }}>
        {fmt(valor)}
      </p>
    </div>
  );
}
