"use client";

import { X, Check, Ban } from "lucide-react";
import { getPublicUrl } from "@/lib/storage-url";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8" };

interface HistoricoRow {
  id: number;
  status: string;
  motivo_final: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  cancelado_por_nome: string | null;
  created_at: string;
  entregue_em: string | null;
  recebido_em: string | null;
  volta_solicitada_em: string | null;
  finalizado_em: string | null;
  foto_entrega: string | null;
  foto_recebimento: string | null;
  foto_devolucao: string | null;
  solicitante_nome: string | null;
  entregue_por_nome: string | null;
  recebido_por_nome: string | null;
  volta_solicitada_por_nome: string | null;
  finalizado_por_nome: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  row: HistoricoRow;
  produtosLabel: string;
  onAbrirFoto: (url: string | null | undefined, titulo: string) => void;
}

function fmtDT(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function resolveStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getPublicUrl("protocolo-fotos", path);
}

interface Passo {
  label: string;
  nome: string | null;
  em: string | null;
  foto: string | null;
  detalhe?: string | null;  // texto livre sob o passo (hoje: motivo do cancelamento)
  perigo?: boolean;         // pinta o marcador de vermelho (encerramento sem desfecho fisico)
}

/**
 * REGRA DE NEGOCIO: painel de auditoria de uma solicitacao — a linha do tempo
 * completa, cada passo com quem fez, DATA E HORA, e a foto. Passos que ainda
 * nao aconteceram aparecem como "aguardando" no fim.
 */
export default function HistoricoSolicitacaoModal({ isOpen, onClose, row, produtosLabel, onAbrirFoto }: Props) {
  if (!isOpen) return null;

  const passos: Passo[] = [
    { label: "Solicitado", nome: row.solicitante_nome, em: row.created_at, foto: null },
  ];
  if (row.entregue_em) passos.push({ label: "Entregue pelo estoque", nome: row.entregue_por_nome, em: row.entregue_em, foto: row.foto_entrega });
  if (row.recebido_em) passos.push({ label: "Recebido pela solicitante", nome: row.recebido_por_nome, em: row.recebido_em, foto: row.foto_recebimento });
  if (row.volta_solicitada_em) passos.push({ label: "Volta ao estoque solicitada", nome: row.volta_solicitada_por_nome, em: row.volta_solicitada_em, foto: null });
  // Cancelamento: encerra a linha do tempo logo apos "Solicitado" — por regra so
  // acontece a partir de 'solicitado', entao nunca convive com entrega/recebimento.
  if (row.status === "cancelado") {
    passos.push({ label: "Cancelada", nome: row.cancelado_por_nome, em: row.cancelado_em, foto: null,
      detalhe: row.motivo_cancelamento, perigo: true });
  }
  if (row.status === "finalizado") {
    if (row.motivo_final === "cliente_levou") {
      passos.push({ label: "Cliente levou", nome: row.finalizado_por_nome, em: row.finalizado_em, foto: null });
    } else {
      passos.push({ label: "Devolvido — estoque confirmou", nome: row.finalizado_por_nome, em: row.finalizado_em, foto: row.foto_devolucao });
    }
  }

  const aguardando =
    row.status === "solicitado" ? "Aguardando o estoque entregar" :
    row.status === "entregue" ? "Aguardando a solicitante confirmar o recebimento" :
    row.status === "recebido" ? "Aguardando finalizar (cliente levou ou devolver)" :
    row.status === "volta_solicitada" ? "Aguardando o estoque confirmar a devolução" :
    null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Histórico · #{row.id}</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>{produtosLabel}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5">
          {passos.map((p, i) => {
            const fotoUrl = resolveStorageUrl(p.foto);
            const ultimo = i === passos.length - 1 && !aguardando;
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: p.perigo ? "#A32D2D" : C.esmeralda }}>
                    {p.perigo ? <Ban size={13} color="#fff" /> : <Check size={13} color="#fff" />}
                  </div>
                  {!ultimo && <div className="w-0.5 flex-1" style={{ backgroundColor: C.cremeBorder, minHeight: 16 }} />}
                </div>
                <div className="pb-4">
                  <p className="text-[13px] font-semibold" style={{ color: "#1A1A1A" }}>{p.label}</p>
                  <p className="text-[12px]" style={{ color: "#6B7280" }}>{p.nome ?? "—"}</p>
                  <p className="text-[12px] font-mono" style={{ color: "#9CA3AF" }}>{fmtDT(p.em)}</p>
                  {p.detalhe && (
                    <p className="text-[12px] italic mt-1 px-2 py-1 rounded" style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}>
                      &ldquo;{p.detalhe}&rdquo;
                    </p>
                  )}
                  {fotoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fotoUrl} alt={`Foto ${p.label}`} title={`Foto ${p.label}`}
                      className="w-14 h-14 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity mt-1.5"
                      onClick={() => onAbrirFoto(fotoUrl, `Foto · ${p.label}`)}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                </div>
              </div>
            );
          })}

          {aguardando && (
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: "#fff", border: `1.5px dashed #D1D5DB` }} />
              </div>
              <div>
                <p className="text-[13px] font-medium" style={{ color: "#9CA3AF" }}>{aguardando}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
