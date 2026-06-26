"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, X, Check, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isFullAccess } from "@/lib/roles";
import { P } from "./theme";

export default function PremiacaoCard() {
  const [texto, setTexto] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [podeEditar, setPodeEditar] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Carrega o texto e verifica permissão
  useEffect(() => {
    fetch("/api/dashboard-comercial/premiacao")
      .then((r) => r.json())
      .then((d) => setTexto(d.texto ?? ""));

    createClient()
      .auth.getUser()
      .then(({ data }) => {
        const role = data.user?.user_metadata?.role as string | undefined;
        setPodeEditar(isFullAccess(role));
      });
  }, []);

  function iniciarEdicao() {
    setDraft(texto ?? "");
    setEditando(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function cancelar() {
    setEditando(false);
    setDraft("");
  }

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/dashboard-comercial/premiacao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: draft }),
      });
      if (!r.ok) throw new Error("Erro ao salvar");
      setTexto(draft);
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  if (texto === null) return null;

  return (
    <div
      className="mt-6 overflow-hidden rounded-xl"
      style={{ backgroundColor: P.creme, border: `1px solid ${P.cremeMuted}` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${P.cremeMuted}` }}
      >
        <div className="flex items-center gap-2">
          <Trophy size={16} style={{ color: P.dourado }} />
          <h3
            className="text-base font-semibold"
            style={{ color: P.esmeralda, fontFamily: "var(--font-playfair)" }}
          >
            Premiação
          </h3>
        </div>

        {podeEditar && !editando && (
          <button
            onClick={iniciarEdicao}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: P.cremeSoft, color: P.esmeraldaMid }}
          >
            <Pencil size={12} />
            Editar
          </button>
        )}

        {editando && (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelar}
              disabled={salvando}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ backgroundColor: P.cremeSoft, color: P.esmeraldaMid }}
            >
              <X size={12} />
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: P.esmeralda, color: P.creme }}
            >
              <Check size={12} />
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="p-4">
        {editando ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            className="w-full resize-y rounded-lg p-3 text-sm font-mono outline-none focus:ring-2"
            style={{
              backgroundColor: P.cremeSoft,
              color: P.esmeralda,
              border: `1px solid ${P.cremeMuted}`,
              lineHeight: "1.6",
            }}
          />
        ) : (
          <pre
            className="whitespace-pre-wrap text-sm leading-relaxed"
            style={{ color: P.esmeralda, fontFamily: "inherit" }}
          >
            {texto}
          </pre>
        )}
      </div>
    </div>
  );
}
