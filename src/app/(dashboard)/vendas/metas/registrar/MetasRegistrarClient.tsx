"use client";

import { useState, useMemo } from "react";
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
const DIA_SEMANA_HEADER = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORARIOS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00"];

interface Vendedor { id: number; nome: string; }

function getSundaysInMonth(year: number, month: number): number[] {
  const sundays: number[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === 0) sundays.push(d);
  }
  return sundays;
}

function parseCurrency(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
}

export default function MetasRegistrarClient({ vendedores }: { vendedores: Vendedor[] }) {
  const router = useRouter();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  const [mes,             setMes]             = useState(currentMonth);
  const [ano,             setAno]             = useState(currentYear);
  const [vendedorId,      setVendedorId]      = useState<number | "">("");
  const [horarioInicio,   setHorarioInicio]   = useState("09:00");
  const [horasPorDia,     setHorasPorDia]     = useState(8);
  const [diasNaoTrab,     setDiasNaoTrab]     = useState<Set<number>>(() => new Set(getSundaysInMonth(currentYear, currentMonth)));
  const [metaPrata,       setMetaPrata]       = useState("");
  const [metaOuro,        setMetaOuro]        = useState("");
  const [metaDiamante,    setMetaDiamante]    = useState("");
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);
  const [error,           setError]           = useState("");

  // Calendário do mês
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const firstDayOfWeek = new Date(ano, mes - 1, 1).getDay(); // 0=Dom
  const diasTrabalhados = daysInMonth - diasNaoTrab.size;

  // Atualizar domingos ao trocar mês
  function handleMesChange(newMes: number) {
    setMes(newMes);
    setDiasNaoTrab(new Set(getSundaysInMonth(ano, newMes)));
  }
  function handleAnoChange(newAno: number) {
    setAno(newAno);
    setDiasNaoTrab(new Set(getSundaysInMonth(newAno, mes)));
  }

  function toggleDia(d: number) {
    setDiasNaoTrab(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  // Meses disponíveis (não permite passado)
  const mesesDisponiveis = useMemo(() => {
    return MESES.map((nome, i) => ({
      value: i + 1,
      label: nome,
      disabled: ano === currentYear && (i + 1) < currentMonth,
    }));
  }, [ano, currentYear, currentMonth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!vendedorId) { setError("Selecione uma consultora"); return; }

    const prata    = parseCurrency(metaPrata);
    const ouro     = parseCurrency(metaOuro);
    const diamante = parseCurrency(metaDiamante);

    if (prata <= 0) { setError("Meta Prata deve ser um valor positivo"); return; }
    if (ouro <= 0)  { setError("Meta Ouro deve ser um valor positivo"); return; }
    if (diamante <= 0) { setError("Meta Diamante deve ser um valor positivo"); return; }
    if (ouro <= prata)    { setError("Meta Ouro deve ser maior que Prata"); return; }
    if (diamante <= ouro) { setError("Meta Diamante deve ser maior que Ouro"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/vendas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedor_id: Number(vendedorId),
          mes, ano,
          meta_prata: prata,
          meta_ouro: ouro,
          meta_diamante: diamante,
          horario_inicio: horarioInicio,
          horas_por_dia: horasPorDia,
          dias_nao_trabalhados: Array.from(diasNaoTrab).sort((a, b) => a - b),
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => router.push("/vendas/metas"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  const fmt = (v: string) => {
    if (!v) return "";
    return `R$ ${parseCurrency(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas/metas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Cadastro
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Todos os campos marcados com * são obrigatórios</p>
        </div>
      </div>

      {saved ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: C.cremeBorder }}>
          <CheckCircle size={40} style={{ color: "#059669" }} className="mx-auto mb-3" />
          <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>Meta salva com sucesso!</p>
          <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>Redirecionando...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border p-6 space-y-6" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>

          {/* Mês de Referência */}
          <div>
            <label className="text-sm font-semibold mb-2 block" style={{ color: "#374151" }}>Mês de Referência *</label>
            <div className="flex gap-3">
              <select value={mes} onChange={e => handleMesChange(Number(e.target.value))}
                className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                {mesesDisponiveis.map(m => (
                  <option key={m.value} value={m.value} disabled={m.disabled}>{m.label}</option>
                ))}
              </select>
              <input type="number" value={ano} onChange={e => handleAnoChange(Number(e.target.value))}
                min={currentYear} max={2099}
                className="w-24 border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
            </div>
          </div>

          {/* Consultora + Horário */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 block" style={{ color: "#374151" }}>Consultora *</label>
              <select value={vendedorId} onChange={e => setVendedorId(e.target.value ? Number(e.target.value) : "")}
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: vendedorId ? C.esmeralda : "#9CA3AF" }}>
                <option value="">Selecione a consultora</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block" style={{ color: "#374151" }}>Horário de Início *</label>
              <select value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)}
                className="w-auto border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Horas por dia */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-2 block" style={{ color: "#374151" }}>Horas Trabalhadas por Dia *</label>
              <input type="number" value={horasPorDia} onChange={e => setHorasPorDia(Number(e.target.value))}
                min={1} max={12}
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
            </div>
            <div>
              <label className="text-sm font-semibold mb-2 block" style={{ color: "#374151" }}>Dias Não Trabalhados</label>
              <p className="text-xs mb-2" style={{ color: "#9CA3AF" }}>Domingos são selecionados automaticamente.</p>
            </div>
          </div>

          {/* Calendário de dias não trabalhados */}
          <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder }}>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DIA_SEMANA_HEADER.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold uppercase" style={{ color: "#9CA3AF" }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {/* Espaços vazios antes do dia 1 */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {/* Dias do mês */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const selected = diasNaoTrab.has(day);
                const isSunday = new Date(ano, mes - 1, day).getDay() === 0;
                return (
                  <button key={day} type="button" onClick={() => toggleDia(day)}
                    className="h-8 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: selected ? C.esmeralda : "transparent",
                      color: selected ? C.creme : isSunday ? "#EF4444" : "#374151",
                      border: selected ? "none" : `1px solid ${C.cremeBorder}`,
                    }}>
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2 text-center" style={{ color: "#6B7280" }}>
              <b>{diasTrabalhados}</b> dias trabalhados de {daysInMonth}
            </p>
          </div>

          {/* Divisor */}
          <hr style={{ borderColor: C.cremeBorder }} />

          {/* Metas de Vendas */}
          <div>
            <label className="text-sm font-bold mb-3 block" style={{ color: "#374151" }}>Metas de Vendas</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Prata */}
              <div className="rounded-lg border-l-4 border p-3" style={{ borderColor: C.cremeBorder, borderLeftColor: "#9CA3AF" }}>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6B7280" }}>Meta Prata *</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#9CA3AF" }}>R$</span>
                  <input type="text" value={metaPrata} onChange={e => setMetaPrata(e.target.value)}
                    placeholder="R$ 0,00" inputMode="decimal"
                    className="w-full border rounded-lg pl-7 pr-2 py-2 text-sm outline-none"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
                </div>
              </div>
              {/* Ouro */}
              <div className="rounded-lg border-l-4 border p-3" style={{ borderColor: C.cremeBorder, borderLeftColor: "#D97706" }}>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6B7280" }}>Meta Ouro *</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#9CA3AF" }}>R$</span>
                  <input type="text" value={metaOuro} onChange={e => setMetaOuro(e.target.value)}
                    placeholder="R$ 0,00" inputMode="decimal"
                    className="w-full border rounded-lg pl-7 pr-2 py-2 text-sm outline-none"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
                </div>
              </div>
              {/* Diamante */}
              <div className="rounded-lg border-l-4 border p-3" style={{ borderColor: C.cremeBorder, borderLeftColor: "#3B82F6" }}>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6B7280" }}>Meta Diamante *</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#9CA3AF" }}>R$</span>
                  <input type="text" value={metaDiamante} onChange={e => setMetaDiamante(e.target.value)}
                    placeholder="R$ 0,00" inputMode="decimal"
                    className="w-full border rounded-lg pl-7 pr-2 py-2 text-sm outline-none"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Salvando..." : "Registrar Meta"}
          </button>
        </form>
      )}
    </div>
  );
}
