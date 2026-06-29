"use client";

import Link from "next/link";
import type { ComponentType } from "react";

type LucideIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

export interface Aba {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

interface Props {
  abas: Aba[];
  activeKey: string;
  aoMudar?: (key: string) => void;
}

export default function NavegacaoAbas({ abas, activeKey, aoMudar }: Props) {
  return (
    <div className="flex gap-1 rounded-xl p-1 w-fit flex-wrap bg-gray-50 border border-gray-200">
      {abas.map(({ key, label, icon: Icon }) => {
        const isAtiva = activeKey === key;

        const cls = `flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
          isAtiva
            ? "bg-white text-gray-900 shadow-xs"
            : "bg-transparent text-gray-500 hover:text-gray-700"
        }`;

        if (aoMudar) {
          return (
            <button key={key} onClick={() => aoMudar(key)} className={cls}>
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </button>
          );
        }

        return (
          <Link key={key} href={`/configuracoes/${key}`} className={cls}>
            <Icon size={14} strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
