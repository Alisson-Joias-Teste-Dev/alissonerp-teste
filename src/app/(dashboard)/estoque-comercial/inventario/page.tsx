"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ClipboardList, Plus, Loader2, X,
  RefreshCw, CheckCircle, XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface Inventario {
  id: number;
  local_estoque_id: number;
  local_nome: string;
  status: string;
  obs: string | null;
  categoria: string | null;
  data_abertura: string;
  data_conclusao: string | null;
  total_itens: number;
  itens_contados: number;
  itens_divergentes: number;
  // Contagem por PEÇA (unidades) — o que a lista exibe
  pecas_esperadas: number;
  pecas_contadas: number;
  pecas_divergentes: number;
  criado_por_email: string | null;
  concluido_por_email: string | null;
}

interface LocalEstoque { id: number; nome: string; }
interface Categoria { categoria: string; total_produtos: number; total_estoque?: number; tem_subcategorias?: boolean; }


function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  aberto:      { bg: "#DBEAFE", text: "#1E40AF", label: "Aberto"      },
  em_contagem: { bg: "#FEF3C7", text: "#92400E", label: "Em contagem" },
  concluido:   { bg: "#D1FAE5", text: "#065F46", label: "Concluido"   },
  cancelado:   { bg: "#FEE2E2", text: "#991B1B", label: "Cancelado"   },
};

