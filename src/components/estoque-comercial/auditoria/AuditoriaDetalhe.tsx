"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Search, X, Loader2, Plus, CheckCircle, CheckCircle2, XCircle, MessageSquare, FileText, Pencil, Save } from "lucide-react";
import { Button, Badge, Modal } from "@/components/ui";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";
import { useAuth } from "@/hooks/useAuth";
import { fmtDate, STATUS_LABEL, STATUS_CORES, type AuditoriaItem } from "./types";

interface Props {
  auditoriaId: number;
  auditoriaInicial?: any;
  itensIniciais?: any[];
}

function getVisiblePages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

export default function AuditoriaDetalhe({ auditoriaId, auditoriaInicial, itensIniciais }: Props) {
  const router = useRouter();
  const { role } = useAuth();

  const [auditoria, setAuditoria] = useState<any>(auditoriaInicial ?? null);
  const [itens, setItens] = useState<AuditoriaItem[]>(itensIniciais ?? []);
  const [loading, setLoading] = useState(!auditoriaInicial);

  // Adicionar Produto (Sistema e Contado sao digitados manualmente pelo usuario)
  const [produtoQuery, setProdutoQuery] = useState("");
  const [produtoResults, setProdutoResults] = useState<{ id_produto: number; sku: string; nome: string }[]>([]);
  const [searchingProd, setSearchingProd] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedProd, setSelectedProd] = useState<{ id_produto: number; sku: string; nome: string } | null>(null);
  const [sistemaInput, setSistemaInput] = useState("");
  const [contadoInput, setContadoInput] = useState("");
  const [adding, setAdding] = useState(false);
  const produtoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pendências
  const [pendPage, setPendPage] = useState(1);
  const [filtroPend, setFiltroPend] = useState<"todas" | "pendentes" | "concluidas">("todas");
  const [pendSearch, setPendSearch] = useState("");
  const PEND_POR_PAGINA = 10;

  // Modal de formalizar
  const [showMotivoModal, setShowMotivoModal] = useState(false);
  const [motivoEditItem, setMotivoEditItem] = useState<AuditoriaItem | null>(null);
  const [motivoEditText, setMotivoEditText] = useState("");
  const [savingMotivo, setSavingMotivo] = useState(false);
  const [vendaSearch, setVendaSearch] = useState("");
  const [vendaResults, setVendaResults] = useState<{ id: number; numero_venda: string; cliente_nome: string; valor_total: number; situacao: string }[]>([]);
  const [vendaSelected, setVendaSelected] = useState<{ id: number; numero_venda: string } | null>(null);
  const [searchingVenda, setSearchingVenda] = useState(false);
  const [showVendaResults, setShowVendaResults] = useState(false);
  const vendaTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal concluir/cancelar
  const [concluindo, setConcluindo] = useState(false);
  const [showConfirmConcluir, setShowConfirmConcluir] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);

  // Modal de concluir pendencia (so habilita apos a pendencia ja ter sido formalizada)
  const [showConcluirItemModal, setShowConcluirItemModal] = useState(false);
  const [itemConcluir, setItemConcluir] = useState<AuditoriaItem | null>(null);
  const [concluindoItem, setConcluindoItem] = useState(false);

  // Modal de detalhes da pendencia (abre ao clicar na linha)
  const [showDetalheModal, setShowDetalheModal] = useState(false);
  const [detalheItem, setDetalheItem] = useState<AuditoriaItem | null>(null);

  const podeAdmin = role === "admin" || role === "desenvolvedor" || role === "gerente_loja";
  const isEmAndamento = auditoria?.status === "em_andamento";

  useEffect(() => {
    if (produtoQuery.length < 2) { setProdutoResults([]); setShowResults(false); return; }
    if (produtoTimeout.current) clearTimeout(produtoTimeout.current);
    produtoTimeout.current = setTimeout(async () => {
      setSearchingProd(true);
      try {
        const r = await fetch(`/api/produtos/busca?q=${encodeURIComponent(produtoQuery)}&limit=8`);
        if (r.ok) { const data = await r.json(); setProdutoResults(data); setShowResults(data.length > 0); }
      } catch { /* silent */ }
      finally { setSearchingProd(false); }
    }, 300);
    return () => { if (produtoTimeout.current) clearTimeout(produtoTimeout.current); };
  }, [produtoQuery]);

  function selecionarProduto(p: { id_produto: number; sku: string; nome: string }) {
    setSelectedProd(p);
    setProdutoQuery(p.nome);
    setShowResults(false);
    setSistemaInput("");
    setContadoInput("");
  }

  function limparSelecaoProduto() {
    setSelectedProd(null); setProdutoQuery(""); setSistemaInput(""); setContadoInput("");
  }

  async function handleAdicionarProduto() {
    if (!selectedProd) return;
    const sistema = parseInt(sistemaInput, 10);
    const contado = parseInt(contadoInput, 10);
    if (isNaN(sistema) || sistema < 0 || isNaN(contado) || contado < 0) { toast.error("Informe Sistema e Contado"); return; }
    setAdding(true);
    try {
      const r = await fetch(`/api/estoque-comercial/auditoria/${auditoriaId}/adicionar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produto_id: selectedProd.id_produto, quantidade_sistema: sistema, quantidade_contada: contado }),
      });
      const data = await r.json();
      if (!r.ok) { toast.error(data.error ?? "Erro ao adicionar"); return; }
      toast.success("Pendência registrada!");
      await fetchDetalhe();
      limparSelecaoProduto();
    } catch { toast.error("Erro ao adicionar item"); }
    finally { setAdding(false); }
  }

  useEffect(() => {
    if (vendaSearch.length < 2) { setVendaResults([]); setShowVendaResults(false); return; }
    if (vendaTimeout.current) clearTimeout(vendaTimeout.current);
    vendaTimeout.current = setTimeout(async () => {
      setSearchingVenda(true);
      try {
        const r = await fetch(`/api/vendas/busca-numero?q=${encodeURIComponent(vendaSearch)}`);
        if (r.ok) { const data = await r.json(); setVendaResults(data); setShowVendaResults(data.length > 0); }
      } catch { /* silent */ }
      finally { setSearchingVenda(false); }
    }, 300);
    return () => { if (vendaTimeout.current) clearTimeout(vendaTimeout.current); };
  }, [vendaSearch]);

  function abrirMotivo(item: AuditoriaItem) {
    setMotivoEditItem(item);
    setMotivoEditText(item.observacao ?? "");
    setVendaSearch("");
    setVendaResults([]);
    setVendaSelected(null);
    setShowVendaResults(false);
    setShowMotivoModal(true);
  }

  async function salvarMotivo() {
    if (!motivoEditItem) return;
    setSavingMotivo(true);
    try {
      const body: any = { itens: [{ id: motivoEditItem.id, observacao: motivoEditText.trim() || null }] };
      if (vendaSelected) body.itens[0].venda_numero = vendaSelected.numero_venda;
      const r = await fetch(`/api/estoque-comercial/auditoria/${auditoriaId}/itens`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const err = await r.json(); toast.error(err.error ?? "Erro ao formalizar"); return; }
      toast.success("Pendência formalizada com sucesso!");
      setShowMotivoModal(false);
      await fetchDetalhe();
    } catch { toast.error("Erro ao formalizar"); }
    finally { setSavingMotivo(false); }
  }

  function abrirConcluirItem(item: AuditoriaItem) {
    setItemConcluir(item);
    setShowConcluirItemModal(true);
  }

  async function confirmarConcluirItem() {
    if (!itemConcluir) return;
    setConcluindoItem(true);
    try {
      const r = await fetch(`/api/estoque-comercial/auditoria/${auditoriaId}/itens`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [{ id: itemConcluir.id, status: "resolvido" }] }),
      });
      if (!r.ok) { const err = await r.json(); toast.error(err.error ?? "Erro ao concluir"); return; }
      toast.success("Pendência concluída!");
      setShowConcluirItemModal(false);
      await fetchDetalhe();
    } catch { toast.error("Erro ao concluir"); }
    finally { setConcluindoItem(false); }
  }

  // Itens nunca somem da lista — ficam visiveis ate serem concluidos (status so muda pra "resolvido" via Concluir)
  const todosItens = itens;
  const porStatus = filtroPend === "todas" ? todosItens : filtroPend === "pendentes" ? todosItens.filter(i => i.status === "pendente") : todosItens.filter(i => i.status === "resolvido");
  const buscaNormalizada = pendSearch.trim().toLowerCase();
  const filtradas = buscaNormalizada.length === 0
    ? porStatus
    : porStatus.filter(i =>
        i.nome_produto.toLowerCase().includes(buscaNormalizada) ||
        (i.sku ?? "").toLowerCase().includes(buscaNormalizada)
      );
  const pendTotalPages = Math.max(1, Math.ceil(filtradas.length / PEND_POR_PAGINA));
  const pendPaginados = filtradas.slice((pendPage - 1) * PEND_POR_PAGINA, pendPage * PEND_POR_PAGINA);

  useEffect(() => { setPendPage(1); }, [filtroPend, pendSearch]);

  const fetchDetalhe = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque-comercial/auditoria/${auditoriaId}`, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); setAuditoria(d.auditoria); setItens(d.itens); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [auditoriaId]);

  function abrirDetalhe(item: AuditoriaItem) {
    setDetalheItem(item);
    setShowDetalheModal(true);
  }

  useEffect(() => { if (!auditoriaInicial) fetchDetalhe(); }, [auditoriaInicial, fetchDetalhe]);

  const handleConcluir = async () => {
    setConcluindo(true);
    try {
      const r = await fetch(`/api/estoque-comercial/auditoria/${auditoriaId}/concluir`, { method: "POST" });
      if (!r.ok) { const err = await r.json(); toast.error(err.error ?? "Erro"); return; }
      toast.success("Auditoria concluída!");
      await fetchDetalhe();
    } catch { toast.error("Erro ao concluir"); }
    finally { setConcluindo(false); setShowConfirmConcluir(false); }
  };

  const handleCancelar = async () => {
    try {
      const r = await fetch(`/api/estoque-comercial/auditoria/${auditoriaId}/cancelar`, { method: "POST" });
      if (!r.ok) { const err = await r.json(); toast.error(err.error ?? "Erro"); return; }
      toast.success("Auditoria cancelada");
      await fetchDetalhe();
    } catch { toast.error("Erro ao cancelar"); }
    finally { setShowCancelar(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  if (!auditoria) return <div className="p-6 text-center text-gray-500">Auditoria não encontrada.</div>;

  const statusColorMap: Record<string, "warning" | "success" | "error"> = { em_andamento: "warning", concluido: "success", cancelado: "error" };
  const statusLabelMap: Record<string, string> = { em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };

  const FILTROS: { key: typeof filtroPend; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "pendentes", label: "Pendentes" },
    { key: "concluidas", label: "Concluídas" },
  ];

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => router.push("/estoque-comercial/auditoria")} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700"><ArrowLeft size={15} /> Auditorias</button>
          <span className="text-gray-300">|</span>
          <span className="text-gray-700 font-medium">Auditoria #{auditoriaId}</span>
          <Badge color={statusColorMap[auditoria.status] ?? "warning"} size="sm">{statusLabelMap[auditoria.status] ?? auditoria.status}</Badge>
          <span className="text-xs text-gray-400">{auditoria.local_nome}</span>
        </div>
        {isEmAndamento && podeAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowConfirmConcluir(true)} startIcon={<CheckCircle size={13} />}>Concluir</Button>
            <Button variant="danger" size="sm" onClick={() => setShowCancelar(true)} startIcon={<XCircle size={13} />}>Cancelar</Button>
          </div>
        )}
      </div>

      {/* Adicionar Produto */}
      {isEmAndamento && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Adicionar Produto</h3>
            <p className="text-xs mt-0.5 text-gray-500">Busque o produto e informe Sistema e Contado para registrar a pendência.</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar produto por nome ou SKU..." value={produtoQuery}
              onChange={e => { setProdutoQuery(e.target.value); if (selectedProd) setSelectedProd(null); }}
              onFocus={() => { if (produtoResults.length > 0) setShowResults(true); }}
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
            {selectedProd && <button onClick={limparSelecaoProduto} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
            {showResults && produtoResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                {produtoResults.map(p => (
                  <button key={p.id_produto} type="button" onClick={() => selecionarProduto(p)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b last:border-b-0 border-gray-100">
                    <span className="font-medium text-gray-900">{p.nome}</span>
                    {p.sku && <span className="text-xs text-gray-400 ml-2">{p.sku}</span>}
                  </button>
                ))}
              </div>
            )}
            {searchingProd && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
          </div>

          {selectedProd && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{selectedProd.nome}</p>
                <p className="text-xs text-gray-400">{selectedProd.sku}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Sistema *</label>
                  <input type="number" min={0} value={sistemaInput} onChange={e => setSistemaInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 [appearance:textfield]" placeholder="0" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Contado *</label>
                  <input type="number" min={0} value={contadoInput} onChange={e => setContadoInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 [appearance:textfield]" placeholder="0" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={limparSelecaoProduto}>Cancelar</Button>
                <Button size="sm" onClick={handleAdicionarProduto} loading={adding} disabled={!sistemaInput || !contadoInput} startIcon={<Plus size={13} />}>
                  Registrar Pendência
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pendências */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Pendências {todosItens.length > 0 && <span className="text-xs font-normal text-gray-400">({todosItens.length})</span>}
          </h3>
        </div>

        {/* Busca de pendência por produto/SKU */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar pendência por nome ou SKU do produto..." value={pendSearch}
            onChange={e => setPendSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
          {pendSearch && <button onClick={() => setPendSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
        </div>

        {/* Filtros */}
        <div className="flex gap-1 mb-4">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltroPend(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroPend === f.key ? "bg-esmeralda-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {filtradas.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-8 text-center">
            <MessageSquare size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">
              {buscaNormalizada
                ? "Nenhuma pendência encontrada para essa busca."
                : filtroPend === "pendentes" ? "Nenhuma pendência pendente." : filtroPend === "concluidas" ? "Nenhuma pendência concluída." : "Nenhuma pendência registrada."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {["Produto", "Sistema", "Contado", "Dif.", "Status", "Formalizada", "Motivo", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendPaginados.map(item => {
                const diff = item.quantidade_contada !== null ? item.quantidade_contada - item.quantidade_sistema : null;
                const formalizada = item.observacao && item.observacao.trim().length > 0;
                const isResolvido = item.status === "resolvido";
                return (
                  <TableRow key={item.id} onClick={() => abrirDetalhe(item)}>
                    <TableCell>
                      <span className="font-medium text-sm text-gray-900">{item.nome_produto}</span>
                      {item.sku && <span className="text-xs font-mono text-gray-400 ml-1">{item.sku}</span>}
                    </TableCell>
                    <TableCell className="text-center text-sm text-gray-700">{item.quantidade_sistema}</TableCell>
                    <TableCell className="text-center text-sm text-gray-700">{item.quantidade_contada ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      {diff !== null ? (
                        <span className={`text-sm font-medium ${diff === 0 ? "text-gray-400" : diff > 0 ? "text-green-600" : "text-error-500"}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      ) : <span className="text-sm text-gray-300">—</span>}
                    </TableCell>
                    <TableCell><Badge color={STATUS_CORES[item.status] ?? "neutral"} size="sm">{STATUS_LABEL[item.status]}</Badge></TableCell>
                    <TableCell className="text-center">
                      {formalizada ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-success-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-success-500" />Sim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Não
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-sm text-gray-500 truncate block">{item.observacao ?? "—"}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {isEmAndamento && (
                        <div className="flex items-center gap-2">
                          {!formalizada ? (
                            <Button size="sm" variant="outline" onClick={() => abrirMotivo(item)} disabled={isResolvido} startIcon={<FileText size={12} />}>
                              Formalizar
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => abrirMotivo(item)} disabled={isResolvido} startIcon={<Pencil size={12} />}>
                              Editar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => abrirConcluirItem(item)}
                            disabled={!formalizada || isResolvido}
                            startIcon={<CheckCircle2 size={12} />}
                          >
                            Concluir
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {pendTotalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-gray-500">Página {pendPage} de {pendTotalPages} ({filtradas.length} itens)</p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setPendPage(p => Math.max(1, p - 1))} disabled={pendPage === 1}>Anterior</Button>
              {getVisiblePages(pendPage, pendTotalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-1 text-sm select-none text-gray-400">…</span>
                ) : (
                  <button key={p} onClick={() => setPendPage(p as number)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === pendPage ? "bg-esmeralda-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{p}</button>
                )
              )}
              <Button size="sm" variant="outline" onClick={() => setPendPage(p => Math.min(pendTotalPages, p + 1))} disabled={pendPage === pendTotalPages}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Motivo */}
      <Modal isOpen={showMotivoModal} onClose={() => setShowMotivoModal(false)} title="Formalizar Pendência" description="Descreva o motivo e vincule a venda relacionada." size="xl">
        <div className="space-y-5">
          {motivoEditItem && (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="font-medium text-gray-900">{motivoEditItem.nome_produto}</span>
              {motivoEditItem.sku && <span className="text-xs font-mono text-gray-400">{motivoEditItem.sku}</span>}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo da divergência</label>
            <textarea value={motivoEditText} onChange={e => setMotivoEditText(e.target.value)}
              rows={5} placeholder="Descreva detalhadamente o motivo da divergência..."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 resize-none" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Venda relacionada (opcional)</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar por número da venda..." value={vendaSearch}
                onChange={e => { setVendaSearch(e.target.value); if (vendaSelected) setVendaSelected(null); }}
                onFocus={() => { if (vendaResults.length > 0) setShowVendaResults(true); }}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none" />
              {vendaSelected && <button onClick={() => { setVendaSelected(null); setVendaSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
              {searchingVenda && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
              {showVendaResults && vendaResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  {vendaResults.map(v => (
                    <button key={v.id} type="button" onClick={() => { setVendaSelected({ id: v.id, numero_venda: v.numero_venda }); setVendaSearch(v.numero_venda); setShowVendaResults(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b last:border-b-0 border-gray-100">
                      <span className="font-medium text-gray-900">#{v.numero_venda}</span>
                      <span className="text-xs text-gray-400 ml-2">{v.cliente_nome ?? ""}</span>
                      <span className="text-xs text-gray-400 ml-2">R$ {Number(v.valor_total).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {vendaSelected && (
              <p className="text-xs text-success-600 mt-1">✓ Venda #{vendaSelected.numero_venda} selecionada</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setShowMotivoModal(false)} disabled={savingMotivo}>Cancelar</Button>
            <Button size="md" onClick={salvarMotivo} loading={savingMotivo} startIcon={<Save size={14} />}>Formalizar Pendência</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Detalhes da Pendencia */}
      <Modal
        isOpen={showDetalheModal}
        onClose={() => setShowDetalheModal(false)}
        title="Detalhes da Pendência"
        description="Informações registradas para este item."
        size="md"
      >
        {detalheItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="font-medium text-sm text-gray-900">{detalheItem.nome_produto}</span>
              {detalheItem.sku && <span className="text-xs font-mono text-gray-400">{detalheItem.sku}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500">Sistema</p>
                <p className="text-sm font-medium text-gray-900">{detalheItem.quantidade_sistema}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Contado</p>
                <p className="text-sm font-medium text-gray-900">{detalheItem.quantidade_contada ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <Badge color={STATUS_CORES[detalheItem.status] ?? "neutral"} size="sm">{STATUS_LABEL[detalheItem.status]}</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Motivo formalizado</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{detalheItem.observacao ?? "Nenhum motivo registrado ainda."}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Venda relacionada</p>
              <p className="text-sm text-gray-700">{detalheItem.venda_numero ? `#${detalheItem.venda_numero}` : "Nenhuma venda vinculada."}</p>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="md" onClick={() => setShowDetalheModal(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Concluir Pendencia */}
      <Modal
        isOpen={showConcluirItemModal}
        onClose={() => setShowConcluirItemModal(false)}
        title="Concluir Pendência"
        description={itemConcluir ? `Confirma a conclusão da pendência de "${itemConcluir.nome_produto}"? Ela será marcada como Concluída.` : ""}
        size="sm"
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="md" onClick={() => setShowConcluirItemModal(false)} disabled={concluindoItem}>Voltar</Button>
          <Button variant="primary" size="md" onClick={confirmarConcluirItem} loading={concluindoItem}>Concluir</Button>
        </div>
      </Modal>

      {/* Modal Concluir Auditoria */}
      <Modal isOpen={showConfirmConcluir} onClose={() => setShowConfirmConcluir(false)} title="Concluir Auditoria" description={`${todosItens.filter(i => i.status === "pendente").length} pendência(s) ainda pendente(s). Deseja concluir mesmo assim?`} size="sm">
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="md" onClick={() => setShowConfirmConcluir(false)}>Voltar</Button>
          <Button variant="primary" size="md" onClick={handleConcluir} loading={concluindo}>Concluir</Button>
        </div>
      </Modal>

      {/* Modal Cancelar Auditoria */}
      <Modal isOpen={showCancelar} onClose={() => setShowCancelar(false)} title="Cancelar Auditoria" description="Todas as pendências serão perdidas." size="sm">
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="md" onClick={() => setShowCancelar(false)}>Voltar</Button>
          <Button variant="danger" size="md" onClick={handleCancelar}>Cancelar Auditoria</Button>
        </div>
      </Modal>
    </div>
  );
}
