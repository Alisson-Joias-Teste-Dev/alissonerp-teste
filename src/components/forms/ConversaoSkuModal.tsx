"use client";

import { useState, useRef, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Trash2, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface SearchResult {
  id_produto: number;
  nome: string;
  sku: string | null;
  disponivel?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { ordem_id: number; numero_ordem: string; conversao_sku_id: number }) => void;
}

export default function ConversaoSkuModal({ isOpen, onClose, onSuccess }: Props) {
  const [skuOrigem, setSkuOrigem] = useState<SearchResult | null>(null);
  const [skuDestino, setSkuDestino] = useState<SearchResult | null>(null);
  const [searchOrigem, setSearchOrigem] = useState("");
  const [searchDestino, setSearchDestino] = useState("");
  const [resultsOrigem, setResultsOrigem] = useState<SearchResult[]>([]);
  const [resultsDestino, setResultsDestino] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [quantidade, setQuantidade] = useState("1");
  const [peso, setPeso] = useState("");
  const [qtdDesejada, setQtdDesejada] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Locais de estoque
  const [locais, setLocais] = useState<{ id: number; nome: string }[]>([]);
  const [localOrigemId, setLocalOrigemId] = useState<number>(2);
  const [localDestinoId, setLocalDestinoId] = useState<number>(2);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/locais-estoque")
      .then(r => r.json())
      .then(data => {
        const ativos = Array.isArray(data) ? data.filter((l: any) => l.ativo !== false) : [];
        setLocais(ativos);
        if (ativos.length > 0) {
          const loja = ativos.find((l: any) => l.nome?.toLowerCase().includes("loja"));
          setLocalOrigemId(loja?.id || ativos[0].id);
          setLocalDestinoId(loja?.id || ativos[0].id);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buscar(term: string, setResults: (r: SearchResult[]) => void, excludeId?: number, comEstoque?: boolean, localId?: number) {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!term || term.length < 2) { setResults([]); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        let url = `/api/produtos/busca?q=${encodeURIComponent(term)}&limit=8`;
        if (comEstoque && localId) url += `&com_estoque=true&local_id=${localId}`;
        const r = await fetch(url);
        if (r.ok) {
          let data = await r.json();
          if (Array.isArray(data)) {
            if (excludeId) data = data.filter((p: any) => p.id_produto !== excludeId);
            setResults(data);
          }
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  const [iaChecking, setIaChecking] = useState(false);
  const [iaResult, setIaResult] = useState<{ match: boolean; mensagem: string; peso_balanca?: number | null } | null>(null);

  async function validarPesoIA(): Promise<boolean> {
    if (!fotoFile || !peso || parseFloat(peso) <= 0) return true;
    setIaChecking(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(fotoFile);
      });
      const res = await fetch("/api/ia/validar-peso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagem_base64: base64,
          peso_referencia: parseFloat(peso),
          tolerancia: 0.1,
          media_type: "image/jpeg",
        }),
      });
      const data = await res.json();
      setIaResult(data);
      if (!data.match) {
        setError(data.mensagem || "Peso não confirmado pela IA");
        return false;
      }
      return true;
    } catch {
      return true; // falha na IA não bloqueia
    } finally {
      setIaChecking(false);
    }
  }

  async function handleSubmit() {
    setError("");

    if (!skuOrigem) { setError("Selecione o SKU origem"); return; }
    if (!skuDestino) { setError("Selecione o SKU destino"); return; }
    const qtdNum = parseInt(quantidade);
    if (!qtdNum || qtdNum <= 0) { setError("Quantidade origem inválida"); return; }
    if (skuOrigem.disponivel !== undefined && qtdNum > skuOrigem.disponivel) {
      setError(`Quantidade (${qtdNum}) excede o saldo disponível (${skuOrigem.disponivel})`);
      return;
    }
    if (!peso || parseFloat(peso) <= 0) { setError("Peso inválido"); return; }
    if (!qtdDesejada || parseInt(qtdDesejada) <= 0) { setError("Quantidade desejada inválida"); return; }
    if (!fotoFile) { setError("Foto de abertura é obrigatória"); return; }

    // Validar peso com IA
    const iaOk = await validarPesoIA();
    if (!iaOk) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(fotoFile);
      });

      const res = await fetch("/api/conversao-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_origem_id: skuOrigem.id_produto,
          sku_origem_quantidade: parseInt(quantidade),
          sku_origem_peso: parseFloat(peso),
          local_origem_id: localOrigemId,
          sku_destino_id: skuDestino.id_produto,
          sku_destino_quantidade_desejada: parseInt(qtdDesejada),
          local_destino_id: localDestinoId,
          motivo: motivo.trim() || undefined,
          foto_base64: base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      setSuccess(true);
      setTimeout(() => { onSuccess?.(data); onClose(); }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar conversão");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setSkuOrigem(null);
    setSkuDestino(null);
    setSearchOrigem("");
    setSearchDestino("");
    setResultsOrigem([]);
    setResultsDestino([]);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Conversão de SKU</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Transformar SKU em outro SKU</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* ── SKU Origem ── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#7C3AED" }}>
              SKU Origem
            </p>
            {skuOrigem ? (
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ border: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#374151" }}>{skuOrigem.nome}</p>
                  <p className="text-xs text-gray-400 font-mono">{skuOrigem.sku}</p>
                </div>
                <button onClick={() => setSkuOrigem(null)} className="p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 size={13} style={{ color: "#DC2626" }} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar SKU origem..."
                    value={searchOrigem}
                    onChange={(e) => {
                      setSearchOrigem(e.target.value);
                      buscar(e.target.value, setResultsOrigem, skuDestino?.id_produto, true, localOrigemId);
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }}
                  />
                  {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#9CA3AF" }} />}
                </div>
                  {resultsOrigem.length > 0 && (
                  <div className="mt-1 rounded-lg overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
                    {resultsOrigem.map(p => (
                      <button key={p.id_produto} onClick={() => { setSkuOrigem(p); setSearchOrigem(""); setResultsOrigem([]); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left">
                        <span className="font-medium truncate mr-2" style={{ color: "#374151" }}>{p.nome}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">{p.sku ?? "—"}</span>
                          {p.disponivel !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                              {p.disponivel} disp.
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Campos SKU Origem */}
          {skuOrigem && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Quantidade <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input type="number" min="1" max={skuOrigem?.disponivel ?? 9999} value={quantidade}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    const max = skuOrigem?.disponivel ?? 9999;
                    setQuantidade(String(Math.min(val, max)));
                  }}
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
                {skuOrigem?.disponivel !== undefined && (
                  <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>
                    Saldo: <span className="font-medium">{skuOrigem.disponivel}</span> disponível
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Peso Total (g) <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input type="number" step="0.01" min="0.01" value={peso} onChange={e => setPeso(e.target.value)}
                  placeholder="ex: 5.0"
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
                {iaResult && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      backgroundColor: iaResult.match ? "#059669" : "#DC2626",
                    }} />
                    <span style={{ fontSize: 10, color: iaResult.match ? "#059669" : "#DC2626" }}>
                      {iaResult.match
                        ? `IA: ${iaResult.peso_balanca}g confirmado`
                        : iaResult.mensagem
                      }
                    </span>
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Local de Origem
                </label>
                <select value={localOrigemId} onChange={e => setLocalOrigemId(parseInt(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }}>
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Separador */}
          {skuOrigem && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: 40, height: 2, backgroundColor: "#7C3AED", borderRadius: 1 }} />
            </div>
          )}

          {/* ── SKU Destino ── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#7C3AED" }}>
              SKU Destino
            </p>
            {skuDestino ? (
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ border: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#374151" }}>{skuDestino.nome}</p>
                  <p className="text-xs text-gray-400 font-mono">{skuDestino.sku}</p>
                </div>
                <button onClick={() => setSkuDestino(null)} className="p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 size={13} style={{ color: "#DC2626" }} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <input type="text" placeholder="Buscar SKU destino..."
                    value={searchDestino} onChange={(e) => {
                      setSearchDestino(e.target.value);
                      buscar(e.target.value, setResultsDestino, skuOrigem?.id_produto);
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                    style={{ borderColor: C.cremeBorder }}
                  />
                  {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#9CA3AF" }} />}
                </div>
                {resultsDestino.length > 0 && (
                  <div className="mt-1 rounded-lg overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
                    {resultsDestino.map(p => (
                      <button key={p.id_produto} onClick={() => { setSkuDestino(p); setSearchDestino(""); setResultsDestino([]); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left">
                        <span className="font-medium truncate mr-2" style={{ color: "#374151" }}>{p.nome}</span>
                        <span className="text-xs text-gray-400">{p.sku ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Campos SKU Destino */}
          {skuDestino && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Quantidade Desejada <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input type="number" min="1" value={qtdDesejada} onChange={e => setQtdDesejada(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Local de Destino
                </label>
                <select value={localDestinoId} onChange={e => setLocalDestinoId(parseInt(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white" style={{ borderColor: C.cremeBorder }}>
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Motivo */}
          {skuOrigem && skuDestino && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                Motivo da Conversão
              </label>
              <textarea
                rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ex: Cliente solicitou transformação do produto..."
                className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white resize-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
          )}

          {/* Foto */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Foto de Abertura <span style={{ color: "#DC2626" }}>*</span>
            </p>
            {fotoPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={fotoPreview} alt="Foto" className="w-full max-h-36 object-cover rounded-xl" />
                <button onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                  <RotateCcw size={13} color="white" />
                </button>
                {iaResult && (
                  <div style={{
                    position: "absolute", bottom: 8, left: 8,
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 999,
                    backgroundColor: iaResult.match ? "rgba(5,150,99,0.85)" : "rgba(220,38,38,0.85)",
                    color: "#fff", fontSize: 10,
                  }}>
                    <ShieldCheck size={10} />
                    {iaResult.match ? `${iaResult.peso_balanca}g ✓` : "Peso difere"}
                  </div>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
                style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: C.cremeBg }}>
                <Camera size={22} style={{ color: "#9CA3AF" }} />
                <span className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)); } }} />
              </label>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Conversão SKU criada! Aguardando aprovação.
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button onClick={handleClose} className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center" style={{ color: "#6B7280" }}>
              Cancelar
            </button>
            <button onClick={handleSubmit}
              disabled={loading || success || !skuOrigem || !skuDestino || !fotoFile}
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: "#7C3AED", color: C.creme, minHeight: 44 }}>
              {loading ? <><Loader2 size={14} className="animate-spin" />Criando...</> : `Solicitar Conversão SKU`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
