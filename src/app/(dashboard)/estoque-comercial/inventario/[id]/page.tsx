"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, CheckCircle, XCircle, Search, X } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

interface InventarioHeader {
  id: number;
  local_nome: string;
  status: string;
  obs: string | null;
  categoria: string | null;
  data_abertura: string;
  data_conclusao: string | null;
  criado_por_email: string | null;
  concluido_por_email: string | null;
}

interface ItemInventario {
  id: number;
  produto_id: number;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  diferenca: number;
  nome_produto: string;
  sku: string | null;
  conferido: boolean;
  contado_por_email: string | null;
  contado_em: string | null;
}

interface LeiturasEPC {
  epc: string;
  evento: string;
  lido_em: string;
  operador: string;
}

interface ExcedenteForaInventario {
  id_api_produto: number;
  sku: string;
  nome_produto: string;
  quantidade: number;
}

type StatusItem = "ok" | "faltando" | "excesso" | "pendente";

function getStatus(item: ItemInventario): StatusItem {
  if (item.quantidade_contada === null) return "pendente";
  if (item.diferenca > 0) return "excesso";
  if (item.diferenca < 0) return "faltando";
  return "ok";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_LABEL: Record<StatusItem, string> = {
  ok: "OK", faltando: "Faltando", excesso: "Excedente", pendente: "Pendente",
};

const STATUS_COLOR: Record<StatusItem, { bg: string; text: string; border: string }> = {
  ok:       { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  faltando: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
  excesso:  { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
  pendente: { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" },
};

function Badge({ status }: { status: StatusItem }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-3 text-center flex-1"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{label}</p>
    </div>
  );
}

function ItemRow({
  item, status, conferido, salvando, onToggle, isAberto,
}: {
  item: ItemInventario;
  status: StatusItem;
  conferido: boolean;
  salvando: boolean;
  onToggle: () => void;
  isAberto: boolean;
}) {
  const lido = item.quantidade_contada ?? 0;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: conferido ? "#F0FDF4" : "#FAFAF7", border: `1px solid ${conferido ? "#BBF7D0" : "#F3F0E8"}` }}>
      {isAberto && (
        <button
          onClick={onToggle}
          disabled={salvando}
          className="shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
          style={{
            borderColor: conferido ? "#059669" : "#D1D5DB",
            background: conferido ? "#059669" : "transparent",
          }}
          title={conferido ? "Desmarcar conferido" : "Marcar como conferido"}
        >
          {salvando
            ? <span className="w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            : conferido && <svg viewBox="0 0 12 12" width="10" height="10" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ fontFamily: "monospace", color: "#184036" }}>
          {item.sku ?? "—"}
        </p>
        <p className="text-xs text-gray-400 truncate">{item.nome_produto}</p>
      </div>
      <span className="text-sm font-bold shrink-0" style={{ color: "#374151" }}>
        {lido}/{item.quantidade_sistema}
      </span>
      <Badge status={status} />
    </div>
  );
}

export default function InventarioDetalhePage() {
  const router = useRouter();
  const params = useParams();
  const invId = Number(params.id);

  const [inventario, setInventario] = useState<InventarioHeader | null>(null);
  const [itens, setItens] = useState<ItemInventario[]>([]);
  const [leituras, setLeituras] = useState<LeiturasEPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [concluindo, setConcluindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState(false);
  const [leiturasAbertas, setLeiturasAbertas] = useState(false);
  const [excedentesForaInventario, setExcedentesForaInventario] = useState<ExcedenteForaInventario[]>([]);
  const [conferidoIds, setConferidoIds] = useState<Set<number>>(new Set());
  const [salvandoConferido, setSalvandoConferido] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}`);
      if (r.ok) {
        const d = await r.json() as {
          inventario: InventarioHeader;
          itens: ItemInventario[];
          leituras?: LeiturasEPC[];
        };
        setInventario(d.inventario);
        setItens(d.itens);
        setLeituras(d.leituras ?? []);
        setExcedentesForaInventario((d as any).excedentesForaInventario ?? []);
        setConferidoIds(new Set(d.itens.filter(i => i.conferido).map(i => i.produto_id)));
      }
    } finally { setLoading(false); }
  }, [invId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function concluirInventario() {
    if (!confirm("Concluir inventario? Isso gerara ajustes para todas as divergencias.")) return;
    setConcluindo(true); setMsg("");
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/concluir`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const data = await r.json() as { ajustes_gerados: number };
      setMsg(`Concluido! ${data.ajustes_gerados} ajuste(s) gerado(s).`);
      await fetchData();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally { setConcluindo(false); }
  }

  async function cancelarInventario() {
    if (!confirm("Cancelar inventario? Nenhum ajuste sera gerado.")) return;
    setCancelando(true);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/cancelar`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      await fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    } finally { setCancelando(false); }
  }

  async function toggleConferido(item: ItemInventario) {
    if (!isAberto) return;
    const novoConferido = !conferidoIds.has(item.produto_id);
    setConferidoIds(prev => {
      const next = new Set(prev);
      if (novoConferido) next.add(item.produto_id);
      else next.delete(item.produto_id);
      return next;
    });
    setSalvandoConferido(prev => new Set(prev).add(item.produto_id));
    try {
      await fetch(`/api/estoque-comercial/inventario/${invId}/contar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contagens: [{
            produto_id: item.produto_id,
            quantidade_contada: item.quantidade_contada ?? item.quantidade_sistema,
            conferido: novoConferido,
          }],
        }),
      });
    } finally {
      setSalvandoConferido(prev => { const s = new Set(prev); s.delete(item.produto_id); return s; });
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
    </div>
  );

  if (!inventario) return (
    <div className="p-6 text-center text-gray-500">Inventario nao encontrado.</div>
  );

  const isAberto = inventario.status === "aberto" || inventario.status === "em_contagem";
  const totalEsperado = itens.length;
  const lidos         = leituras.length;
  const okCount       = itens.filter(i => getStatus(i) === "ok").length;
  const faltandoCount = itens.filter(i => getStatus(i) === "faltando" || getStatus(i) === "pendente").length;
  const excessoCount  = itens.filter(i => getStatus(i) === "excesso").length;

  const filtro = busca.trim().toLowerCase();
  const itensFiltrados = filtro
    ? itens.filter(i => i.sku?.toLowerCase().includes(filtro) || i.nome_produto.toLowerCase().includes(filtro))
    : itens;

  const excessos   = itensFiltrados.filter(i => getStatus(i) === "excesso").sort((a, b) => b.diferenca - a.diferenca);
  const faltandoL  = itensFiltrados.filter(i => getStatus(i) === "faltando").sort((a, b) => a.diferenca - b.diferenca);
  const pendentesL = itensFiltrados.filter(i => getStatus(i) === "pendente");
  const okL        = itensFiltrados.filter(i => getStatus(i) === "ok");

  const statusMap: Record<string, { label: string; bg: string; txt: string }> = {
    aberto:      { label: "Aberto",      bg: "#DBEAFE", txt: "#1E40AF" },
    em_contagem: { label: "Em contagem", bg: "#FEF3C7", txt: "#92400E" },
    concluido:   { label: "Concluido",   bg: "#D1FAE5", txt: "#065F46" },
    cancelado:   { label: "Cancelado",   bg: "#FEE2E2", txt: "#991B1B" },
  };
  const s = statusMap[inventario.status] ?? { label: inventario.status, bg: "#F3F4F6", txt: "#6B7280" };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <button className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial/inventario")}>
        <ArrowLeft size={15} /> Inventarios
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Inventario #{inventario.id}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {inventario.local_nome} &middot; {fmtDate(inventario.data_abertura)}
          </p>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {inventario.categoria && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F3EADA", color: "#7A5A4A" }}>
                {inventario.categoria}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: s.bg, color: s.txt }}>{s.label}</span>
          </div>
        </div>
        {isAberto && (
          <div className="flex gap-2 shrink-0">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm hover:bg-red-50"
              style={{ color: "#DC2626" }}
              onClick={cancelarInventario} disabled={cancelando}>
              {cancelando ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={14} />}
              Cancelar
            </button>
            <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#059669", color: "#fff" }}
              onClick={concluirInventario}
              disabled={concluindo || pendentesL.length > 0}
              title={pendentesL.length > 0 ? `${pendentesL.length} itens pendentes` : ""}>
              {concluindo ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={14} />}
              Concluir
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-2 mb-4 text-sm" style={{ background: "#D1FAE5", color: "#065F46" }}>
          {msg}
        </div>
      )}

      <div className="mb-5 space-y-2">
        <div className="flex gap-2">
          <SummaryCard label="Lidos"    value={lidos}         color="#3B82F6" />
          <SummaryCard label="Esperado" value={totalEsperado} color="#3B82F6" />
        </div>
        <div className="flex gap-2">
          <SummaryCard label="OK"       value={okCount}       color="#059669" />
          <SummaryCard label="Faltando" value={faltandoCount} color="#DC2626" />
          <SummaryCard label="Excesso"  value={excessoCount}  color="#2563EB" />
        </div>
      </div>

      <div className="mb-4 flex justify-end">
        {buscaAtiva ? (
          <div className="flex items-center gap-2 flex-1 border rounded-xl px-3 py-2"
            style={{ borderColor: "#E8DCC8" }}>
            <Search size={15} className="text-gray-400" />
            <input autoFocus className="flex-1 outline-none text-sm bg-transparent"
              placeholder="Buscar SKU ou nome..."
              value={busca} onChange={e => setBusca(e.target.value)} />
            <button onClick={() => { setBusca(""); setBuscaAtiva(false); }}>
              <X size={15} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>
        ) : (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm hover:bg-gray-50"
            style={{ border: "1px solid #E8DCC8", color: "#6B7280" }}
            onClick={() => setBuscaAtiva(true)}>
            <Search size={14} /> Buscar SKU
          </button>
        )}
      </div>

      {/* Chips lidos pelo app que nao estao no escopo do inventario */}
      {excedentesForaInventario.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#2563EB" }}>
            Chips fora do inventario ({excedentesForaInventario.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {excedentesForaInventario.map(e => (
              <div key={e.id_api_produto}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ fontFamily: "monospace", color: "#184036" }}>
                    {e.sku}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{e.nome_produto}</p>
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: "#374151" }}>
                  {e.quantidade}/0
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "#DBEAFE", color: "#1E40AF", border: "1px solid #93C5FD" }}>
                  Excedente
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

            {excessos.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#2563EB" }}>Excedentes ({excessos.length})</p>
          <div className="flex flex-col gap-1.5">
            {excessos.map(item => <ItemRow key={item.id} item={item} status="excesso"
              conferido={conferidoIds.has(item.produto_id)}
              salvando={salvandoConferido.has(item.produto_id)}
              onToggle={() => toggleConferido(item)}
              isAberto={isAberto} />)}
          </div>
        </div>
      )}

      {(faltandoL.length > 0 || pendentesL.length > 0) && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#DC2626" }}>
            Faltando ({faltandoL.length + pendentesL.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {faltandoL.map(item => <ItemRow key={item.id} item={item} status="faltando"
              conferido={conferidoIds.has(item.produto_id)}
              salvando={salvandoConferido.has(item.produto_id)}
              onToggle={() => toggleConferido(item)}
              isAberto={isAberto} />)}
            {pendentesL.map(item => <ItemRow key={item.id} item={item} status="pendente"
              conferido={conferidoIds.has(item.produto_id)}
              salvando={salvandoConferido.has(item.produto_id)}
              onToggle={() => toggleConferido(item)}
              isAberto={isAberto} />)}
          </div>
        </div>
      )}

      {okL.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#059669" }}>Conferidos OK ({okL.length})</p>
          <div className="flex flex-col gap-1.5">
            {okL.map(item => <ItemRow key={item.id} item={item} status="ok"
              conferido={conferidoIds.has(item.produto_id)}
              salvando={salvandoConferido.has(item.produto_id)}
              onToggle={() => toggleConferido(item)}
              isAberto={isAberto} />)}
          </div>
        </div>
      )}

      {leituras.length > 0 && (
        <div className="mt-6 border-t pt-4" style={{ borderColor: "#F3F0E8" }}>
          <button className="flex items-center justify-between w-full text-sm font-semibold py-1"
            style={{ color: "#184036" }}
            onClick={() => setLeiturasAbertas(v => !v)}>
            <span>Etiquetas lidas via app ({leituras.length})</span>
            <span className="text-gray-400 text-xs">{leiturasAbertas ? "▲ ocultar" : "▼ mostrar"}</span>
          </button>
          {leiturasAbertas && (
            <div className="rounded-2xl overflow-hidden mt-2" style={{ border: "1px solid #E8DCC8" }}>
              <table className="w-full text-xs">
                <thead style={{ background: "#F9F6F0" }}>
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold uppercase text-gray-400">EPC</th>
                    <th className="text-left px-4 py-2 font-semibold uppercase text-gray-400">Lido em</th>
                  </tr>
                </thead>
                <tbody>
                  {leituras.slice(0, 200).map((l, i) => (
                    <tr key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F6" }}>
                      <td className="px-4 py-2 font-mono" style={{ color: "#184036" }}>{l.epc}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDate(l.lido_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
