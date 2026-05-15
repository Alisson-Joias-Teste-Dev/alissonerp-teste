"use client";

import { Calendar } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { P } from "./theme";
import { formatDateISO } from "@/lib/dashboard-comercial/utils";

type Preset = {
  label: string;
  getFrom: () => Date;
  getTo: () => Date;
};

const PRESETS: Preset[] = [
  {
    label: "Hoje",
    getFrom: () => new Date(),
    getTo: () => new Date(),
  },
  {
    label: "Esta semana",
    getFrom: () => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      return d;
    },
    getTo: () => new Date(),
  },
  {
    label: "Este mês",
    getFrom: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    },
    getTo: () => new Date(),
  },
  {
    label: "Mês inteiro",
    getFrom: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    },
    getTo: () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth() + 1, 0);
    },
  },
  {
    label: "Últimos 30 dias",
    getFrom: () => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    },
    getTo: () => new Date(),
  },
  {
    label: "Este ano",
    getFrom: () => {
      const d = new Date();
      return new Date(d.getFullYear(), 0, 1);
    },
    getTo: () => new Date(),
  },
];

export interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const label = `${formatBR(from)} → ${formatBR(to)}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: P.esmeraldaLight,
          color: P.creme,
          border: `1px solid ${P.esmeraldaMid}`,
        }}
      >
        <Calendar size={16} strokeWidth={1.75} style={{ color: P.dourado }} />
        <span>{label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-80 rounded-xl p-4 shadow-2xl"
          style={{ backgroundColor: P.esmeraldaDeep, border: `1px solid ${P.esmeraldaMid}` }}
        >
          <div className="mb-3 grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange(formatDateISO(p.getFrom()), formatDateISO(p.getTo()));
                  setOpen(false);
                }}
                className="rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:opacity-90"
                style={{ backgroundColor: P.esmeraldaLight, color: P.creme }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 border-t pt-3" style={{ borderColor: P.esmeraldaMid }}>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
                De
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => onChange(e.target.value, to)}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: P.esmeraldaLight,
                  color: P.creme,
                  border: `1px solid ${P.esmeraldaMid}`,
                }}
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
                Até
              </span>
              <input
                type="date"
                value={to}
                onChange={(e) => onChange(from, e.target.value)}
                className="mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                style={{
                  backgroundColor: P.esmeraldaLight,
                  color: P.creme,
                  border: `1px solid ${P.esmeraldaMid}`,
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
