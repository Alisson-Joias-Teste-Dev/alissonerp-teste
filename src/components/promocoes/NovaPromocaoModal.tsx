"use client";

/**
 * Modal de criacao de nova promocao.
 * Fluxo:
 *  1. Usuario digita nome + datas + observacao
 *  2. Busca produtos por SKU/nome (debounced) -> adiciona a lista
 *  3. Define preco_promo de cada item (ou atalho "-X% em todos")
 *  4. Submit -> POST /api/promocoes. Trata 409 mostrando conflitos.
 *
 * Produto pai eh detectado no backend (expandido nas filhas com mesmo pct).
 */
import { useCallback, useEffect, useState } from "react";
import { X, Search, Loader2, Trash2, AlertTriangle, Tag } from "lucide-react";
import { useErrorStore } from "@/stores/errorStore";

interface ProdutoBusca {
  id_produto: number;
  sku: string;
  nome: string;
  preco_tiny: string | null;
  eh_pai?: boolean | null;
}

interface ItemSelecionado {
  produto_id: number;
  sku: string;
  nome: string;
  preco_original: number;
  preco_promo: string; // string para nao perder digitacao
  eh_pai: boolean;
}

interface ConflitoUI {
  produto_id: number;
  sku: string | null;
  nome: string | null;
  promocao_id: number;
  nome_campanha: string;
  data_inicio: string;
  data_fim: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialItems?: ItemSelecionado[]; // permite pre-popular vindo do PromotionModal
  initialNome?: string;
}

