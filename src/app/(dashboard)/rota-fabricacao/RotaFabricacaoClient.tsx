"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, UserCheck, Users, X, Scale, Camera } from "lucide-react";

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
  operadores: Operador[];
}

interface OFKanban {
  pcp_id: number;
  ordem_id: number;
  numero_ordem: string | null;
  cliente_nome: string | null;
  produto_nome: string | null;
  produto_sku: string | null;
  peso_negociado: number | null;
  setor_id: number | null;
  setor_nome: string | null;
  rota_etapa_atual: number | null;
  operador_atribuido_id: number | null;
  operador_atribuido_nome: string | null;
  eh_reposicao: boolean;
}

interface KanbanData {
  setores: Setor[];
  ofs: OFKanban[];
}

export default function RotaFabricacaoClient() {
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atribuindo, setAtribuindo] = useState<OFKanban | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/rota-fabricacao");
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
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Agrupa OFs por setor — coluna "Sem rota" pra OFs sem setor
  const colunas = useMemo(() => {
    if (!data) return [];
    const out: { setor: Setor | null; ofs: OFKanban[] }[] = [
      ...data.setores.map((s) => ({
        setor: s,
        ofs: data.ofs.filter((o) => o.setor_id === s.id),
      })),
    ];
    const semRota = data.ofs.filter((o) => o.setor_id == null);
    if (semRota.length > 0) out.push({ setor: null, ofs: semRota });
    return out;
  }, [data]);

  const totalOFs = data?.ofs.length ?? 0;

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
            Kanban de OFs ativas por setor · {totalOFs} OF(s) · {data?.setores.length ?? 0} setor(es) ativos
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border"
          style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm border" style={{ backgroundColor: "#FEF2F2", borderColor: "#FCA5A5", color: "#7F1D1D" }}>
          ⚠ {error}
        </div>
      )}

      {/* Aviso de avanço por foto+IA — só informativo */}
      <div
        className="mb-4 rounded-lg px-3 py-2 text-[12px] flex items-center gap-2"
        style={{ backgroundColor: "#FFFBEB", borderLeft: "3px solid #F59E0B", color: "#92400E" }}
      >
        <Camera size={13} />
        <span>
          Movimento entre setores acontece via foto + IA (próxima fase). Aqui você visualiza e atribui colaboradores.
        </span>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16" style={{ color: "#9CA3AF" }}>
          <Loader2 size={20} className="animate-spin mr-2" /> Carregando…
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {colunas.map(({ setor, ofs }) => (
            <KanbanColuna
              key={setor?.id ?? "sem-rota"}
              setor={setor}
              ofs={ofs}
              onAtribuir={(of) => setAtribuindo(of)}
            />
          ))}
          {colunas.length === 0 && (
            <p className="text-sm py-12 px-4" style={{ color: "#9CA3AF" }}>
              Nenhum setor ativo. Cadastre setores em <a href="/setores" className="underline font-semibold">/setores</a>.
            </p>
          )}
        </div>
      )}

      {atribuindo && (
        <ModalAtribuir
          of={atribuindo}
          setor={data?.setores.find((s) => s.id === atribuindo.setor_id) ?? null}
          onClose={() => setAtribuindo(null)}
          onSuccess={() => { setAtribuindo(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ─── Coluna do kanban ───────────────────────────────────────────────────────
function KanbanColuna({
  setor,
  ofs,
  onAtribuir,
}: {
  setor: Setor | null;
  ofs: OFKanban[];
  onAtribuir: (of: OFKanban) => void;
}) {
  const isSemRota = setor == null;
  const requerPeso = setor?.requer_peso ?? true;

  return (
    <div
      className="flex-shrink-0 w-72 snap-start rounded-xl flex flex-col"
      style={{ backgroundColor: isSemRota ? "#F3F4F6" : C.cremeBg, minHeight: 240 }}
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
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isSemRota ? "#374151" : (requerPeso ? "#92400E" : "#3730A3") }}>
            {setor?.nome ?? "Sem rota"}
          </span>
          <span
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: isSemRota ? "#374151" : (requerPeso ? "#F59E0B" : "#6366F1"), color: "#fff" }}
          >
            {ofs.length}
          </span>
        </div>
        {/* Badge pré-ouro / com peso */}
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
        {/* Operadores responsáveis */}
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
          <p className="text-center text-[11px] py-4" style={{ color: "#9CA3AF" }}>Vazio</p>
        )}
        {ofs.map((of) => (
          <KanbanCard key={of.pcp_id} of={of} onAtribuir={() => onAtribuir(of)} />
        ))}
      </div>
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────
function KanbanCard({ of, onAtribuir }: { of: OFKanban; onAtribuir: () => void }) {
  return (
    <div
      className="bg-white rounded-lg border p-2.5 text-xs shadow-sm"
      style={{ borderColor: C.cremeBorder }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm" style={{ color: C.esmeralda }}>
          {of.numero_ordem ?? `#${of.ordem_id}`}
        </span>
        <div className="flex items-center gap-1">
          {of.eh_reposicao && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#DBEAFE", color: "#1E40AF" }}
              title="OF de reposição automática"
            >
              REPO
            </span>
          )}
          <span className="font-mono text-[10px]" style={{ color: "#9CA3AF" }}>
            #{of.pcp_id}
          </span>
        </div>
      </div>

      {of.produto_nome && (
        <p className="truncate" style={{ color: "#1A1A1A" }} title={of.produto_nome}>
          {of.produto_sku ? `${of.produto_sku} · ` : ""}{of.produto_nome}
        </p>
      )}
      {of.cliente_nome && (
        <p className="text-[10px] truncate mt-0.5" style={{ color: "#6B7280" }}>
          {of.cliente_nome}
        </p>
      )}

      {of.peso_negociado != null && of.peso_negociado > 0 && (
        <p className="text-[10px] mt-1 font-mono" style={{ color: C.dourado }}>
          {Number(of.peso_negociado).toFixed(2)}g
        </p>
      )}

      {/* Operador */}
      <div
        className="mt-2 pt-1.5 flex items-center justify-between gap-1"
        style={{ borderTop: "1px solid #F3EADA" }}
      >
        <span className="text-[10px] truncate" style={{ color: of.operador_atribuido_nome ? "#374151" : "#9CA3AF" }}>
          👤 {of.operador_atribuido_nome ?? "Qualquer do setor"}
        </span>
        <button
          onClick={onAtribuir}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded hover:bg-gray-100"
          style={{ color: C.esmeralda }}
          title="Atribuir colaborador"
        >
          <UserCheck size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Modal de atribuir operador ─────────────────────────────────────────────
function ModalAtribuir({
  of,
  setor,
  onClose,
  onSuccess,
}: {
  of: OFKanban;
  setor: Setor | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [allDepositos, setAllDepositos] = useState<{ id: number; nome: string }[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(of.operador_atribuido_id);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((arr) => setAllDepositos(Array.isArray(arr) ? arr.filter((d) => d.id !== 1) : []))
      .catch(() => { /* ignore */ });
  }, []);

  // Sugestões — operadores do setor (em destaque) + todos os outros (lista completa)
  const sugeridos = useMemo(() => setor?.operadores.map((o) => o.deposito_id) ?? [], [setor]);

  async function salvar(opId: number | null) {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/pcp/${of.pcp_id}/atribuir-operador-rota`, {
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
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
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
