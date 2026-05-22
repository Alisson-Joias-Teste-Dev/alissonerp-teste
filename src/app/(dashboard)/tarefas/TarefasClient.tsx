"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Circle, Clock, CheckCircle2, XCircle, ShieldCheck,
  Search, Loader2, Zap, ListTodo, Users, AlertTriangle, Settings,
  SlidersHorizontal, ChevronRight, LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/apiFetch";
import TarefaDrawer from "./TarefaDrawer";
import AutomacoesTab from "./AutomacoesTab";
import ConfigTab from "./ConfigTab";
import { useErrorStore } from "@/stores/errorStore";

export interface Tarefa {
  id: number;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  status: string;
  tipo: string | null;
  data_limite: string | null;
  ordem_id: number | null;
  ordem_ids: number[] | null;
  peso_metal: number | null;
  venda_id: number | null;
  numero_ordem: string | null;
  tags: string[];
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_por: string | null;
  criador_nome: string | null;
  created_at: string;
  updated_at: string;
  concluida_em: string | null;
}

export interface Usuario { id: string; nome: string; }

interface Estatisticas {
  total: number;
  pendentes: number;
  em_andamento: number;
  aguardando_aprovacao: number;
  concluidas: number;
  canceladas: number;
  vencidas: number;
  aguardando_minha_aprovacao: number;
  minhas_pendentes: number;
}

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

function safeFmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function safeFmtDateTime(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function tempoRelativo(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.floor(h / 24);
  if (dias < 30) return `há ${dias}d`;
  return safeFmtDate(d);
}

const TIPO_LABEL: Record<string, string> = {
  geral: "Geral",
  desconto_acima: "Desconto acima do limite",
  sangria: "Sangria",
  protocolo_metal: "Protocolo de metal",
};

type Chip = { label: string; icon: string; bg: string; color: string };

function parsearCamposDescricao(descricao: string): {
  valorTotal?: string;
  aReceber?: string;
  saldoDisponivel?: string;
  cliente?: string;
  desconto?: string;
  descontoValor?: string;
  produtoNome?: string;
  pctDesconto?: string;
} {
  const out: ReturnType<typeof parsearCamposDescricao> = {};
  const text = descricao.replace(/\\n/g, "\n");

  const valorTotal = text.match(/Valor total:\s*(R\$\s*[\d.,]+)/i);
  if (valorTotal) out.valorTotal = valorTotal[1].trim();

  const aReceber = text.match(/A Receber:\s*(R\$\s*[\d.,]+)/i);
  if (aReceber) out.aReceber = aReceber[1].trim();

  const saldo = text.match(/Saldo dispon[ií]vel:\s*(R\$\s*[\d.,]+)/i);
  if (saldo) out.saldoDisponivel = saldo[1].trim();

  const cliente = text.match(/Venda\s+\d+\s*[—–-]\s*([^\n]+)/i);
  if (cliente) out.cliente = cliente[1].trim();

  const descPct = text.match(/Desconto(?: solicitado)?:\s*([\d.,]+%)/i);
  if (descPct) out.desconto = descPct[1].trim();

  const pctDesc = text.match(/(?:%\s*de\s*desconto|Desconto aplicado):\s*([\d.,]+%)/i);
  if (pctDesc) out.pctDesconto = pctDesc[1].trim();
  else if (out.desconto) out.pctDesconto = out.desconto;

  const descValor = text.match(/Desconto em R\$:\s*(R\$\s*[\d.,]+)/i);
  if (descValor) out.descontoValor = descValor[1].trim();

  const produto = text.match(/(?:Produto|Item):\s*([^\n]+)/i);
  if (produto) out.produtoNome = produto[1].trim();

  return out;
}

function gerarChips(t: Tarefa): Chip[] {
  const chips: Chip[] = [];
  const desc = t.descricao ?? "";
  const tags = Array.isArray(t.tags) ? t.tags : [];
  const campos = parsearCamposDescricao(desc);

  if (tags.includes("diretor") || tags.includes("credito_loja")) {
    const parseBRL = (v: string) => parseFloat(v.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
    const creditoNum = campos.aReceber ? parseBRL(campos.aReceber) : 0;
    const saldoNum = campos.saldoDisponivel ? parseBRL(campos.saldoDisponivel) : 0;
    const saldoOk = saldoNum >= creditoNum && creditoNum > 0;

    if (campos.aReceber)
      chips.push({ label: `Crédito: ${campos.aReceber}`, icon: "💰", bg: "#FFF7ED", color: "#EA580C" });
    if (campos.saldoDisponivel)
      chips.push({
        label: `Saldo: ${campos.saldoDisponivel}`,
        icon: "🏦",
        bg: saldoOk ? "#F0FDF4" : "#FEE2E2",
        color: saldoOk ? "#16A34A" : "#DC2626",
      });
    if (campos.cliente)
      chips.push({ label: campos.cliente, icon: "👤", bg: "#F3F4F6", color: "#6B7280" });
    chips.push({ label: "Comissão zerada se aprovado", icon: "⚠️", bg: "#FEFCE8", color: "#CA8A04" });
  }

  if (tags.includes("aprovacao_desconto")) {
    if (campos.pctDesconto)
      chips.push({ label: `Desconto: ${campos.pctDesconto}`, icon: "🏷️", bg: "#FEE2E2", color: "#DC2626" });
    if (campos.descontoValor)
      chips.push({ label: `Economia: ${campos.descontoValor}`, icon: "💸", bg: "#F3F4F6", color: "#6B7280" });
    if (campos.produtoNome)
      chips.push({ label: campos.produtoNome, icon: "📦", bg: "#F3F4F6", color: "#6B7280" });
  }

  if (t.tipo === "cartao_desconto") {
    chips.push({ label: "Cartão de Crédito", icon: "💳", bg: "#EFF6FF", color: "#2563EB" });
    if (t.venda_id)
      chips.push({ label: `Venda #${t.venda_id}`, icon: "🧾", bg: "#F3F4F6", color: "#6B7280" });
    const pctMatch = (t.titulo ?? "").match(/(\d+)%/);
    if (pctMatch)
      chips.push({ label: `>${pctMatch[1]}% de desconto`, icon: "⚠️", bg: "#FEE2E2", color: "#DC2626" });
  }

  return chips;
}

function isVencidaFn(t: { data_limite: string | null; status: string }): boolean {
  if (!t.data_limite) return false;
  if (["concluida", "cancelada", "vencida", "aprovada"].includes(t.status)) return false;
  const date = new Date(t.data_limite);
  if (isNaN(date.getTime())) return false;
  return date < new Date();
}

export const STATUS_COLS = [
  { key: "pendente",             label: "Pendente",             icon: Circle,       color: "#6B7280", bg: "#F3F4F6" },
  { key: "em_andamento",        label: "Em Andamento",         icon: Clock,        color: "#D97706", bg: "#FEF3C7" },
  { key: "aguardando_aprovacao",label: "Aguard. Aprovação",    icon: ShieldCheck,  color: "#7C3AED", bg: "#EDE9FE" },
  { key: "concluida",           label: "Concluída",            icon: CheckCircle2, color: "#059669", bg: "#D1FAE5" },
  { key: "cancelada",           label: "Cancelada",            icon: XCircle,      color: "#DC2626", bg: "#FEE2E2" },
] as const;

export const PRIORIDADE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  urgente: { bg: "#FEE2E2", text: "#991B1B", label: "Urgente" },
  alta:    { bg: "#FEF3C7", text: "#92400E", label: "Alta"    },
  media:   { bg: "#E0E7FF", text: "#3730A3", label: "Média"   },
  baixa:   { bg: "#F3F4F6", text: "#6B7280", label: "Baixa"   },
};

function SortableCard({ tarefa, onClick }: { tarefa: Tarefa; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tarefa.id });
  const pri = PRIORIDADE_BADGE[tarefa.prioridade] ?? PRIORIDADE_BADGE.media;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const isVencida = isVencidaFn(tarefa);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: C.cremeBorder, backgroundColor: "#fff" }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="p-3 rounded-xl border cursor-pointer hover:shadow-md transition-all select-none"
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
          style={{ backgroundColor: pri.bg, color: pri.text }}>
          {pri.label}
        </span>
        <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: "#1A1A1A" }}>
          {tarefa.titulo}
        </p>
      </div>
      {tarefa.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tarefa.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: C.cremeBg, color: "#6B7280", border: `1px solid ${C.cremeBorder}` }}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "#9CA3AF" }}>
        {tarefa.responsavel_nome && (
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
              style={{ backgroundColor: C.esmeralda + "20", color: C.esmeralda }}>
              {tarefa.responsavel_nome[0]}
            </span>
            {tarefa.responsavel_nome.split(" ")[0]}
          </span>
        )}
        {tarefa.data_limite && (
          <span style={{ color: isVencida ? "#EF4444" : "#9CA3AF" }}>
            {isVencida ? "⚠️ " : ""}
            {safeFmtDate(tarefa.data_limite)}
          </span>
        )}
        {tarefa.numero_ordem && <span>#{tarefa.numero_ordem}</span>}
      </div>
    </div>
  );
}