function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function NovaPromocaoModal({
  isOpen, onClose, onCreated, initialItems, initialNome,
}: Props) {
  const [nome, setNome] = useState(initialNome ?? "");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoBusca[]>([]);
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [itens, setItens] = useState<ItemSelecionado[]>(initialItems ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [pctBulk, setPctBulk] = useState("");
  const [conflitos, setConflitos] = useState<ConflitoUI[] | null>(null);
  const pushError = useErrorStore(s => s.push);

  useEffect(() => {
    if (isOpen) {
      // Reset apenas se nao tem initial
      if (!initialItems) {
        setItens([]);
        setNome(initialNome ?? "");
      }
      setBusca("");
      setResultados([]);
      setConflitos(null);
      // Datas default: hoje -> +7 dias
      const hoje = new Date();
      const fim = new Date(hoje); fim.setDate(fim.getDate() + 7);
      setDataInicio(hoje.toISOString().slice(0, 10));
      setDataFim(fim.toISOString().slice(0, 10));
    }
  }, [isOpen, initialItems, initialNome]);

  // Busca de produto debounced
  useEffect(() => {
    if (!isOpen) return;
    if (busca.trim().length < 2) { setResultados([]); return; }
    const handle = setTimeout(async () => {
      setLoadingBusca(true);
      try {
        // Reaproveita /api/produtos. Esse endpoint exige permissao 'produtos',
        // mas quem chega aqui ja eh admin/dev/gerente_loja - todos com produtos.
        const res = await fetch(`/api/produtos?busca=${encodeURIComponent(busca.trim())}&limit=20`);
        if (!res.ok) { setResultados([]); return; }
        const data = await res.json();
        setResultados((data.produtos ?? []).map((p: { id_produto: number; sku: string; nome: string; preco_tiny: string | null; eh_pai: boolean | null }) => ({
          id_produto: Number(p.id_produto),
          sku: p.sku,
          nome: p.nome,
          preco_tiny: p.preco_tiny,
          eh_pai: p.eh_pai ?? false,
        })));
      } catch { setResultados([]); }
      finally { setLoadingBusca(false); }
    }, 250);
    return () => clearTimeout(handle);
  }, [busca, isOpen]);

  function adicionarItem(p: ProdutoBusca) {
    if (itens.some(i => i.produto_id === p.id_produto)) return;
    const preco = parseFloat(p.preco_tiny ?? "0") || 0;
    setItens(prev => [...prev, {
      produto_id: p.id_produto,
      sku: p.sku,
      nome: p.nome,
      preco_original: preco,
      preco_promo: "",
      eh_pai: !!p.eh_pai,
    }]);
    setBusca("");
    setResultados([]);
  }

  function removerItem(produto_id: number) {
    setItens(prev => prev.filter(i => i.produto_id !== produto_id));
  }

  function aplicarBulk() {
    const pct = parseFloat(pctBulk.replace(",", "."));
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      pushError("Informe um percentual entre 0 e 100");
      return;
    }
    setItens(prev => prev.map(i => ({
      ...i,
      preco_promo: i.preco_original > 0
        ? (Math.round(i.preco_original * (1 - pct / 100) * 100) / 100).toFixed(2)
        : i.preco_promo,
    })));
  }

  const removerConflitantes = useCallback(() => {
    if (!conflitos) return;
    const idsConflito = new Set(conflitos.map(c => c.produto_id));
    setItens(prev => prev.filter(i => !idsConflito.has(i.produto_id)));
    setConflitos(null);
  }, [conflitos]);

  async function submeter() {
    if (!nome.trim()) { pushError("Nome da campanha eh obrigatorio"); return; }
    if (!dataInicio || !dataFim) { pushError("Datas obrigatorias"); return; }
    if (dataFim < dataInicio) { pushError("data_fim deve ser >= data_inicio"); return; }
    if (itens.length === 0) { pushError("Adicione ao menos 1 produto"); return; }
    const itensValidos = itens.filter(i => {
      const v = parseFloat(i.preco_promo.replace(",", "."));
      return Number.isFinite(v) && v >= 0;
    });
    if (itensValidos.length === 0) {
      pushError("Defina o preco promocional dos itens");
      return;
    }

    setSubmitting(true);
    setConflitos(null);
    try {
      const res = await fetch("/api/promocoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_campanha: nome.trim(),
          data_inicio: dataInicio,
          data_fim: dataFim,
          observacao: observacao.trim() || null,
          itens: itensValidos.map(i => ({
            produto_id: i.produto_id,
            preco_promo: parseFloat(i.preco_promo.replace(",", ".")),
          })),
        }),
      });
      if (res.status === 409) {
        const body = await res.json();
        setConflitos(body.conflitos ?? []);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        pushError(body.error ?? "Erro ao criar promocao");
        return;
      }
      onCreated();
    } catch (err) {
      pushError("Falha de rede ao criar promocao", { detail: String(err) });
    } finally { setSubmitting(false); }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-creme-200">
          <div className="flex items-center gap-3">
            <Tag size={20} className="text-alisson-gold" />
            <h2 className="text-lg font-semibold">Nova Campanha</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Conflitos */}
          {conflitos && conflitos.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle size={18} className="text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-800 mb-2">
                    {conflitos.length} produto(s) ja participam de outra promocao na janela escolhida:
                  </p>
                  <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                    {conflitos.map(c => (
                      <li key={`${c.produto_id}-${c.promocao_id}`}>
                        <span className="font-mono">{c.sku ?? c.produto_id}</span> - {c.nome ?? "?"}
                        <span className="text-red-500"> ja em &quot;{c.nome_campanha}&quot; ({c.data_inicio.slice(0,10)} - {c.data_fim.slice(0,10)})</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={removerConflitantes}
                    className="mt-3 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Remover esses produtos da nova campanha
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cabecalho */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Nome da campanha</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={200}
                className="mt-1 w-full px-3 py-2 text-sm border border-creme-200 rounded-lg focus:outline-none focus:border-alisson-gold/50"
                placeholder="Ex: Dia das Maes 2026"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Inicio</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-creme-200 rounded-lg focus:outline-none focus:border-alisson-gold/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-creme-200 rounded-lg focus:outline-none focus:border-alisson-gold/50"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Observacao (opcional)</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-creme-200 rounded-lg focus:outline-none focus:border-alisson-gold/50"
              />
            </div>
          </div>

          {/* Busca de produto */}
          <div className="border-t border-creme-200 pt-4">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Adicionar produto</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="SKU ou nome (min 2 caracteres)"
                className="pl-9 pr-3 py-2 w-full text-sm border border-creme-200 rounded-lg focus:outline-none focus:border-alisson-gold/50"
              />
              {loadingBusca && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
            </div>
            {resultados.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto border border-creme-200 rounded-lg bg-white">
                {resultados.map(p => (
                  <button
                    key={p.id_produto}
                    onClick={() => adicionarItem(p)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-creme-50 border-b border-creme-100 last:border-b-0 flex justify-between items-center"
                  >
                    <div>
                      <span className="font-mono text-gray-500">{p.sku}</span>{" "}
                      <span className="text-gray-900">{p.nome}</span>
                      {p.eh_pai && <span className="ml-1 text-[9px] uppercase font-bold text-blue-600">PAI</span>}
                    </div>
                    <span className="text-gray-700">{fmtMoeda(parseFloat(p.preco_tiny ?? "0"))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Itens selecionados */}
          {itens.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {itens.length} {itens.length === 1 ? "produto" : "produtos"}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={pctBulk}
                    onChange={(e) => setPctBulk(e.target.value)}
                    placeholder="%"
                    className="w-16 px-2 py-1 text-xs border border-creme-200 rounded"
                  />
                  <button
                    onClick={aplicarBulk}
                    className="px-2 py-1 text-xs font-semibold border border-alisson-gold/30 text-alisson-gold rounded hover:bg-alisson-gold/10"
                  >
                    -X% em todos
                  </button>
                </div>
              </div>
              <div className="border border-creme-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-creme-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">SKU / Nome</th>
                      <th className="text-right px-3 py-2 font-semibold">Lista</th>
                      <th className="text-right px-3 py-2 font-semibold">Promo (R$)</th>
                      <th className="text-right px-3 py-2 font-semibold">% Desc.</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(i => {
                      const pp = parseFloat(i.preco_promo.replace(",", "."));
                      const pct = (Number.isFinite(pp) && i.preco_original > 0)
                        ? ((i.preco_original - pp) / i.preco_original) * 100
                        : null;
                      return (
                        <tr key={i.produto_id} className="border-t border-creme-100">
                          <td className="px-3 py-2">
                            <div className="font-mono text-gray-500">{i.sku}</div>
                            <div className="text-gray-900 truncate max-w-[260px]" title={i.nome}>
                              {i.nome}
                              {i.eh_pai && <span className="ml-1 text-[9px] uppercase font-bold text-blue-600">PAI</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmtMoeda(i.preco_original)}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={i.preco_promo}
                              onChange={(e) => setItens(prev => prev.map(x => x.produto_id === i.produto_id ? { ...x, preco_promo: e.target.value } : x))}
                              className="w-24 px-2 py-1 text-right border border-creme-200 rounded text-alisson-gold font-semibold"
                              placeholder="0,00"
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                            {pct != null && pct > 0 ? `-${pct.toFixed(1)}%` : "-"}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => removerItem(i.produto_id)}
                              className="text-gray-400 hover:text-red-600"
                              title="Remover"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Produtos marcados como <strong>PAI</strong> aplicam o mesmo % de desconto em todas as variacoes (expansao no backend).
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-creme-200 flex justify-end gap-3 bg-creme-50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-gray-700 border border-creme-200 rounded-lg hover:bg-white"
          >
            Cancelar
          </button>
          <button
            onClick={submeter}
            disabled={submitting || itens.length === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-alisson-gold rounded-lg hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Criar Campanha
          </button>
        </div>
      </div>
    </div>
  );
}
