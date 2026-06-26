"use client";

/**
 * CorreiosRastreioModal — Modal para informar código de rastreio dos Correios.
 *
 * REGRA DE NEGÓCIO: quando uma entrega é despachada via Correios (ou transportadora),
 * o código de rastreio e a data de postagem são registrados para que o cliente
 * possa acompanhar o envio. Suporta códigos dos Correios (formato BR padrão)
 * e de transportadoras (Jadlog, Azul Cargo, etc).
 *
 * O QUE: abre um modal simples com campo de texto para o código de rastreio,
 * envia PATCH /api/entregas-venda/[id]/correios e notifica sucesso.
 *
 * POR QUE: centraliza o rastreio na entrega, permitindo que o frontend
 * exiba o link de rastreamento e o cliente acompanhe online.
 *
 * IMPACTO SE ALTERADO: se os campos correios_rastreio e correios_data_postagem
 * forem renomeados no backend, este modal precisa acompanhar a mudança.
 * O formato do código não é validado estritamente para suportar transportadoras.
 */

import { useState, useRef, useEffect } from "react";
import { X, Loader2, CheckCircle, Send, AlertTriangle } from "lucide-react";
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
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
};

// ── Props ───────────────────────────────────────────────────────────────────────

interface CorreiosRastreioModalProps {
  /** ID da entrega */
  entregaId: number;
  isOpen: boolean;
  onClose: () => void;
  /** Callback chamado após atualização bem-sucedida */
  onSuccess: () => void;
}

// ── Resposta da API ─────────────────────────────────────────────────────────────

interface CorreiosResponse {
  mensagem?: string;
  correiosRastreio?: string;
  correiosDataPostagem?: string;
}

// ── Componente ──────────────────────────────────────────────────────────────────

export default function CorreiosRastreioModal({
  entregaId,
  isOpen,
  onClose,
  onSuccess,
}: CorreiosRastreioModalProps) {
  const [rastreio, setRastreio] = useState("");
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<CorreiosResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset ao abrir/fechar
  useEffect(() => {
    if (isOpen) {
      setRastreio("");
      setErro("");
      setSucesso(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ── Handler ─────────────────────────────────────────────────────────────────

  async function handleSalvar() {
    const code = rastreio.trim();
    if (!code) {
      setErro("Informe o código de rastreio.");
      return;
    }

    setSubmetendo(true);
    setErro("");

    try {
      const result = await apiFetch<CorreiosResponse>(
        `/api/entregas-venda/${entregaId}/correios`,
        {
          method: "PATCH",
          body: JSON.stringify({ rastreio: code }),
        },
      );

      setSucesso(result);

      // Aguardar 1.2s para o usuário ver o sucesso antes de fechar
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao atualizar rastreio.";
      setErro(msg);
    } finally {
      setSubmetendo(false);
    }
  }

  // Confirmar com Enter
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !submetendo && !sucesso) {
      void handleSalvar();
    }
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
            background: sucesso ? C.verdeLt : C.cremeBg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sucesso ? (
              <CheckCircle size={18} color={C.verde} />
            ) : (
              <Send size={18} color={C.esmeralda} />
            )}
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: sucesso ? C.verde : C.esmeralda,
              }}
            >
              {sucesso
                ? "Rastreio Atualizado!"
                : "Código de Rastreio — Correios"}
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
                  marginBottom: 4,
                }}
              >
                {sucesso.mensagem ?? "Rastreio atualizado com sucesso!"}
              </div>
              {sucesso.correiosRastreio && (
                <div
                  style={{
                    fontSize: 13,
                    color: C.cinza,
                    fontFamily: "monospace",
                    marginTop: 8,
                    padding: "6px 12px",
                    background: C.cremeBg,
                    borderRadius: 6,
                    display: "inline-block",
                  }}
                >
                  {sucesso.correiosRastreio}
                </div>
              )}
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
                Informe o código de rastreio dos Correios (ou transportadora)
                para que o cliente possa acompanhar a entrega.
              </p>

              {/* Input de rastreio */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: C.cinza,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Código de Rastreio
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={rastreio}
                  onChange={(e) => {
                    setRastreio(e.target.value.toUpperCase());
                    if (erro) setErro("");
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex: AA123456789BR"
                  autoComplete="off"
                  style={{
                    width: "100%",
                    fontSize: 16,
                    fontWeight: 600,
                    padding: "10px 14px",
                    border: `2px solid ${
                      erro ? C.vermelho : C.cremeBorder
                    }`,
                    borderRadius: 8,
                    outline: "none",
                    background: "#fff",
                    color: C.esmeralda,
                    fontFamily: "monospace",
                    letterSpacing: 1,
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

              {/* Botões */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  disabled={submetendo}
                  style={{
                    flex: 0,
                    padding: "10px 18px",
                    background: "none",
                    border: `1px solid ${C.cremeBorder}`,
                    borderRadius: 8,
                    fontSize: 13,
                    color: C.cinza,
                    cursor: submetendo ? "not-allowed" : "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvar}
                  disabled={submetendo || !rastreio.trim()}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background:
                      submetendo || !rastreio.trim()
                        ? "#9CA3AF"
                        : C.esmeralda,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor:
                      submetendo || !rastreio.trim()
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
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Salvar Rastreio
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
