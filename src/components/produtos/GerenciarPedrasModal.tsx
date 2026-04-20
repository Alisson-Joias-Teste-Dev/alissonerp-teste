"use client";

/**
 * Modal padrão para gerenciar preços/markups de pedras preciosas + cadastrar
 * pedras em massa como produtos.
 *
 * Lê/salva em alissonerp.config_orcamento (mesma fonte usada em /orcamento).
 * Invocado pelo botão "💎 Pedras" na tela /produtos.
 *
 * Botões:
 *   • "Salvar Tabela — {pedra}"    → grava markup editado (stone_markups_table)
 *   • "Cadastrar N pedras em massa" → cria produtos em public.produtos com
 *       apenas 3 campos visíveis (mm, ct, preço_venda) via POST
 *       /api/produtos/pedras-bulk.
 */
import { useEffect, useMemo, useState } from "react";
import { X, RotateCcw, Save, Loader2, Check, Diamond, CheckCircle2, Trash2, AlertTriangle } from "lucide-react";
import {
  DEFAULT_STONE_PRICES,
  STONE_TYPES,
  STONE_CT_TABLE,
} from "@/app/(dashboard)/orcamento/constants";

interface StonePrice {
  tipo: string;
  preco_usd_ct: number;
  preco_rs_un?: number;
}

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function GerenciarPedrasModal({ open, onClose, onCreated }: Props) {
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [cotacaoDolar, setCot]  = useState(5);
  const [stonePrices, setStonePrices] = useState<StonePrice[]>(DEFAULT_STONE_PRICES as StonePrice[]);
  const [allMarkups, setAllMarkups]   = useState<Record<string, Record<string, number>>>({});
  const [simPedra, setSimPedra]       = useState(0);
  const [mkpInicial, setMkpInicial]   = useState(10);
  const [mkpFinal, setMkpFinal]       = useState(4);
  const [mkpDecremento, setMkpDecr]   = useState(0.4);
  const [rowMarkups, setRowMarkups]   = useState<Record<number, number>>({});
  const [qtdInicial, setQtdInicial]   = useState(1);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [sucesso, setSucesso]         = useState<{
    criados: number;
    pulados: number;
    pedra: string;
    qtd_inicial: number;
  } | null>(null);
  // Confirmação de exclusão em massa
  const [confExcluir, setConfExcluir] = useState<{ escopo: "pedra" | "todas"; label: string; total: number } | null>(null);
  const [excluindo, setExcluindo]     = useState(false);
  // Totais por label (carregado via GET /pedras-bulk)
  const [totaisPorLabel, setTotaisPorLabel] = useState<Record<string, number>>({});
  // Totais gerais do catálogo (com/sem saldo)
  const [catalogo, setCatalogo] = useState<{
    total: number;
    com_estoque: number;
    ultimos: Array<{ sku: string; nome: string; preco_tiny: number | null; saldo: number | null }>;
  }>({ total: 0, com_estoque: 0, ultimos: [] });
  const [corrigindoSaldo, setCorrigindoSaldo] = useState(false);

  // Recarrega totais de pedras por label (usado nos botões de exclusão)
  const recarregarTotais = async () => {
    try {
      const r = await fetch("/api/produtos/pedras-bulk");
      if (!r.ok) return;
      const j = await r.json();
      const map: Record<string, number> = {};
      if (Array.isArray(j?.por_label)) {
        for (const row of j.por_label) {
          map[String(row.nome_raiz).toLowerCase()] = Number(row.qtd) || 0;
        }
      }
      setTotaisPorLabel(map);
      setCatalogo({
        total: Number(j?.total ?? 0),
        com_estoque: Number(j?.com_estoque ?? 0),
        ultimos: Array.isArray(j?.ultimos) ? j.ultimos : [],
      });
    } catch { /* ignora */ }
  };

  async function corrigirSaldoTodas() {
    setCorrigindoSaldo(true);
    try {
      const res = await fetch("/api/produtos/pedras-bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qtd: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha");
      const zeradas = Number(data?.pedras_sem_saldo_antes ?? 0);
      setToast({
        msg: zeradas > 0
          ? `${zeradas} pedra${zeradas === 1 ? "" : "s"} sem saldo corrigida${zeradas === 1 ? "" : "s"} (saldo=1).`
          : "Todas as pedras já tinham saldo — nada a corrigir.",
        ok: true,
      });
      await recarregarTotais();
      onCreated?.();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
    } finally {
      setCorrigindoSaldo(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  // Carregar config
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [cotR, cfgR] = await Promise.all([
          fetch("/api/produtos/setup"),
          fetch("/api/orcamento/config"),
        ]);
        if (cotR.ok) {
          const j = await cotR.json();
          if (!cancel) setCot(Number(j?.cotacao?.dollar ?? 5));
        }
        // Carrega totais em paralelo (não bloqueia render principal)
        recarregarTotais();
        if (cfgR.ok) {
          const j = await cfgR.json();
          const cfg = j?.config ?? j;
          const raw = cfg?.stone_prices;
          let sp: StonePrice[] = DEFAULT_STONE_PRICES as StonePrice[];
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed) && parsed.length > 0) sp = parsed as StonePrice[];
          } catch { /* ignora */ }
          const merged = (DEFAULT_STONE_PRICES as StonePrice[]).map((def) => {
            const found = sp.find((s) => s.tipo === def.tipo);
            return found ? { ...def, ...found } : def;
          });
          if (!cancel) setStonePrices(merged);
          const tbl = cfg?.stone_markups_table;
          if (tbl && typeof tbl === "object" && !cancel) setAllMarkups(tbl);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open]);

  // Recalcular rowMarkups ao trocar pedra
  useEffect(() => {
    const tipo = stonePrices[simPedra]?.tipo;
    if (!tipo) return;
    const saved = allMarkups[tipo];
    if (saved) {
      setRowMarkups(Object.fromEntries(Object.entries(saved).map(([k, v]) => [Number(k), Number(v)])));
    } else {
      const steps = STONE_CT_TABLE.length - 1;
      const autoDec = steps > 0 ? (mkpInicial - mkpFinal) / steps : 0;
      const newMkps: Record<number, number> = {};
      STONE_CT_TABLE.forEach((_, idx) => {
        newMkps[idx] = Math.round(Math.max(1, mkpInicial - idx * autoDec) * 10) / 10;
      });
      setRowMarkups(newMkps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPedra, stonePrices]);

  const sp = stonePrices[simPedra];
  const isZirc = sp?.tipo === "zirconia";
  const STONE_CT = STONE_CT_TABLE;

  const fmtCusto = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtVenda = (v: number) => `R$ ${Math.ceil(v).toLocaleString("pt-BR")}`;

  const atualizarMkpInicial = (v: number) => {
    if (isNaN(v) || v < 1) return;
    setMkpInicial(v);
    const final = Math.max(1, v - mkpDecremento * (STONE_CT.length - 1));
    setMkpFinal(Math.round(final * 10) / 10);
    const newMkps: Record<number, number> = {};
    STONE_CT.forEach((_, idx) => { newMkps[idx] = Math.round(Math.max(1, v - idx * mkpDecremento) * 10) / 10; });
    setRowMarkups(newMkps);
  };
  const atualizarDec = (v: number) => {
    if (isNaN(v) || v < 0) return;
    setMkpDecr(v);
    const lastIdx = STONE_CT.length - 1;
    const newMkps: Record<number, number> = {};
    STONE_CT.forEach((_, idx) => {
      if (idx === 0)        { newMkps[idx] = mkpInicial; return; }
      if (idx === lastIdx)  { newMkps[idx] = mkpFinal;   return; }
      const val = Math.max(mkpFinal, Math.min(mkpInicial, mkpInicial - idx * v));
      newMkps[idx] = Math.round(val * 10) / 10;
    });
    setRowMarkups(newMkps);
  };
  const atualizarMkpFinal = (v: number) => {
    if (isNaN(v) || v < 1) return;
    setMkpFinal(v);
    const steps = STONE_CT.length - 1;
    const dec = steps > 0 ? Math.round((mkpInicial - v) / steps * 10) / 10 : 0;
    setMkpDecr(dec);
    const newMkps: Record<number, number> = {};
    STONE_CT.forEach((_, idx) => { newMkps[idx] = Math.round(Math.max(1, mkpInicial - idx * dec) * 10) / 10; });
    setRowMarkups(newMkps);
  };

  async function salvarTabela() {
    if (!sp) return;
    setSaving(true);
    try {
      const updated = { ...allMarkups, [sp.tipo]: { ...rowMarkups } };
      const res = await fetch("/api/orcamento/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stone_markups_table: updated, stone_prices: stonePrices }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setAllMarkups(updated);
      setToast({ msg: `Tabela de ${STONE_TYPES.find(t => t.value === sp.tipo)?.label} salva.`, ok: true });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  }

  // Cadastra 1 produto por linha da tabela (16 pedras) usando os preços atuais.
  async function cadastrarEmMassa() {
    if (!sp) return;
    const label = STONE_TYPES.find((t) => t.value === sp.tipo)?.label ?? sp.tipo;

    const itens = STONE_CT.map((row, rowIdx) => {
      const venda = isZirc
        ? (sp.preco_rs_un ?? 0)
        : row.ct * (sp.preco_usd_ct ?? 0) * cotacaoDolar * (rowMarkups[rowIdx] ?? 1);
      return {
        tipo: sp.tipo,
        label,
        mm: row.mm,
        ct: row.ct,
        preco_venda: Math.ceil(venda),
      };
    }).filter((it) => it.preco_venda > 0);

    if (itens.length === 0) {
      setToast({ msg: "Configure preço/markup antes de cadastrar.", ok: false });
      setTimeout(() => setToast(null), 3500);
      return;
    }

    setCadastrando(true);
    try {
      const res = await fetch("/api/produtos/pedras-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens, qtd_inicial: qtdInicial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao cadastrar");

      setSucesso({
        criados: Number(data?.criados ?? 0),
        pulados: Array.isArray(data?.pulados) ? data.pulados.length : 0,
        pedra: label,
        qtd_inicial: qtdInicial,
      });
      await recarregarTotais();
      onCreated?.();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setCadastrando(false);
    }
  }

  // ── Exclusão em massa ───────────────────────────────────────────────────────
  const labelAtual = STONE_TYPES.find((t) => t.value === sp?.tipo)?.label ?? "Pedra";
  const totalDaPedra = totaisPorLabel[labelAtual.toLowerCase()] ?? 0;
  const totalGeral   = Object.values(totaisPorLabel).reduce((a, b) => a + b, 0);

  function pedirExcluirPedra() {
    if (totalDaPedra === 0) {
      setToast({ msg: `Nenhuma pedra de ${labelAtual} cadastrada para excluir.`, ok: false });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setConfExcluir({ escopo: "pedra", label: labelAtual, total: totalDaPedra });
  }
  function pedirExcluirTodas() {
    if (totalGeral === 0) {
      setToast({ msg: "Nenhuma pedra cadastrada para excluir.", ok: false });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setConfExcluir({ escopo: "todas", label: "", total: totalGeral });
  }

  async function confirmarExclusao() {
    if (!confExcluir) return;
    setExcluindo(true);
    try {
      const body = confExcluir.escopo === "pedra" ? { label: confExcluir.label } : {};
      const res = await fetch("/api/produtos/pedras-bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao excluir");

      const qtd = Number(data?.excluidos ?? 0);
      setToast({
        msg: qtd === 0
          ? "Nenhuma pedra correspondente encontrada."
          : `${qtd} pedra${qtd === 1 ? "" : "s"} excluída${qtd === 1 ? "" : "s"} com sucesso.`,
        ok: qtd > 0,
      });
      setConfExcluir(null);
      await recarregarTotais();
      onCreated?.(); // força refresh da listagem
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
    } finally {
      setExcluindo(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const autoDecr = useMemo(() => {
    const steps = STONE_CT.length - 1;
    return steps > 0 ? (mkpInicial - mkpFinal) / steps : 0;
  }, [mkpInicial, mkpFinal, STONE_CT.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.cremeBorder }}>
          <h2 className="text-base font-semibold text-gray-800">Gerenciar Pedras Preciosas</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Simulador e Editor de Pedras</h3>
                <button
                  onClick={() => setStonePrices([...(DEFAULT_STONE_PRICES as StonePrice[])])}
                  className="text-[10px] font-semibold px-2 py-1 rounded border"
                  style={{ borderColor: C.cremeBorder, color: "#6b7280" }}
                >
                  <RotateCcw size={10} className="inline mr-1" /> Padrão
                </button>
              </div>

              {/* Controles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Pedra</label>
                  <select
                    value={simPedra}
                    onChange={(e) => setSimPedra(Number(e.target.value))}
                    className="w-full px-2 py-2 text-sm rounded-lg border outline-none bg-white"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {stonePrices.map((s, i) => (
                      <option key={s.tipo} value={i}>
                        {STONE_TYPES.find((t) => t.value === s.tipo)?.label ?? s.tipo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">
                    {isZirc ? "Preço (R$/un)" : "Custo ($)"}
                  </label>
                  <input
                    type="number" min={0} step={isZirc ? 1 : 10}
                    value={isZirc ? (sp?.preco_rs_un ?? 0) : (sp?.preco_usd_ct ?? 0)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      const upd = [...stonePrices];
                      if (isZirc) upd[simPedra] = { ...upd[simPedra], preco_rs_un: v };
                      else upd[simPedra] = { ...upd[simPedra], preco_usd_ct: v };
                      setStonePrices(upd);
                    }}
                    className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </div>
                {!isZirc && (
                  <>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Dólar (R$)</label>
                      <input type="number" disabled value={cotacaoDolar.toFixed(2)}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono bg-gray-50 text-gray-400"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Mkp 1mm</label>
                      <input type="number" min={1} step={0.1} value={mkpInicial}
                        onChange={(e) => atualizarMkpInicial(parseFloat(e.target.value))}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Decremento</label>
                      <input type="number" min={0} step={0.1} value={mkpDecremento}
                        onChange={(e) => atualizarDec(parseFloat(e.target.value))}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Mkp 2.5mm</label>
                      <input type="number" min={1} step={0.1} value={mkpFinal}
                        onChange={(e) => atualizarMkpFinal(parseFloat(e.target.value))}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                  </>
                )}
              </div>

              {/* Tabela de prévia */}
              {!isZirc && (
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                  <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: C.cremeBg }}>
                    <h4 className="text-[10px] font-bold uppercase text-gray-500">Prévia por tamanho</h4>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={{ borderColor: C.cremeBorder, backgroundColor: "#FAFAF7" }}>
                          <th className="text-left px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Tam</th>
                          <th className="text-left px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Peso</th>
                          <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Custo (R$)</th>
                          <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Markup</th>
                          <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Venda (R$)</th>
                          <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Lucro (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {STONE_CT.map((row, rowIdx) => {
                          const rowMkp = rowMarkups[rowIdx] ?? Math.round((mkpInicial - rowIdx * autoDecr) * 10) / 10;
                          const custoRS = row.ct * (sp?.preco_usd_ct ?? 0) * cotacaoDolar;
                          const vendaRS = custoRS * rowMkp;
                          const lucro = custoRS > 0 ? ((vendaRS - custoRS) / vendaRS * 100) : 0;
                          return (
                            <tr key={row.mm} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                              <td className="px-3 py-1.5 font-mono font-bold text-[11px]">{row.mm}mm</td>
                              <td className="px-3 py-1.5 text-[11px] text-gray-500">{row.ct.toFixed(3)} ct</td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] text-gray-500">{fmtCusto(custoRS)}</td>
                              <td className="px-1 py-0.5 text-right">
                                <input type="number" min={1} step={0.1} value={rowMkp}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!isNaN(v) && v >= 1) {
                                      setRowMarkups((prev) => ({ ...prev, [rowIdx]: Math.round(v * 10) / 10 }));
                                    }
                                  }}
                                  className="w-14 px-1 py-0.5 text-[11px] font-mono border rounded text-right outline-none"
                                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px] font-bold" style={{ color: C.esmeralda }}>
                                {fmtVenda(vendaRS)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-[11px]" style={{ color: lucro >= 50 ? "#059669" : "#DC2626" }}>
                                {lucro.toFixed(0)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Qtd inicial em estoque — por padrão 1 para garantir visibilidade
                  mesmo com o filtro "Apenas com estoque" ativo na tela /produtos. */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <label className="text-[11px] font-bold uppercase text-gray-600 whitespace-nowrap">
                  Qtd Inicial em Estoque
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={qtdInicial}
                  onChange={(e) => setQtdInicial(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 px-2 py-1 text-sm rounded border outline-none font-mono bg-white"
                  style={{ borderColor: C.cremeBorder }}
                />
                <span className="text-[10px] text-gray-500 flex-1">
                  {qtdInicial === 0
                    ? "⚠ Com 0, as pedras só aparecerão se você desmarcar \"Apenas com estoque\"."
                    : `Cada pedra entra com ${qtdInicial} un. em public.estoque.`}
                </span>
              </div>

              {/* Botões: salvar tabela + cadastrar em massa */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  onClick={salvarTabela}
                  disabled={saving || cadastrando}
                  className="py-2.5 rounded-lg text-sm font-semibold border flex items-center justify-center gap-2 hover:bg-gray-50 disabled:opacity-60"
                  style={{ borderColor: C.esmeralda, color: C.esmeralda }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar Tabela — {STONE_TYPES.find((t) => t.value === sp?.tipo)?.label ?? "Pedra"}
                </button>
                <button
                  onClick={cadastrarEmMassa}
                  disabled={saving || cadastrando}
                  className="py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: C.esmeralda }}
                >
                  {cadastrando ? <Loader2 size={14} className="animate-spin" /> : <Diamond size={14} />}
                  Cadastrar Pedras em Massa
                </button>
              </div>

              <p className="text-[10px] text-gray-400 text-center">
                O cadastro em massa cria {STONE_CT.length} produtos (categoria <strong>Pedras</strong>), um por tamanho,
                usando apenas <strong>mm</strong>, <strong>ct</strong> e <strong>preço de venda</strong>.
              </p>

              {/* Status do catálogo de pedras */}
              {catalogo.total > 0 && (
                <div className="border rounded-lg p-3 space-y-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold uppercase text-gray-600">Pedras no catálogo</h4>
                    <span className="text-[10px] font-mono text-gray-500">
                      {catalogo.com_estoque}/{catalogo.total} com saldo ≥ 1
                    </span>
                  </div>

                  {/* Alerta: pedras sem saldo */}
                  {catalogo.com_estoque < catalogo.total && (
                    <div className="flex items-start gap-2 p-2 rounded text-[11px]" style={{ backgroundColor: "#FEF9C3", color: "#854D0E", border: "1px solid #FDE68A" }}>
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <strong>{catalogo.total - catalogo.com_estoque}</strong> pedra{catalogo.total - catalogo.com_estoque === 1 ? "" : "s"}{" "}
                        {catalogo.total - catalogo.com_estoque === 1 ? "está" : "estão"} com saldo <strong>zero</strong> e não{" "}
                        {catalogo.total - catalogo.com_estoque === 1 ? "aparece" : "aparecem"} na listagem com o filtro
                        &ldquo;Apenas com estoque&rdquo; ligado.
                      </div>
                      <button
                        onClick={corrigirSaldoTodas}
                        disabled={corrigindoSaldo}
                        className="text-[10px] font-bold px-2 py-1 rounded text-white hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                        style={{ backgroundColor: "#854D0E" }}
                      >
                        {corrigindoSaldo ? <Loader2 size={10} className="animate-spin inline" /> : "Dar saldo 1"}
                      </button>
                    </div>
                  )}

                  {/* Amostra das últimas cadastradas */}
                  {catalogo.ultimos.length > 0 && (
                    <div className="max-h-28 overflow-y-auto border rounded" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
                      <table className="w-full text-[11px]">
                        <tbody>
                          {catalogo.ultimos.slice(0, 8).map((u) => (
                            <tr key={u.sku} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                              <td className="px-2 py-1 font-mono text-gray-400 w-16">{u.sku}</td>
                              <td className="px-2 py-1">{u.nome}</td>
                              <td className="px-2 py-1 text-right font-mono font-bold" style={{ color: C.esmeralda }}>
                                R$ {Number(u.preco_tiny ?? 0).toLocaleString("pt-BR")}
                              </td>
                              <td className="px-2 py-1 text-right font-mono w-14" style={{ color: Number(u.saldo ?? 0) >= 1 ? "#059669" : "#DC2626" }}>
                                {Number(u.saldo ?? 0) >= 1 ? `${u.saldo} un` : "zero"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Exclusão em massa */}
              <div className="border-t pt-3 mt-2" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-bold uppercase text-gray-500">Excluir em Massa</h4>
                  <span className="text-[10px] text-gray-400">
                    {totalGeral > 0
                      ? `${totalGeral} pedra${totalGeral === 1 ? "" : "s"} cadastrada${totalGeral === 1 ? "" : "s"} no catálogo`
                      : "Nenhuma pedra cadastrada"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <button
                    onClick={pedirExcluirPedra}
                    disabled={excluindo || totalDaPedra === 0}
                    className="py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}
                  >
                    <Trash2 size={12} />
                    Excluir {totalDaPedra > 0 ? `${totalDaPedra} ` : ""}pedra{totalDaPedra === 1 ? "" : "s"} de {labelAtual}
                  </button>
                  <button
                    onClick={pedirExcluirTodas}
                    disabled={excluindo || totalGeral === 0}
                    className="py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#B91C1C" }}
                  >
                    <Trash2 size={12} />
                    Excluir TODAS as pedras ({totalGeral})
                  </button>
                </div>
              </div>

              {toast && (
                <div
                  className="mt-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                  style={{
                    backgroundColor: toast.ok ? "#ECFDF5" : "#FEF2F2",
                    color: toast.ok ? "#065F46" : "#991B1B",
                    border: `1px solid ${toast.ok ? "#A7F3D0" : "#FECACA"}`,
                  }}
                >
                  <Check size={12} /> {toast.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Overlay de confirmação de exclusão */}
        {confExcluir && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6 z-20">
            <div className="max-w-sm w-full text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#FEE2E2" }}>
                <AlertTriangle size={38} style={{ color: "#B91C1C" }} />
              </div>
              <h3 className="text-lg font-bold text-gray-800">Confirmar exclusão</h3>
              <p className="text-sm text-gray-700">
                {confExcluir.escopo === "pedra" ? (
                  <>
                    Excluir <strong>{confExcluir.total} pedra{confExcluir.total === 1 ? "" : "s"}</strong> de{" "}
                    <strong>{confExcluir.label}</strong> do catálogo?
                  </>
                ) : (
                  <>
                    Excluir <strong>TODAS as {confExcluir.total} pedras</strong> cadastradas no catálogo?
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500">
                Esta ação é <strong>irreversível</strong>. Os produtos, o saldo em estoque e os registros em
                erp_produtos serão removidos.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfExcluir(null)}
                  disabled={excluindo}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border hover:bg-gray-50 disabled:opacity-60"
                  style={{ borderColor: C.cremeBorder, color: "#6b7280" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarExclusao}
                  disabled={excluindo}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: "#B91C1C" }}
                >
                  {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {excluindo ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Overlay de sucesso — confirmação visual após cadastro */}
        {sucesso && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6 z-10">
            <div className="max-w-sm w-full text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#ECFDF5" }}>
                <CheckCircle2 size={40} style={{ color: "#059669" }} />
              </div>
              <h3 className="text-lg font-bold text-gray-800">Pedras cadastradas!</h3>
              <p className="text-sm text-gray-600">
                {sucesso.criados > 0 && (
                  <>
                    <strong>{sucesso.criados}</strong> pedra{sucesso.criados === 1 ? "" : "s"} de{" "}
                    <strong>{sucesso.pedra}</strong> {sucesso.criados === 1 ? "foi cadastrada" : "foram cadastradas"} no catálogo.
                  </>
                )}
                {sucesso.criados === 0 && sucesso.pulados > 0 && (
                  <>
                    Nenhuma pedra nova — todas as {sucesso.pulados} já estavam cadastradas.
                  </>
                )}
                {sucesso.pulados > 0 && sucesso.criados > 0 && (
                  <>
                    <br />
                    <span className="text-xs text-gray-400">
                      ({sucesso.pulados} já {sucesso.pulados === 1 ? "existia" : "existiam"} — pulada{sucesso.pulados === 1 ? "" : "s"})
                    </span>
                  </>
                )}
              </p>

              {sucesso.criados > 0 && sucesso.qtd_inicial === 0 && (
                <div
                  className="px-3 py-2 rounded-lg text-xs text-left"
                  style={{ backgroundColor: "#FEF9C3", border: "1px solid #FDE68A", color: "#854D0E" }}
                >
                  <strong>Atenção:</strong> as pedras foram cadastradas com saldo <strong>zero</strong>.
                  Para vê-las na listagem, <strong>desmarque o filtro &ldquo;Apenas com estoque&rdquo;</strong>
                  no topo da tela /produtos — ou rode o cadastro novamente informando uma Qtd inicial.
                </div>
              )}
              {sucesso.criados > 0 && sucesso.qtd_inicial > 0 && (
                <div
                  className="px-3 py-2 rounded-lg text-xs text-left"
                  style={{ backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46" }}
                >
                  Cada pedra entrou com <strong>{sucesso.qtd_inicial} un.</strong> em estoque.
                  Procure na categoria <strong>Pedras</strong> (filtro lateral) ou busque por{" "}
                  <strong>&ldquo;{sucesso.pedra}&rdquo;</strong>.
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setSucesso(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border hover:bg-gray-50"
                  style={{ borderColor: C.cremeBorder, color: "#6b7280" }}
                >
                  Cadastrar outra
                </button>
                <button
                  onClick={() => { setSucesso(null); onClose(); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90"
                  style={{ backgroundColor: C.esmeralda }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
