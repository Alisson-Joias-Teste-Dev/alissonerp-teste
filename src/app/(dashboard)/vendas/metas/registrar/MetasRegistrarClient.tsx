"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, CheckCircle } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

interface Vendedor { id: number; nome: string; }

export default function MetasRegistrarClient({ vendedores }: { vendedores: Vendedor[] }) {
  const router = useRouter();
  const now = new Date();
  const [mes,       setMes]       = useState(now.getMonth() + 1);
  const [ano,       setAno]       = useState(now.getFullYear());
  const [vendedorId, setVendedorId] = useState<number | "">("");
  const [metaValor, setMetaValor] = useState("");
  const [metaQtd,   setMetaQtd]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendedorId || !metaValor) { setError("Preencha todos os campos obrigatórios"); return; }
    const valor = parseFloat(metaValor.replace(",", "."));
    if (!valor || valor <= 0) { setError("Meta deve ser um valor positivo"); return; }

    setSaving(true); setError("");
    try {
      const res = await fetch("/api/vendas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedor_id: Number(vendedorId),
          mes, ano,
          meta_valor: valor,
          meta_quantidade: metaQtd ? parseInt(metaQtd) : null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => { router.push("/vendas/metas"); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas/metas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Registrar Meta
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Definir meta mensal de vendas</p>
        </div>
      </div>

      {saved ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: C.cremeBorder }}>
          <CheckCircle size={40} style={{ color: "#059669" }} className="mx-auto mb-3" />
          <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Meta salva com sucesso!</p>
          <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Redirecionando...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mês / Ano */}
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
            <label className="text-xs font-semibold uppercase tracking-wide mb-3 block" style={{ color: "#6B7280" }}>Período</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] mb-1 block" style={{ color: "#9CA3AF" }}>Mês</label>
                <select value={mes} onChange={e => setMes(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                  {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="text-[11px] mb-1 block" style={{ color: "#9CA3AF" }}>Ano</label>
                <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))}
                  min={2020} max={2099}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
              </div>
            </div>
          </div>

          {/* Vendedora */}
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
            <label className="text-xs font-semibold uppercase tracking-wide mb-3 block" style={{ color: "#6B7280" }}>Consultora *</label>
            <select value={vendedorId} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: C.cremeBorder, color: vendedorId ? C.esmeralda : "#9CA3AF" }}>
              <option value="">Selecionar consultora...</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>

          {/* Meta valor */}
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
            <label className="text-xs font-semibold uppercase tracking-wide mb-3 block" style={{ color: "#6B7280" }}>Meta de Faturamento *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#9CA3AF" }}>R$</span>
              <input type="text" value={metaValor} onChange={e => setMetaValor(e.target.value)}
                placeholder="0,00" inputMode="decimal"
                className="w-full border rounded-lg pl-8 pr-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
            </div>
          </div>

          {/* Meta qtd (opcional) */}
          <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
            <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: "#6B7280" }}>Meta de Quantidade <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(opcional)</span></label>
            <p className="text-[11px] mb-3" style={{ color: "#9CA3AF" }}>Número de vendas alvo no mês</p>
            <input type="number" value={metaQtd} onChange={e => setMetaQtd(e.target.value)}
              placeholder="Ex: 15" min={0}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Salvando..." : "Salvar Meta"}
          </button>
        </form>
      )}
    </div>
  );
}
