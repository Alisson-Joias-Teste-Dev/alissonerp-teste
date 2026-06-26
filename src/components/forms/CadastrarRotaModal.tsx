"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, GripVertical, Plus, Trash2 } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface Setor {
  id: number;
  nome: string;
}

interface EtapaAtual {
  ordem: number;
  setor_id: number;
  setor_nome: string;
}

interface Props {
  isOpen: boolean;
  produtoId: number;
  produtoNome?: string | null;
  pcpId: number;          // PCP que vai ser movido pro primeiro setor após salvar
  setoresDisponiveis: Setor[];
  onClose: () => void;
  onSuccess?: () => void;
}

// Modal pra DEFINIR A ROTA de um produto (sequência ordenada de setores).
// Usado quando uma OF chega em "Novas Ordens" e o produto ainda não tem rota.
// Ao salvar:
//   1. PUT /api/produtos/[id]/rota → grava a sequência
//   2. PATCH /api/pcp/[id]/mover-rota → move o card pro primeiro setor da rota
export default function CadastrarRotaModal({
  isOpen, produtoId, produtoNome, pcpId, setoresDisponiveis, onClose, onSuccess,
}: Props) {
  // Sequência atual da rota (ordenada). Começa vazia.
  const [sequencia, setSequencia] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(false);
  const [carregandoRota, setCarregandoRota] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Carrega rota existente do produto (se já tiver) ao abrir
  useEffect(() => {
    if (!isOpen) return;
    setSequencia([]);
    setError("");
    setSuccess(false);
    setCarregandoRota(true);
    fetch(`/api/produtos/${produtoId}/rota`)
      .then((r) => r.ok ? r.json() : { etapas: [] })
      .then((d: { etapas?: EtapaAtual[] }) => {
        const etapas = Array.isArray(d.etapas) ? d.etapas : [];
        // Map setor_id → setor completo
        const mapa = new Map(setoresDisponiveis.map((s) => [s.id, s]));
        const seq = etapas
          .sort((a, b) => a.ordem - b.ordem)
          .map((e) => mapa.get(e.setor_id))
          .filter((s): s is Setor => s != null);
        setSequencia(seq);
      })
      .catch(() => setSequencia([]))
      .finally(() => setCarregandoRota(false));
  }, [isOpen, produtoId, setoresDisponiveis]);

  // Setores que ainda podem ser adicionados (não estão na sequência)
  const setorIdsUsados = new Set(sequencia.map((s) => s.id));
  const setoresDisponiveis_ = setoresDisponiveis.filter((s) => !setorIdsUsados.has(s.id));

  function adicionarSetor(s: Setor) {
    setSequencia((prev) => [...prev, s]);
  }
  function removerSetor(idx: number) {
    setSequencia((prev) => prev.filter((_, i) => i !== idx));
  }
  function moverSetor(idx: number, direcao: -1 | 1) {
    setSequencia((prev) => {
      const next = [...prev];
      const target = idx + direcao;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handleSubmit() {
    setError("");
    if (sequencia.length === 0) { setError("Adicione pelo menos um setor"); return; }
    setLoading(true);
    try {
      // 1. Salva a rota do produto
      const resRota = await fetch(`/api/produtos/${produtoId}/rota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etapas: sequencia.map((s) => ({ setor_id: s.id })),
        }),
      });
      if (!resRota.ok) {
        const b = await resRota.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? `Erro ${resRota.status}`);
        setLoading(false);
        return;
      }

      // 2. Move o PCP pro primeiro setor da nova rota
      const primeiroSetor = sequencia[0];
      const resMover = await fetch(`/api/pcp/${pcpId}/mover-rota`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor_id: primeiroSetor.id }),
      });
      if (!resMover.ok) {
        const b = await resMover.json().catch(() => ({}));
        // Mostra erro mas considera rota salva — usuário pode mover manualmente
        setError(`Rota salva, mas erro ao mover: ${(b as { error?: string }).error ?? resMover.status}`);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-2xl md:mx-4 md:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Definir Rota de Fabricação
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {produtoNome ? produtoNome : `Produto #${produtoId}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 flex-1">
          {carregandoRota ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin" style={{ color: "#9CA3AF" }} />
            </div>
          ) : (
            <>
              {/* Sequência ordenada */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Sequência ({sequencia.length})
                </label>
                {sequencia.length === 0 ? (
                  <div
                    className="rounded-lg border-2 border-dashed px-4 py-6 text-center text-[13px]"
                    style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}
                  >
                    Adicione setores abaixo pra definir a rota
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sequencia.map((s, idx) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}
                        >
                          {idx + 1}
                        </span>
                        <GripVertical size={14} style={{ color: "#D1D5DB" }} />
                        <p className="flex-1 text-sm font-medium" style={{ color: C.esmeralda }}>{s.nome}</p>
                        <button
                          onClick={() => moverSetor(idx, -1)}
                          disabled={idx === 0}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-30"
                          title="Mover pra cima"
                        >↑</button>
                        <button
                          onClick={() => moverSetor(idx, 1)}
                          disabled={idx === sequencia.length - 1}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 disabled:opacity-30"
                          title="Mover pra baixo"
                        >↓</button>
                        <button
                          onClick={() => removerSetor(idx)}
                          className="w-7 h-7 flex items-center justify-center rounded text-red-500 hover:bg-red-50"
                          title="Remover"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Disponíveis */}
              {setoresDisponiveis_.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Setores disponíveis
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {setoresDisponiveis_.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => adicionarSetor(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-semibold hover:bg-emerald-50"
                        style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                      >
                        <Plus size={12} />
                        {s.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {setoresDisponiveis.length === 0 && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Nenhum setor cadastrado. Crie setores no kanban antes de definir uma rota.
                </p>
              )}
            </>
          )}

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle size={14} className="shrink-0" />
              Rota salva! Card movido pro {sequencia[0]?.nome}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-end gap-3" style={{ borderColor: C.cremeBorder }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success || sequencia.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" />Salvando…</> : "Salvar rota"}
          </button>
        </div>
      </div>
    </div>
  );
}
