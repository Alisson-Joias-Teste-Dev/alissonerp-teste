// ═══════════════════════════════════════════════════════════════════════════
// Bottom-sheet de Aprovação Inline (mobile-first)
//
// Aprovar/rejeitar tarefas em 1 toque a partir do drawer de notificações,
// sem sair da tela atual. Usa o mesmo PATCH /api/tarefas/[id]/aprovacao que
// a página de tarefas, garantindo MESMOS efeitos colaterais (comissão 0,5%,
// liberação de cartão, processamento de crédito/devolução, etc.).
//
// REGRA DE NEGÓCIO (Bug 3 — ver NotificacoesDrawer.tsx): qualquer aprovação
// inline DEVE chamar este endpoint. Não duplicar lógica de aprovação.
// ═══════════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import { useErrorStore } from "@/stores/errorStore";

interface DetalhesAprovacao {
  tarefa: {
    id: number;
    titulo: string;
    descricao: string | null;
    tipo: string | null;
    status: string;
    tags: string[];
    created_at: string;
  };
  aprovacao: {
    id: number;
    solicitante_nome: string;
    solicitante_role: string;
    status: string;
    motivo: string | null;
  } | null;
  venda: {
    id: number;
    numero_pedido: string | null;
    valor_total: number;
    valor_desconto: number | null;
    desconto_percentual: number | null;
    forma_pagamento: string | null;
    cliente_nome: string | null;
    status: string;
  } | null;
}

interface Props {
  tarefaId: number | null;
  onClose: () => void;
  onDecisao: () => void;
}

