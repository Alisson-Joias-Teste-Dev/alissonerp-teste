"use client";

import { Loader2 } from "lucide-react";
import { P } from "./theme";

export function LoadingBlock({ label = "Carregando..." }: { label?: string }) {
  return (
    <div
      className="flex h-48 w-full items-center justify-center gap-3 rounded-xl"
      style={{ backgroundColor: P.cremeSoft, border: `1px solid ${P.cremeMuted}` }}
    >
      <Loader2 size={18} className="animate-spin" style={{ color: P.esmeralda }} />
      <span className="text-sm" style={{ color: P.esmeraldaMid }}>
        {label}
      </span>
    </div>
  );
}

export function ErrorBlock({ error }: { error: string }) {
  return (
    <div
      className="rounded-xl p-4 text-sm"
      style={{ backgroundColor: "#FCE5E5", color: P.erro, border: `1px solid ${P.erro}` }}
    >
      <strong>Erro:</strong> {error}
    </div>
  );
}
