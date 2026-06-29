"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Loader2, Plus, Save, X, Search, Pencil, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { InputField } from "@/components/ui/InputField";
import { Modal } from "@/components/ui/Modal";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

const ITENS_POR_PAGINA = 8;

const BAIRROS_FORTALEZA = [
  "Aerolândia","Água Fria","Aldeota","Alto da Balança","Alto da Paz","Antônio Bezerra",
  "Barroso","Bela Vista","Benfica","Boa Vista","Bom Jardim","Cais do Porto",
  "Castelão","Conjunto Ceará I","Conjunto Ceará II","Couto Fernandes","Cristo Redentor",
  "Curió","Damas","Demócrito Rocha","Dendê","Dias Macêdo","Dom Lustosa","Edson Queiroz",
  "Ellery","Farias Brito","Floresta","Granja Lisboa","Granja Portugal","Guararapes",
  "Henrique Jorge","Itaoca","Itaperi","Jacarecanga","Jardim América","Jardim das Oliveiras",
  "Jardim Guanabara","Jardim Iracema","Jardim União","João XXIII","José Bonifácio",
  "Jóquei Clube","Lagoa Redonda","Maraponga","Meireles","Messejana","Mondubim",
  "Monte Castelo","Montese","Mucuripe","Nabuco","Nova Aldeota","Padre Andrade",
  "Parangaba","Parque Araxá","Parque Dois Irmãos","Parque Genibaú","Parque Iracema",
  "Parque Manibura","Passaré","Paupina","Pici","Pirambu","Praia de Iracema",
  "Praia do Futuro I","Praia do Futuro II","Quintino Cunha","Rodolfo Teófilo",
  "Serrinha","Siqueira","Tarumã","Tauape","Varjota","Vicente Pinzón","Vila União","Vila Velha",
];

interface FreteBairro { id: number; bairro: string; municipio: string | null; valor: number; ativo: boolean; }

