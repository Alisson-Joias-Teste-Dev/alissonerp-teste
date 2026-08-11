"use client";

import { AlertTriangle } from "lucide-react";
import { P } from "./estilos";
import { formatPeso } from "./formatadores";
import { Row } from "./ui";
import { calcularResultadoProcesso } from "./resultadoProcesso";

interface Props {
  pesoEsperado: number;
  pesoRealNum: number;
  /** "Retornado" (Purificação) ou "Produzido" (Ligação) — texto mantido por tela. */
  labelRetorno: string;
  /** "Perda processo" (Purificação) ou "Perda" (Ligação) — texto mantido por tela. */
  labelPerda: string;
}

/**
 * Caixa "Esperado × Retornado/Produzido + Perda/Ganho" mostrada ao concluir
 * Purificação e Ligação — era a mesma lógica e o mesmo JSX copiados nas duas
 * telas, unificados na Etapa 5 do plano de consolidação. Ver
 * calcularResultadoProcesso() pra regra de negócio do cálculo.
 */
export function ResultadoProcessoBox({ pesoEsperado, pesoRealNum, labelRetorno, labelPerda }: Props) {
  const { perda, perdaPct, ehGanho, ganho, ganhoPct, perdaAlta, perdaBaixa } = calcularResultadoProcesso(pesoEsperado, pesoRealNum);

  return (
    <div style={{
      background: perdaAlta ? "#fee2e2" : (perdaBaixa || ehGanho) ? "#dcfce7" : P.bg,
      border: `1px solid ${perdaAlta ? P.vermelho : (perdaBaixa || ehGanho) ? P.verde : P.border}`,
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
    }}>
      <Row label="Esperado" value={formatPeso(pesoEsperado)} />
      <Row label={labelRetorno} value={formatPeso(pesoRealNum)} bold />
      {ehGanho ? (
        <Row
          label="Ganho de teor"
          value={`+${formatPeso(ganho)} (+${ganhoPct.toFixed(2)}%)`}
          color={P.verde}
          bold
        />
      ) : (
        <Row
          label={labelPerda}
          value={`${formatPeso(perda)} (${perdaPct.toFixed(2)}%)`}
          color={perdaAlta ? P.vermelho : perdaBaixa ? P.verde : P.text}
          bold
        />
      )}
      {ehGanho && (
        <div style={{ color: P.verde, marginTop: 6, fontWeight: 600 }}>Ganho de teor — rendimento acima do esperado</div>
      )}
      {!ehGanho && perdaAlta && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: P.vermelho, marginTop: 6, fontWeight: 600 }}>
          <AlertTriangle size={14} /> Perda acima de 2% — verificar processo
        </div>
      )}
      {!ehGanho && perdaBaixa && (
        <div style={{ color: P.verde, marginTop: 6, fontWeight: 600 }}>Excelente rendimento (abaixo de 1%)</div>
      )}
    </div>
  );
}
