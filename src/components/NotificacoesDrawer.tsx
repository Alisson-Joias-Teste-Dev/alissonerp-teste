// ═══════════════════════════════════════════════════════════════════════════
// Drawer de Notificações
//
// REGRA DE NEGÓCIO (Bug 3): removido o botão "Aprovar Desconto" inline.
// Antes: a notificação tinha um botão que aprovava o desconto direto,
//   mas SEM reduzir a comissão da vendedora para 0,5%.
//   A aprovação via página de tarefas reduzia a comissão.
//   Mesma ação, resultados diferentes → bug de inconsistência.
// Agora: toda notificação de aprovação leva para a página de tarefas.
//   Um único caminho, comportamento consistente.
//
// Se alterar: garantir que aprovação inline (se readicionada) tenha OS
// MESMOS efeitos (comissão, notificação, etc.) que a aprovação via tarefa.
// ═══════════════════════════════════════════════════════════════════════════

"use client";

import { X, Bell } from "lucide-react";

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

export function NotificacoesDrawer({
  aberto,
  onFechar,
  notificacoes,
  onMarcarLida,
  onMarcarTodas,
  carregando,
}: Props) {
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
                        {n.mensagem.length > 300 ? n.mensagem.slice(0, 300) + "…" : n.mensagem}
                      </p>
                    )}

                    {n.link && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarcarLida(n.id, n.link); }}
                        className="text-[10px] mt-1 hover:underline"
                        style={{ color: "#4A7568" }}
                      >
                        Ver →
                      </button>
                    )}

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
    </>
  );
}
