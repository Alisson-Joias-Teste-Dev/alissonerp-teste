"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Gem,
  DollarSign,
  Settings2,
  Pencil,
  Trash2,
  Plus,
  X,
  Save,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle,
  Loader2,
  Clock,
  Eye,
  Send,
  Download,
  BarChart2,
  ChevronDown,
  ChevronRight,
  PlayCircle,
} from "lucide-react";
import type { FaixaPedra } from "./page";
import GerenciarPedrasModal from "@/components/produtos/GerenciarPedrasModal";
import RegrasPedrasTab from "./RegrasPedrasTab";
import { useErrorStore } from "@/stores/errorStore";
import {
  getPricingFactors,
  prepareCategories,
  getCategoryPoints,
  getLimitPrice,
  calcularPrecoSync,
  calcularCustoBase,
  type CurvaConfig,
  type CurvaCategoriaInput,
  type CurvaCategoriaPreparada,
  type PontoCategoriaChip,
} from "@/lib/curva-precificacao";

// ─── Paleta ────────────────────────────────────────────────────────────────────
const P = {
  bg: "#f9fafb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  sage: "#6b7280",
  muted: "#9ca3af",
  verde: "#16a34a",
  vermelho: "#dc2626",
  amber: "#d97706",
  blue: "#2563eb",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Tab = "markup-ouro" | "markup-pedras" | "cotacoes" | "regras" | "pendentes";

interface Cotacao {
  ouro_brl_g: number;
  dollar_brl: number;
  fator: number;
  updated_at: string | null;
}

interface Config {
  preco_limiar_subir: string;
  preco_limiar_descer: string;
  preco_arredondamento: string;
}

interface SimulacaoItem {
  produto_id: number;
  nome: string;
  sku: string;
  peso: number;
  preco_atual: number;
  preco_novo: number;
  variacao: number;
  markup?: number | null;
}

interface SimulacaoStats {
  produtos_afetados: number;
  variacao_media: number;
  variacao_min: number;
  variacao_max: number;
  produtos_sobem: number;
  produtos_descem: number;
  produtos_sem_mudanca: number;
}

interface SimulacaoResultado {
  faixa_nome: string;
  markup_anterior: number;
  simulacao: SimulacaoItem[];
  simulacao_total: SimulacaoItem[];
  stats: SimulacaoStats;
  cotacao: number;
}

interface ModalTarget {
  tipo: "ouro" | "pedra";
  faixa_id: number;
  faixa_nome: string;
  markup_anterior: number;
  allowDirectSave?: boolean;
  onSalvarDireto?: (markupNovo: number) => Promise<void>;
}

interface Pendente {
  id: number;
  tipo: string;
  faixa_id: number;
  faixa_nome: string;
  markup_anterior: string;
  markup_novo: string;
  produtos_afetados: number;
  variacao_media: string;
  variacao_min: string;
  variacao_max: string;
  simulacao_json: SimulacaoItem[] | null;
  status: string;
  criado_por: string;
  data_criacao: string;
  criado_por_nome: string | null;
  aprovado_por: string | null;
  aprovado_por_nome: string | null;
  data_aprovacao: string | null;
  motivo_rejeicao: string | null;
}

interface Props {
  faixasPedrasInicial: FaixaPedra[];
  configInicial: Record<string, string>;
  cotacaoInicial: Cotacao;
  currentUserId: string;
  currentUserRole: string;
  curvaConfigInicial: CurvaConfig | null;
  curvaCategoriasInicial: CurvaCategoriaInput[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMarkup(v: string | number) {
  return `${Number(v).toFixed(1)}×`;
}

function fmtBrl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

function calcArredondamento(valor: number, tipo: string): number {
  if (tipo === "centena") return Math.round(valor / 100) * 100;
  if (tipo === "dezena") return Math.round(valor / 10) * 10;
  return Math.round(valor);
}

function fmtVariacao(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({
  label,
  icon: Icon,
  active,
  badge,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors relative"
      style={{
        backgroundColor: active ? P.text : "transparent",
        color: active ? "#fff" : P.sage,
      }}
    >
      <Icon size={15} />
      {label}
      {badge != null && badge > 0 && (
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
          style={{ backgroundColor: "#ef4444", color: "#fff" }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

// ─── Toast simples ────────────────────────────────────────────────────────────
function Toast({ msg, tipo }: { msg: string; tipo: "ok" | "erro" }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
      style={{
        backgroundColor: tipo === "ok" ? "#dcfce7" : "#fef2f2",
        color: tipo === "ok" ? P.verde : P.vermelho,
        border: `1px solid ${tipo === "ok" ? "#bbf7d0" : "#fecaca"}`,
      }}
    >
      {tipo === "ok" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
      {msg}
    </div>
  );
}

// ─── Modal de Simulação ───────────────────────────────────────────────────────
function ModalSimulacao({
  target,
  currentUserId,
  onClose,
  onEnviado,
}: {
  target: ModalTarget;
  currentUserId: string;
  onClose: () => void;
  onEnviado: () => void;
}) {
  const [markupNovo, setMarkupNovo] = useState(String(target.markup_anterior));
  const [simulando, setSimulando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [resultado, setResultado] = useState<SimulacaoResultado | null>(null);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [buscaPreview, setBuscaPreview] = useState('');

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  function parseMarkup(v: string): number {
    return parseFloat(v.toString().replace(",", ".").trim()) || 0;
  }

  async function simular() {
    const mv = parseMarkup(markupNovo);
    if (!mv || mv <= 0) {
      showToast("Informe um markup novo válido", "erro");
      return;
    }
    setSimulando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/precificacao/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: target.tipo,
          faixa_id: target.faixa_id,
          markup_novo: mv,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        showToast(d.error ?? "Erro ao simular", "erro");
        return;
      }
      const d = await r.json();
      setResultado(d);
    } catch {
      showToast("Erro ao simular", "erro");
    } finally {
      setSimulando(false);
    }
  }

  async function enviarAprovacao() {
    if (!resultado) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/precificacao/solicitar-aprovacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: target.tipo,
          faixa_id: target.faixa_id,
          faixa_nome: resultado.faixa_nome || target.faixa_nome,
          markup_anterior: target.markup_anterior,
          markup_novo: parseMarkup(markupNovo),
          stats: resultado.stats,
          simulacao: resultado.simulacao_total ?? resultado.simulacao,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        showToast(d.error ?? "Erro", "erro");
        return;
      }
      onEnviado();
      onClose();
    } catch {
      showToast("Erro ao enviar", "erro");
    } finally {
      setEnviando(false);
    }
  }

  async function salvarDireto() {
    if (!target.onSalvarDireto) return;
    const mv = parseMarkup(markupNovo);
    if (!mv || mv <= 0) {
      showToast("Markup inválido", "erro");
      return;
    }
    setSalvandoDireto(true);
    try {
      await target.onSalvarDireto(mv);
      onClose();
    } catch {
      showToast("Erro ao salvar", "erro");
    } finally {
      setSalvandoDireto(false);
    }
  }

  function exportarCSV() {
    if (!resultado) return;
    const items = resultado.simulacao_total ?? resultado.simulacao;
    const header = "SKU,Nome,Peso (g),Markup Atual,Preco Atual,Preco Novo,Variacao %\n";
    const linhas = items
      .map((s) => `${s.sku},"${s.nome.replace(/"/g, '""')}",${s.peso},${s.markup != null ? Number(s.markup).toFixed(2) : ""},${s.preco_atual},${s.preco_novo},${s.variacao}`)
      .join("\n");
    const blob = new Blob([header + linhas], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulacao_${target.faixa_nome.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const stats = resultado?.stats;
  const preview = resultado?.simulacao ?? [];
  const produtosFiltrados = preview.filter((p) => {
    if (!buscaPreview.trim()) return true;
    const termo = buscaPreview.toLowerCase();
    return (
      p.nome?.toLowerCase().includes(termo) ||
      p.sku?.toLowerCase().includes(termo)
    );
  });
  const inputCls = "px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4">
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
      <div
        className="w-full max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden md:max-w-3xl md:max-h-[90vh]"
        style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <div>
            <h3 className="font-semibold text-base" style={{ color: P.text }}>
              Simular Alteração de Markup
            </h3>
            <p className="text-xs mt-0.5" style={{ color: P.sage }}>
              {target.tipo === "ouro" ? "Markup Ouro" : "Markup Pedras"} — {target.faixa_nome}
            </p>
          </div>
          <button onClick={onClose} style={{ color: P.muted }}>
            <X size={20} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: P.sage }}>
                Markup Atual
              </label>
              <div
                className="px-3 py-2 rounded-lg border text-sm font-mono"
                style={{ backgroundColor: "#f9fafb", borderColor: P.border, color: P.muted }}
              >
                {fmtMarkup(target.markup_anterior)}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: P.sage }}>
                Markup Novo
              </label>
              <input
                className={inputCls}
                style={{ borderColor: P.border, width: "100%" }}
                type="text"
                inputMode="decimal"
                value={markupNovo}
                onChange={(e) => {
                  setMarkupNovo(e.target.value);
                  setResultado(null);
                }}
                placeholder="Ex: 3.8"
              />
            </div>
          </div>

          <button
            onClick={simular}
            disabled={simulando || parseMarkup(markupNovo) <= 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "#f3f4f6",
              color: P.text,
              border: `1px solid ${P.border}`,
            }}
          >
            {simulando ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <BarChart2 size={15} />
            )}
            {simulando ? "Calculando..." : "Simular Impacto"}
          </button>

          {/* Resultado */}
          {resultado && (
            <>
              {/* Cards stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Produtos afetados", value: (stats?.produtos_afetados ?? 0).toLocaleString("pt-BR"), highlight: true },
                  { label: "Variação média", value: fmtVariacao(stats?.variacao_media ?? 0) },
                  { label: "Sobem ↑", value: (stats?.produtos_sobem ?? 0).toLocaleString("pt-BR"), color: P.verde },
                  { label: "Descem ↓", value: (stats?.produtos_descem ?? 0).toLocaleString("pt-BR"), color: P.vermelho },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-xl p-4 text-center"
                    style={{
                      backgroundColor: c.highlight ? P.text : "#f9fafb",
                      border: `1px solid ${c.highlight ? "transparent" : P.border}`,
                    }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                      style={{ color: c.highlight ? "#9ca3af" : P.muted }}
                    >
                      {c.label}
                    </p>
                    <p
                      className="text-xl font-bold font-mono"
                      style={{ color: c.color ?? (c.highlight ? "#fff" : P.text) }}
                    >
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Preview tabela */}
              {preview.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: P.sage }}>
                        Preview — Top {preview.length} produtos por impacto
                      </p>
                      {buscaPreview.trim() && (
                        <span className="text-xs text-gray-400 ml-2">
                          {produtosFiltrados.length} de {preview.length} produtos
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="text"
                        value={buscaPreview}
                        onChange={(e) => setBuscaPreview(e.target.value)}
                        placeholder="Buscar produto..."
                        className="px-2.5 py-1 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-gray-300"
                        style={{ borderColor: P.border, width: 140 }}
                      />
                      <button
                        onClick={exportarCSV}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border hover:bg-gray-50"
                        style={{ borderColor: P.border, color: P.sage }}
                      >
                        <Download size={12} />
                        Exportar CSV
                      </button>
                    </div>
                  </div>
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${P.border}` }}
                  >
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ backgroundColor: "#f3f4f6" }}>
                          <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                            Produto
                          </th>
                          <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                            Peso
                          </th>
                          <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                            Markup Atual
                          </th>
                          <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                            Preço Atual
                          </th>
                          <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                            Preço Novo
                          </th>
                          <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                            Variação
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {produtosFiltrados.slice(0, 20).map((item, i) => (
                          <tr
                            key={item.produto_id}
                            style={{
                              backgroundColor: i % 2 === 0 ? P.card : "#fafafa",
                              borderTop: `1px solid ${P.border}`,
                            }}
                          >
                            <td className="px-3 py-2.5" style={{ color: P.text }}>
                              <p className="font-medium truncate max-w-[200px]">{item.nome}</p>
                              {item.sku && (
                                <p className="font-mono text-[10px]" style={{ color: P.muted }}>
                                  {item.sku}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono" style={{ color: P.muted }}>
                              {item.peso != null ? `${Number(item.peso).toFixed(2)}g` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono" style={{ color: P.muted }}>
                              {item.markup != null ? `${Number(item.markup).toFixed(2)}×` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono" style={{ color: P.sage }}>
                              {fmtBrl(item.preco_atual)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: P.text }}>
                              {fmtBrl(item.preco_novo)}
                            </td>
                            <td
                              className="px-3 py-2.5 text-right font-mono font-semibold"
                              style={{ color: item.variacao > 0 ? P.verde : item.variacao < 0 ? P.vermelho : P.muted }}
                            >
                              {fmtVariacao(item.variacao)}
                            </td>
                          </tr>
                        ))}
                        {produtosFiltrados.length > 20 && (
                          <tr style={{ borderTop: `1px solid ${P.border}` }}>
                            <td colSpan={6} className="px-3 py-2 text-center text-xs" style={{ color: P.muted }}>
                              + {produtosFiltrados.length - 20} produtos adicionais (use Exportar CSV para ver todos)
                            </td>
                          </tr>
                        )}
                        {produtosFiltrados.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-xs" style={{ color: P.muted }}>
                              Nenhum produto encontrado para &quot;{buscaPreview}&quot;
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div
                  className="p-4 rounded-xl text-sm text-center"
                  style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}`, color: P.sage }}
                >
                  Nenhum produto afetado por esta faixa no momento.
                  {target.tipo === "pedra" && " (Normal — BOM de pedras ainda está sendo populado)"}
                </div>
              )}

              {/* Aviso */}
              <div
                className="flex items-start gap-2 p-3 rounded-lg text-xs"
                style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: P.amber }}
              >
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  A alteração <strong>NÃO será aplicada agora</strong>. Será enviada para aprovação de outro
                  administrador. O markup atual permanece ativo até a aprovação.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4 border-t"
          style={{ borderColor: P.border }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: P.border, color: P.sage }}
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {target.allowDirectSave && target.onSalvarDireto && (
              <button
                onClick={salvarDireto}
                disabled={salvandoDireto || parseMarkup(markupNovo) <= 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border font-medium"
                style={{ borderColor: P.border, color: P.text }}
              >
                {salvandoDireto ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar Direto
              </button>
            )}
            <button
              onClick={enviarAprovacao}
              disabled={!resultado || enviando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: P.text }}
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar pra Aprovação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ABA 5: Pendentes ─────────────────────────────────────────────────────────
function TabPendentes({
  currentUserId,
  canAprovar,
  onCountChange,
}: {
  currentUserId: string;
  canAprovar: boolean;
  onCountChange: (n: number) => void;
}) {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [historico, setHistorico] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [aprovando, setAprovando] = useState<number | null>(null); // id em aprovação
  const [visualizando, setVisualizando] = useState<Pendente | null>(null);
  const [modalRejeitar, setModalRejeitar] = useState<{ pendente: Pendente; motivo: string } | null>(null);
  const [rejeitando, setRejeitando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);

  void currentUserId;

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/precificacao/pendentes");
      if (r.ok) {
        const d = await r.json();
        setPendentes(d.pendentes ?? []);
        setHistorico(d.historico ?? []);
        onCountChange(d.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleAprovar(p: Pendente) {
    const confirma = window.confirm(
      `Confirmar aprovação?\n\nFaixa: ${p.faixa_nome}\nMarkup: ${fmtMarkup(p.markup_anterior)} → ${fmtMarkup(p.markup_novo)}\n${p.produtos_afetados} produto(s) serão recalculados.\n\nEssa ação não pode ser desfeita.`
    );
    if (!confirma) return;

    setAprovando(p.id);
    try {
      const res = await fetch("/api/precificacao/aprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alteracao_id: p.id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `Aprovado! ${data.produtos_atualizados ?? p.produtos_afetados} produto(s) recalculado(s) em ${data.elapsed_s ?? "–"}s`,
          "ok"
        );
        await carregar();
      } else {
        showToast(data.error ?? "Erro ao aprovar", "erro");
      }
    } catch {
      showToast("Erro de conexão", "erro");
    } finally {
      setAprovando(null);
    }
  }

  async function confirmarRejeicao() {
    if (!modalRejeitar || !modalRejeitar.motivo.trim()) return;
    setRejeitando(true);
    try {
      const res = await fetch("/api/precificacao/rejeitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alteracao_id: modalRejeitar.pendente.id, motivo: modalRejeitar.motivo }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Alteração rejeitada.", "ok");
        setModalRejeitar(null);
        await carregar();
      } else {
        showToast(data.error ?? "Erro ao rejeitar", "erro");
      }
    } catch {
      showToast("Erro de conexão", "erro");
    } finally {
      setRejeitando(false);
    }
  }

  function BadgeTipo({ tipo }: { tipo: string }) {
    return (
      <span
        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
        style={{
          backgroundColor: tipo === "ouro" ? "#fef3c7" : "#f0fdf4",
          color: tipo === "ouro" ? P.amber : P.verde,
        }}
      >
        {tipo === "ouro" ? "Ouro" : "Pedras"}
      </span>
    );
  }

  return (
    <div>
      {/* Toast local */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: toast.tipo === "ok" ? P.verde : P.vermelho }}
        >
          {toast.tipo === "ok" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-base" style={{ color: P.text }}>
            Aprovações de Markup
          </h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            {canAprovar
              ? "Você pode aprovar ou rejeitar alterações pendentes"
              : "Aguardando aprovação de admin ou desenvolvedor"}
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50"
          style={{ borderColor: P.border, color: P.sage }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Atualizar
        </button>
      </div>

      {/* ── Pendentes ─────────────────────────── */}
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: P.muted }}>
        Pendentes {pendentes.length > 0 && `(${pendentes.length})`}
      </p>

      {loading && pendentes.length === 0 && historico.length === 0 && (
        <div className="text-center py-10" style={{ color: P.muted }}>
          <Loader2 size={20} className="animate-spin inline-block mb-2" />
          <p className="text-sm">Carregando...</p>
        </div>
      )}

      {!loading && pendentes.length === 0 && (
        <div
          className="text-center py-8 rounded-xl mb-4"
          style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}` }}
        >
          <CheckCircle size={28} className="mx-auto mb-1.5" style={{ color: P.muted }} />
          <p className="text-sm" style={{ color: P.sage }}>
            Nenhuma alteração pendente
          </p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {pendentes.map((p) => (
          <div
            key={p.id}
            className="rounded-xl p-4"
            style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <BadgeTipo tipo={p.tipo} />
                  <span className="text-xs font-mono" style={{ color: P.muted }}>#{p.id}</span>
                </div>
                <p className="font-semibold text-sm" style={{ color: P.text }}>
                  {p.faixa_nome}: {fmtMarkup(p.markup_anterior)} → {fmtMarkup(p.markup_novo)}
                </p>
                <p className="text-xs mt-1" style={{ color: P.sage }}>
                  {p.produtos_afetados.toLocaleString("pt-BR")} produto(s) ·{" "}
                  variação média {fmtVariacao(Number(p.variacao_media))} ·{" "}
                  por {p.criado_por_nome ?? "usuário"} · {fmtDate(p.data_criacao)}
                </p>
                {/* Loading de aprovação */}
                {aprovando === p.id && (
                  <p className="flex items-center gap-1.5 text-xs mt-1.5 font-medium" style={{ color: P.amber }}>
                    <Loader2 size={11} className="animate-spin" />
                    Aplicando markup e recalculando {p.produtos_afetados} produto(s)...
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setVisualizando(p)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border hover:bg-gray-50"
                  style={{ borderColor: P.border, color: P.sage }}
                >
                  <Eye size={12} />
                  Ver
                </button>

                {canAprovar ? (
                  <>
                    <button
                      onClick={() => handleAprovar(p)}
                      disabled={aprovando === p.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: P.verde }}
                    >
                      <CheckCircle size={12} />
                      Aprovar
                    </button>
                    <button
                      onClick={() => setModalRejeitar({ pendente: p, motivo: "" })}
                      disabled={aprovando === p.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: P.vermelho }}
                    >
                      <X size={12} />
                      Rejeitar
                    </button>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "#fef3c7", color: P.amber }}>
                    <Loader2 size={11} />
                    Aguardando
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Histórico ─────────────────────────── */}
      {historico.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 mt-4" style={{ color: P.muted }}>
            Histórico
          </p>
          <div className="space-y-2">
            {historico.map((p) => (
              <div
                key={p.id}
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-4"
                style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <BadgeTipo tipo={p.tipo} />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: p.status === "aprovado" ? "#f0fdf4" : "#fef2f2",
                        color: p.status === "aprovado" ? P.verde : P.vermelho,
                      }}
                    >
                      {p.status === "aprovado" ? "✓ Aprovado" : "✕ Rejeitado"}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: P.text }}>
                    {p.faixa_nome}: {fmtMarkup(p.markup_anterior)} → {fmtMarkup(p.markup_novo)}
                  </p>
                  <p className="text-xs" style={{ color: P.muted }}>
                    por {p.criado_por_nome ?? "usuário"}{" "}
                    {p.status === "aprovado"
                      ? `· aprovado por ${p.aprovado_por_nome ?? "admin"} em ${fmtDate(p.data_aprovacao ?? "")}`
                      : `· rejeitado por ${p.aprovado_por_nome ?? "admin"} em ${fmtDate(p.data_aprovacao ?? "")}`}
                    {p.motivo_rejeicao && ` · "${p.motivo_rejeicao}"`}
                  </p>
                </div>
                <button
                  onClick={() => setVisualizando(p)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border hover:bg-white flex-shrink-0"
                  style={{ borderColor: P.border, color: P.sage }}
                >
                  <Eye size={12} />
                  Ver
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Modal visualizar simulação ─────────── */}
      {visualizando && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4">
          <div
            className="w-full max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden md:max-w-2xl md:max-h-[80vh]"
            style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10" style={{ borderColor: P.border, backgroundColor: P.card }}>
              <div>
                <h3 className="font-semibold text-base" style={{ color: P.text }}>
                  Simulação #{visualizando.id}
                </h3>
                <p className="text-xs" style={{ color: P.sage }}>
                  {visualizando.faixa_nome}: {fmtMarkup(visualizando.markup_anterior)} → {fmtMarkup(visualizando.markup_novo)}
                </p>
              </div>
              <button onClick={() => setVisualizando(null)} style={{ color: P.muted }}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Afetados", value: visualizando.produtos_afetados.toLocaleString("pt-BR") },
                  { label: "Variação média", value: fmtVariacao(Number(visualizando.variacao_media)) },
                  { label: "Enviado em", value: fmtDate(visualizando.data_criacao) },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg p-3" style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}` }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: P.muted }}>
                      {c.label}
                    </p>
                    <p className="font-semibold text-sm" style={{ color: P.text }}>
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>

              {Array.isArray(visualizando.simulacao_json) && visualizando.simulacao_json.length > 0 ? (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: "#f3f4f6" }}>
                        <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Produto</th>
                        <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Atual</th>
                        <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Novo</th>
                        <th className="text-right px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Var.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(visualizando.simulacao_json as SimulacaoItem[]).slice(0, 20).map((item, i) => (
                        <tr
                          key={item.produto_id}
                          style={{ backgroundColor: i % 2 === 0 ? P.card : "#fafafa", borderTop: `1px solid ${P.border}` }}
                        >
                          <td className="px-3 py-2 font-medium truncate max-w-[180px]" style={{ color: P.text }}>{item.nome}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: P.sage }}>{fmtBrl(item.preco_atual)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: P.text }}>{fmtBrl(item.preco_novo)}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: item.variacao > 0 ? P.verde : item.variacao < 0 ? P.vermelho : P.muted }}>
                            {fmtVariacao(item.variacao)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-center" style={{ color: P.muted }}>
                  Nenhum dado de simulação disponível.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal rejeitar ─────────────────────── */}
      {modalRejeitar && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4">
          <div
            className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden md:max-w-md md:max-h-[90vh]"
            style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10" style={{ borderColor: P.border, backgroundColor: P.card }}>
              <h3 className="font-semibold text-base" style={{ color: P.text }}>Rejeitar Alteração</h3>
              <button onClick={() => setModalRejeitar(null)} style={{ color: P.muted }}>
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div
                className="rounded-lg p-3 mb-4 text-sm"
                style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <p className="font-semibold" style={{ color: P.text }}>
                  {modalRejeitar.pendente.faixa_nome}: {fmtMarkup(modalRejeitar.pendente.markup_anterior)} → {fmtMarkup(modalRejeitar.pendente.markup_novo)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: P.sage }}>
                  por {modalRejeitar.pendente.criado_por_nome ?? "usuário"} · {fmtDate(modalRejeitar.pendente.data_criacao)}
                </p>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: P.sage }}>
                Motivo da rejeição *
              </label>
              <textarea
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2"
                style={{ border: `1px solid ${P.border}`, color: P.text }}
                placeholder="Ex: Variação muito alta, ajustar para 3.6×"
                value={modalRejeitar.motivo}
                onChange={(e) => setModalRejeitar({ ...modalRejeitar, motivo: e.target.value })}
              />
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button
                onClick={() => setModalRejeitar(null)}
                className="flex-1 px-4 py-2 rounded-xl text-sm border hover:bg-gray-50"
                style={{ borderColor: P.border, color: P.sage }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRejeicao}
                disabled={!modalRejeitar.motivo.trim() || rejeitando}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: P.vermelho }}
              >
                {rejeitando ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                Confirmar Rejeição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ABA 1: Curva Dinâmica de Precificação ────────────────────────────────────
function TabCurvaDinamica({
  configInicial,
  categoriasInicial,
  cotacaoOuro,
  canEdit,
}: {
  configInicial: CurvaConfig | null;
  categoriasInicial: CurvaCategoriaInput[];
  cotacaoOuro: number;
  canEdit: boolean;
}) {
  const defaultConfig: CurvaConfig = configInicial ?? {
    startMkp: 5,
    startCommission: 8,
    goldCostPercentage: 100,
    sucataCompraMinPct: 80,
    sucataCompraMaxPct: 85,
    arredondamento: "dezena",
  };
  const [config, setConfig] = useState<CurvaConfig>(defaultConfig);
  const [categorias, setCategorias] = useState<CurvaCategoriaInput[]>(categoriasInicial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [pesoSim, setPesoSim] = useState<string>("2.0");
  const [mkpManual, setMkpManual] = useState<string>("");
  const [simCategoryIdx, setSimCategoryIdx] = useState<string>(""); // "" = automático
  const [expandido, setExpandido] = useState<number | null>(null);
  const [modalAplicar, setModalAplicar] = useState<null | { carregando: boolean; preview?: CurvaPreviewStats }>(null);
  const [aplicando, setAplicando] = useState(false);
  const [adicionandoCat, setAdicionandoCat] = useState(false);

  // Desconto simulado (0–31%, passo 1%) — reduz comissão proporcionalmente.
  // Com 31% a comissão zera; com 30% (limite operacional) ela ainda paga ~0.1×base.
  // Fórmula: comissaoEfetiva = comissaoBase × (1 − desconto/31)
  const [descontoSim, setDescontoSim] = useState<number>(0);
  const DESC_MAX_ZERA_COMISSAO = 31;

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  // Targets acumulados por categoria
  const categoriasPreparadas = useMemo<CurvaCategoriaPreparada[]>(
    () => prepareCategories(config, categorias),
    [config, categorias],
  );

  const pesoNum = parseFloat(pesoSim.replace(",", ".")) || 0;
  const mkpManualNum = parseFloat(mkpManual.replace(",", ".")) || 0;

  // Fatores para o simulador: automático (interpolado) ou categoria fixada
  const simFactors = useMemo(() => {
    if (pesoNum <= 0 || cotacaoOuro <= 0) return null;
    if (simCategoryIdx === "") {
      return getPricingFactors(pesoNum, config, categorias);
    }
    const idx = parseInt(simCategoryIdx);
    const cat = categoriasPreparadas[idx];
    if (!cat) return null;
    return {
      mkp: cat.targetMkp,
      commission: cat.targetComm,
      maxDiscount: cat.maxDiscount,
      categoriaId: cat.id,
      categoriaNome: cat.nome,
    };
  }, [pesoNum, cotacaoOuro, simCategoryIdx, config, categorias, categoriasPreparadas]);

  const custo = useMemo(() => {
    if (pesoNum <= 0 || cotacaoOuro <= 0) return null;
    return calcularCustoBase(pesoNum, cotacaoOuro, config.goldCostPercentage);
  }, [pesoNum, cotacaoOuro, config.goldCostPercentage]);

  const simVenda = useMemo(() => {
    if (!simFactors || pesoNum <= 0 || cotacaoOuro <= 0) return null;
    return calcularPrecoSync(pesoNum, cotacaoOuro, simFactors.mkp, config.arredondamento, config.goldCostPercentage);
  }, [simFactors, pesoNum, cotacaoOuro, config.arredondamento, config.goldCostPercentage]);

  const vendaManual = useMemo(() => {
    if (mkpManualNum <= 0 || pesoNum <= 0 || cotacaoOuro <= 0) return null;
    return calcularPrecoSync(pesoNum, cotacaoOuro, mkpManualNum, config.arredondamento, config.goldCostPercentage);
  }, [mkpManualNum, pesoNum, cotacaoOuro, config.arredondamento, config.goldCostPercentage]);

  // ─── Handlers ───
  function updateConfig<K extends keyof CurvaConfig>(key: K, value: CurvaConfig[K]) {
    if (!canEdit) return;
    setConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
  }

  function updateCategoria(id: number, patch: Partial<CurvaCategoriaInput>) {
    if (!canEdit) return;
    setCategorias((cats) => cats.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  }

  async function novaCategoria() {
    if (!canEdit) return;
    setAdicionandoCat(true);
    try {
      const sorted = [...categorias].sort((a, b) => a.ordem - b.ordem);
      const last = sorted.at(-1);
      const newOrdem = last ? last.ordem + 1 : 1;
      const newMaxWeight = last ? Math.round((last.maxWeight + 10) * 10) / 10 : 10;
      const body = {
        nome: `Categoria ${newOrdem}`,
        max_weight: newMaxWeight,
        variation: 0.1,
        comm_variation: 0.1,
        max_discount: 5,
        ordem: newOrdem,
      };
      const r = await fetch("/api/precificacao/curva/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Erro ao criar categoria", "erro"); return; }
      setCategorias((cats) => [...cats, d.categoria as CurvaCategoriaInput]);
      setDirty(true);
    } catch {
      showToast("Erro ao criar categoria", "erro");
    } finally {
      setAdicionandoCat(false);
    }
  }

  async function deletarCategoria(id: number) {
    if (!canEdit) return;
    if (!confirm("Remover esta categoria da curva?")) return;
    const r = await fetch(`/api/precificacao/curva/categorias/${id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); showToast(d.error ?? "Erro ao remover", "erro"); return; }
    setCategorias((cats) => cats.filter((c) => c.id !== id));
    setDirty(true);
  }

  async function salvar() {
    setSaving(true);
    try {
      const rc = await fetch("/api/precificacao/curva/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_mkp: config.startMkp,
          start_commission: config.startCommission,
          gold_cost_percentage: config.goldCostPercentage,
          sucata_compra_min_pct: config.sucataCompraMinPct,
          sucata_compra_max_pct: config.sucataCompraMaxPct,
          arredondamento: config.arredondamento,
        }),
      });
      if (!rc.ok) { const d = await rc.json(); showToast(d.error ?? "Erro ao salvar config", "erro"); return; }

      for (const cat of categorias) {
        const rr = await fetch(`/api/precificacao/curva/categorias/${cat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: cat.nome,
            max_weight: cat.maxWeight,
            variation: cat.variation,
            comm_variation: cat.commVariation,
            max_discount: cat.maxDiscount,
            ativo: cat.ativo,
          }),
        });
        if (!rr.ok) { const d = await rr.json(); showToast(`Erro em "${cat.nome}": ${d.error ?? ""}`, "erro"); return; }
      }
      setDirty(false);
      showToast("Alterações salvas ✓", "ok");
    } catch {
      showToast("Erro ao salvar", "erro");
    } finally {
      setSaving(false);
    }
  }

  async function abrirModalAplicar() {
    setModalAplicar({ carregando: true });
    try {
      const r = await fetch("/api/precificacao/curva/preview-aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, categorias }),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Erro ao carregar preview", "erro"); setModalAplicar(null); return; }
      setModalAplicar({ carregando: false, preview: d.stats });
    } catch {
      showToast("Erro ao carregar preview", "erro");
      setModalAplicar(null);
    }
  }

  async function confirmarAplicar() {
    setAplicando(true);
    try {
      const r = await fetch("/api/precificacao/curva/aplicar", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { showToast(d.error ?? "Erro ao aplicar", "erro"); return; }
      showToast(`${d.produtos_atualizados} produto(s) atualizado(s) em ${d.elapsed_s}s`, "ok");
      setModalAplicar(null);
    } catch {
      showToast("Erro ao aplicar", "erro");
    } finally {
      setAplicando(false);
    }
  }

  const simLucro = simVenda != null && custo != null ? simVenda - custo : null;
  const simMargem = simVenda != null && simVenda > 0 && custo != null ? ((simVenda - custo) / simVenda) * 100 : null;
  const lucroManual = vendaManual != null && custo != null ? vendaManual - custo : null;
  const margemManual = vendaManual != null && vendaManual > 0 && custo != null ? ((vendaManual - custo) / vendaManual) * 100 : null;

  const simLabel = simCategoryIdx === ""
    ? "Automático (curva)"
    : (categoriasPreparadas[parseInt(simCategoryIdx)]?.nome ?? "Categoria");

  return (
    <div>
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}

      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base" style={{ color: P.text }}>
            Curva Dinâmica de Precificação
          </h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            MKP e comissão interpolados linearmente entre as faixas. Cotação: <span className="font-mono font-semibold">{fmtBrl(cotacaoOuro)}/g</span>
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={salvar}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              style={{ borderColor: P.border, color: dirty ? P.text : P.muted }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Alterações
            </button>
            <button
              onClick={abrirModalAplicar}
              disabled={dirty || saving}
              title={dirty ? "Salve antes de aplicar" : "Aplicar curva em todos os produtos"}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#059669" }}
            >
              <PlayCircle size={14} />
              Aplicar em Produtos
            </button>
          </div>
        )}
      </div>

      {/* ── SEÇÃO A: Parâmetros Globais ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <ParamCard label="Markup Inicial" hint="peso = 0.1g" value={config.startMkp} step={0.1} onChange={(v) => updateConfig("startMkp", v)} disabled={!canEdit} suffix="×" />
        <ParamCard label="Comissão Inicial" hint="peso = 0.1g" value={config.startCommission} step={0.1} onChange={(v) => updateConfig("startCommission", v)} disabled={!canEdit} suffix="%" />
        <ParamCard label="% Custo Ouro" hint="% da cotação que é custo" value={config.goldCostPercentage} step={1} onChange={(v) => updateConfig("goldCostPercentage", v)} disabled={!canEdit} suffix="%" />
        <div className="p-4 rounded-2xl shadow-sm" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: P.sage }}>Compra Sucata</div>
          <div className="text-[11px] mb-2" style={{ color: P.muted }}>% da cotação</div>
          <div className="flex items-center gap-2">
            <input type="number" step="0.5" disabled={!canEdit} value={config.sucataCompraMinPct} onChange={(e) => updateConfig("sucataCompraMinPct", Number(e.target.value))} className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:ring-2 disabled:bg-gray-50" style={{ border: `1px solid ${P.border}`, color: P.text }} />
            <span className="text-xs" style={{ color: P.muted }}>—</span>
            <input type="number" step="0.5" disabled={!canEdit} value={config.sucataCompraMaxPct} onChange={(e) => updateConfig("sucataCompraMaxPct", Number(e.target.value))} className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none focus:ring-2 disabled:bg-gray-50" style={{ border: `1px solid ${P.border}`, color: P.text }} />
          </div>
          <div className="text-[11px] mt-1 font-mono" style={{ color: P.muted }}>
            = {fmtBrl(cotacaoOuro * config.sucataCompraMinPct / 100)} a {fmtBrl(cotacaoOuro * config.sucataCompraMaxPct / 100)}
          </div>
        </div>
      </div>

      {/* ── SEÇÃO B: Simulador de Lucratividade ── */}
      <div className="p-5 rounded-2xl shadow-sm mb-6" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold text-sm" style={{ color: P.text }}>Simulador de Lucratividade</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs flex items-center gap-2" style={{ color: P.sage }}>
              Peso (g)
              <input
                type="text"
                value={pesoSim}
                onChange={(e) => setPesoSim(e.target.value)}
                className="w-20 rounded-lg px-2 py-1.5 text-sm font-mono text-right outline-none focus:ring-2"
                style={{ border: `1px solid ${P.border}`, color: P.text }}
              />
            </label>
            <label className="text-xs flex items-center gap-2" style={{ color: P.sage }}>
              Modo
              <select
                value={simCategoryIdx}
                onChange={(e) => setSimCategoryIdx(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2"
                style={{ border: `1px solid ${P.border}`, color: P.text }}
              >
                <option value="">Automático</option>
                {categoriasPreparadas.map((cat, i) => (
                  <option key={cat.id} value={String(i)}>{cat.nome}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {simFactors && custo != null ? (
          <>
            <div className="px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between text-sm" style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}` }}>
              <span style={{ color: P.sage }}>
                Custo Base: <span className="font-mono">{pesoNum.toFixed(2)}g × {fmtBrl(cotacaoOuro)} × {config.goldCostPercentage.toFixed(0)}%</span>
              </span>
              <span className="font-mono font-semibold" style={{ color: P.text }}>{fmtBrl(custo)}</span>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#f3f4f6" }}>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Cenário</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>MKP</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Comissão</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Venda</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Lucro</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Margem</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: `1px solid ${P.border}` }}>
                    <td className="px-3 py-2 font-medium" style={{ color: P.text }}>{simLabel}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: P.text }}>{simFactors.mkp.toFixed(3)}×</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: P.sage }}>{simFactors.commission.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: P.text }}>{simVenda != null ? fmtBrl(simVenda) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: simLucro != null ? (simLucro > 0 ? "#059669" : "#dc2626") : P.muted }}>
                      {simLucro != null ? fmtBrl(simLucro) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: simMargem != null ? (simMargem > 0 ? "#059669" : "#dc2626") : P.muted }}>
                      {simMargem != null ? `${simMargem.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                  <tr style={{ borderTop: `1px solid ${P.border}`, backgroundColor: "#fafafa" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: P.text }}>
                      <span className="flex items-center gap-2">
                        Manual
                        <input
                          type="text"
                          placeholder="3.0"
                          value={mkpManual}
                          onChange={(e) => setMkpManual(e.target.value)}
                          className="w-16 rounded px-1.5 py-0.5 text-xs font-mono text-right outline-none focus:ring-1"
                          style={{ border: `1px solid ${P.border}`, color: P.text }}
                        />
                        <span className="text-xs font-mono" style={{ color: P.muted }}>×</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: mkpManualNum > 0 ? P.text : P.muted }}>
                      {mkpManualNum > 0 ? `${mkpManualNum.toFixed(3)}×` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: P.muted }}>—</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: vendaManual != null ? P.text : P.muted }}>
                      {vendaManual != null ? fmtBrl(vendaManual) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: lucroManual != null ? (lucroManual > 0 ? "#059669" : "#dc2626") : P.muted }}>
                      {lucroManual != null ? fmtBrl(lucroManual) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: margemManual != null ? (margemManual > 0 ? "#059669" : "#dc2626") : P.muted }}>
                      {margemManual != null ? `${margemManual.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-center py-4" style={{ color: P.muted }}>Informe um peso válido para simular.</p>
        )}
      </div>

      {/* ── SEÇÃO C: Tabela de Categorias ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
        <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap" style={{ borderBottom: `1px solid ${P.border}` }}>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: P.text }}>Categorias da Curva</h3>
            <span className="text-[11px]" style={{ color: P.muted }}>
              {categoriasPreparadas.length} ativa{categoriasPreparadas.length !== 1 ? "s" : ""} · passo 0.1g / &gt;20g: 1.0g
            </span>
          </div>

          {/* Simulador de desconto — reduz comissão proporcionalmente (0→30%) */}
          <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-[520px] px-4 py-2 rounded-lg border bg-white" style={{ borderColor: P.border }}>
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Desconto da Consultora</span>
              <span className="text-[10px] font-mono" style={{ color: P.sage }}>
                0% cheia · 30% mínima · 31% zera
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={DESC_MAX_ZERA_COMISSAO}
              step={1}
              value={descontoSim}
              onChange={(e) => setDescontoSim(Number(e.target.value))}
              className="flex-1 accent-red-600"
            />
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={0}
                max={DESC_MAX_ZERA_COMISSAO}
                step={1}
                value={descontoSim}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(DESC_MAX_ZERA_COMISSAO, Math.round(Number(e.target.value) || 0)));
                  setDescontoSim(v);
                }}
                className="w-14 rounded border px-2 py-1 text-sm font-mono text-right outline-none focus:ring-1"
                style={{ borderColor: P.border, color: "#dc2626" }}
              />
              <span className="text-xs font-bold" style={{ color: "#dc2626" }}>%</span>
            </div>
          </div>

          {canEdit && (
            <button
              onClick={novaCategoria}
              disabled={adicionandoCat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: P.border, color: P.sage }}
            >
              {adicionandoCat ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Nova Categoria
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 780 }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th className="w-8 px-2 py-2"></th>
                <th className="w-10 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-left" style={{ color: P.muted }}>Ativo</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Categoria</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Faixa (g)</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Red. MKP (−)</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Red. Com. (−)</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Max Desc. (%)</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {categoriasPreparadas.map((cat, i) => {
                const prev = i === 0 ? null : categoriasPreparadas[i - 1];
                const pesoInicio = prev ? prev.maxWeight : 0.1;
                const expanded = expandido === cat.id;
                return (
                  <FragmentRow
                    key={cat.id}
                    cat={cat}
                    pesoInicio={pesoInicio}
                    expanded={expanded}
                    toggleExpand={() => setExpandido(expanded ? null : cat.id)}
                    onPatch={(patch) => updateCategoria(cat.id, patch)}
                    onDelete={() => deletarCategoria(cat.id)}
                    canEdit={canEdit}
                    cotacaoOuro={cotacaoOuro}
                    config={config}
                    categoriasPreparadas={categoriasPreparadas}
                    descontoSim={descontoSim}
                    descontoMaxZera={DESC_MAX_ZERA_COMISSAO}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex items-center gap-1.5 mt-3 text-xs" style={{ color: P.muted }}>
        <Info size={12} />
        Altere os parâmetros e clique em &ldquo;Salvar Alterações&rdquo;. Para recalcular preços dos produtos, use &ldquo;Aplicar em Produtos&rdquo;.
      </p>

      {/* Modal Aplicar */}
      {modalAplicar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${P.border}` }}>
              <h3 className="font-semibold text-base" style={{ color: P.text }}>Aplicar Curva em Produtos</h3>
              <button onClick={() => setModalAplicar(null)} disabled={aplicando} style={{ color: P.muted }}><X size={18} /></button>
            </div>
            <div className="px-6 py-5">
              {modalAplicar.carregando ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin" style={{ color: P.muted }} />
                  <span className="ml-2 text-sm" style={{ color: P.sage }}>Calculando impacto...</span>
                </div>
              ) : modalAplicar.preview ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <StatBox label="Produtos afetados" value={modalAplicar.preview.produtos_total.toLocaleString("pt-BR")} color={P.text} />
                    <StatBox label="Variação média" value={`${modalAplicar.preview.variacao_media_pct > 0 ? "+" : ""}${modalAplicar.preview.variacao_media_pct.toFixed(2)}%`} color={modalAplicar.preview.variacao_media_pct > 0 ? "#059669" : modalAplicar.preview.variacao_media_pct < 0 ? "#dc2626" : P.text} />
                    <StatBox label="Sobem" value={`${modalAplicar.preview.produtos_sobem}`} color="#059669" />
                    <StatBox label="Descem" value={`${modalAplicar.preview.produtos_descem}`} color="#dc2626" />
                  </div>
                  <div className="rounded-lg p-3 text-xs font-mono" style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}`, color: P.sage }}>
                    Min: {modalAplicar.preview.variacao_min_pct.toFixed(2)}% · Max: {modalAplicar.preview.variacao_max_pct.toFixed(2)}% · Sem mudança: {modalAplicar.preview.produtos_sem_mudanca}
                  </div>
                  <p className="text-xs mt-3" style={{ color: P.muted }}>
                    Atualiza markup, comissão e desconto máximo dos produtos ativos. O preço sincronizado é recalculado pelo trigger do banco.
                  </p>
                </>
              ) : null}
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setModalAplicar(null)} disabled={aplicando} className="flex-1 px-4 py-2 rounded-xl text-sm border hover:bg-gray-50 disabled:opacity-50" style={{ borderColor: P.border, color: P.sage }}>
                Cancelar
              </button>
              <button onClick={confirmarAplicar} disabled={aplicando || modalAplicar.carregando} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#059669" }}>
                {aplicando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                Confirmar Aplicação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────
interface CurvaPreviewStats {
  produtos_total: number;
  produtos_sobem: number;
  produtos_descem: number;
  produtos_sem_mudanca: number;
  variacao_media_pct: number;
  variacao_min_pct: number;
  variacao_max_pct: number;
}

// ─── Card simples de parâmetro global ─────────────────────────────────────────
function ParamCard({ label, hint, value, step, onChange, disabled, suffix }: {
  label: string; hint?: string; value: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; suffix?: string;
}) {
  return (
    <div className="p-4 rounded-2xl shadow-sm" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: P.sage }}>{label}</div>
      {hint && <div className="text-[11px] mb-2" style={{ color: P.muted }}>{hint}</div>}
      <div className="flex items-center gap-1.5">
        <input type="number" step={step} disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg px-2 py-1.5 text-lg font-mono font-semibold outline-none focus:ring-2 disabled:bg-gray-50"
          style={{ border: `1px solid ${P.border}`, color: P.text }} />
        {suffix && <span className="text-sm font-mono" style={{ color: P.sage }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Box de estatística no modal aplicar ──────────────────────────────────────
function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}` }}>
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: P.muted }}>{label}</div>
      <div className="text-base font-mono font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

