"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import { Button, MessageBox } from "@/components/ui";
import { useErrorStore } from "@/stores/errorStore";

const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  dourado:  "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

interface FormularioTipoServicoProps {
  onSalvar?: () => void;
  onCancelar?: () => void;
}

export default function FormularioTipoServico({ onSalvar, onCancelar }: FormularioTipoServicoProps) {
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState("");

  async function handleCriar() {
    const nome = novoNome.trim();
    if (!nome) { setErroCriar("Nome é obrigatório"); return; }
    setCriando(true); setErroCriar("");
    const res = await fetch("/api/tipos-servico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }).catch((e) => {
      useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao criar tipo de serviço", { level: "critical" });
      return null;
    });
    setCriando(false);
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}));
      setErroCriar(d?.error ?? "Erro ao criar");
      return;
    }
    setNovoNome("");
    onSalvar?.();
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ border: `1px solid ${P.border}`, backgroundColor: P.bg }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: P.sage }}>
        Novo Tipo de Serviço
      </p>
      <input
        type="text"
        value={novoNome}
        onChange={e => { setNovoNome(e.target.value); setErroCriar(""); }}
        placeholder="Ex: Polimento Manual"
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#184036]"
        style={{ borderColor: P.border, color: P.creme }}
        autoFocus
        onKeyDown={e => { if (e.key === "Enter") handleCriar(); if (e.key === "Escape") onCancelar?.(); }}
      />
      {erroCriar && <MessageBox tipo="erro" mensagem={erroCriar} onFechar={() => setErroCriar("")} />}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" loading={criando} onClick={handleCriar}>
          <Save size={12} /> Salvar
        </Button>
        <Button variant="outline" size="sm" onClick={() => { onCancelar?.(); setErroCriar(""); }}>
          <X size={12} /> Cancelar
        </Button>
      </div>
    </div>
  );
}
