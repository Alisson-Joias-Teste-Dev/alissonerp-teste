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
  stoneMmToCt,
} from "@/app/(dashboard)/orcamento/constants";

interface StonePrice {
  tipo: string;
  preco_usd_ct: number;
  preco_rs_un?: number;
}

/**
 * Tabela salva de markups por tamanho. Cada pedra (tipo) pode ter várias tabelas
 * com ranges diferentes. Ex: "Padrão 1.0–2.5mm" + "Grandes 1.0–6.0mm".
 * Markups são keyed por mm-string ("1.0", "1.1", ..., "6.0") para serem estáveis
 * quando o usuário muda o range.
 */
interface TabelaSalva {
  id: string;        // uid curto (random) ou "default"
  min: number;
  max: number;
  markups: Record<string, number>;
  // Custo da pedra associado a essa tabela (pode variar por range/qualidade).
  // Para Zirconia usa preco_rs_un (R$/un); para demais, preco_usd_ct (USD/ct).
  preco_usd_ct?: number;
  preco_rs_un?: number;
}

const TABELAS_KEY = "_multi_tables";   // chave reservada dentro de stone_markups_table
const rangeLabel = (t: TabelaSalva) => `${t.min.toFixed(1)}–${t.max.toFixed(1)}mm (${Object.keys(t.markups).length})`;
const mkId = () => Math.random().toString(36).slice(2, 9);

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
  // Faixa de tamanhos a gerar (em mm) — passo fixo de 0.1mm.
  const [tamanhoInicial, setTamanhoInicial] = useState(1.0);
  const [tamanhoFinal,   setTamanhoFinal]   = useState(2.5);
  // Multi-tabela: lista de tabelas salvas por tipo + id da tabela ativa.
  const [tabelasPorTipo, setTabelasPorTipo] = useState<Record<string, TabelaSalva[]>>({});
  const [tabelaAtivaId,  setTabelaAtivaId]  = useState<string>("new"); // "new" = criando/editando range livre
  // Quantidade inicial em estoque é sempre 0 no cadastro em massa — o usuário
  // imputa a quantidade manualmente depois na ficha de cada pedra-produto.
  const qtdInicial = 0;
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [sucesso, setSucesso]         = useState<{
    criados: number;
    atualizados: number;
    pulados: number;
    pedra: string;
    qtd_inicial: number;
  } | null>(null);
  // Confirmação de exclusão em massa
  const [confExcluir, setConfExcluir] = useState<{ escopo: "pedra" | "todas"; label: string; total: number } | null>(null);
  const [excluindo, setExcluindo]     = useState(false);
  // Totais por label (carregado via GET /pedras-bulk)
  const [totaisPorLabel, setTotaisPorLabel] = useState<Record<string, number>>({});

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
    } catch { /* ignora */ }
  };

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
          if (tbl && typeof tbl === "object" && !cancel) {
            // Separa o legado (flat por índice) das multi-tabelas
            const { [TABELAS_KEY]: multi, ...flat } = tbl as Record<string, unknown>;
            setAllMarkups(flat as Record<string, Record<string, number>>);

            // Inicializa multi-tabelas: usa o que veio salvo OU migra o legado.
            const next: Record<string, TabelaSalva[]> = {};
            if (multi && typeof multi === "object") {
              for (const [tipo, lista] of Object.entries(multi as Record<string, unknown>)) {
                if (Array.isArray(lista)) next[tipo] = lista as TabelaSalva[];
              }
            }
            // Migração: para cada tipo com markups flat e sem tabela salva, cria "Padrão 1.0–2.5mm".
            for (const [tipo, flatMkps] of Object.entries(flat as Record<string, Record<string, number>>)) {
              if (next[tipo]?.length) continue;
              const markups: Record<string, number> = {};
              STONE_CT_TABLE.forEach((row, idx) => {
                const v = Number(flatMkps?.[String(idx)]);
                if (!isNaN(v) && v > 0) markups[row.mm.toFixed(1)] = v;
              });
              if (Object.keys(markups).length > 0) {
                next[tipo] = [{ id: "default", min: 1.0, max: 2.5, markups }];
              }
            }
            if (!cancel) setTabelasPorTipo(next);
          }
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open]);

  const sp = stonePrices[simPedra];
  const isZirc = sp?.tipo === "zirconia";

  // Tabela dinâmica de tamanhos. Passo de 0.1mm entre [tamanhoInicial, tamanhoFinal].
  // Para mm dentro da tabela canônica (1.0–2.5) usa interpolação linear; para
  // valores acima extrapola via cubo escalado no último ponto conhecido
  // (ct(mm) = ct_max × (mm/mm_max)^3), que aproxima corte brilhante.
  const STONE_CT = useMemo(() => {
    const min = Math.max(0.1, Math.min(tamanhoInicial, tamanhoFinal));
    const max = Math.max(tamanhoInicial, tamanhoFinal);
    const steps = Math.max(1, Math.round((max - min) / 0.1) + 1);
    const last = STONE_CT_TABLE[STONE_CT_TABLE.length - 1]; // { mm: 2.5, ct: 0.060 }
    const rows: { mm: number; ct: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const mm = Math.round((min + i * 0.1) * 10) / 10;
      const ct = mm <= last.mm
        ? stoneMmToCt(mm)
        : Math.round(last.ct * Math.pow(mm / last.mm, 3) * 1000) / 1000;
      rows.push({ mm, ct: Math.round(ct * 1000) / 1000 });
    }
    return rows;
  }, [tamanhoInicial, tamanhoFinal]);

  // ───────────── Multi-tabela: sincroniza state com tipo selecionado ─────────────
  // Ao trocar de pedra: se a tabelaAtivaId existe na lista do novo tipo, mantém
  // (e puxa o range dela). Caso contrário, elege a primeira ou entra em "new".
  // Importante: respeita "new" — usuário clicou "+ Nova Tabela", não pode reverter.
  useEffect(() => {
    if (tabelaAtivaId === "new") return;
    const tipo = stonePrices[simPedra]?.tipo;
    if (!tipo) return;
    const lista = tabelasPorTipo[tipo] ?? [];
    const ativa = lista.find(t => t.id === tabelaAtivaId);

    // Helper: aplica range + custo da tabela em stonePrices[simPedra]
    const aplicar = (t: TabelaSalva) => {
      setTamanhoInicial(t.min);
      setTamanhoFinal(t.max);
      // Custo da tabela tem prioridade sobre o stonePrices atual (por tipo)
      if (t.preco_usd_ct != null || t.preco_rs_un != null) {
        setStonePrices(prev => {
          const next = [...prev];
          const cur = next[simPedra];
          if (cur) {
            next[simPedra] = {
              ...cur,
              preco_usd_ct: t.preco_usd_ct ?? cur.preco_usd_ct ?? 0,
              preco_rs_un:  t.preco_rs_un  ?? cur.preco_rs_un,
            };
          }
          return next;
        });
      }
    };

    if (ativa) {
      aplicar(ativa);
    } else if (lista.length > 0) {
      const t = lista[0];
      setTabelaAtivaId(t.id);
      aplicar(t);
    } else {
      setTabelaAtivaId("new");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPedra, stonePrices.length, tabelasPorTipo, tabelaAtivaId]);

  // Recalcular rowMarkups ao trocar pedra/tabela OU ao mudar a faixa (modo "new").
  useEffect(() => {
    const tipo = stonePrices[simPedra]?.tipo;
    if (!tipo) return;
    const lista = tabelasPorTipo[tipo] ?? [];
    const ativa = tabelaAtivaId !== "new" ? lista.find(t => t.id === tabelaAtivaId) : undefined;

    if (ativa) {
      // Carrega markups da tabela salva por mm-string → mapa por índice do STONE_CT atual.
      const mapped: Record<number, number> = {};
      STONE_CT.forEach((row, idx) => {
        const v = ativa.markups[row.mm.toFixed(1)];
        mapped[idx] = (v != null && !isNaN(v)) ? v : 1;
      });
      setRowMarkups(mapped);
    } else {
      // Modo "new": gera linear de mkpInicial → mkpFinal.
      const steps = STONE_CT.length - 1;
      const autoDec = steps > 0 ? (mkpInicial - mkpFinal) / steps : 0;
      const newMkps: Record<number, number> = {};
      STONE_CT.forEach((_, idx) => {
        newMkps[idx] = Math.round(Math.max(1, mkpInicial - idx * autoDec) * 10) / 10;
      });
      setRowMarkups(newMkps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPedra, stonePrices, STONE_CT.length, tabelaAtivaId, tabelasPorTipo]);

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

  // Quando chamado pelo fluxo unificado (salvar+cadastrar), suprime o toast
  // de sucesso individual para não conflitar com o overlay final.
  async function salvarTabela(opts: { silent?: boolean } = {}) {
    if (!sp) return false;
    setSaving(true);
    try {
      // Monta a tabela atual (markups keyed por mm-string a partir de STONE_CT + rowMarkups).
      const markupsByMm: Record<string, number> = {};
      STONE_CT.forEach((row, idx) => {
        const v = rowMarkups[idx];
        if (v != null && !isNaN(v) && v > 0) markupsByMm[row.mm.toFixed(1)] = v;
      });

      // Custo associado a esta tabela (salvo dentro da própria tabela).
      const custo: Pick<TabelaSalva, "preco_usd_ct" | "preco_rs_un"> = isZirc
        ? { preco_rs_un:  Number(sp.preco_rs_un  ?? 0) }
        : { preco_usd_ct: Number(sp.preco_usd_ct ?? 0) };

      // Upsert na lista de tabelas do tipo: se for "new" adiciona; senão atualiza.
      const lista = [...(tabelasPorTipo[sp.tipo] ?? [])];
      let idParaAtivar = tabelaAtivaId;
      if (tabelaAtivaId === "new") {
        const novaId = mkId();
        lista.push({ id: novaId, min: tamanhoInicial, max: tamanhoFinal, markups: markupsByMm, ...custo });
        idParaAtivar = novaId;
      } else {
        const idx = lista.findIndex(t => t.id === tabelaAtivaId);
        if (idx >= 0) lista[idx] = { ...lista[idx], min: tamanhoInicial, max: tamanhoFinal, markups: markupsByMm, ...custo };
      }
      const novasTabelas = { ...tabelasPorTipo, [sp.tipo]: lista };

      // Compat legado (orçamento): se a tabela ativa cobre 1.0–2.5mm, também grava flat por índice.
      const legacyFlat = { ...allMarkups };
      if (Math.abs(tamanhoInicial - 1.0) < 0.05 && Math.abs(tamanhoFinal - 2.5) < 0.05) {
        const flatPorIdx: Record<string, number> = {};
        STONE_CT_TABLE.forEach((row, idx) => {
          const v = markupsByMm[row.mm.toFixed(1)];
          if (v != null) flatPorIdx[String(idx)] = v;
        });
        legacyFlat[sp.tipo] = flatPorIdx;
      }

      // Payload: JSONB combinado — legado achatado + chave reservada para multi.
      const payload: Record<string, unknown> = { ...legacyFlat, [TABELAS_KEY]: novasTabelas };
      const res = await fetch("/api/orcamento/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stone_markups_table: payload, stone_prices: stonePrices }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");

      setAllMarkups(legacyFlat);
      setTabelasPorTipo(novasTabelas);
      setTabelaAtivaId(idParaAtivar);
      if (!opts.silent) {
        const label = STONE_TYPES.find(t => t.value === sp.tipo)?.label;
        setToast({ msg: `Tabela ${tamanhoInicial.toFixed(1)}–${tamanhoFinal.toFixed(1)}mm de ${label} salva.`, ok: true });
        setTimeout(() => setToast(null), 3500);
      }
      return true;
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro", ok: false });
      setTimeout(() => setToast(null), 3500);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Persiste imediatamente o estado atual de tabelasPorTipo (sem mexer em
  // markups/range — só faz UPDATE no JSONB de stone_markups_table).
  async function persistirTabelas(novasTabelas: Record<string, TabelaSalva[]>) {
    const payload: Record<string, unknown> = { ...allMarkups, [TABELAS_KEY]: novasTabelas };
    const res = await fetch("/api/orcamento/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stone_markups_table: payload, stone_prices: stonePrices }),
    });
    if (!res.ok) throw new Error("Falha ao persistir");
  }

  // Exclui uma tabela específica (por tipo + id) — persiste no banco imediatamente.
  async function excluirTabela(tipo: string, id: string) {
    if (id === "new") return;
    const lista = (tabelasPorTipo[tipo] ?? []).filter(t => t.id !== id);
    const novas = { ...tabelasPorTipo, [tipo]: lista };
    try {
      await persistirTabelas(novas);
      setTabelasPorTipo(novas);
      // Se estava ativa, troca para outra (ou "new")
      if (tipo === sp?.tipo && tabelaAtivaId === id) {
        setTabelaAtivaId(lista[0]?.id ?? "new");
      }
      const label = STONE_TYPES.find(t => t.value === tipo)?.label ?? tipo;
      setToast({ msg: `Tabela de ${label} excluída.`, ok: true });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Erro ao excluir", ok: false });
    } finally {
      setTimeout(() => setToast(null), 3500);
    }
  }

  // Limpa todos os campos editáveis para criar tabela do zero (Dólar é automático).
  function resetParaNovaTabela() {
    setTabelaAtivaId("new");
    setTamanhoInicial(0);
    setTamanhoFinal(0);
    setMkpInicial(0);
    setMkpFinal(0);
    setMkpDecr(0);
    setRowMarkups({});
    setStonePrices(prev => {
      const next = [...prev];
      const cur = next[simPedra];
      if (cur) {
        next[simPedra] = { ...cur, preco_usd_ct: 0, preco_rs_un: 0 };
      }
      return next;
    });
  }

  // Carrega uma tabela específica no editor — troca pedra + ativa a tabela
  // + ajusta o range + carrega o CUSTO específico daquela tabela.
  function editarTabela(tipo: string, id: string) {
    const idx = stonePrices.findIndex(s => s.tipo === tipo);
    if (idx >= 0 && idx !== simPedra) setSimPedra(idx);
    setTabelaAtivaId(id);
    const t = (tabelasPorTipo[tipo] ?? []).find(x => x.id === id);
    if (t) {
      setTamanhoInicial(t.min);
      setTamanhoFinal(t.max);
      if (t.preco_usd_ct != null || t.preco_rs_un != null) {
        setStonePrices(prev => {
          const next = [...prev];
          const targetIdx = idx >= 0 ? idx : simPedra;
          const cur = next[targetIdx];
          if (cur) {
            next[targetIdx] = {
              ...cur,
              preco_usd_ct: t.preco_usd_ct ?? cur.preco_usd_ct ?? 0,
              preco_rs_un:  t.preco_rs_un  ?? cur.preco_rs_un,
            };
          }
          return next;
        });
      }
    }
  }

  function excluirTabelaAtiva() {
    if (!sp || tabelaAtivaId === "new") return;
    void excluirTabela(sp.tipo, tabelaAtivaId);
  }

  // Fluxo unificado: salva a tabela primeiro, depois cadastra/atualiza pedras.
  // Garante que toda pedra cadastrada tenha uma tabela associada.
  async function salvarECadastrar() {
    if (saving || cadastrando) return;
    const ok = await salvarTabela({ silent: true });
    if (!ok) return;
    await cadastrarEmMassa();
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
        atualizados: Number(data?.atualizados ?? 0),
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

      const del = Number(data?.excluidos ?? 0);
      const ina = Number(data?.inativados ?? 0);
      let msg: string;
      if (del === 0 && ina === 0) {
        msg = "Nenhuma pedra correspondente encontrada.";
      } else if (ina === 0) {
        msg = `${del} pedra${del === 1 ? "" : "s"} excluída${del === 1 ? "" : "s"} com sucesso.`;
      } else if (del === 0) {
        msg = `${ina} pedra${ina === 1 ? "" : "s"} inativada${ina === 1 ? "" : "s"} (já vendida${ina === 1 ? "" : "s"} — preservadas para histórico).`;
      } else {
        msg = `${del} excluída${del === 1 ? "" : "s"} + ${ina} inativada${ina === 1 ? "" : "s"} (já vendida${ina === 1 ? "" : "s"}).`;
      }
      setToast({ msg, ok: (del + ina) > 0 });
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
            <div className="space-y-4">
            {/* ── Tabelas salvas (todas as pedras) ── */}
            {(() => {
              const tipos = STONE_TYPES.filter(t => (tabelasPorTipo[t.value]?.length ?? 0) > 0);
              if (tipos.length === 0) return null;
              return (
                <div className="bg-white rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder }}>
                  <h3 className="text-sm font-bold text-gray-800">Tabelas Salvas</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {tipos.flatMap(t => (tabelasPorTipo[t.value] ?? []).map(tab => {
                      const ativa = sp?.tipo === t.value && tabelaAtivaId === tab.id;
                      const mks = Object.values(tab.markups);
                      const mkRange = mks.length > 0 ? `${Math.max(...mks)} → ${Math.min(...mks)}` : "—";
                      return (
                        <div key={`${t.value}-${tab.id}`}
                          className="flex items-center gap-2 p-2.5 rounded-lg border transition-colors"
                          style={{
                            borderColor: ativa ? C.esmeralda : C.cremeBorder,
                            backgroundColor: ativa ? "#F0F9F4" : "#fff",
                          }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[12px] font-bold" style={{ color: ativa ? C.esmeralda : "#1f2937" }}>
                                {t.label}
                              </span>
                              {tab.id === "default" && (
                                <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded"
                                      style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                                  Padrão
                                </span>
                              )}
                              {ativa && (
                                <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded"
                                      style={{ backgroundColor: C.esmeralda, color: "#fff" }}>
                                  Em edição
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">
                              {rangeLabel(tab)} · markup {mkRange}
                              {tab.preco_usd_ct != null && tab.preco_usd_ct > 0 && (
                                <> · USD {tab.preco_usd_ct.toFixed(2)}/ct</>
                              )}
                              {tab.preco_rs_un != null && tab.preco_rs_un > 0 && (
                                <> · R$ {tab.preco_rs_un.toFixed(2)}/un</>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => editarTabela(t.value, tab.id)}
                            disabled={ativa}
                            className="text-[10px] font-semibold px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-40"
                            style={{ borderColor: C.cremeBorder, color: "#374151" }}
                            title="Carregar esta tabela no editor"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Excluir tabela ${rangeLabel(tab)} de ${t.label}?\n\nA exclusão é permanente.`)) {
                                void excluirTabela(t.value, tab.id);
                              }
                            }}
                            className="text-[10px] font-semibold px-2 py-1 rounded border hover:bg-red-50"
                            style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}
                            title="Excluir esta tabela"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    }))}
                  </div>
                </div>
              );
            })()}

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

              {/* Seletor de tabela — cada pedra pode ter várias tabelas por range de tamanhos. */}
              {!isZirc && (
                <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg border" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <label className="text-[10px] font-bold uppercase text-gray-500">Tabela</label>
                  <select
                    value={tabelaAtivaId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "new") resetParaNovaTabela();
                      else setTabelaAtivaId(v);
                    }}
                    className="flex-1 min-w-[180px] px-2 py-1.5 text-xs rounded border outline-none bg-white font-mono"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {(tabelasPorTipo[sp?.tipo ?? ""] ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id === "default" ? "Padrão " : ""}{rangeLabel(t)}
                      </option>
                    ))}
                    <option value="new">+ Nova Tabela…</option>
                  </select>
                  {tabelaAtivaId !== "new" && (
                    <button
                      onClick={excluirTabelaAtiva}
                      className="text-[10px] font-semibold px-2 py-1 rounded border hover:bg-red-50"
                      style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}
                      title="Remover esta tabela"
                    >
                      <Trash2 size={10} className="inline" /> Remover
                    </button>
                  )}
                  <span className="text-[10px] text-gray-400">
                    {tabelaAtivaId === "new"
                      ? "Modo criação: defina o range e salve."
                      : "Range travado. Edite markups abaixo ou crie uma nova tabela."}
                  </span>
                </div>
              )}

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
                    type="number" step={isZirc ? 1 : 10}
                    value={(() => {
                      const v = isZirc ? (sp?.preco_rs_un ?? 0) : (sp?.preco_usd_ct ?? 0);
                      return v === 0 ? "" : v;
                    })()}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === "" ? 0 : (parseFloat(raw) || 0);
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
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Tam. Inicial (mm)</label>
                      <input type="number" step={0.1}
                        value={tamanhoInicial === 0 ? "" : tamanhoInicial}
                        disabled={tabelaAtivaId !== "new"}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") { setTamanhoInicial(0); return; }
                          const v = parseFloat(raw);
                          if (!isNaN(v) && v >= 0) setTamanhoInicial(Math.round(v * 10) / 10);
                        }}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono disabled:bg-gray-50 disabled:text-gray-400"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Tam. Final (mm)</label>
                      <input type="number" step={0.1}
                        value={tamanhoFinal === 0 ? "" : tamanhoFinal}
                        disabled={tabelaAtivaId !== "new"}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") { setTamanhoFinal(0); return; }
                          const v = parseFloat(raw);
                          if (!isNaN(v) && v >= 0) setTamanhoFinal(Math.round(v * 10) / 10);
                        }}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono disabled:bg-gray-50 disabled:text-gray-400"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Mkp {tamanhoInicial || "—"}mm</label>
                      <input type="number" step={0.1}
                        value={mkpInicial === 0 ? "" : mkpInicial}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") { setMkpInicial(0); return; }
                          atualizarMkpInicial(parseFloat(raw));
                        }}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Decremento</label>
                      <input type="number" step={0.1}
                        value={mkpDecremento === 0 ? "" : mkpDecremento}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") { setMkpDecr(0); return; }
                          atualizarDec(parseFloat(raw));
                        }}
                        className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Mkp {tamanhoFinal || "—"}mm</label>
                      <input type="number" step={0.1}
                        value={mkpFinal === 0 ? "" : mkpFinal}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") { setMkpFinal(0); return; }
                          atualizarMkpFinal(parseFloat(raw));
                        }}
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
                          <th className="text-left px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Peso (ct)</th>
                          <th className="text-left px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Pontos</th>
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
                              <td className="px-3 py-1.5 text-[11px] text-gray-500">{row.ct.toFixed(2).replace(".", ",")} ct</td>
                              <td className="px-3 py-1.5 text-[11px] text-gray-500 font-mono">{(row.ct * 100).toFixed(1).replace(".", ",")} pt</td>
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

              {/* Ação unificada: salva a tabela e cadastra/atualiza as pedras
                  numa única operação — toda pedra cadastrada precisa ter tabela. */}
              <button
                onClick={salvarECadastrar}
                disabled={saving || cadastrando}
                className="w-full py-3 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: C.esmeralda }}
              >
                {(saving || cadastrando) ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} /><Diamond size={14} /></>}
                Salvar Tabela e Cadastrar Pedras
              </button>

              <p className="text-[10px] text-gray-400 text-center">
                Salva a tabela de markup acima e cria/atualiza{" "}
                <strong>{STONE_CT.length}</strong> pedra{STONE_CT.length === 1 ? "" : "s"} (categoria <strong>Pedras</strong>)
                entre <strong>{tamanhoInicial}mm</strong> e <strong>{tamanhoFinal}mm</strong> (passo 0.1mm).
                Pedras já cadastradas têm preço/peso atualizados.
              </p>

              {/* Status do catálogo removido — quantidade é imputada manualmente na
                  ficha de cada pedra-produto (drawer em /produtos). */}

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
              <h3 className="text-lg font-bold text-gray-800">
                {sucesso.criados > 0 ? "Pedras cadastradas!" : "Pedras atualizadas!"}
              </h3>
              <p className="text-sm text-gray-600">
                {sucesso.criados > 0 && (
                  <>
                    <strong>{sucesso.criados}</strong> nova{sucesso.criados === 1 ? "" : "s"} pedra{sucesso.criados === 1 ? "" : "s"} de{" "}
                    <strong>{sucesso.pedra}</strong> {sucesso.criados === 1 ? "criada" : "criadas"}.
                  </>
                )}
                {sucesso.atualizados > 0 && (
                  <>
                    {sucesso.criados > 0 && <br />}
                    <strong>{sucesso.atualizados}</strong> pedra{sucesso.atualizados === 1 ? "" : "s"} já existente{sucesso.atualizados === 1 ? "" : "s"} {sucesso.atualizados === 1 ? "atualizada" : "atualizadas"} (preço/peso).
                  </>
                )}
                {sucesso.criados === 0 && sucesso.atualizados === 0 && sucesso.pulados > 0 && (
                  <>
                    Nenhuma pedra processada — todas as {sucesso.pulados} já estavam idênticas.
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
