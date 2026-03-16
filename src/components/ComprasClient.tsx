"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface CompraRow {
  id: number;
  situacao: string;
  total: number;
  obs: string | null;
  bloqueado: boolean;
  created_at: string;
  fornecedor_nome: string | null;
  total_itens: number;
}

interface ItemCompra {
  id: number;
  insumo_id: number;
  deposito_id: number;
  qtd: number;
  valor_unitario: number | null;
  valor_total: number | null;
  insumo_nome?: string;
  deposito_nome?: string;
}

interface Insumo  { id: number; nome: string; }
interface Deposito { id: number; nome: string; }
interface Contato  { id_contato: number; nome: string; }

function SituacaoBadge({ situacao, bloqueado }: { situacao: string; bloqueado: boolean }) {
  if (bloqueado) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
      <Lock size={9} /> Bloqueada
    </span>
  );
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pendente:  { bg: "#FEF3C7", color: "#92400E", label: "Pendente" },
    concluido: { bg: "#ECFDF5", color: "#059669", label: "Concluída" },
  };
  const s = map[situacao] ?? { bg: "#F3F4F6", color: "#6B7280", label: situacao };
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── Modal Nova Compra ──────────────────────────────────────────────────────
function NovaCompraModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [obs, setObs] = useState("");
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setObs(""); setError(""); setFornecedorId("");
    fetch("/api/compras/fornecedores")
      .then((r) => r.json())
      .then((data) => setContatos((data as Contato[]) ?? []));
  }, [isOpen]);

  async function handleSubmit() {
    setError("");
    setLoading(true);
    const body: Record<string, unknown> = {};
    if (fornecedorId) body.fornecedor_id = Number(fornecedorId);
    if (obs) body.obs = obs;
    const res = await fetch("/api/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro ao criar compra"); return; }
    onSuccess();
  }

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Nova Compra</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"><X size={17} style={{ color: "#9CA3AF" }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Fornecedor (opcional)</label>
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none" style={{ borderColor: C.cremeBorder }}>
              <option value="">— Sem fornecedor —</option>
              {contatos.map((c) => <option key={c.id_contato} value={c.id_contato}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Observação</label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Detalhes da compra..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none" style={{ borderColor: C.cremeBorder }} />
          </div>
          {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}><AlertCircle size={14} />{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {loading ? <><Loader2 size={14} className="animate-spin" />Criando...</> : "Criar Compra"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detalhe da Compra ──────────────────────────────────────────────────────
function CompraDetalhe({ compra, onBack, onRefresh }: { compra: CompraRow; onBack: () => void; onRefresh: () => void }) {
  const [itens, setItens] = useState<ItemCompra[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loadingItens, setLoadingItens] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Novo item form
  const [novoInsumo, setNovoInsumo] = useState("");
  const [novoDeposito, setNovoDeposito] = useState("1");
  const [novoQtd, setNovoQtd] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  const loadItens = useCallback(async () => {
    setLoadingItens(true);
    const data = await fetch(`/api/compras/${compra.id}/itens`).then((r) => r.json());
    setItens((data as ItemCompra[]) ?? []);
    setLoadingItens(false);
  }, [compra.id]);

  useEffect(() => {
    loadItens();
    fetch("/api/pcp/insumos")
      .then((r) => r.json())
      .then((data: Insumo[]) => { setInsumos(data ?? []); if (data?.[0]) setNovoInsumo(String(data[0].id)); });
    fetch("/api/depositos")
      .then((r) => r.json())
      .then((data: Deposito[]) => setDepositos(data ?? []));
  }, []);

  async function handleAddItem() {
    setError("");
    const qtdNum = parseFloat(novoQtd);
    if (!novoInsumo || isNaN(qtdNum) || qtdNum <= 0) { setError("Informe insumo e quantidade."); return; }
    setAddingItem(true);
    const res = await fetch(`/api/compras/${compra.id}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        insumo_id: Number(novoInsumo),
        deposito_id: Number(novoDeposito) || 1,
        qtd: qtdNum,
        valor_unitario: novoValor ? parseFloat(novoValor) : null,
      }),
    });
    const data = await res.json();
    setAddingItem(false);
    if (!res.ok) { setError(data.error ?? "Erro ao adicionar item"); return; }
    setNovoQtd(""); setNovoValor("");
    loadItens();
    onRefresh();
  }

  async function handleRemoveItem(itemId: number) {
    await fetch(`/api/compras/${compra.id}/itens/${itemId}`, { method: "DELETE" });
    loadItens();
    onRefresh();
  }

  async function handleConcluir() {
    setError(""); setSuccess("");
    setActionLoading(true);
    const res = await fetch(`/api/compras/${compra.id}/concluir`, { method: "PATCH" });
    const data = await res.json();
    setActionLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro ao concluir compra"); return; }
    setSuccess("Compra concluída! Estoque atualizado.");
    onRefresh();
    setTimeout(onBack, 1500);
  }

  const totalItens = itens.reduce((sum, i) => sum + Number(i.valor_total ?? 0), 0);
  const bloqueada = compra.bloqueado || compra.situacao === "concluido";

  return (
    <div className="px-6 py-8">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-4 transition-opacity hover:opacity-70" style={{ color: "#6B7280" }}>
        <ArrowLeft size={15} /> Voltar à lista
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Compra #{compra.id}
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {compra.fornecedor_nome ?? "Sem fornecedor"} · {fmt(compra.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SituacaoBadge situacao={compra.situacao} bloqueado={compra.bloqueado} />
          {!bloqueada && itens.length > 0 && (
            <button onClick={handleConcluir} disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}>
              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Concluir Compra
            </button>
          )}
        </div>
      </div>

      {/* Stat card */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Itens", value: String(itens.length), color: C.esmeralda },
          { label: "Total Calculado", value: `R$ ${totalItens.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, color: "#059669" },
          { label: "Obs", value: compra.obs ?? "—", color: "#6B7280" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4 border" style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
            <p className="text-sm font-semibold" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}><AlertCircle size={14} />{error}</div>}
      {success && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] mb-4" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}><CheckCircle2 size={14} />{success}</div>}

      {/* Itens table */}
      <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: C.cremeBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
              {["Insumo", "Depósito", "Qtd", "Valor Unit.", "Valor Total", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingItens && (
              <tr><td colSpan={6} className="text-center py-8"><Loader2 size={18} className="animate-spin mx-auto" style={{ color: "#9CA3AF" }} /></td></tr>
            )}
            {!loadingItens && itens.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: "#9CA3AF" }}>Nenhum item adicionado</td></tr>
            )}
            {itens.map((item, i) => {
              const ins = insumos.find((x) => x.id === item.insumo_id);
              const dep = depositos.find((x) => x.id === item.deposito_id);
              return (
                <tr key={item.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
                  <td className="px-4 py-3 font-medium" style={{ color: C.esmeralda }}>{ins?.nome ?? `#${item.insumo_id}`}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: "#6B7280" }}>{dep?.nome ?? `#${item.deposito_id}`}</td>
                  <td className="px-4 py-3 font-mono text-sm">{Number(item.qtd).toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: "#6B7280" }}>
                    {item.valor_unitario != null ? `R$ ${Number(item.valor_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold" style={{ color: "#059669" }}>
                    {item.valor_total != null ? `R$ ${Number(item.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!bloqueada && (
                      <button onClick={() => handleRemoveItem(item.id)} className="text-[11px] px-2 py-1 rounded hover:bg-red-50 transition-colors" style={{ color: "#DC2626" }}>
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Adicionar item */}
      {!bloqueada && (
        <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>Adicionar Item</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>Insumo</label>
              <select value={novoInsumo} onChange={(e) => setNovoInsumo(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border text-sm focus:outline-none bg-white" style={{ borderColor: C.cremeBorder }}>
                {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>Depósito</label>
              <select value={novoDeposito} onChange={(e) => setNovoDeposito(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border text-sm focus:outline-none bg-white" style={{ borderColor: C.cremeBorder }}>
                {depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>Qtd (g)</label>
              <input type="number" step="0.001" min="0.001" value={novoQtd} onChange={(e) => setNovoQtd(e.target.value)}
                placeholder="0.000" className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
            </div>
            <div>
              <label className="block text-[11px] mb-1" style={{ color: "#6B7280" }}>Valor Unit. (R$)</label>
              <input type="number" step="0.01" min="0" value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
                placeholder="0.00" className="w-full px-2.5 py-2 rounded-lg border text-sm font-mono focus:outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={handleAddItem} disabled={addingItem}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#18403612", color: C.esmeralda }}>
              {addingItem ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Adicionar Item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Client ────────────────────────────────────────────────────────────
export default function ComprasClient({ compras }: { compras: CompraRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<CompraRow | null>(null);
  const [modalNova, setModalNova] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  if (selected) {
    return (
      <CompraDetalhe
        compra={selected}
        onBack={() => { setSelected(null); refresh(); }}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Compras
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {compras.length} compra{compras.length !== 1 ? "s" : ""} — alissonerp.compras
          </p>
        </div>
        <button
          onClick={() => setModalNova(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Plus size={15} /> Nova Compra
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
              {["ID", "Fornecedor", "Status", "Itens", "Total (R$)", "Data", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compras.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma compra encontrada</td></tr>
            )}
            {compras.map((c, i) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-amber-50"
                style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}
                onClick={() => setSelected(c)}
              >
                <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>#{c.id}</td>
                <td className="px-4 py-3 font-medium" style={{ color: C.esmeralda }}>{c.fornecedor_nome ?? "—"}</td>
                <td className="px-4 py-3"><SituacaoBadge situacao={c.situacao} bloqueado={c.bloqueado} /></td>
                <td className="px-4 py-3 font-mono text-center" style={{ color: "#374151" }}>{c.total_itens}</td>
                <td className="px-4 py-3 font-mono font-semibold" style={{ color: c.total > 0 ? "#059669" : "#9CA3AF" }}>
                  {c.total > 0 ? `R$ ${Number(c.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{fmt(c.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {c.bloqueado && <Lock size={13} style={{ color: "#9CA3AF", display: "inline" }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NovaCompraModal
        isOpen={modalNova}
        onClose={() => setModalNova(false)}
        onSuccess={() => { setModalNova(false); refresh(); }}
      />
    </div>
  );
}
