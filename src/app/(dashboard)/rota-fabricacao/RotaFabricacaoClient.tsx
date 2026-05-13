"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Loader2, RefreshCw, Users, X, Scale, Camera, GripVertical, Plus, MoreVertical, Pencil, Trash2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import KanbanCard from "@/components/KanbanCard";
import PCPDetalheModal from "@/components/forms/PCPDetalheModal";
import ApontamentoPCPModal from "@/components/forms/ApontamentoPCPModal";
import TransferenciaPCPModal from "@/components/forms/TransferenciaPCPModal";
import SaidaOrdemModal from "@/components/forms/SaidaOrdemModal";
import CadastrarRotaModal from "@/components/forms/CadastrarRotaModal";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  dourado:     "#DB9864",
};

interface Operador {
  deposito_id: number;
  deposito_nome: string;
}

interface Setor {
  id: number;
  nome: string;
  requer_peso: boolean;
  ordem: number;
  operadores: Operador[];
}

// PCPItem com a shape do vw_pcp_erp + campos da rota (vinda da API).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OFItem = any;

interface KanbanData {
  setores: Setor[];
  ofs: OFItem[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActiveModal =
  | { type: "detalhe";        data: OFItem }
  | { type: "apontamento";    data: { pcpId: number; ordemId: number; depositoId: number; setorId: number | null; depositoAtribuido: boolean } }
  | { type: "transferencia";  data: { pcpId: number; ordemId: number; depositoId: number; setorId: number | null; depositoAtribuido: boolean } }
  | { type: "saida";          data: { pcpId: number; ordemId: number; depositoId: number; setorId: number | null; depositoAtribuido: boolean; pesoMetalExterno?: number } }
  | { type: "atribuir";       data: OFItem }
  | { type: "cadastrar_rota"; data: { pcpId: number; produtoId: number; produtoNome: string | null } }
  | null;

export default function RotaFabricacaoClient() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [draggingPcpId, setDraggingPcpId] = useState<number | null>(null);
  const [dragOverSetorId, setDragOverSetorId] = useState<number | "sem-rota" | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [moverErr, setMoverErr] = useState<string | null>(null);
  // Inline CRUD de setores
  const [criandoSetor, setCriandoSetor] = useState(false);
  const [novoSetorNome, setNovoSetorNome] = useState("");
  const [editandoSetorId, setEditandoSetorId] = useState<number | null>(null);
  const [editandoNome, setEditandoNome] = useState("");
  const [setorBusy, setSetorBusy] = useState(false);
  const [setorErr, setSetorErr] = useState<string | null>(null);

  // Filtros aplicados client-side nas OFs antes de agrupar por setor
  const [filtroVendedorId, setFiltroVendedorId] = useState<number | "">("");
  const [filtroReposicao, setFiltroReposicao] = useState(false);
  // Filtro de status — server-side (recarrega a API com query param)
  type StatusFiltro = "ativas" | "concluidas" | "canceladas" | "todas";
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>("ativas");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/rota-fabricacao?status=${filtroStatus}`);
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── CRUD de setores (reaproveita /api/setores) ────────────────────────
  async function criarSetor() {
    const nome = novoSetorNome.trim();
    if (!nome) { setSetorErr("Nome obrigatório"); return; }
    setSetorBusy(true); setSetorErr(null);
    try {
      const r = await fetch("/api/setores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSetorErr((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      setNovoSetorNome("");
      setCriandoSetor(false);
      await carregar();
    } catch (e) {
      setSetorErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSetorBusy(false);
    }
  }

  async function renomearSetor(id: number) {
    const nome = editandoNome.trim();
    if (!nome) { setSetorErr("Nome obrigatório"); return; }
    setSetorBusy(true); setSetorErr(null);
    try {
      const r = await fetch(`/api/setores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSetorErr((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      setEditandoSetorId(null);
      await carregar();
    } catch (e) {
      setSetorErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSetorBusy(false);
    }
  }

  async function excluirSetor(s: Setor) {
    if (!confirm(`Inativar setor "${s.nome}"? OFs ainda nesse setor cairão na coluna "Novas Ordens".`)) return;
    setSetorBusy(true); setSetorErr(null);
    try {
      const r = await fetch(`/api/setores/${s.id}`, { method: "DELETE" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSetorErr((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      await carregar();
    } catch (e) {
      setSetorErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSetorBusy(false);
    }
  }

  /**
   * Move o setor `s` uma posição pra esquerda (-1) ou direita (+1).
   * Estratégia: troca a ordem do `s` com a ordem do vizinho ATIVO mais próximo
   * na direção pedida. Se não há vizinho (já é o primeiro/último), no-op.
   */
  async function moverSetor(s: Setor, direcao: -1 | 1) {
    if (!data) return;
    const ativos = [...data.setores].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
    const idx = ativos.findIndex((x) => x.id === s.id);
    if (idx < 0) return;
    const vizIdx = idx + direcao;
    if (vizIdx < 0 || vizIdx >= ativos.length) return;
    const vizinho = ativos[vizIdx];
    setSetorBusy(true); setSetorErr(null);
    try {
      // Swap das ordens via 2 PATCHes paralelos
      const [r1, r2] = await Promise.all([
        fetch(`/api/setores/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordem: vizinho.ordem }),
        }),
        fetch(`/api/setores/${vizinho.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordem: s.ordem }),
        }),
      ]);
      if (!r1.ok || !r2.ok) {
        setSetorErr("Erro ao reordenar — recarregue e tente novamente");
        return;
      }
      await carregar();
    } catch (e) {
      setSetorErr(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSetorBusy(false);
    }
  }

  // OFs filtradas client-side (vendedora / reposição)
  const ofsFiltradas = useMemo(() => {
    if (!data) return [] as OFItem[];
    return data.ofs.filter((o: OFItem) => {
      if (filtroReposicao && !o.eh_reposicao) return false;
      if (filtroVendedorId !== "" && Number(o.vendedor_id) !== Number(filtroVendedorId)) return false;
      return true;
    });
  }, [data, filtroVendedorId, filtroReposicao]);

  // Lista de vendedoras únicas presentes nas OFs (pra popular o select)
  const vendedoresDisponiveis = useMemo(() => {
    if (!data) return [] as { id: number; nome: string }[];
    const mapa = new Map<number, string>();
    for (const o of data.ofs as OFItem[]) {
      if (o.vendedor_id != null && o.vendedor_nome) {
        mapa.set(Number(o.vendedor_id), String(o.vendedor_nome));
      }
    }
    return Array.from(mapa.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data]);

  // Agrupa OFs por setor da ROTA (setor_id_rota), não pelo setor do operador.
  // "Sem rota" SEMPRE no início — é o pool das OFs que ainda precisam ser
  // configuradas e o gerente costuma trabalhar a partir dela.
  const colunas = useMemo(() => {
    if (!data) return [];
    const out: { setor: Setor | null; ofs: OFItem[] }[] = [];
    const semRota = ofsFiltradas.filter((o) => o.setor_id_rota == null);
    out.push({ setor: null, ofs: semRota });
    for (const s of data.setores) {
      out.push({ setor: s, ofs: ofsFiltradas.filter((o) => Number(o.setor_id_rota) === s.id) });
    }
    return out;
  }, [data, ofsFiltradas]);

  const totalOFs = data?.ofs.length ?? 0;
  const totalOFsFiltradas = ofsFiltradas.length;
  const filtrosAtivos = (filtroVendedorId !== "" ? 1 : 0) + (filtroReposicao ? 1 : 0);

  // ─── Drag & Drop ────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent<HTMLDivElement>, of: OFItem) {
    setDraggingPcpId(Number(of.id));
    setMoverErr(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(of.id));
  }
  function onDragEnd() {
    setDraggingPcpId(null);
    setDragOverSetorId(null);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>, setorIdAlvo: number | "sem-rota") {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSetorId(setorIdAlvo);
  }
  function onDragLeave(setorIdAlvo: number | "sem-rota") {
    setDragOverSetorId((curr) => (curr === setorIdAlvo ? null : curr));
  }
  async function onDrop(e: React.DragEvent<HTMLDivElement>, setorIdAlvo: number | "sem-rota") {
    e.preventDefault();
    setDragOverSetorId(null);
    const pcpIdRaw = e.dataTransfer.getData("text/plain");
    const pcpId = Number(pcpIdRaw);
    if (!pcpId) return;
    if (setorIdAlvo === "sem-rota") {
      setMoverErr("Não é possível mover de volta pra 'Novas Ordens'. Configure a rota do produto.");
      setDraggingPcpId(null);
      return;
    }
    // Se a OF já está nesse setor, não faz nada
    const of = data?.ofs.find((o) => Number(o.id) === pcpId);
    if (of && Number(of.setor_id_rota) === setorIdAlvo) {
      setDraggingPcpId(null);
      return;
    }

    setMovendo(true);
    setMoverErr(null);
    try {
      const r = await fetch(`/api/pcp/${pcpId}/mover-rota`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor_id: setorIdAlvo }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setMoverErr((b as { error?: string }).error ?? `Erro ${r.status} ao mover`);
        return;
      }
      await carregar();
    } catch (err) {
      setMoverErr(err instanceof Error ? err.message : "Erro de rede ao mover");
    } finally {
      setMovendo(false);
      setDraggingPcpId(null);
    }
  }

  // ─── Handlers do KanbanCard (modais) ────────────────────────────────────
  function abrirDetalhe(pcp: OFItem) {
    // PCPDetalheModal precisa de etapas_cod (não etapas)
    setActiveModal({ type: "detalhe", data: pcp });
  }
  function abrirApontar(pcp: OFItem) {
    setActiveModal({
      type: "apontamento",
      data: {
        pcpId: Number(pcp.id),
        ordemId: Number(pcp.ordem_id),
        depositoId: Number(pcp.deposito_id ?? 0),
        setorId: pcp.setor_id_rota != null ? Number(pcp.setor_id_rota) : null,
        depositoAtribuido: pcp.deposito_id != null,
      },
    });
  }
  function abrirTransferir(pcp: OFItem) {
    setActiveModal({
      type: "transferencia",
      data: {
        pcpId: Number(pcp.id),
        ordemId: Number(pcp.ordem_id),
        depositoId: Number(pcp.deposito_id ?? 0),
        setorId: pcp.setor_id_rota != null ? Number(pcp.setor_id_rota) : null,
        depositoAtribuido: pcp.deposito_id != null,
      },
    });
  }
  function abrirSaida(pcp: OFItem) {
    setActiveModal({
      type: "saida",
      data: {
        pcpId: Number(pcp.id),
        ordemId: Number(pcp.ordem_id),
        depositoId: Number(pcp.deposito_id ?? 0),
        setorId: pcp.setor_id_rota != null ? Number(pcp.setor_id_rota) : null,
        depositoAtribuido: pcp.deposito_id != null,
        pesoMetalExterno: pcp.peso_metal_externo != null ? Number(pcp.peso_metal_externo) : undefined,
      },
    });
  }
  function abrirAtribuir(pcp: OFItem) {
    setActiveModal({ type: "atribuir", data: pcp });
  }
  function abrirCadastrarRota(pcp: OFItem) {
    setActiveModal({
      type: "cadastrar_rota",
      data: {
        pcpId: Number(pcp.id),
        produtoId: Number(pcp.produto_id),
        produtoNome: pcp.produto_nome ?? null,
      },
    });
  }
  function fecharModal() { setActiveModal(null); }
  function onSuccessModal() { setActiveModal(null); carregar(); }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Rota de Fabricação
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            Kanban de OFs ativas por setor ·{" "}
            {filtrosAtivos > 0 ? (
              <>
                <span className="font-semibold" style={{ color: C.esmeralda }}>{totalOFsFiltradas}</span> de {totalOFs} OF(s)
                <span className="ml-1" style={{ color: C.esmeralda }}>· {filtrosAtivos} filtro(s)</span>
              </>
            ) : (
              <>{totalOFs} OF(s)</>
            )}{" "}
            · {data?.setores.length ?? 0} setor(es) ativos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro de STATUS (server-side — recarrega a API) */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as StatusFiltro)}
            disabled={loading}
            className="px-3 py-2 rounded-lg border text-[12px] bg-white outline-none font-semibold"
            style={{
              borderColor: filtroStatus !== "ativas" ? C.esmeralda : C.cremeBorder,
              color: C.esmeralda,
            }}
            title="Status das OFs exibidas"
          >
            <option value="ativas">🟢 Ativas</option>
            <option value="concluidas">⚫ Concluídas (30d)</option>
            <option value="canceladas">🔴 Canceladas (30d)</option>
            <option value="todas">📋 Todas (30d)</option>
          </select>
          {/* Filtro vendedora */}
          <select
            value={filtroVendedorId}
            onChange={(e) => setFiltroVendedorId(e.target.value === "" ? "" : Number(e.target.value))}
            className="px-3 py-2 rounded-lg border text-[12px] bg-white outline-none"
            style={{ borderColor: filtroVendedorId !== "" ? C.esmeralda : C.cremeBorder, color: C.esmeralda }}
            title="Filtrar por vendedora"
          >
            <option value="">Todas as vendedoras</option>
            {vendedoresDisponiveis.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
          {/* Toggle reposição */}
          <button
            type="button"
            onClick={() => setFiltroReposicao((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border"
            style={{
              borderColor: filtroReposicao ? "#1E40AF" : C.cremeBorder,
              backgroundColor: filtroReposicao ? "#DBEAFE" : "#fff",
              color: filtroReposicao ? "#1E40AF" : "#6B7280",
            }}
            title="Mostrar só ordens de reposição automática (REPO)"
          >
            🔄 Só reposição
          </button>
          {/* Limpar filtros (quando algum está ativo) */}
          {filtrosAtivos > 0 && (
            <button
              type="button"
              onClick={() => { setFiltroVendedorId(""); setFiltroReposicao(false); }}
              className="text-[11px] font-semibold text-red-500 hover:text-red-700 px-2"
              title="Limpar filtros"
            >
              ✕ Limpar
            </button>
          )}
          <button
            onClick={carregar}
            disabled={loading || movendo}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", color: "#7F1D1D" }}>
          ⚠ {error}
        </div>
      )}
      {moverErr && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm border flex items-center justify-between gap-3" style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", color: "#7F1D1D" }}>
          <span>⚠ {moverErr}</span>
          <button onClick={() => setMoverErr(null)} className="p-1 rounded hover:bg-red-100">
            <X size={14} />
          </button>
        </div>
      )}
      {setorErr && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm border flex items-center justify-between gap-3" style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", color: "#7F1D1D" }}>
          <span>⚠ {setorErr}</span>
          <button onClick={() => setSetorErr(null)} className="p-1 rounded hover:bg-red-100">
            <X size={14} />
          </button>
        </div>
      )}

      <div
        className="mb-4 rounded-lg px-3 py-2 text-[12px] flex items-center gap-2"
        style={{ backgroundColor: "#F0FDF4", borderLeft: "3px solid #16A34A", color: "#166534" }}
      >
        <GripVertical size={13} />
        <span>
          Ordens caem em <strong>"Novas Ordens"</strong>. Clique em <strong>"Definir Rota"</strong> no card pra
          mapear os setores do produto — depois disso o card é distribuído automaticamente.
          Cards já em setores podem ser arrastados pra mover entre etapas.
        </span>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16" style={{ color: "#9CA3AF" }}>
          <Loader2 size={20} className="animate-spin mr-2" /> Carregando…
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {colunas.map(({ setor, ofs }, idx) => {
            const setorIdAlvo: number | "sem-rota" = setor?.id ?? "sem-rota";
            const isOver = dragOverSetorId === setorIdAlvo;
            // posição entre os setores ativos (excluindo "Sem rota") pra
            // habilitar/desabilitar setas de mover.
            const setorIdx = setor ? idx - 1 : -1; // -1 quando é "sem-rota"
            const totalSetores = data?.setores.length ?? 0;
            return (
              <KanbanColuna
                key={String(setorIdAlvo)}
                setor={setor}
                ofs={ofs}
                isDragOver={isOver}
                draggingPcpId={draggingPcpId}
                onDragOver={(e) => onDragOver(e, setorIdAlvo)}
                onDragLeave={() => onDragLeave(setorIdAlvo)}
                onDrop={(e) => onDrop(e, setorIdAlvo)}
                onCardDragStart={onDragStart}
                onCardDragEnd={onDragEnd}
                onDetalhe={abrirDetalhe}
                onApontar={abrirApontar}
                onTransferir={abrirTransferir}
                onSaida={abrirSaida}
                onAtribuir={abrirAtribuir}
                onCadastrarRota={abrirCadastrarRota}
                editandoSetorId={editandoSetorId}
                editandoNome={editandoNome}
                setorBusy={setorBusy}
                podeMoverEsq={setorIdx > 0}
                podeMoverDir={setorIdx >= 0 && setorIdx < totalSetores - 1}
                onIniciarEdicao={(s) => { setEditandoSetorId(s.id); setEditandoNome(s.nome); }}
                onCancelarEdicao={() => setEditandoSetorId(null)}
                onChangeEditNome={setEditandoNome}
                onSalvarEdicao={renomearSetor}
                onMoverEsq={(s) => moverSetor(s, -1)}
                onMoverDir={(s) => moverSetor(s, 1)}
                onExcluir={excluirSetor}
              />
            );
          })}

          {/* Coluna "+ Novo setor" — sempre no fim */}
          <NovoSetorColuna
            criando={criandoSetor}
            nome={novoSetorNome}
            busy={setorBusy}
            onNomeChange={setNovoSetorNome}
            onIniciar={() => { setCriandoSetor(true); setNovoSetorNome(""); setSetorErr(null); }}
            onCancelar={() => { setCriandoSetor(false); setNovoSetorNome(""); }}
            onConfirmar={criarSetor}
          />

          {colunas.length === 0 && !criandoSetor && (
            <p className="text-sm py-12 px-4" style={{ color: "#9CA3AF" }}>
              Nenhum setor ativo. Use o botão <strong>+ Novo setor</strong> ao lado.
            </p>
          )}
        </div>
      )}

      {/* Modais ─ reaproveitando os do PCP */}
      {activeModal?.type === "detalhe" && (
        <PCPDetalheModal
          pcp={activeModal.data}
          onClose={fecharModal}
          onSuccess={onSuccessModal}
        />
      )}
      {activeModal?.type === "apontamento" && (
        <ApontamentoPCPModal
          isOpen={true}
          onClose={fecharModal}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          setorId={activeModal.data.setorId}
          depositoAtribuido={activeModal.data.depositoAtribuido}
          onSuccess={onSuccessModal}
        />
      )}
      {activeModal?.type === "transferencia" && (
        <TransferenciaPCPModal
          isOpen={true}
          onClose={fecharModal}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          setorId={activeModal.data.setorId}
          onSuccess={onSuccessModal}
        />
      )}
      {activeModal?.type === "saida" && (
        <SaidaOrdemModal
          isOpen={true}
          onClose={fecharModal}
          pcpId={activeModal.data.pcpId}
          ordemId={activeModal.data.ordemId}
          depositoId={activeModal.data.depositoId}
          pesoMetalExterno={activeModal.data.pesoMetalExterno}
          onSuccess={onSuccessModal}
        />
      )}
      {activeModal?.type === "atribuir" && (
        <ModalAtribuir
          of={activeModal.data}
          setor={data?.setores.find((s) => s.id === Number(activeModal.data.setor_id_rota)) ?? null}
          onClose={fecharModal}
          onSuccess={onSuccessModal}
        />
      )}
      {activeModal?.type === "cadastrar_rota" && (
        <CadastrarRotaModal
          isOpen={true}
          produtoId={activeModal.data.produtoId}
          produtoNome={activeModal.data.produtoNome}
          pcpId={activeModal.data.pcpId}
          setoresDisponiveis={(data?.setores ?? []).map((s) => ({ id: s.id, nome: s.nome }))}
          onClose={fecharModal}
          onSuccess={onSuccessModal}
        />
      )}
    </div>
  );
}

