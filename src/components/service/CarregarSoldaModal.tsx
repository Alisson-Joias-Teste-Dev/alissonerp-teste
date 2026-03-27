"use client";

import { useState, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RefreshCw } from "lucide-react";

interface Operador {
  deposito_id: number;
  operador: string;
  saldo_solda: number;
}

interface ValidacaoIA {
  match: boolean;
  mensagem: string;
  confianca: string;
  peso_balanca: number | null;
}

interface Props {
  operadores: Operador[];
  preSelected?: number;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror  = reject;
    reader.readAsDataURL(file);
  });
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function CarregarSoldaModal({ operadores, preSelected, onClose, onSuccess }: Props) {
  const [depositoId,  setDepositoId]  = useState<number>(preSelected ?? operadores[0]?.deposito_id ?? 0);
  const [peso,        setPeso]        = useState("");
  const [fotoBase64,  setFotoBase64]  = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacao,   setValidacao]   = useState<ValidacaoIA | null>(null);
  const [validando,   setValidando]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [erro,        setErro]        = useState("");
  const [ok,          setOk]          = useState(false);
  const [novoSaldo,   setNovoSaldo]   = useState<{ pote: number; operador: number } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const op = operadores.find(o => o.deposito_id === depositoId);

  // ── Foto selecionada ───────────────────────────────────────────────────────
  async function handleFoto(file: File) {
    const b64 = await fileToBase64(file);
    setFotoBase64(b64);
    setFotoPreview(b64);
    setValidacao(null);
    // Auto-validar se peso já está preenchido
    const num = parseFloat(peso);
    if (!isNaN(num) && num > 0) {
      await validarComIA(b64, num);
    }
  }

  // ── Validação IA ───────────────────────────────────────────────────────────
  async function validarComIA(b64: string, pesoNum: number) {
    setValidando(true);
    setValidacao(null);

    const blob = await (async () => {
      const [header, data] = b64.split(",");
      const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    })();

    const fd = new FormData();
    fd.append("file", blob, "foto.jpg");
    fd.append("peso", String(pesoNum));

    const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd }).catch(() => null);
    const result: ValidacaoIA | null = res?.ok ? await res.json().catch(() => null) : null;

    setValidacao(result ?? {
      match: false,
      mensagem: "Erro ao contactar IA — tente novamente.",
      confianca: "nenhuma",
      peso_balanca: null,
    });
    setValidando(false);
  }

  function handlePesoChange(v: string) {
    setPeso(v);
    setValidacao(null); // reset ao mudar peso
  }

  // ── Confirmar ──────────────────────────────────────────────────────────────
  async function confirmar() {
    const pesoNum = parseFloat(peso);
    if (!depositoId)              { setErro("Selecione o operador"); return; }
    if (isNaN(pesoNum) || pesoNum <= 0) { setErro("Informe o peso em gramas (> 0)"); return; }
    if (!fotoBase64)              { setErro("Foto da balança obrigatória"); return; }
    if (!validacao?.match)        { setErro("Valide o peso com a IA antes de confirmar"); return; }

    setLoading(true);
    setErro("");

    const res = await fetch("/api/service/carregar-solda", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deposito_id:   depositoId,
        peso:          pesoNum,
        foto_base64:   fotoBase64,
        operador_nome: op?.operador ?? "operador",
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setErro(data.error ?? "Erro ao registrar");
      return;
    }

    const data = await res.json() as { novo_saldo_pote?: number; novo_saldo_operador?: number };
    setNovoSaldo({ pote: data.novo_saldo_pote ?? 0, operador: data.novo_saldo_operador ?? 0 });
    setOk(true);
    setTimeout(() => { onSuccess(); onClose(); }, 2000);
  }

  const podeSalvar = !!fotoBase64 && validacao?.match === true && !validando && !loading;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="font-bold text-gray-800">Carregar fio de solda</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          {ok ? (
            <div className="flex flex-col items-center gap-3 py-10 px-5 text-center">
              <CheckCircle size={44} color="#059669" />
              <p className="font-bold text-gray-800 text-lg">Carregado com sucesso!</p>
              {novoSaldo && (
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Novo saldo do operador: <span className="font-bold text-emerald-700">{novoSaldo.operador.toFixed(3)}g</span></p>
                  <p>Saldo do pote: <span className="font-bold text-gray-700">{novoSaldo.pote.toFixed(3)}g</span></p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-5">

              {/* Operador */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Operador
                </label>
                <select
                  value={depositoId}
                  onChange={e => setDepositoId(parseInt(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-emerald-600"
                >
                  {operadores.map(o => (
                    <option key={o.deposito_id} value={o.deposito_id}>{o.operador}</option>
                  ))}
                </select>
                {op && (
                  <p className="text-xs text-gray-400 mt-1">
                    Saldo atual: <span className="font-semibold text-gray-600">{op.saldo_solda.toFixed(3)}g</span>
                  </p>
                )}
              </div>

              {/* Peso */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Peso a carregar (g)
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={peso}
                  onChange={e => handlePesoChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-xl font-bold text-center text-gray-800 outline-none focus:border-emerald-600"
                  inputMode="decimal"
                />
                {op && peso && !isNaN(parseFloat(peso)) && parseFloat(peso) > 0 && (
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    Novo saldo estimado: <span className="font-semibold text-emerald-700">{(op.saldo_solda + parseFloat(peso)).toFixed(3)}g</span>
                  </p>
                )}
              </div>

              {/* Foto da balança */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Foto na balança <span className="text-red-500">*</span>
                </label>

                {fotoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoPreview} alt="Balança" className="w-full h-44 object-cover" />
                    <button
                      onClick={() => { setFotoBase64(null); setFotoPreview(null); setValidacao(null); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-28 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
                  >
                    <Camera size={22} className="text-gray-400" />
                    <span className="text-sm text-gray-500">Tirar foto / Selecionar imagem</span>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFoto(f); }}
                />
              </div>

              {/* Feedback IA */}
              {validando && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-amber-50 border border-amber-200">
                  <Loader2 size={14} className="animate-spin text-amber-600 shrink-0" />
                  <span className="text-amber-700">Validando peso com IA...</span>
                </div>
              )}
              {!validando && validacao && (
                <div className={`px-3 py-2.5 rounded-xl text-sm border ${validacao.match ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                  <div className={`flex items-center gap-2 font-semibold mb-0.5 ${validacao.match ? "text-emerald-700" : "text-red-700"}`}>
                    {validacao.match ? <CheckCircle size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                    {validacao.mensagem}
                  </div>
                  <span className={`text-xs ${validacao.match ? "text-emerald-600/70" : "text-red-600/70"}`}>
                    Confiança: {validacao.confianca}
                  </span>
                </div>
              )}
              {!validando && !validacao && fotoBase64 && peso && parseFloat(peso) > 0 && (
                <button
                  onClick={() => validarComIA(fotoBase64, parseFloat(peso))}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw size={13} /> Validar peso com IA
                </button>
              )}

              {/* Erro */}
              {erro && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0" />
                  {erro}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmar}
                  disabled={!podeSalvar}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ backgroundColor: "#184036" }}
                  title={!fotoBase64 ? "Foto obrigatória" : !validacao?.match ? "Validação IA necessária" : undefined}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {loading ? "Registrando..." : "Confirmar carga"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
