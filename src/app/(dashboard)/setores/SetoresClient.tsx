"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Pencil, Trash2, Check, X, Scale, Users, Camera } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Setor {
  id: number;
  nome: string;
  deposito_id: number | null;
  ativo: boolean;
  requer_peso: boolean;
}

interface Operador {
  deposito_id: number;
  deposito_nome: string;
}

export default function SetoresClient({ initialSetores }: { initialSetores: Setor[] }) {
  const router = useRouter();
  const [setores, setSetores] = useState<Setor[]>(initialSetores);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicaoNome, setEdicaoNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const res = await fetch("/api/setores");
    if (res.ok) {
      const data = await res.json() as Setor[];
      setSetores(data);
    }
    router.refresh();
  }, [router]);

  async function adicionar() {
    const nome = novoNome.trim();
    if (!nome) { setErro("Nome obrigatório"); return; }
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/setores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      setNovoNome("");
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao(id: number) {
    const nome = edicaoNome.trim();
    if (!nome) { setErro("Nome não pode ser vazio"); return; }
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/setores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      setEditandoId(null);
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(s: Setor) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/setores/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !s.ativo }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function remover(s: Setor) {
    if (!confirm(`Inativar setor "${s.nome}"?`)) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/setores/${s.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function toggleRequerPeso(s: Setor) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/setores/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requer_peso: !s.requer_peso }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  // Modal de gerenciar colaboradores
  const [gerenciandoColabsDe, setGerenciandoColabsDe] = useState<Setor | null>(null);

  const ativos = setores.filter((s) => s.ativo);
  const inativos = setores.filter((s) => !s.ativo);

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl">
      <h2
        className="text-xl md:text-2xl font-semibold mb-1"
        style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
      >
        Setores de Fabricação
      </h2>
      <p className="text-sm mb-6" style={{ color: "#6B7280" }}>
        Cadastre os setores que aparecem nas rotas de fabricação dos produtos.
      </p>

      {/* Adicionar novo */}
      <div
        className="mb-6 rounded-xl border p-4 flex gap-2 items-center"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        <input
          type="text"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
          placeholder="Ex: Laser, Desenho 3D, Fundição..."
          className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 bg-white"
          style={{ borderColor: C.cremeBorder, color: "#111827" }}
        />
        <button
          onClick={adicionar}
          disabled={salvando || !novoNome.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-40"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.5} />}
          Adicionar
        </button>
      </div>

      {erro && (
        <p className="mb-4 text-[13px] font-medium" style={{ color: "#DC2626" }}>
          ⚠ {erro}
        </p>
      )}

      {/* Lista ativos */}
      <h3 className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: "#6B7280" }}>
        Ativos ({ativos.length})
      </h3>
      <div className="rounded-xl border overflow-hidden mb-6" style={{ borderColor: C.cremeBorder }}>
        {ativos.length === 0 && (
          <p className="text-center py-4 text-[13px]" style={{ color: "#9CA3AF" }}>
            Nenhum setor cadastrado.
          </p>
        )}
        {ativos.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 px-4 py-2.5 border-b"
            style={{ borderColor: C.cremeBorder }}
          >
            {editandoId === s.id ? (
              <>
                <input
                  type="text"
                  value={edicaoNome}
                  onChange={(e) => setEdicaoNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salvarEdicao(s.id);
                    if (e.key === "Escape") setEditandoId(null);
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 rounded border text-sm outline-none"
                  style={{ borderColor: C.esmeralda }}
                />
                <button
                  onClick={() => salvarEdicao(s.id)}
                  disabled={salvando}
                  className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-40"
                  title="Salvar"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditandoId(null)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                  title="Cancelar"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm flex items-center gap-2" style={{ color: "#111827" }}>
                  {s.nome}
                  {!s.requer_peso && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: "#E0E7FF", color: "#3730A3" }}
                      title="Etapa pré-ouro — não exige pesagem (só foto)"
                    >
                      PRÉ-OURO
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "#9CA3AF" }}>#{s.id}</span>
                <button
                  onClick={() => toggleRequerPeso(s)}
                  disabled={salvando}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                  title={s.requer_peso ? "Setor exige pesagem · clique para marcar como pré-ouro" : "Setor pré-ouro (só foto) · clique para exigir peso"}
                  style={{ color: s.requer_peso ? "#92400E" : "#3730A3" }}
                >
                  {s.requer_peso ? <Scale size={14} /> : <Camera size={14} />}
                </button>
                <button
                  onClick={() => setGerenciandoColabsDe(s)}
                  disabled={salvando}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
                  title="Gerenciar colaboradores"
                >
                  <Users size={14} />
                </button>
                <button
                  onClick={() => { setEditandoId(s.id); setEdicaoNome(s.nome); }}
                  disabled={salvando}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
                  title="Editar nome"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remover(s)}
                  disabled={salvando}
                  className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-40"
                  title="Inativar"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {inativos.length > 0 && (
        <>
          <h3 className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>
            Inativos ({inativos.length})
          </h3>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder, opacity: 0.7 }}>
            {inativos.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-4 py-2.5 border-b"
                style={{ borderColor: C.cremeBorder }}
              >
                <span className="flex-1 text-sm line-through" style={{ color: "#9CA3AF" }}>
                  {s.nome}
                </span>
                <button
                  onClick={() => toggleAtivo(s)}
                  disabled={salvando}
                  className="text-[12px] font-semibold px-3 py-1 rounded hover:bg-emerald-50 text-emerald-700 disabled:opacity-40"
                >
                  Reativar
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {gerenciandoColabsDe && (
        <ModalColaboradores
          setor={gerenciandoColabsDe}
          onClose={() => setGerenciandoColabsDe(null)}
        />
      )}
    </div>
  );
}

