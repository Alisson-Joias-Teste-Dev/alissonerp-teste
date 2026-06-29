"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Save, Plus, X, Pencil, Check, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { InputField } from "@/components/ui/InputField";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

const ITENS_POR_PAGINA = 8;

interface FaixaComissao { id: number; desconto_pct: number; comissao_pct: number; ativo: boolean; }

export default function TabComissoes() {
  const [faixas,  setFaixas]  = useState<FaixaComissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId,  setEditId]  = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newCom,  setNewCom]  = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { fetch("/api/vendas/faixas-comissao?todas=1").then(r => r.json()).then((d: FaixaComissao[]) => setFaixas(d)).finally(() => setLoading(false)); }, []);

  async function salvarEdicao(faixa: FaixaComissao) {
    const v = parseFloat(editVal.replace(",", "."));
    if (isNaN(v) || v < 0) return;
    setSaving(true);
    await fetch("/api/vendas/faixas-comissao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: faixa.id, comissao_pct: v }) });
    setFaixas(prev => prev.map(f => f.id === faixa.id ? { ...f, comissao_pct: v } : f));
    setEditId(null); setSaving(false); toast.success("Comissão atualizada");
  }

  async function toggleAtivo(faixa: FaixaComissao) {
    await fetch("/api/vendas/faixas-comissao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: faixa.id, comissao_pct: faixa.comissao_pct, ativo: !faixa.ativo }) });
    setFaixas(prev => prev.map(f => f.id === faixa.id ? { ...f, ativo: !f.ativo } : f));
    toast.success(faixa.ativo ? "Faixa desativada" : "Faixa ativada");
  }

  async function adicionarFaixa() {
    const d = parseFloat(newDesc.replace(",", ".")), c = parseFloat(newCom.replace(",", "."));
    if (isNaN(d) || isNaN(c)) { setSaveErr("Valores inválidos"); return; }
    setSaving(true); setSaveErr("");
    const res = await fetch("/api/vendas/faixas-comissao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desconto_pct: d, comissao_pct: c }) });
    const row = await res.json() as FaixaComissao;
    setFaixas(prev => [...prev.filter(f => f.desconto_pct !== row.desconto_pct), { ...row, desconto_pct: Number(row.desconto_pct), comissao_pct: Number(row.comissao_pct) }].sort((a, b) => a.desconto_pct - b.desconto_pct));
    setNewDesc(""); setNewCom(""); setAddMode(false); setSaving(false); toast.success("Faixa adicionada");
  }

  const filtrados = search.trim() ? faixas.filter(f => `${f.desconto_pct}%`.includes(search) || `${f.comissao_pct}%`.includes(search)) : faixas;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  if (loading) return <div className="text-sm text-center py-8 text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar por percentual..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
        </div>
        <Button size="sm" onClick={() => setAddMode(v => !v)} startIcon={<Plus size={14} />}>Nova faixa</Button>
      </div>

      <Modal isOpen={addMode} onClose={() => { setAddMode(false); setSaveErr(""); }} title="Nova faixa" description="Cadastre uma nova faixa de comissão" size="sm">
        <div className="space-y-4">
          <InputField label="Desconto (%)" placeholder="ex: 5" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
          <InputField label="Comissão (%)" placeholder="ex: 3.42" value={newCom} onChange={e => setNewCom(e.target.value)} />
          {saveErr && <p className="text-xs text-error-600">{saveErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAddMode(false); setSaveErr(""); }}>Cancelar</Button>
            <Button size="sm" onClick={adicionarFaixa} loading={saving} startIcon={<Save size={13} />}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <Table>
        <TableHeader>
          <TableRow>
            {["Desconto concedido", "Comissão da vendedora", "Ativo", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginados.length === 0 ? (
            <TableRow><TableCell colSpan={4} className="text-center text-gray-400 py-8">{search ? "Nenhuma faixa encontrada" : "Nenhuma faixa cadastrada"}</TableCell></TableRow>
          ) : paginados.map(f => (
            <TableRow key={f.id} className={!f.ativo ? "opacity-45" : ""}>
              <TableCell className="tabular-nums font-medium text-gray-900">{f.desconto_pct.toFixed(2)}%</TableCell>
              <TableCell>
                {editId === f.id ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus type="text" value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") salvarEdicao(f); if (e.key === "Escape") setEditId(null); }}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-esmeralda-300 focus:ring-1" />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                ) : (
                  <span className="tabular-nums font-semibold text-success-600">{f.comissao_pct.toFixed(2)}%</span>
                )}
              </TableCell>
              <TableCell>
                <Switch checked={f.ativo} onChange={() => toggleAtivo(f)} color="brand" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {editId === f.id ? (
                    <>
                      <button onClick={() => salvarEdicao(f)} disabled={saving}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 transition-colors disabled:opacity-50">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditId(f.id); setEditVal(f.comissao_pct.toFixed(2)); }}
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

      <p className="text-xs text-gray-400">O limite máximo de desconto por vendedora é configurado na aba <strong>Usuários</strong>.</p>
    </div>
  );
}
