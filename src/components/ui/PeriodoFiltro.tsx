"use client";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cinza: "#6B7280",
};

export type Periodo = "hoje" | "ontem" | "7dias" | "30dias" | "mes" | "personalizado";

export const PERIODOS_ORDEM: Periodo[] = ["hoje", "ontem", "7dias", "30dias", "mes", "personalizado"];

export const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7dias": "7 Dias",
  "30dias": "30 Dias",
  mes: "Mês",
  personalizado: "Personalizado",
};

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calcPeriodo(
  periodo: Periodo,
  opts: { dataInicio?: string; dataFim?: string; mes?: string } = {}
): { ini: string; fim: string } {
  const hoje = new Date();
  const hojeStr = isoDate(hoje);
  if (periodo === "hoje") return { ini: hojeStr, fim: hojeStr };
  if (periodo === "ontem") {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const s = isoDate(d);
    return { ini: s, fim: s };
  }
  if (periodo === "7dias") {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return { ini: isoDate(d), fim: hojeStr };
  }
  if (periodo === "30dias") {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return { ini: isoDate(d), fim: hojeStr };
  }
  if (periodo === "mes") {
    const mes = opts.mes || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const [yStr, mStr] = mes.split("-");
    const y = Number(yStr); const m = Number(mStr);
    const ini = `${yStr}-${mStr}-01`;
    const fim = isoDate(new Date(y, m, 0));
    return { ini, fim };
  }
  return { ini: opts.dataInicio || hojeStr, fim: opts.dataFim || hojeStr };
}

export interface PeriodoFiltroProps {
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (s: string) => void;
  onDataFimChange: (s: string) => void;
  mes: string;
  onMesChange: (s: string) => void;
}

export default function PeriodoFiltro({
  periodo, onPeriodoChange,
  dataInicio, dataFim, onDataInicioChange, onDataFimChange,
  mes, onMesChange,
}: PeriodoFiltroProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        {PERIODOS_ORDEM.map(p => (
          <button key={p} onClick={() => onPeriodoChange(p)}
            className="text-xs px-3 py-1.5 rounded-full transition-colors border"
            style={{
              backgroundColor: periodo === p ? C.esmeralda : "white",
              borderColor: periodo === p ? C.esmeralda : C.cremeBorder,
              color: periodo === p ? C.creme : C.cinza,
            }}
          >
            {PERIODO_LABEL[p]}
          </button>
        ))}
      </div>

      {periodo === "mes" && (
        <input type="month" value={mes} onChange={e => onMesChange(e.target.value)}
          className="rounded-lg px-2 py-1 text-xs outline-none bg-white"
          style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }} />
      )}

      {periodo === "personalizado" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: C.cinza }}>De</label>
            <input type="date" value={dataInicio} onChange={e => onDataInicioChange(e.target.value)}
              className="rounded-lg px-2 py-1 text-xs outline-none bg-white"
              style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: C.cinza }}>até</label>
            <input type="date" value={dataFim} onChange={e => onDataFimChange(e.target.value)}
              className="rounded-lg px-2 py-1 text-xs outline-none bg-white"
              style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }} />
          </div>
        </div>
      )}
    </div>
  );
}