// ─── Modal de gerenciar colaboradores do setor ───────────────────────────────
function ModalColaboradores({
  setor,
  onClose,
}: {
  setor: Setor;
  onClose: () => void;
}) {
  const [allDepositos, setAllDepositos] = useState<{ id: number; nome: string }[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/pcp/depositos").then((r) => r.json()),
      fetch(`/api/setores/${setor.id}/operadores`).then((r) => r.json()),
    ]).then(([deps, ops]) => {
      const depAtivos = (Array.isArray(deps) ? deps : []).filter((d) => d.id !== 1);
      setAllDepositos(depAtivos);
      const ids = new Set<number>((ops?.operadores ?? []).map((o: Operador) => o.deposito_id));
      setSelecionados(ids);
    }).catch(() => setErro("Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [setor.id]);

  function toggle(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/setores/${setor.id}/operadores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposito_ids: Array.from(selecionados) }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${r.status}`);
        return;
      }
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
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
          <h3 className="text-base font-semibold" style={{ color: C.esmeralda }}>
            Colaboradores · {setor.nome}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "#9CA3AF" }}>
              <Loader2 size={13} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <p className="text-[11px] mb-2" style={{ color: "#6B7280" }}>
                Marque os colaboradores responsáveis por esse setor. Quando uma OF cair aqui, qualquer um da lista poderá atender.
              </p>
              {allDepositos.map((d) => {
                const ativo = selecionados.has(d.id);
                return (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:bg-gray-50"
                    style={{ borderColor: ativo ? C.esmeralda : C.cremeBorder, backgroundColor: ativo ? "#F0F7F4" : "#fff" }}
                  >
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={() => toggle(d.id)}
                      className="w-4 h-4 accent-[#184036]"
                    />
                    <span className="text-sm" style={{ color: "#111827" }}>{d.nome}</span>
                  </label>
                );
              })}
              {erro && <p className="text-[12px] text-red-600 mt-2">⚠ {erro}</p>}
            </>
          )}
        </div>

        <div className="flex justify-between items-center px-5 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
          <span className="text-[11px]" style={{ color: "#6B7280" }}>
            {selecionados.size} selecionado(s)
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-[12px] hover:bg-gray-100" style={{ color: "#6B7280" }}>
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={loading || salvando}
              className="px-4 py-1.5 rounded text-[12px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {salvando ? <Loader2 size={12} className="animate-spin inline" /> : null} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
