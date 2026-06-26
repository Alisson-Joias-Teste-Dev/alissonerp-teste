// ═══════════════════════════════════════════════════════════════════════════
// Drawer de Notificações
//
// REGRA DE NEGÓCIO (Bug 3): toda aprovação inline DEVE usar o mesmo endpoint
// PATCH /api/tarefas/[id]/aprovacao da página de tarefas — garantindo MESMOS
// efeitos colaterais (comissão 0,5%, liberação cartão, etc.).
// Aprovação em 1 toque via AprovacaoBottomSheet (mobile-first): clicar em
// "Aprovar →" abre o bottom-sheet, que chama o endpoint canônico.
// Se readicionar outra forma de aprovação inline: usar o mesmo endpoint.
// ═══════════════════════════════════════════════════════════════════════════

"use client";

import { useState } from "react";
import { X, Bell, BellRing } from "lucide-react";
import { AprovacaoBottomSheet } from "@/components/AprovacaoBottomSheet";
import { usePushSubscription } from "@/hooks/usePushSubscription";

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  remetente_nome: string | null;
  created_at: string;
  venda_id?: number | null;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  notificacoes: Notificacao[];
  onMarcarLida: (id: string, link: string | null) => void;
  onMarcarTodas: () => void;
  carregando: boolean;
  onRecarregar?: () => void;
}

function tempoRelativo(data: string): string {
  const diff = Date.now() - new Date(data).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const dias = Math.floor(hrs / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function extrairTarefaId(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/[?&]abrir=(\d+)/) || link.match(/\/tarefas\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function NotificacoesDrawer({
  aberto,
  onFechar,
  notificacoes,
  onMarcarLida,
  onMarcarTodas,
  carregando,
  onRecarregar,
}: Props) {
  const [tarefaAprovId, setTarefaAprovId] = useState<number | null>(null);
  const { suportado, inscrito, carregando: carregandoPush, erro, permissao, inscrever } = usePushSubscription();
  /**
   * REGRA DE NEGOCIO: o usuario precisa saber se o celular foi realmente
   * inscrito para receber alertas de aprovacao, mencao e tarefas fora do ERP.
   * POR QUE: o banco estava sem assinaturas push e o botao antigo nao mostrava
   * falhas de permissao, chave VAPID ou API.
   * IMPACTO: se este feedback for removido, o problema volta a parecer apenas
   * "notificacao nao funciona" sem indicar onde a ativacao quebrou.
   */
  const mostrarBannerPush = !inscrito && permissao !== "denied";

  if (!aberto) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onFechar} />

      <div
        className="fixed left-0 md:left-56 top-0 h-full w-full md:w-[380px] z-50 flex flex-col shadow-2xl"
        style={{ backgroundColor: "#fff", borderLeft: "1px solid #e5e7eb" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#e5e7eb" }}>
          <h2 className="font-semibold text-sm tracking-wide" style={{ color: "#184036" }}>
            Notificações
          </h2>
          <button onClick={onFechar} className="p-1 rounded transition-colors hover:opacity-70" style={{ color: "#4A7568" }}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {mostrarBannerPush && (
          <div className="border-b px-4 py-2.5 text-xs" style={{ backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" }}>
            <button
              onClick={inscrever}
              disabled={!suportado || carregandoPush}
              className="w-full flex items-center gap-2 font-medium transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <BellRing size={14} />
              {carregandoPush ? "Ativando notificações push..." : "Ativar notificações push"}
            </button>
            {!suportado && (
              <p className="mt-1.5 leading-snug" style={{ color: "#854d0e" }}>
                Este celular ou navegador nao esta pronto para Web Push. No iPhone, instale o ERP na tela inicial e abra pelo icone instalado.
              </p>
            )}
            {erro && (
              <p className="mt-1.5 leading-snug" style={{ color: "#b91c1c" }}>{erro}</p>
            )}
          </div>
        )}

        {inscrito && (
          <div className="border-b px-4 py-2 text-xs font-medium" style={{ backgroundColor: "#ecfdf5", borderColor: "#bbf7d0", color: "#047857" }}>
            Notificações push ativadas.
          </div>
        )}

        {permissao === "denied" && (
          <div className="border-b px-4 py-2 text-xs leading-snug" style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}>
            Permissao de notificacao negada no navegador. Libere nas configuracoes do celular para ativar.
          </div>
        )}

        {notificacoes.some((n) => !n.lida) && (
          <div className="px-4 py-2 border-b" style={{ borderColor: "#e5e7eb" }}>
            <button onClick={onMarcarTodas} className="text-xs transition-colors hover:opacity-70" style={{ color: "#184036" }}>
              Marcar todas como lidas
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {carregando ? (
            <div className="flex items-center justify-center h-32 text-xs" style={{ color: "#80A795" }}>
              Carregando...
            </div>
          ) : notificacoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: "#80A795" }}>
              <Bell size={28} strokeWidth={1.5} style={{ opacity: 0.4 }} />
              <span className="text-xs">Nenhuma notificação</span>
            </div>
          ) : (
            notificacoes.map((n) => {
              const tarefaIdAprov = n.tipo === "aprovacao" ? extrairTarefaId(n.link) : null;
              return (
                <div
                  key={n.id}
                  onClick={() => onMarcarLida(n.id, n.link)}
                  className="flex gap-3 px-4 py-3 border-b transition-colors"
                  style={{
                    borderColor: "#e5e7eb",
                    backgroundColor: n.lida ? "transparent" : "#f9fafb",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "#f3f4f6"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = n.lida ? "transparent" : "#f9fafb"; }}
                >
                  <div className="pt-1.5 flex-shrink-0 w-2">
                    {!n.lida && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#184036" }} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug" style={{ color: n.lida ? "#6b7280" : "#111827", fontWeight: n.lida ? 400 : 600 }}>
                      {n.titulo}
                    </p>
                    {n.mensagem && (
                      <p className="text-[11px] mt-1 whitespace-pre-line leading-relaxed" style={{ color: "#6b7280" }}>
                        {(() => {
                          const txt = n.mensagem.replace(/\\n/g, "\n").replace(/• null\s?—?\s?/g, "• ");
                          return txt.length > 300 ? txt.slice(0, 300) + "…" : txt;
                        })()}
                      </p>
                    )}

                    {tarefaIdAprov != null ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setTarefaAprovId(tarefaIdAprov); }}
                        className="text-[11px] mt-1.5 font-semibold hover:underline"
                        style={{ color: "#16a34a" }}
                      >
                        Aprovar →
                      </button>
                    ) : n.link ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarcarLida(n.id, n.link); }}
                        className="text-[10px] mt-1 hover:underline"
                        style={{ color: "#4A7568" }}
                      >
                        Ver →
                      </button>
                    ) : null}

                    <p className="text-[10px] mt-1.5" style={{ color: "#9ca3af" }}>
                      {tempoRelativo(n.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <AprovacaoBottomSheet
        tarefaId={tarefaAprovId}
        onClose={() => setTarefaAprovId(null)}
        onDecisao={() => { onRecarregar?.(); }}
      />
    </>
  );
}
