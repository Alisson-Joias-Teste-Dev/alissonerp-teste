"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Loader2, Plus, Pencil, Trash2, CreditCard, Search, X, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { InputField } from "@/components/ui/InputField";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";
import { TIPO_CORES, TIPO_LABELS } from "./constants";
import type { Gateway } from "./types";

const ITENS_POR_PAGINA = 8;

export default function TabGateways() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", tipo: "outro" as Gateway["tipo"], cor: "#6B7280", obs: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Gateway | null>(null);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { fetch("/api/configuracoes/gateways").then(r => r.json()).then(data => { setGateways(Array.isArray(data) ? data : []); setLoading(false); }).catch(() => setLoading(false)); }, []);

  function startAdd() { setEditingId(null); setForm({ nome: "", tipo: "outro", cor: "#6B7280", obs: "" }); setErro(null); setShowForm(true); }
  function startEdit(g: Gateway) { setEditingId(g.id); setForm({ nome: g.nome, tipo: g.tipo, cor: g.cor, obs: g.obs ?? "" }); setErro(null); setShowForm(true); }

  async function handleSave() {
    if (!form.nome.trim()) { setErro("Nome obrigatório"); return; }
    setSaving(true); setErro(null);
    try {
      const url = editingId ? `/api/configuracoes/gateways/${editingId}` : "/api/configuracoes/gateways";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: form.nome.trim(), tipo: form.tipo, cor: form.cor, obs: form.obs.trim() || null }) });
      const data = await res.json();
      if (!res.ok) { setErro(data.error || "Erro ao salvar"); setSaving(false); return; }
      if (editingId) setGateways(prev => prev.map(g => g.id === editingId ? data : g));
      else setGateways(prev => [...prev, data]);
      setShowForm(false); setEditingId(null);
      toast.success(editingId ? "Gateway atualizado" : "Gateway criado");
    } catch { setErro("Erro de rede"); }
    setSaving(false);
  }

  async function handleToggle(g: Gateway) {
    const res = await fetch(`/api/configuracoes/gateways/${g.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !g.ativo }) });
    if (res.ok) { const data = await res.json(); setGateways(prev => prev.map(x => x.id === g.id ? data : x)); toast.success(g.ativo ? "Gateway desativado" : "Gateway ativado"); }
  }

  async function handleDelete(g: Gateway) {
    const res = await fetch(`/api/configuracoes/gateways/${g.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.deleted) { setGateways(prev => prev.filter(x => x.id !== g.id)); toast.success("Gateway excluído"); }
    else if (data.deactivated) { setGateways(prev => prev.map(x => x.id === g.id ? { ...x, ativo: false } : x)); toast.success("Gateway desativado"); }
    setDeleteTarget(null);
  }

  const filtrados = search.trim() ? gateways.filter(g => g.nome.toLowerCase().includes(search.toLowerCase())) : gateways;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar gateway..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
        </div>
        <Button size="sm" onClick={startAdd} startIcon={<Plus size={14} />}>Novo Gateway</Button>
      </div>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setErro(null); }} title={editingId ? "Editar Gateway" : "Novo Gateway"} description="Configure as credenciais do gateway" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField label="Nome *" placeholder="Ex: Mercado Pago, Stone..." value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo</label>
              <select value={form.tipo} onChange={e => { const t = e.target.value as Gateway["tipo"]; setForm(f => ({ ...f, tipo: t, cor: TIPO_CORES[t] })); }}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm shadow-theme-xs outline-none focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10">
                <option value="pix">PIX</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option><option value="ouro">Ouro</option><option value="outro">Outro (múltiplos)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Cor</label>
              <div className="flex items-center gap-2"><input type="color" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} className="w-10 h-9 rounded-lg border border-gray-300 cursor-pointer" /><span className="text-xs font-mono text-gray-500">{form.cor}</span></div>
            </div>
            <InputField label="Observação" placeholder="Ex: conta PJ Bradesco" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
          </div>
          {erro && <p className="text-xs px-3 py-2 rounded-lg bg-error-50 text-error-600">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setErro(null); }} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} loading={saving} startIcon={<Save size={13} />}>{editingId ? "Salvar Alterações" : "Criar Gateway"}</Button>
          </div>
        </div>
      </Modal>

      {loading ? <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      : paginados.length === 0 ? <div className="rounded-xl border border-gray-200 p-8 text-center"><CreditCard size={28} className="mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">{search ? "Nenhum gateway encontrado" : "Nenhum gateway cadastrado."}</p></div>
      : (
        <Table>
          <TableHeader>
            <TableRow>{["Gateway", "Tipo", "Status", "Observação", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}</TableRow>
          </TableHeader>
          <TableBody>
            {paginados.map(g => (
              <TableRow key={g.id}>
                <TableCell><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.cor }} /><span className="font-medium text-gray-900">{g.nome}</span></div></TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: TIPO_CORES[g.tipo] + "18", color: TIPO_CORES[g.tipo] }}>
                    {TIPO_LABELS[g.tipo]}
                  </span>
                </TableCell>
                <TableCell>
                  <Switch checked={g.ativo} onChange={() => handleToggle(g)} color="brand" />
                </TableCell>
                <TableCell className="text-xs max-w-[200px] truncate text-gray-500">{g.obs ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(g)} className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-700 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteTarget(g)} className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                    <button disabled className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed">
                      <X size={13} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Excluir Gateway" description={`Tem certeza que deseja excluir/desativar "${deleteTarget?.nome}"?`} size="sm">
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="md" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" size="md" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Excluir</Button>
        </div>
      </Modal>

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

      <p className="text-xs text-gray-400">Gateways em uso por pagamentos serão desativados (não excluídos) ao remover.</p>
    </div>
  );
}
