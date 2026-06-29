"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, Loader2, Wallet, Banknote, TrendingUp, ArrowUp, ArrowDown, Search, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

const ITENS_POR_PAGINA = 8;

export default function TabCreditoLoja() {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [limite, setLimite] = useState<number | null>(null);
  const [movimentos, setMovimentos] = useState<Array<{ id: number; tipo: string; valor: number; saldo_antes: number; saldo_depois: number; descricao: string | null; usuario_nome: string | null; numero_venda: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [ajusteValor, setAjusteValor] = useState("");
  const [ajusteDesc, setAjusteDesc] = useState("");
  const [novoLimite, setNovoLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search]);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  async function loadData() {
    setLoading(true);
    try { const [sRes, mRes] = await Promise.all([fetch("/api/saldo-credito").then(r => r.json()), fetch("/api/saldo-credito/movimentos?limit=50").then(r => r.json())]); setSaldo(sRes.saldo_atual); setLimite(sRes.limite); setNovoLimite(String(sRes.limite)); setMovimentos(mRes.movimentos ?? []); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []);

  async function handleAjuste() {
    const valor = parseFloat(ajusteValor.replace(",", "."));
    if (!valor || !ajusteDesc.trim()) { toast.error("Valor e descrição obrigatórios"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/saldo-credito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor, descricao: ajusteDesc.trim() }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setAjusteValor(""); setAjusteDesc(""); await loadData(); toast.success("Ajuste aplicado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setSaving(false); }
  }

  async function handleLimite() {
    const lim = parseFloat(novoLimite.replace(",", "."));
    if (isNaN(lim) || lim < 0) { toast.error("Limite inválido"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/saldo-credito", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limite: lim }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await loadData(); toast.success("Limite atualizado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setSaving(false); }
  }

  const pctUsado = limite && limite > 0 ? ((limite - (saldo ?? 0)) / limite) * 100 : 0;
  const corBarra = "bg-esmeralda-500";
  const corTexto = "text-esmeralda-600";

  const filtrados = search.trim()
    ? movimentos.filter(m => (m.descricao ?? "").toLowerCase().includes(search.toLowerCase()) || (m.usuario_nome ?? "").toLowerCase().includes(search.toLowerCase()) || (m.numero_venda ?? "").toLowerCase().includes(search.toLowerCase()))
    : movimentos;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* KPI Cards — TailAdmin pattern */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-esmeralda-50">
            <Wallet size={24} className="text-esmeralda-600" />
          </div>
          <div className="mt-5">
            <span className="text-sm text-gray-500">Saldo Disponível</span>
            <h4 className="mt-1 font-bold text-gray-800 text-2xl tabular-nums">{fmt(saldo ?? 0)}</h4>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-esmeralda-50">
            <Banknote size={24} className="text-esmeralda-600" />
          </div>
          <div className="mt-5">
            <span className="text-sm text-gray-500">Limite Configurado</span>
            <h4 className="mt-1 font-bold text-gray-800 text-2xl tabular-nums">{fmt(limite ?? 0)}</h4>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-esmeralda-50">
            <TrendingUp size={24} className="text-esmeralda-600" />
          </div>
          <div className="mt-5">
            <span className="text-sm text-gray-500">Utilização</span>
            <h4 className={`mt-1 font-bold text-2xl tabular-nums ${corTexto}`}>{pctUsado.toFixed(0)}%</h4>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-200"><div className={`h-full rounded-full transition-all ${corBarra}`} style={{ width: `${Math.min(pctUsado, 100)}%` }} /></div>
        </div>
      </div>

      {/* Forms */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <Card title="Ajustar Saldo" desc="Lançamento manual de crédito ou débito">
          <div className="space-y-4">
            <InputField placeholder="Valor (positivo = crédito, negativo = débito)" value={ajusteValor} onChange={e => setAjusteValor(e.target.value)} />
            <InputField placeholder="Descrição do ajuste" value={ajusteDesc} onChange={e => setAjusteDesc(e.target.value)} />
            <Button size="sm" onClick={handleAjuste} loading={saving} startIcon={<Save size={14} />}>Aplicar Ajuste</Button>
          </div>
        </Card>
        <Card title="Alterar Limite" desc="Defina um novo limite para o gerente da loja">
          <div className="flex items-end gap-3">
            <InputField value={novoLimite} onChange={e => setNovoLimite(e.target.value)} className="flex-1" prefix="R$" />
            <Button size="sm" onClick={handleLimite} loading={saving} startIcon={<Save size={14} />}>Salvar</Button>
          </div>
        </Card>
      </div>

      {/* Movimentações */}
      <Card title="Movimentações Recentes">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Filtrar movimentações..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>{["Data", "Tipo", "Venda", "Valor", "Saldo", "Descrição", "Usuário"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}</TableRow>
          </TableHeader>
          <TableBody>
            {paginados.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-12">{search ? "Nenhuma movimentação encontrada" : "Nenhuma movimentação registrada"}</TableCell></TableRow> :
              paginados.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="text-gray-500 tabular-nums">{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell><Badge color={m.tipo === "credito" ? "success" : m.tipo === "debito" ? "error" : "info"} size="sm">{m.tipo}</Badge></TableCell>
                  <TableCell className="text-gray-900">{m.numero_venda ?? "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${m.tipo === "debito" ? "text-error-500" : "text-success-600"}`}>{m.tipo === "debito" ? "-" : "+"}{fmt(m.valor)}</TableCell>
                  <TableCell className="text-right tabular-nums text-gray-500">{fmt(m.saldo_depois)}</TableCell>
                  <TableCell className="text-gray-500 max-w-[200px] truncate">{m.descricao ?? "—"}</TableCell>
                  <TableCell className="text-gray-500">{m.usuario_nome ?? "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100">
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
      </Card>
    </div>
  );
}
