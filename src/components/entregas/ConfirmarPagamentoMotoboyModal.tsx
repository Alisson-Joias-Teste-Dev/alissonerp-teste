"use client";

/**
 * ConfirmarPagamentoMotoboyModal — o motoboy confirma o pagamento "Na Entrega"
 * antes de poder confirmar a entrega (Etapa 1, decisão Jonathan 13/06).
 *
 * REGRA DE NEGÓCIO:
 *  - Dinheiro / Ouro: motoboy confirma na rua (se responsabiliza) → fica
 *    'aguardando_conferencia' (só entra no caixa/ouro quando o financeiro conferir).
 *  - Mercado Pago / PagBank: motoboy digita o ID → o sistema verifica na API →
 *    aprovado → 'confirmado' (entra no financeiro direto).
 *  Confirmado o pagamento, a venda libera o botão "Confirmar Entrega".
 *
 * IMPACTO SE ALTERADO: motoboy fica travado no Código A; ou dinheiro do motoboy
 * entra no caixa sem conferência.
 */

import { useState } from "react";
import { X, Loader2, CheckCircle, Wallet, Banknote, Gem, CreditCard } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  vermelho: "#DC2626",
  vermelhoLt: "#FEE2E2",
  ambar: "#D97706",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
};

type Forma = "Dinheiro" | "Ouro" | "Mercado Pago" | "PagBank";

/**
 * Converte texto em moeda BR ("2.500,00") para número (2500). Tira os pontos de
 * milhar e troca TODAS as vírgulas por ponto. O `.replace(",", ".")` simples só
 * trocava a 1ª vírgula e não tirava o ponto de milhar → "2.500,00" virava NaN e
 * o botão ficava travado sem explicação. Bug pego no code-review 13/06.
 */
function parseBRL(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : NaN;
}

interface Props {
  entregaId: number;
  valor: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FORMAS: Array<{ forma: Forma; label: string; Icon: typeof Banknote }> = [
  { forma: "Dinheiro", label: "Dinheiro", Icon: Banknote },
  { forma: "Ouro", label: "Ouro", Icon: Gem },
  { forma: "Mercado Pago", label: "Mercado Pago", Icon: CreditCard },
  { forma: "PagBank", label: "PagBank", Icon: CreditCard },
];

export default function ConfirmarPagamentoMotoboyModal({ entregaId, valor, isOpen, onClose, onSuccess }: Props) {
  const [forma, setForma] = useState<Forma | null>(null);
  const [paymentId, setPaymentId] = useState("");
  const [ouroGramas, setOuroGramas] = useState("");
  const [ouroValorGrama, setOuroValorGrama] = useState("");
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  if (!isOpen) return null;

  const ehGateway = forma === "Mercado Pago" || forma === "PagBank";
  const ehOuro = forma === "Ouro";

  async function confirmar() {
    if (!forma) return;
    setErro("");
    setSubmetendo(true);
    try {
      const payload: Record<string, unknown> = { forma };
      if (ehGateway) payload.payment_id = paymentId.trim();
      if (ehOuro) {
        payload.ouro_gramas = parseBRL(ouroGramas);
        payload.ouro_valor_grama = parseBRL(ouroValorGrama);
      }
      await apiFetch(`/api/entregas-venda/${entregaId}/confirmar-pagamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSucesso(true);
      setTimeout(() => { onSuccess(); onClose(); }, 900);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao confirmar pagamento.");
    } finally {
      setSubmetendo(false);
    }
  }

  const podeConfirmar = forma != null && !submetendo &&
    (!ehGateway || paymentId.trim().length > 0) &&
    (!ehOuro || (parseBRL(ouroGramas) > 0 && parseBRL(ouroValorGrama) > 0));

  // Não deixar fechar enquanto envia (senão o drawer não atualiza e o motoboy
  // re-clica → POST duplicado). Bug pego no code-review 13/06.
  const fechar = () => { if (!submetendo) onClose(); };

  return (
    <div onClick={fechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.cremeBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={18} color={C.ambar} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.esmeralda }}>Confirmar Pagamento</div>
              <div style={{ fontSize: 12, color: C.cinza }}>Na entrega — R$ {valor.toFixed(2)}</div>
            </div>
          </div>
          <button onClick={fechar} disabled={submetendo} style={{ background: "none", border: "none", cursor: submetendo ? "not-allowed" : "pointer", opacity: submetendo ? 0.4 : 1 }}><X size={18} color={C.cinza} /></button>
        </div>

        {sucesso ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <CheckCircle size={40} color={C.verde} style={{ margin: "0 auto 10px" }} />
            <div style={{ fontWeight: 700, color: C.verde }}>Pagamento confirmado!</div>
            <div style={{ fontSize: 12, color: C.cinza, marginTop: 4 }}>Agora confirme a entrega.</div>
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            {/* Formas */}
            <div style={{ fontSize: 12, color: C.cinza, marginBottom: 8 }}>Como o cliente pagou?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {FORMAS.map(({ forma: f, label, Icon }) => (
                <button key={f} onClick={() => { setForma(f); setErro(""); }}
                  style={{
                    padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${forma === f ? C.esmeralda : C.cremeBorder}`,
                    background: forma === f ? C.esmeralda : "#fff",
                    color: forma === f ? "#fff" : C.esmeralda,
                    fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* Campos por forma */}
            {ehGateway && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: C.cinza, display: "block", marginBottom: 4 }}>
                  ID do pagamento ({forma}) — verificado na API
                </label>
                <input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="cole o ID do pagamento"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.cremeBorder}`, fontSize: 14 }} />
              </div>
            )}
            {ehOuro && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, color: C.cinza, display: "block", marginBottom: 4 }}>Gramas</label>
                  <input value={ouroGramas} onChange={(e) => setOuroGramas(e.target.value)} placeholder="0,00" inputMode="decimal"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.cremeBorder}`, fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: C.cinza, display: "block", marginBottom: 4 }}>Valor/grama (R$)</label>
                  <input value={ouroValorGrama} onChange={(e) => setOuroValorGrama(e.target.value)} placeholder="0,00" inputMode="decimal"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.cremeBorder}`, fontSize: 14 }} />
                </div>
              </div>
            )}
            {(forma === "Dinheiro" || ehOuro) && (
              <div style={{ fontSize: 11, color: C.ambar, background: "#FEF3C7", borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
                Fica <b>aguardando conferência</b> do caixa antes de entrar no financeiro. Você se responsabiliza pelo recebido.
              </div>
            )}

            {erro && (
              <div style={{ fontSize: 12, color: C.vermelho, background: C.vermelhoLt, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>{erro}</div>
            )}

            <button onClick={confirmar} disabled={!podeConfirmar}
              style={{
                width: "100%", padding: 12, borderRadius: 8, border: "none",
                background: podeConfirmar ? C.verde : "#9CA3AF", color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: podeConfirmar ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {submetendo ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={16} />}
              {submetendo ? "Confirmando..." : "Confirmar Pagamento"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
