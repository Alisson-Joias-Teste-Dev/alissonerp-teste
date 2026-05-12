"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, FlaskConical, UserCheck, X, Loader2, SlidersHorizontal, ExternalLink } from "lucide-react";
import ApontamentoPCPModal   from "@/components/forms/ApontamentoPCPModal";
import TransferenciaPCPModal from "@/components/forms/TransferenciaPCPModal";
import SaidaOrdemModal       from "@/components/forms/SaidaOrdemModal";
import NovaPCPModal          from "@/components/forms/NovaPCPModal";
import NovaFabricacaoModal   from "@/components/forms/NovaFabricacaoModal";
import PCPDetalheModal       from "@/components/forms/PCPDetalheModal";
import OrdemTesteModal       from "@/components/forms/OrdemTesteModal";
import KanbanCard, {
  ETAPAS_APONTAMENTO,
  ETAPAS_TRANSFERENCIA,
  ETAPAS_SAIDA,
} from "@/components/KanbanCard";

// ─── Modal de Atribuir Operador ───────────────────────────────────────────────
interface AtribuirOperadorModalProps {
  pcpId: number;
  onClose: () => void;
  onSuccess: () => void;
}

function AtribuirOperadorModal({ pcpId, onClose, onSuccess }: AtribuirOperadorModalProps) {
  const [depositos, setDepositos] = useState<{ id: number; nome: string }[]>([]);
  const [depositoSelecionado, setDepositoSelecionado] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((data: { id: number; nome: string }[]) => {
        // Excluir Almoxarifado Central (id=1)
        setDepositos(Array.isArray(data) ? data.filter((d) => d.id !== 1) : []);
      })
      .catch(() => setError("Erro ao carregar depósitos."));
  }, []);

  async function handleConfirmar() {
    if (!depositoSelecionado) {
      setError("Selecione um operador.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pcp/${pcpId}/atribuir-operador`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposito_id: depositoSelecionado }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Erro ao atribuir operador.");
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("Erro de rede.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "#E8DCC8" }}
        >
          <h3 className="text-base font-semibold" style={{ color: "#111827" }}>
            Atribuir Operador
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={15} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px]" style={{ color: "#6B7280" }}>
            PCP #{pcpId} — Selecione o operador responsável:
          </p>

          {depositos.length === 0 && !error && (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "#9CA3AF" }}>
              <Loader2 size={13} className="animate-spin" /> Carregando...
            </div>
          )}

          <div className="space-y-2">
            {depositos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setDepositoSelecionado(d.id); setError(""); }}
                className="w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all"
                style={{
                  borderColor: depositoSelecionado === d.id ? "#184036" : "#E8DCC8",
                  backgroundColor: depositoSelecionado === d.id ? "#18403610" : "#fff",
                  color: "#111827",
                  fontWeight: depositoSelecionado === d.id ? 600 : 400,
                }}
              >
                {d.nome}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-[12px] font-semibold" style={{ color: "#DC2626" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 border-t"
          style={{ borderColor: "#E8DCC8" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px] transition-colors"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={loading || !depositoSelecionado}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

const ETAPAS = [
  { key: "Novas Ordens", color: "#6366F1", bg: "#EEF2FF" },
  { key: "Pendencia",    color: "#F59E0B", bg: "#FFFBEB" },
  { key: "Aguardando",   color: "#0EA5E9", bg: "#F0F9FF" },
  { key: "Em Andamento", color: "#10B981", bg: "#ECFDF5" },
  { key: "Concluido",    color: "#184036", bg: "#F3EADA" },
  { key: "Cancelado",    color: "#EF4444", bg: "#FEF2F2" },
];

// Filtros — mapeamento dos labels visíveis para os enums de tipo_ordem
type TipoFiltro = "fabricacao" | "garantia" | "servico";
type DataCampo  = "ordem_created_at" | "pcp_created_at";

const TIPO_FILTRO_LABEL: Record<TipoFiltro, string> = {
  fabricacao: "Fabricação",
  garantia:   "Garantia",
  servico:    "Serviço",
};

// Cada filtro pode incluir múltiplos enums (ex: Serviço = venda + interno)
const TIPO_FILTRO_ENUMS: Record<TipoFiltro, string[]> = {
  fabricacao: ["fabricacao"],
  garantia:   ["garantia"],
  servico:    ["servico_venda", "servico_interno"],
};

// Etapas onde "atrasada" faz sentido (exclui finais)
const ETAPAS_ATIVAS_ATRASO = new Set(["Novas Ordens", "Pendencia", "Aguardando", "Em Andamento"]);

type PCPItem = any;

interface ModalState {
  pcpId:              number;
  ordemId:            number;
  depositoId:         number;
  setorId:            number | null;
  depositoAtribuido:  boolean;
  pesoMetalExterno?:  number;
}

type ActiveModal =
  | { type: "detalhe";           data: PCPItem }
  | { type: "apontamento";       data: ModalState }
  | { type: "transferencia";     data: ModalState }
  | { type: "saida";             data: ModalState }
  | { type: "atribuir_operador"; data: { pcpId: number } }
  | { type: "nova_pcp";          data: null }
  | { type: "nova_fabricacao";   data: null }
  | { type: "ordem_teste";       data: null }
  | null;


export default function KanbanClient({
  pcps,
  userRole,
  janelaConcluidasDias = 30,
}: {
  pcps: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  userRole?: string | null;
  janelaConcluidasDias?: number;
}) {
  const router = useRouter();
  const [search, setSearch]           = useState("");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // ─── Filtros ─────────────────────────────────────────────────────────────
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [apenasAtrasadas, setApenasAtrasadas] = useState(false);
  const [tiposSelecionados, setTiposSelecionados] = useState<Set<TipoFiltro>>(new Set());
  const [dataCampo, setDataCampo] = useState<DataCampo>("ordem_created_at");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const filtrosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filtrosOpen) return;
    const onClick = (e: MouseEvent) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target as Node)) {
        setFiltrosOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [filtrosOpen]);

  const filtrosAtivos =
    (apenasAtrasadas ? 1 : 0) +
    (tiposSelecionados.size > 0 ? 1 : 0) +
    (dataDe || dataAte ? 1 : 0);

  const limparFiltros = useCallback(() => {
    setApenasAtrasadas(false);
    setTiposSelecionados(new Set());
    setDataDe("");
    setDataAte("");
  }, []);

  const toggleTipo = useCallback((tipo: TipoFiltro) => {
    setTiposSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  }, []);

  // Busca server-side (ativada quando search.length >= 2, debounced 300ms).
  // Por default usamos `pcps` (prop do SSR). Quando o usuário digita,
  // trocamos por `serverResults` vindo de /api/pcp/buscar, que procura em
  // TODO o histórico (inclusive concluídas > 30 dias).
  const [serverResults, setServerResults] = useState<PCPItem[] | null>(null);
  const [searching, setSearching]         = useState(false);
  const [searchError, setSearchError]     = useState<string | null>(null);

  const isDesenvolvedor = userRole === "desenvolvedor";

  // Debounced server-side search
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setServerResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pcp/buscar?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const data = await res.json() as { results: PCPItem[]; total: number };
        setServerResults(data.results ?? []);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "Erro na busca");
        setServerResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Lista efetiva:
  //   - Se não há busca → prop `pcps` (load inicial)
  //   - Se há busca e serverResults populado → serverResults
  //   - Enquanto aguarda debounce/fetch → último resultado válido (ou prop)
  const baseList = useMemo(() => {
    if (serverResults != null) return serverResults;
    return pcps;
  }, [pcps, serverResults]);

  // Filtros aplicados client-side sobre a lista base
  const filtered = useMemo(() => {
    if (filtrosAtivos === 0) return baseList;

    const hojeISO = new Date().toISOString().slice(0, 10);
    const enumsPermitidos = new Set<string>();
    tiposSelecionados.forEach((t) => TIPO_FILTRO_ENUMS[t].forEach((e) => enumsPermitidos.add(e)));

    return baseList.filter((p: PCPItem) => {
      // Atrasadas: data_entrega < hoje E etapa ainda ativa
      if (apenasAtrasadas) {
        const prazo = p.data_entrega ? String(p.data_entrega).slice(0, 10) : null;
        if (!prazo || prazo >= hojeISO) return false;
        if (!ETAPAS_ATIVAS_ATRASO.has(p.etapas ?? "")) return false;
      }

      // Tipo de ordem (multi)
      if (enumsPermitidos.size > 0) {
        if (!p.tipo_ordem || !enumsPermitidos.has(p.tipo_ordem)) return false;
      }

      // Range de data — campo escolhido pelo usuário
      if (dataDe || dataAte) {
        const valor = dataCampo === "ordem_created_at" ? p.ordem_created_at : p.created_at;
        if (!valor) return false;
        const iso = String(valor).slice(0, 10);
        if (dataDe && iso < dataDe) return false;
        if (dataAte && iso > dataAte) return false;
      }

      return true;
    });
  }, [baseList, filtrosAtivos, apenasAtrasadas, tiposSelecionados, dataDe, dataAte, dataCampo]);

  const byEtapa = useMemo(() => {
    const map: Record<string, PCPItem[]> = {};
    for (const e of ETAPAS) map[e.key] = [];
    for (const p of filtered) {
      const etapa = p.etapas ?? "Desconhecido";
      if (!map[etapa]) map[etapa] = [];
      map[etapa].push(p);
    }
    return map;
  }, [filtered]);

  const makeModalData = useCallback((pcp: PCPItem): ModalState => ({
    pcpId:             pcp.id,
    ordemId:           pcp.ordem_id,
    depositoId:        pcp.deposito_id ?? 2,
    setorId:           pcp.setor_id ?? null,
    depositoAtribuido: pcp.deposito_id != null,
    pesoMetalExterno:  pcp.peso_metal_externo != null ? Number(pcp.peso_metal_externo) : undefined,
  }), []);

  const handleDetalhe    = useCallback((pcp: PCPItem) => setActiveModal({ type: "detalhe",           data: pcp }), []);
  const handleApontar    = useCallback((pcp: PCPItem) => setActiveModal({ type: "apontamento",       data: makeModalData(pcp) }), [makeModalData]);
  const handleTransferir = useCallback((pcp: PCPItem) => setActiveModal({ type: "transferencia",     data: makeModalData(pcp) }), [makeModalData]);
  const handleSaida      = useCallback((pcp: PCPItem) => setActiveModal({ type: "saida",             data: makeModalData(pcp) }), [makeModalData]);
  const handleAtribuir   = useCallback((pcp: PCPItem) => setActiveModal({ type: "atribuir_operador", data: { pcpId: pcp.id } }), []);

  const handleClose   = useCallback(() => setActiveModal(null), []);
  const handleSuccess = useCallback(() => { router.refresh(); }, [router]);

  const inSearchMode = serverResults != null;

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}
          >
            PCP — Kanban
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {inSearchMode ? (
              <>
                <span className="font-semibold" style={{ color: "#184036" }}>🔍 {filtered.length}</span>{" "}
                resultado(s) da busca em todo o histórico
                {filtrosAtivos > 0 && <> · <span style={{ color: "#184036" }}>{filtrosAtivos} filtro(s)</span></>}
              </>
            ) : filtrosAtivos > 0 ? (
              <>
                <span className="font-semibold" style={{ color: "#184036" }}>{filtered.length}</span> de {pcps.length}{" "}
                registros · <span style={{ color: "#184036" }}>{filtrosAtivos} filtro(s) ativo(s)</span>
              </>
            ) : (
              <>
                {pcps.length} registros ativos + concluídas dos últimos{" "}
                <span className="font-semibold">{janelaConcluidasDias}</span> dias
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Botão visível somente para desenvolvedor */}
          {isDesenvolvedor && (
            <button
              onClick={() => setActiveModal({ type: "ordem_teste", data: null })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
              title="Criar ordem de teste (modo desenvolvimento)"
            >
              <FlaskConical size={13} />
              Ordem Teste
            </button>
          )}
          {(() => {
            // Tab ativa = único tipo selecionado (ou "todos" se vazio)
            const tipoAtivo = tiposSelecionados.size === 1
              ? Array.from(tiposSelecionados)[0]
              : "todos";
            const isFabricacao = tipoAtivo === "fabricacao";
            return (
              <button
                onClick={() => setActiveModal({
                  type: isFabricacao ? "nova_fabricacao" : "nova_pcp",
                  data: null,
                })}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold"
                style={{ backgroundColor: "#184036", color: "#F3EADA" }}
              >
                <Plus size={13} strokeWidth={2.5} />
                {isFabricacao ? "Nova Fabricação" : "Nova Ordem"}
              </button>
            );
          })()}
          <div className="relative w-full md:w-72">
            <input
              type="text"
              placeholder="Buscar ordem, cliente, pedido..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-lg pl-3 pr-9 py-2 text-sm outline-none w-full"
              style={{ borderColor: inSearchMode ? "#184036" : "#E8DCC8" }}
            />
            {searching && (
              <Loader2
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
                style={{ color: "#184036" }}
              />
            )}
            {!searching && search.length > 0 && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
                title="Limpar busca"
              >
                <X size={14} style={{ color: "#6B7280" }} />
              </button>
            )}
            {searchError && (
              <p className="absolute left-0 -bottom-5 text-[10px] text-red-500">
                ⚠ {searchError}
              </p>
            )}
            {inSearchMode && !searching && !searchError && (
              <p className="absolute left-0 -bottom-5 text-[10px]" style={{ color: "#6B7280" }}>
                Buscando em todo o histórico (sem limite de data)
              </p>
            )}
          </div>

          {/* Botão de filtros */}
          <div ref={filtrosRef} className="relative">
            <button
              type="button"
              onClick={() => setFiltrosOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border transition-colors"
              style={{
                borderColor: filtrosAtivos > 0 ? "#184036" : "#E8DCC8",
                backgroundColor: filtrosAtivos > 0 ? "#184036" : "#F3EADA",
                color: filtrosAtivos > 0 ? "#F3EADA" : "#184036",
              }}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {filtrosAtivos > 0 && (
                <span
                  className="ml-1 text-[10px] font-bold px-1.5 rounded-full"
                  style={{ backgroundColor: "#F3EADA", color: "#184036" }}
                >
                  {filtrosAtivos}
                </span>
              )}
            </button>

            {filtrosOpen && (
              <div
                className="absolute right-0 z-30 mt-2 w-80 rounded-xl bg-white shadow-2xl border p-4 space-y-4"
                style={{ borderColor: "#E8DCC8" }}
              >
                {/* Atrasadas */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={apenasAtrasadas}
                    onChange={(e) => setApenasAtrasadas(e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-red-600"
                  />
                  <span className="text-[13px] font-semibold" style={{ color: "#7F1D1D" }}>
                    🔴 Apenas atrasadas
                  </span>
                </label>

                {/* Tipo de ordem (multi) */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                    Tipo de ordem
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(TIPO_FILTRO_LABEL) as TipoFiltro[]).map((tipo) => {
                      const ativo = tiposSelecionados.has(tipo);
                      return (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => toggleTipo(tipo)}
                          className="px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors border"
                          style={{
                            borderColor: ativo ? "#184036" : "#E8DCC8",
                            backgroundColor: ativo ? "#184036" : "#fff",
                            color: ativo ? "#F3EADA" : "#374151",
                          }}
                        >
                          {TIPO_FILTRO_LABEL[tipo]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Data */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                    Data
                  </p>
                  <select
                    value={dataCampo}
                    onChange={(e) => setDataCampo(e.target.value as DataCampo)}
                    className="w-full border rounded-md px-2 py-1.5 text-[12px] outline-none"
                    style={{ borderColor: "#E8DCC8", color: "#374151", backgroundColor: "#fff" }}
                  >
                    <option value="ordem_created_at">Criação da ordem</option>
                    <option value="pcp_created_at">Entrada no PCP</option>
                  </select>
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <span className="text-[10px]" style={{ color: "#6B7280" }}>De</span>
                      <input
                        type="date"
                        value={dataDe}
                        onChange={(e) => setDataDe(e.target.value)}
                        className="w-full border rounded-md px-2 py-1 text-[12px] outline-none"
                        style={{ borderColor: "#E8DCC8", color: "#374151" }}
                      />
                    </label>
                    <label className="flex-1">
                      <span className="text-[10px]" style={{ color: "#6B7280" }}>Até</span>
                      <input
                        type="date"
                        value={dataAte}
                        onChange={(e) => setDataAte(e.target.value)}
                        className="w-full border rounded-md px-2 py-1 text-[12px] outline-none"
                        style={{ borderColor: "#E8DCC8", color: "#374151" }}
                      />
                    </label>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: "#F3EADA" }}>
                  <button
                    type="button"
                    onClick={limparFiltros}
                    disabled={filtrosAtivos === 0}
                    className="text-[12px] font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ color: "#6B7280" }}
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltrosOpen(false)}
                    className="px-3 py-1.5 rounded-md text-[12px] font-semibold"
                    style={{ backgroundColor: "#184036", color: "#F3EADA" }}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs de fluxo — atalho rápido pra alternar entre Serviço e Fabricação.
          Sincronizado com tiposSelecionados: se exatamente 1 tipo está marcado,
          a tab correspondente fica ativa. "Todos" = nenhum filtro de tipo. */}
      {(() => {
        const tipoTabAtual: "todos" | TipoFiltro =
          tiposSelecionados.size === 1
            ? (Array.from(tiposSelecionados)[0] as TipoFiltro)
            : "todos";
        const TABS: Array<{ key: "todos" | TipoFiltro; label: string }> = [
          { key: "todos",      label: "Todos" },
          { key: "servico",    label: "Serviço" },
          { key: "fabricacao", label: "Fabricação" },
        ];
        const setTab = (key: "todos" | TipoFiltro) => {
          if (key === "todos") {
            setTiposSelecionados(new Set());
          } else {
            setTiposSelecionados(new Set([key]));
          }
        };
        // Conta por tipo (com base nos filtros não-tipo já aplicados)
        const contagem = baseList.reduce(
          (acc: Record<string, number>, p: PCPItem) => {
            const t = p.tipo_ordem ?? "";
            (Object.keys(TIPO_FILTRO_ENUMS) as TipoFiltro[]).forEach((k) => {
              if (TIPO_FILTRO_ENUMS[k].includes(t)) acc[k] = (acc[k] ?? 0) + 1;
            });
            acc.todos = (acc.todos ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        return (
          <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "#E8DCC8" }}>
            {TABS.map((t) => {
              const ativo = tipoTabAtual === t.key;
              const n = contagem[t.key] ?? 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className="px-4 py-2 text-[13px] font-semibold transition-colors -mb-px border-b-2"
                  style={{
                    borderBottomColor: ativo ? "#184036" : "transparent",
                    color: ativo ? "#184036" : "#6B7280",
                    backgroundColor: ativo ? "#F3EADA50" : "transparent",
                  }}
                >
                  {t.label}
                  <span
                    className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: ativo ? "#184036" : "#E8DCC8",
                      color: ativo ? "#F3EADA" : "#6B7280",
                    }}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Banner contextual — quando a tab Fabricação está ativa, sugere o
          kanban especializado por setores (/rota-fabricacao). A página de
          Rota de Fabricação organiza colunas pelos setores do produto_rota
          e tem drag-and-drop entre setores. */}
      {tiposSelecionados.size === 1 && tiposSelecionados.has("fabricacao") && (
        <div
          className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-lg border"
          style={{ backgroundColor: "#FEF3C7", borderColor: "#FDE68A" }}
        >
          <p className="text-[13px]" style={{ color: "#78350F" }}>
            <strong>Dica:</strong> pra visualizar as ordens de fabricação organizadas pelos
            setores do produto (com drag-and-drop entre etapas), use o kanban especializado.
          </p>
          <a
            href="/rota-fabricacao"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold shrink-0"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            Abrir Rota de Fabricação
            <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:snap-none">
        {ETAPAS.map((etapa) => {
          const cards = byEtapa[etapa.key] ?? [];
          return (
            <div
              key={etapa.key}
              className="flex-shrink-0 w-[calc(100vw-3rem)] md:w-56 snap-start rounded-xl flex flex-col"
              style={{ backgroundColor: etapa.bg, minHeight: 200 }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-t-xl"
                style={{
                  backgroundColor: etapa.color + "20",
                  borderBottom: `2px solid ${etapa.color}`,
                }}
              >
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: etapa.color }}
                >
                  {etapa.key}
                </span>
                <span
                  className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: etapa.color, color: "#fff" }}
                >
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div
                className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto"
                style={{ maxHeight: "70vh" }}
              >
                {cards.map((p) => (
                  <KanbanCard
                    key={p.id}
                    pcp={p}
                    onDetalhe={handleDetalhe}
                    onApontar={handleApontar}
                    onTransferir={handleTransferir}
                    onSaida={handleSaida}
                    onAtribuir={handleAtribuir}
                  />
                ))}
                {cards.length === 0 && (
                  <p
                    className="text-center text-[11px] py-4"
                    style={{ color: "#9CA3AF" }}
                  >
                    Vazio
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de atribuir operador */}
      {activeModal?.type === "atribuir_operador" && (
        <AtribuirOperadorModal
          pcpId={activeModal.data.pcpId}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}

      {/* Modais */}
      {activeModal?.type === "detalhe" && (
        <PCPDetalheModal
          pcp={activeModal.data}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "nova_pcp" && (
        <NovaPCPModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "nova_fabricacao" && (
        <NovaFabricacaoModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "ordem_teste" && (
        <OrdemTesteModal
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "apontamento" && (
        <ApontamentoPCPModal
          isOpen={true}
          onClose={handleClose}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          setorId={activeModal.data.setorId}
          depositoAtribuido={activeModal.data.depositoAtribuido}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "transferencia" && (
        <TransferenciaPCPModal
          isOpen={true}
          onClose={handleClose}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          setorId={activeModal.data.setorId}
          onSuccess={handleSuccess}
        />
      )}
      {activeModal?.type === "saida" && (
        <SaidaOrdemModal
          isOpen={true}
          onClose={handleClose}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          pesoMetalExterno={activeModal.data.pesoMetalExterno}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
