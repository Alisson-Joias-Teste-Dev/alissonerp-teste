"use client";

/**
 * ConfirmarEntregaModal — Modal para confirmar uma entrega usando código de verificação.
 *
 * REGRA DE NEGÓCIO: a confirmação usa o sistema de dois códigos:
 *   - CÓDIGO A (codigo_cliente): entregue ao cliente para retirar/receber.
 *     Se forma='retirada': cliente retirou na loja → data_retirada, situacao='confirmada'.
 *     Se forma='motoboy': cliente recebeu em casa → data_entrega_realizada, situacao='confirmada'.
 *   - CÓDIGO B (codigo_motoboy): entregue ao motoboy para retirar na loja.
 *     Registra data_saida, etapa='retirada_loja'.
 *
 * O QUE: abre um modal com campo centralizado de 6 dígitos, valida o código
 * via POST /api/entregas-venda/[id]/confirmar, e notifica o sucesso.
 *
 * POR QUE: o sistema de dois códigos garante segurança — apenas quem possui
 * o código correto pode confirmar a entrega, prevenindo retiradas indevidas.
 *
 * IMPACTO SE ALTERADO: a confirmação de entrega dispara a baixa de estoque
 * (baixa_estoque_realizada = true). Alterar este fluxo pode causar estoque
 * inconsistente ou dupla baixa.
 */

import { useState, useRef, useEffect } from "react";
import { X, Loader2, CheckCircle, Shield, AlertTriangle, Camera } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// ── Paleta ──────────────────────────────────────────────────────────────────────
const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  vermelho: "#DC2626",
  vermelhoLt: "#FEE2E2",
  ambar: "#D97706",
  ambarLt: "#FEF3C7",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
};

// ── Props ───────────────────────────────────────────────────────────────────────

interface ConfirmarEntregaModalProps {
  /** ID da entrega a ser confirmada */
  entregaId: number;
  /** Tipo de código a ser usado na confirmação */
  tipo: "codigo_motoboy" | "codigo_cliente";
  isOpen: boolean;
  onClose: () => void;
  /** Callback chamado após confirmação bem-sucedida */
  onSuccess: () => void;
}

// ── Resposta da API ─────────────────────────────────────────────────────────────

interface ConfirmacaoResponse {
  mensagem?: string;
  etapa?: string;
  situacao?: string;
}

// ── Componente ──────────────────────────────────────────────────────────────────

