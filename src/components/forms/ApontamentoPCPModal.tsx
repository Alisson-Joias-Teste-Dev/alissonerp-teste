"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RefreshCw } from "lucide-react";
import { formatPeso } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";

const C = {
  esmeralda: "#184036",
  esmeralda700: "#0F2922",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// Tipos sem insumo
const TIPO_SEM_INSUMO = [7];
// Metal (categoria 1)
const TIPO_METAL = [1, 2, 5];
// Pedra (categoria 2)
const TIPO_PEDRA = [3, 6];
// Tipos que exigem foto + validação IA
const TIPO_FOTO_IA       = 2;  // Entrada de Metal
const TIPO_ADITIVO       = 1;  // Aditivo de Metal (usa depósito/setor do PCP)
const TIPO_RETORNO       = 5;  // Retorno de Metal (usa depósito/setor do PCP, sem filtro estoque)
const TIPO_ENTRADA_PEDRA = 3;  // Entrada de Pedra (usa depósito/setor do PCP, qtd em unidades)
const TIPO_RETORNO_PEDRA = 6;  // Retorno de Pedra (devolve ao Almoxarifado, todos insumos, margem config)
const TIPO_OUTROS        = 8;  // Entrada Outros Insumos (silicone, solda, etc.) — Almox→Operador

interface ApontamentoPCPModalProps {
  isOpen: boolean;
  onClose: () => void;
  pcpId: number;
  ordemId: number;
  depositoId: number;
  setorId: number | null;
  onSuccess?: () => void;
}

interface TipoApontamento {
  id: number;
  descricao: string;
  scope: string;
}

interface Insumo {
  id: number;
  nome: string;
  sku: string | null;
  categoria_id: number;
  saldo_disponivel?: number;
  unidade?: string;
  peso_pedra?: number | null;
}

interface Deposito {
  id: number;
  nome: string;
}

interface Setor {
  id: number;
  nome: string;
}

interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
}

