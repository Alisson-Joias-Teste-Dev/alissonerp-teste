"use client";

// ════════════════════════════════════════════════════════════════════════════
// ValeCodigoInline — painel embutido da 2a confirmacao do Vale-Troca (brecha #1)
//
// O QUE: substitui o window.prompt. Mostra, dentro do formulario de pagamento:
//   [Enviar codigo ao dono] -> "codigo enviado para ****1234" + campo do codigo
//   + [Reenviar] + botao de aplicar. Nao trava a tela: o atendente pode esperar
//   o cliente responder. "Reenviar" manda o MESMO codigo (backend reusa o ativo).
// POR QUE: o pop-up do navegador travava a tela e sumia ao sair da pagina,
//   obrigando a gerar outro codigo — e o codigo trocado dava "codigo incorreto".
// REGRA: codigo OBRIGATORIO, SEM bypass de gerente (decisao do Jonathan 19/06).
//   So renderizar para vale COM dono (cliente_id != null); promocional aplica direto.
// IMPACTO SE REMOVIDO: volta o pop-up e o atrito de esperar o cliente.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Loader2, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { enviarCodigoVale } from "@/lib/vale-troca-confirmacao";

const VERDE = "#184036";
const CREME = "#F3EADA";
const BORDA = "#E8DCC8";

interface Props {
  valeNumero: string;
  /** Texto do botao de aplicar (ex.: "Registrar pagamento" / "Adicionar"). */
  botaoLabel?: string;
  disabled?: boolean;
  /**
   * Chamado quando o atendente confirma o codigo. O PAI faz a aplicacao real
   * (POST com vale_codigo) ou guarda o codigo (nova venda, aplica no Concluir).
   * Deve LANCAR em caso de erro pra exibir inline (ex.: "codigo incorreto").
   */
  onAplicar: (payload: { vale_codigo: string }) => Promise<void> | void;
}

export default function ValeCodigoInline({ valeNumero, botaoLabel = "Registrar pagamento", disabled, onAplicar }: Props) {
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [tel, setTel] = useState<string | undefined>();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await enviarCodigoVale(valeNumero);
      setTel(r.telefone_mascarado);
      setEnviado(true);
      // Mostra o motivo quando nao deu pra entregar (sem celular / WhatsApp fora).
      // Politica: codigo obrigatorio, sem bypass — entao apenas informa.
      if (r.erro) setErro(r.erro);
    } finally {
      setEnviando(false);
    }
  }

  async function registrar() {
    const c = codigo.trim();
    if (!c) { setErro("Digite o código informado pelo cliente."); return; }
    setAplicando(true);
    setErro(null);
    try {
      await onAplicar({ vale_codigo: c });
      // Sucesso: o pai recarrega/desmonta (detalhe) ou marca o codigo pronto (nova venda).
      setConfirmado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar o vale");
    } finally {
      setAplicando(false);
    }
  }

  // Estado pos-confirmacao (relevante na nova venda, onde a aplicacao real e no Concluir).
  if (confirmado) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10,
        backgroundColor: "#ECFDF5", color: "#065F46", padding: "10px 12px", borderRadius: 10,
        border: "1px solid #A7F3D0",
      }}>
        <ShieldCheck size={16} />
        <span>Código confirmado. Pode concluir o pagamento.</span>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${BORDA}`, borderRadius: 10, padding: 12, marginTop: 10, backgroundColor: "#FAFAF7" }}>
      {!enviado ? (
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || disabled}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
            borderRadius: 8, fontSize: 14, fontWeight: 500, color: CREME,
            backgroundColor: VERDE, opacity: enviando || disabled ? 0.5 : 1,
          }}
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
          Enviar código ao dono (WhatsApp)
        </button>
      ) : (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 13,
            backgroundColor: "#ECFDF5", color: "#065F46", padding: "8px 12px",
            borderRadius: 8, marginBottom: 10,
          }}>
            <ShieldCheck size={16} />
            <span>Código enviado{tel ? ` ao WhatsApp do dono (${tel})` : " ao dono"} · vale por 15 min</span>
          </div>

          <label style={{ display: "block", fontSize: 13, color: "#6B7280", marginBottom: 6 }}>
            Código informado pelo cliente
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "")); setErro(null); }}
              placeholder="______"
              style={{
                flex: 1, height: 42, padding: "0 12px", border: `1px solid ${BORDA}`,
                borderRadius: 8, fontSize: 18, letterSpacing: 4, fontFamily: "monospace", color: "#374151",
              }}
            />
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 42, padding: "0 14px",
                borderRadius: 8, fontSize: 14, border: `1px solid ${BORDA}`, color: VERDE,
                opacity: enviando ? 0.5 : 1,
              }}
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Reenviar
            </button>
          </div>

          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "8px 0 10px" }}>
            Pode esperar o cliente responder — o painel não some e o código continua valendo.
          </p>

          {erro && (
            <p style={{ fontSize: 13, color: "#B91C1C", margin: "0 0 10px" }}>{erro}</p>
          )}

          <button
            type="button"
            onClick={registrar}
            disabled={aplicando || disabled || !codigo.trim()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
              height: 42, borderRadius: 8, fontSize: 14, fontWeight: 500, color: CREME,
              backgroundColor: VERDE, opacity: aplicando || disabled || !codigo.trim() ? 0.5 : 1,
            }}
          >
            {aplicando ? <Loader2 size={16} className="animate-spin" /> : null}
            {botaoLabel}
          </button>
        </>
      )}
    </div>
  );
}
