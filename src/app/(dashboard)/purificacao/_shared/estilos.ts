/**
 * Paleta e estilos de formulário compartilhados entre as abas Purificação e
 * Ligação (PurificacaoClient.tsx / LigacaoTab.tsx). Extraído na Etapa 5 do
 * plano de consolidação — eram cópias byte-a-byte em cada arquivo.
 * IMPACTO SE ALTERADO: muda a cor/estilo das duas telas ao mesmo tempo.
 */
export const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  text:     "#111827",
  muted:    "#6b7280",
  amber:    "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
  azul:     "#2563eb",
  rose:     "#e11d48",
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${P.border}`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  color: P.text,
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: P.muted,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export const btnPrimary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: P.amber,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

export const btnSecondary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "#fff",
  color: P.text,
  border: `1px solid ${P.border}`,
  borderRadius: 8,
  padding: "10px 20px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};
