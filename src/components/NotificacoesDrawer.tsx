"use client";

import { X, Bell, Check } from "lucide-react";
import { useState } from "react";

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

function BotaoAprovarDesconto({ notifId, vendaId, onAprovado }: { notifId: string; vendaId: number; onAprovado: (id: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [aprovado, setAprovado] = useState(false);
  const [erro, setErro] = useState("");

  async function aprovar(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/vendas/${vendaId}/aprovar-desconto`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        setErro(d.error ?? "Erro");
        return;
      }
      setAprovado(true);
      onAprovado(notifId);
    } catch {
      setErro("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  if (aprovado) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium mt-2" style={{ color: "#184036" }}>
        <Check size={12} /> Aprovado
      </span>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={aprovar}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "#184036", color: "#fff" }}
      >
        {loading ? "Aprovando..." : "✓ Aprovar Desconto"}
      </button>
      {erro && <p className="text-[10px] mt-1" style={{ color: "#dc2626" }}>{erro}</p>}
    </div>
  );
}

export function NotificacoesDrawer({
  aberto,
  onFechar,
  notificacoes,
  onMarcarLida,
  onMarcarTodas,
  carregando,
}: Props) {
  const [aprovadas, setAprovadas] = useState<Set<string>>(new Set());

  if (!aberto) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onFechar} />

      <div
        className="fixed left-0 md:left-56 top-0 h-full w-full md:w-[380px] z-50 flex flex-col shadow-2xl"
        style={{ backgroundColor: "#fff", borderLeft: "1px solid #e5e7eb" }}
      >
        {/* Header */}
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

        {/* Lista */}
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
              const isAprovacaoDesconto = n.tipo === "aprovacao" && !!n.venda_id && !aprovadas.has(n.id);
              return (
                <div
                  key={n.id}
                  onClick={() => !isAprovacaoDesconto && onMarcarLida(n.id, n.link)}
                  className="flex gap-3 px-4 py-3 border-b transition-colors"
                  style={{
                    borderColor: "#e5e7eb",
                    backgroundColor: n.lida ? "transparent" : "#f9fafb",
                    cursor: isAprovacaoDesconto ? "default" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (!isAprovacaoDesconto) (e.currentTarget as HTMLDivElement).style.backgroundColor = "#f3f4f6"; }}
                  onMouseLeave={(e) => { if (!isAprovacaoDesconto) (e.currentTarget as HTMLDivElement).style.backgroundColor = n.lida ? "transparent" : "#f9fafb"; }}
                >
                  {/* Bolinha */}
                  <div className="pt-1.5 flex-shrink-0 w-2">
                    {!n.lida && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#184036" }} />}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug" style={{ color: n.lida ? "#6b7280" : "#111827", fontWeight: n.lida ? 400 : 600 }}>
                      {n.titulo}
                    </p>
                    {n.mensagem && (
                      <p className="text-[11px] mt-1 whitespace-pre-line leading-relaxed" style={{ color: "#6b7280" }}>
                        {n.mensagem.length > 300 ? n.mensagem.slice(0, 300) + "…" : n.mensagem}
                      </p>
                    )}

                    {/* Botão aprovar desconto inline */}
                    {isAprovacaoDesconto && n.venda_id && (
                      <BotaoAprovarDesconto
                        notifId={n.id}
                        vendaId={n.venda_id}
                        onAprovado={(id) => {
                          setAprovadas((prev) => new Set(prev).add(id));
                          onMarcarLida(id, null);
                        }}
                      />
                    )}

                    {/* Link para ver venda (notificações não-aprovação) */}
                    {!isAprovacaoDesconto && n.link && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarcarLida(n.id, n.link); }}
                        className="text-[10px] mt-1 hover:underline"
                        style={{ color: "#4A7568" }}
                      >
                        Ver venda →
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
