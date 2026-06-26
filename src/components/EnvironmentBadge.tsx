"use client";

/**
 * O QUE: Tag visual que indica quando o sistema está usando um banco que
 * NÃO é produção (homolog ou teste).
 *
 * POR QUE: evitar que o usuário opere no banco errado sem perceber. Toda
 * operação destrutiva (baixa, venda, aprovação) feita no homolog não afeta
 * produção — mas se o usuário se confundir, pode perder tempo ou dados.
 *
 * IMPACTO SE REMOVIDO: risco alto de confusão entre ambientes, especialmente
 * em máquinas de consultoras e gerentes que alternam entre homolog e produção.
 */

export default function EnvironmentBadge() {
  const ambiente = process.env.NEXT_PUBLIC_AMBIENTE;

  // Em produção não exibe tag — produção é o padrão seguro
  if (!ambiente || ambiente === "producao") return null;

  const label = ambiente === "homolog" ? "HOMOLOG - BANCO DE TESTE" : "BANCO DE TESTE";

  return (
    <div
      style={{
        position: "fixed",
        top: 4,
        right: 4,
        zIndex: 9999,
        background: "#F59E0B",
        color: "#0F172A",
        fontWeight: 700,
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 6,
        fontFamily: "var(--font-dm-sans)",
        letterSpacing: "0.05em",
        boxShadow: "0 1px 6px rgba(245,158,11,0.4)",
        lineHeight: 1.3,
      }}
    >
      {label}
    </div>
  );
}