// ─── Coluna do kanban ───────────────────────────────────────────────────────
function KanbanColuna({
  setor,
  ofs,
  isDragOver,
  draggingPcpId,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onDetalhe,
  onApontar,
  onTransferir,
  onSaida,
  onAtribuir,
  onCadastrarRota,
  editandoSetorId,
  editandoNome,
  setorBusy,
  podeMoverEsq,
  podeMoverDir,
  onIniciarEdicao,
  onCancelarEdicao,
  onChangeEditNome,
  onSalvarEdicao,
  onMoverEsq,
  onMoverDir,
  onExcluir,
}: {
  setor: Setor | null;
  ofs: OFItem[];
  isDragOver: boolean;
  draggingPcpId: number | null;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onCardDragStart: (e: React.DragEvent<HTMLDivElement>, of: OFItem) => void;
  onCardDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onDetalhe: (pcp: OFItem) => void;
  onApontar: (pcp: OFItem) => void;
  onTransferir: (pcp: OFItem) => void;
  onSaida: (pcp: OFItem) => void;
  onAtribuir: (pcp: OFItem) => void;
  onCadastrarRota: (pcp: OFItem) => void;
  editandoSetorId: number | null;
  editandoNome: string;
  setorBusy: boolean;
  podeMoverEsq: boolean;
  podeMoverDir: boolean;
  onIniciarEdicao: (s: Setor) => void;
  onCancelarEdicao: () => void;
  onChangeEditNome: (v: string) => void;
  onSalvarEdicao: (id: number) => void;
  onMoverEsq: (s: Setor) => void;
  onMoverDir: (s: Setor) => void;
  onExcluir: (s: Setor) => void;
}) {
  const isSemRota = setor == null;
  const requerPeso = setor?.requer_peso ?? true;
  const editando = setor != null && editandoSetorId === setor.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <div
      className="flex-shrink-0 w-72 snap-start rounded-xl flex flex-col transition-all"
      style={{
        backgroundColor: isSemRota ? "#F3F4F6" : C.cremeBg,
        minHeight: 240,
        outline: isDragOver ? `2px dashed ${C.esmeralda}` : "none",
        outlineOffset: isDragOver ? "-4px" : 0,
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 rounded-t-xl"
        style={{
          backgroundColor: isSemRota ? "#E5E7EB" : (requerPeso ? "#FEF3C7" : "#E0E7FF"),
          borderBottom: `2px solid ${isSemRota ? "#9CA3AF" : (requerPeso ? "#F59E0B" : "#6366F1")}`,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {editando && setor ? (
            <input
              autoFocus
              value={editandoNome}
              onChange={(e) => onChangeEditNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSalvarEdicao(setor.id);
                if (e.key === "Escape") onCancelarEdicao();
              }}
              disabled={setorBusy}
              className="flex-1 px-2 py-0.5 rounded border text-[11px] font-bold uppercase tracking-wider outline-none"
              style={{ borderColor: C.esmeralda, color: "#111827", backgroundColor: "#fff" }}
            />
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color: isSemRota ? "#374151" : (requerPeso ? "#92400E" : "#3730A3") }}>
              {setor?.nome ?? "Novas Ordens"}
            </span>
          )}
          <div className="flex items-center gap-1">
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: isSemRota ? "#374151" : (requerPeso ? "#F59E0B" : "#6366F1"), color: "#fff" }}
            >
              {ofs.length}
            </span>
            {/* Ações de edição (só pra setores reais) */}
            {!isSemRota && setor && !editando && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={setorBusy}
                  className="p-1 rounded hover:bg-white/40 disabled:opacity-40"
                  title="Ações da coluna"
                  style={{ color: requerPeso ? "#92400E" : "#3730A3" }}
                >
                  <MoreVertical size={13} />
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-lg border z-10 py-1 text-sm"
                    style={{ backgroundColor: "#fff", borderColor: C.cremeBorder, color: "#111827" }}
                  >
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onIniciarEdicao(setor); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-[12px]"
                    >
                      <Pencil size={12} /> Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onMoverEsq(setor); }}
                      disabled={!podeMoverEsq || setorBusy}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-2 text-[12px]"
                    >
                      <ChevronLeft size={12} /> Mover pra esquerda
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onMoverDir(setor); }}
                      disabled={!podeMoverDir || setorBusy}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent flex items-center gap-2 text-[12px]"
                    >
                      <ChevronRight size={12} /> Mover pra direita
                    </button>
                    <div className="border-t my-1" style={{ borderColor: C.cremeBorder }} />
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onExcluir(setor); }}
                      disabled={setorBusy}
                      className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 disabled:opacity-40 flex items-center gap-2 text-[12px]"
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
            {editando && setor && (
              <>
                <button
                  type="button"
                  onClick={() => onSalvarEdicao(setor.id)}
                  disabled={setorBusy}
                  className="p-1 rounded hover:bg-white/40 disabled:opacity-40"
                  title="Salvar"
                  style={{ color: "#15803D" }}
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  onClick={onCancelarEdicao}
                  disabled={setorBusy}
                  className="p-1 rounded hover:bg-white/40 disabled:opacity-40"
                  title="Cancelar"
                  style={{ color: "#6B7280" }}
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        </div>
        {!isSemRota && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {requerPeso ? (
              <>
                <Scale size={10} style={{ color: "#92400E" }} />
                <span className="text-[10px] font-medium" style={{ color: "#92400E" }}>Com peso</span>
              </>
            ) : (
              <>
                <Camera size={10} style={{ color: "#3730A3" }} />
                <span className="text-[10px] font-medium" style={{ color: "#3730A3" }}>Pré-ouro · só foto</span>
              </>
            )}
          </div>
        )}
        {setor && setor.operadores.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] truncate" style={{ color: requerPeso ? "#78350F" : "#312E81" }}>
            <Users size={10} />
            <span className="truncate">{setor.operadores.map((o) => o.deposito_nome).join(", ")}</span>
          </div>
        )}
        {setor && setor.operadores.length === 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px]" style={{ color: "#9CA3AF" }}>
            <Users size={10} />
            <span>Sem colaboradores · configure em /setores</span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        {ofs.length === 0 && (
          <p className="text-center text-[11px] py-4" style={{ color: "#9CA3AF" }}>
            {isDragOver ? "Solte aqui" : "Vazio"}
          </p>
        )}
        {ofs.map((of) => {
          const isDragging = draggingPcpId === Number(of.id);
          // Badge "REPO" pra OFs auto de reposição
          const extra = of.eh_reposicao ? (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#DBEAFE", color: "#1E40AF" }}
              title="OF de reposição automática"
            >
              REPO
            </span>
          ) : null;
          const podeDefinirRota = isSemRota && of.produto_id != null;
          return (
            <div key={of.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
              <KanbanCard
                pcp={of}
                draggable
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                onDetalhe={onDetalhe}
                onApontar={onApontar}
                onTransferir={onTransferir}
                onSaida={onSaida}
                onAtribuir={onAtribuir}
                extraBadges={extra}
              />
              {/* Botão "Definir Rota" — aparece apenas nos cards de "Novas
                  Ordens" que têm produto vinculado. Clicando, abre o modal
                  pra gerente preencher a sequência de setores e distribuir
                  automaticamente. */}
              {podeDefinirRota && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCadastrarRota(of); }}
                  className="mt-1 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-bold border-2 border-dashed hover:bg-emerald-50"
                  style={{ borderColor: "#10B981", color: "#059669" }}
                >
                  ➜ Definir Rota
                </button>
              )}
              {isSemRota && of.produto_id == null && (
                <p className="mt-1 px-2 py-1 text-[10px] text-amber-700 bg-amber-50 rounded">
                  Sem produto vinculado — não dá pra cadastrar rota.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Coluna "+ Novo setor" — criar inline um novo setor ────────────────────
function NovoSetorColuna({
  criando,
  nome,
  busy,
  onNomeChange,
  onIniciar,
  onCancelar,
  onConfirmar,
}: {
  criando: boolean;
  nome: string;
  busy: boolean;
  onNomeChange: (v: string) => void;
  onIniciar: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  if (!criando) {
    return (
      <button
        type="button"
        onClick={onIniciar}
        disabled={busy}
        className="flex-shrink-0 w-72 snap-start rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
        style={{
          minHeight: 240,
          borderColor: C.cremeBorder,
          color: C.esmeralda,
          backgroundColor: "transparent",
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: C.cremeBg }}
        >
          <Plus size={20} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold">Novo setor</span>
        <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
          Cria uma coluna nova no kanban
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex-shrink-0 w-72 snap-start rounded-xl flex flex-col"
      style={{ backgroundColor: C.cremeBg, minHeight: 240, border: `2px dashed ${C.esmeralda}` }}
    >
      <div className="px-3 py-2.5 rounded-t-xl border-b" style={{ backgroundColor: "#F0F7F4", borderColor: C.cremeBorder }}>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>
          Novo setor
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <input
          autoFocus
          value={nome}
          onChange={(e) => onNomeChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirmar();
            if (e.key === "Escape") onCancelar();
          }}
          placeholder="Ex: Polimento, Galvânica..."
          className="px-3 py-2 rounded-lg border text-sm outline-none bg-white"
          style={{ borderColor: C.cremeBorder, color: "#111827" }}
          disabled={busy}
        />
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onConfirmar}
            disabled={busy || !nome.trim()}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Criar
          </button>
          <button
            type="button"
            onClick={onCancelar}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-[12px] font-semibold border"
            style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
          >
            Cancelar
          </button>
        </div>
        <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>
          Após criar, defina os colaboradores em <a href="/setores" className="underline">/setores</a>.
        </p>
      </div>
    </div>
  );
}

// ─── Modal de atribuir operador (override individual) ──────────────────────
function ModalAtribuir({
  of,
  setor,
  onClose,
  onSuccess,
}: {
  of: OFItem;
  setor: Setor | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [allDepositos, setAllDepositos] = useState<{ id: number; nome: string }[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(of.operador_atribuido_id ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((arr) => setAllDepositos(Array.isArray(arr) ? arr.filter((d) => d.id !== 1) : []))
      .catch(() => { /* ignore */ });
  }, []);

  const sugeridos = useMemo(() => setor?.operadores.map((o) => o.deposito_id) ?? [], [setor]);

  async function salvar(opId: number | null) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/pcp/${of.id}/atribuir-operador-rota`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operador_atribuido_id: opId }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      onSuccess();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: C.esmeralda }}>
              Atribuir colaborador
            </h3>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              {of.numero_ordem ?? `OF #${of.ordem_id}`} · setor: {setor?.nome ?? "Sem rota"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {erro && <p className="text-[12px] text-red-600">⚠ {erro}</p>}

          <button
            type="button"
            onClick={() => { setSelecionado(null); salvar(null); }}
            disabled={salvando}
            className="w-full text-left px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
            style={{ borderColor: selecionado == null ? C.esmeralda : C.cremeBorder, backgroundColor: selecionado == null ? "#F0F7F4" : "#fff" }}
          >
            👥 Qualquer um da lista do setor
          </button>

          {sugeridos.length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider mt-3" style={{ color: "#9CA3AF" }}>
                Colaboradores do setor
              </p>
              <div className="space-y-1.5">
                {(setor?.operadores ?? []).map((op) => (
                  <button
                    key={op.deposito_id}
                    type="button"
                    onClick={() => { setSelecionado(op.deposito_id); salvar(op.deposito_id); }}
                    disabled={salvando}
                    className="w-full text-left px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
                    style={{
                      borderColor: selecionado === op.deposito_id ? C.esmeralda : C.cremeBorder,
                      backgroundColor: selecionado === op.deposito_id ? "#F0F7F4" : "#fff",
                    }}
                  >
                    👤 {op.deposito_nome}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] font-bold uppercase tracking-wider mt-3" style={{ color: "#9CA3AF" }}>
            Outros operadores
          </p>
          <div className="space-y-1.5">
            {allDepositos
              .filter((d) => !sugeridos.includes(d.id))
              .map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { setSelecionado(d.id); salvar(d.id); }}
                  disabled={salvando}
                  className="w-full text-left px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
                  style={{
                    borderColor: selecionado === d.id ? C.esmeralda : C.cremeBorder,
                    backgroundColor: selecionado === d.id ? "#F0F7F4" : "#fff",
                  }}
                >
                  {d.nome}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

