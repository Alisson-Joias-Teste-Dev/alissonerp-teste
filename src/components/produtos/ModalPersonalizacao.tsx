"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Tag,
  Calculator,
  Plus,
  Scale,
} from "lucide-react";

// ─── Paleta ERP ────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  dourado:     "#D4A843",
};

const CARACTERES_OPCOES = [
  {
    valor: "alfa",
    label: "Só letras A-Z",
    exemplo: "JOAO",
    hint: "Sem acentos, sem espaços, sem números",
  },
  {
    valor: "alfa_acento",
    label: "Letras A-Z + acentos",
    exemplo: "JOÃO",
    hint: "Acentos permitidos, sem espaço",
  },
  {
    valor: "alfa_acento_espaco",
    label: "Letras A-Z + acentos + espaços",
    exemplo: "MARIA GRAÇA",
    hint: "Recomendado para nomes completos",
  },
] as const;

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface ProdutoPersonalizavel {
  id_produto:      number;
  sku:             string | null;
  nome:            string | null;
  categoria:       string | null;
  qtd_estoque:     number;
  max_caracteres:  number;
  min_caracteres:  number;
  tipo:            string;
  obrigatorio:     boolean;
  preco_por_letra: number | null;
  peso_por_letra:  number | null;
  label:           string;
}

interface ConfigCompleta {
  produto_id:             number;
  tipo:                   string;
  obrigatorio:            boolean;
  min_caracteres:         number;
  max_caracteres:         number;
  caracteres_permitidos:  string;
  label:                  string;
  placeholder:            string | null;
  exemplo:                string | null;
  observacao:             string | null;
  ativo:                  boolean;
  preco_por_letra:        number | null;
  peso_por_letra:         number | null;
}

type Toast = {
  id: number;
  tipo: "sucesso" | "erro";
  mensagem: string;
};