function DroppableColumn({
  col, tarefas, onCardClick, activeId,
}: {
  col: typeof STATUS_COLS[number];
  tarefas: Tarefa[];
  onCardClick: (t: Tarefa) => void;
  activeId: number | null;
}) {
  return (
    <div className="flex flex-col w-[85vw] sm:w-auto sm:min-w-[260px] sm:max-w-[280px] snap-start flex-shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1 sticky top-0 z-10 py-1" style={{ backgroundColor: C.cremeBg }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
        <span className="font-semibold text-xs uppercase tracking-wide flex-1" style={{ color: col.color }}>
          {col.label}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: col.bg, color: col.color }}>
          {tarefas.length}
        </span>
      </div>
      <div
        className="flex-1 rounded-xl p-2 min-h-[120px] transition-colors"
        style={{ backgroundColor: tarefas.length === 0 ? col.bg + "40" : "transparent" }}
      >
        <SortableContext items={tarefas.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tarefas.map(t => (
              <SortableCard key={t.id} tarefa={t} onClick={() => onCardClick(t)} />
            ))}
            {tarefas.length === 0 && activeId === null && (
              <p className="text-[11px] text-center py-6" style={{ color: "#9CA3AF" }}>Nenhuma tarefa</p>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

type ViewOption = {
  key: string;
  label: string;
  icon: typeof ShieldCheck;
  requireGerente?: boolean;
};

const VIEW_OPTIONS: ViewOption[] = [
  { key: "aguardando", label: "Aprovações pendentes", icon: ShieldCheck },
  { key: "minhas",     label: "Minhas tarefas",       icon: ListTodo },
  { key: "time",       label: "Tarefas do time",      icon: Users, requireGerente: true },
  { key: "concluidas", label: "Concluídas",           icon: CheckCircle2 },
];

function labelDaAba(aba: string): string {
  const v = VIEW_OPTIONS.find(o => o.key === aba);
  if (v) return v.label;
  if (aba === "kanban")     return "Kanban";
  if (aba === "automacoes") return "Automações";
  if (aba === "config")     return "Configurações";
  return "Tarefas";
}

export default function TarefasClient() {
  const { user, role } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroVisao, setFiltroVisao] = useState<string>("");
  const [aba, setAba] = useState<string>("minhas");
  const abaJaAjustada = useRef(false);
  // Visão default depende do papel: aprovadores caem direto nas pendentes.
  // Roda só uma vez assim que o role chega do useAuth.
  useEffect(() => {
    if (abaJaAjustada.current) return;
    if (!role) return;
    abaJaAjustada.current = true;
    if (["admin", "desenvolvedor", "gerente_loja"].includes(role)) {
      setAba("aguardando");
    }
  }, [role]);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [stats, setStats] = useState<Estatisticas | null>(null);

  const [drawerTarefa, setDrawerTarefa] = useState<Tarefa | null>(null);
  const [showNova, setShowNova] = useState(false);
  const [novaForm, setNovaForm] = useState({ titulo: "", descricao: "", prioridade: "media", data_limite: "", tags: "", tipo: "" });
  const [responsavelId, setResponsavelId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [temOrdem, setTemOrdem] = useState<boolean | null>(null);
  const [ordensInput, setOrdensInput] = useState<{ numero: string; id: number | null; erro: string }[]>([{ numero: "", id: null, erro: "" }]);
  const [pesoMetal, setPesoMetal] = useState("");

  const [aprovandoId, setAprovandoId] = useState<number | null>(null);
  const [rejeitandoId, setRejeitandoId] = useState<number | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [salvandoAprov, setSalvandoAprov] = useState(false);

  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const podeGerenciar = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"].includes(role ?? "");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/tarefas";
      const params = new URLSearchParams();

      const visaoAtiva = filtroVisao || (["minhas", "time", "aguardando", "concluidas", "vencidas"].includes(aba) && aba !== "kanban" ? aba : "");

      if (visaoAtiva) params.set("visao", visaoAtiva);

      if (filtroPrioridade) params.set("prioridade", filtroPrioridade);
      if (filtroTipo) params.set("tipo", filtroTipo);
      if (filtro) params.set("busca", filtro);

      const qs = params.toString();
      if (qs) url += "?" + qs;

      const data = await apiFetch<Tarefa[]>(url);
      setTarefas(data);
    } catch { /* silencioso */ }
    setLoading(false);
  }, [aba, filtroPrioridade, filtroTipo, filtro, filtroVisao, podeGerenciar]);

  const carregarStats = useCallback(async () => {
    try {
      const data = await apiFetch<Estatisticas>("/api/tarefas/estatisticas");
      setStats(data);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarStats(); }, [carregarStats]);

  useEffect(() => {
    apiFetch<Usuario[]>("/api/usuarios/busca?q=").then(setUsuarios)
      .catch(() => useErrorStore.getState().push("Erro ao carregar usuários", { level: "warning" }));
  }, []);

  const tarefaById = (id: number) => tarefas.find(t => t.id === id);
  const statusOfId = (id: number) => tarefaById(id)?.status ?? "pendente";

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeStatus = statusOfId(Number(active.id));
    const overId = over.id;
    const colKey = STATUS_COLS.find(c => c.key === String(overId))?.key;
    if (colKey && colKey !== activeStatus) {
      setTarefas(prev => prev.map(t =>
        t.id === Number(active.id) ? { ...t, status: colKey } : t
      ));
    }
    const overStatus = statusOfId(Number(overId));
    if (overStatus && overStatus !== activeStatus && Number(overId) !== Number(active.id)) {
      setTarefas(prev => prev.map(t =>
        t.id === Number(active.id) ? { ...t, status: overStatus } : t
      ));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const novoStatus = statusOfId(Number(active.id));
    const tarefa = tarefaById(Number(active.id));
    if (!tarefa || novoStatus === tarefa.status) return;
    await apiFetch(`/api/tarefas/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    }).catch(() => carregar());
  }

  async function buscarOrdemIdx(idx: number, numero: string) {
    if (!numero.trim()) {
      setOrdensInput(prev => prev.map((o, i) => i === idx ? { ...o, id: null, erro: "" } : o));
      return;
    }
    try {
      const data = await apiFetch(`/api/ordens/busca?q=${encodeURIComponent(numero.trim())}`);
      const found = (data as { id: number; numero_ordem: string }[]).find(
        o => o.numero_ordem.toLowerCase() === numero.trim().toLowerCase()
      );
      setOrdensInput(prev => prev.map((o, i) => i === idx
        ? { ...o, id: found?.id ?? null, erro: found ? "" : "Ordem não encontrada" }
        : o
      ));
    } catch {
      setOrdensInput(prev => prev.map((o, i) => i === idx ? { ...o, id: null, erro: "Erro ao buscar" } : o));
    }
  }

  async function criarTarefa() {
    if (!novaForm.titulo.trim()) return;
    setSalvando(true);
    try {
      await apiFetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: novaForm.titulo,
          descricao: novaForm.descricao || undefined,
          prioridade: novaForm.prioridade,
          data_limite: novaForm.data_limite || undefined,
          responsavel_id: responsavelId || undefined,
          tags: novaForm.tags ? novaForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          tipo: novaForm.tipo || undefined,
          ordem_ids: temOrdem && ordensInput.some(o => o.id) ? ordensInput.filter(o => o.id).map(o => o.id as number) : undefined,
          peso_metal: pesoMetal ? Number(pesoMetal.replace(",", ".")) : undefined,
        }),
      });
      setShowNova(false);
      setNovaForm({ titulo: "", descricao: "", prioridade: "media", data_limite: "", tags: "", tipo: "" });
      setResponsavelId("");
      setTemOrdem(null); setOrdensInput([{ numero: "", id: null, erro: "" }]); setPesoMetal("");
      carregar();
      carregarStats();
    } catch { /* silencioso */ }
    setSalvando(false);
  }

  async function handleAprovar(tarefaId: number, tipo: string | null) {
    setSalvandoAprov(true);
    setAprovandoId(tarefaId);
    try {
      // Tarefas de conversão de estoque/SKU usam endpoints próprios — não
      // gravam em aprovacoes_tarefa, então o fluxo genérico falha com "Aprovação não encontrada".
      if (tipo === "conversao_sku") {
        await apiFetch(`/api/conversao-sku/aprovar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tarefa_id: tarefaId }),
        });
      } else if (tipo === "conversao") {
        await apiFetch(`/api/conversao/aprovar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tarefa_id: tarefaId }),
        });
      } else {
        // Fluxo genérico (aprovacoes_tarefa)
        const aprovacoes = await apiFetch<{ id: number; status: string }[]>(`/api/tarefas/${tarefaId}/aprovacao`);
        const pendente = aprovacoes.find(a => a.status === "pendente") ?? aprovacoes[0];
        if (!pendente) throw new Error("Aprovação não encontrada");
        await apiFetch(`/api/tarefas/${tarefaId}/aprovacao`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aprovacao_id: pendente.id, decisao: "aprovado" }),
        });
      }
      carregar();
      carregarStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      useErrorStore.getState().push(`Erro ao aprovar: ${msg}`, { level: "critical" });
    }
    setSalvandoAprov(false);
    setAprovandoId(null);
  }

  async function handleRejeitar(tarefaId: number, tipo: string | null) {
    setSalvandoAprov(true);
    try {
      // Tarefas de conversão de estoque/SKU usam endpoints próprios — não
      // gravam em aprovacoes_tarefa, então o fluxo genérico falha com "Aprovação não encontrada".
      if (tipo === "conversao_sku") {
        await apiFetch(`/api/conversao-sku/recusar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tarefa_id: tarefaId, motivo: motivoRejeicao }),
        });
      } else if (tipo === "conversao") {
        await apiFetch(`/api/conversao/recusar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tarefa_id: tarefaId, motivo: motivoRejeicao }),
        });
      } else {
        const aprovacoes = await apiFetch<{ id: number; status: string }[]>(`/api/tarefas/${tarefaId}/aprovacao`);
        const pendente = aprovacoes.find(a => a.status === "pendente") ?? aprovacoes[0];
        if (!pendente) throw new Error("Aprovação não encontrada");
        await apiFetch(`/api/tarefas/${tarefaId}/aprovacao`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aprovacao_id: pendente.id, decisao: "rejeitado", motivo: motivoRejeicao }),
        });
      }
      setRejeitandoId(null);
      setMotivoRejeicao("");
      carregar();
      carregarStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      useErrorStore.getState().push(`Erro ao rejeitar: ${msg}`, { level: "critical" });
    }
    setSalvandoAprov(false);
  }

  const tarefasFiltradas = tarefas;

  const porStatus = (s: string) => tarefasFiltradas.filter(t => t.status === s);
  const activeTarefa = activeId ? tarefaById(activeId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b space-y-3"
        style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
        {/* Linha 1: Título da visão (com badge) + ações à direita */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg md:text-xl font-bold truncate" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            {labelDaAba(aba)}
            {aba === "aguardando" && stats && stats.aguardando_minha_aprovacao > 0 && (
              <span className="ml-2 text-sm md:text-base font-bold" style={{ color: "#7C3AED" }}>
                ({stats.aguardando_minha_aprovacao})
              </span>
            )}
          </h1>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Atalho Kanban (view muito diferente — não entra no dropdown) */}
            <button onClick={() => setAba("kanban")}
              aria-label="Kanban"
              title="Kanban"
              className="p-2 rounded-lg border transition-colors"
              style={{
                backgroundColor: aba === "kanban" ? C.esmeralda : C.cremeBg,
                color: aba === "kanban" ? C.creme : "#6B7280",
                borderColor: aba === "kanban" ? C.esmeralda : C.cremeBorder,
              }}>
              <LayoutGrid size={15} />
            </button>

            {/* Automações (atalho de ícone) */}
            <button onClick={() => setAba("automacoes")}
              aria-label="Automações"
              title="Automações"
              className="p-2 rounded-lg border transition-colors"
              style={{
                backgroundColor: aba === "automacoes" ? C.esmeralda : C.cremeBg,
                color: aba === "automacoes" ? C.creme : "#6B7280",
                borderColor: aba === "automacoes" ? C.esmeralda : C.cremeBorder,
              }}>
              <Zap size={15} />
            </button>

            {podeGerenciar && (
              <button onClick={() => setAba("config")}
                aria-label="Configurações"
                title="Configurações"
                className="p-2 rounded-lg border transition-colors"
                style={{
                  backgroundColor: aba === "config" ? C.esmeralda : C.cremeBg,
                  color: aba === "config" ? C.creme : "#6B7280",
                  borderColor: aba === "config" ? C.esmeralda : C.cremeBorder,
                }}>
                <Settings size={15} />
              </button>
            )}

            {/* Botão Filtros (dropdown com visões + filtros refinados) */}
            <div className="relative">
              <button onClick={() => setFiltrosOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: filtrosOpen ? C.esmeralda : C.cremeBg,
                  color: filtrosOpen ? C.creme : C.esmeralda,
                  borderColor: filtrosOpen ? C.esmeralda : C.cremeBorder,
                }}>
                <SlidersHorizontal size={14} />
                Filtros
              </button>

              {filtrosOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFiltrosOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-40 w-72 bg-white rounded-xl shadow-xl border p-3 space-y-3"
                    style={{ borderColor: C.cremeBorder }}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Visão</p>
                      <div className="space-y-1">
                        {VIEW_OPTIONS.filter(o => !o.requireGerente || podeGerenciar).map(({ key, label, icon: Icon }) => {
                          const isAtiva = aba === key;
                          const contagem = key === "aguardando" ? (stats?.aguardando_minha_aprovacao ?? 0) : null;
                          return (
                            <button key={key} onClick={() => { setAba(key); setFiltroVisao(""); setFiltrosOpen(false); }}
                              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors"
                              style={{
                                backgroundColor: isAtiva ? C.esmeralda : "transparent",
                                color: isAtiva ? C.creme : "#1A1A1A",
                              }}>
                              <Icon size={14} className="flex-shrink-0" />
                              <span className="flex-1 text-left">{label}</span>
                              {contagem !== null && contagem > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: isAtiva ? "#ffffff30" : "#EDE9FE",
                                    color: isAtiva ? C.creme : "#7C3AED",
                                  }}>
                                  {contagem}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#9CA3AF" }}>Refinar</p>
                      <div className="relative mb-2">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Buscar..." value={filtro}
                          onChange={e => setFiltro(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm outline-none"
                          style={{ borderColor: C.cremeBorder }} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}
                          className="px-2 py-2 border rounded-lg text-xs outline-none"
                          style={{ borderColor: C.cremeBorder }}>
                          <option value="">Prioridade</option>
                          <option value="urgente">Urgente</option>
                          <option value="alta">Alta</option>
                          <option value="media">Média</option>
                          <option value="baixa">Baixa</option>
                        </select>
                        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                          className="px-2 py-2 border rounded-lg text-xs outline-none"
                          style={{ borderColor: C.cremeBorder }}>
                          <option value="">Tipo</option>
                          <option value="geral">Geral</option>
                          <option value="desconto_acima">Aprovação desconto</option>
                          <option value="sangria">Sangria</option>
                          <option value="protocolo_metal">Protocolo metal</option>
                        </select>
                      </div>
                      {(filtro || filtroPrioridade || filtroTipo) && (
                        <button onClick={() => { setFiltro(""); setFiltroPrioridade(""); setFiltroTipo(""); }}
                          className="mt-2 text-[11px] font-semibold text-gray-500 hover:text-gray-700">
                          Limpar refinos
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Botão Nova: só desktop; mobile usa FAB */}
            <button onClick={() => setShowNova(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}>
              <Plus size={13} /> Nova
            </button>
          </div>
        </div>

        {/* Dashboard Stats — escondidos na visão de aprovações (foco total nas pendentes) */}
        {stats && aba !== "aguardando" && aba !== "automacoes" && aba !== "config" && (
          <div className="flex gap-2 md:gap-3 flex-wrap">
            {[
              { label: "Pendentes", value: stats.minhas_pendentes, color: "#6B7280", icon: Circle },
              { label: "Em andamento", value: stats.em_andamento, color: "#D97706", icon: Clock },
              { label: "Aguard. Aprovação", value: stats.aguardando_minha_aprovacao, color: "#7C3AED", icon: ShieldCheck },
              { label: "Concluídas", value: stats.concluidas, color: "#059669", icon: CheckCircle2 },
              { label: "Vencidas", value: stats.vencidas, color: "#DC2626", icon: AlertTriangle },
            ].map(stat => (
              <button key={stat.label}
                onClick={() => {
                  setFiltroVisao("");
                  if (stat.label === "Aguard. Aprovação") setAba("aguardando");
                  else if (stat.label === "Concluídas") setAba("concluidas");
                  else if (stat.label === "Pendentes") setAba("minhas");
                  else if (stat.label === "Em andamento") {
                    setFiltroPrioridade("");
                    setFiltroTipo("");
                    setFiltro("");
                    setAba("minhas");
                  }
                  else if (stat.label === "Vencidas") {
                    setFiltroPrioridade("");
                    setFiltroTipo("");
                    setFiltro("");
                    setFiltroVisao("vencidas");
                    setAba("minhas");
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 md:px-2.5 md:py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:opacity-80 whitespace-nowrap"
                style={{ backgroundColor: stat.color + "15", color: stat.color }}>
                <stat.icon size={12} />
                {stat.label}: {stat.value}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {aba === "config" ? (
        <ConfigTab usuarios={usuarios} podeGerenciar={podeGerenciar} />
      ) : aba === "automacoes" ? (
        <AutomacoesTab usuarios={usuarios} podeGerenciar={podeGerenciar} />
      ) : loading ? (
        <div className="flex items-center justify-center flex-1 py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : aba === "kanban" ? (
        <div className="flex-1 overflow-x-auto snap-x snap-mandatory md:snap-none scrollbar-hide">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 md:gap-4 p-4 md:p-6 pb-24 md:pb-6 min-h-full md:w-max">
              {STATUS_COLS.map(col => (
                <DroppableColumn
                  key={col.key}
                  col={col}
                  tarefas={porStatus(col.key)}
                  onCardClick={(t) => setDrawerTarefa(t)}
                  activeId={activeId}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTarefa && (
                <div className="p-3 rounded-xl border shadow-xl rotate-2 w-64"
                  style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
                  <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{activeTarefa.titulo}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      ) : aba === "aguardando" ? (
        /* Cards mobile-first para aprovações pendentes — ação em 1 toque */
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-2xl mx-auto w-full space-y-3">
            {tarefasFiltradas.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: "#10B981" }} />
                <p className="text-sm font-medium" style={{ color: "#6B7280" }}>
                  Nenhuma aprovação pendente
                </p>
                <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
                  Tudo certo por aqui.
                </p>
              </div>
            ) : (
              tarefasFiltradas.map(t => {
                const pri = PRIORIDADE_BADGE[t.prioridade] ?? PRIORIDADE_BADGE.media;
                const tipoLabel = t.tipo ? (TIPO_LABEL[t.tipo] ?? t.tipo) : null;
                const estaRejeitando = rejeitandoId === t.id;
                const estaAprovando = salvandoAprov && aprovandoId === t.id;
                return (
                  <div key={t.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 transition-all">
                    {/* Solicitante */}
                    <div className="mb-2">
                      <p className="text-xs" style={{ color: "#6B7280" }}>Solicitante</p>
                      <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                        {t.criador_nome ?? "—"}
                      </p>
                    </div>

                    {/* Tipo */}
                    {tipoLabel && (
                      <div className="mb-2">
                        <p className="text-xs" style={{ color: "#6B7280" }}>Tipo</p>
                        <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{tipoLabel}</p>
                      </div>
                    )}

                    {/* Título */}
                    <p className="text-sm font-semibold leading-snug mb-2" style={{ color: "#1A1A1A" }}>
                      {t.titulo}
                    </p>

                    {/* Descrição completa */}
                    {t.descricao && (
                      <p className="text-xs leading-relaxed mb-3 whitespace-pre-line" style={{ color: "#6B7280" }}>
                        {t.descricao.replace(/\\n/g, "\n").replace(/• null\s?—?\s?/g, "• ").replace(/• null/g, "•").replace(/\*\*([^*]+)\*\*/g, "$1")}
                      </p>
                    )}

                    {/* Chips estruturados por tipo de aprovação */}
                    {(() => {
                      const chips = gerarChips(t);
                      return chips.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1 mb-3">
                          {chips.map((chip, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: chip.bg, color: chip.color }}
                            >
                              {chip.icon} {chip.label}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {/* Tempo */}
                    <p className="text-xs mb-3" style={{ color: "#9CA3AF" }}>
                      {tempoRelativo(t.created_at)}
                      {t.numero_ordem && <span className="ml-2">#{t.numero_ordem}</span>}
                    </p>

                    {/* Botões Aprovar / Rejeitar — sempre no DOM, visibilidade via CSS */}
                    <div className={estaRejeitando ? "hidden" : "flex gap-2"}>
                      <button
                        onClick={() => handleAprovar(t.id, t.tipo)}
                        disabled={salvandoAprov}
                        className="flex-1 py-2.5 text-sm rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                        style={{ backgroundColor: "#059669", color: "#fff" }}>
                        {estaAprovando ? "Aguarde..." : "✓ Aprovar"}
                      </button>
                      <button
                        onClick={() => { setRejeitandoId(t.id); setMotivoRejeicao(""); }}
                        disabled={salvandoAprov}
                        className="flex-1 py-2.5 text-sm rounded-xl font-semibold border disabled:opacity-50"
                        style={{ borderColor: "#DC2626", color: "#DC2626", backgroundColor: "#fff" }}>
                        ✗ Rejeitar
                      </button>
                    </div>

                    {/* Form de rejeição — sempre no DOM, visibilidade via CSS */}
                    <div className={estaRejeitando ? "space-y-2" : "hidden"}>
                      <textarea
                        placeholder="Motivo da rejeição (opcional)"
                        value={motivoRejeicao}
                        onChange={e => setMotivoRejeicao(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border rounded-xl text-sm outline-none resize-none"
                        style={{ borderColor: "#E5E7EB" }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejeitandoId(null); setMotivoRejeicao(""); }}
                          className="flex-1 py-2 text-sm rounded-xl border font-medium"
                          style={{ borderColor: "#E5E7EB", color: "#6B7280" }}>
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleRejeitar(t.id, t.tipo)}
                          disabled={salvandoAprov}
                          className="flex-1 py-2 text-sm rounded-xl font-semibold disabled:opacity-50"
                          style={{ backgroundColor: "#DC2626", color: "#fff" }}>
                          {salvandoAprov ? "Aguarde..." : "Confirmar"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Lista simples para outras views */
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 space-y-2 pb-24 md:pb-6">
            {tarefasFiltradas.length === 0 ? (
              <p className="text-sm text-center py-12" style={{ color: "#9CA3AF" }}>
                Nenhuma tarefa encontrada
              </p>
            ) : (
              tarefasFiltradas.map(t => {
                const pri = PRIORIDADE_BADGE[t.prioridade] ?? PRIORIDADE_BADGE.media;
                const colInfo = STATUS_COLS.find(c => c.key === t.status);
                const isVencida = isVencidaFn(t);
                return (
                  <div key={t.id}
                    onClick={() => setDrawerTarefa(t)}
                    className="p-4 md:p-3 rounded-xl border cursor-pointer hover:shadow-sm active:scale-[0.99] transition-all flex items-center gap-3"
                    style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
                    <div className="w-2.5 h-2.5 md:w-2 md:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colInfo?.color ?? "#9CA3AF" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 md:mb-1 flex-wrap md:flex-nowrap">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ backgroundColor: pri.bg, color: pri.text }}>
                          {pri.label}
                        </span>
                        <p className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: "#1A1A1A" }}>{t.titulo}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] flex-wrap" style={{ color: "#9CA3AF" }}>
                        {t.responsavel_nome && <span>{t.responsavel_nome.split(" ")[0]}</span>}
                        {t.data_limite && (
                          <span style={{ color: isVencida ? "#EF4444" : "#9CA3AF" }}>
                            {isVencida ? "⚠️ " : ""}
                            {safeFmtDate(t.data_limite)}
                          </span>
                        )}
                        {colInfo && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{ backgroundColor: colInfo.bg, color: colInfo.color }}>
                            {colInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* FAB Nova Tarefa — só mobile, escondido nas abas config/automacoes (que têm botão próprio) */}
      {aba !== "config" && aba !== "automacoes" && (
        <button
          onClick={() => setShowNova(true)}
          aria-label="Nova tarefa"
          className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}>
          <Plus size={26} />
        </button>
      )}

      {/* Drawer de detalhe */}
      {drawerTarefa && (
        <TarefaDrawer
          tarefa={drawerTarefa}
          usuarios={usuarios}
          currentUserId={user?.id ?? ""}
          role={role ?? ""}
          podeGerenciar={podeGerenciar}
          onClose={() => setDrawerTarefa(null)}
          onUpdated={(updated) => {
            setTarefas(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
            setDrawerTarefa(prev => prev ? { ...prev, ...updated } : null);
            // Se status virou terminal (aprovada/rejeitada/concluida/cancelada),
            // recarregar pra tarefa sair da aba atual e ir pra Concluídas
            if (updated.status && ["aprovada", "rejeitada", "concluida", "cancelada"].includes(updated.status)) {
              carregar();
              carregarStats();
            }
          }}
          onDeleted={(id) => {
            setTarefas(prev => prev.filter(t => t.id !== id));
            setDrawerTarefa(null);
            carregarStats();
          }}
        />
      )}

      {/* Modal Nova Tarefa */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setShowNova(false); }}>
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-5 space-y-3 shadow-2xl max-h-[92vh] md:max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between sticky -top-5 -mx-5 px-5 -mt-5 pt-5 pb-2 bg-white z-10">
              <h2 className="text-base font-bold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>Nova Tarefa</h2>
              <button onClick={() => setShowNova(false)} aria-label="Fechar"
                className="md:hidden p-1 rounded-lg hover:bg-gray-100">
                <span className="text-2xl leading-none text-gray-400">&times;</span>
              </button>
            </div>
            <input type="text" placeholder="Título *" autoFocus
              value={novaForm.titulo} onChange={e => setNovaForm({ ...novaForm, titulo: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}
              onKeyDown={e => { if (e.key === "Enter") criarTarefa(); }}
            />
            <select value={novaForm.tipo} onChange={e => setNovaForm({ ...novaForm, tipo: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Tipo (opcional)</option>
              <option value="sangria">Sangria</option>
              <option value="protocolo_metal">Protocolo de Metal</option>
              <option value="geral">Geral</option>
            </select>
            {novaForm.tipo === "protocolo_metal" && (
              <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: "#f9f6f1" }}>
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: C.esmeralda }}>Peso do metal enviado (g) *</p>
                  <input type="number" step="0.01" placeholder="Ex: 12.50"
                    value={pesoMetal}
                    onChange={e => setPesoMetal(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: C.esmeralda }}>Esta entrega tem ordens vinculadas?</p>
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => setTemOrdem(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${temOrdem === true ? "text-white" : "text-gray-500 bg-white"}`}
                      style={temOrdem === true ? { backgroundColor: C.esmeralda, borderColor: C.esmeralda } : { borderColor: C.cremeBorder }}>
                      Sim
                    </button>
                    <button type="button" onClick={() => { setTemOrdem(false); setOrdensInput([{ numero: "", id: null, erro: "" }]); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${temOrdem === false ? "text-white" : "text-gray-500 bg-white"}`}
                      style={temOrdem === false ? { backgroundColor: "#6B7280", borderColor: "#6B7280" } : { borderColor: C.cremeBorder }}>
                      Não
                    </button>
                  </div>
                  {temOrdem === true && (
                    <div className="space-y-2">
                      {ordensInput.map((o, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input type="text" placeholder={`Nº da ordem (ex: C-1865)`}
                            value={o.numero}
                            onChange={e => setOrdensInput(prev => prev.map((x, i) => i === idx ? { ...x, numero: e.target.value, id: null, erro: "" } : x))}
                            onBlur={e => buscarOrdemIdx(idx, e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none"
                            style={{ borderColor: o.erro ? "#EF4444" : o.id ? "#10B981" : C.cremeBorder }}
                          />
                          {o.id && <span className="text-xs font-semibold text-green-600 whitespace-nowrap">✓ {o.numero}</span>}
                          {o.erro && <span className="text-xs text-red-500 whitespace-nowrap">{o.erro}</span>}
                          {ordensInput.length > 1 && (
                            <button type="button" onClick={() => setOrdensInput(prev => prev.filter((_, i) => i !== idx))}
                              className="text-gray-400 hover:text-red-500 text-lg leading-none">&times;</button>
                          )}
                        </div>
                      ))}
                      <button type="button"
                        onClick={() => setOrdensInput(prev => [...prev, { numero: "", id: null, erro: "" }])}
                        className="text-xs font-semibold" style={{ color: C.esmeralda }}>
                        + Adicionar outra ordem
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <textarea placeholder="Descrição (opcional)" rows={2}
              value={novaForm.descricao} onChange={e => setNovaForm({ ...novaForm, descricao: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="grid grid-cols-2 gap-2">
              <select value={novaForm.prioridade} onChange={e => setNovaForm({ ...novaForm, prioridade: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <input type="date" value={novaForm.data_limite}
                onChange={e => setNovaForm({ ...novaForm, data_limite: e.target.value })}
                className="px-3 py-2.5 border rounded-xl text-sm outline-none"
                style={{ borderColor: C.cremeBorder }} />
            </div>
            <select value={responsavelId} onChange={e => setResponsavelId(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}>
              <option value="">Sem responsável</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <input type="text" placeholder="Tags (separadas por vírgula)"
              value={novaForm.tags} onChange={e => setNovaForm({ ...novaForm, tags: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none"
              style={{ borderColor: C.cremeBorder }} />
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowNova(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl">Cancelar</button>
              <button onClick={criarTarefa} disabled={salvando || !novaForm.titulo.trim()}
                className="px-4 py-2 text-sm rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                {salvando && <Loader2 size={13} className="animate-spin" />}
                {salvando ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
