"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function NotificationDropdown() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [notifying, setNotifying] = useState(true);

  const { data: contagem } = useQuery({
    queryKey: ["notificacoes", "contagem"],
    queryFn: async () => { const res = await fetch("/api/notificacoes/contagem"); if (!res.ok) return { nao_lidas: 0 }; return res.json() as Promise<{ nao_lidas: number }>; },
    refetchInterval: 60_000, staleTime: 30_000,
  });
  const naoLidas = (contagem?.nao_lidas as number | undefined) ?? 0;

  useEffect(() => { setNotifying(naoLidas > 0); }, [naoLidas]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("notificacoes-badge")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "INSERT", schema: "alissonerp", table: "notificacoes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notificacoes", "contagem"] });
        setNotifying(true);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  async function recarregar() {
    setCarregando(true);
    try { const res = await fetch("/api/notificacoes"); if (res.ok) { const data = await res.json(); setNotificacoes(Array.isArray(data) ? data : []); } else setNotificacoes([]); } catch { setNotificacoes([]); } finally { setCarregando(false); }
  }

  function handleClick() { setIsOpen(true); setNotifying(false); recarregar(); }
  function closeDropdown() { setIsOpen(false); }

  async function marcarLida(id: string, link: string | null) {
    try {
      await fetch(`/api/notificacoes/${id}/ler`, { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) => prev.map(n => (n.id === id ? { ...n, lida: true } : n)));
      queryClient.setQueryData(["notificacoes", "contagem"], (prev: { nao_lidas: number } | undefined) => ({ nao_lidas: prev ? Math.max(0, prev.nao_lidas - 1) : 0 }));
      if (link) { router.push(link); setIsOpen(false); }
    } catch { /* silencioso */ }
  }

  async function marcarTodas() {
    try {
      await fetch("/api/notificacoes/ler-todas", { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) => prev.map(n => ({ ...n, lida: true })));
      queryClient.setQueryData(["notificacoes", "contagem"], { nao_lidas: 0 });
    } catch { /* silencioso */ }
  }

  return (
    <div className="relative">
      <button onClick={handleClick}
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100">
        <span className={`absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-orange-400 ${!notifying ? "hidden" : "flex"}`}>
          <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping" />
        </span>
        <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={closeDropdown} />
          <div className="absolute -right-[240px] lg:right-0 mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-lg z-20 sm:w-[361px]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
              <h5 className="text-lg font-semibold text-gray-800">Notificações</h5>
              <button onClick={closeDropdown} className="text-gray-400 hover:text-gray-600">
                <svg className="fill-current" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill="currentColor" />
                </svg>
              </button>
            </div>

            <ul className="flex flex-col overflow-y-auto custom-scrollbar flex-1">
              {carregando ? (
                <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
              ) : notificacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <svg className="mb-2" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                  <span className="text-sm">Nenhuma notificação</span>
                </div>
              ) : (
                notificacoes.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => marcarLida(n.id, n.link || null)}
                      className={`flex gap-3 rounded-lg border-b border-gray-100 p-3 w-full text-left hover:bg-gray-50 transition-colors ${!n.lida ? "bg-blue-50/50" : ""}`}>
                      <span className="block w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-gray-500">
                          {(n.titulo || "N")[0].toUpperCase()}
                        </span>
                      </span>
                      <span className="block flex-1 min-w-0">
                        <span className="mb-1 block text-sm text-gray-500">
                          <span className="font-medium text-gray-800">{n.titulo || "Notificação"}</span>
                          {n.mensagem && <span className="ml-1">{n.mensagem}</span>}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-gray-400">
                          {n.created_at && <span>{new Date(n.created_at).toLocaleString("pt-BR")}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>

            {notificacoes.length > 0 && (
              <button onClick={marcarTodas}
                className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">
                Marcar todas como lidas
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