export default function InventarioPage() {
  const router = useRouter();
  const { role } = useAuth();
  // Operador de inventário: abrir vira PEDIDO de aprovação (textos abaixo)
  const isOperador = role === "operador_inventario";
  const [items,       setItems]      = useState<Inventario[]>([]);
  const [locais,      setLocais]     = useState<LocalEstoque[]>([]);
  const [categorias,  setCategorias] = useState<Categoria[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [novoOpen,    setNovoOpen]   = useState(false);
  const [novoLocal,   setNovoLocal]  = useState(2);
  const [novoCategoria, setNovoCategoria] = useState("");
  const [novoObs,     setNovoObs]    = useState("");
  const [criando,     setCriando]    = useState(false);
  const [err,          setErr]       = useState("");
  // Paginação (10 por página, server-side) + filtros de período e situação
  const [total,   setTotal]   = useState(0);
  const [pagina,  setPagina]  = useState(1);
  const [periodo, setPeriodo] = useState<"todos" | "hoje" | "ontem" | "mes" | "custom">("todos");
  const [customDe,  setCustomDe]  = useState("");
  const [customAte, setCustomAte] = useState("");
  const [situacao,  setSituacao]  = useState<"aberto" | "concluido" | "cancelado" | null>(null);
  const [local,      setLocal]     = useState<number | null>(null);
  const [locaisDisp, setLocaisDisp] = useState<{ id: number; nome: string }[]>([]);
  const POR_PAGINA = 5;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("pagina", String(pagina));
      if (situacao) params.set("situacao", situacao);
      if (local) params.set("local", String(local));
      // Intervalo de datas (data de abertura) conforme o período escolhido
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hoje = new Date();
      let de = "", ate = "";
      if (periodo === "hoje") { de = ate = fmt(hoje); }
      else if (periodo === "ontem") { const o = new Date(hoje); o.setDate(o.getDate() - 1); de = ate = fmt(o); }
      else if (periodo === "mes") { de = fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); ate = fmt(hoje); }
      else if (periodo === "custom" && customDe && customAte) { de = customDe; ate = customAte; }
      if (de && ate) { params.set("de", de); params.set("ate", ate); }

      const r = await fetch(`/api/estoque-comercial/inventario?${params.toString()}`);
      if (r.ok) {
        const d = await r.json() as { items: Inventario[]; total: number; locaisDisponiveis?: { id: number; nome: string }[] };
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
        if (d.locaisDisponiveis) setLocaisDisp(d.locaisDisponiveis);
      }
    } finally { setLoading(false); }
  }, [pagina, situacao, local, periodo, customDe, customAte]);

  const fetchLocais = useCallback(async () => {
    try {
      const r = await fetch("/api/locais-estoque");
      if (r.ok) setLocais(await r.json());
    } catch { /* ignore */ }
  }, []);

  const fetchCategorias = useCallback(async (localId: number) => {
    try {
      const r = await fetch(`/api/estoque-comercial/categorias?local_estoque_id=${localId}`);
      if (r.ok) setCategorias(await r.json());
    } catch { /* ignore */ }
  }, []);

  // Carregar categorias ao abrir modal ou mudar local
  useEffect(() => {
    if (novoOpen) fetchCategorias(novoLocal);
  }, [novoOpen, novoLocal, fetchCategorias]);

  useEffect(() => { fetchData(); fetchLocais(); }, [fetchData, fetchLocais]);

  async function handleCriar() {
    setCriando(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local_estoque_id: novoLocal,
          obs: novoObs || undefined,
          categoria: novoCategoria || undefined,
        }),
      });

      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const data = await r.json() as { id?: number; solicitado?: boolean; mensagem?: string };
      // Operador de inventário: a abertura vira PEDIDO — não navega, avisa
      if (data.solicitado) {
        setNovoOpen(false);
        setErr("");
        alert(data.mensagem ?? "Pedido enviado para aprovação do administrador.");
        return;
      }
      setNovoOpen(false);
      await fetchData();
      router.push(`/estoque-comercial/inventario/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally { setCriando(false); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} />
        Estoque Comercial
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Inventario Fisico
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Contagem e reconciliacao de estoque</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-xl hover:bg-gray-100" title="Atualizar">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          <button
            onClick={() => setNovoOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA" }}
          >
            <Plus size={15} />
            {isOperador ? "Solicitar inventário" : "Novo inventario"}
          </button>
        </div>
      </div>

      {/* PERÍODO em chips (filtro mais usado — 1 clique; padrão de período do ERP).
          Mudar qualquer filtro volta pra página 1. */}
      <div className="mb-2 flex gap-1.5 flex-wrap items-center">
        <span className="text-xs font-semibold shrink-0 w-16" style={{ color: "#7A5A4A" }}>Período</span>
        {([["todos", "Todos"], ["hoje", "Hoje"], ["ontem", "Ontem"], ["mes", "Este mês"], ["custom", "Personalizado"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => { setPeriodo(v); setPagina(1); }}
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={periodo === v
              ? { background: "#184036", color: "#fff" }
              : { background: "#fff", color: "#6B7280", border: "1px solid #E8DCC8" }}>
            {label}
          </button>
        ))}
      </div>
      {periodo === "custom" && (
        <div className="mb-2 flex gap-2 items-center flex-wrap" style={{ marginLeft: "4.5rem" }}>
          <span className="text-xs text-gray-400">de</span>
          <input type="date" value={customDe} onChange={e => { setCustomDe(e.target.value); setPagina(1); }}
            className="text-sm border rounded-lg px-2 py-1.5 outline-none" style={{ borderColor: "#E8DCC8" }} />
          <span className="text-xs text-gray-400">até</span>
          <input type="date" value={customAte} onChange={e => { setCustomAte(e.target.value); setPagina(1); }}
            className="text-sm border rounded-lg px-2 py-1.5 outline-none" style={{ borderColor: "#E8DCC8" }} />
        </div>
      )}
      {/* LOCAL + SITUAÇÃO em seletores compactos, na linha de baixo (secundários) */}
      <div className="mb-5 flex gap-x-5 gap-y-2 flex-wrap items-center">
        {locaisDisp.length > 0 && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "#7A5A4A" }}>Local</span>
            <select value={local ?? ""} onChange={e => { setLocal(e.target.value ? Number(e.target.value) : null); setPagina(1); }}
              className="text-sm border rounded-lg pl-2.5 pr-7 py-1.5 outline-none bg-white cursor-pointer"
              style={{ borderColor: "#E8DCC8", color: "#184036" }}>
              <option value="">Todos</option>
              {locaisDisp.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: "#7A5A4A" }}>Situação</span>
          <select value={situacao ?? ""} onChange={e => { setSituacao((e.target.value || null) as typeof situacao); setPagina(1); }}
            className="text-sm border rounded-lg pl-2.5 pr-7 py-1.5 outline-none bg-white cursor-pointer"
            style={{ borderColor: "#E8DCC8", color: "#184036" }}>
            <option value="">Todas</option>
            <option value="aberto">Aberto</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">Nenhum inventário encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(inv => {
            const st = STATUS_STYLE[inv.status] ?? STATUS_STYLE.aberto;
            // Tudo em PEÇAS (unidades), não em SKUs (regra do Jonathan)
            const pecasEsperadas   = Number(inv.pecas_esperadas);
            const pecasContadas    = Number(inv.pecas_contadas);
            const pecasDivergentes = Number(inv.pecas_divergentes);
            const progresso = pecasEsperadas > 0
              ? Math.min(100, Math.round((pecasContadas / pecasEsperadas) * 100))
              : 0;
            const emAndamento = inv.status !== "concluido" && inv.status !== "cancelado";
            // Veredito da lista em PEÇAS: divergências pintam de vermelho;
            // concluído sem divergência = "bateu certo".
            const veredito = pecasDivergentes > 0
              ? { texto: `${pecasDivergentes} peça${pecasDivergentes > 1 ? "s" : ""} divergente${pecasDivergentes > 1 ? "s" : ""}`, bg: "#FEE2E2", tx: "#991B1B" }
              : inv.status === "concluido"
                ? { texto: "Bateu certo", bg: "#D1FAE5", tx: "#065F46" }
                : null;
            return (
              <div
                key={inv.id}
                className="rounded-xl px-4 py-4 cursor-pointer hover:shadow-sm transition-shadow"
                style={{ border: "1px solid #E8DCC8", background: "#FAFAF7" }}
                onClick={() => router.push(`/estoque-comercial/inventario/${inv.id}`)}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  {/* Ponto de status à esquerda + identificação do inventário */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.text }} />
                    <span className="font-medium text-sm shrink-0" style={{ color: "#184036" }}>
                      Inventário #{inv.id}
                    </span>
                    <span className="text-xs text-gray-400 truncate">{inv.local_nome}</span>
                    {inv.categoria && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "#F3EADA", color: "#7A5A4A" }}>
                        {inv.categoria}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {veredito && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: veredito.bg, color: veredito.tx }}>
                        {veredito.texto}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: st.bg, color: st.text }}>
                      {st.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                  <span><b style={{ color: "#184036" }}>{pecasContadas}/{pecasEsperadas}</b> peças contadas</span>
                  <span>{fmtDate(inv.data_abertura)}</span>
                  {emAndamento && (
                    <span style={{ color: "#2563EB" }}>{progresso}% contado</span>
                  )}
                </div>
                {emAndamento && pecasEsperadas > 0 && (
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#EDE7DA" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progresso}%`, background: "#184036" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação — 10 por página, mais recentes primeiro */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid #E8DCC8" }}>
          <span className="text-xs text-gray-400">
            {POR_PAGINA} por página · {total} inventário{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}
              className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ border: "1px solid #E8DCC8", color: "#184036" }}>
              ‹ Anterior
            </button>
            <span className="text-sm font-semibold" style={{ color: "#184036" }}>
              página {pagina} de {totalPaginas}
            </span>
            <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}
              className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ border: "1px solid #E8DCC8", color: "#184036" }}>
              Próximo ›
            </button>
          </div>
        </div>
      )}

      {/* Modal novo inventário */}
      {novoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg" style={{ color: "#184036" }}>{isOperador ? "Solicitar inventário" : "Novo Inventario"}</h2>
              <button onClick={() => setNovoOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Local de estoque</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={novoLocal}
                onChange={e => { setNovoLocal(Number(e.target.value)); setNovoCategoria(""); }}
              >
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-gray-500">
                Categoria <span className="text-gray-400 font-normal">(opcional — filtra os itens)</span>
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={novoCategoria}
                onChange={e => setNovoCategoria(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria} ({c.total_produtos} prod.{c.tem_subcategorias ? " + subcategorias" : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Observacao (opcional)</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                value={novoObs}
                onChange={e => setNovoObs(e.target.value)}
              />
            </div>
            {err && <p className="text-xs text-red-500 mb-3">{err}</p>}

            <button
              className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: "#184036", color: "#F3EADA" }}
              onClick={handleCriar}
              disabled={criando}
            >
              {criando ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
              {isOperador ? "Enviar pedido de abertura" : "Abrir Inventario"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
