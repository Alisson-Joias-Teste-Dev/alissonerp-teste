"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Package, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLES_CONCLUIR_PROTOCOLO } from "@/lib/roles";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8" };

const TIPO_LABEL: Record<string, string> = {
  servico_venda: "Serv. Venda",
  fabricacao: "Fabricação",
  reposicao_venda: "Rep. Venda",
  reposicao_loja: "Rep. Loja",
  compra_fornecedor: "Compra",
  garantia: "Garantia",
  servico_interno: "S. Interno",
  conversao: "Conversão",
  conversao_sku: "Conv. SKU",
};
function fmtTipo(t: string | null) { return t ? (TIPO_LABEL[t] ?? t) : "—"; }

interface OrdemRow {
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number | null;
  cliente_nome: string | null;
}

interface OrdemDetalheFoto {
  ordem_id: number;
  fotoFile: File | null;
  fotoPreview: string | null;
}

interface SangriaBaixaInfo {
  id: number;
  gramas: number;
  destino: string;
  realizado_nome: string | null;
  created_at: string;
}

/**
 * REGRA DE NEGÓCIO: numa transferência de estoque, quem recebe precisa ver o que
 * está conferindo — o trajeto, quem trouxe e a lista de SKU + quantidade. Mesma
 * ideia da sangria, que não deixa concluir sem mostrar o peso do metal.
 */
interface TransferenciaInfo {
  estado: string;
  local_origem_nome: string | null;
  local_destino_nome: string | null;
  motoboy_nome: string | null;
  solicitante_nome: string | null;
  itens: { produto_id: number; sku: string | null; nome_produto: string | null; quantidade: number }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  protocoloId: number;
  direcao: "ida" | "volta";
  totalOrdens: number;
  tipoProtocolo?: string | null;
  /**
   * REGRA DE NEGÓCIO: o mesmo modal serve os dois momentos em que a peça troca de
   * mão numa transferência — "coleta" (quem leva confirma que pegou; o estoque sai
   * da origem) e "chegada" (quem recebe confirma; o estoque entra no destino).
   * O ritual é idêntico: conferir a lista de peças e fotografar. Só muda o texto
   * e para onde a confirmação vai.
   */
  acao?: "chegada" | "coleta";
  onSuccess?: () => void;
}

