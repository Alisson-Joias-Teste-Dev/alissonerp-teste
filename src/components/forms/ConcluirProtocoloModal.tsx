"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLES_CONCLUIR_PROTOCOLO } from "@/lib/roles";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8" };

const TIPO_LABEL: Record<string, string> = {
  servico: "Serviço",
  fabricacao: "Fabricação",
  reposicao_venda: "Rep. Venda",
  reposicao_loja: "Rep. Loja",
  compra_fornecedor: "Compra",
  garantia: "Garantia",
  servico_interno: "S. Interno",
};
function fmtTipo(t: string | null) { return t ? (TIPO_LABEL[t] ?? t) : "—"; }

interface OrdemRow {
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number | null;
  cliente_nome: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  protocoloId: number;
  direcao: "ida" | "volta";
  totalOrdens: number;
  onSuccess?: () => void;
}

export default function ConcluirProtocoloModal({ isOpen, onClose, protocoloId, direcao, totalOrdens, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [ordens, setOrdens] = useState<OrdemRow[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setOrdens(null);
    setUserRole("");

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const res = await fetch(`/api/user/role?user_id=${user.id}`);
      const d = await res.json().catch(() => ({}));
      setUserRole(d.role ?? "unknown");
    });

    fetch(`/api/protocolo/${protocoloId}`)
      .then((r) => r.json())
      .then((data) => setOrdens(Array.isArray(data) ? data : []))
      .catch(() => setOrdens([]));
  }, [isOpen, protocoloId]);

  async function handleSubmit() {
    setError("");
    if (!fotoFile) { setError("Foto de confirmação é obrigatória."); return; }
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Upload foto de conclusão direto no Storage
      const fotoPath = `conclusao/${protocoloId}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(`Upload foto: ${uploadErr.message}`);

      const res = await fetch(`/api/protocolo/${protocoloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etapas: "concluido",
          recebedor_id: user?.id,
          foto_conclusao: fotoPath,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao concluir protocolo");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    onClose();
  }

  if (!isOpen) return null;

  const descricao = direcao === "ida"
    ? `Isso criará ${totalOrdens} PCP(s) automaticamente e moverá as ordens para "em andamento".`
    : `Isso criará ${totalOrdens} aprovação(ões) de consultora automaticamente.`;

  const bloqueado = userRole !== "" && !ROLES_CONCLUIR_PROTOCOLO.includes(userRole as typeof ROLES_CONCLUIR_PROTOCOLO[number]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Concluir Protocolo</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Protocolo #{protocoloId} · {direcao === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"}</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {bloqueado ? (
            <div className="rounded-lg px-4 py-4" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <p className="text-sm font-medium" style={{ color: "#92400E" }}>Sem permissão</p>
              <p className="text-xs mt-1" style={{ color: "#92400E" }}>
                Apenas o gerente ou responsável pelo estoque pode concluir o protocolo.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <p className="text-sm" style={{ color: "#92400E" }}>{descricao}</p>
              </div>

              {/* Ordens do protocolo */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
                  <Package size={11} />
                  Ordens neste protocolo ({ordens?.length ?? "…"})
                </p>
                <div className="rounded-xl overflow-hidden overflow-y-auto max-h-44" style={{ border: `1px solid ${C.cremeBorder}` }}>
                  {ordens === null ? (
                    <p className="text-center py-4 text-xs" style={{ color: "#9CA3AF" }}>Carregando ordens…</p>
                  ) : ordens.length === 0 ? (
                    <p className="text-center py-4 text-xs" style={{ color: "#9CA3AF" }}>Nenhuma ordem encontrada</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {ordens.map((o, i) => (
                          <tr key={o.ordem_id} style={{ borderTop: i > 0 ? `1px solid ${C.cremeBorder}` : undefined }}>
                            <td className="px-3 py-2 font-mono font-semibold" style={{ color: C.esmeralda }}>{o.numero_ordem ?? `#${o.ordem_id}`}</td>
                            <td className="px-3 py-2" style={{ color: "#6B7280" }}>{fmtTipo(o.tipo_ordem)}</td>
                            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "#374151" }}>{o.cliente_nome ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-right" style={{ color: "#9CA3AF" }}>
                              {o.peso_metal_negociado ? `${o.peso_metal_negociado}g` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Foto obrigatória */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                  Foto de Confirmação <span style={{ color: "#DC2626" }}>*</span>
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
                    className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
                    style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#FAFAF7" }}
                  >
                    <Camera size={22} style={{ color: "#9CA3AF" }} />
                    <span className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
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
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Protocolo concluído!
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Cancelar</button>
          {!bloqueado && (
            <button
              onClick={handleSubmit}
              disabled={loading || success || !fotoFile}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />Concluindo...</> : "Confirmar Conclusão"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
