"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, AlertTriangle, Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8" };

export type AcaoTipo = "entregar" | "receber" | "cliente_levou" | "solicitar_volta" | "confirmar_devolucao" | "cancelar";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  solicitacaoId: number;
  tipo: AcaoTipo;
  produtosLabel: string;
  onSuccess?: () => void;
}

const MAX_FOTOS = 5;

/**
 * REGRA DE NEGOCIO: cada acao do ciclo da peca exige uma prova diferente.
 * - foto: passos FISICOS (a peca trocou de mao) — a foto e a prova. Aceita ATE
 *   5 fotos por passo (mig 349): varios angulos, nota, etc.
 * - motivo: cancelamento — a peca NAO se moveu, entao nao ha foto a tirar; o que
 *   se registra e o PORQUE da desistencia (visibilidade pro gestor).
 * - obs: observacao OPCIONAL — hoje so na confirmacao da devolucao, pro estoque
 *   anotar o estado da peca na volta ("voltou com risco").
 * - perigo: pinta a acao de vermelho — encerramento sem desfecho fisico.
 * IMPACTO: mudar 'motivo' para false no cancelar faz a API devolver 400
 * (motivo e obrigatorio la) e o botao para de funcionar.
 */
const CONFIG: Record<AcaoTipo, { titulo: string; subtitulo: string; label: string; foto: boolean; campo: string; motivo?: boolean; obs?: boolean; perigo?: boolean; aviso?: string }> = {
  entregar:            { titulo: "Confirmar Entrega",     subtitulo: "Estoque separou e está entregando",  label: "Confirmar entrega",     foto: true,  campo: "entrega" },
  receber:             { titulo: "Confirmar Recebimento", subtitulo: "Você está recebendo a peça",         label: "Confirmar recebimento", foto: true,  campo: "recebimento" },
  cliente_levou:       { titulo: "Cliente Levou",         subtitulo: "A peça saiu de vez — encerra aqui",  label: "Confirmar",             foto: false, campo: "" },
  solicitar_volta:     { titulo: "Devolver ao Estoque",   subtitulo: "Mandar a peça de volta pro estoque", label: "Solicitar volta",       foto: false, campo: "" },
  confirmar_devolucao: { titulo: "Confirmar Devolução",   subtitulo: "Estoque recebeu a peça de volta",    label: "Confirmar devolução",   foto: true,  campo: "devolucao", obs: true },
  cancelar:            { titulo: "Cancelar Solicitação",  subtitulo: "Desistiu antes de a peça sair",      label: "Cancelar solicitação",  foto: false, campo: "", motivo: true, perigo: true,
                         aviso: "A peça continua no estoque. Nada é movimentado — a solicitação só é encerrada." },
};

// uma foto escolhida no modal, com preview local pra exibir antes do upload
interface FotoLocal { file: File; preview: string; }

export default function AcaoSolicitacaoModal({ isOpen, onClose, solicitacaoId, tipo, produtosLabel, onSuccess }: Props) {
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFotos([]); setMotivo(""); setObs(""); setError(""); setSuccess(false);
  }, [isOpen]);

  const cfg = CONFIG[tipo];
  const podeEnviar = (cfg.foto ? fotos.length > 0 : true) && (cfg.motivo ? motivo.trim().length > 0 : true);

  // Adiciona os arquivos escolhidos, respeitando o teto de 5 (silenciosamente
  // ignora o excedente pra nao travar quem selecionou uma pasta inteira).
  //
  // BUG QUE ISSO CONSERTA (v2.87.x): o onChange do input chama addFiles e LOGO
  // em seguida faz `e.target.value = ""` pra permitir re-selecionar o mesmo
  // arquivo. Se a leitura da FileList acontecesse DENTRO do updater do setState
  // (que o React roda depois), o value="" ja teria esvaziado a lista e nenhuma
  // foto entrava ("a foto nao vai"). Por isso capturamos os arquivos AGORA,
  // sincrono, ANTES de o input ser limpo — o updater so junta o que ja foi lido.
  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const escolhidos = Array.from(files).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setFotos((atual) => [...atual, ...escolhidos].slice(0, MAX_FOTOS));
  }
  function removeFoto(idx: number) {
    setFotos((atual) => atual.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setError("");
    if (cfg.foto && fotos.length === 0) { setError("Pelo menos uma foto é obrigatória."); return; }
    if (cfg.motivo && !motivo.trim()) { setError("Motivo é obrigatório."); return; }
    setLoading(true);
    try {
      const foto_paths: string[] = [];
      if (fotos.length > 0) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        // Uma chamada de upload por foto — o indice garante caminho unico mesmo
        // que duas fotos caiam no mesmo milissegundo.
        for (let i = 0; i < fotos.length; i++) {
          const { file } = fotos[i];
          const path = `movimentacao-interna/${cfg.campo}/${solicitacaoId}/${user?.id ?? "anon"}-${Date.now()}-${i}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("protocolo-fotos")
            .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
          if (upErr) throw new Error(`Upload foto: ${upErr.message}`);
          foto_paths.push(path);
        }
      }
      const res = await fetch(`/api/solicitacao-peca/${solicitacaoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: tipo,
          ...(foto_paths.length > 0 ? { foto_paths } : {}),
          ...(cfg.motivo ? { motivo: motivo.trim() } : {}),
          ...(cfg.obs && obs.trim() ? { obs: obs.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>{cfg.titulo}</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>#{solicitacaoId} · {cfg.subtitulo}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl px-3 py-2.5 text-sm" style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }}>
            {produtosLabel}
          </div>

          {cfg.aviso && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12px]" style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />{cfg.aviso}
            </div>
          )}

          {cfg.motivo && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Motivo do cancelamento <span style={{ color: "#DC2626" }}>*</span>
              </p>
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={2000}
                placeholder="Cliente desistiu da peça"
                className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none"
                style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }} />
            </div>
          )}

          {cfg.foto && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Fotos <span style={{ color: "#DC2626" }}>*</span>
                <span className="ml-1 font-normal normal-case tracking-normal" style={{ color: "#B4B2A9" }}>(até {MAX_FOTOS})</span>
              </p>
              <div className="flex gap-2 flex-wrap">
                {fotos.map((f, i) => (
                  <div key={i} className="relative w-[72px] h-[72px] rounded-lg overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <button onClick={() => removeFoto(i)} type="button"
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                      <X size={12} color="white" />
                    </button>
                  </div>
                ))}
                {fotos.length < MAX_FOTOS && (
                  <label className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-lg cursor-pointer transition-colors"
                    style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#FAFAF7" }}>
                    <Camera size={18} style={{ color: "#9CA3AF" }} />
                    <span className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>Adicionar</span>
                    {/* multiple: dá pra escolher várias de uma vez; capture abre a câmera no mobile */}
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                      onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            </div>
          )}

          {cfg.obs && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Observação <span className="font-normal normal-case tracking-normal" style={{ color: "#B4B2A9" }}>(opcional)</span>
              </p>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={2000}
                placeholder="Ex: voltou com risco perto do fecho"
                className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none"
                style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }} />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Feito!
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          {/* No modal de cancelamento o botao de sair vira "Voltar": dois botoes
              "Cancelar" na mesma barra (sair x cancelar a solicitacao) fariam a
              consultora encerrar a solicitacao achando que estava desistindo. */}
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>
            {cfg.perigo ? "Voltar" : "Cancelar"}
          </button>
          <button onClick={handleSubmit} disabled={loading || success || !podeEnviar}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: cfg.perigo ? "#A32D2D" : C.esmeralda, color: cfg.perigo ? "#FFFFFF" : C.creme }}>
            {loading ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}
