"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { P } from "./theme";
import DateRangePicker from "./DateRangePicker";

export interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
}

const TABS = [
  { href: "/dashboard-comercial", label: "Geral" },
  { href: "/dashboard-comercial/analise-resultado", label: "Performance" },
  { href: "/dashboard-comercial/analise-frete", label: "Frete" },
  { href: "/dashboard-comercial/analise-comissoes", label: "Comissões" },
  { href: "/dashboard-comercial/ranking", label: "Ranking" },
];

export default function DashboardHeader({
  title,
  subtitle,
  from,
  to,
  onRangeChange,
}: DashboardHeaderProps) {
  const pathname = usePathname();

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: P.esmeralda, fontFamily: "var(--font-playfair)" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm" style={{ color: P.esmeraldaMid }}>
              {subtitle}
            </p>
          )}
        </div>
        <DateRangePicker from={from} to={to} onChange={onRangeChange} />
      </div>

      <nav
        className="flex flex-wrap gap-1 rounded-lg p-1"
        style={{ backgroundColor: P.cremeSoft, border: `1px solid ${P.cremeMuted}` }}
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? P.esmeralda : "transparent",
                color: active ? P.creme : P.esmeralda,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