export default function ConfirmarEntregaModal({
  entregaId,
  tipo,
  isOpen,
  onClose,
  onSuccess,
}: ConfirmarEntregaModalProps) {
  const [codigo, setCodigo] = useState("");
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<ConfirmacaoResponse | null>(null);
  const [fotoBase64, setFotoBase64] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Foco automático no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setCodigo("");
      setErro("");
      setSucesso(null);
      setFotoBase64("");
      // Pequeno timeout para garantir que o modal está renderizado
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ── Labels conforme o tipo ──────────────────────────────────────────────────
  const isMotoboy = tipo === "codigo_motoboy";

  const titulo = isMotoboy
    ? "Código do Motoboy (B)"
    : "Código do Cliente (A)";

  const descricao = isMotoboy
    ? "Digite o código B entregue ao motoboy para registrar a retirada da mercadoria na loja."
    : "Digite o código A entregue ao cliente para confirmar a retirada ou recebimento.";

  const placeholder = "000000";

  const corTema = isMotoboy ? C.ambar : C.esmeralda;
  const corTemaLt = isMotoboy ? C.ambarLt : C.esmeraldaLt;

  // ── Handler ─────────────────────────────────────────────────────────────────

  async function handleConfirmar() {
    const code = codigo.trim();
    if (!code) {
      setErro("Digite o código de verificação.");
      return;
    }
    if (code.length < 6) {
      setErro("O código deve ter 6 dígitos.");
      return;
    }

    setSubmetendo(true);
    setErro("");

    try {
      const body: Record<string, string> = { codigo: code };
      if (fotoBase64) body.foto_base64 = fotoBase64;

      const result = await apiFetch<ConfirmacaoResponse>(
        `/api/entregas-venda/${entregaId}/confirmar`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );

      setSucesso(result);

      // Aguardar 1.5s para o usuário ver a mensagem de sucesso antes de fechar
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao confirmar entrega.";
      // Traduz erros comuns para mensagens mais amigáveis
      if (msg.includes("Código inválido")) {
        setErro("Código inválido. Verifique e tente novamente.");
      } else if (msg.includes("já foi")) {
        setErro(msg);
      } else if (msg.includes("cancelada")) {
        setErro(msg);
      } else {
        setErro(msg);
      }
    } finally {
      setSubmetendo(false);
    }
  }

  // Confirmar com Enter
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !submetendo && !sucesso) {
      void handleConfirmar();
    }
  }

  /** Lê arquivo de foto como base64 para envio ao backend. */
  function handleFotoSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFotoBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={sucesso ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 60,
        }}
      />

      {/* Modal centralizado */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 70,
          width: "min(420px, 92vw)",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 12px 48px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${C.cremeBorder}`,
            background: sucesso
              ? C.verdeLt
              : corTemaLt,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sucesso ? (
              <CheckCircle size={18} color={C.verde} />
            ) : (
              <Shield size={18} color={corTema} />
            )}
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: sucesso ? C.verde : corTema,
              }}
            >
              {sucesso ? "Confirmado!" : titulo}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={submetendo}
            style={{
              background: "none",
              border: "none",
              cursor: submetendo ? "not-allowed" : "pointer",
            }}
          >
            <X size={18} color={C.cinza} />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ padding: "24px 20px" }}>
          {sucesso ? (
            /* Estado de sucesso */
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <CheckCircle
                size={48}
                color={C.verde}
                style={{ marginBottom: 12 }}
              />
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.verde,
                  marginBottom: 6,
                }}
              >
                {sucesso.mensagem ?? "Entrega confirmada com sucesso!"}
              </div>
              <div style={{ fontSize: 12, color: C.cinza }}>
                {sucesso.etapa === "retirada_loja"
                  ? "Etapa: Retirada na Loja"
                  : sucesso.etapa === "entrega_cliente"
                    ? "Etapa: Entrega ao Cliente"
                    : ""}
              </div>
            </div>
          ) : (
            /* Estado de input */
            <>
              <p
                style={{
                  fontSize: 13,
                  color: C.cinza,
                  marginBottom: 20,
                  lineHeight: 1.5,
                  textAlign: "center",
                }}
              >
                {descricao}
              </p>

              {/* Input de código */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => {
                    // Permite apenas dígitos
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCodigo(val);
                    if (erro) setErro("");
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  autoComplete="off"
                  style={{
                    width: "180px",
                    fontSize: 36,
                    fontWeight: 800,
                    textAlign: "center",
                    padding: "12px 8px",
                    border: `2px solid ${
                      erro ? C.vermelho : C.cremeBorder
                    }`,
                    borderRadius: 10,
                    outline: "none",
                    background: "#fff",
                    color: corTema,
                    fontFamily: "monospace",
                    letterSpacing: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Erro */}
              {erro && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: C.vermelhoLt,
                    color: C.vermelho,
                    fontSize: 12,
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    lineHeight: 1.4,
                  }}
                >
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  {erro}
                </div>
              )}

              {/* ── Foto de comprovação ────────────────────────────── */}
              {/* REGRA DE NEGÓCIO: foto opcional como comprovante
                  visual da retirada/entrega. */}
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFotoSelecionada}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={submetendo}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 6,
                    border: `1px solid ${C.cremeBorder}`,
                    background: fotoBase64 ? C.verdeLt : "#fff",
                    color: fotoBase64 ? C.verde : C.cinza,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Camera size={14} />
                  {fotoBase64 ? "Foto anexada" : "Anexar foto da entrega"}
                </button>
                {fotoBase64 && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={fotoBase64}
                      alt="Foto da entrega"
                      style={{
                        width: "100%", maxWidth: 200, borderRadius: 8,
                        border: `1px solid ${C.cremeBorder}`, margin: "0 auto",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Botão Confirmar */}
              <button
                onClick={handleConfirmar}
                disabled={submetendo || codigo.trim().length < 6}
                style={{
                  width: "100%",
                  padding: "12px",
                  background:
                    submetendo || codigo.trim().length < 6
                      ? "#9CA3AF"
                      : corTema,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor:
                    submetendo || codigo.trim().length < 6
                      ? "not-allowed"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {submetendo ? (
                  <>
                    <Loader2
                      size={15}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    Verificando...
                  </>
                ) : (
                  <>
                    <Shield size={15} />
                    Confirmar
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
