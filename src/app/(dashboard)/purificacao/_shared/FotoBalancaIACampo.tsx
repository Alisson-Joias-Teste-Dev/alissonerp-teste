"use client";

import { useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { P, labelStyle } from "./estilos";
import type { ValidacaoIA } from "./useFotoBalancaIA";

interface Props {
  /** Texto do <label> — cada tela usa uma frase levemente diferente, mantida como estava. */
  label: string;
  /** Texto do botão depois de escolher a foto — idem, varia por tela. */
  textoSelecionada: string;
  fotoBase64: string | null;
  fotoFile: File | null;
  iaResult: ValidacaoIA | null;
  iaLoading: boolean;
  peso: number;
  onFoto: (file: File) => void;
  onRevalidar: (file: File, peso: number) => void;
}

/**
 * Bloco "foto da balança + resultado da IA" usado nos 4 formulários de
 * Purificação/Ligação (Nova e Concluir) — ~90 linhas idênticas em cada um,
 * unificadas aqui na Etapa 5 do plano de consolidação. Rótulo e texto de
 * "selecionado" ficam por fora (props) porque cada tela usa uma frase
 * levemente diferente — extração pura, sem mudar texto de nenhuma tela.
 */
export function FotoBalancaIACampo({
  label, textoSelecionada, fotoBase64, fotoFile, iaResult, iaLoading, peso, onFoto, onRevalidar,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFoto(file);
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="file" accept="image/*" capture="environment" ref={fileRef} onChange={handleChange} style={{ display: "none" }} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: P.bg,
          border: `1px dashed ${fotoBase64 ? P.verde : P.vermelho}`,
          borderRadius: 8, padding: "10px 16px", cursor: "pointer",
          color: fotoBase64 ? P.verde : P.muted, fontSize: 13, width: "100%",
        }}
      >
        <Camera size={16} />
        {fotoBase64 ? textoSelecionada : "Selecionar foto da balança (obrigatório)"}
      </button>
      {fotoBase64 && (
        <img src={fotoBase64} alt="preview" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, objectFit: "cover" }} />
      )}
      {iaLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: P.muted }}>
          <Loader2 size={14} className="animate-spin" /> Validando peso com IA...
        </div>
      )}
      {!iaLoading && iaResult && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 13,
          background: iaResult.match ? "#dcfce7" : "#fef9c3",
          border: `1px solid ${iaResult.match ? P.verde : "#ca8a04"}`,
          color: iaResult.match ? P.verde : "#854d0e",
        }}>
          {iaResult.peso_balanca !== null
            ? `IA leu: ${iaResult.peso_balanca.toFixed(2)}g · Informado: ${iaResult.peso_digitado.toFixed(2)}g · ${iaResult.match ? "✅ OK" : "⚠️ Divergência"}`
            : `⚠️ IA não conseguiu ler o peso — ${iaResult.mensagem}`
          }
        </div>
      )}
      {!iaLoading && fotoFile && peso > 0 && !iaResult && (
        <button
          type="button"
          onClick={() => onRevalidar(fotoFile, peso)}
          style={{ marginTop: 8, fontSize: 12, color: P.azul, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Revalidar com IA
        </button>
      )}
    </div>
  );
}