export default function ConcluirProtocoloModal({ isOpen, onClose, protocoloId, direcao, totalOrdens, tipoProtocolo, acao = "chegada", onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [ordens, setOrdens] = useState<OrdemRow[] | null>(null);
  const [ordensDetalhes, setOrdensDetalhes] = useState<OrdemDetalheFoto[]>([]);
  const [sangriaBaixa, setSangriaBaixa] = useState<SangriaBaixaInfo | null>(null);
  const [transferencia, setTransferencia] = useState<TransferenciaInfo | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const isTransferencia = tipoProtocolo === "transferencia";

  useEffect(() => {
    if (!isOpen) return;
    setTransferencia(null);
    setCancelando(false);
    setMotivoCancelamento("");
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setOrdens(null);
    setOrdensDetalhes([]);
    setSangriaBaixa(null);
    setUserRole("");

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const res = await fetch(`/api/user/role?user_id=${user.id}`);
      const d = await res.json().catch(() => ({}));
      setUserRole(d.role ?? "unknown");
    });

    if (isTransferencia) {
      setOrdens([]);
      fetch(`/api/protocolo/${protocoloId}/produtos`)
        .then((r) => r.json())
        .then((d) => setTransferencia(d?.itens ? d : null))
        .catch(() => setTransferencia(null));
      return;
    }

    fetch(`/api/protocolo/${protocoloId}`)
      .then((r) => r.json())
      .then(async (data) => {
        const ordensData = Array.isArray(data) ? data : [];
        setOrdens(ordensData);
        // Inicializar fotos para ordens de conversão (metal apenas, SKU fotos são na execução)
        const conversaoOrdens = ordensData.filter(o => o.tipo_ordem === 'conversao');
        if (conversaoOrdens.length > 0) {
          setOrdensDetalhes(conversaoOrdens.map(o => ({
            ordem_id: o.ordem_id,
            fotoFile: null,
            fotoPreview: null,
          })));
        }

        /**
         * REGRA DE NEGÓCIO: protocolo de sangria NÃO pode ser concluído sem
         * mostrar o peso do metal que será recebido no destino.
         *
         * O QUE: quando não há ordens vinculadas (sangria), busca a baixa do
         * cofre vinculada ao protocolo para exibir peso/destino no modal.
         * POR QUE: impedir recebimento "às cegas".
         * IMPACTO SE REMOVIDO: operador conclui sem conferir o peso real.
         */
        if (ordensData.length === 0) {
          const baixaRes = await fetch(`/api/financeiro/cofre-ouro/baixas?protocolo_id=${protocoloId}`);
          const baixaJson = await baixaRes.json().catch(() => []);
          const baixa = Array.isArray(baixaJson) ? baixaJson[0] : null;
          if (baixa && Number(baixa.gramas) > 0) {
            setSangriaBaixa({
              id: Number(baixa.id),
              gramas: Number(baixa.gramas),
              destino: String(baixa.destino ?? ""),
              realizado_nome: baixa.realizado_nome ?? null,
              created_at: String(baixa.created_at ?? ""),
            });
          }
        }
      })
      .catch(() => setOrdens([]));
  }, [isOpen, protocoloId, isTransferencia]);

  function updateOrdemFoto(ordemId: number, file: File | null) {
    setOrdensDetalhes(prev => prev.map(od =>
      od.ordem_id === ordemId
        ? { ...od, fotoFile: file, fotoPreview: file ? URL.createObjectURL(file) : null }
        : od
    ));
  }

  /**
   * Coleta: sobe a foto da retirada e chama a rota que faz a peça SAIR da origem.
   * Quem confirma é quem está com a peça na mão — o backend só aceita de quem
   * está cadastrado como transportador, e grava essa pessoa no protocolo.
   */
  async function handleColeta() {
    setError("");
    if (!fotoFile) { setError("Foto das peças é obrigatória."); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const fotoPath = `coleta/${protocoloId}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (upErr) throw new Error(`Upload foto: ${upErr.message}`);

      const res = await fetch(`/api/protocolo/${protocoloId}/coleta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_path: fotoPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar coleta");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setError("");

    if (acao === "coleta") return handleColeta();

    // Sangria exige peso carregado da baixa vinculada (não receber às cegas)
    if (isSangria && (!sangriaBaixa || !sangriaBaixa.gramas || sangriaBaixa.gramas <= 0)) {
      setError("Não foi possível carregar o peso da sangria. Reabra o protocolo e tente novamente.");
      return;
    }

    // Validar foto de confirmação geral
    if (!fotoFile) { setError("Foto de confirmação é obrigatória."); return; }

    // Validar fotos das ordens de conversão
    const conversaoFotosFaltando = ordensDetalhes.filter(od => !od.fotoFile);
    if (conversaoFotosFaltando.length > 0) {
      setError(`Foto da balança obrigatória para ${conversaoFotosFaltando.length} ordem(ns) de conversão.`);
      return;
    }

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

      // Upload das fotos de cada ordem de conversão e montar ordens_detalhes array
      const ordensDetalhesPayload: { ordem_id: number; foto_base64: string }[] = [];
      for (const od of ordensDetalhes) {
        if (!od.fotoFile) continue;
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(od.fotoFile!);
        });
        ordensDetalhesPayload.push({ ordem_id: od.ordem_id, foto_base64: base64 });
      }

      const res = await fetch(`/api/protocolo/${protocoloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etapas: "concluido",
          recebedor_id: user?.id,
          foto_conclusao: fotoPath,
          ordens_detalhes: ordensDetalhesPayload.length > 0 ? ordensDetalhesPayload : undefined,
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

  /**
   * REGRA DE NEGÓCIO: cancelar solta a reserva que a solicitação criou e, se a
   * peça já tinha saído da origem, estorna a saída (a peça volta ao saldo de lá).
   * O motivo é obrigatório — o banco também exige (chk_protocolo_cancelado_motivo).
   * IMPACTO SE REMOVIDO: solicitação abandonada segura a peça fora do estoque
   * disponível para sempre.
   */
  async function handleCancelar() {
    setError("");
    if (!motivoCancelamento.trim()) { setError("Informe o motivo do cancelamento."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/protocolo/${protocoloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas: "cancelado", motivo_cancelamento: motivoCancelamento.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar transferência");
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

  const isSangria = !isTransferencia && totalOrdens === 0;
  const descricao = acao === "coleta"
    ? "Confira as peças e fotografe. Ao confirmar, elas saem do estoque da origem e ficam sob sua responsabilidade até a chegada."
    : isTransferencia
    ? transferencia?.estado === "em_rota"
      ? "Confirme a chegada das peças. Elas entram no estoque do local de destino."
      : "Confirme a chegada das peças. Como este trajeto não tem motoboy, a saída da origem e a entrada no destino acontecem agora, neste mesmo passo."
    : isSangria
      ? "Confirme o recebimento do metal no destino. A baixa de ouro será atualizada para recebido."
      : direcao === "ida"
        ? `Isso criará ${totalOrdens} PCP(s) automaticamente e moverá as ordens para "em andamento".`
        : `Isso criará ${totalOrdens} aprovação(ões) de consultora automaticamente.`;

  const bloqueado = acao === "coleta"
    ? false
    : userRole !== "" && !ROLES_CONCLUIR_PROTOCOLO.includes(userRole as typeof ROLES_CONCLUIR_PROTOCOLO[number]);
  const todasFotosConversaoOK = ordensDetalhes.length === 0 || ordensDetalhes.every(od => od.fotoFile !== null);
  const destinoLabel = sangriaBaixa?.destino === "fabrica" ? "Fábrica" : sangriaBaixa?.destino === "service" ? "Service" : sangriaBaixa?.destino === "alisson" ? "Alisson" : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              {acao === "coleta" ? "Confirmar coleta" : isTransferencia ? "Confirmar chegada" : `Concluir Protocolo${isSangria ? " Sangria" : ""}`}
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Protocolo #{protocoloId} · {
                isTransferencia
                  ? `${transferencia?.local_origem_nome ?? "—"} → ${transferencia?.local_destino_nome ?? "—"}`
                  : isSangria ? "Recebimento de metal" : direcao === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"
              }
            </p>
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

              {isSangria && (
                <div className="rounded-lg px-4 py-3" style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#1E40AF" }}>
                    Resumo da Sangria
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                    Peso do metal a receber: {sangriaBaixa ? `${Number(sangriaBaixa.gramas).toFixed(3)}g` : "—"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                    Baixa #{sangriaBaixa?.id ?? "—"} · Destino {destinoLabel} · por {sangriaBaixa?.realizado_nome ?? "—"}
                  </p>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    Data da baixa: {sangriaBaixa?.created_at ? new Date(sangriaBaixa.created_at).toLocaleString("pt-BR") : "—"}
                  </p>
                </div>
              )}

              {/* Peças da transferência de estoque */}
              {isTransferencia && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
                    <Package size={11} />
                    Peças neste protocolo ({transferencia?.itens.length ?? "…"})
                  </p>
                  <div className="rounded-xl overflow-hidden overflow-y-auto max-h-44" style={{ border: `1px solid ${C.cremeBorder}` }}>
                    {transferencia === null ? (
                      <p className="text-center py-4 text-xs" style={{ color: "#9CA3AF" }}>Carregando peças…</p>
                    ) : transferencia.itens.length === 0 ? (
                      <p className="text-center py-4 text-xs" style={{ color: "#9CA3AF" }}>Nenhuma peça encontrada</p>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody>
                          {transferencia.itens.map((it, i) => (
                            <tr key={it.produto_id} style={{ borderTop: i > 0 ? `1px solid ${C.cremeBorder}` : undefined }}>
                              <td className="px-3 py-2 font-mono font-semibold" style={{ color: C.esmeralda }}>{it.sku ?? `#${it.produto_id}`}</td>
                              <td className="px-3 py-2 truncate max-w-[150px]" style={{ color: "#374151" }}>{it.nome_produto ?? "—"}</td>
                              <td className="px-3 py-2 font-mono text-right" style={{ color: "#6B7280" }}>{it.quantidade}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>
                    Solicitado por {transferencia?.solicitante_nome ?? "—"}
                    {transferencia?.motoboy_nome ? ` · trazido por ${transferencia.motoboy_nome}` : " · sem motoboy"}
                  </p>
                </div>
              )}

              {/* Ordens do protocolo */}
              <div className={isTransferencia ? "hidden" : undefined}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
                  <Package size={11} />
                  Ordens neste protocolo ({ordens?.length ?? "…"})
                </p>
                <div className="rounded-xl overflow-hidden overflow-y-auto max-h-44" style={{ border: `1px solid ${C.cremeBorder}` }}>
                  {ordens === null ? (
                    <p className="text-center py-4 text-xs" style={{ color: "#9CA3AF" }}>Carregando ordens…</p>
                    ) : ordens.length === 0 ? (
                      <p className="text-center py-4 text-xs" style={{ color: "#9CA3AF" }}>
                        {isSangria ? "Protocolo de Sangria — metal será liberado para limpeza após conclusão" : "Nenhuma ordem encontrada"}
                      </p>
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

              {/* Fotos por ordem de conversão (balança) */}
              {ordensDetalhes.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
                    <RefreshCw size={11} />
                    Fotos da Balança — Conversão de Estoque
                  </p>
                  {ordensDetalhes.map(od => {
                    const ordem = ordens?.find(o => o.ordem_id === od.ordem_id);
                    const label = ordem?.numero_ordem ?? `#${od.ordem_id}`;
                    return (
                      <div key={od.ordem_id} className="rounded-xl p-3" style={{ border: `1px solid ${C.cremeBorder}`, backgroundColor: "#FAFAF7" }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: "#374151" }}>
                          <RefreshCw size={11} className="inline mr-1" style={{ color: "#6D28D9" }} />
                          {label} — Foto da Balança <span style={{ color: "#DC2626" }}>*</span>
                        </p>
                        {od.fotoPreview ? (
                          <div className="relative rounded-xl overflow-hidden max-h-32">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={od.fotoPreview} alt={`Balança ${label}`} className="w-full max-h-32 object-cover rounded-xl" />
                            <button
                              onClick={() => updateOrdemFoto(od.ordem_id, null)}
                              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                            >
                              <RotateCcw size={13} color="white" />
                            </button>
                          </div>
                        ) : (
                          <label
                            className="flex flex-col items-center justify-center h-20 rounded-xl cursor-pointer transition-colors"
                            style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#FFFFFF" }}
                          >
                            <Camera size={18} style={{ color: "#9CA3AF" }} />
                            <span className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>Foto da balança</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) updateOrdemFoto(od.ordem_id, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cancelamento da transferência — solta a reserva (e estorna a saída, se já houve) */}
              {isTransferencia && cancelando && (
                <div className="rounded-xl p-3 space-y-2" style={{ border: "1px solid #FECACA", backgroundColor: "#FEF2F2" }}>
                  <p className="text-xs font-semibold" style={{ color: "#991B1B" }}>
                    Cancelar esta transferência
                  </p>
                  <p className="text-[11px]" style={{ color: "#991B1B" }}>
                    {transferencia?.estado === "em_rota"
                      ? "As peças voltam para o saldo do local de origem."
                      : "A reserva é liberada e as peças voltam a ficar disponíveis para venda."}
                  </p>
                  <textarea
                    value={motivoCancelamento}
                    onChange={(e) => setMotivoCancelamento(e.target.value)}
                    rows={2}
                    placeholder="Motivo do cancelamento (obrigatório)"
                    className="w-full px-3 py-2 rounded-lg border text-[13px] focus:outline-none"
                    style={{ borderColor: "#FECACA" }}
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />{acao === "coleta" ? "Coleta confirmada! As peças saíram da origem." : "Protocolo concluído!"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Fechar</button>
          {isTransferencia && acao !== "coleta" && !bloqueado && (
            cancelando ? (
              <button
                onClick={handleCancelar}
                disabled={loading || success || !motivoCancelamento.trim()}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
              >
                {loading ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            ) : (
              <button
                onClick={() => setCancelando(true)}
                disabled={loading || success}
                className="px-4 py-2 rounded-lg text-[13px] disabled:opacity-50"
                style={{ color: "#DC2626" }}
              >
                Cancelar transferência
              </button>
            )
          )}
          {!bloqueado && !cancelando && (
            <button
              onClick={handleSubmit}
              disabled={loading || success || !fotoFile || !todasFotosConversaoOK || (isSangria && !sangriaBaixa)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />{acao === "coleta" ? "Enviando..." : "Concluindo..."}</> : acao === "coleta" ? "Confirmar coleta" : isTransferencia ? "Confirmar chegada" : "Confirmar Conclusão"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
