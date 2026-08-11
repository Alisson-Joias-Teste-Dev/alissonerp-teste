/**
 * formatters.tsx — Helpers de formatação/exibição da lista de Entregas de Venda.
 *
 * O QUE: extraído de EntregasVendaClient.tsx na reforma da tela (21/07 —
 * 3 abas, filtros em select, paginação de 10, componentização) para que
 * TabelaEntregas.tsx (e qualquer outro consumidor futuro) reuse a MESMA
 * formatação sem duplicar — código puro de apresentação, nenhuma regra de
 * negócio de dado (não decide o que mostrar, só COMO mostrar).
 *
 * IMPACTO SE ALTERADO: mudar aqui muda a exibição em todas as abas que usam
 * TabelaEntregas (Retirada em loja e Entregas motoboy).
 */

import { EntregaItem } from "@/app/(dashboard)/entregas-venda/page";

// ── Paleta ──────────────────────────────────────────────────────────────────────
// REGRA DE NEGÓCIO: mesma paleta usada em todo o módulo de entregas (não
// centralizada em um único lugar no projeto — padrão existente, cada
// componente redefine a própria cópia, ver MotoboyDrawer/PagarMotoboyModal).
export const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  vermelho:    "#DC2626",
  vermelhoLt:  "#FEE2E2",
  ambar:       "#D97706",
  ambarLt:     "#FEF3C7",
  verde:       "#059669",
  verdeLt:     "#D1FAE5",
  cinza:       "#6B7280",
  cinzaBorder: "#E5E7EB",
};

/** Formata valor monetário em BRL */
export function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata data ISO para dd/mm/aaaa */
export function fmtData(s: string | null) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

/** Formata data ISO para dd/mm/aaaa HH:MM */
export function fmtDtHr(s: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return s;
  }
}

/** Label amigável para forma de entrega */
export function labelForma(f: string): string {
  return f === "retirada" ? "Retirada" : "Motoboy";
}

/** Badge de status com cores */
export function statusBadge(situacao: string) {
  switch (situacao) {
    case "pendente":
      return { text: "Pendente", color: C.ambar, bg: C.ambarLt };
    case "confirmada":
      return { text: "Confirmada", color: C.verde, bg: C.verdeLt };
    case "cancelada":
      return { text: "Cancelada", color: C.cinza, bg: C.cremeBg };
    default:
      return { text: situacao, color: C.cinza, bg: C.cremeBg };
  }
}

/**
 * Renderiza a coluna de data conforme o status da entrega.
 * REGRA DE NEGÓCIO: entrega confirmada mostra data de entrega/retirada,
 * em rota mostra data de saída, pendente mostra data de criação.
 */
export function renderDataColuna(item: EntregaItem) {
  if (item.situacao === "confirmada" && item.data_entrega_realizada) {
    return (
      <>
        <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
          {fmtData(item.data_entrega_realizada)}
        </div>
        <div style={{ fontSize: 10, color: C.cinza, marginTop: 2 }}>
          Entregue {fmtDtHr(item.data_entrega_realizada)}
        </div>
      </>
    );
  }
  if (item.situacao === "confirmada" && item.data_retirada) {
    return (
      <>
        <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
          {fmtData(item.data_retirada)}
        </div>
        <div style={{ fontSize: 10, color: C.cinza, marginTop: 2 }}>
          Retirada {fmtDtHr(item.data_retirada)}
        </div>
      </>
    );
  }
  if (item.situacao === "em_rota" && item.data_saida) {
    return (
      <>
        <div style={{ fontSize: 12, color: "#9A3412", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
          {fmtData(item.data_saida)}
        </div>
        <div style={{ fontSize: 10, color: C.cinza, marginTop: 2 }}>
          Saiu {fmtDtHr(item.data_saida)}
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ fontSize: 12, color: "#1f2937" }}>
        {fmtData(item.created_at)}
      </div>
      <div style={{ fontSize: 10, color: C.cinza, marginTop: 2 }}>
        {fmtDtHr(item.created_at)}
      </div>
    </>
  );
}
