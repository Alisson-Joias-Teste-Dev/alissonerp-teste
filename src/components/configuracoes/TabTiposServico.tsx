"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Loader2, Plus, Save, X, Pencil, AlertTriangle, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { InputField } from "@/components/ui/InputField";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

const ITENS_POR_PAGINA = 8;

interface TipoServico { id: number; nome: string; ativo: boolean; created_at: string; }

export default function TabTiposServico() {
  const [tipos, setTipos] = useState<TipoServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  async function carregar() { setLoading(true); setErro(""); const res = await fetch("/api/tipos-servico?todos=true").catch(() => null); if (!res?.ok) { setErro("Erro ao carregar"); setLoading(false); return; } const data = await res.json(); setTipos(data.tipos ?? []); setLoading(false); }
  useEffect(() => { carregar(); }, []);

  async function handleCriar() { const nome = novoNome.trim(); if (!nome) { setErroCriar("Nome é obrigatório"); return; } setCriando(true); setErroCriar(""); const res = await fetch("/api/tipos-servico", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) }).catch(() => null); setCriando(false); if (!res?.ok) { const d = await res?.json().catch(() => ({})); setErroCriar(d?.error ?? "Erro ao criar"); return; } setNovoNome(""); setShowForm(false); toast.success("Tipo de serviço criado"); carregar(); }

  async function handleEditar(id: number, nome: string) { const n = nome.trim(); if (!n) return; setSalvandoId(id); await fetch("/api/tipos-servico", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, nome: n }) }).catch(() => null); setSalvandoId(null); setEditandoId(null); toast.success("Tipo atualizado"); carregar(); }

  async function handleToggleAtivo(t: TipoServico) { setSalvandoId(t.id); await fetch("/api/tipos-servico", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, ativo: !t.ativo }) }).catch(() => null); setSalvandoId(null); toast.success(t.ativo ? "Tipo desativado" : "Tipo ativado"); carregar(); }

  const filtrados = search.trim() ? tipos.filter(t => t.nome.toLowerCase().includes(search.toLowerCase())) : tipos;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  if (loading) return <div className="flex items-center gap-2 py-8 text-gray-500"><Loader2 size={14} className="animate-spin" />Carregando...</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar tipo de serviço..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
        </div>
        {!showForm && <Button size="sm" onClick={() => { setShowForm(true); setNovoNome(""); setErroCriar(""); }} startIcon={<Plus size={14} />}>Novo Serviço</Button>}
      </div>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setErroCriar(""); }} title="Novo Serviço" description="Cadastre um novo tipo de serviço" size="sm">
        <div className="space-y-4">
          <InputField placeholder="Ex: Polimento Manual" value={novoNome} onChange={e => { setNovoNome(e.target.value); setErroCriar(""); }} onKeyDown={e => { if (e.key === "Enter") handleCriar(); if (e.key === "Escape") setShowForm(false); }} />
          {erroCriar && <div className="flex items-center gap-1.5 text-xs text-error-600"><AlertTriangle size={12} />{erroCriar}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setErroCriar(""); }}>Cancelar</Button>
            <Button size="sm" onClick={handleCriar} loading={criando} startIcon={<Save size={12} />}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {erro && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs bg-error-50 text-error-600"><AlertTriangle size={13} />{erro}</div>}

      <Table>
        <TableHeader>
          <TableRow>
            {["Nome", "Status", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginados.length === 0 ? (
            <TableRow><TableCell colSpan={3} className="text-center text-gray-400 py-8">{search ? "Nenhum tipo encontrado" : "Nenhum tipo cadastrado"}</TableCell></TableRow>
          ) : paginados.map(t => (
            <TableRow key={t.id}>
              <TableCell>
                {editandoId === t.id ? (
                  <input type="text" value={editNome} onChange={e => setEditNome(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-esmeralda-300 focus:ring-1 focus:ring-esmeralda-500/20 w-full max-w-xs"
                    autoFocus onKeyDown={e => { if (e.key === "Enter") handleEditar(t.id, editNome); if (e.key === "Escape") setEditandoId(null); }} />
                ) : (
                  <span className="font-medium text-gray-900">{t.nome}</span>
                )}
              </TableCell>
              <TableCell><Badge color={t.ativo ? "success" : "neutral"} size="sm">{t.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {editandoId === t.id ? (
                    <>
                      <button onClick={() => handleEditar(t.id, editNome)} disabled={salvandoId === t.id}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 transition-colors disabled:opacity-50">
                        {salvandoId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditandoId(null)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditandoId(t.id); setEditNome(t.nome); }}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-700 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button disabled
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed">
                        <X size={13} />
                      </button>
                      <Switch checked={t.ativo} onChange={() => handleToggleAtivo(t)} color="brand" />
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

      <p className="text-xs text-gray-400">Tipos inativos não aparecem no modal de criação de ordens, mas são mantidos no histórico.</p>
    </div>
  );
}
