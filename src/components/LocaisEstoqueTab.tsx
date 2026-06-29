"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Check, X, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { InputField } from "@/components/ui/InputField";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

const ITENS_POR_PAGINA = 8;

interface Local { id: number; nome: string; ativo: boolean; }
interface Props { canEdit: boolean; }

export default function LocaisEstoqueTab({ canEdit }: Props) {
  const [locais, setLocais] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  async function loadLocais() { setLoading(true); setError(""); try { const res = await fetch("/api/locais-estoque"); if (!res.ok) throw new Error("Erro ao carregar"); const data = await res.json(); setLocais(Array.isArray(data) ? data : []); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erro"); } finally { setLoading(false); } }
  useEffect(() => { loadLocais(); }, []);

  async function handleCreate() {
    if (!novoNome.trim()) { setCreateError("Nome é obrigatório."); return; }
    setCreating(true); setCreateError("");
    try {
      const res = await fetch("/api/locais-estoque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novoNome.trim() }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Erro ao criar"); }
      setNovoNome(""); setShowCreate(false); await loadLocais(); toast.success("Local criado");
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : "Erro"); } finally { setCreating(false); }
  }

  async function handleSaveEdit(id: number) {
    if (!editNome.trim()) { setSaveError("Nome é obrigatório."); return; }
    setSaving(true); setSaveError("");
    try {
      const res = await fetch(`/api/locais-estoque/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: editNome.trim() }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Erro ao salvar"); }
      setEditingId(null); await loadLocais(); toast.success("Local atualizado");
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : "Erro"); } finally { setSaving(false); }
  }

  async function handleToggleAtivo(local: Local) {
    if (local.id === 1) return;
    try { await fetch(`/api/locais-estoque/${local.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !local.ativo }) }); await loadLocais(); toast.success(local.ativo ? "Local desativado" : "Local ativado"); } catch { }
  }

  const filtrados = search.trim() ? locais.filter(l => l.nome.toLowerCase().includes(search.toLowerCase())) : locais;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar local..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
        </div>
        {canEdit && <Button size="sm" onClick={() => { setShowCreate(true); setNovoNome(""); setCreateError(""); }} startIcon={<Plus size={14} />}>Novo Local</Button>}
      </div>

      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setNovoNome(""); setCreateError(""); }} title="Novo Local" description="Cadastre um novo local de estoque" size="sm">
        <div className="space-y-4">
          <InputField placeholder="Ex: Vitrine Loja" value={novoNome} onChange={e => setNovoNome(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCreate(); }} />
          {createError && <p className="text-xs text-error-600">{createError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setNovoNome(""); setCreateError(""); }}>Cancelar</Button>
            <Button size="sm" onClick={handleCreate} loading={creating} startIcon={!creating ? <Check size={12} /> : undefined}>{creating ? "Criando..." : "Criar"}</Button>
          </div>
        </div>
      </Modal>

      {error && <div className="rounded-lg px-3 py-2 text-xs bg-error-50 text-error-600">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Carregando...</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {["Local", "Tipo", "Status", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginados.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-gray-400 py-8">{search ? "Nenhum local encontrado" : "Nenhum local cadastrado"}</TableCell></TableRow>
              ) : paginados.map((l, i) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {editingId === l.id ? (
                      <div>
                        <input value={editNome} onChange={e => setEditNome(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-esmeralda-300 focus:ring-1"
                          onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(l.id); }} autoFocus />
                        {saveError && <p className="text-xs mt-1 text-error-600">{saveError}</p>}
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-gray-900">{l.nome}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.id === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Sistema</span>
                    ) : l.id === 2 ? (
                      <span className="inline-flex items-center rounded-full bg-esmeralda-100 px-2 py-0.5 text-xs font-medium text-esmeralda-700">Loja</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Personalizado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={l.ativo} onChange={() => handleToggleAtivo(l)} color="brand" disabled={l.id === 1} />
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {editingId === l.id ? (
                          <>
                            <button onClick={() => handleSaveEdit(l.id)} disabled={saving}
                              className="flex items-center justify-center w-8 h-8 rounded-full bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 transition-colors disabled:opacity-50">
                              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => { setEditingId(null); setSaveError(""); }}
                              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(l.id); setEditNome(l.nome); setSaveError(""); }}
                              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-700 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button disabled
                              className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed">
                              <X size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
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
        </>
      )}
    </div>
  );
}
