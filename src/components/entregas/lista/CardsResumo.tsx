"use client";

/**
 * CardsResumo — cards de stats (Pendentes/Em Andamento/Confirmadas/Total +
 * Saldo Frete Grátis opcional) da tela Entregas de Venda.
 *
 * O QUE: extraído de EntregasVendaClient.tsx na reforma da tela (21/07 — 3
 * abas). As contagens já vêm ESCOPADAS à aba atual (page.tsx filtra por
 * forma_entrega antes de contar) — este componente só exibe.
 *
 * REGRA DE NEGÓCIO: o card de Saldo Frete Grátis só faz sentido na aba
 * "Entregas motoboy" (retirada não tem frete) — controlado por
 * `mostrarSaldoFrete`, decidido pelo caller (EntregasVendaClient), não aqui.
 *
 * IMPACTO SE ALTERADO: mudar a interpretação de "Em Andamento" aqui sem
 * mudar a query de contagem (page.tsx) gera card e dado divergentes.
 */

import { Package, Clock, Bike, CheckCircle, DollarSign } from "lucide-react";
import type { ContagensEntregas } from "@/app/(dashboard)/entregas-venda/page";
import { C, fmtBRL } from "./formatters";

interface CardsResumoProps {
  contagens: ContagensEntregas;
  /** Saldo de frete grátis da gerente logada — null enquanto carrega/erro. */
  saldoFrete: number | null;
  /** Só a aba "Entregas motoboy" mostra o card de saldo (retirada não tem frete). */
  mostrarSaldoFrete: boolean;
}

export default function CardsResumo({ contagens, saldoFrete, mostrarSaldoFrete }: CardsResumoProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {/* Saldo de Frete Grátis — só na aba de motoboy */}
      {mostrarSaldoFrete && saldoFrete !== null && (
        <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <DollarSign size={12} /> Saldo Frete Grátis
          </div>
          <div style={{ fontWeight: 700, fontSize: 24, color: saldoFrete >= 0 ? C.verde : C.vermelho }}>
            {fmtBRL(saldoFrete)}
          </div>
        </div>
      )}

      {/* Pendentes */}
      <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
          <Clock size={12} /> Pendentes
        </div>
        <div style={{ fontWeight: 700, fontSize: 24, color: C.ambar }}>
          {contagens.pendente}
        </div>
      </div>

      {/* Em Andamento */}
      <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
          <Bike size={12} /> Em Andamento
        </div>
        <div style={{ fontWeight: 700, fontSize: 24, color: C.esmeralda }}>
          {contagens.em_andamento}
        </div>
      </div>

      {/* Confirmadas */}
      <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
          <CheckCircle size={12} /> Confirmadas
        </div>
        <div style={{ fontWeight: 700, fontSize: 24, color: C.verde }}>
          {contagens.confirmada}
        </div>
      </div>

      {/* Total */}
      <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
          <Package size={12} /> Total
        </div>
        <div style={{ fontWeight: 700, fontSize: 24, color: C.cinza }}>
          {contagens.total}
        </div>
      </div>
    </div>
  );
}
