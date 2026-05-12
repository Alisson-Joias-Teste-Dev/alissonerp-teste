"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, X, Star, Layers, Check } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Template {
  id: number;
  nome: string;
  categoria: string | null;
  is_default: boolean;
  qtd_etapas: number;
}

/**
 * Modal pra aplicar manualmente um template de rota a um produto.
 * Reutilizado por CadastroProdutoModal e ProdutoDrawer.
 *
 * Quando produtoId é null (cadastro novo, ainda não salvou) → não chama
 * a API; só retorna o template escolhido via onSelecionar pra o pai
 * pré-popular as etapas localmente.
 */
export default function AplicarTemplateModal({
  produtoId,
  categoriaProduto,
  onClose,
  onSelecionar,
  onAplicado,
}: {
  produtoId: number | null;
  categoriaProduto: string | null;
  onClose: () => void;
  /** Chamado quando produto novo — pai aplica etapas no estado local. */
  onSelecionar?: (templateId: number, setorIds: number[]) => void;
  /** Chamado quando produto existente — após PATCH ok. */
  onAplicado?: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rotas-template")
      .then((r) => r.json() as Promise<Template[]>)
      .then((arr) => setTemplates(Array.isArray(arr) ? arr : []))
      .catch(() => setErro("Erro ao carregar templates"))
      .finally(() => setLoading(false));
  }, []);

  // Sugere primeiro o default da categoria do produto, depois templates da
  // mesma categoria, depois os demais.
  const ordenados = useMemo(() => {
    return [...templates].sort((a, b) => {
      const aMatch = categoriaProduto && a.categoria === categoriaProduto;
      const bMatch = categoriaProduto && b.categoria === categoriaProduto;
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      if (a.is_default !== b.is_default) return Number(b.is_default) - Number(a.is_default);
      return a.nome.localeCompare(b.nome);
    });
  }, [templates, categoriaProduto]);

  async function aplicar(t: Template) {
    setAplicando(true); setErro(null);
    try {
      // Buscar etapas do template
      const r = await fetch(`/api/rotas-template/${t.id}/etapas`);
      if (!r.ok) {
        setErro(`Erro ${r.status} ao carregar etapas`);
        return;
      }
      const etapas = await r.json() as { setor_id: number }[];
      const setorIds = etapas.map((e) => Number(e.setor_id));

      if (produtoId == null) {
        // Produto novo (ainda não salvou) → pai aplica localmente
        onSelecionar?.(t.id, setorIds);
        onClose();
        return;
      }

      // Produto existente → aplicar via API (sobrescreve)
      const r2 = await fetch(`/api/produtos/${produtoId}/aplicar-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.id }),
      });
      if (!r2.ok) {
        const b = await r2.json().catch(() => ({}));
        setErro((b as { error?: string }).error ?? `Erro ${r2.status}`);
        return;
      }
      onAplicado?.();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: C.esmeralda }}>
              Aplicar template de rota
            </h3>
            {categoriaProduto && (
              <p className="text-[11px]" style={{ color: "#6B7280" }}>
                Categoria do produto: <strong>{categoriaProduto}</strong>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "#9CA3AF" }}>
              <Loader2 size={13} className="animate-spin" /> Carregando…
            </div>
          ) : ordenados.length === 0 ? (
            <p className="text-center text-[12px] py-6" style={{ color: "#9CA3AF" }}>
              Nenhum template cadastrado.
              <br />
              Cadastre em <a href="/rotas-padrao" className="underline font-semibold">/rotas-padrao</a>.
            </p>
          ) : (
            <>
              {erro && <p className="text-[12px] text-red-600">⚠ {erro}</p>}
              {ordenados.map((t) => {
                const match = categoriaProduto && t.categoria === categoriaProduto;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => aplicar(t)}
                    disabled={aplicando}
                    className="w-full text-left px-3 py-2 rounded-lg border text-sm disabled:opacity-50 hover:bg-gray-50"
                    style={{
                      borderColor: match ? C.esmeralda : C.cremeBorder,
                      backgroundColor: match ? "#F0F7F4" : "#fff",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: "#111827" }}>{t.nome}</span>
                      {t.is_default && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
                          style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                        >
                          <Star size={9} fill="currentColor" /> DEFAULT
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: "#6B7280" }}>
                      <span>{t.categoria ?? "Sem categoria"}</span>
                      <span>·</span>
                      <span><Layers size={9} className="inline" /> {t.qtd_etapas} etapa(s)</span>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={onClose} className="px-3 py-1.5 rounded text-[13px] hover:bg-gray-100" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Mantém Check importado pra futuro uso (ex: badge "aplicado")
void Check;
