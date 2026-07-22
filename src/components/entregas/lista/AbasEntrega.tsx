"use client";

/**
 * AbasEntrega — barra de abas da tela Entregas de Venda.
 *
 * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — mockup aprovado pelo
 * Jonathan): a listagem única (chips de situação misturando retirada e
 * motoboy) virou ABAS:
 *   - "Retirada em loja"      -> forma_entrega='retirada'
 *   - "Entregas motoboy"      -> forma_entrega='motoboy' (inclui as
 *     corridas via Correios — é uma REGIÃO, não uma forma de entrega própria)
 *   - "Pagamento do motoboy"  -> relatório/acerto (PagamentoMotoboyPainel)
 *   - "Fechamentos de frete"  -> BLOCO 5 (21/07) — relatório READ-ONLY dos
 *     fechamentos mensais da verba de frete grátis (FechamentosFretePainel).
 *     SÓ aparece pra quem gerencia (`ROLES_PAGAMENTO_MOTOBOY` — mesmo
 *     conjunto que vê "Pagamento do motoboy", NÃO alargado pra
 *     consultora/estoquista_loja) — as outras 3 abas continuam visíveis pra
 *     todo mundo que chega na tela, comportamento inalterado (ver
 *     docs/regras-negocio/entregas.md §10.6). Defesa em profundidade: o
 *     backend (page.tsx + GET /api/entregas-venda/fechamentos) tem o MESMO
 *     gate — esconder o botão aqui é só UX, não é a barreira de segurança.
 *
 * O QUE: só a barra de navegação — o estado ativo vem da URL (`?aba=`, ver
 * page.tsx/EntregasVendaClient.tsx), preservando o padrão do resto da tela
 * (filtros/paginação também são state-in-URL, compartilhável).
 *
 * IMPACTO SE ALTERADO: mudar os values quebra o filtro de forma_entrega no
 * SSR (page.tsx) e na API (route.ts) — os valores são um contrato, não
 * só texto de UI.
 */

import { Store, Bike, DollarSign, Receipt } from "lucide-react";
import type { AbaEntrega } from "@/app/(dashboard)/entregas-venda/page";
import { ROLES_PAGAMENTO_MOTOBOY } from "@/lib/pagamento-motoboy";
import { C } from "./formatters";

interface AbasEntregaProps {
  abaAtual: AbaEntrega;
  onChange: (aba: AbaEntrega) => void;
  /** Papel do usuário logado — decide só se "Fechamentos de frete" aparece (ver regra acima). */
  userRole: string;
}

const ABAS_BASE: { value: AbaEntrega; label: string; Icon: typeof Store }[] = [
  { value: "retirada", label: "Retirada em loja", Icon: Store },
  { value: "motoboy", label: "Entregas motoboy", Icon: Bike },
  { value: "pagamento", label: "Pagamento do motoboy", Icon: DollarSign },
];

const ABA_FECHAMENTOS: { value: AbaEntrega; label: string; Icon: typeof Store } = {
  value: "fechamentos", label: "Fechamentos de frete", Icon: Receipt,
};

export default function AbasEntrega({ abaAtual, onChange, userRole }: AbasEntregaProps) {
  const ABAS = ROLES_PAGAMENTO_MOTOBOY.includes(userRole)
    ? [...ABAS_BASE, ABA_FECHAMENTOS]
    : ABAS_BASE;

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
