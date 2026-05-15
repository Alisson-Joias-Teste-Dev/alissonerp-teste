"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Loader2, CheckCircle, AlertCircle, ArrowRight, Package,
  Camera, Check, AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca:  number | null;
  confianca:     string;
  match:         boolean;
  mensagem:      string;
}

interface TransferenciaPCPModalProps {
  isOpen: boolean;
  onClose: () => void;
  pcpId: number;
  ordemId: number;
  /** Depósito atual da ordem (origem fallback antes do fetch) */
  depositoId: number;
  depositoNome?: string;
  setorId?: number | null;
  onSuccess?: () => void;
}

interface Deposito { id: number; nome: string; }
interface Setor    { id: number; nome: string; }
interface OperadorService { id: number; nome: string; qtd_servicos?: number; }
type ModoTransf = "interna" | "service";

interface InsumoItem {
  insumo_id:          number;
  nome:               string;
  categoria_id:       number;
  quantidade:         number;
  quantidadeOriginal: number;
  unidade:            string;
  peso_pedra?:        number;
  origem:             "distribuicao" | "pcp";
  selecionado:        boolean;
}

export default function TransferenciaPCPModal({
  isOpen,
  onClose,
  pcpId,
  ordemId,
  depositoId,
  depositoNome,
  onSuccess,
}: TransferenciaPCPModalProps) {
  const [todosDepositos, setTodosDepositos] = useState<Deposito[]>([]);
  const [setores, setSetores]               = useState<Setor[]>([]);
  const [destDepositoId, setDestDepositoId] = useState<number | "">("");
  const [destSetorId, setDestSetorId]       = useState<number | "">("");
  const [obs, setObs]                       = useState("");
  const [modoTransf, setModoTransf]         = useState<ModoTransf>("interna");
  const [operadoresService, setOperadoresService] = useState<OperadorService[]>([]);
  const [loadingOps, setLoadingOps]         = useState(false);
  const [destServiceDepId, setDestServiceDepId] = useState<number | "">("");
  const [transportadores, setTransportadores] = useState<{id: string; nome: string}[]>([]);
  const [transportadorId, setTransportadorId] = useState<string>("");

  // Origem resolvida da API (pode ser Almox se veio da distribuição)
  const [origemId, setOrigemId]     = useState<number>(depositoId);
  const [origemNome, setOrigemNome] = useState<string>(depositoNome ?? "");
  const [veioDaDist, setVeioDaDist] = useState(false);

  // Insumos pré-preenchidos
  const [insumos, setInsumos]               = useState<InsumoItem[]>([]);
  const [loadingInsumos, setLoadingInsumos] = useState(false);

  // Foto + IA
  const [fotoFile, setFotoFile]       = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacaoIA, setValidacaoIA] = useState<ValidacaoIA | null>(null);
  const [validando, setValidando]     = useState(false);
  const fotoInputRef                  = useRef<HTMLInputElement>(null);

  const [loading, setLoading]             = useState(false);
  const [loadingSetores, setLoadingSetores] = useState(false);
  const [error, setError]                 = useState("");
  const [success, setSuccess]             = useState(false);

  // Metal selecionado = foto + IA obrigatória
  const temMetalSelecionado = insumos.some(
    (i) => i.categoria_id === 1 && i.selecionado && i.quantidade > 0,
  );
  const fotoConfirmada = !temMetalSelecionado || validacaoIA?.match === true;
  const podeConfirmar  = modoTransf === "interna"
    ? (!!destDepositoId && fotoConfirmada && !loading && !success)
    : (!!destServiceDepId && !!transportadorId && !loading && !success);

  // Depósitos disponíveis: exclui Almox (1) e a origem
  const depositos = todosDepositos.filter((d) => d.id !== 1 && d.id !== origemId);

  // --- Carregar dados ao abrir ---
  useEffect(() => {
    if (!isOpen) return;

    // Depósitos
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((data: Deposito[]) => {
        setTodosDepositos(data);
        if (!origemNome) {
          const found = data.find((d) => d.id === depositoId);
          if (found) setOrigemNome(found.nome);
        }
      })
      .catch(() => {});

    // Transportadores
    fetch("/api/usuarios/transportadores", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: unknown) => { if (Array.isArray(data)) setTransportadores(data); })
      .catch(() => {});

    // Operadores service
    setLoadingOps(true);
    fetch("/api/service/operadores")
      .then((r) => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data : [];
        setOperadoresService(list as OperadorService[]);
      })
      .catch(() => {})
      .finally(() => setLoadingOps(false));

    // Insumos pré-preenchidos
    setLoadingInsumos(true);
    fetch(`/api/pcp/${pcpId}/insumos-transferencia`)
      .then((r) => r.json())
      .then((data: {
        insumos: Omit<InsumoItem, "quantidadeOriginal" | "selecionado">[];
        veio_da_distribuicao: boolean;
        deposito_origem_id: number;
        deposito_origem_nome: string | null;
      }) => {
        setVeioDaDist(data.veio_da_distribuicao ?? false);
        setOrigemId(data.deposito_origem_id ?? depositoId);
        if (data.deposito_origem_nome) setOrigemNome(data.deposito_origem_nome);
        setInsumos(
          (data.insumos ?? []).map((i) => ({
            ...i,
            quantidadeOriginal: i.quantidade,
            selecionado: true,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setLoadingInsumos(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pcpId]);

  // Carregar setores quando destino muda
  useEffect(() => {
    setDestSetorId("");
    setSetores([]);
    if (!destDepositoId) return;
    setLoadingSetores(true);
    fetch(`/api/pcp/setores?deposito_id=${destDepositoId}`)
      .then((r) => r.json())
      .then((data: Setor[]) => setSetores(data))
      .catch(() => {})
      .finally(() => setLoadingSetores(false));
  }, [destDepositoId]);

  // --- Foto + IA ---
  const validarComIA = useCallback(async (file: File, peso: number) => {
    setValidando(true);
    setValidacaoIA(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("peso", String(peso));
      const res    = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
      const result = await res.json() as ValidacaoIA;
      setValidacaoIA(result);
    } catch {
      setValidacaoIA({
        peso_digitado: peso,
        peso_balanca:  null,
        confianca:     "nenhuma",
        match:         false,
        mensagem:      "Erro ao validar com IA",
      });
    } finally {
      setValidando(false);
    }
  }, []);

  const handleFoto = useCallback(async (file: File) => {
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    setValidacaoIA(null);
    const metalInsumo = insumos.find((i) => i.categoria_id === 1 && i.selecionado);
    if (metalInsumo && metalInsumo.quantidade > 0) {
      await validarComIA(file, metalInsumo.quantidade);
    }
  }, [insumos, validarComIA]);

  // Re-validar quando quantidade do ouro muda (e já há foto)
  const revalidarSeNecessario = useCallback(async () => {
    if (!fotoFile) return;
    const metalInsumo = insumos.find((i) => i.categoria_id === 1 && i.selecionado);
    if (metalInsumo && metalInsumo.quantidade > 0) {
      await validarComIA(fotoFile, metalInsumo.quantidade);
    }
  }, [fotoFile, insumos, validarComIA]);

  // ---

  function resetForm() {
    setDestDepositoId("");
    setDestSetorId("");
    setObs("");
    setModoTransf("interna");
    setDestServiceDepId("");
    setError("");
    setSuccess(false);
    setSetores([]);
    setTodosDepositos([]);
    setInsumos([]);
    setOrigemId(depositoId);
    setOrigemNome(depositoNome ?? "");
    setVeioDaDist(false);
    setFotoFile(null);
    setFotoPreview(null);
    setValidacaoIA(null);
    setValidando(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function updateQuantidade(insumoId: number, valor: string) {
    const num = parseFloat(valor.replace(",", "."));
    setInsumos((prev) =>
      prev.map((i) =>
        i.insumo_id === insumoId
          ? { ...i, quantidade: isNaN(num) ? 0 : num }
          : i,
      ),
    );
    // Invalida validação IA anterior se mudou o ouro
    if (insumoId === 1) setValidacaoIA(null);
  }

  function toggleSelecionado(insumoId: number) {
    setInsumos((prev) =>
      prev.map((i) =>
        i.insumo_id === insumoId ? { ...i, selecionado: !i.selecionado } : i,
      ),
    );
    if (insumoId === 1) setValidacaoIA(null);
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    try {
      // ── Modo Service ──────────────────────────────────────────────────────
      if (modoTransf === "service") {
        if (!destServiceDepId) { setError("Selecione o operador service."); setLoading(false); return; }
        if (!transportadorId) { setError("Selecione quem vai levar a peça."); setLoading(false); return; }
        const res = await fetch("/api/pcp/transferir-service", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pcp_id: pcpId,
            deposito_destino_id: destServiceDepId,
            observacao: obs.trim() || null,
            motoboy_id: transportadorId,
          }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok) { setError(json.error ?? "Erro ao registrar transferência service"); setLoading(false); return; }
        setSuccess(true);
        setTimeout(() => { resetForm(); onSuccess?.(); onClose(); }, 1500);
        return;
      }

      // ── Modo Interna ──────────────────────────────────────────────────────
      if (!destDepositoId) {
        setError("Selecione o depósito de destino.");
        setLoading(false);
        return;
      }
      if (temMetalSelecionado && !validacaoIA?.match) {
        setError("Foto da balança obrigatória para transferência de metal. Tire a foto e aguarde a validação IA.");
        setLoading(false);
        return;
      }

      // Upload foto para Supabase Storage
      let fotoCaminho: string | null = null;
      if (fotoFile) {
        const supabase = createClient();
        const ext      = fotoFile.name.split(".").pop() ?? "jpg";
        const path     = `transferencias/${pcpId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("apontamento-fotos")
          .upload(path, fotoFile, { upsert: false });
        if (uploadErr) {
          setError("Erro ao enviar foto. Tente novamente.");
          setLoading(false);
          return;
        }
        fotoCaminho = path;
      }

      const insumosConfirmados = insumos
        .filter((i) => i.selecionado && i.quantidade > 0)
        .map((i) => ({ insumo_id: i.insumo_id, quantidade: i.quantidade }));

      const res = await fetch("/api/pcp/transferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pcp_id:              pcpId,
          destino_deposito_id: destDepositoId,
          setor_id:            destSetorId || null,
          insumos:             insumosConfirmados,
          obs:                 obs.trim() || null,
          foto_balanca:        fotoCaminho,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Erro ao registrar transferência");
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => { resetForm(); onSuccess?.(); onClose(); }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")
        ? "Erro de conexão — verifique sua internet e tente novamente"
        : "Erro ao transferir ordem — tente novamente ou contate o suporte");
      console.error("Transferência falhou:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const destNome   = depositos.find((d) => d.id === destDepositoId)?.nome;
  const temInsumos = insumos.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Transferir Ordem
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              PCP #{pcpId} · Ordem #{ordemId}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body com scroll */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Toggle Interna / Service */}
          <div className="flex gap-2">
            {(["interna", "service"] as ModoTransf[]).map((m) => (
              <button
                key={m}
                onClick={() => { setModoTransf(m); setDestDepositoId(""); setDestServiceDepId(""); setError(""); }}
                className="flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors"
                style={{
                  backgroundColor: modoTransf === m ? C.esmeralda : C.cremeBg,
                  color: modoTransf === m ? C.creme : "#6B7280",
                  border: `1px solid ${modoTransf === m ? C.esmeralda : C.cremeBorder}`,
                }}
              >
                {m === "interna" ? "Interna" : "Service"}
              </button>
            ))}
          </div>

          {/* Origem → Destino */}
          <div
            className="flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
          >
            <div className="min-w-[90px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                Origem
              </p>
              <p className="font-semibold text-sm mt-0.5" style={{ color: C.esmeralda }}>
                {origemNome || `Depósito ${origemId}`}
              </p>
              {veioDaDist && (
                <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                  ouro já no pote
                </p>
              )}
            </div>
            <ArrowRight size={18} className="flex-shrink-0 mx-1" style={{ color: "#D1D5DB" }} />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                Destino
              </p>
              <p className="font-semibold text-sm mt-0.5" style={{ color: destNome ? C.esmeralda : "#D1D5DB" }}>
                {destNome ?? "Selecione..."}
              </p>
              {destSetorId && (
                <p className="text-[11px]" style={{ color: "#6B7280" }}>
                  {setores.find((s) => s.id === destSetorId)?.nome}
                </p>
              )}
            </div>
          </div>

          {/* Service: seletor de operadores */}
          {modoTransf === "service" && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Operador Service
                </label>
                {loadingOps ? (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={12} className="animate-spin" /> Carregando...
                  </div>
                ) : operadoresService.length === 0 ? (
                  <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Nenhum operador service cadastrado.</p>
                ) : (
                  <select
                    value={destServiceDepId}
                    onChange={(e) => { setDestServiceDepId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                  >
                    <option value="">Selecione o operador...</option>
                    {operadoresService.map((op) => (
                      <option key={op.id} value={op.id}>{op.nome}{op.qtd_servicos ? ` (${op.qtd_servicos} em serviço)` : ""}</option>
                    ))}
                  </select>
                )}
              </div>
              {/* Transportador */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Quem vai levar? <span style={{ color: "#EF4444" }}>*</span>
                </label>
                {transportadores.length === 0 ? (
                  <p className="text-[12px]" style={{ color: "#9CA3AF" }}>
                    Nenhum transportador habilitado. Habilite em Configurações → Usuários.
                  </p>
                ) : (
                  <select
                    value={transportadorId}
                    onChange={(e) => { setTransportadorId(e.target.value); setError(""); }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                  >
                    <option value="">Selecione o transportador...</option>
                    {transportadores.map((t) => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                )}
              </div>

              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12px]"
                style={{ backgroundColor: "#DBEAFE", border: "1px solid #93C5FD", color: "#1E40AF" }}
              >
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                Protocolo de ida será criado automaticamente.
              </div>
            </div>
          )}

          {/* Interna: Depósito destino */}
          {modoTransf === "interna" && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Deposito de Destino
            </label>
            <select
              value={destDepositoId}
              onChange={(e) => {
                setDestDepositoId(e.target.value ? parseInt(e.target.value) : "");
                setError("");
              }}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
            >
              <option value="">Selecione...</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>
          )}

          {/* Setor destino (só interna) */}
          {modoTransf === "interna" && destDepositoId && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Setor <span style={{ color: "#D1D5DB" }}>(opcional)</span>
              </label>
              {loadingSetores ? (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: "#9CA3AF" }}>
                  <Loader2 size={12} className="animate-spin" /> Carregando setores...
                </div>
              ) : setores.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#9CA3AF" }}>
                  Nenhum setor cadastrado para este depósito.
                </p>
              ) : (
                <select
                  value={destSetorId}
                  onChange={(e) => setDestSetorId(e.target.value ? parseInt(e.target.value) : "")}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                >
                  <option value="">Sem setor</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Insumos a transferir (só interna) */}
          {modoTransf === "interna" && <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                Insumos a Transferir
              </label>
              {veioDaDist && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEF9C3", color: "#854D0E" }}>
                  pré-preenchido da distribuição
                </span>
              )}
            </div>

            {loadingInsumos ? (
              <div className="flex items-center gap-2 py-3 text-[12px]" style={{ color: "#9CA3AF" }}>
                <Loader2 size={12} className="animate-spin" /> Carregando insumos...
              </div>
            ) : !temInsumos ? (
              <div
                className="flex items-center gap-2 px-3 py-3 rounded-lg text-[12px]"
                style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}`, color: "#6B7280" }}
              >
                <Package size={14} className="shrink-0" />
                Nenhum insumo registrado — apenas a localização será atualizada.
              </div>
            ) : (
              <div className="space-y-2">
                {insumos.map((insumo) => (
                  <div
                    key={insumo.insumo_id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{
                      backgroundColor: insumo.selecionado ? C.cremeBg : "#F9FAFB",
                      border: `1px solid ${insumo.selecionado ? C.cremeBorder : "#E5E7EB"}`,
                      opacity: insumo.selecionado ? 1 : 0.6,
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={insumo.selecionado}
                      onChange={() => toggleSelecionado(insumo.insumo_id)}
                      className="w-4 h-4 flex-shrink-0 cursor-pointer accent-emerald-700"
                    />

                    {/* Nome */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "#111827" }}>
                        {insumo.nome}
                      </p>
                      {insumo.quantidadeOriginal !== insumo.quantidade && (
                        <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                          original: {insumo.categoria_id === 1
                            ? Number(insumo.quantidadeOriginal).toFixed(2)
                            : Math.round(insumo.quantidadeOriginal)
                          } {insumo.unidade}
                        </p>
                      )}
                    </div>

                    {/* Campo quantidade */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input
                        type="number"
                        value={insumo.quantidade}
                        onChange={(e) => updateQuantidade(insumo.insumo_id, e.target.value)}
                        onBlur={() => { if (insumo.insumo_id === 1) revalidarSeNecessario(); }}
                        disabled={!insumo.selecionado}
                        step={insumo.categoria_id === 1 ? "0.001" : "1"}
                        min="0"
                        className="w-20 px-2 py-1 rounded border text-right text-[13px] focus:outline-none disabled:bg-gray-50"
                        style={{ borderColor: C.cremeBorder }}
                      />
                      <span className="text-[11px] w-5" style={{ color: "#9CA3AF" }}>
                        {insumo.unidade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {temInsumos && (
              <p className="text-[11px] mt-2" style={{ color: "#9CA3AF" }}>
                Confira os valores. Os insumos selecionados sairão da origem e entrarão no destino.
              </p>
            )}
          </div>}

          {/* Foto da balança — obrigatória quando metal selecionado (só interna) */}
          {modoTransf === "interna" && temMetalSelecionado && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                  Foto da Balança
                </label>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                  obrigatória
                </span>
              </div>

              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFoto(file);
                }}
              />

              {!fotoPreview ? (
                <button
                  type="button"
                  onClick={() => fotoInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed text-[13px] font-medium transition-colors hover:bg-gray-50"
                  style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                >
                  <Camera size={16} />
                  Tirar foto da balança
                </button>
              ) : (
                <div className="space-y-2">
                  {/* Preview */}
                  <div className="relative rounded-lg overflow-hidden" style={{ maxHeight: 160 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fotoPreview}
                      alt="Foto da balança"
                      className="w-full object-cover"
                      style={{ maxHeight: 160 }}
                    />
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
                      style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                    >
                      <Camera size={11} /> Trocar foto
                    </button>
                  </div>

                  {/* Status IA */}
                  {validando ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                      style={{ backgroundColor: "#F9FAFB", color: "#6B7280" }}>
                      <Loader2 size={13} className="animate-spin" />
                      Validando com IA...
                    </div>
                  ) : validacaoIA ? (
                    validacaoIA.match ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                        style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                        <Check size={13} className="flex-shrink-0" />
                        <span>
                          <strong>Peso confirmado:</strong> {validacaoIA.peso_balanca?.toFixed(3)}g
                          <span className="ml-1 font-normal" style={{ color: "#6B7280" }}>
                            (confiança: {validacaoIA.confianca})
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[12px]"
                          style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                          <span>{validacaoIA.mensagem}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { if (fotoFile) {
                            const metal = insumos.find((i) => i.categoria_id === 1 && i.selecionado);
                            if (metal) validarComIA(fotoFile, metal.quantidade);
                          }}}
                          className="text-[11px] px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: "#F3F4F6", color: "#374151" }}
                        >
                          Tentar novamente
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                      style={{ backgroundColor: "#FFFBEB", color: "#92400E" }}>
                      <AlertCircle size={13} className="flex-shrink-0" />
                      Aguardando validação IA...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observação */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Observação <span style={{ color: "#D1D5DB" }}>(opcional)</span>
            </label>
            <input
              type="text"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: Urgente, retrabalho, prioridade..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle size={14} className="shrink-0" />
              {modoTransf === "service"
                ? "Transferência service registrada! Protocolo ida criado."
                : "Transferência registrada! O estoque foi movimentado."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-shrink-0"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!podeConfirmar}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
            title={
              modoTransf === "service" && !destServiceDepId ? "Selecione o operador service" :
              modoTransf === "interna" && !destDepositoId ? "Selecione o destino" :
              modoTransf === "interna" && temMetalSelecionado && !fotoConfirmada ? "Foto da balança obrigatória para metal" :
              undefined
            }
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" />Transferindo...</>
            ) : (
              <><ArrowRight size={14} />Confirmar Transferência</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
