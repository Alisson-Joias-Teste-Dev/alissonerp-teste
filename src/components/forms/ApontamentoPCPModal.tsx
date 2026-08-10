"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { formatPeso, gramasToCt } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
// REGRA DE NEGOCIO: validacao de foto+IA e busca de pedra centralizadas em
// _shared (pente-fino 10/08/2026, etapa 4) — nao duplicar aqui.
import { useValidacaoIABalanca } from "./_shared/useValidacaoIABalanca";
import { FotoBalancaCampo } from "./_shared/FotoBalancaCampo";
import { InsumoPedraAutocomplete } from "./_shared/InsumoPedraAutocomplete";
import type { Insumo } from "./_shared/types";

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
  /** true quando pcp.deposito_id já foi atribuído — trava o depósito no tipo 2 (Entrada de Metal) */
  depositoAtribuido?: boolean;
  onSuccess?: () => void;
}

interface TipoApontamento {
  id: number;
  descricao: string;
  scope: string;
}

interface Deposito {
  id: number;
  nome: string;
}

interface Setor {
  id: number;
  nome: string;
}

export default function ApontamentoPCPModal({
  isOpen,
  onClose,
  pcpId,
  ordemId,
  depositoId,
  setorId,
  depositoAtribuido = false,
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
  const [pesoGPedra, setPesoGPedra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Peso unitário da pedra selecionada (para calcular peso total)
  const [pesoPedraUnitario, setPesoPedraUnitario] = useState<number | null>(null);

  // Autocomplete de pedras
  const [buscaPedra, setBuscaPedra] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);

  const precisaFotoIA = tipoId === TIPO_FOTO_IA || tipoId === TIPO_ADITIVO || tipoId === TIPO_RETORNO || tipoId === TIPO_ENTRADA_PEDRA || tipoId === TIPO_RETORNO_PEDRA || tipoId === TIPO_OUTROS;
  const isPedra  = TIPO_PEDRA.includes(tipoId as number);
  const isOutros = tipoId === TIPO_OUTROS;
  const pesoCt = pesoGPedra && !isNaN(parseFloat(pesoGPedra)) ? gramasToCt(parseFloat(pesoGPedra)) : 0;

  const { fotoFile, fotoPreview, validacaoIA, validando, handleFoto, handleRevalidar, resetFoto } =
    useValidacaoIABalanca({ isPedra, qtd, pesoGPedra, pesoPedraUnitario });

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

  // ─── Reset ─────────────────────────────────────────────────────────────────
  function resetForm() {
    setDepositoSelecionado(depositoId);
    setSetorSelecionado(setorId ?? "");
    setTipoId("");
    setInsumoId("");
    setQtd("");
    setPesoGPedra("");
    setPesoPedraUnitario(null);
    setBuscaPedra("");
    setDropdownAberto(false);
    setError("");
    setSuccess(false);
    resetFoto();
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
    let qtdNum: number;
    if (isPedra) {
      const g = parseFloat(pesoGPedra);
      if (isNaN(g) || g <= 0) {
        setError("Peso das pedras deve ser maior que zero.");
        return;
      }
      qtdNum = g; // será enviado como peso_g_pedra
    } else {
      qtdNum = parseFloat(qtd);
      if (isNaN(qtdNum) || qtdNum <= 0) {
        setError("Quantidade deve ser maior que zero.");
        return;
      }
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

    const bodyPedra = isPedra
      ? { peso_g_pedra: qtdNum, peso_ct: gramasToCt(qtdNum) }
      : { qtd: qtdNum };

    const res = await fetch("/api/pcp/apontamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_apontamento_id: tipoId,
        deposito_id: usaDepositoDoCard ? depositoId : depositoSelecionado,
        setor_id: usaDepositoDoCard ? setorId : (setorSelecionado || null),
        insumo_id: TIPO_SEM_INSUMO.includes(tipoId as number) ? null : insumoId,
        pcp_id: pcpId,
        ...bodyPedra,
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
  // usaDepositoDoCard: tipos que usam o depósito do card (read-only)
  // + tipo 2 quando depositoAtribuido=true (operador já definido no PCP)
  const usaDepositoDoCard = tipoId === TIPO_ADITIVO || tipoId === TIPO_RETORNO || tipoId === TIPO_ENTRADA_PEDRA || tipoId === TIPO_RETORNO_PEDRA || tipoId === TIPO_OUTROS
    || (tipoId === TIPO_FOTO_IA && depositoAtribuido);
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
                setPesoGPedra("");
                setBuscaPedra("");
                setDropdownAberto(false);
                setPesoPedraUnitario(null);
                resetFoto();
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
                  <InsumoPedraAutocomplete
                    insumos={insumos}
                    insumoId={insumoId}
                    busca={buscaPedra}
                    onBuscaChange={setBuscaPedra}
                    dropdownAberto={dropdownAberto}
                    onDropdownChange={setDropdownAberto}
                    comHoverEffect
                    onLimpar={() => { setInsumoId(""); setPesoPedraUnitario(null); }}
                    onSelecionar={(i) => {
                      setInsumoId(i.id); setPesoPedraUnitario(i.peso_pedra ?? null);
                      setBuscaPedra(`${i.nome}${i.sku ? ` (${i.sku})` : ""}`);
                      setDropdownAberto(false); setError("");
                    }}
                  />
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
              {isPedra ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Peso (g)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={pesoGPedra}
                      onChange={(e) => { setPesoGPedra(e.target.value); setError(""); }}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Ex: 0.40"
                      required
                    />
                    {pesoGPedra && parseFloat(pesoGPedra) > 0 && (
                      <span className="text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-2 rounded-md whitespace-nowrap">
                        = {gramasToCt(parseFloat(pesoGPedra)).toFixed(4)} ct
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "#6B7280" }}
                  >
                    Peso (gramas)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={qtd}
                    onChange={(e) => {
                      setQtd(e.target.value);
                      setError("");
                    }}
                    placeholder="0.000"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
                    style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                  />
                </div>
              )}

              <FotoBalancaCampo
                fotoPreview={fotoPreview}
                validando={validando}
                validacaoIA={validacaoIA}
                onFotoChange={handleFoto}
                onRevalidar={handleRevalidar}
                subtitleBotao="Câmera ou galeria"
                textoAnalisando="Analisando peso na balança..."
              />

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
