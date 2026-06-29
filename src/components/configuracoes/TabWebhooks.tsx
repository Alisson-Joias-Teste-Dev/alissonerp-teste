"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Search, X, Terminal, Copy, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispararWebhook } from "@/lib/webhooks";
import { fmtDate } from "./constants";
import type { Webhook, WebhookLog } from "./types";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

const ITEMS_PER_PAGE = 8;

export default function TabWebhooks({ webhooks: initial, logs }: { webhooks: Webhook[]; logs: WebhookLog[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const supabase = createClient();

  const [webhooks, setWebhooks] = useState(initial);
  const [toggling, setToggling] = useState<number | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);

  useEffect(() => { setPage(1); }, [search]);

  async function toggleAtivo(wh: Webhook, checked: boolean) {
    setToggling(wh.id);
    await supabase.from("webhook_config").update({ ativo: checked }).eq("id", wh.id);
    setToggling(null);
    setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, ativo: checked } : w));
    toast.success(`Webhook "${wh.nome}" ${checked ? "ativado" : "desativado"}`);
    startTransition(() => router.refresh());
  }

  async function testar(nome: string) {
    setTestando(nome);
    const result = await dispararWebhook(nome, { teste: true, ts: Date.now() });
    setTestando(null);
    if (result.success) toast.success(`Teste: ${nome} respondeu HTTP ${result.status}`);
    else toast.error(`Teste: ${nome} falhou — ${result.error}`);
    startTransition(() => router.refresh());
  }

  async function copiarLogs() {
    if (!logsRef.current) return;
    try { await navigator.clipboard.writeText(logsRef.current.textContent || ""); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { }
  }

  const filtrados = search.trim()
    ? webhooks.filter(w => w.nome.toLowerCase().includes(search.toLowerCase()) || (w.descricao ?? "").toLowerCase().includes(search.toLowerCase()))
    : webhooks;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITEMS_PER_PAGE));

  return (
    <div>
      {/* Search + Logs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar webhook..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setLogsModalOpen(true)} startIcon={<Terminal size={14} />}>Visualizar Logs</Button>
      </div>

      {/* Tabela */}
      <Table>
        <TableHeader>
          <TableRow>
            {["Nome", "Descrição", "Disparos", "Último", "Ativo", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-12 text-gray-400">{search ? "Nenhum resultado" : "Nenhum webhook configurado"}</TableCell></TableRow>
          ) : filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map(wh => {
            return (
              <TableRow key={wh.id}>
                <TableCell><span className="font-mono text-sm font-medium text-gray-900">{wh.nome}</span></TableCell>
                <TableCell className="max-w-[220px] truncate text-gray-500">{wh.descricao ?? "—"}</TableCell>
                <TableCell className="tabular-nums font-medium">{wh.total_disparos}</TableCell>
                <TableCell className="text-gray-500">{wh.ultimo_disparo ? fmtDate(wh.ultimo_disparo) : "—"}</TableCell>
                <TableCell>
                  <Switch checked={wh.ativo} onChange={(checked) => toggleAtivo(wh, checked)} disabled={toggling === wh.id} color="brand" />
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => testar(wh.nome)} loading={testando === wh.nome} disabled={!wh.ativo} startIcon={testando !== wh.nome ? <RefreshCw size={12} /> : undefined}>
                      {testando === wh.nome ? "Testando..." : "Testar"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-4">
          <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtrados.length} itens)</p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? "bg-esmeralda-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{p}</button>
            ))}
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próximo</Button>
          </div>
        </div>
      )}

      {/* Modal de Logs */}
      <Modal isOpen={logsModalOpen} onClose={() => setLogsModalOpen(false)} title="Log de Disparos" description="Últimos 30 eventos registrados" size="lg">
        <div className="relative">
          <button onClick={copiarLogs} className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {copiado ? <><CheckCircle2 size={12} className="text-success-500" />Copiado!</> : <><Copy size={12} />Copiar</>}
          </button>
          <pre ref={logsRef} className="bg-gray-900 text-gray-100 rounded-xl p-5 text-xs font-mono leading-relaxed overflow-x-auto max-h-96 overflow-y-auto select-all" style={{ tabSize: 2 }}>
            {logs.length === 0 ? "Nenhum disparo registrado ainda."
              : logs.map(l => `${l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "—"} [${l.response_status ?? "---"}] ${l.webhook_nome ?? "?"}${l.erro ? ` ${l.erro}` : ""}\n`)
            }
          </pre>
        </div>
      </Modal>
    </div>
  );
}
