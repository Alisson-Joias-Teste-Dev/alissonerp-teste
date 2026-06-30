"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Search, X, Save, AlertTriangle, ClipboardList } from "lucide-react";
import { Button, Badge, Modal, Select, InputField } from "@/components/ui";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";
import { fmtDate, type AuditoriaHeader } from "./types";

const ITENS_POR_PAGINA = 10;

const STATUS_MAP: Record<string, { color: "warning" | "success" | "error"; label: string }> = {
  em_andamento: { color: "warning", label: "Em andamento" },
  concluido:    { color: "success", label: "Concluído" },
  cancelado:    { color: "error", label: "Cancelado" },
};

export default function AuditoriaLista() {
  const router = useRouter();
  const [auditorias, setAuditorias] = useState<AuditoriaHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showCriar, setShowCriar] = useState(false);
  const [locais, setLocais] = useState<{ id: number; nome: string }[]>([]);
  const [novoLocal, setNovoLocal] = useState("");
  const [novoObs, setNovoObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrirModal() {
    setNovoLocal(locais.length > 0 ? String(locais[0].id) : "");
    setNovoObs("");
    setErro(null);
    setShowCriar(true);
  }

  useEffect(() => { setPage(1); }, [search]);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/estoque-comercial/auditoria");
      if (r.ok) setAuditorias(await r.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    fetch("/api/locais-estoque").then(r => r.json()).then((data: { id: number; nome: string }[]) => {
      setLocais(data);
      if (data.length > 0) setNovoLocal(String(data[0].id));
    }).catch(() => {});
  }, []);

  async function handleCriar() {
    if (!novoLocal) { setErro("Selecione um local"); return; }
    setSaving(true); setErro(null);
    try {
      const r = await fetch("/api/estoque-comercial/auditoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_estoque_id: Number(novoLocal), obs: novoObs || undefined }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409) { setErro(data.error); return; }
        throw new Error(data.error ?? "Erro ao criar");
      }
      toast.success("Auditoria criada com sucesso!");
      setShowCriar(false);
      await carregar();
      router.push(`/estoque-comercial/auditoria/${data.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally { setSaving(false); }
  }

  const filtradas = search.trim()
    ? auditorias.filter(a => a.local_nome?.toLowerCase().includes(search.toLowerCase()) || String(a.id).includes(search))
    : auditorias;

  const totalPages = Math.max(1, Math.ceil(filtradas.length / ITENS_POR_PAGINA));
  const paginadas = filtradas.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header + Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar por local ou ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none transition" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <Button size="md" onClick={abrirModal} startIcon={<Plus size={16} />}>Nova Auditoria</Button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {["ID", "Local", "Status", "Progresso", "Divergências", "Data", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginadas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <ClipboardList size={32} className="text-gray-300" />
                    <span>{search ? "Nenhuma auditoria encontrada" : "Nenhuma auditoria realizada."}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginadas.map(a => {
                const progresso = a.total_itens > 0 ? Math.round((a.itens_contados / a.total_itens) * 100) : 0;
                const sb = STATUS_MAP[a.status] ?? STATUS_MAP.cancelado;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-gray-900">#{a.id}</TableCell>
                    <TableCell className="text-gray-700">{a.local_nome}</TableCell>
                    <TableCell><Badge color={sb.color} size="sm">{sb.label}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full max-w-[120px]">
                          <div className="h-full rounded-full bg-esmeralda-500 transition-all" style={{ width: `${progresso}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{a.itens_contados}/{a.total_itens}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.itens_divergentes > 0
                        ? <span className="text-sm font-medium text-error-500">{a.itens_divergentes}</span>
                        : <span className="text-sm text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{fmtDate(a.created_at)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/estoque-comercial/auditoria/${a.id}`)}>Abrir</Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtradas.length} itens)</p>
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

      {/* Modal Nova Auditoria */}
      <Modal isOpen={showCriar} onClose={() => { setShowCriar(false); setErro(null); }} title="Nova Auditoria" description="Selecione o local e o sistema fará snapshot automático dos produtos." size="md">
        <div className="space-y-5">
          <Select label="Local de estoque" options={locais.map(l => ({ value: String(l.id), label: l.nome }))} placeholder="Selecione..."
            value={novoLocal} onChange={e => setNovoLocal(e.target.value as string)} />
          <InputField label="Observação (opcional)" placeholder="Ex: Auditoria geral da loja - Junho 2026" value={novoObs} onChange={e => setNovoObs(e.target.value as string)} />
          {erro && (
            <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
              <AlertTriangle size={15} className="shrink-0" />
              {erro}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => { setShowCriar(false); setErro(null); }} disabled={saving} className="flex-1">Cancelar</Button>
            <Button size="md" onClick={handleCriar} loading={saving} startIcon={<Save size={14} />} className="flex-1">Iniciar Auditoria</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