function tempoRelativo(data: string): string {
  const diff = Date.now() - new Date(data).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `há ${hrs} hora${hrs > 1 ? "s" : ""}`;
  const dias = Math.floor(hrs / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatarBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AprovacaoBottomSheet({ tarefaId, onClose, onDecisao }: Props) {
  const [detalhes, setDetalhes] = useState<DetalhesAprovacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [modoRejeicao, setModoRejeicao] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pushToast = useErrorStore((s) => s.push);

  useEffect(() => {
    if (tarefaId == null) {
      setDetalhes(null);
      setModoRejeicao(false);
      setMotivo("");
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setDetalhes(null);
    fetch(`/api/tarefas/${tarefaId}/detalhes-aprovacao`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: DetalhesAprovacao) => {
        if (!cancelado) setDetalhes(data);
      })
      .catch(() => {
        if (!cancelado) {
          pushToast("Não foi possível carregar os detalhes da aprovação", { level: "warning" });
          onClose();
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [tarefaId, pushToast, onClose]);

  async function enviarDecisao(decisao: "aprovado" | "rejeitado") {
    if (!detalhes?.aprovacao || tarefaId == null) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/tarefas/${tarefaId}/aprovacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aprovacao_id: detalhes.aprovacao.id,
          decisao,
          ...(decisao === "rejeitado" && motivo.trim() ? { motivo: motivo.trim() } : {}),
        }),
      });
      if (!r.ok) {
        const erro = await r.json().catch(() => ({}));
        throw new Error(erro?.error ?? `Falha ${r.status}`);
      }
      pushToast(decisao === "aprovado" ? "Aprovado com sucesso" : "Rejeitado", { level: "success" });
      onDecisao();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar decisão";
      pushToast(msg, { level: "critical" });
    } finally {
      setEnviando(false);
    }
  }

  if (tarefaId == null) return null;

  const venda = detalhes?.venda ?? null;
  const aprov = detalhes?.aprovacao ?? null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={() => { if (!enviando) onClose(); }}
      />

      <div
        className="fixed left-0 right-0 bottom-0 z-[70] flex flex-col rounded-t-2xl shadow-2xl"
        style={{
          backgroundColor: "#fff",
          maxHeight: "85vh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <button
          onClick={() => { if (!enviando) onClose(); }}
          className="flex items-center justify-center py-3"
          aria-label="Fechar"
        >
          <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: "#d1d5db" }} />
        </button>

        <div className="px-5 pb-2">
          <h2 className="text-base font-semibold" style={{ color: "#184036" }}>
            Solicitação de Aprovação
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {carregando || !detalhes ? (
            <div className="flex items-center justify-center py-12 text-sm" style={{ color: "#80A795" }}>
              Carregando...
            </div>
          ) : (
            <div className="space-y-3">
              {aprov && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                    Solicitante
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "#111827" }}>
                      {aprov.solicitante_nome || "—"}
                    </span>
                    {aprov.solicitante_role && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#e8efe9", color: "#184036" }}
                      >
                        {aprov.solicitante_role}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                  Tipo
                </span>
                <span className="text-sm" style={{ color: "#111827" }}>
                  {detalhes.tarefa.titulo}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                  Quando
                </span>
                <span className="text-sm" style={{ color: "#4b5563" }}>
                  {tempoRelativo(detalhes.tarefa.created_at)}
                </span>
              </div>

              {venda && (
                <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#e5e7eb", backgroundColor: "#f9fafb" }}>
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: "#6b7280" }}>Venda</span>
                    <span className="text-xs font-medium" style={{ color: "#111827" }}>
                      {venda.numero_pedido ?? `#${venda.id}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs" style={{ color: "#6b7280" }}>Valor</span>
                    <span className="text-xs font-medium" style={{ color: "#111827" }}>
                      {formatarBRL(venda.valor_total)}
                    </span>
                  </div>
                  {(venda.valor_desconto != null || venda.desconto_percentual != null) && (
                    <div className="flex justify-between">
                      <span className="text-xs" style={{ color: "#6b7280" }}>Desconto</span>
                      <span className="text-xs font-medium" style={{ color: "#dc2626" }}>
                        {venda.valor_desconto != null ? formatarBRL(venda.valor_desconto) : ""}
                        {venda.desconto_percentual != null
                          ? ` (${venda.desconto_percentual.toFixed(2)}%)`
                          : ""}
                      </span>
                    </div>
                  )}
                  {venda.forma_pagamento && (
                    <div className="flex justify-between">
                      <span className="text-xs" style={{ color: "#6b7280" }}>Pagamento</span>
                      <span className="text-xs font-medium" style={{ color: "#111827" }}>
                        {venda.forma_pagamento}
                      </span>
                    </div>
                  )}
                  {venda.cliente_nome && (
                    <div className="flex justify-between">
                      <span className="text-xs" style={{ color: "#6b7280" }}>Cliente</span>
                      <span className="text-xs font-medium text-right" style={{ color: "#111827" }}>
                        {venda.cliente_nome}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {detalhes.tarefa.descricao && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                    Detalhes
                  </span>
                  <p className="text-xs whitespace-pre-line leading-relaxed" style={{ color: "#4b5563" }}>
                    {detalhes.tarefa.descricao}
                  </p>
                </div>
              )}

              {modoRejeicao && (
                <div className="flex flex-col gap-1 pt-2">
                  <label className="text-[11px] uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                    Motivo da rejeição (opcional)
                  </label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ borderColor: "#d1d5db" }}
                    placeholder="Explique o motivo..."
                    disabled={enviando}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {detalhes && aprov && (
          <div className="px-5 py-4 border-t flex flex-col gap-2" style={{ borderColor: "#e5e7eb" }}>
            {!modoRejeicao ? (
              <>
                <button
                  onClick={() => enviarDecisao("aprovado")}
                  disabled={enviando}
                  className="w-full rounded-lg font-semibold text-sm text-white transition-opacity active:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: "#16a34a", minHeight: "48px" }}
                >
                  {enviando ? "Enviando..." : "✓ Aprovar"}
                </button>
                <button
                  onClick={() => setModoRejeicao(true)}
                  disabled={enviando}
                  className="w-full rounded-lg font-semibold text-sm text-white transition-opacity active:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: "#dc2626", minHeight: "48px" }}
                >
                  ✗ Rejeitar
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => enviarDecisao("rejeitado")}
                  disabled={enviando}
                  className="w-full rounded-lg font-semibold text-sm text-white transition-opacity active:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: "#dc2626", minHeight: "48px" }}
                >
                  {enviando ? "Enviando..." : "Confirmar rejeição"}
                </button>
                <button
                  onClick={() => { setModoRejeicao(false); setMotivo(""); }}
                  disabled={enviando}
                  className="w-full rounded-lg font-medium text-sm transition-opacity active:opacity-80 disabled:opacity-50"
                  style={{ backgroundColor: "#f3f4f6", color: "#374151", minHeight: "48px" }}
                >
                  Voltar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
