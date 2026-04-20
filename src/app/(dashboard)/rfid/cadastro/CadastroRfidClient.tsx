"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Tag,
  Search,
  Printer,
  PrinterCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCw,
  Trash2,
  Info,
  Keyboard,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { hasRole, isFullAccess } from "@/lib/roles";
import {
  listarImpressoras,
  impressoraPadrao,
  enviarZpl,
  BrowserPrintNaoInstaladoError,
  type ZebraDevice,
} from "@/lib/zebra-browser-print";

// ─── Paleta ERP ────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaH:  "#1f5246",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  dourado:     "#D4A843",
};

const ROLES_CADASTRAR_RFID = [
  "admin",
  "desenvolvedor",
  "gerente_fabrica",
  "estoquista_fabrica",
] as const;

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface ProdutoBuscaItem {
  id_produto: number;
  sku:         string | null;
  nome:        string | null;
  categoria:   string | null;
  qtd_estoque: number;
  imagem:      string | null;
}

interface ProdutoPreview {
  id_produto: number;
  sku: string | null;
  nome: string | null;
  categoria: string | null;
  peso_real: number | null;
  peso_precificado: number | null;
  preco_tiny: number | null;
  imagem: string | null;
  tem_sku_e_nome: boolean;
  qtd_estoque?: number;
}

interface CategoriaBase {
  base:  string;
  total: number;
}

interface JoiaSessao {
  epc: string;
  sku: string;
  nome: string;
  created_at: string;
}

type Toast = {
  id:      number;
  tipo:    "sucesso" | "erro" | "info";
  titulo:  string;
  mensagem?: string;
};

type ImpressoraStatus =
  | { estado: "buscando" }
  | { estado: "ok"; device: ZebraDevice }
  | { estado: "ausente" }
  | { estado: "erro"; mensagem: string };

// ─── Utilidades ────────────────────────────────────────────────────────────
function formatHora(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", { hour12: false });
  } catch {
    return "--:--:--";
  }
}

function formatBRL(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", {
    style:    "currency",
    currency: "BRL",
  });
}

