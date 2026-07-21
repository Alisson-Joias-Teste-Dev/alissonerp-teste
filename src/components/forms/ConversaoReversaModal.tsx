"use client";

import { useState, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Gem } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7", ambar: "#D97706", ambarLt: "#FEF3C7" };

interface SearchResult {
  id_produto: number;
  nome: string;
  sku: string | null;
}

export interface OrigemReversa {
  origem_tipo: "venda_ouro" | "upgrade" | "compra_metal" | "conversao";
  origem_id: number;
  referencia: string;
  restante: number;
}

const ORIGEM_LABEL: Record<OrigemReversa["origem_tipo"], string> = {
  venda_ouro: "Venda em Ouro",
  upgrade: "Upgrade",
  compra_metal: "Compra Metal",
  conversao: "Conversão",
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  origem: OrigemReversa | null;
  onSuccess?: () => void;
}

/**
 * REGRA DE NEGÓCIO (Conversão Reversa — Fase 3, 15/07):
 * O QUE: modal que abre a solicitação de "virou joia" — metal já registrado no
 *   Caixa de Ouro (de uma conversão de estoque concluída ou compra de metal
 *   confirmada) sai do cofre e vira peça pronta no estoque comercial. Fica
 *   PENDENTE até aprovação de quem estiver configurado em Configurações →
 *   Aprovadores → "Conversão Reversa" (config-first, sem fallback de cargo —
 *   ver POST /api/conversao-reversa/aprovar).
 * POR QUE: precisa de produto (ativo — validado no servidor), quantidade de
 *   peças e peso da joia. O peso NUNCA pode passar do restante daquela origem
 *   (mesmo lote de ouro pode ter várias baixas — sangria + conversão reversa).
 * IMPACTO SE ALTERADO/REMOVIDO: sem a trava de peso no cliente, o usuário só
 *   descobre o excesso no erro 400 do servidor (a trava real é lá — aqui é só
 *   feedback antecipado pra reduzir ida e volta).
 */
