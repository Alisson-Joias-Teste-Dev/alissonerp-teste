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
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// Distribuição usa tipo 9 como ocorrência (sem insumo)
const TIPO_SEM_INSUMO = [9];
// Metal (categoria 1): Aditivo(1), Entrada Metal(2), Retorno Metal(5)
const TIPO_METAL = [1, 2, 5];
// Pedra (categoria 2): Entrada Pedra(3), Retorno Pedra(6)
const TIPO_PEDRA = [3, 6];
// Tipos que exigem foto + validação IA
const TIPO_PRECISA_FOTO = [1, 2, 3, 5, 6];

interface ApontamentoDistModalProps {
  isOpen: boolean;
  onClose: () => void;
  distribuicaoId: number;
  depositoId: number;
  setorId: number | null;
  depositoNome: string;
  setorNome: string | null;
  onSuccess?: () => void;
}

interface TipoApontamento { id: number; descricao: string; }

export default function ApontamentoDistModal({
  isOpen, onClose,
  distribuicaoId, depositoId, setorId, depositoNome, setorNome,
  onSuccess,
}: ApontamentoDistModalProps) {
  const [tipos, setTipos] = useState<TipoApontamento[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [tipoId, setTipoId] = useState<number | "">("");
  const [insumoId, setInsumoId] = useState<number | "">("");
  const [qtd, setQtd] = useState("");
  const [pesoGPedra, setPesoGPedra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [pesoPedraUnitario, setPesoPedraUnitario] = useState<number | null>(null);
  const [buscaPedra, setBuscaPedra] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);

  const precisaFoto = TIPO_PRECISA_FOTO.includes(tipoId as number);
  const isPedra = TIPO_PEDRA.includes(tipoId as number);

  const { fotoFile, fotoPreview, validacaoIA, validando, handleFoto, handleRevalidar, resetFoto } =
    useValidacaoIABalanca({ isPedra, qtd, pesoGPedra, pesoPedraUnitario });

  // Carregar tipos ao abrir (scope distribuicao ou ambos)
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/pcp/tipos-apontamento")
      .then((r) => r.json())
      .then((data: TipoApontamento[]) =>
        setTipos((data ?? []).filter((t) =>
          // Tipos com scope 'ambos' (1,2,3,5,6) + scope 'distribuicao' (8,9)
          // A API retorna todos; filtramos excluindo scope 'pcp' (4,7)
          ![4, 7].includes(t.id)
        ))
      );
  }, [isOpen]);

  // Carregar insumos conforme o tipo
  useEffect(() => {
    if (!tipoId) { setInsumos([]); setInsumoId(""); return; }
    if (TIPO_SEM_INSUMO.includes(tipoId as number)) { setInsumos([]); setInsumoId(""); return; }

    if (tipoId === 1 || tipoId === 2) {
      // Aditivo/Entrada Metal: só Almoxarifado (Dep1), Metal, com saldo > 0
      fetch("/api/pcp/insumos-disponiveis?deposito_id=1&categoria_id=1")
        .then((r) => r.json()).then((d) => { setInsumos(d ?? []); setInsumoId(""); });
      return;
    }
    if (tipoId === 5) {
      // Retorno Metal: todos os insumos Metal, SEM filtro estoque
      fetch("/api/pcp/insumos?categoria_id=1")
        .then((r) => r.json()).then((d) => { setInsumos(d ?? []); setInsumoId(""); });
      return;
    }
    if (tipoId === 3) {
      // Entrada Pedra: Almoxarifado, categoria 2, com saldo > 0
      fetch("/api/pcp/insumos-disponiveis?deposito_id=1&categoria_id=2")
        .then((r) => r.json()).then((d) => { setInsumos(d ?? []); setInsumoId(""); setPesoPedraUnitario(null); });
      return;
    }
    if (tipoId === 6) {
      // Retorno Pedra: TODOS insumos pedra, SEM filtro estoque
      fetch("/api/pcp/insumos?categoria_id=2")
        .then((r) => r.json()).then((d) => { setInsumos(d ?? []); setInsumoId(""); setPesoPedraUnitario(null); });
      return;
    }
    // Tipo 8 (outros insumos)
    fetch("/api/pcp/insumos")
      .then((r) => r.json()).then((d) => { setInsumos(d ?? []); setInsumoId(""); });
  }, [tipoId]);

  function resetForm() {
    setTipoId(""); setInsumoId(""); setQtd(""); setPesoGPedra("");
    setPesoPedraUnitario(null); setBuscaPedra(""); setDropdownAberto(false);
    setError(""); setSuccess(false);
    resetFoto();
  }

  function handleClose() { resetForm(); onClose(); }

  async function handleSubmit() {
    setError("");
    if (!tipoId) { setError("Selecione o tipo de apontamento."); return; }
    if (!TIPO_SEM_INSUMO.includes(tipoId as number) && tipoId !== 8 && !insumoId) {
      setError("Selecione o insumo."); return;
    }
    let qtdNum: number;
    if (isPedra) {
      const g = parseFloat(pesoGPedra);
      if (isNaN(g) || g <= 0) { setError("Peso das pedras deve ser maior que zero."); return; }
      qtdNum = g;
    } else {
      qtdNum = parseFloat(qtd);
      if (isNaN(qtdNum) || qtdNum <= 0) { setError("Quantidade deve ser maior que zero."); return; }
    }

    if (precisaFoto) {
      if (!fotoFile) { setError("Foto da balança é obrigatória."); return; }
      if (!validacaoIA?.match) { setError("O peso precisa ser confirmado pela IA antes de salvar."); return; }
    }

    setLoading(true);

    // Upload da foto
    let fotoPath: string | null = null;
    if (precisaFoto && fotoFile) {
      const supabase = createClient();
      const ext = fotoFile.name.split(".").pop() ?? "jpg";
      const path = `apontamentos/dist${distribuicaoId}-${Date.now()}.${ext}`;
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

    const { data: { user } } = await createClient().auth.getUser();

    const bodyPedra = isPedra
      ? { peso_g_pedra: qtdNum, peso_ct: gramasToCt(qtdNum) }
      : { qtd: qtdNum };

    const res = await fetch("/api/distribuicao/apontamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distribuicao_id: distribuicaoId,
        tipo_apontamento_id: tipoId,
        deposito_id: depositoId,
        setor_id: setorId,
        insumo_id: TIPO_SEM_INSUMO.includes(tipoId as number) ? null : (insumoId || null),
        ...bodyPedra,
        foto_balanca: fotoPath,
        user_id: user?.id ?? null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao registrar apontamento.");
      return;
    }

    setSuccess(true);
    setTimeout(() => { resetForm(); onSuccess?.(); onClose(); }, 1500);
  }

  if (!isOpen) return null;

  const fotoOk = !precisaFoto || validacaoIA?.match === true;
  const podeSalvar = !loading && !success && !!tipoId && fotoOk;

  // Label direcional para cada tipo
  function labelDirecional() {
    if (tipoId === 1) return `🔩 Aditivo: Almoxarifado Central → ${depositoNome}`;
    if (tipoId === 2) return `📥 Entrada: Almoxarifado Central → ${depositoNome}`;
    if (tipoId === 3) return `💎 Pedras: Almoxarifado Central → ${depositoNome}`;
    if (tipoId === 5) return `↩️ Retorno: ${depositoNome} → Almoxarifado Central`;
    if (tipoId === 6) return `💎 Pedras: ${depositoNome} → Almoxarifado Central`;
    return "";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Novo Apontamento</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Dist #{distribuicaoId} · {depositoNome}{setorNome ? ` · ${setorNome}` : ""}
            </p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Tipo de Apontamento <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <select
              value={tipoId}
              onChange={(e) => {
                setTipoId(e.target.value ? parseInt(e.target.value) : "");
                setInsumoId(""); setQtd(""); setPesoGPedra(""); setBuscaPedra(""); setDropdownAberto(false);
                setPesoPedraUnitario(null); resetFoto();
                setError("");
              }}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            >
              <option value="">Selecione...</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.descricao}</option>)}
            </select>
          </div>

          {/* Campos para tipos com foto + IA */}
          {precisaFoto && (
            <>
              {/* Depósito — sempre read-only na distribuição */}
              <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>
                  {(tipoId === 5 || tipoId === 6) ? "Devolvendo de" : "Entregando em"}
                </p>
                <p className="text-sm font-medium" style={{ color: "#111827" }}>
                  {depositoNome}{setorNome ? ` · ${setorNome}` : ""}
                  {(tipoId === 5 || tipoId === 6) && <span style={{ color: "#9CA3AF" }}> → Almoxarifado Central</span>}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>Definido pela distribuição — não editável</p>
              </div>

              {/* Insumo */}
              {!TIPO_SEM_INSUMO.includes(tipoId as number) && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                    {isPedra ? "Insumo (Pedra)" : "Insumo (Metal)"} <span style={{ color: "#EF4444" }}>*</span>
                  </label>

                  {isPedra ? (
                    <InsumoPedraAutocomplete
                      insumos={insumos}
                      insumoId={insumoId}
                      busca={buscaPedra}
                      onBuscaChange={setBuscaPedra}
                      dropdownAberto={dropdownAberto}
                      onDropdownChange={setDropdownAberto}
                      onLimpar={() => { setInsumoId(""); setPesoPedraUnitario(null); }}
                      onSelecionar={(i) => {
                        setInsumoId(i.id); setPesoPedraUnitario(i.peso_pedra ?? null);
                        setBuscaPedra(`${i.nome}${i.sku ? ` (${i.sku})` : ""}`);
                        setDropdownAberto(false); setError("");
                      }}
                    />
                  ) : (
                    /* Select simples para metal */
                    <select value={insumoId} onChange={(e) => { setInsumoId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
                      className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none" style={{ borderColor: C.cremeBorder }}>
                      <option value="">Selecione...</option>
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}{i.sku ? ` (${i.sku})` : ""}
                          {i.saldo_disponivel !== undefined ? ` — ${Number(i.saldo_disponivel).toFixed(2)}${i.unidade ?? "g"} disponível` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Quantidade / Peso */}
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                    Peso (gramas)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={qtd}
                    onChange={(e) => { setQtd(e.target.value); setError(""); }}
                    placeholder="0.000"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
              )}

              <FotoBalancaCampo
                fotoPreview={fotoPreview}
                validando={validando}
                validacaoIA={validacaoIA}
                onFotoChange={handleFoto}
                onRevalidar={handleRevalidar}
              />

              {/* Info direcional */}
              {labelDirecional() && (
                <div className="rounded-lg px-3 py-2.5 text-[12px]" style={{ backgroundColor: C.cremeBg, color: "#6B7280" }}>
                  {labelDirecional()}
                </div>
              )}
            </>
          )}

          {/* Tipo 8 — outros insumos (sem foto IA) */}
          {tipoId === 8 && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Insumo <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <select value={insumoId} onChange={(e) => { setInsumoId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none" style={{ borderColor: C.cremeBorder }}>
                  <option value="">Selecione...</option>
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.sku ? ` (${i.sku})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Quantidade</label>
                <input type="number" step="0.001" min="0.001" value={qtd}
                  onChange={(e) => { setQtd(e.target.value); setError(""); }}
                  placeholder="0.000" className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none" style={{ borderColor: C.cremeBorder }} />
              </div>
            </div>
          )}

          {/* Tipo 9 — ocorrência (sem insumo, sem foto) */}
          {tipoId === 9 && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Observação</label>
              <input type="number" step="1" min="1" value={qtd}
                onChange={(e) => { setQtd(e.target.value); setError(""); }}
                placeholder="1" className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>Quantidade de ocorrências registradas.</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Apontamento registrado!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white" style={{ borderColor: C.cremeBorder }}>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={!podeSalvar}
            title={precisaFoto && !validacaoIA?.match ? "Confirme o peso com a IA antes de salvar" : undefined}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {loading ? <><Loader2 size={14} className="animate-spin" />Registrando...</> : "Registrar Apontamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
