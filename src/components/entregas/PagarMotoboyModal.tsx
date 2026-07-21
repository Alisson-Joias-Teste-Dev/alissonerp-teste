"use client";

/**
 * PagarMotoboyModal — modal de pagamento em lote de entregas de um motoboy.
 *
 * REGRA DE NEGÓCIO: aberto pelo botão "Pagar" do drawer de Motoboys
 * (MotoboyDrawer.tsx → EntregasVendaClient.tsx). Continua existindo como
 * ponto de entrada — nenhum caller foi alterado.
 *
 * O QUE (reforma da tela Entregas, 21/07): este arquivo virou uma CASCA FINA
 * — só a moldura de modal (overlay + header + X). Toda a lógica (carregar
 * motoboys/entregas, seleção, submissão) foi extraída para
 * PagamentoMotoboyPainel.tsx, que também é usado DIRETO (sem moldura) na
 * aba "Pagamento do motoboy" da tela de Entregas — mesma lógica, dois
 * pontos de entrada, sem duplicar (pedido explícito do Jonathan).
 *
 * IMPACTO SE ALTERADO: mudanças de comportamento (validação, API, seleção)
 * pertencem a PagamentoMotoboyPainel.tsx — mexer aqui só afeta a moldura.
 */

import { X, DollarSign } from "lucide-react";
import PagamentoMotoboyPainel from "./PagamentoMotoboyPainel";

const C = {
  esmeralda: "#184036", esmeraldaLt: "#18403612",
  creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7",
  vermelho: "#DC2626", vermelhoLt: "#FEE2E2",
  verde: "#059669", verdeLt: "#D1FAE5",
  cinza: "#6B7280",
};

interface PagarMotoboyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PagarMotoboyModal({ isOpen, onClose }: PagarMotoboyModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70,
      }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 80, width: "min(520px, 92vw)", background: "#fff",
        borderRadius: 12, boxShadow: "0 12px 48px rgba(0,0,0,0.15)", overflow: "hidden",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${C.cremeBorder}`,
          background: C.cremeBg, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DollarSign size={18} color={C.esmeralda} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.esmeralda }}>
              Pagar Motoboy
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color={C.cinza} />
          </button>
        </div>

        <div style={{ padding: "18px", overflowY: "auto" }}>
          <PagamentoMotoboyPainel ativo={isOpen} />
        </div>
      </div>
    </>
  );
}
