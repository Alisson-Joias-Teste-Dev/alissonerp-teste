"use client";

/**
 * AbasEntrega — barra de abas da tela Entregas de Venda.
 *
 * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — mockup aprovado pelo
 * Jonathan): a listagem única (chips de situação misturando retirada e
 * motoboy) virou 3 ABAS:
 *   - "Retirada em loja"      -> forma_entrega='retirada'
 *   - "Entregas motoboy"      -> forma_entrega='motoboy' (inclui as
 *     corridas via Correios — é uma REGIÃO, não uma forma de entrega própria)
 *   - "Pagamento do motoboy"  -> relatório/acerto (PagamentoMotoboyPainel)
 *
 * O QUE: só a barra de navegação — o estado ativo vem da URL (`?aba=`, ver
 * page.tsx/EntregasVendaClient.tsx), preservando o padrão do resto da tela
 * (filtros/paginação também são state-in-URL, compartilhável).
 *
 * IMPACTO SE ALTERADO: mudar os values quebra o filtro de forma_entrega no
 * SSR (page.tsx) e na API (route.ts) — os 3 valores são um contrato, não
 * só texto de UI.
 */

import { Store, Bike, DollarSign } from "lucide-react";
import type { AbaEntrega } from "@/app/(dashboard)/entregas-venda/page";
import { C } from "./formatters";

interface AbasEntregaProps {
  abaAtual: AbaEntrega;
  onChange: (aba: AbaEntrega) => void;
}

const ABAS: { value: AbaEntrega; label: string; Icon: typeof Store }[] = [
  { value: "retirada", label: "Retirada em loja", Icon: Store },
  { value: "motoboy", label: "Entregas motoboy", Icon: Bike },
  { value: "pagamento", label: "Pagamento do motoboy", Icon: DollarSign },
];

export default function AbasEntrega({ abaAtual, onChange }: AbasEntregaProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: `1px solid ${C.cremeBorder}`,
        marginBottom: 20,
      }}
    >
      {ABAS.map(({ value, label, Icon }) => {
        const ativa = abaAtual === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              border: "none",
              borderBottom: `2px solid ${ativa ? C.esmeralda : "transparent"}`,
              background: "none",
              color: ativa ? C.esmeralda : C.cinza,
              fontSize: 13,
              fontWeight: ativa ? 700 : 600,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
