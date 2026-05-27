"use client";

import type { LucideIcon } from "lucide-react";
import { P } from "./theme";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: number; label?: string };
  color?: "esmeralda" | "dourado" | "creme" | "prata" | "diamante";
  subtitle?: string;
  /** Ao informar onClick, o card fica clicável com cursor-pointer */
  onClick?: () => void;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  color = "esmeralda",
  subtitle,
  onClick,
}: StatCardProps) {
  const palette = {
    esmeralda: { bg: P.esmeraldaLight, border: P.esmeraldaMid, fg: P.creme, accent: P.dourado },
    dourado: { bg: "#FEF3E6", border: "#FEDDB4", fg: "#8A5A1D", accent: P.douradoDark },
    creme: { bg: P.cremeSoft, border: P.cremeMuted, fg: P.esmeralda, accent: P.dourado },
    prata: { bg: "#F5F5F5", border: "#DDDDDD", fg: "#555555", accent: "#8C8C8C" },
    diamante: { bg: "#E6F2F8", border: "#C6E3EE", fg: "#1F5570", accent: "#7FB7D6" },
  }[color];

  const positive = trend && trend.value >= 0;

  return (
    <div
      className="flex flex-col rounded-xl p-4 shadow-sm"
      style={{ backgroundColor: palette.bg, border: `1px solid ${palette.border}`, cursor: onClick ? "pointer" : undefined, transition: "box-shadow 0.15s" }}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center gap-2">
        {Icon && <Icon size={15} strokeWidth={1.75} style={{ color: palette.accent }} />}
        <span
          className="text-[10px] font-medium uppercase tracking-widest"
          style={{ color: palette.fg, opacity: 0.7 }}
        >
          {label}
        </span>
      </div>
      <p
        className="text-2xl font-semibold tabular-nums"
        style={{ color: palette.fg, fontFamily: "var(--font-dm-sans)" }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs" style={{ color: palette.fg, opacity: 0.6 }}>
          {subtitle}
        </p>
      )}
      {trend && (
        <div
          className="mt-2 flex items-center gap-1 text-xs font-medium"
          style={{ color: positive ? P.sucesso : P.erro }}
        >
          <span>{positive ? "▲" : "▼"}</span>
          <span className="tabular-nums">
            {Math.abs(trend.value).toFixed(1).replace(".", ",")}%
          </span>
          {trend.label && <span style={{ opacity: 0.8 }}>{trend.label}</span>}
        </div>
      )}
    </div>
  );
}
