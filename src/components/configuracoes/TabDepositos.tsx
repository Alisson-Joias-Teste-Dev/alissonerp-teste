"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X, Save, Pencil, ChevronDown, ChevronRight, Warehouse, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { InputField } from "@/components/ui/InputField";
import { Switch } from "@/components/ui/Switch";
import { Alert } from "@/components/ui/Alert";

const ITENS_POR_PAGINA = 8;

interface DepositoItem { id: number; nome: string; tipo: string; ativo: boolean }
interface SetorItem { id: number; nome: string; deposito_id: number | null; ativo: boolean }

export default function TabDepositos() {
  const [depositos, setDepositos] = useState<DepositoItem[]>([]);
  const [setores, setSetores] = useState<SetorItem[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const [showDepForm, setShowDepForm] = useState(false);
  const [editingDep, setEditingDep] = useState<DepositoItem | null>(null);
  const [depNome, setDepNome] = useState("");
  const [savingDep, setSavingDep] = useState(false);

  const [showSetorForm, setShowSetorForm] = useState<number | null>(null);
  const [editingSetor, setEditingSetor] = useState<SetorItem | null>(null);
  const [setorNome, setSetorNome] = useState("");
  const [savingSetor, setSavingSetor] = useState(false);

  async function loadAll() { setLoading(true); const [deps, sets] = await Promise.all([fetch("/api/depositos").then(r => r.json()), fetch("/api/setores").then(r => r.json())]); setDepositos(Array.isArray(deps) ? deps : []); setSetores(Array.isArray(sets) ? sets : []); setLoading(false); }
  useEffect(() => { loadAll(); }, []);

  async function salvarDeposito() {
    if (!depNome.trim()) return; setSavingDep(true); setError("");
    try {
      const res = editingDep
        ? await fetch(`/api/depositos/${editingDep.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: depNome }) })
        : await fetch("/api/depositos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: depNome, tipo: "producao" }) });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      setShowDepForm(false); setEditingDep(null); setDepNome(""); await loadAll();
      toast.success(editingDep ? "Depósito atualizado" : "Depósito criado");
    } catch (e) { setError((e as Error).message); toast.error("Erro ao salvar"); }
    setSavingDep(false);
  }

  async function toggleDeposito(dep: DepositoItem) { if (dep.id === 1) return; await fetch(`/api/depositos/${dep.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !dep.ativo }) }); await loadAll(); toast.success(dep.ativo ? "Depósito desativado" : "Depósito ativado"); }

  async function salvarSetor(depositoId: number) {
    if (!setorNome.trim()) return; setSavingSetor(true); setError("");
    try {
      const res = editingSetor
        ? await fetch(`/api/setores/${editingSetor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: setorNome }) })
        : await fetch("/api/setores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: setorNome, deposito_id: depositoId }) });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      setShowSetorForm(null); setEditingSetor(null); setSetorNome(""); await loadAll();
      toast.success(editingSetor ? "Setor atualizado" : "Setor criado");
    } catch (e) { setError((e as Error).message); toast.error("Erro ao salvar"); }
    setSavingSetor(false);
  }

  async function toggleSetor(s: SetorItem) { await fetch(`/api/setores/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !s.ativo }) }); await loadAll(); toast.success(s.ativo ? "Setor desativado" : "Setor ativado"); }

  const filtered = search.trim()
    ? depositos.filter(d => d.nome.toLowerCase().includes(search.toLowerCase()))
    : depositos;
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITENS_POR_PAGINA));
  const paginados = filtered.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  if (loading) return <div className="flex items-center gap-2 py-8 text-gray-500"><Loader2 size={16} className="animate-spin" />Carregando...</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar depósito..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
        </div>
        <Button size="sm" onClick={() => { setShowDepForm(true); setEditingDep(null); setDepNome(""); setError(""); }} startIcon={<Plus size={14} />}>Novo Depósito</Button>
      </div>

        {error && <Alert variant="error" message={error} showClose onClose={() => setError("")} className="mb-4" />}

        {showDepForm && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{editingDep ? "Editar Depósito" : "Novo Depósito"}</span>
              <button onClick={() => { setShowDepForm(false); setEditingDep(null); setDepNome(""); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <InputField autoFocus placeholder="Nome do depósito..." value={depNome} onChange={e => setDepNome(e.target.value)} onKeyDown={e => e.key === "Enter" && salvarDeposito()} />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setShowDepForm(false); setEditingDep(null); setDepNome(""); }}>Cancelar</Button>
              <Button size="sm" onClick={salvarDeposito} loading={savingDep} disabled={!depNome.trim()} startIcon={<Save size={12} />}>Salvar</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {paginados.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{search ? "Nenhum depósito encontrado" : "Nenhum depósito cadastrado"}</div>
          ) : paginados.map(dep => {
            const depSetores = setores.filter(s => s.deposito_id === dep.id);
            const isOpen = expanded === dep.id;
            return (
              <div key={dep.id} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isOpen ? "bg-white" : "bg-gray-50"}`}
                  onClick={() => setExpanded(isOpen ? null : dep.id)}>
                  {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <Warehouse size={14} className={dep.ativo ? "text-gray-600" : "text-gray-400"} />
                  <span className={`flex-1 text-sm font-medium ${dep.ativo ? "text-gray-900" : "text-gray-400"}`}>{dep.nome}</span>
                  <Badge color={dep.ativo ? "success" : "error"} size="sm">{dep.ativo ? "Ativo" : "Inativo"}</Badge>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" title="Editar" onClick={() => { setEditingDep(dep); setDepNome(dep.nome); setShowDepForm(true); setError(""); }} startIcon={<Pencil size={13} />} />
                    {dep.id !== 1 && (
                      <Switch checked={dep.ativo} onChange={() => toggleDeposito(dep)} color="brand" />
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-3 space-y-2 border-t border-gray-100 bg-white">
                    <div className="flex items-center justify-between pt-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Setores ({depSetores.length})</span>
                      <Button size="sm" variant="outline"
                        onClick={() => { setShowSetorForm(dep.id); setEditingSetor(null); setSetorNome(""); setError(""); }}
                        startIcon={<Plus size={11} />}>Novo Setor</Button>
                    </div>

                    {(showSetorForm === dep.id) && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{editingSetor ? "Editar Setor" : "Novo Setor"}</span>
                          <button onClick={() => { setShowSetorForm(null); setEditingSetor(null); setSetorNome(""); }} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                        <InputField autoFocus placeholder="Nome do setor..." value={setorNome} onChange={e => setSetorNome(e.target.value)} onKeyDown={e => e.key === "Enter" && salvarSetor(dep.id)} />
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => { setShowSetorForm(null); setEditingSetor(null); setSetorNome(""); }}>Cancelar</Button>
                          <Button size="sm" onClick={() => salvarSetor(dep.id)} loading={savingSetor} disabled={!setorNome.trim()} startIcon={<Save size={12} />}>Salvar</Button>
                        </div>
                      </div>
                    )}

                    {depSetores.length === 0 ? (
                      <p className="text-sm py-1 text-gray-400">Nenhum setor vinculado.</p>
                    ) : (
                      <div className="space-y-1">
                        {depSetores.map(s => (
                          <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50">
                            <span className={`flex-1 text-sm ${s.ativo ? "text-gray-900" : "text-gray-400"}`}>{s.nome}</span>
                            <Badge color={s.ativo ? "success" : "error"} size="sm">{s.ativo ? "Ativo" : "Inativo"}</Badge>
                            <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" title="Editar" onClick={() => { setEditingSetor(s); setSetorNome(s.nome); setShowSetorForm(dep.id); setError(""); }} startIcon={<Pencil size={12} />} />
                            <Switch checked={s.ativo} onChange={() => toggleSetor(s)} color="brand" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtered.length} depósitos)</p>
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
    </div>
  );
}
