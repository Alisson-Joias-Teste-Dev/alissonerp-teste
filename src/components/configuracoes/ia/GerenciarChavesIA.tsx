"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import { Button, Spinner, MessageBox } from "@/components/ui";
import { PROVEDORES, P } from "./types";

interface Props {
  onKeysUpdated: () => void;
}

export default function GerenciarChavesIA({ onKeysUpdated }: Props) {
  const [keyProvedor, setKeyProvedor] = useState<"claude" | "openai" | "gemini">("claude");
  const [keyValor, setKeyValor] = useState("");
  const [mostrarKey, setMostrarKey] = useState(false);
  const [salvandoKey, setSalvandoKey] = useState(false);
  const [msgKey, setMsgKey] = useState<{ ok: boolean; texto: string } | null>(null);

  async function salvarKey() {
    if (!keyValor.trim()) return;
    setSalvandoKey(true);
    setMsgKey(null);
    const res = await fetch("/api/configuracoes/ia/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provedor: keyProvedor, api_key: keyValor }),
    });
    setSalvandoKey(false);
    if (res.ok) {
      setKeyValor("");
      setMsgKey({ ok: true, texto: "Key salva com sucesso!" });
      onKeysUpdated();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsgKey({ ok: false, texto: body.error ?? "Erro ao salvar." });
    }
    setTimeout(() => setMsgKey(null), 4000);
  }

  return (
    <div className="space-y-3">
      <p
        className="text-[10px] uppercase tracking-widest font-medium"
        style={{ color: P.muted }}
      >
        Configurar API Key
      </p>
      <div
        className="p-4 rounded-xl space-y-3"
        style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
      >
        <div className="flex gap-3">
          <div className="flex-1">
            <label
              className="text-[10px] uppercase tracking-wider block mb-1"
              style={{ color: P.muted }}
            >
              Provedor
            </label>
            <select
              value={keyProvedor}
              onChange={(e) => {
                setKeyProvedor(e.target.value as typeof keyProvedor);
                setKeyValor("");
              }}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: P.bg,
                border: `1px solid ${P.border}`,
                color: P.creme,
              }}
            >
              {PROVEDORES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.empresa})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label
            className="text-[10px] uppercase tracking-wider block mb-1"
            style={{ color: P.muted }}
          >
            API Key{" "}
            <span
              style={{ color: P.muted, textTransform: "none", fontWeight: 400 }}
            >
              (começa com {PROVEDORES.find((p) => p.id === keyProvedor)?.prefixo}
              ...)
            </span>
          </label>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center rounded-lg overflow-hidden"
              style={{ border: `1px solid ${P.border}` }}
            >
              <input
                type={mostrarKey ? "text" : "password"}
                value={keyValor}
                onChange={(e) => setKeyValor(e.target.value)}
                placeholder="Cole a API key aqui..."
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none font-mono"
                style={{ color: P.creme }}
              />
              <button
                type="button"
                onClick={() => setMostrarKey((v) => !v)}
                className="px-2 py-2 transition-colors"
                style={{ color: P.muted }}
              >
                {mostrarKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button variant="primary" size="sm" loading={salvandoKey} disabled={!keyValor.trim()} onClick={salvarKey}>
              <Save size={13} /> Salvar
            </Button>
          </div>
        </div>
        {msgKey && (
          <MessageBox tipo={msgKey.ok ? "ok" : "erro"} mensagem={msgKey.texto} onFechar={() => setMsgKey(null)} />
        )}
        <p className="text-[10px]" style={{ color: P.muted }}>
          ⚠️ A key é armazenada no banco de dados. Use variáveis de ambiente
          para maior segurança em produção.
        </p>
      </div>
    </div>
  );
}
