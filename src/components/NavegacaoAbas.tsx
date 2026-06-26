"use client";

import Link from "next/link";
import type { ElementType } from "react";

export interface Aba {
  key: string;
  label: string;
  href: string;
  icon: ElementType;
}

interface Props {
  abas: Aba[];
  activeKey: string;
  aoMudar?: (key: string) => void;
}

const P = {
  bg: "#f9fafb",
  card: "#ffffff",
  border: "#e5e7eb",
  creme: "#111827",
  sage: "#6b7280",
};

export default function NavegacaoAbas({ abas, activeKey, aoMudar }: Props) {
  return (
    <div
      className="flex gap-1 rounded-xl p-1 w-fit flex-wrap"
      style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
    >
      {abas.map(({ key, label, icon: Icon }) => {
        const isAtiva = activeKey === key;
        const btnCls = `flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors`;
        const btnStyle = {
          backgroundColor: isAtiva ? P.card : "transparent",
          color: isAtiva ? P.creme : P.sage,
          boxShadow: isAtiva ? "0 1px 3px 0 rgb(0 0 0 / 0.08)" : "none",
        };

        if (aoMudar) {
          return (
            <button
              key={key}
              onClick={() => aoMudar(key)}
              className={btnCls}
              style={btnStyle}
            >
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </button>
          );
        }

        return (
          <Link
            key={key}
            href={`/configuracoes/${key}`}
            className={btnCls}
            style={btnStyle}
          >
            <Icon size={14} strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