// ─── Linha da tabela de categorias (com accordion de chips) ───────────────────
function FragmentRow({
  cat,
  pesoInicio,
  expanded,
  toggleExpand,
  onPatch,
  onDelete,
  canEdit,
  cotacaoOuro,
  config,
  categoriasPreparadas,
  descontoSim,
  descontoMaxZera,
}: {
  cat: CurvaCategoriaPreparada;
  pesoInicio: number;
  expanded: boolean;
  toggleExpand: () => void;
  onPatch: (patch: Partial<CurvaCategoriaInput>) => void;
  onDelete: () => void;
  canEdit: boolean;
  cotacaoOuro: number;
  config: CurvaConfig;
  categoriasPreparadas: CurvaCategoriaPreparada[];
  descontoSim: number;
  descontoMaxZera: number;
}) {
  // Fator de redução linear de comissão: 0% desc → 1.0 · descMax → 0
  const fatorComissao = Math.max(0, 1 - descontoSim / descontoMaxZera);
  const chips = useMemo<PontoCategoriaChip[]>(() => {
    if (!expanded || cotacaoOuro <= 0) return [];
    return getCategoryPoints(cat, categoriasPreparadas, cotacaoOuro, config);
  }, [expanded, cat, categoriasPreparadas, cotacaoOuro, config]);

  const limitPrice = cotacaoOuro > 0
    ? getLimitPrice(cat.maxWeight, cotacaoOuro, config, categoriasPreparadas)
    : null;

  const inputCls = "rounded px-2 py-1 text-sm font-mono text-right outline-none focus:ring-1 disabled:bg-transparent";
  const inputStyle = (edit: boolean) => ({ border: `1px solid ${edit ? P.border : "transparent"}`, color: P.text });

  return (
    <>
      <tr style={{ borderTop: `1px solid ${P.border}`, backgroundColor: cat.ativo ? P.card : "#fafafa" }}>
        {/* Expand */}
        <td className="px-2 py-2 text-center">
          <button onClick={toggleExpand} className="hover:bg-gray-100 rounded p-0.5" style={{ color: P.muted }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        {/* Ativo */}
        <td className="px-2 py-2">
          <input type="checkbox" checked={cat.ativo} disabled={!canEdit} onChange={(e) => onPatch({ ativo: e.target.checked })} className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed" />
        </td>
        {/* Categoria */}
        <td className="px-3 py-2">
          <input type="text" value={cat.nome} disabled={!canEdit} onChange={(e) => onPatch({ nome: e.target.value })}
            className="w-full rounded px-2 py-1 text-sm outline-none focus:ring-1 disabled:bg-transparent"
            style={inputStyle(canEdit)} />
          <div className="text-[10px] mt-0.5 font-mono" style={{ color: P.muted }}>
            {pesoInicio.toFixed(1)}g → {cat.maxWeight.toFixed(1)}g
          </div>
        </td>
        {/* Faixa (g) */}
        <td className="px-3 py-2 text-right">
          <input type="number" step="0.1" value={cat.maxWeight} disabled={!canEdit} onChange={(e) => onPatch({ maxWeight: Number(e.target.value) })}
            className={`w-20 ${inputCls}`} style={inputStyle(canEdit)} />
          {limitPrice != null && (
            <div className="text-[10px] mt-0.5 font-mono" style={{ color: P.muted }}>≈ {fmtBrl(limitPrice)}</div>
          )}
        </td>
        {/* Red. MKP */}
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <span className="text-xs font-bold" style={{ color: P.vermelho }}>−</span>
            <input type="number" step="0.05" min="0" value={cat.variation} disabled={!canEdit} onChange={(e) => onPatch({ variation: Number(e.target.value) })}
              className={`w-16 ${inputCls}`} style={inputStyle(canEdit)} />
          </div>
          <div className="text-[10px] mt-0.5 text-right">
            <span className="font-mono px-1 rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
              = {cat.targetMkp.toFixed(3)}×
            </span>
          </div>
        </td>
        {/* Red. Com. */}
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <span className="text-xs font-bold" style={{ color: P.blue }}>−</span>
            <input type="number" step="0.05" min="0" value={cat.commVariation} disabled={!canEdit} onChange={(e) => onPatch({ commVariation: Number(e.target.value) })}
              className={`w-16 ${inputCls}`} style={inputStyle(canEdit)} />
          </div>
          <div className="text-[10px] mt-0.5 text-right">
            <span className="font-mono px-1 rounded" style={{ backgroundColor: "#dbeafe", color: "#1e3a8a" }}>
              = {cat.targetComm.toFixed(2)}%
            </span>
          </div>
        </td>
        {/* Max Desc. */}
        <td className="px-3 py-2 text-right">
          <input type="number" step="1" min="0" max="100" value={cat.maxDiscount} disabled={!canEdit} onChange={(e) => onPatch({ maxDiscount: Number(e.target.value) })}
            className={`w-16 ${inputCls}`} style={inputStyle(canEdit)} />
          <div className="text-[10px] mt-0.5 font-mono text-right" style={{ color: P.muted }}>%</div>
        </td>
        {/* Ações */}
        <td className="px-2 py-2 text-center">
          {canEdit && (
            <button onClick={onDelete} className="hover:bg-red-50 rounded p-0.5 transition-colors" style={{ color: "#dc2626" }} title="Remover categoria">
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ backgroundColor: "#f8fafc" }}>
          <td colSpan={8} className="px-5 py-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                CURVA: {cat.nome}
              </span>
              <span className="text-[11px] font-mono" style={{ color: P.sage }}>
                MKP Alvo: <span style={{ color: "#92400e" }}>{cat.targetMkp.toFixed(3)}×</span>
                {" · "}
                Com base: <span style={{ color: "#1e3a8a" }}>{cat.targetComm.toFixed(2)}%</span>
                {descontoSim > 0 && (
                  <>
                    {" · "}
                    desc {descontoSim}% → com efetiva:{" "}
                    <span style={{ color: fatorComissao === 0 ? "#dc2626" : "#166534", fontWeight: 600 }}>
                      {(cat.targetComm * fatorComissao).toFixed(2)}%
                    </span>
                  </>
                )}
                {" · "}
                Passo: 0.1g / &gt;30g: 1.0g
              </span>
            </div>
            {chips.length === 0 ? (
              <p className="text-xs" style={{ color: P.muted }}>Sem pontos para exibir.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((pt) => {
                  const comPct = pt.comm * fatorComissao;
                  const comRS  = pt.price * (comPct / 100);
                  return (
                    <div
                      key={pt.weight}
                      className="rounded-lg px-2 py-1 text-[11px] font-mono leading-tight"
                      style={{ backgroundColor: "#ffffff", border: `1px solid ${P.border}`, color: P.text }}
                    >
                      <div>
                        <span style={{ color: P.sage }}>{pt.weight.toFixed(pt.weight >= 10 ? 1 : 2)}g</span>
                        {" "}
                        <span style={{ color: "#92400e" }}>{pt.mkp.toFixed(3)}×</span>
                        {" · "}
                        <span style={{ color: P.text }}>{fmtBrl(pt.price)}</span>
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: comPct === 0 ? "#dc2626" : "#1e3a8a" }}>
                        Com: {comPct.toFixed(2)}% · {fmtBrl(comRS)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── ABA 2: Markup Pedras ─────────────────────────────────────────────────────
function TabMarkupPedras({
  faixasInicial,
  onAbrirSimulacao,
}: {
  faixasInicial: FaixaPedra[];
  onAbrirSimulacao: (
    faixa: FaixaPedra,
    onSalvarDireto: (novoMarkup: number) => Promise<void>
  ) => void;
}) {
  const [faixas, setFaixas] = useState<FaixaPedra[]>(faixasInicial);
  const [adicionando, setAdicionando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [nova, setNova] = useState({ nome: "", tamanho_min: "", tamanho_max: "", markup: "", unidade: "ct" });

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  }

  function abrirSimulacao(faixa: FaixaPedra) {
    onAbrirSimulacao(faixa, async (novoMarkup: number) => {
      const r = await fetch("/api/precificacao/markup-pedras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: faixa.id, markup: novoMarkup }),
      });
      if (!r.ok) throw new Error("Erro ao salvar");
      const d = await r.json();
      setFaixas((prev) => prev.map((f) => (f.id === faixa.id ? d.faixa : f)));
    });
  }

  async function remover(id: number) {
    if (!confirm("Remover esta faixa de markup?")) return;
    try {
      const r = await fetch("/api/precificacao/markup-pedras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ativo: false }),
      });
      if (!r.ok) { showToast("Erro ao remover", "erro"); return; }
      setFaixas((prev) => prev.filter((f) => f.id !== id));
      showToast("Faixa removida", "ok");
    } catch {
      showToast("Erro ao remover", "erro");
    }
  }

  async function criarFaixa() {
    if (!nova.nome || !nova.tamanho_min || !nova.tamanho_max || !nova.markup) {
      showToast("Preencha todos os campos", "erro");
      return;
    }
    if (Number(nova.tamanho_max) <= Number(nova.tamanho_min)) {
      showToast("tamanho_max deve ser maior que tamanho_min", "erro");
      return;
    }
    if (Number(nova.markup) <= 0) { showToast("Markup deve ser positivo", "erro"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/precificacao/markup-pedras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nova.nome,
          tamanho_min: Number(nova.tamanho_min),
          tamanho_max: Number(nova.tamanho_max),
          markup: Number(nova.markup),
          unidade: nova.unidade,
        }),
      });
      if (!r.ok) {
        const d = await r.json();
        showToast(d.error ?? "Erro ao criar", "erro");
        return;
      }
      const d = await r.json();
      setFaixas((prev) => [...prev, d.faixa].sort((a, b) => Number(a.tamanho_min) - Number(b.tamanho_min)));
      setNova({ nome: "", tamanho_min: "", tamanho_max: "", markup: "", unidade: "ct" });
      setAdicionando(false);
      showToast("Faixa criada!", "ok");
    } catch {
      showToast("Erro ao criar faixa", "erro");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-gray-300";

  return (
    <div>
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-base" style={{ color: P.text }}>
            Markup Pedras — Faixas por Tamanho
          </h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            Multiplicador aplicado sobre custo de compra em USD × cotação dólar
          </p>
        </div>
        <button
          onClick={() => setAdicionando(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ backgroundColor: P.text }}
        >
          <Plus size={13} />
          Adicionar Faixa
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#f3f4f6" }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Faixa</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Tamanho</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Markup</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: P.muted }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {faixas.map((f, i) => (
              <tr
                key={f.id}
                style={{
                  backgroundColor: i % 2 === 0 ? P.card : "#fafafa",
                  borderTop: `1px solid ${P.border}`,
                }}
              >
                <td className="px-4 py-3 font-medium" style={{ color: P.text }}>{f.nome}</td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: P.sage }}>
                  {Number(f.tamanho_min).toFixed(2)} – {Number(f.tamanho_max).toFixed(2)} {f.unidade}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: P.text }}>
                  {fmtMarkup(f.markup)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{
                      backgroundColor: f.ativo ? "#dcfce7" : "#f3f4f6",
                      color: f.ativo ? P.verde : P.muted,
                    }}
                  >
                    {f.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => abrirSimulacao(f)}
                      title="Simular impacto e alterar markup"
                      className="px-2 py-1 rounded text-xs hover:bg-gray-100"
                      style={{ color: P.sage, border: `1px solid ${P.border}` }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => remover(f.id)}
                      className="px-2 py-1 rounded text-xs hover:bg-red-50"
                      style={{ color: P.vermelho }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal adicionar */}
      {adicionando && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
          <div
            className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl md:max-w-md p-6 shadow-xl"
            style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-base" style={{ color: P.text }}>Nova Faixa de Markup</h3>
              <button onClick={() => setAdicionando(false)} style={{ color: P.muted }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: P.sage }}>Nome</label>
                <input className={inputCls} style={{ borderColor: P.border }} placeholder="Ex: Médias (0.10–0.30ct)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: P.sage }}>Tamanho mín (ct)</label>
                  <input className={inputCls} style={{ borderColor: P.border }} type="number" step="0.01" min="0" placeholder="0.10" value={nova.tamanho_min} onChange={(e) => setNova({ ...nova, tamanho_min: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: P.sage }}>Tamanho máx (ct)</label>
                  <input className={inputCls} style={{ borderColor: P.border }} type="number" step="0.01" min="0" placeholder="0.30" value={nova.tamanho_max} onChange={(e) => setNova({ ...nova, tamanho_max: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: P.sage }}>Markup (multiplicador)</label>
                <input className={inputCls} style={{ borderColor: P.border }} type="number" step="0.1" min="0.1" placeholder="2.0" value={nova.markup} onChange={(e) => setNova({ ...nova, markup: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setAdicionando(false)} className="flex-1 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: P.border, color: P.sage }}>Cancelar</button>
              <button onClick={criarFaixa} disabled={saving} className="flex-1 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: P.text }}>
                {saving ? <Loader2 size={14} className="animate-spin inline-block" /> : "Criar Faixa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ABA 3: Cotações ──────────────────────────────────────────────────────────
function TabCotacoes({ cotacao }: { cotacao: Cotacao }) {
  const [data, setData] = useState<Cotacao>(cotacao);
  const [loading, setLoading] = useState(false);

  async function atualizar() {
    setLoading(true);
    try {
      const r = await fetch("/api/precificacao/cotacoes");
      if (r.ok) { const d = await r.json(); setData(d); }
    } finally { setLoading(false); }
  }

  const ouro18k = data.ouro_brl_g * 0.75;
  const cards = [
    { label: "Ouro 24K", valor: `${fmtBrl(data.ouro_brl_g)}/g`, destaque: true },
    { label: "Ouro 18K", valor: `${fmtBrl(ouro18k)}/g`, sub: "75% do ouro 24K" },
    { label: "Dólar", valor: fmtBrl(data.dollar_brl), sub: "USD/BRL", destaque: true },
    { label: "Fator", valor: `${data.fator.toFixed(4)}`, sub: "Fator de produção" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-base" style={{ color: P.text }}>Cotações Atuais</h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>Fonte: public.parametros — atualizado automaticamente via webhook</p>
        </div>
        <button onClick={atualizar} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-gray-50" style={{ borderColor: P.border, color: P.sage }}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Atualizar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl p-5" style={{ backgroundColor: c.destaque ? P.text : P.card, border: `1px solid ${c.destaque ? "transparent" : P.border}` }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: c.destaque ? "#9ca3af" : P.muted }}>{c.label}</p>
            <p className="text-2xl font-bold font-mono" style={{ color: c.destaque ? "#fff" : P.text }}>{c.valor}</p>
            {c.sub && <p className="text-xs mt-1" style={{ color: c.destaque ? "#6b7280" : P.muted }}>{c.sub}</p>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: "#f9fafb", border: `1px solid ${P.border}`, color: P.sage }}>
        <Info size={13} />
        <span>Última atualização: <strong>{fmtDate(data.updated_at)}</strong> · Ouro 18K calculado no frontend (75% do 24K) · Triggers de preço usam ouro 24K diretamente</span>
      </div>
    </div>
  );
}

// ─── ABA 4: Regras ────────────────────────────────────────────────────────────
function TabRegras({ configInicial }: { configInicial: Record<string, string> }) {
  const [config, setConfig] = useState<Config>({
    preco_limiar_subir: configInicial.preco_limiar_subir ?? "2",
    preco_limiar_descer: configInicial.preco_limiar_descer ?? "5",
    preco_arredondamento: configInicial.preco_arredondamento ?? "dezena",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);

  function showToast(msg: string, tipo: "ok" | "erro") { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000); }

  const precoVenda = 2340; const precoSync = 2380;
  const variacao = ((precoSync - precoVenda) / precoVenda) * 100;
  const limiarSubir = Number(config.preco_limiar_subir);
  const limiarDescer = Number(config.preco_limiar_descer);
  const precoSyncArr = calcArredondamento(precoSync, config.preco_arredondamento);
  let exemploConclusao: string;
  if (variacao > limiarSubir) exemploConclusao = `SOBE (+${variacao.toFixed(1)}% > +${limiarSubir}%)`;
  else if (variacao < -limiarDescer) exemploConclusao = `DESCE (${variacao.toFixed(1)}% < -${limiarDescer}%)`;
  else exemploConclusao = `NÃO MUDA (+${variacao.toFixed(1)}% dentro do intervalo)`;

  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch("/api/precificacao/regras", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preco_limiar_subir: Number(config.preco_limiar_subir), preco_limiar_descer: Number(config.preco_limiar_descer), preco_arredondamento: config.preco_arredondamento }) });
      if (!r.ok) { const d = await r.json(); showToast(d.error ?? "Erro ao salvar", "erro"); return; }
      showToast("Regras salvas!", "ok");
    } catch { showToast("Erro ao salvar", "erro"); } finally { setSaving(false); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-gray-300";
  const labelCls = "block text-xs font-semibold uppercase tracking-wide mb-1.5";

  return (
    <div className="max-w-2xl">
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
      <h2 className="font-semibold text-base mb-6" style={{ color: P.text }}>Regras de Atualização de Preço</h2>
      <div className="space-y-6">
        <div className="p-5 rounded-xl" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
          <label className={labelCls} style={{ color: P.sage }}>Limiar para SUBIR preço</label>
          <p className="text-sm mb-2" style={{ color: P.text }}>Se <code className="font-mono bg-gray-100 px-1 rounded">preço_sync</code> estiver <strong>acima</strong> em mais de:</p>
          <div className="flex items-center gap-2">
            <input className={inputCls} style={{ borderColor: P.border, maxWidth: 120 }} type="number" min="0" max="50" step="0.5" value={config.preco_limiar_subir} onChange={(e) => setConfig({ ...config, preco_limiar_subir: e.target.value })} />
            <span className="text-sm" style={{ color: P.sage }}>%</span>
          </div>
        </div>
        <div className="p-5 rounded-xl" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
          <label className={labelCls} style={{ color: P.sage }}>Limiar para DESCER preço</label>
          <p className="text-sm mb-2" style={{ color: P.text }}>Se <code className="font-mono bg-gray-100 px-1 rounded">preço_sync</code> estiver <strong>abaixo</strong> em mais de:</p>
          <div className="flex items-center gap-2">
            <input className={inputCls} style={{ borderColor: P.border, maxWidth: 120 }} type="number" min="0" max="50" step="0.5" value={config.preco_limiar_descer} onChange={(e) => setConfig({ ...config, preco_limiar_descer: e.target.value })} />
            <span className="text-sm" style={{ color: P.sage }}>%</span>
          </div>
        </div>
        <div className="p-5 rounded-xl" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
          <label className={labelCls} style={{ color: P.sage }}>Arredondamento do preço_sync</label>
          <div className="flex gap-3 mt-2">
            {(["dezena", "unidade", "centena"] as const).map((tipo) => (
              <button key={tipo} onClick={() => setConfig({ ...config, preco_arredondamento: tipo })} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border" style={{ backgroundColor: config.preco_arredondamento === tipo ? P.text : P.card, color: config.preco_arredondamento === tipo ? "#fff" : P.sage, borderColor: config.preco_arredondamento === tipo ? "transparent" : P.border }}>
                {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: P.muted }}>
            {config.preco_arredondamento === "dezena" && "Ex: R$ 123,32 → R$ 120 | R$ 125,10 → R$ 130"}
            {config.preco_arredondamento === "unidade" && "Ex: R$ 123,32 → R$ 123 | R$ 123,67 → R$ 124"}
            {config.preco_arredondamento === "centena" && "Ex: R$ 123,32 → R$ 100 | R$ 150,00 → R$ 200"}
          </p>
        </div>
        <div className="p-5 rounded-xl" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: P.amber }}>Exemplo ao vivo</p>
          <div className="space-y-1 text-sm" style={{ color: P.text }}>
            <div className="flex justify-between"><span style={{ color: P.sage }}>Preço de venda atual</span><span className="font-mono">{fmtBrl(precoVenda)}</span></div>
            <div className="flex justify-between"><span style={{ color: P.sage }}>Preço sync (arred. {config.preco_arredondamento})</span><span className="font-mono">{fmtBrl(precoSyncArr)}</span></div>
            <div className="flex justify-between"><span style={{ color: P.sage }}>Variação</span><span className="font-mono font-semibold" style={{ color: variacao >= 0 ? P.verde : P.vermelho }}>{variacao >= 0 ? "+" : ""}{variacao.toFixed(1)}%</span></div>
            <div className="flex justify-between pt-2 mt-2 font-semibold" style={{ borderTop: "1px solid #fde68a" }}>
              <span>Resultado</span>
              <span style={{ color: variacao > limiarSubir ? P.verde : variacao < -limiarDescer ? P.vermelho : P.sage }}>{exemploConclusao}</span>
            </div>
          </div>
        </div>
        <button onClick={salvar} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: P.text }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Salvar Regras
        </button>
      </div>
    </div>
  );
}

// ─── Componente Principal ──────────────────────────────────────────────────────
export default function PrecificacaoClient({ faixasPedrasInicial, configInicial, cotacaoInicial, currentUserId, currentUserRole, curvaConfigInicial, curvaCategoriasInicial }: Props) {
  const canAprovar = currentUserRole === "desenvolvedor" || currentUserRole === "admin";
  const canEditCurva = ["admin", "desenvolvedor", "diretor"].includes(currentUserRole);
  const [tab, setTab] = useState<Tab>("markup-ouro");
  const [modal, setModal] = useState<ModalTarget | null>(null);
  const [pendentesCount, setPendentesCount] = useState(0);
  const [globalToast, setGlobalToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);

  function showGlobalToast(msg: string, tipo: "ok" | "erro") {
    setGlobalToast({ msg, tipo });
    setTimeout(() => setGlobalToast(null), 3500);
  }

  // Fetch pendentes count on mount
  useEffect(() => {
    fetch("/api/precificacao/pendentes")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setPendentesCount(d.total ?? 0); })
      .catch(() => useErrorStore.getState().push("Erro ao carregar precificações pendentes", { level: "warning" }));
  }, []);

  function handleEnviado() {
    setPendentesCount((n) => n + 1);
    showGlobalToast("Alteração enviada pra aprovação ✓", "ok");
  }

  function abrirSimulacaoPedra(faixa: FaixaPedra, onSalvarDireto: (markup: number) => Promise<void>) {
    setModal({
      tipo: "pedra",
      faixa_id: faixa.id,
      faixa_nome: faixa.nome,
      markup_anterior: Number(faixa.markup),
      allowDirectSave: true,
      onSalvarDireto,
    });
  }

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: "markup-ouro",   label: "Markup Ouro",   icon: TrendingUp },
    { id: "markup-pedras", label: "Markup Pedras", icon: Gem },
    { id: "cotacoes",      label: "Cotações",      icon: DollarSign },
    { id: "regras",        label: "Regras",        icon: Settings2 },
    { id: "pendentes",     label: "Pendentes",     icon: Clock },
  ];

  return (
    <div className="min-h-screen p-3 md:p-6" style={{ backgroundColor: P.bg }}>
      {globalToast && <Toast msg={globalToast.msg} tipo={globalToast.tipo} />}

      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl font-semibold" style={{ color: P.text }}>Precificação</h1>
        <p className="text-sm mt-0.5" style={{ color: P.sage }}>Configuração de regras de markup e atualização de preços</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ backgroundColor: "#f3f4f6", border: `1px solid ${P.border}` }}>
        {TABS.map((t) => (
          <TabBtn
            key={t.id}
            label={t.label}
            icon={t.icon}
            active={tab === t.id}
            badge={t.id === "pendentes" ? pendentesCount : undefined}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>

      {/* Content */}
      <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
        {tab === "markup-ouro"   && (
          <TabCurvaDinamica
            configInicial={curvaConfigInicial}
            categoriasInicial={curvaCategoriasInicial}
            cotacaoOuro={cotacaoInicial.ouro_brl_g}
            canEdit={canEditCurva}
          />
        )}
        {tab === "markup-pedras" && (
          <RegrasPedrasTab />
        )}
        {tab === "cotacoes"      && <TabCotacoes cotacao={cotacaoInicial} />}
        {tab === "regras"        && <TabRegras configInicial={configInicial} />}
        {tab === "pendentes"     && <TabPendentes currentUserId={currentUserId} canAprovar={canAprovar} onCountChange={setPendentesCount} />}
      </div>

      {/* Modal global de simulação */}
      {modal && (
        <ModalSimulacao
          target={modal}
          currentUserId={currentUserId}
          onClose={() => setModal(null)}
          onEnviado={handleEnviado}
        />
      )}
    </div>
  );
}