function formatPeso(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)} g`;
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function CadastroRfidClient() {
  const router = useRouter();
  const { role, loading: authLoading, user } = useAuth();

  // Auth guard
  const autorizado = useMemo(() => {
    if (!role) return false;
    if (isFullAccess(role)) return true;
    return hasRole(role, ROLES_CADASTRAR_RFID);
  }, [role]);

  // ─── Estado: Browser Print ──────────────────────────────────────────────
  const [impressora, setImpressora] = useState<ImpressoraStatus>({
    estado: "buscando",
  });

  const verificarImpressora = useCallback(async () => {
    setImpressora({ estado: "buscando" });
    try {
      const padrao = await impressoraPadrao();
      if (padrao) {
        setImpressora({ estado: "ok", device: padrao });
        return;
      }
      const disp = await listarImpressoras();
      if (disp.length === 0) {
        setImpressora({
          estado: "erro",
          mensagem:
            "Browser Print rodando, mas nenhuma impressora Zebra encontrada. Verifique se a ZD621R está ligada e conectada por USB.",
        });
        return;
      }
      setImpressora({ estado: "ok", device: disp[0] });
    } catch (e) {
      if (e instanceof BrowserPrintNaoInstaladoError) {
        setImpressora({ estado: "ausente" });
      } else {
        setImpressora({
          estado: "erro",
          mensagem: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!autorizado) return;
    verificarImpressora();
  }, [autorizado, verificarImpressora]);

  // ─── Estado: categorias (chips) ─────────────────────────────────────────
  const [categorias, setCategorias]           = useState<CategoriaBase[]>([]);
  const [totalGeral, setTotalGeral]           = useState<number>(0);
  const [categoriaBase, setCategoriaBase]     = useState<string | null>(null);
  const [erroCategorias, setErroCategorias]   = useState<string | null>(null);

  const carregarCategorias = useCallback(async () => {
    try {
      setErroCategorias(null);
      const res = await fetch("/api/rfid/categorias-disponiveis");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        total_geral: number;
        categorias: CategoriaBase[];
      };
      setTotalGeral(data.total_geral ?? 0);
      setCategorias(data.categorias ?? []);
    } catch (e) {
      setErroCategorias(
        e instanceof Error ? e.message : "Falha ao carregar categorias",
      );
    }
  }, []);

  useEffect(() => {
    if (!autorizado) return;
    carregarCategorias();
  }, [autorizado, carregarCategorias]);

  // ─── Estado: busca de produto ───────────────────────────────────────────
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoBuscaItem[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Busca produtos (cumulativo: categoria + q). Debounce 250ms para q,
  // imediato quando muda a categoria (inclusive p/ null).
  useEffect(() => {
    const q = busca.trim();
    const temCategoria = categoriaBase !== null;
    const temQValido   = q.length >= 2;

    // Sem filtro nenhum: nada a buscar
    if (!temCategoria && !temQValido) {
      setResultados([]);
      setDropdownAberto(false);
      return;
    }

    setBuscando(true);

    // Se o trigger foi mudança de categoria (q curto/vazio), buscamos imediato.
    // Caso contrário (só q mudando), debounce.
    const delay = temQValido ? 250 : 0;

    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (temCategoria) params.set("categoria_base", categoriaBase!);
        if (temQValido)   params.set("q", q);
        params.set("limit", "20");

        const res = await fetch(
          `/api/rfid/produtos-disponiveis?${params.toString()}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ProdutoBuscaItem[];
        setResultados(data);
        setIndiceAtivo(0);
        setDropdownAberto(true);
      } catch {
        setResultados([]);
        setDropdownAberto(false);
      } finally {
        setBuscando(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [busca, categoriaBase]);

  // ─── Estado: produto selecionado ────────────────────────────────────────
  const [produto, setProduto] = useState<ProdutoPreview | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  const selecionarProduto = useCallback(async (item: ProdutoBuscaItem) => {
    setDropdownAberto(false);
    setCarregandoPreview(true);
    try {
      const res = await fetch(`/api/rfid/produto-preview?id=${item.id_produto}`);
      if (!res.ok) {
        setProduto(null);
        return;
      }
      const data = (await res.json()) as ProdutoPreview;
      // Mescla qtd_estoque do item da lista (produto-preview nao retorna esse campo)
      setProduto({ ...data, qtd_estoque: item.qtd_estoque });
      setBusca(data.sku ?? data.nome ?? String(item.id_produto));
    } finally {
      setCarregandoPreview(false);
    }
  }, []);

  const limparSelecao = useCallback(() => {
    setProduto(null);
    setBusca("");
    setResultados([]);
    setDropdownAberto(false);
    buscaRef.current?.focus();
  }, []);

  // ─── Estado: sessão (lista lateral) ─────────────────────────────────────
  const [sessao, setSessao] = useState<JoiaSessao[]>([]);
  const [limparVisual, setLimparVisual] = useState<Set<string>>(new Set());

  const carregarSessao = useCallback(async () => {
    try {
      const res = await fetch("/api/rfid/sessao");
      if (!res.ok) return;
      const data = (await res.json()) as { joias?: JoiaSessao[] };
      setSessao(data.joias ?? []);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    if (!autorizado) return;
    carregarSessao();
  }, [autorizado, carregarSessao]);

  const sessaoVisivel = useMemo(
    () => sessao.filter((j) => !limparVisual.has(j.epc)),
    [sessao, limparVisual],
  );

  // ─── Toasts ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastIdRef.current;
    setToasts((arr) => [...arr, { ...t, id }]);
    const timeout = t.tipo === "erro" ? 6000 : 3000;
    setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== id));
    }, timeout);
  }, []);

  // ─── Impressão ──────────────────────────────────────────────────────────
  const [imprimindo, setImprimindo] = useState(false);

  const podeImprimir =
    !!produto &&
    produto.tem_sku_e_nome &&
    impressora.estado === "ok" &&
    !imprimindo;

  const imprimir = useCallback(async () => {
    if (!produto || !produto.tem_sku_e_nome) return;
    if (impressora.estado !== "ok") {
      addToast({
        tipo: "erro",
        titulo: "Impressora não conectada",
        mensagem: "Verifique o Zebra Browser Print.",
      });
      return;
    }

    setImprimindo(true);
    let epcGerado: string | null = null;
    try {
      // 1. Cadastra (pendente_impressao) + pega ZPL
      const resCad = await fetch("/api/rfid/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto_id: Number(produto.id_produto) }),
      });
      const bodyCad = await resCad.json().catch(() => ({}));
      if (!resCad.ok) {
        const mensagem =
          (bodyCad as { error?: string }).error ??
          `Erro ${resCad.status} ao cadastrar`;
        if (resCad.status === 403) {
          addToast({ tipo: "erro", titulo: "Sem permissão", mensagem });
        } else if (resCad.status === 422) {
          addToast({
            tipo: "erro",
            titulo: "Produto incompleto",
            mensagem,
          });
        } else if (resCad.status === 404) {
          addToast({ tipo: "erro", titulo: "Produto não encontrado", mensagem });
        } else {
          addToast({ tipo: "erro", titulo: "Falha no cadastro", mensagem });
        }
        setImprimindo(false);
        return;
      }
      const { epc, zpl } = bodyCad as { epc: string; zpl: string };
      epcGerado = epc;

      // 2. Envia ZPL para a Zebra
      try {
        await enviarZpl(impressora.device, zpl);
      } catch (errZebra) {
        // Rollback total
        try {
          await fetch("/api/rfid/reverter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              epc: epcGerado,
              motivo: "browser_print_falhou",
            }),
          });
        } catch {
          // melhor esforço; backend tem CHECK e log
        }
        addToast({
          tipo: "erro",
          titulo: "Falha na impressora",
          mensagem:
            errZebra instanceof Error ? errZebra.message : "Nenhum registro gravado.",
        });
        setImprimindo(false);
        return;
      }

      // 3. Confirma
      const resConf = await fetch("/api/rfid/confirmar-impressao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epc: epcGerado }),
      });
      if (!resConf.ok) {
        addToast({
          tipo: "erro",
          titulo: "Confirmação falhou",
          mensagem:
            "A etiqueta foi impressa, mas o ERP não confirmou. Verifique o registro antes de imprimir novamente.",
        });
      } else {
        addToast({
          tipo: "sucesso",
          titulo: `Tag ${epcGerado} impressa`,
          mensagem: produto.sku ?? undefined,
        });
      }

      // 4. Reset
      setProduto(null);
      setBusca("");
      setResultados([]);
      setDropdownAberto(false);
      await Promise.all([carregarSessao(), carregarCategorias()]);
      // foca na busca para a próxima peça
      setTimeout(() => buscaRef.current?.focus(), 50);
    } catch (e) {
      // Se erro genérico e já temos EPC, tenta reverter
      if (epcGerado) {
        fetch("/api/rfid/reverter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epc: epcGerado, motivo: "erro_inesperado" }),
        }).catch(() => {});
      }
      addToast({
        tipo: "erro",
        titulo: "Erro inesperado",
        mensagem: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setImprimindo(false);
    }
  }, [produto, impressora, addToast, carregarSessao, carregarCategorias]);

  // ─── Reimpressão ────────────────────────────────────────────────────────
  const [reimprimindoEpc, setReimprimindoEpc] = useState<string | null>(null);

  const reimprimir = useCallback(
    async (epc: string) => {
      if (impressora.estado !== "ok") {
        addToast({
          tipo: "erro",
          titulo: "Impressora não conectada",
          mensagem: "Verifique o Zebra Browser Print.",
        });
        return;
      }
      setReimprimindoEpc(epc);
      try {
        const res = await fetch("/api/rfid/reimprimir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epc }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          addToast({
            tipo: "erro",
            titulo: "Falha na reimpressão",
            mensagem: (body as { error?: string }).error ?? `Erro ${res.status}`,
          });
          return;
        }
        const { zpl } = body as { zpl: string };
        await enviarZpl(impressora.device, zpl);
        addToast({ tipo: "sucesso", titulo: `Tag ${epc} reimpressa` });
      } catch (e) {
        addToast({
          tipo: "erro",
          titulo: "Erro na reimpressão",
          mensagem: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setReimprimindoEpc(null);
      }
    },
    [impressora, addToast],
  );

  // ─── Atalhos de teclado ─────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+P dispara impressão
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        if (podeImprimir) {
          e.preventDefault();
          imprimir();
        }
        return;
      }
      // Esc limpa seleção (se há produto)
      if (e.key === "Escape" && produto) {
        e.preventDefault();
        limparSelecao();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [podeImprimir, imprimir, produto, limparSelecao]);

  // ─── Foco inicial ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && autorizado) {
      buscaRef.current?.focus();
    }
  }, [authLoading, autorizado]);

  // ─── Auth guard render ──────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.esmeralda }} />
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  if (!autorizado) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <XCircle className="w-12 h-12 mb-3 text-red-500" />
        <h1 className="text-xl font-semibold mb-2" style={{ color: C.esmeralda }}>
          Sem permissão
        </h1>
        <p className="text-sm text-gray-600 max-w-md">
          Seu perfil ({role ?? "desconhecido"}) não tem acesso ao cadastro de tags RFID.
          Fale com um administrador ou gerente de fábrica.
        </p>
      </div>
    );
  }

  // ─── Render principal ───────────────────────────────────────────────────
  return (
    <div className="min-h-full" style={{ backgroundColor: C.cremeBg }}>
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold flex items-center gap-2"
              style={{ color: C.esmeralda, fontFamily: "var(--font-serif), serif" }}
            >
              <Tag className="w-7 h-7" />
              Etiquetar Joia
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Módulo RFID — cadastro individual de tag via Zebra ZD621R
            </p>
          </div>
        </div>

        {/* Status Browser Print */}
        <div className="mb-4">
          <BannerImpressora
            status={impressora}
            onReconectar={verificarImpressora}
          />
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 md:gap-6">
          {/* Coluna principal */}
          <div className="space-y-4">
            {/* Busca */}
            <div
              className="bg-white rounded-xl border p-4 md:p-5 relative"
              style={{ borderColor: C.cremeBorder }}
            >
              {/* Erro ao carregar categorias */}
              {erroCategorias && (
                <div
                  className="mb-3 rounded-lg p-2 flex items-center gap-2 border text-xs"
                  style={{
                    backgroundColor: "#fef2f2",
                    borderColor: "#fecaca",
                    color: "#991b1b",
                  }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">
                    Nao foi possivel carregar categorias ({erroCategorias})
                  </span>
                  <button
                    type="button"
                    onClick={carregarCategorias}
                    className="px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-800 flex items-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" />
                    Tentar
                  </button>
                </div>
              )}

              {/* Chips de categoria */}
              <div className="mb-3">
                <label
                  className="text-xs font-semibold uppercase tracking-wide mb-2 block"
                  style={{ color: C.esmeralda }}
                >
                  Filtrar por categoria (somente com estoque ≥ 1)
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {/* Chip Todos */}
                  <ChipCategoria
                    label="Todos"
                    total={totalGeral}
                    ativo={categoriaBase === null}
                    onClick={() => setCategoriaBase(null)}
                  />
                  {categorias.map((c) => (
                    <ChipCategoria
                      key={c.base}
                      label={c.base}
                      total={c.total}
                      ativo={categoriaBase === c.base}
                      onClick={() =>
                        setCategoriaBase(
                          categoriaBase === c.base ? null : c.base,
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              <label
                className="text-xs font-semibold uppercase tracking-wide mb-2 block"
                style={{ color: C.esmeralda }}
              >
                Buscar produto
                {categoriaBase && (
                  <span className="ml-2 text-[10px] font-normal normal-case text-gray-500">
                    (dentro de &quot;{categoriaBase}&quot;)
                  </span>
                )}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={buscaRef}
                  type="text"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setProduto(null);
                  }}
                  onFocus={() => {
                    if (resultados.length > 0) setDropdownAberto(true);
                  }}
                  onKeyDown={(e) => {
                    if (!dropdownAberto || resultados.length === 0) {
                      if (e.key === "Enter" && resultados[0]) {
                        e.preventDefault();
                        selecionarProduto(resultados[0]);
                      }
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setIndiceAtivo((i) => Math.min(i + 1, resultados.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setIndiceAtivo((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const item = resultados[indiceAtivo] ?? resultados[0];
                      if (item) selecionarProduto(item);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setDropdownAberto(false);
                    }
                  }}
                  placeholder="Digite SKU ou nome do produto…"
                  disabled={imprimindo}
                  className="w-full pl-9 pr-9 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 disabled:opacity-50"
                  style={{
                    borderColor: C.cremeBorder,
                    // ring color via inline
                  }}
                  onBlur={() => {
                    // pequeno delay para permitir click no dropdown
                    setTimeout(() => setDropdownAberto(false), 150);
                  }}
                  autoComplete="off"
                />
                {buscando && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>

              {/* Dropdown resultados */}
              {dropdownAberto && resultados.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute left-4 right-4 mt-1 bg-white border rounded-lg shadow-lg max-h-72 overflow-y-auto z-20"
                  style={{ borderColor: C.cremeBorder }}
                >
                  {resultados.map((r, idx) => (
                    <li
                      key={String(r.id_produto)}
                      role="option"
                      aria-selected={idx === indiceAtivo}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selecionarProduto(r);
                      }}
                      onMouseEnter={() => setIndiceAtivo(idx)}
                      className="px-3 py-2 cursor-pointer text-sm flex items-center gap-3"
                      style={{
                        backgroundColor:
                          idx === indiceAtivo ? C.creme : "transparent",
                      }}
                    >
                      <span
                        className="font-mono font-semibold whitespace-nowrap"
                        style={{ color: C.esmeralda }}
                      >
                        {r.sku ?? "—"}
                      </span>
                      <span className="text-gray-700 truncate flex-1 min-w-0">
                        {r.nome ?? "(sem nome)"}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                        style={{ backgroundColor: C.creme, color: C.esmeralda }}
                        title={`${r.qtd_estoque} unidade${r.qtd_estoque !== 1 ? "s" : ""} em estoque`}
                      >
                        {r.qtd_estoque} un
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {(busca.length >= 2 || categoriaBase !== null) &&
                !buscando &&
                resultados.length === 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Nenhum produto com estoque encontrado
                    {busca.length >= 2 && <> para &quot;{busca}&quot;</>}
                    {categoriaBase && <> em &quot;{categoriaBase}&quot;</>}.
                  </p>
                )}

              <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500">
                <Keyboard className="w-3.5 h-3.5" />
                <span>
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded">↑↓</kbd>{" "}
                  navegar ·{" "}
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded">Enter</kbd>{" "}
                  selecionar ·{" "}
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded">Ctrl+P</kbd>{" "}
                  imprimir ·{" "}
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded">Esc</kbd>{" "}
                  limpar
                </span>
              </div>
            </div>

            {/* Card do produto selecionado */}
            <CardProduto
              produto={produto}
              carregando={carregandoPreview}
              onLimpar={limparSelecao}
            />

            {/* Botão imprimir */}
            <button
              type="button"
              onClick={imprimir}
              disabled={!podeImprimir}
              className="w-full py-4 rounded-xl font-semibold text-base shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: podeImprimir ? C.esmeralda : "#9ca3af",
                color: "#fff",
              }}
              onMouseEnter={(e) => {
                if (podeImprimir) e.currentTarget.style.backgroundColor = C.esmeraldaH;
              }}
              onMouseLeave={(e) => {
                if (podeImprimir) e.currentTarget.style.backgroundColor = C.esmeralda;
              }}
            >
              {imprimindo ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Imprimindo…
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5" />
                  Gerar EPC e Imprimir
                  <span
                    className="ml-2 px-1.5 py-0.5 text-[10px] rounded font-mono opacity-70"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  >
                    Ctrl+P
                  </span>
                </>
              )}
            </button>

            {/* Overlay de impressão */}
            {imprimindo && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center">
                <div
                  className="bg-white rounded-xl p-6 shadow-xl flex items-center gap-3"
                  style={{ borderColor: C.cremeBorder, borderWidth: 1 }}
                >
                  <Loader2
                    className="w-6 h-6 animate-spin"
                    style={{ color: C.esmeralda }}
                  />
                  <span className="font-medium" style={{ color: C.esmeralda }}>
                    Imprimindo etiqueta…
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Coluna lateral — sessão */}
          <aside
            className="bg-white rounded-xl border p-4 h-fit sticky top-4"
            style={{ borderColor: C.cremeBorder }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-sm font-bold"
                style={{ color: C.esmeralda }}
              >
                Impressas nesta sessão:{" "}
                <span
                  className="text-lg font-mono ml-1"
                  style={{ color: C.dourado }}
                >
                  {sessaoVisivel.length}
                </span>
              </h2>
              {sessaoVisivel.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLimparVisual(new Set(sessao.map((j) => j.epc)));
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  title="Limpa apenas a visualização (não afeta o banco)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar
                </button>
              )}
            </div>

            {sessaoVisivel.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                Nenhuma etiqueta impressa ainda nesta sessão.
              </div>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {sessaoVisivel.map((j) => (
                  <li
                    key={j.epc}
                    className="border rounded-lg p-2.5 flex items-start gap-2"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="text-gray-400 font-mono">
                          {formatHora(j.created_at)}
                        </span>
                        <span
                          className="font-mono font-semibold truncate"
                          style={{ color: C.esmeralda }}
                        >
                          {j.sku}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600 truncate">
                        {j.nome}
                      </div>
                      <div
                        className="text-[10px] font-mono mt-0.5 inline-block px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: C.creme,
                          color: C.esmeralda,
                        }}
                      >
                        {j.epc}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => reimprimir(j.epc)}
                      disabled={
                        reimprimindoEpc === j.epc ||
                        imprimindo ||
                        impressora.estado !== "ok"
                      }
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Reimprimir"
                    >
                      {reimprimindoEpc === j.epc ? (
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.esmeralda }} />
                      ) : (
                        <RotateCw className="w-4 h-4" style={{ color: C.esmeralda }} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-lg shadow-lg p-3 flex items-start gap-2 animate-in slide-in-from-right"
            style={{
              backgroundColor:
                t.tipo === "sucesso"
                  ? "#ecfdf5"
                  : t.tipo === "erro"
                    ? "#fef2f2"
                    : "#eff6ff",
              borderLeft: `4px solid ${
                t.tipo === "sucesso"
                  ? "#10b981"
                  : t.tipo === "erro"
                    ? "#ef4444"
                    : "#3b82f6"
              }`,
            }}
          >
            {t.tipo === "sucesso" && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            )}
            {t.tipo === "erro" && (
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            {t.tipo === "info" && (
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900">
                {t.titulo}
              </div>
              {t.mensagem && (
                <div className="text-xs text-gray-600 mt-0.5 break-words">
                  {t.mensagem}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Banner status impressora ──────────────────────────────────────────────
function BannerImpressora({
  status,
  onReconectar,
}: {
  status: ImpressoraStatus;
  onReconectar: () => void;
}) {
  if (status.estado === "buscando") {
    return (
      <div
        className="rounded-lg p-3 flex items-center gap-3 border"
        style={{
          backgroundColor: "#fefce8",
          borderColor: "#fde68a",
        }}
      >
        <Loader2 className="w-5 h-5 animate-spin text-yellow-700" />
        <div>
          <div className="text-sm font-semibold text-yellow-900">
            Buscando impressora…
          </div>
          <div className="text-xs text-yellow-800">
            Verificando se o Zebra Browser Print está rodando em 127.0.0.1:9100
          </div>
        </div>
      </div>
    );
  }

  if (status.estado === "ok") {
    return (
      <div
        className="rounded-lg p-3 flex items-center gap-3 border"
        style={{
          backgroundColor: "#ecfdf5",
          borderColor: "#a7f3d0",
        }}
      >
        <PrinterCheck className="w-5 h-5 text-emerald-700" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-emerald-900">
            Zebra Browser Print conectado
          </div>
          <div className="text-xs text-emerald-800 truncate">
            Impressora: <span className="font-mono">{status.device.name}</span>{" "}
            · {status.device.connection}
          </div>
        </div>
        <button
          type="button"
          onClick={onReconectar}
          className="p-1.5 rounded hover:bg-emerald-100"
          title="Recarregar"
        >
          <RotateCw className="w-4 h-4 text-emerald-700" />
        </button>
      </div>
    );
  }

  if (status.estado === "ausente") {
    return (
      <div
        className="rounded-lg p-3 flex items-start gap-3 border"
        style={{
          backgroundColor: "#fef2f2",
          borderColor: "#fecaca",
        }}
      >
        <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-red-900">
            Zebra Browser Print não encontrado
          </div>
          <div className="text-xs text-red-800 mt-0.5">
            Instale o utilitário em{" "}
            <a
              href="https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html"
              target="_blank"
              rel="noreferrer"
              className="underline font-medium"
            >
              zebra.com/browser-print
            </a>{" "}
            e abra-o neste computador.
          </div>
        </div>
        <button
          type="button"
          onClick={onReconectar}
          className="px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200 text-red-800 flex items-center gap-1 flex-shrink-0"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Tentar novamente
        </button>
      </div>
    );
  }

  // erro
  return (
    <div
      className="rounded-lg p-3 flex items-start gap-3 border"
      style={{
        backgroundColor: "#fef2f2",
        borderColor: "#fecaca",
      }}
    >
      <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-red-900">
          Erro na impressora
        </div>
        <div className="text-xs text-red-800 break-words">{status.mensagem}</div>
      </div>
      <button
        type="button"
        onClick={onReconectar}
        className="px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200 text-red-800 flex items-center gap-1 flex-shrink-0"
      >
        <RotateCw className="w-3.5 h-3.5" />
        Tentar novamente
      </button>
    </div>
  );
}

// ─── Card do produto ───────────────────────────────────────────────────────
function CardProduto({
  produto,
  carregando,
  onLimpar,
}: {
  produto: ProdutoPreview | null;
  carregando: boolean;
  onLimpar: () => void;
}) {
  if (carregando) {
    return (
      <div
        className="bg-white rounded-xl border p-6 flex items-center gap-3"
        style={{ borderColor: C.cremeBorder }}
      >
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: C.esmeralda }} />
        <span className="text-sm text-gray-600">Carregando detalhes…</span>
      </div>
    );
  }

  if (!produto) {
    return (
      <div
        className="bg-white rounded-xl border p-6 text-center text-sm text-gray-500"
        style={{ borderColor: C.cremeBorder, borderStyle: "dashed" }}
      >
        Selecione um produto na busca acima para gerar a etiqueta.
      </div>
    );
  }

  if (!produto.tem_sku_e_nome) {
    return (
      <div
        className="bg-white rounded-xl border-2 p-5 flex items-start gap-3"
        style={{ borderColor: "#fca5a5", backgroundColor: "#fef2f2" }}
      >
        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-red-900">
            Produto sem SKU ou nome
          </div>
          <div className="text-sm text-red-800 mt-1">
            O produto #{produto.id_produto} não tem SKU ou nome preenchidos em{" "}
            <code className="text-xs">public.produtos</code>. Não é possível
            gerar etiqueta. Complete o cadastro do produto e tente novamente.
          </div>
          <button
            type="button"
            onClick={onLimpar}
            className="mt-2 text-xs text-red-700 underline"
          >
            Limpar seleção
          </button>
        </div>
      </div>
    );
  }

  const peso = produto.peso_precificado ?? produto.peso_real;

  return (
    <div
      className="bg-white rounded-xl border p-4 md:p-5 flex gap-4"
      style={{ borderColor: C.cremeBorder }}
    >
      {/* Foto */}
      <div
        className="w-24 h-24 md:w-28 md:h-28 rounded-lg flex-shrink-0 bg-gray-100 overflow-hidden flex items-center justify-center"
        style={{ borderColor: C.cremeBorder, borderWidth: 1 }}
      >
        {produto.imagem ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={produto.imagem}
            alt={produto.sku ?? ""}
            className="w-full h-full object-cover"
          />
        ) : (
          <Tag className="w-8 h-8 text-gray-300" />
        )}
      </div>

      {/* Dados */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className="font-mono text-lg md:text-xl font-bold truncate"
              style={{ color: C.esmeralda }}
            >
              {produto.sku}
            </div>
            <div className="text-sm text-gray-700 line-clamp-2 mt-0.5">
              {produto.nome}
            </div>
          </div>
          <button
            type="button"
            onClick={onLimpar}
            className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
            title="Esc"
          >
            Limpar
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-2 items-center">
          {produto.categoria && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: C.creme,
                color: C.esmeralda,
              }}
            >
              {produto.categoria}
            </span>
          )}
          {produto.qtd_estoque !== undefined && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold border"
              style={{
                backgroundColor: "#ecfdf5",
                color:           "#065f46",
                borderColor:     "#a7f3d0",
              }}
              title={`${produto.qtd_estoque} unidade${produto.qtd_estoque !== 1 ? "s" : ""} em estoque`}
            >
              Estoque: {produto.qtd_estoque} un
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
          <div>
            <span className="text-gray-500">Peso: </span>
            <span className="font-mono" style={{ color: C.esmeralda }}>
              {formatPeso(peso)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Preço: </span>
            <span className="font-mono" style={{ color: C.esmeralda }}>
              {formatBRL(produto.preco_tiny)}
            </span>
          </div>
          <div className="col-span-2 text-[11px] text-gray-400 mt-1">
            id_produto #{produto.id_produto}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chip de categoria ─────────────────────────────────────────────────────
function ChipCategoria({
  label,
  total,
  ativo,
  onClick,
}: {
  label: string;
  total: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border flex items-center gap-1.5 flex-shrink-0"
      style={{
        backgroundColor: ativo ? C.esmeralda : C.creme,
        color:           ativo ? "#fff"      : C.esmeralda,
        borderColor:     ativo ? C.esmeralda : C.cremeBorder,
      }}
      aria-pressed={ativo}
      title={`${total} produto${total !== 1 ? "s" : ""} com estoque`}
    >
      <span>{label}</span>
      <span
        className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: ativo ? "rgba(255,255,255,0.18)" : "#fff",
          color:           ativo ? "#fff"                    : C.esmeralda,
        }}
      >
        {total}
      </span>
    </button>
  );
}