export default function ApontamentoPCPModal({
  isOpen,
  onClose,
  pcpId,
  ordemId,
  depositoId,
  setorId,
  onSuccess,
}: ApontamentoPCPModalProps) {
  const [tipos, setTipos] = useState<TipoApontamento[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [depositoSelecionado, setDepositoSelecionado] = useState<number | "">(depositoId);
  const [setorSelecionado, setSetorSelecionado] = useState<number | "">(setorId ?? "");
  const [tipoId, setTipoId] = useState<number | "">("");
  const [insumoId, setInsumoId] = useState<number | "">("");
  const [qtd, setQtd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Peso unitário da pedra selecionada (para calcular peso total)
  const [pesoPedraUnitario, setPesoPedraUnitario] = useState<number | null>(null);

  // Autocomplete de pedras
  const [buscaPedra, setBuscaPedra] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Estados de foto e IA
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacaoIA, setValidacaoIA] = useState<ValidacaoIA | null>(null);
  const [validando, setValidando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const precisaFotoIA = tipoId === TIPO_FOTO_IA || tipoId === TIPO_ADITIVO || tipoId === TIPO_RETORNO || tipoId === TIPO_ENTRADA_PEDRA || tipoId === TIPO_RETORNO_PEDRA || tipoId === TIPO_OUTROS;
  const isPedra  = TIPO_PEDRA.includes(tipoId as number);
  const isOutros = tipoId === TIPO_OUTROS;

  // ─── Carregar tipos e depósitos ao abrir ──────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/pcp/tipos-apontamento")
      .then((r) => r.json())
      .then((data) => setTipos(data ?? []));
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((data) => setDepositos(Array.isArray(data) ? data : []));
  }, [isOpen]);

  // ─── Recarregar setores quando depósito muda ───────────────────────────────
  useEffect(() => {
    if (!depositoSelecionado) { setSetores([]); setSetorSelecionado(""); return; }
    fetch(`/api/pcp/setores?deposito_id=${depositoSelecionado}`)
      .then((r) => r.json())
      .then((data) => {
        const lista = Array.isArray(data) ? data : [];
        setSetores(lista);
        // Se o setor anterior não existe neste depósito, limpar
        if (setorSelecionado && !lista.find((s: Setor) => s.id === setorSelecionado)) {
          setSetorSelecionado("");
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositoSelecionado]);

  // ─── Carregar insumos conforme o tipo ──────────────────────────────────────
  useEffect(() => {
    if (!tipoId) {
      setInsumos([]);
      setInsumoId("");
      return;
    }
    if (TIPO_SEM_INSUMO.includes(tipoId as number)) {
      setInsumos([]);
      setInsumoId("");
      return;
    }

    if ((tipoId as number) === TIPO_FOTO_IA || (tipoId as number) === TIPO_ADITIVO) {
      // Entrada/Aditivo de Metal: só do Almoxarifado Central (Dep1) com saldo > 0
      fetch("/api/pcp/insumos-disponiveis?deposito_id=1&categoria_id=1")
        .then((r) => r.json())
        .then((data) => {
          setInsumos(data ?? []);
          setInsumoId("");
        });
      return;
    }

    if ((tipoId as number) === TIPO_RETORNO) {
      // Retorno de Metal: todos insumos Metal, SEM filtro de estoque
      fetch("/api/pcp/insumos?categoria_id=1")
        .then((r) => r.json())
        .then((data) => {
          setInsumos(data ?? []);
          setInsumoId("");
        });
      return;
    }

    if ((tipoId as number) === TIPO_ENTRADA_PEDRA) {
      // Entrada de Pedra: só Almoxarifado Central (Dep1), categoria Pedras, com saldo > 0
      fetch("/api/pcp/insumos-disponiveis?deposito_id=1&categoria_id=2")
        .then((r) => r.json())
        .then((data) => {
          setInsumos(data ?? []);
          setInsumoId("");
          setPesoPedraUnitario(null);
        });
      return;
    }

    if ((tipoId as number) === TIPO_RETORNO_PEDRA) {
      // Retorno de Pedra: TODOS os insumos Pedra, SEM filtro estoque (tá devolvendo)
      fetch("/api/pcp/insumos?categoria_id=2")
        .then((r) => r.json())
        .then((data) => {
          setInsumos(data ?? []);
          setInsumoId("");
          setPesoPedraUnitario(null);
        });
      return;
    }

    if ((tipoId as number) === TIPO_OUTROS) {
      // Entrada Outros: Almoxarifado Central, categorias != Metal e != Pedras, com saldo > 0
      fetch("/api/pcp/insumos-disponiveis?deposito_id=1&excluir_categorias=1,2")
        .then((r) => r.json())
        .then((data) => {
          setInsumos(data ?? []);
          setInsumoId("");
        });
      return;
    }

    // Outros tipos: sem filtro de saldo
    let url = "/api/pcp/insumos";
    if (TIPO_METAL.includes(tipoId as number)) url += "?categoria_id=1";
    else if (TIPO_PEDRA.includes(tipoId as number)) url += "?categoria_id=2";

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setInsumos(data ?? []);
        setInsumoId("");
      });
  }, [tipoId]);

  // ─── Fechar dropdown ao clicar fora ou ESC ─────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownAberto(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // ─── Resetar validação quando qtd muda (precisa revalidar) ─────────────────
  useEffect(() => {
    if (validacaoIA !== null) setValidacaoIA(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtd]);

  // ─── Validação IA ──────────────────────────────────────────────────────────
  const validarComIA = useCallback(async (file: File, valor: number, tipo: "metal" | "pedra" = "metal") => {
    setValidando(true);
    setValidacaoIA(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("peso", String(valor)); // metal: peso digitado | pedra: peso calculado (qtd × peso_pedra)
    if (tipo === "pedra") fd.append("tipo", "pedra");

    const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
    const result: ValidacaoIA = await res.json();
    setValidacaoIA(result);
    setValidando(false);
  }, []);

  const handleFoto = useCallback(
    async (file: File) => {
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
      setValidacaoIA(null);

      const num = parseFloat(qtd);
      if (!isNaN(num) && num > 0) {
        // Para pedra: envia o peso CALCULADO (qtd × peso_pedra) em vez da quantidade
        const valorIA = isPedra && pesoPedraUnitario !== null ? num * pesoPedraUnitario : num;
        await validarComIA(file, valorIA, isPedra ? "pedra" : "metal");
      }
    },
    [qtd, validarComIA, isPedra, pesoPedraUnitario]
  );

  const handleRevalidar = useCallback(() => {
    if (!fotoFile) return;
    const num = parseFloat(qtd);
    if (!isNaN(num) && num > 0) {
      const valorIA = isPedra && pesoPedraUnitario !== null ? num * pesoPedraUnitario : num;
      validarComIA(fotoFile, valorIA, isPedra ? "pedra" : "metal");
    }
  }, [fotoFile, qtd, validarComIA, isPedra, pesoPedraUnitario]);

  // ─── Reset ─────────────────────────────────────────────────────────────────
  function resetForm() {
    setDepositoSelecionado(depositoId);
    setSetorSelecionado(setorId ?? "");
    setTipoId("");
    setInsumoId("");
    setQtd("");
    setPesoPedraUnitario(null);
    setBuscaPedra("");
    setDropdownAberto(false);
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setValidacaoIA(null);
    setValidando(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");

    if (!usaDepositoDoCard && !depositoSelecionado) {
      setError("Selecione o depósito.");
      return;
    }
    if (!usaDepositoDoCard && setores.length > 0 && !setorSelecionado) {
      setError("Selecione o setor.");
      return;
    }
    if (!tipoId) {
      setError("Selecione o tipo de apontamento.");
      return;
    }
    if (!TIPO_SEM_INSUMO.includes(tipoId as number) && !insumoId) {
      setError("Selecione o insumo.");
      return;
    }
    const qtdNum = parseFloat(qtd);
    if (isNaN(qtdNum) || qtdNum <= 0) {
      setError("Quantidade deve ser maior que zero.");
      return;
    }

    // Validações extras para tipos com foto + IA
    if (precisaFotoIA) {
      if (!fotoFile) {
        setError("Foto da balança é obrigatória.");
        return;
      }
      if (!validacaoIA?.match) {
        setError("O peso precisa ser confirmado pela IA antes de salvar.");
        return;
      }
    }

    setLoading(true);

    // Upload da foto para o Storage (só para tipo 2)
    let fotoPath: string | null = null;
    if (precisaFotoIA && fotoFile) {
      const supabase = createClient();
      const ext = fotoFile.name.split(".").pop() ?? "jpg";
      const path = `apontamentos/${Date.now()}-pcp${pcpId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("apontamento-fotos")
        .upload(path, fotoFile, { contentType: fotoFile.type });
      if (uploadError) {
        setError("Erro ao enviar foto: " + uploadError.message);
        setLoading(false);
        return;
      }
      fotoPath = path;
    }

    const res = await fetch("/api/pcp/apontamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_apontamento_id: tipoId,
        deposito_id: usaDepositoDoCard ? depositoId : depositoSelecionado,
        setor_id: usaDepositoDoCard ? setorId : (setorSelecionado || null),
        insumo_id: TIPO_SEM_INSUMO.includes(tipoId as number) ? null : insumoId,
        pcp_id: pcpId,
        qtd: qtdNum,
        foto_balanca: fotoPath,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao registrar apontamento.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      resetForm();
      onSuccess?.();
      onClose();
    }, 1500);
  }

  if (!isOpen) return null;

  // Botão salvar: habilitado apenas quando IA confirmou (para tipo 2)
  const fotoOk = !precisaFotoIA || validacaoIA?.match === true;
  // Setor obrigatório apenas quando o depósito tem setores cadastrados
  const setorOk = setores.length === 0 || !!setorSelecionado;
  const usaDepositoDoCard = tipoId === TIPO_ADITIVO || tipoId === TIPO_RETORNO || tipoId === TIPO_ENTRADA_PEDRA || tipoId === TIPO_RETORNO_PEDRA || tipoId === TIPO_OUTROS;
  const camposEntradaOk = precisaFotoIA
    ? (usaDepositoDoCard || (!!depositoSelecionado && setorOk))
    : true;
  const podeSalvar = !loading && !success && !!tipoId && fotoOk && camposEntradaOk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Novo Apontamento
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              PCP #{pcpId}
              {depositoSelecionado
                ? ` · ${depositos.find((d) => d.id === depositoSelecionado)?.nome ?? `Depósito ${depositoSelecionado}`}`
                : ""}
              {setorSelecionado
                ? ` · ${setores.find((s) => s.id === setorSelecionado)?.nome ?? `Setor ${setorSelecionado}`}`
                : ""}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* ── 1. TIPO DE APONTAMENTO — sempre primeiro ── */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Tipo de Apontamento <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <select
              value={tipoId}
              onChange={(e) => {
                setTipoId(e.target.value ? parseInt(e.target.value) : "");
                setDepositoSelecionado(depositoId);
                setSetorSelecionado(setorId ?? "");
                setInsumoId("");
                setQtd("");
                setBuscaPedra("");
                setDropdownAberto(false);
                setPesoPedraUnitario(null);
                setFotoFile(null);
                setFotoPreview(null);
                setValidacaoIA(null);
                setError("");
              }}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
            >
              <option value="">Selecione...</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} — {t.descricao}
                </option>
              ))}
            </select>
          </div>

          {/* ── 2. ENTRADA / ADITIVO DE METAL — campos completos ── */}
          {precisaFotoIA && (
            <>
              {/* Depósito/Setor: read-only para tipos 1, 3 e 5; selects para tipo 2 */}
              {usaDepositoDoCard ? (
                <div
                  className="rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>
                    {(tipoId === TIPO_RETORNO || tipoId === TIPO_RETORNO_PEDRA) ? "Devolvendo de" : (tipoId === TIPO_ENTRADA_PEDRA || tipoId === TIPO_OUTROS) ? "Entregando em" : "Depósito/Operador"}
                  </p>
                  <p className="text-sm font-medium" style={{ color: "#111827" }}>
                    {depositos.find((d) => d.id === depositoId)?.nome ?? `Depósito ${depositoId}`}
                    {setorId
                      ? ` · ${setores.find((s) => s.id === setorId)?.nome ?? `Setor ${setorId}`}`
                      : ""}
                    {(tipoId === TIPO_RETORNO || tipoId === TIPO_RETORNO_PEDRA) && (
                      <span style={{ color: "#9CA3AF" }}> → Almoxarifado Central</span>
                    )}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                    Definido pelo PCP — não editável
                  </p>
                </div>
              ) : (
                <>
                  {/* Depósito/Operador */}
                  <div>
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: "#6B7280" }}
                    >
                      Depósito/Operador <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    <select
                      value={depositoSelecionado}
                      onChange={(e) => {
                        setDepositoSelecionado(e.target.value ? parseInt(e.target.value) : "");
                        setError("");
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                      style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                    >
                      <option value="">Selecione o depósito...</option>
                      {depositos.map((d) => (
                        <option key={d.id} value={d.id}>{d.nome}</option>
                      ))}
                    </select>
                  </div>

                  {/* Setor — só aparece se o depósito tem setores */}
                  {depositoSelecionado && (
                    <div>
                      <label
                        className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                        style={{ color: "#6B7280" }}
                      >
                        Setor <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      {setores.length === 0 ? (
                        <p className="text-[12px] mt-1" style={{ color: "#B45309" }}>
                          Nenhum setor cadastrado para este depósito. Cadastre em Configurações → Depósitos.
                        </p>
                      ) : (
                        <select
                          value={setorSelecionado}
                          onChange={(e) => {
                            setSetorSelecionado(e.target.value ? parseInt(e.target.value) : "");
                            setError("");
                          }}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                        >
                          <option value="">Selecione o setor...</option>
                          {setores.map((s) => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Insumo */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: "#6B7280" }}
                >
                  {isPedra ? "Insumo (Pedra)" : isOutros ? "Insumo (Outros)" : "Insumo (Metal)"}
                  {" "}<span style={{ color: "#EF4444" }}>*</span>
                </label>

                {isPedra ? (
                  /* ── Autocomplete pesquisável para pedras ── */
                  <div ref={dropdownRef} className="relative">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }}>
                        🔍
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar por nome ou SKU..."
                        value={buscaPedra}
                        onChange={(e) => {
                          setBuscaPedra(e.target.value);
                          setDropdownAberto(true);
                          // Se limpou o campo, limpar seleção
                          if (!e.target.value) {
                            setInsumoId("");
                            setPesoPedraUnitario(null);
                          }
                        }}
                        onFocus={() => setDropdownAberto(true)}
                        className="w-full pl-8 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                        style={{ borderColor: insumoId ? C.esmeralda : C.cremeBorder, backgroundColor: "#fff" }}
                      />
                    </div>

                    {dropdownAberto && (
                      <div
                        className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-y-auto"
                        style={{
                          maxHeight: 220,
                          backgroundColor: "#fff",
                          border: `1px solid ${C.cremeBorder}`,
                        }}
                      >
                        {(() => {
                          const filtradas = insumos.filter((i) => {
                            const q = buscaPedra.toLowerCase();
                            return (
                              i.nome.toLowerCase().includes(q) ||
                              (i.sku ?? "").toLowerCase().includes(q)
                            );
                          });
                          if (filtradas.length === 0) {
                            return (
                              <p className="px-3 py-2.5 text-sm" style={{ color: "#9CA3AF" }}>
                                Nenhuma pedra encontrada
                              </p>
                            );
                          }
                          return filtradas.map((i) => (
                            <button
                              key={i.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault(); // evita blur antes do click
                                setInsumoId(i.id);
                                setPesoPedraUnitario(i.peso_pedra ?? null);
                                setBuscaPedra(`${i.nome}${i.sku ? ` (${i.sku})` : ""}`);
                                setDropdownAberto(false);
                                setError("");
                              }}
                              className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
                              style={{
                                borderBottom: `1px solid ${C.cremeBorder}`,
                                backgroundColor: insumoId === i.id ? C.cremeBg : "transparent",
                                color: "#111827",
                              }}
                              onMouseEnter={(e) => {
                                if (insumoId !== i.id)
                                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.cremeBg;
                              }}
                              onMouseLeave={(e) => {
                                if (insumoId !== i.id)
                                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                              }}
                            >
                              <span>
                                <span className="font-medium">{i.nome}</span>
                                {i.sku && (
                                  <span className="ml-1.5 text-[11px]" style={{ color: "#9CA3AF" }}>
                                    ({i.sku})
                                  </span>
                                )}
                              </span>
                              {i.saldo_disponivel !== undefined && (
                                <span className="text-[11px] shrink-0 ml-2" style={{ color: "#6B7280" }}>
                                  {Math.round(Number(i.saldo_disponivel))} UN disp.
                                </span>
                              )}
                            </button>
                          ));
                        })()}
                      </div>
                    )}

                    {insumos.length === 0 && (
                      <p className="text-[12px] mt-1.5" style={{ color: "#B45309" }}>
                        Nenhuma pedra com saldo disponível no Almoxarifado Central.
                      </p>
                    )}
                  </div>
                ) : (
                  /* ── Select simples para metal ── */
                  <>
                    <select
                      value={insumoId}
                      onChange={(e) => {
                        setInsumoId(e.target.value ? parseInt(e.target.value) : "");
                        setError("");
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                      style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                    >
                      <option value="">Selecione...</option>
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                          {i.sku ? ` (${i.sku})` : ""}
                          {i.saldo_disponivel !== undefined
                            ? ` — ${Number(i.saldo_disponivel).toFixed(2)}${i.unidade ?? "g"} disponível`
                            : ""}
                        </option>
                      ))}
                    </select>
                    {insumos.length === 0 && (
                      <p className="text-[12px] mt-1.5" style={{ color: "#B45309" }}>
                        {tipoId === TIPO_RETORNO
                          ? "Nenhum insumo de metal cadastrado."
                          : isOutros
                            ? "Nenhum outro insumo com saldo disponível no Almoxarifado Central."
                            : "Nenhum insumo com saldo disponível no Almoxarifado Central."}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Peso / Quantidade */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: "#6B7280" }}
                >
                  {isPedra ? "Quantidade (unidades)" : "Peso (gramas)"}
                </label>
                <input
                  type="number"
                  step={isPedra ? "1" : "0.001"}
                  min={isPedra ? "1" : "0.001"}
                  value={qtd}
                  onChange={(e) => {
                    setQtd(e.target.value);
                    setError("");
                  }}
                  placeholder={isPedra ? "0" : "0.000"}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
                  style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                />
              </div>

              {/* Peso calculado (só para pedra) */}
              {isPedra && !!insumoId && !!qtd && pesoPedraUnitario !== null && (
                <div
                  className="rounded-lg px-3 py-2.5 text-[12px]"
                  style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
                >
                  <span style={{ color: "#6B7280" }}>Peso total: </span>
                  <span className="font-mono font-semibold" style={{ color: C.esmeralda }}>
                    {Math.round(parseFloat(qtd) || 0)} × {pesoPedraUnitario.toFixed(4)}g
                    {" = "}
                    {formatPeso((parseFloat(qtd) || 0) * pesoPedraUnitario)}g
                  </span>
                </div>
              )}

              {/* Foto da Balança + Validação IA */}
              <div className="space-y-3">
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#6B7280" }}
                >
                  Foto da Balança{" "}
                  <span style={{ color: "#EF4444" }}>*</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFoto(file);
                    e.target.value = "";
                  }}
                />

                {!fotoPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors"
                    style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}
                  >
                    <Camera size={28} style={{ color: C.sage }} />
                    <span className="text-[13px]">Tirar foto da balança</span>
                    <span className="text-[11px]">Câmera ou galeria</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden" style={{ height: 180 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fotoPreview}
                        alt="Foto balança"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                        style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                      >
                        <RefreshCw size={11} />
                        Trocar foto
                      </button>
                    </div>

                    {validando && (
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                        style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                      >
                        <Loader2 size={14} className="animate-spin shrink-0" />
                        Analisando peso na balança...
                      </div>
                    )}

                    {!validando && validacaoIA && (
                      <div
                        className="px-3 py-2.5 rounded-lg text-[13px]"
                        style={
                          validacaoIA.match
                            ? { backgroundColor: "#ECFDF5", color: "#065F46" }
                            : { backgroundColor: "#FEF2F2", color: "#991B1B" }
                        }
                      >
                        <div className="flex items-center gap-2 font-semibold mb-0.5">
                          {validacaoIA.match ? (
                            <>
                              <CheckCircle size={14} className="shrink-0" />
                              {validacaoIA.mensagem}
                            </>
                          ) : (
                            <>
                              <AlertCircle size={14} className="shrink-0" />
                              {validacaoIA.mensagem}
                            </>
                          )}
                        </div>
                        <span className="text-[11px] opacity-70">
                          Confiança: {validacaoIA.confianca}
                        </span>
                      </div>
                    )}

                    {!validando && !validacaoIA && fotoFile && (
                      <button
                        type="button"
                        onClick={handleRevalidar}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold border transition-colors"
                        style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                      >
                        <RefreshCw size={13} />
                        Validar com IA
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Info direcional */}
              <div
                className="rounded-lg px-3 py-2.5 text-[12px]"
                style={{ backgroundColor: C.cremeBg, color: "#6B7280" }}
              >
                {tipoId === TIPO_ADITIVO
                  ? `🔩 Aditivo para PCP #${pcpId} · ${depositos.find((d) => d.id === depositoId)?.nome ?? `Depósito ${depositoId}`}`
                  : tipoId === TIPO_RETORNO
                    ? `↩️ ${depositos.find((d) => d.id === depositoId)?.nome ?? `Depósito ${depositoId}`} → Almoxarifado Central`
                    : tipoId === TIPO_ENTRADA_PEDRA
                      ? `💎 Pedras: Almoxarifado Central → ${depositos.find((d) => d.id === depositoId)?.nome ?? `Depósito ${depositoId}`}`
                      : tipoId === TIPO_RETORNO_PEDRA
                        ? `💎 Pedras: ${depositos.find((d) => d.id === depositoId)?.nome ?? `Depósito ${depositoId}`} → Almoxarifado Central`
                        : tipoId === TIPO_OUTROS
                          ? `📦 Almoxarifado Central → ${depositos.find((d) => d.id === depositoId)?.nome ?? `Depósito ${depositoId}`}`
                          : `📥 Almoxarifado Central → ${depositos.find((d) => d.id === depositoSelecionado)?.nome ?? "depósito selecionado"}`}
              </div>
            </>
          )}

          {/* ── 3. OUTROS TIPOS — em breve ── */}
          {tipoId !== "" && !precisaFotoIA && (
            <div
              className="rounded-xl px-4 py-3 text-[13px]"
              style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}
            >
              Campos para este tipo de apontamento serão implementados em breve.
            </div>
          )}

          {/* Erro */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Sucesso */}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle size={14} className="shrink-0" />
              Apontamento registrado com sucesso!
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-[13px] transition-colors"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!podeSalvar}
            title={
              precisaFotoIA && !validacaoIA?.match
                ? "Confirme o peso com a IA antes de salvar"
                : undefined
            }
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {precisaFotoIA && !validacaoIA ? "Enviando foto..." : "Registrando..."}
              </>
            ) : (
              "Registrar Apontamento"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
