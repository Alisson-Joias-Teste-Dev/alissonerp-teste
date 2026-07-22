"use client";

/**
 * TabelaEntregas — tabela de entregas com COLUNAS PARAMETRIZADAS.
 *
 * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — mockup aprovado pelo
 * Jonathan): as abas "Retirada em loja" e "Entregas motoboy" mostram a MESMA
 * tabela — só mudam as colunas visíveis (Motoboy/Frete não se aplicam à
 * retirada). Por isso é UM componente com `mostrarMotoboy`/`mostrarFrete`
 * booleanos, não dois componentes quase-idênticos (pedido explícito do
 * Jonathan: "quero tudo componentizado evitando duplicações").
 *
 * O QUE: extraído de EntregasVendaClient.tsx — mesma estrutura de linhas/
 * colunas que já existia, sem mudança de comportamento (clique na linha
 * ainda abre o drawer via `onRowClick`).
 *
 * IMPACTO SE ALTERADO: mudar a ordem/formato das colunas aqui afeta as duas
 * abas ao mesmo tempo — é o ponto único de renderização da tabela.
 */

import { AlertTriangle, ExternalLink, Store, Bike } from "lucide-react";
import type { EntregaItem } from "@/app/(dashboard)/entregas-venda/page";
import { C, fmtBRL, labelForma, statusBadge, renderDataColuna } from "./formatters";

interface TabelaEntregasProps {
  items: EntregaItem[];
  onRowClick: (id: number) => void;
  /** Oculta a coluna Motoboy — aba "Retirada em loja" não tem motoboy. */
  mostrarMotoboy: boolean;
  /** Oculta a coluna Frete — aba "Retirada em loja" não cobra frete. */
  mostrarFrete: boolean;
}

export default function TabelaEntregas({ items, onRowClick, mostrarMotoboy, mostrarFrete }: TabelaEntregasProps) {
  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: `1px solid ${C.cremeBorder}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
            <ThC label="Código" />
            <ThC label="Venda" />
            <ThC label="Cliente" />
            <ThC label="Status" />
            <ThC label="Forma" />
            {mostrarMotoboy && <ThC label="Motoboy" />}
            {mostrarFrete && <ThC label="Frete" align="right" />}
            <ThC label="Data" align="right" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const badge = statusBadge(item.situacao);
            return (
              <tr
                key={item.id}
                onClick={() => onRowClick(item.id)}
                style={{ cursor: "pointer", borderBottom: `1px solid ${C.cremeBorder}`, transition: "background 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.cremeBg; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
              >
                {/* Código */}
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: C.esmeralda, fontSize: 12, cursor: "pointer" }}>
                    {item.codigo_entrega}
                  </span>
                </td>

                {/* Venda */}
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  {item.is_avulso ? (
                    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#EDE9FE", color: "#6D28D9" }}>
                      Avulso
                    </span>
                  ) : item.numero_venda ? (
                    <a
                      href={`/vendas/${item.venda_id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: C.esmeralda, textDecoration: "none", fontWeight: 600, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      {item.numero_venda}
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span style={{ color: C.cinza, fontSize: 12 }}>#{item.venda_id}</span>
                  )}
                </td>

                {/* Cliente */}
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                  <div>
                    <span style={{ color: "#1f2937", fontSize: 13 }}>
                      {item.cliente_nome ?? "—"}
                    </span>
                    {item.is_avulso && item.descricao_avulso && (
                      <div style={{ fontSize: 11, color: C.cinza, marginTop: 2 }}>
                        {item.descricao_avulso}
                      </div>
                    )}
                  </div>
                </td>

                {/* Status */}
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.color }}>
                    {badge.text}
                  </span>
                </td>

                {/* Forma */}
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#1f2937" }}>
                    {item.forma_entrega === "retirada" ? <Store size={12} color={C.cinza} /> : <Bike size={12} color={C.cinza} />}
                    {labelForma(item.forma_entrega)}
                  </span>
                </td>

                {/* Motoboy — só quando mostrarMotoboy */}
                {mostrarMotoboy && (
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <span style={{ color: item.motoboy_nome ? "#1f2937" : C.cinza, fontSize: 12 }}>
                      {item.motoboy_nome ?? "—"}
                    </span>
                  </td>
                )}

                {/* Frete — só quando mostrarFrete */}
                {mostrarFrete && (
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1f2937" }}>
                      {fmtBRL(item.frete_cobrado)}
                    </div>
                    {item.frete_motoboy > 0 && (
                      <div style={{ fontSize: 10, color: C.cinza }}>
                        Motoboy: {fmtBRL(item.frete_motoboy)}
                      </div>
                    )}
                    {item.aprovacao_frete_necessaria && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2 }}>
                        <AlertTriangle size={9} color={C.ambar} />
                        <span style={{ fontSize: 9, color: C.ambar, fontWeight: 600 }}>Pendente</span>
                      </div>
                    )}
                  </td>
                )}

                {/* Data */}
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap", textAlign: "right" }}>
                  {renderDataColuna(item)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** ThC — Célula de cabeçalho da tabela de entregas. */
function ThC({ label, align }: { label: string; align?: "left" | "right" }) {
  return (
    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: C.cinza, textTransform: "uppercase", letterSpacing: 0.5, textAlign: align ?? "left", whiteSpace: "nowrap" }}>
      {label}
    </th>
  );
}
