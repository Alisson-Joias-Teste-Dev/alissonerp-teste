"use client";

/**
 * ConfirmarEnderecoModal — passo de confirmação de endereço no Solicitar
 * Frete Avulso (FreteAvulsoModal).
 *
 * REGRA DE NEGÓCIO (pedido do Jonathan, 04/08/2026): o formulário principal
 * não mostra mais os campos de endereço (ficava com cara de "muito
 * trabalho"). Ao clicar "Solicitar frete avulso", este popup decide sozinho
 * a sugestão:
 *   - venda vinculada (respondida "sim" na pergunta de sugestão) → endereço
 *     DELA;
 *   - sem venda, cliente tem endereço no cadastro (public.contatos) →
 *     endereço DO CADASTRO;
 *   - nenhum dos dois → abre direto no modo "digitar" (nada a confirmar).
 * A confirmação NUNCA é pulada quando existe uma sugestão: sempre mostra o
 * endereço por extenso e exige um clique explícito em "Sim, confirmar" antes
 * de gravar. "Não, quero digitar outro" troca pro EnderecoForm normal.
 *
 * IMPACTO SE ALTERADO: é o único lugar onde o endereço da solicitação é
 * coletado/confirmado — sem ele, a solicitação não tem como saber pra onde
 * a corrida vai.
 */
import { useEffect, useState } from "react";
import { X, MapPin, CheckCircle, PenLine } from "lucide-react";
import EnderecoForm, { type EnderecoValue, ENDERECO_VAZIO } from "@/components/endereco/EnderecoForm";

const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  cinza: "#6B7280",
  branco: "#fff",
};

/** Mínimo pra considerar um endereço "completo" — mesmo critério usado no
 *  backend (criarFreteAvulso): logradouro + número + cidade. */
export function enderecoCompleto(e: EnderecoValue): boolean {
  return !!(e.logradouro.trim() && e.numero.trim() && e.cidade.trim());
}

interface Props {
  isOpen: boolean;
  /** Endereço sugerido (da venda ou do cadastro do cliente) — null/incompleto = abre direto no modo "digitar". */
  enderecoSugerido: EnderecoValue | null;
  /** De onde veio a sugestão, só pra compor a mensagem. "manual" = a pessoa
   *  já editou no formulário principal (ver "Trocar" no FreteAvulsoModal). */
  fonte: "venda" | "cadastro" | "manual" | null;
  /** Número da venda, quando fonte === "venda" (compõe a mensagem). */
  numeroVenda?: string | null;
  onConfirmar: (endereco: EnderecoValue) => void;
  onCancelar: () => void;
}

export default function ConfirmarEnderecoModal({
  isOpen,
  enderecoSugerido,
  fonte,
  numeroVenda,
  onConfirmar,
  onCancelar,
}: Props) {
  const temSugestao = !!enderecoSugerido && enderecoCompleto(enderecoSugerido);
  const [modo, setModo] = useState<"confirmar" | "editar">(temSugestao ? "confirmar" : "editar");
  const [enderecoEditado, setEnderecoEditado] = useState<EnderecoValue>(enderecoSugerido ?? ENDERECO_VAZIO);

  // Reabre sempre no estado correto (confirmar se há sugestão completa, editar se não).
  useEffect(() => {
    if (isOpen) {
      setModo(temSugestao ? "confirmar" : "editar");
      setEnderecoEditado(enderecoSugerido ?? ENDERECO_VAZIO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const mensagemFonte = fonte === "venda"
    ? `A entrega vai pro endereço cadastrado na venda ${numeroVenda ?? ""}?`
    : fonte === "manual"
      ? "Confirma esse endereço?"
      : "A entrega vai pro endereço do cadastro do cliente?";

  return (
    <>
      <div
        onClick={onCancelar}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 70, width: "min(380px, 92vw)", background: C.branco, borderRadius: 14,
          boxShadow: "0 12px 48px rgba(0,0,0,0.18)", overflow: "hidden",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: `1px solid ${C.cremeBorder}`,
            background: C.esmeraldaLt, flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15, color: C.esmeralda, display: "flex", alignItems: "center", gap: 8 }}>
            <MapPin size={16} /> {modo === "confirmar" ? "Confirmar endereço" : "Endereço de entrega"}
          </span>
          <button onClick={onCancelar} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color={C.cinza} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {modo === "confirmar" && enderecoSugerido ? (
            <>
              <p style={{ fontSize: 13, color: C.cinza, margin: "0 0 14px", lineHeight: 1.5 }}>
                {mensagemFonte}
              </p>
              <div style={{
                fontSize: 13, color: "#1f2937", lineHeight: 1.5,
                padding: "10px 12px", background: C.cremeBg, borderRadius: 8, marginBottom: 16,
              }}>
                {enderecoSugerido.logradouro}, nº {enderecoSugerido.numero}
                {enderecoSugerido.complemento ? ` — ${enderecoSugerido.complemento}` : ""}
                <br />
                {enderecoSugerido.bairro ? `${enderecoSugerido.bairro} — ` : ""}
                {enderecoSugerido.cidade}{enderecoSugerido.uf ? `/${enderecoSugerido.uf}` : ""}
                {enderecoSugerido.cep ? <><br />CEP: {enderecoSugerido.cep}</> : null}
              </div>
              <button
                type="button"
                onClick={() => onConfirmar(enderecoSugerido)}
                style={{
                  width: "100%", padding: "11px 0", background: C.esmeralda, color: "#fff",
                  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <CheckCircle size={15} /> Sim, confirmar
              </button>
              <button
                type="button"
                onClick={() => setModo("editar")}
                style={{
                  width: "100%", padding: "11px 0", background: "#fff", color: C.cinza,
                  border: `1px solid ${C.cremeBorder}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Não, quero digitar outro
              </button>
            </>
          ) : (
            <>
              {!temSugestao && (
                <p style={{ fontSize: 13, color: C.cinza, margin: "0 0 14px", lineHeight: 1.5 }}>
                  Informe o endereço de entrega desta corrida.
                </p>
              )}
              <EnderecoForm value={enderecoEditado} onChange={setEnderecoEditado} />
              <button
                type="button"
                disabled={!enderecoCompleto(enderecoEditado)}
                onClick={() => onConfirmar(enderecoEditado)}
                style={{
                  width: "100%", marginTop: 16, padding: "11px 0",
                  background: enderecoCompleto(enderecoEditado) ? C.esmeralda : "#9CA3AF",
                  color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: enderecoCompleto(enderecoEditado) ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <PenLine size={15} /> Confirmar
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
