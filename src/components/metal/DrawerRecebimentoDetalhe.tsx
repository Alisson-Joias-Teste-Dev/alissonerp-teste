"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, ImageIcon, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { toast } from "sonner";
import type { RecebimentoRecord } from "@/lib/metal/types";
import StatusPagamento from "./StatusPagamento";
import { getPublicUrl } from "@/lib/storage-url";

interface Props {
  recebimentoId: number | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function DrawerRecebimentoDetalhe({ recebimentoId, onClose, onUpdated }: Props) {
  const [receb, setReceb] = useState<RecebimentoRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    if (!recebimentoId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/metal/recebimentos/${recebimentoId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao carregar" }));
        throw new Error(err.error || "Erro ao carregar recebimento");
      }
      setReceb(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [recebimentoId]);

  useEffect(() => { if (recebimentoId) carregar(); }, [recebimentoId, carregar]);

  async function handleCancelar() {
    if (!recebimentoId) return;
    if (!confirm("Tem certeza que deseja cancelar este recebimento?")) return;
    setError("");
    try {
      const res = await fetch(`/api/metal/recebimentos/${recebimentoId}/cancelar`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao cancelar" }));
        throw new Error(err.error || "Erro ao cancelar");
      }
      toast.success("Recebimento cancelado.");
      await carregar();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cancelar");
    }
  }

  if (!recebimentoId) return null;
  const fotoUrl = receb?.foto_path ? getPublicUrl("pagamento-fotos", receb.foto_path) : null;

  return (<>
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
    <div className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-[#FAFAF7] shadow-2xl overflow-y-auto animate-[slideIn_0.2s_ease-out]">
      <style jsx>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div className="sticky top-0 z-10 bg-[#FAFAF7] border-b border-[#C59B6D]/30 px-6 py-4 flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-[#1A3C34]">{receb?.numero || "Recebimento"}</h2>{receb && <div className="mt-1"><StatusPagamento status={receb.status} tipo="recebimento" /></div>}</div>
        <button onClick={onClose} className="p-2 hover:bg-[#1A3C34]/10 rounded-xl"><X size={20} className="text-[#1A3C34]" /></button>
      </div>
      <div className="p-6 space-y-6">
        <ErrorBox error={error} />
        {loading && !receb && <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-[#C59B6D]" /></div>}
        {receb && (<>
          <DetailSection titulo="Cliente"><DetailRow label="Nome" value={receb.cliente_nome || "—"} /></DetailSection>
          <DetailSection titulo="Peso e Valores">
            <DetailRow label="Peso (g)" value={`${Number(receb.peso_gramas).toFixed(3)}g`} />
            <DetailRow label="Cotação do Ouro" value={`R$ ${Number(receb.cotacao_ouro).toFixed(2)}`} />
            <DetailRow label="Valor de Crédito / g" value={`R$ ${Number(receb.valor_credito_grama).toFixed(2)}`} />
            <div className="flex items-center gap-3"><DetailRow label="Mínimo" value={`R$ ${Number(receb.min_limit).toFixed(2)}`} /><DetailRow label="Máximo" value={`R$ ${Number(receb.max_limit).toFixed(2)}`} /></div>
            {receb.excedeu_teto && <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg"><AlertTriangle size={14} />Valor acima do teto configurado</div>}
            <hr className="border-[#C59B6D]/20" />
            <DetailRow label="Valor Total" value={`R$ ${Number(receb.valor_total).toFixed(2)}`} bold />
            <DetailRow label="Venda Vinculada" value={receb.venda_id ? `#${receb.venda_id}` : "—"} />
            {receb.credito_excedente != null && Number(receb.credito_excedente) > 0 && <DetailRow label="Crédito Excedente" value={`R$ ${Number(receb.credito_excedente).toFixed(2)}`} className="text-amber-600" />}
          </DetailSection>
          <DetailSection titulo="Foto da Balança">
            {fotoUrl ? (<div className="space-y-2"><img src={fotoUrl} alt="Foto da balança" className="w-full max-h-64 object-contain rounded-xl border border-[#C59B6D]/20 bg-white" />{receb.foto_peso_ia != null && (<div className={`flex items-start gap-2 text-xs p-3 rounded-lg ${receb.ia_match ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{receb.ia_match ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}<div><p><strong>Peso lido pela IA:</strong> {Number(receb.foto_peso_ia).toFixed(3)}g &bull; <strong>Confiança:</strong> {receb.ia_confianca || "—"}</p><p className="mt-0.5">{receb.ia_match ? "Peso confere." : "Peso NÃO confere. Verifique."}</p></div></div>)}{receb.foto_peso_ia == null && <p className="text-xs text-[#1A3C34]/50">Foto registrada sem validação IA.</p>}</div>) : (<div className="flex items-center gap-2 text-xs text-[#1A3C34]/50 bg-white rounded-xl p-4 border border-dashed border-[#C59B6D]/20"><ImageIcon size={16} />Nenhuma foto registrada.</div>)}
          </DetailSection>
          {receb.observacao && (<DetailSection titulo="Observação"><p className="text-sm text-[#1A3C34]/80 whitespace-pre-wrap bg-white rounded-xl p-4 border border-[#C59B6D]/20">{receb.observacao}</p></DetailSection>)}
          <DetailSection titulo="Auditoria"><DetailRow label="Criado por" value={receb.created_by || "—"} /><DetailRow label="Criado em" value={new Date(receb.created_at).toLocaleString("pt-BR")} /><DetailRow label="Atualizado em" value={new Date(receb.updated_at).toLocaleString("pt-BR")} /><DetailRow label="Registrado no Cofre" value={receb.cofre_registrado ? "Sim" : "Não"} /></DetailSection>
          {receb.status === "ativo" && (<div className="sticky bottom-0 bg-[#FAFAF7] border-t border-[#C59B6D]/30 px-0 py-4"><button onClick={handleCancelar} className="flex items-center justify-center gap-2 w-full text-red-600 border border-red-200 py-2.5 rounded-xl text-xs font-bold hover:bg-red-50"><Ban size={14} />Cancelar Recebimento</button></div>)}
        </>)}
      </div>
    </div>
  </>);
}

function DetailSection({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <div className="space-y-2"><h3 className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide">{titulo}</h3><div className="bg-white rounded-xl border border-[#C59B6D]/20 p-4 space-y-1.5">{children}</div></div>; }
function DetailRow({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide shrink-0">{label}</span><span className={`text-sm text-right ${bold ? "font-bold text-[#1A3C34]" : "font-medium text-[#1A3C34]/80"} ${className ?? ""}`}>{value}</span></div>; }
function ErrorBox({ error }: { error: string }) { if (!error) return null; return <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-4 py-3 rounded-xl"><AlertTriangle size={14} />{error}</div>; }
