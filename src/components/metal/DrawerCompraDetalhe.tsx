"use client";

// ═══════════════════════════════════════════════════════════════════════════
// DrawerCompraDetalhe — Drawer lateral com detalhes completos de uma compra
// de metal, incluindo foto da balança, validação IA, aprovação (acima do
// teto) e confirmação de pagamento com comprovante.
//
// REGRA DE NEGÓCIO:
//   - A empresa (Alisson Joias) pagou o fornecedor. O usuário só precisa
//     anexar o comprovante do pagamento para confirmar.
//   - Comprovante (foto/PDF) é OBRIGATÓRIO.
//   - Ao confirmar, a compra é automaticamente marcada como paga.
//   - Se compra acima do teto, exige aprovação antes de pagar.
//
// IMPACTO SE REMOVIDO: Usuário não consegue ver detalhes da compra nem
// confirmar pagamento pelo histórico.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, ImageIcon, CheckCircle2, AlertTriangle, Ban, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import type { CompraRecord } from "@/lib/metal/types";
import StatusPagamento from "./StatusPagamento";
import { getPublicUrl } from "@/lib/storage-url";

interface Props {
  compraId: number | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function DrawerCompraDetalhe({ compraId, onClose, onUpdated }: Props) {
  const [compra, setCompra] = useState<CompraRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Ações de aprovação
  const [aprovando, setAprovando] = useState(false);
  const aprovacao = (compra as any)?.aprovacao;

  // Controle para confirmação de pagamento com comprovante
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [verificandoPagamento, setVerificandoPagamento] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pagamentos: any[] = (compra as any)?.pagamentos ?? [];

  const carregar = useCallback(async () => {
    if (!compraId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/metal/compras/${compraId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao carregar" }));
        throw new Error(err.error || "Erro ao carregar compra");
      }
      setCompra(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [compraId]);

  useEffect(() => {
    if (compraId) carregar();
  }, [compraId, carregar]);

  async function handleCancelar() {
    if (!compraId) return;
    if (!confirm("Tem certeza que deseja cancelar esta compra?")) return;
    setError("");
    try {
      const res = await fetch(`/api/metal/compras/${compraId}/cancelar`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro ao cancelar" }));
        throw new Error(err.error || "Erro ao cancelar");
      }
      toast.success("Compra cancelada.");
      await carregar();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cancelar");
    }
  }

  /** Aprova compra de metal acima do teto */
  async function handleAprovar() {
    if (!aprovacao?.id) return;
    setAprovando(true);
    setError("");
    try {
      const res = await fetch(`/api/metal/aprovacoes/${aprovacao.id}/aprovar`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao aprovar");
      }
      toast.success("Compra aprovada com sucesso!");
      await carregar();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar");
    } finally {
      setAprovando(false);
    }
  }

  /** Rejeita compra de metal acima do teto */
  async function handleRejeitar() {
    if (!aprovacao?.id) return;
    if (!confirm("Rejeitar esta compra? Ela será cancelada.")) return;
    setAprovando(true);
    setError("");
    try {
      const res = await fetch(`/api/metal/aprovacoes/${aprovacao.id}/rejeitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Rejeitado pelo aprovador" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao rejeitar");
      }
      toast.success("Compra rejeitada.");
      await carregar();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar");
    } finally {
      setAprovando(false);
    }
  }

  /** Confirma pagamento com comprovante */
  async function handleConfirmarPagamento() {
    if (!compraId) return;
    if (!comprovanteFile) {
      setError("Anexe o comprovante do pagamento.");
      return;
    }

    // Converte comprovante para base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? (reader.result as string));
      reader.onerror = () => reject(new Error("Erro ao ler o arquivo"));
      reader.readAsDataURL(comprovanteFile);
    }).catch(() => "");

    if (!base64) {
      setError("Erro ao processar o comprovante. Tente novamente.");
      return;
    }

    setVerificandoPagamento(true);
    setError("");
    try {
      const res = await fetch(`/api/metal/compras/${compraId}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comprovante_base64: base64,
          comprovante_media_type: comprovanteFile.type || "image/jpeg",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao confirmar pagamento");
      }
      toast.success("Pagamento confirmado! Metal entrou no cofre.");
      setComprovanteFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await carregar();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar pagamento");
    } finally {
      setVerificandoPagamento(false);
    }
  }

  // REGRA DE NEGÓCIO: sem compra selecionada, o drawer não deve renderizar.
  // Evita estado em branco e chamadas desnecessárias de render.
  // IMPACTO: sem esta guarda, a UI pode abrir painel vazio e confundir o usuário.
  if (!compraId) return null;

  const fotoUrl = compra?.foto_path
    ? getPublicUrl("pagamento-fotos", compra.foto_path)
    : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-[#FAFAF7] shadow-2xl overflow-y-auto animate-[slideIn_0.2s_ease-out]">
        <style jsx>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        <div className="sticky top-0 z-10 bg-[#FAFAF7] border-b border-[#C59B6D]/30 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A3C34]">{compra?.numero || "Detalhe da Compra"}</h2>
            {compra && <div className="mt-1"><StatusPagamento status={compra.status} tipo="compra" /></div>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#1A3C34]/10 rounded-xl transition-colors"><X size={20} className="text-[#1A3C34]" /></button>
        </div>

        <div className="p-6 space-y-6">
          {error && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-4 py-3 rounded-xl"><AlertTriangle size={14} />{error}</div>}
          {loading && !compra && <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-[#C59B6D]" /></div>}

          {compra && (<>
            <DetailSection titulo="Fornecedor">
              <DetailRow label="Nome" value={compra.fornecedor_nome || "—"} />
              {compra.fornecedor_cpf && <DetailRow label="CPF/CNPJ" value={compra.fornecedor_cpf} />}
            </DetailSection>
            <DetailSection titulo="Peso e Valores">
              <DetailRow label="Peso (g)" value={`${Number(compra.peso_gramas).toFixed(3)}g`} />
              <DetailRow label="Cotação do Ouro" value={`R$ ${Number(compra.cotacao_ouro).toFixed(2)}`} />
              <DetailRow label="Valor Pago / g" value={`R$ ${Number(compra.valor_pago_grama).toFixed(2)}`} />
              <div className="flex items-center gap-3"><DetailRow label="Faixa Mínima" value={`R$ ${Number(compra.min_limit).toFixed(2)}`} /><DetailRow label="Faixa Máxima" value={`R$ ${Number(compra.max_limit).toFixed(2)}`} /></div>
              <DetailRow label="Spread / g" value={`R$ ${Number(compra.spread_grama).toFixed(2)}`} />
              <hr className="border-[#C59B6D]/20" />
              <DetailRow label="Valor Total" value={`R$ ${Number(compra.valor_total).toFixed(2)}`} bold />
              <DetailRow label="Economia Total" value={`R$ ${Number(compra.economia_total).toFixed(2)}`} />
              <DetailRow label="Comissão" value={`${Number(compra.comissao_pct).toFixed(0)}% • R$ ${Number(compra.comissao_valor).toFixed(2)}`} />
            </DetailSection>
            <DetailSection titulo="Foto da Balança">
              {fotoUrl ? (<div className="space-y-2">
                <img src={fotoUrl} alt="Foto da balança" className="w-full max-h-64 object-contain rounded-xl border border-[#C59B6D]/20 bg-white" />
                {compra.foto_peso_ia != null && (<div className={`flex items-start gap-2 text-xs p-3 rounded-lg ${compra.ia_match ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{compra.ia_match ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}<div><p><strong>Peso lido pela IA:</strong> {Number(compra.foto_peso_ia).toFixed(3)}g &bull; <strong>Confiança:</strong> {compra.ia_confianca || "—"}</p><p className="mt-0.5">{compra.ia_match ? "Peso confere com a foto da balança." : "Peso NÃO confere com a foto da balança. Verifique."}</p></div></div>)}
                {compra.foto_peso_ia == null && <p className="text-xs text-[#1A3C34]/50">Foto registrada sem validação IA.</p>}
              </div>) : (<div className="flex items-center gap-2 text-xs text-[#1A3C34]/50 bg-white rounded-xl p-4 border border-dashed border-[#C59B6D]/20"><ImageIcon size={16} />Nenhuma foto registrada para esta compra.</div>)}
            </DetailSection>
            {(compra.mp_payment_id || compra.mp_preference_id || compra.mp_payment_status) && (<DetailSection titulo="Pagamento Mercado Pago">
              {compra.mp_payment_id && <DetailRow label="Payment ID" value={compra.mp_payment_id} />}
              {compra.mp_preference_id && <DetailRow label="Preference ID" value={compra.mp_preference_id} />}
              {compra.mp_payment_status && <DetailRow label="Status MP" value={compra.mp_payment_status} />}
              {compra.mp_valor_pago != null && <DetailRow label="Valor Pago" value={`R$ ${Number(compra.mp_valor_pago).toFixed(2)}`} />}
              {compra.mp_diferenca_valor != null && compra.mp_diferenca_valor > 0 && <DetailRow label="Diferença" value={`R$ ${Number(compra.mp_diferenca_valor).toFixed(2)}`} className="text-amber-600" />}
              {compra.mp_data_pagamento && <DetailRow label="Data Pagamento" value={new Date(compra.mp_data_pagamento).toLocaleString("pt-BR")} />}
            </DetailSection>)}
            {pagamentos.length > 0 && (<DetailSection titulo="Histórico de Pagamentos">
              <div className="space-y-2">
                {pagamentos.map((pg: any, i: number) => (
                  <div key={pg.id ?? i} className={`text-xs p-3 rounded-lg border ${
                    pg.status === "approved" || pg.status === "confirmado_manual" ? "bg-emerald-50 border-emerald-200" :
                    pg.status === "rejected" ? "bg-red-50 border-red-200" :
                    "bg-gray-50 border-gray-200"
                  }`}>
                    <div className="flex justify-between">
                      <span className="font-bold">{pg.mp_payment_id}</span>
                      <span className={pg.status === "approved" || pg.status === "confirmado_manual" ? "text-emerald-700" : pg.status === "rejected" ? "text-red-700" : "text-gray-500"}>{pg.status ?? "pendente"}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>R$ {Number(pg.valor_pago ?? 0).toFixed(2)}</span>
                      {pg.diferenca != null && pg.diferenca !== 0 && (
                        <span className={Number(pg.diferenca) > 0 ? "text-emerald-600" : "text-amber-600"}>
                          {Number(pg.diferenca) > 0 ? "+" : ""}R$ {Number(pg.diferenca).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {pg.comprovante_path && (
                      <a href={getPublicUrl("pagamento-fotos", pg.comprovante_path)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-[#1A3C34]/60 hover:text-[#1A3C34] mt-1">
                        <ImageIcon size={12} /> Ver comprovante
                      </a>
                    )}
                    {pg.data_pagamento && <div className="text-[10px] text-gray-400 mt-1">{new Date(pg.data_pagamento).toLocaleString("pt-BR")}</div>}
                  </div>
                ))}
                {(() => {
                  const totalAprovado = pagamentos
                    .filter((pg: any) => pg.status === "approved" || pg.status === "confirmado_manual")
                    .reduce((s: number, pg: any) => s + Number(pg.valor_pago ?? 0), 0);
                  const esperado = Number(compra.valor_total ?? 0);
                  const falta = esperado - totalAprovado;
                  return (
                    <div className="text-xs p-2 rounded-lg bg-[#1A3C34]/5 flex justify-between font-bold">
                      <span>Total confirmado:</span>
                      <span className="text-emerald-700">R$ {totalAprovado.toFixed(2)} / R$ {esperado.toFixed(2)}</span>
                      {falta > 0.01 && <span className="text-amber-600 ml-2">Falta R$ {falta.toFixed(2)}</span>}
                    </div>
                  );
                })()}
              </div>
            </DetailSection>)}
            {compra.observacao && (<DetailSection titulo="Observação"><p className="text-sm text-[#1A3C34]/80 whitespace-pre-wrap bg-white rounded-xl p-4 border border-[#C59B6D]/20">{compra.observacao}</p></DetailSection>)}
            <DetailSection titulo="Auditoria">
              <DetailRow label="Criado por" value={compra.created_by || "—"} />
              <DetailRow label="Criado em" value={new Date(compra.created_at).toLocaleString("pt-BR")} />
              <DetailRow label="Atualizado em" value={new Date(compra.updated_at).toLocaleString("pt-BR")} />
              <DetailRow label="Registrado no Cofre" value={compra.cofre_registrado ? "Sim" : "Não"} />
            </DetailSection>
            {compra.status === "pendente_aprovacao" && aprovacao && (
              <div className="sticky bottom-0 bg-[#FAFAF7] border-t border-[#C59B6D]/30 px-0 py-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-xs">
                  <AlertTriangle size={14} />
                  <span>R$ {Number(aprovacao.valor_pago_grama).toFixed(2)}/g ({((Number(aprovacao.valor_pago_grama) / Number(aprovacao.cotacao_ouro)) * 100).toFixed(0)}% da cotação) — acima do teto de R$ {Number(aprovacao.max_limit).toFixed(2)}/g</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAprovar} disabled={aprovando} className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {aprovando ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Aprovar
                  </button>
                  <button onClick={handleRejeitar} disabled={aprovando} className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-700 border border-red-200 py-3 rounded-xl text-sm font-bold hover:bg-red-100 disabled:opacity-50 transition-colors">
                    {aprovando ? <Loader2 size={14} className="animate-spin" /> : <X size={16} />}
                    Rejeitar
                  </button>
                </div>
              </div>
            )}
            {compra.status === "pendente_pagamento" && (<div className="sticky bottom-0 bg-[#FAFAF7] border-t border-[#C59B6D]/30 -mx-6 -mb-6 px-6 py-4 space-y-2">
              <p className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide">Confirmar Pagamento</p>
              <p className="text-[10px] text-[#1A3C34]/40">A empresa já pagou o fornecedor. Anexe o comprovante do pagamento para confirmar.</p>
              {/* Upload do comprovante (obrigatório) */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setComprovanteFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  id="comprovante-upload"
                />
                <label
                  htmlFor="comprovante-upload"
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors border ${
                    comprovanteFile
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-[#1A3C34]/60 border-[#C59B6D]/20 hover:border-[#C59B6D]"
                  }`}
                >
                  <Upload size={14} />
                  {comprovanteFile ? comprovanteFile.name : "Anexar comprovante (obrigatório)"}
                </label>
                {comprovanteFile && (
                  <button
                    onClick={() => { setComprovanteFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {/* REGRA DE NEGÓCIO: preview do comprovante para confirmar visualmente
                  que o arquivo correto foi anexado (M7). */}
              {comprovanteFile && comprovanteFile.type.startsWith("image/") && (
                <div className="mt-2">
                  <img
                    src={URL.createObjectURL(comprovanteFile)}
                    alt="Preview do comprovante"
                    className="max-h-32 rounded-lg border border-[#C59B6D]/20 object-contain"
                  />
                </div>
              )}
              <button
                onClick={handleConfirmarPagamento}
                disabled={verificandoPagamento || !comprovanteFile}
                className="flex items-center justify-center gap-2 w-full bg-[#1A3C34] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#1A3C34]/90 disabled:opacity-50 transition-colors"
              >
                {verificandoPagamento ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Confirmar Pagamento
              </button>
              <button onClick={handleCancelar} className="flex items-center justify-center gap-2 w-full text-red-600 border border-red-200 py-2.5 rounded-xl text-xs font-bold hover:bg-red-50 transition-colors mt-2"><Ban size={14} />Cancelar Compra</button>
            </div>)}
          </>)}
        </div>
      </div>
    </>
  );
}

function DetailSection({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="space-y-2"><h3 className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide">{titulo}</h3><div className="bg-white rounded-xl border border-[#C59B6D]/20 p-4 space-y-1.5">{children}</div></div>;
}
function DetailRow({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide shrink-0">{label}</span><span className={`text-sm text-right ${bold ? "font-bold text-[#1A3C34]" : "font-medium text-[#1A3C34]/80"} ${className ?? ""}`}>{value}</span></div>;
}