export default function ConversaoReversaModal({ isOpen, onClose, origem: origemProp, onSuccess }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [produto, setProduto] = useState<SearchResult | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [pesoSaida, setPesoSaida] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!isOpen || !origemProp) return null;
  // Const local (não-nulo) — preserva a checagem de nulidade dentro das funções
  // aninhadas (handleSubmit etc.), que o TS não consegue inferir a partir de um parâmetro.
  const origem = origemProp;

  const pesoDefault = origem.restante.toFixed(3);

  function buscarProdutos(term: string) {
    setSearchTerm(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!term || term.length < 2) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        /**
         * REGRA DE NEGÓCIO: busca SEM com_estoque=true — a peça está SAINDO do
         * cofre pra virar estoque NOVO, então não exige saldo prévio no produto
         * (diferente da Conversão normal, que consome estoque existente).
         * O endpoint /api/produtos/busca não devolve `situacao` em nenhum dos
         * dois modos — a checagem de produto ATIVO fica a cargo da rota POST
         * /api/conversao-reversa, que bloqueia com 400 se o produto estiver inativo.
         */
        const r = await fetch(`/api/produtos/busca?q=${encodeURIComponent(term)}&limit=8`);
        if (r.ok) {
          const data: SearchResult[] = await r.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selecionarProduto(p: SearchResult) {
    setProduto(p);
    setSearchTerm("");
    setSearchResults([]);
  }

  function handleClose() {
    setSearchTerm(""); setSearchResults([]); setProduto(null);
    setQuantidade("1"); setPesoSaida("");
    setFotoFile(null); setFotoPreview(null); setMotivo("");
    setError(""); setSuccess(false);
    onClose();
  }

  async function handleSubmit() {
    setError("");
    if (!produto) { setError("Selecione o produto (peça) que saiu do cofre."); return; }
    const qtd = parseInt(quantidade, 10);
    if (!qtd || qtd <= 0) { setError("Quantidade de peças inválida."); return; }
    const peso = parseFloat(pesoSaida || pesoDefault);
    if (!peso || peso <= 0) { setError("Peso da joia inválido."); return; }
    // REGRA DE NEGÓCIO: peso da joia nunca pode passar do restante da origem — ver comentário no topo do arquivo.
    if (peso > origem.restante) {
      setError(`Peso da joia não pode ultrapassar o restante disponível: máx ${origem.restante.toFixed(3)}g`);
      return;
    }
    // REGRA DE NEGÓCIO: foto do peso é obrigatória (prova do que virou joia).
    if (!fotoFile) { setError("Anexe a foto do peso da joia."); return; }

    setLoading(true);
    try {
      let foto_base64: string | undefined;
      if (fotoFile) {
        foto_base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(fotoFile);
        });
      }

      const res = await fetch("/api/conversao-reversa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origem_tipo: origem.origem_tipo,
          origem_id: origem.origem_id,
          produto_id: produto.id_produto,
          quantidade: qtd,
          peso_saida: peso,
          foto_base64,
          motivo: motivo.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      setSuccess(true);
      setTimeout(() => { onSuccess?.(); handleClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar para aprovação");
    } finally {
      setLoading(false);
    }
  }

  const origemLabel = ORIGEM_LABEL[origem.origem_tipo] ?? origem.origem_tipo;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: "#111827" }}>
              <Gem size={16} style={{ color: C.ambar }} /> Virou Joia
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Origem: {origemLabel} {origem.referencia} · restante {origem.restante.toFixed(3)}g
            </p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Produto */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Produto (peça) <span style={{ color: "#DC2626" }}>*</span>
            </p>
            {produto ? (
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#374151" }}>{produto.nome}</p>
                  {produto.sku && <p className="text-xs text-gray-400 font-mono">{produto.sku}</p>}
                </div>
                <button onClick={() => setProduto(null)} className="text-xs font-medium shrink-0 ml-2" style={{ color: C.ambar }}>Trocar</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por nome ou SKU..."
                  value={searchTerm}
                  onChange={(e) => buscarProdutos(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
                {searching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#9CA3AF" }} />
                )}
                {searchResults.length > 0 && (
                  <div className="mt-1 rounded-lg overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
                    {searchResults.map((p) => (
                      <button
                        key={p.id_produto}
                        onClick={() => selecionarProduto(p)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
                      >
                        <span className="font-medium truncate mr-2" style={{ color: "#374151" }}>{p.nome}</span>
                        <span className="text-xs text-gray-400 shrink-0">{p.sku ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchTerm.length >= 2 && searchResults.length === 0 && !searching && (
                  <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>Nenhum produto encontrado.</p>
                )}
              </div>
            )}
          </div>

          {/* Quantidade + Peso */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                Quantidade (peças) <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="number" min={1} step={1}
                value={quantidade}
                onChange={(e) => setQuantidade(String(Math.max(1, Math.trunc(Number(e.target.value) || 1))))}
                className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                Peso da joia (g) <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                type="number" step={0.001} min={0.001} max={origem.restante}
                placeholder={pesoDefault}
                value={pesoSaida}
                onChange={(e) => setPesoSaida(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
              <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>máx {origem.restante.toFixed(3)}g</p>
            </div>
          </div>

          {/* Foto (opcional) */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Foto do peso <span style={{ color: "#DC2626" }}>*</span>
            </p>
            {fotoPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPreview} alt="Foto" className="w-full max-h-36 object-cover rounded-xl" />
                <button
                  onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                >
                  <RotateCcw size={13} color="white" />
                </button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center justify-center h-20 rounded-xl cursor-pointer transition-colors"
                style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
              >
                <Camera size={20} style={{ color: "#9CA3AF" }} />
                <span className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)); }
                  }}
                />
              </label>
            )}
          </div>

          {/* Motivo (opcional) */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>
              Motivo (opcional)
            </label>
            <input
              type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: peça finalizada na bancada"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Enviado para aprovação!
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center"
              style={{ color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || success || !produto || !fotoFile}
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: C.ambar, color: "white", minHeight: 44 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />Enviando...</> : "Enviar p/ aprovação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
