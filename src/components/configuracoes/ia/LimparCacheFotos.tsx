"use client";

import { useState } from "react";
import {
  RefreshCw,
} from "lucide-react";
import { Button, Spinner, MessageBox } from "@/components/ui";
import { P } from "./types";

export default function LimparCacheFotos() {
  const [limpando, setLimpando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function limparCache() {
    setLimpando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/ia/limpar-cache", {
        method: "POST",
      });
      if (res.ok) {
        setMsg({ ok: true, texto: "Cache de fotos limpo com sucesso!" });
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setMsg({
          ok: false,
          texto: body.error ?? "Erro ao limpar cache.",
        });
      }
    } catch {
      setMsg({ ok: false, texto: "Erro de conexão ao limpar cache." });
    }
    setLimpando(false);
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div className="space-y-3">
      <p
        className="text-[10px] uppercase tracking-widest font-medium"
        style={{ color: P.muted }}
      >
        Limpeza de Cache de Fotos
      </p>
      <div
        className="p-4 rounded-xl space-y-3"
        style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
            style={{
              backgroundColor: P.dourado + "22",
              color: P.dourado,
            }}
          >
            🗑️
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: P.creme }}>
              Cache de fotos da balança
            </p>
            <p className="text-xs mt-0.5 mb-3" style={{ color: P.muted }}>
              Remove as imagens temporárias armazenadas durante as validações de
              peso. As fotos serão baixadas novamente quando necessário.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="primary" size="sm" loading={limpando} onClick={limparCache}>
                <RefreshCw size={13} /> Limpar Cache
              </Button>
              {msg && (
                <MessageBox tipo={msg.ok ? "ok" : "erro"} mensagem={msg.texto} onFechar={() => setMsg(null)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