// ─── Utilidades ────────────────────────────────────────────────────────────
function parsePrecoBR(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const normalizado = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : (/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : null;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function ModalPersonalizacao({
  onClose,
}: {
  onClose: () => void;
}) {
  // ── Estado da lista ──
  const [lista, setLista]           = useState<ProdutoPersonalizavel[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);

  // ── Estado do formulario ──
  const [modoEdicao, setModoEdicao] = useState(false);
  const [produtoEdicao, setProdutoEdicao] = useState<{ id: number; sku: string | null } | null>(null);

  const [proximoSku, setProximoSku] = useState<string | null>(null);

  const [descricao, setDescricao] = useState("");
  const [label, setLabel] = useState("Nome a gravar");
  const [minCar, setMinCar] = useState<string>("1");
  const [maxCar, setMaxCar] = useState<string>("20");
  const [caracteres, setCaracteres] = useState<string>("alfa_acento_espaco");
  const [precoLetraStr, setPrecoLetraStr] = useState<string>("");
  const [pesoLetraStr, setPesoLetraStr]   = useState<string>("");
  const [exemplo, setExemplo] = useState("");
  const [obrigatorio, setObrigatorio] = useState(true);
  const [ativo, setAtivo] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((tipo: "sucesso" | "erro", mensagem: string) => {
    const id = ++toastIdRef.current;
    setToasts((arr) => [...arr, { id, tipo, mensagem }]);
    setTimeout(() => setToasts((arr) => arr.filter((t) => t.id !== id)), tipo === "erro" ? 6000 : 3000);
  }, []);

  // ── Carregar lista ──
  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const res = await fetch("/api/produtos/personalizaveis");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ProdutoPersonalizavel[];
      setLista(data);
    } catch {
      addToast("erro", "Falha ao carregar lista");
    } finally {
      setCarregandoLista(false);
    }
  }, [addToast]);

  // ── Carregar preview do proximo SKU ──
  const carregarProximoSku = useCallback(async () => {
    try {
      const res = await fetch("/api/produtos/personalizados/proximo-sku");
      if (!res.ok) return;
      const data = (await res.json()) as { sku: string };
      setProximoSku(data.sku);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    carregarLista();
    carregarProximoSku();
  }, [carregarLista, carregarProximoSku]);

  // ── Resetar form ──
  function resetForm() {
    setModoEdicao(false);
    setProdutoEdicao(null);
    setDescricao("");
    setLabel("Nome a gravar");
    setMinCar("1");
    setMaxCar("20");
    setCaracteres("alfa_acento_espaco");
    setPrecoLetraStr("");
    setPesoLetraStr("");
    setExemplo("");
    setObrigatorio(true);
    setAtivo(true);
  }

  // ── Editar linha da lista ──
  async function editarLinha(item: ProdutoPersonalizavel) {
    setModoEdicao(true);
    setProdutoEdicao({ id: item.id_produto, sku: item.sku });
    setDescricao(item.nome ?? "");
    try {
      const res = await fetch(`/api/produtos/${item.id_produto}/personalizacao`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { config: ConfigCompleta | null };
      if (data.config) {
        setLabel(data.config.label);
        setMinCar(String(data.config.min_caracteres));
        setMaxCar(String(data.config.max_caracteres));
        setCaracteres(data.config.caracteres_permitidos);
        setPrecoLetraStr(
          data.config.preco_por_letra != null
            ? data.config.preco_por_letra.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
            : "",
        );
        setPesoLetraStr(
          data.config.peso_por_letra != null
            ? data.config.peso_por_letra.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
            : "",
        );
        setExemplo(data.config.exemplo ?? "");
        setObrigatorio(data.config.obrigatorio);
        setAtivo(data.config.ativo);
      }
    } catch {
      addToast("erro", "Falha ao carregar config");
    }
  }

  // ── Remover (soft delete) ──
  async function remover(item: ProdutoPersonalizavel) {
    if (!confirm(`Remover personalização de "${item.sku ?? item.nome}"?`)) return;
    setRemovendoId(item.id_produto);
    try {
      const res = await fetch(`/api/produtos/${item.id_produto}/personalizacao`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        addToast("erro", (body as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      addToast("sucesso", "Personalização removida");
      await carregarLista();
    } catch {
      addToast("erro", "Falha ao remover");
    } finally {
      setRemovendoId(null);
    }
  }

  // ── Preview do calculo ──
  const precoLetraNum = useMemo(() => parsePrecoBR(precoLetraStr) ?? 0, [precoLetraStr]);
  const pesoLetraNum  = useMemo(() => parsePrecoBR(pesoLetraStr)  ?? 0, [pesoLetraStr]);
  const exemploCalculo = useMemo(() => {
    const base = exemplo.trim() || "JOAO";
    return {
      texto: base,
      letras: base.length,
      total: base.length * precoLetraNum,
      pesoTotal: base.length * pesoLetraNum,
    };
  }, [exemplo, precoLetraNum, pesoLetraNum]);

  // ── Salvar ──
  async function salvar() {
    const descTrim = descricao.trim();
    if (!modoEdicao && !descTrim) {
      addToast("erro", "Descrição do produto é obrigatória");
      return;
    }
    const min = parseInt(minCar, 10);
    const max = parseInt(maxCar, 10);
    if (!Number.isInteger(min) || min < 0) {
      addToast("erro", "Mínimo de caracteres inválido");
      return;
    }
    if (!Number.isInteger(max) || max < min) {
      addToast("erro", "Máximo precisa ser ≥ Mínimo");
      return;
    }
    const precoParsed = parsePrecoBR(precoLetraStr);
    if (!modoEdicao && (precoParsed == null || precoParsed < 0)) {
      addToast("erro", "Preço por letra é obrigatório");
      return;
    }
    if (precoLetraStr.trim() && (precoParsed == null || precoParsed < 0)) {
      addToast("erro", "Preço por letra inválido");
      return;
    }
    const pesoParsed = parsePrecoBR(pesoLetraStr);
    if (pesoLetraStr.trim() && (pesoParsed == null || pesoParsed < 0)) {
      addToast("erro", "Peso por letra inválido");
      return;
    }

    setSalvando(true);
    try {
      if (modoEdicao && produtoEdicao) {
        // Modo EDICAO → POST /api/produtos/[id]/personalizacao (upsert)
        const res = await fetch(`/api/produtos/${produtoEdicao.id}/personalizacao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo:                  "nome",
            obrigatorio,
            min_caracteres:        min,
            max_caracteres:        max,
            caracteres_permitidos: caracteres,
            label:                 label.trim() || "Nome a gravar",
            placeholder:           `Ex: ${exemplo.trim() || "JOAO"}`,
            exemplo:               exemplo.trim() || null,
            preco_por_letra:       precoParsed,
            peso_por_letra:        pesoParsed,
            ativo,
            descricao_produto:     descTrim || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast("erro", (body as { error?: string }).error ?? `Erro ${res.status}`);
          return;
        }
        addToast("sucesso", "Personalização salva");
        resetForm();
        await Promise.all([carregarLista(), carregarProximoSku()]);
      } else {
        // Modo NOVO → POST /api/produtos/personalizados (cria produto + config)
        const res = await fetch("/api/produtos/personalizados", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            descricao:             descTrim,
            preco_por_letra:       precoParsed,
            peso_por_letra:        pesoParsed,
            max_caracteres:        max,
            min_caracteres:        min,
            caracteres_permitidos: caracteres,
            label:                 label.trim() || "Nome a gravar",
            exemplo:               exemplo.trim() || null,
            obrigatorio,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast("erro", (body as { error?: string }).error ?? `Erro ${res.status}`);
          return;
        }
        const criado = body as { sku: string; nome: string };
        addToast("sucesso", `Produto criado: ${criado.sku} — ${criado.nome}`);
        resetForm();
        await Promise.all([carregarLista(), carregarProximoSku()]);
      }
    } catch (e) {
      addToast("erro", e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  const canSalvar = modoEdicao
    ? !salvando
    : !salvando && descricao.trim().length > 0 && (parsePrecoBR(precoLetraStr) ?? -1) >= 0;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ borderColor: C.cremeBorder, borderWidth: 1 }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: C.dourado, color: "#fff" }}
            >
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2
                className="text-lg font-bold"
                style={{ color: C.esmeralda, fontFamily: "var(--font-serif), serif" }}
              >
                Produtos Personalizados
              </h2>
              <p className="text-xs text-gray-500">
                Cadastre produto novo com regra de personalização (nome gravado com preço por letra)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteudo scrollavel */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* SECAO 1: Lista existente */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: C.esmeralda }}>
                Produtos personalizados cadastrados
              </h3>
              {carregandoLista && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: C.cremeBorder }}
            >
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.cremeBg }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Nome</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Max letras</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Preço/letra</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Peso/letra</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {!carregandoLista && lista.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-400">
                        Nenhum produto personalizado cadastrado. Crie um no formulário abaixo.
                      </td>
                    </tr>
                  )}
                  {lista.map((item) => (
                    <tr
                      key={item.id_produto}
                      className="border-t hover:bg-stone-50"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      <td className="px-3 py-2 font-mono text-xs font-semibold" style={{ color: C.esmeralda }}>
                        {item.sku ?? "—"}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[260px]" title={item.nome ?? undefined}>
                        {item.nome ?? "(sem nome)"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{item.max_caracteres}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {item.preco_por_letra != null ? formatBRL(item.preco_por_letra) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {item.peso_por_letra != null ? `${item.peso_por_letra.toFixed(2)} g` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => editarLinha(item)}
                            disabled={salvando || removendoId !== null}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => remover(item)}
                            disabled={salvando || removendoId !== null}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-40"
                            title="Remover"
                          >
                            {removendoId === item.id_produto ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECAO 2: Formulario */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: C.esmeralda }}>
                {modoEdicao ? (
                  <>
                    <Pencil className="w-4 h-4" />
                    Editando produto personalizado
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Novo produto personalizado
                  </>
                )}
              </h3>
              {(modoEdicao || descricao) && (
                <button
                  onClick={resetForm}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Limpar
                </button>
              )}
            </div>

            <div
              className="rounded-xl border p-4 space-y-4"
              style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
            >
              {/* Preview do SKU (modo novo) ou chip do produto (modo edição) */}
              {modoEdicao && produtoEdicao ? (
                <div
                  className="rounded-lg p-3 flex items-center gap-3 border"
                  style={{ backgroundColor: "#F0F7F4", borderColor: "#A7D7B8" }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white"
                    style={{ backgroundColor: C.esmeralda }}
                  >
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Editando produto</p>
                    <p className="font-mono text-lg font-bold" style={{ color: C.esmeralda }}>
                      {produtoEdicao.sku ?? "—"}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400">ID #{produtoEdicao.id}</span>
                </div>
              ) : (
                <div
                  className="rounded-lg p-3 flex items-center gap-3 border"
                  style={{ backgroundColor: "#FFFBF0", borderColor: C.dourado }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white"
                    style={{ backgroundColor: C.dourado }}
                  >
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">SKU automático</p>
                    <p className="font-mono text-lg font-bold" style={{ color: C.esmeralda }}>
                      {proximoSku ?? "PZ0001"}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400">Gerado ao salvar</span>
                </div>
              )}

              {/* Descricao do produto */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: C.esmeralda }}>
                  Descrição do produto {!modoEdicao && "*"}
                </label>
                <input
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={500}
                  placeholder={modoEdicao
                    ? "Nome do produto no catálogo"
                    : "Ex: Colar Personalizado Coração com Diamante"}
                  className="w-full px-3 py-2 rounded-lg bg-white border text-sm outline-none focus:ring-2"
                  style={{ borderColor: C.cremeBorder }}
                  autoFocus={!modoEdicao}
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  {modoEdicao
                    ? "Atualiza o nome do produto no catálogo quando salvar."
                    : "Será o nome do produto no catálogo. Você pode editar depois em /produtos."}
                </p>
              </div>

              {/* Label */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: C.esmeralda }}>
                  Label do campo no wizard de venda
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                  placeholder="Nome a gravar"
                  className="w-full px-3 py-2 rounded-lg bg-white border text-sm outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Texto mostrado acima do input quando o vendedor adicionar esse produto
                </p>
              </div>

              {/* Min / Max */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: C.esmeralda }}>
                    Mínimo de letras
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={minCar}
                    onChange={(e) => setMinCar(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border text-sm outline-none tabular-nums"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: C.esmeralda }}>
                    Máximo de letras *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxCar}
                    onChange={(e) => setMaxCar(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border text-sm outline-none tabular-nums"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
              </div>

              {/* Caracteres permitidos */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide mb-2 block" style={{ color: C.esmeralda }}>
                  Caracteres permitidos
                </label>
                <div className="space-y-2">
                  {CARACTERES_OPCOES.map((opt) => (
                    <label
                      key={opt.valor}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white cursor-pointer border transition-colors"
                      style={{
                        borderColor: caracteres === opt.valor ? C.esmeralda : C.cremeBorder,
                        backgroundColor: caracteres === opt.valor ? "#F0F7F4" : "#fff",
                      }}
                    >
                      <input
                        type="radio"
                        name="caracteres"
                        value={opt.valor}
                        checked={caracteres === opt.valor}
                        onChange={(e) => setCaracteres(e.target.value)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: C.esmeralda }}>
                            {opt.label}
                          </span>
                          <span
                            className="text-xs font-mono px-2 py-0.5 rounded"
                            style={{ backgroundColor: C.creme, color: C.esmeralda }}
                          >
                            {opt.exemplo}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{opt.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preço por letra (DESTAQUE) */}
              <div
                className="rounded-lg p-3 border-2"
                style={{ borderColor: C.dourado, backgroundColor: "#FFFBF0" }}
              >
                <label className="text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-2" style={{ color: C.esmeralda }}>
                  <Calculator className="w-3.5 h-3.5" style={{ color: C.dourado }} />
                  Preço por letra (R$) {!modoEdicao && "*"}
                </label>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-2 rounded-lg bg-white border text-sm font-mono" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={precoLetraStr}
                    onChange={(e) => setPrecoLetraStr(e.target.value)}
                    placeholder="1.000,00"
                    className="flex-1 px-3 py-2 rounded-lg bg-white border text-sm font-mono tabular-nums outline-none focus:ring-2"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  O preço da venda será calculado automaticamente: <strong>nº letras × valor</strong>.
                </p>

                {precoLetraNum > 0 && (
                  <div className="mt-3 p-2 rounded bg-white border text-xs flex items-center gap-2" style={{ borderColor: C.cremeBorder }}>
                    <span className="text-gray-500">Preview:</span>
                    <span className="font-mono uppercase" style={{ color: C.esmeralda }}>
                      &quot;{exemploCalculo.texto}&quot;
                    </span>
                    <span className="text-gray-500">({exemploCalculo.letras} letras)</span>
                    <span className="text-gray-400">=</span>
                    <span className="font-bold tabular-nums" style={{ color: C.esmeralda }}>
                      {formatBRL(exemploCalculo.total)}
                    </span>
                  </div>
                )}
              </div>

              {/* Peso por letra (DESTAQUE verde) */}
              <div
                className="rounded-lg p-3 border-2"
                style={{ borderColor: "#A7D7B8", backgroundColor: "#F0F7F4" }}
              >
                <label className="text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-2" style={{ color: C.esmeralda }}>
                  <Scale className="w-3.5 h-3.5" style={{ color: "#059669" }} />
                  Peso por letra (g)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pesoLetraStr}
                    onChange={(e) => setPesoLetraStr(e.target.value)}
                    placeholder="0,50"
                    className="flex-1 px-3 py-2 rounded-lg bg-white border text-sm font-mono tabular-nums outline-none focus:ring-2"
                    style={{ borderColor: C.cremeBorder }}
                  />
                  <span className="px-2 py-2 rounded-lg bg-white border text-sm font-mono" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                    g
                  </span>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  Se preenchido, o peso estimado da joia sera calculado: <strong>nº letras × valor</strong>.
                  Deixe em branco para usar o peso padrao do produto.
                </p>

                {pesoLetraNum > 0 && (
                  <div className="mt-3 p-2 rounded bg-white border text-xs flex items-center gap-2" style={{ borderColor: C.cremeBorder }}>
                    <span className="text-gray-500">Preview:</span>
                    <span className="font-mono uppercase" style={{ color: C.esmeralda }}>
                      &quot;{exemploCalculo.texto}&quot;
                    </span>
                    <span className="text-gray-500">({exemploCalculo.letras} letras)</span>
                    <span className="text-gray-400">=</span>
                    <span className="font-bold tabular-nums" style={{ color: "#065F46" }}>
                      {exemploCalculo.pesoTotal.toFixed(2)} g
                    </span>
                  </div>
                )}
              </div>

              {/* Exemplo */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: C.esmeralda }}>
                  Exemplo (opcional)
                </label>
                <input
                  type="text"
                  value={exemplo}
                  onChange={(e) => setExemplo(e.target.value)}
                  maxLength={100}
                  placeholder="MARIA"
                  className="w-full px-3 py-2 rounded-lg bg-white border text-sm outline-none font-mono uppercase"
                  style={{ borderColor: C.cremeBorder }}
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Dica mostrada abaixo do campo no wizard (&quot;Exemplo: MARIA&quot;)
                </p>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-4 pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={obrigatorio}
                    onChange={(e) => setObrigatorio(e.target.checked)}
                  />
                  <span className="text-sm" style={{ color: C.esmeralda }}>
                    Obrigatório
                  </span>
                  <span className="text-[10px] text-gray-500">(bloqueia venda se vazio)</span>
                </label>
                {modoEdicao && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={(e) => setAtivo(e.target.checked)}
                    />
                    <span className="text-sm" style={{ color: C.esmeralda }}>
                      Ativo
                    </span>
                    <span className="text-[10px] text-gray-500">(desmarcar = desativa)</span>
                  </label>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-gray-50"
            style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
          >
            Fechar
          </button>
          <button
            onClick={salvar}
            disabled={!canSalvar}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-2"
            style={{ backgroundColor: C.esmeralda }}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {modoEdicao ? "Salvar alterações" : "Criar produto personalizado"}
          </button>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-lg shadow-lg p-3 flex items-start gap-2"
            style={{
              backgroundColor: t.tipo === "sucesso" ? "#ecfdf5" : "#fef2f2",
              borderLeft: `4px solid ${t.tipo === "sucesso" ? "#10b981" : "#ef4444"}`,
            }}
          >
            {t.tipo === "sucesso" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <p className="text-sm text-gray-900 flex-1 break-words">{t.mensagem}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