export default function TabFretes() {
  const [fretes, setFretes] = useState<FreteBairro[]>([]); const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState(""); const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [editValores, setEditValores] = useState<Record<number, string>>({});
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [novoForm, setNovoForm] = useState({ bairro: "", municipio: "Fortaleza", valor: "" });
  const [savingNovo, setSavingNovo] = useState(false); const [erroNovo, setErroNovo] = useState("");
  const [bairroSugestoes, setBairroSugestoes] = useState<string[]>([]); const [bairroOpen, setBairroOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [filtro]);

  const fmtFrete = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  async function carregar() { setLoading(true); try { const res = await fetch("/api/configuracoes/fretes-bairro"); const data = await res.json(); setFretes(Array.isArray(data) ? data : (data.fretes ?? [])); } catch {} finally { setLoading(false); } }
  useEffect(() => { carregar(); }, []);

  async function handleSalvar(frete: FreteBairro) {
    const v = parseFloat((editValores[frete.id] ?? String(frete.valor)).replace(",", "."));
    if (isNaN(v) || v < 0) return;
    setSalvandoId(frete.id);
    try {
      const res = await fetch(`/api/configuracoes/fretes-bairro/${frete.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: v }) });
      if (!res.ok) throw new Error("Erro");
      setFretes(prev => prev.map(f => f.id === frete.id ? { ...f, valor: v } : f));
      const next = { ...editValores }; delete next[frete.id]; setEditValores(next);
      setEditandoId(null); toast.success("Frete atualizado");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSalvandoId(null); }
  }

  async function handleToggleAtivo(frete: FreteBairro) {
    const res = await fetch(`/api/configuracoes/fretes-bairro/${frete.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !frete.ativo }) });
    if (res.ok) setFretes(prev => prev.map(f => f.id === frete.id ? { ...f, ativo: !f.ativo } : f));
    toast.success(frete.ativo ? "Frete desativado" : "Frete ativado");
  }

  async function handleCriarFrete() {
    if (!novoForm.bairro.trim()) { setErroNovo("Bairro é obrigatório"); return; }
    setSavingNovo(true); setErroNovo("");
    try {
      const res = await fetch("/api/configuracoes/fretes-bairro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bairro: novoForm.bairro, municipio: novoForm.municipio, valor: parseFloat(novoForm.valor.replace(",", ".")) || 0 }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Erro");
      setFretes(prev => [...prev, { ...data, valor: Number(data.valor) }].sort((a, b) => a.bairro.localeCompare(b.bairro)));
      setNovoForm({ bairro: "", municipio: "Fortaleza", valor: "" }); setShowForm(false);
      toast.success("Frete cadastrado");
    } catch (e) { setErroNovo(e instanceof Error ? e.message : "Erro ao cadastrar"); }
    finally { setSavingNovo(false); }
  }

  const filtered = fretes.filter(f => filtro.trim() === "" || f.bairro.toLowerCase().includes(filtro.toLowerCase()) || (f.municipio ?? "").toLowerCase().includes(filtro.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITENS_POR_PAGINA));
  const paginados = filtered.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  if (loading) return <div className="flex items-center gap-2 py-10 justify-center text-sm text-gray-500"><Loader2 size={14} className="animate-spin" />Carregando fretes...</div>;

  function abrirEdicao(frete: FreteBairro) {
    setEditandoId(frete.id);
    setEditValores(prev => ({ ...prev, [frete.id]: String(frete.valor) }));
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Filtrar por bairro..." value={filtro} onChange={e => setFiltro(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
          {filtro && <button onClick={() => setFiltro("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} startIcon={<Plus size={14} />}>Adicionar bairro</Button>
      </div>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setErroNovo(""); }} title="Novo Bairro" description="Cadastre um novo bairro para frete" size="md">
        <div className="space-y-4">
          <div className="relative">
            <InputField label="Bairro *" placeholder="Nome do bairro" value={novoForm.bairro}
              onChange={e => { const v = e.target.value; setNovoForm(p => ({ ...p, bairro: v })); const sugs = BAIRROS_FORTALEZA.filter(b => b.toLowerCase().includes(v.toLowerCase())).slice(0, 8); setBairroSugestoes(sugs); setBairroOpen(sugs.length > 0); }}
              onFocus={() => { if (novoForm.bairro.trim().length >= 1 && bairroSugestoes.length > 0) setBairroOpen(true); }} />
            {bairroOpen && (
              <div className="absolute z-50 w-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-auto max-h-56" onMouseDown={() => setTimeout(() => setBairroOpen(false), 150)}>
                {bairroSugestoes.map(b => (
                  <button key={b} type="button" className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    onMouseDown={() => { setNovoForm(p => ({ ...p, bairro: b })); setBairroOpen(false); }}>{b}</button>
                ))}
              </div>
            )}
          </div>
          <InputField label="Município" value={novoForm.municipio} onChange={e => setNovoForm(p => ({ ...p, municipio: e.target.value }))} />
          <InputField label="Valor (R$)" placeholder="0,00" value={novoForm.valor} onChange={e => setNovoForm(p => ({ ...p, valor: e.target.value }))} />
          {erroNovo && <p className="text-xs text-error-600">{erroNovo}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setErroNovo(""); }}>Cancelar</Button>
            <Button size="sm" onClick={handleCriarFrete} loading={savingNovo} startIcon={<Save size={12} />}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <p className="text-xs text-gray-400">{filtered.length} {filtered.length === 1 ? "bairro" : "bairros"}{filtro ? " encontrado(s)" : " no total"}</p>

      <Table>
        <TableHeader>
          <TableRow>
            {["Bairro", "Município", "Valor (R$)", "Ativo", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginados.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-12">{filtro ? "Nenhum bairro encontrado" : "Nenhum frete cadastrado"}</TableCell></TableRow>
          ) : paginados.map(frete => (
            <TableRow key={frete.id}>
              <TableCell className="font-medium text-gray-900">{frete.bairro}</TableCell>
              <TableCell className="text-gray-500">{frete.municipio ?? "—"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">R$</span>
                  <input type="text" value={editValores[frete.id] !== undefined ? editValores[frete.id] : String(frete.valor)}
                    onChange={e => setEditValores(prev => ({ ...prev, [frete.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleSalvar(frete); }}
                    className={`w-24 rounded-lg border px-2 py-1 text-sm text-right outline-none focus:border-esmeralda-300 focus:ring-1 focus:ring-esmeralda-500/20 ${editandoId === frete.id ? "border-esmeralda-400" : "border-gray-300"}`} />
                </div>
              </TableCell>
              <TableCell>
                <Switch checked={frete.ativo} onChange={() => handleToggleAtivo(frete)} color="brand" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {editandoId === frete.id ? (
                    <>
                      <button onClick={() => handleSalvar(frete)} disabled={salvandoId === frete.id}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 transition-colors disabled:opacity-50">
                        {salvandoId === frete.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditandoId(null)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => abrirEdicao(frete)}
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
          <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtered.length} itens)</p>
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
