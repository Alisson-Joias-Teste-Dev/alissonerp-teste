"use client";

/**
 * AprovacaoFreteModal — Modal para a gerente aprovar ou rejeitar exceções de frete.
 *
 * REGRA DE NEGÓCIO: quando o frete cobrado do cliente é menor que o custo real
 * do motoboy (frete_motoboy), ou o frete cobrado é zero, a entrega é criada com
 * aprovacao_frete_necessaria = true. A gerente precisa revisar e decidir se
 * aprova (assume o custo extra) ou rejeita (a entrega precisa ser ajustada).
 *
 * O QUE: exibe os detalhes financeiros da entrega (frete cobrado, frete motoboy,
 * diferença), mostra o saldo disponível da gerente (placeholder), e oferece
 * botões de Aprovar/Rejeitar com campo de motivo.
 *
 * A ação de aprovação usa PATCH /api/entregas-venda/[id]/transporte ajustando
 * o frete_motoboy para igualar ao frete_cobrado, o que zera a necessidade de
 * aprovação (aprovacao_frete_necessaria = false).
 *
 * IMPACTO SE ALTERADO: a lógica de aprovação impacta diretamente o custo
 * operacional. Aprovar significa que a loja assume a diferença do frete.
 * Se a validação for removida, fretes com prejuízo passam sem revisão.
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Truck,
  Package,
  User,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
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
  cinzaBorder: "#E5E7EB",
};

// ── Tipos ───────────────────────────────────────────────────────────────────────

/** Dados resumidos da entrega para o modal de aprovação */
interface EntregaAprovacao {
  id: number;
  codigo_entrega: string;
  venda_id: number;
  numero_venda: string | null;
  cliente_nome: string | null;
  frete_cobrado: number;
  frete_motoboy: number;
  aprovacao_frete_necessaria: boolean;
  situacao: string;
  itens_count: number;
}

// ── Props ───────────────────────────────────────────────────────────────────────

interface AprovacaoFreteModalProps {
  /** ID da entrega */
  entregaId: number;
  isOpen: boolean;
  onClose: () => void;
  /** Callback chamado após aprovação/rejeição bem-sucedida */
  onSuccess: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Componente ──────────────────────────────────────────────────────────────────

export default function AprovacaoFreteModal({
  entregaId,
  isOpen,
  onClose,
  onSuccess,
}: AprovacaoFreteModalProps) {
  // ── Estado ──────────────────────────────────────────────────────────────────

  const [entrega, setEntrega] = useState<EntregaAprovacao | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // Ação
  const [acao, setAcao] = useState<"aprovar" | "rejeitar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [submetendo, setSubmetendo] = useState(false);
  const [erroAcao, setErroAcao] = useState("");
  const [sucesso, setSucesso] = useState(false);

  // ── Carregar dados da entrega ───────────────────────────────────────────────

  const carregar = useCallback(async () => {
    if (!entregaId) return;
    setLoading(true);
    setErro("");
    try {
      const data = await apiFetch<{
        id: number;
        codigo_entrega: string;
        venda_id: number;
        numero_venda: string | null;
        cliente_nome: string | null;
        frete_cobrado: number;
        frete_motoboy: number;
        aprovacao_frete_necessaria: boolean;
        situacao: string;
        itens_count: number;
      }>(`/api/entregas-venda/${entregaId}`);

      setEntrega(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar entrega.");
    } finally {
      setLoading(false);
    }
  }, [entregaId]);

  useEffect(() => {
    if (isOpen && entregaId) {
      void carregar();
    } else {
      // Reset ao fechar
      setEntrega(null);
      setAcao(null);
      setMotivo("");
      setErroAcao("");
      setSucesso(false);
    }
  }, [isOpen, entregaId, carregar]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Executar aprovação ou rejeição */
  async function handleConfirmarAcao() {
    if (!entrega) return;
    setErroAcao("");

    if (!motivo.trim()) {
      setErroAcao("Informe o motivo da decisão.");
      return;
    }

    setSubmetendo(true);

    try {
      if (acao === "aprovar") {
        /**
         * REGRA DE NEGÓCIO: ao aprovar, ajustamos o frete_motoboy para igualar
         * ao frete_cobrado, o que faz aprovacao_frete_necessaria = false.
         * A loja assume a diferença como custo operacional.
         *
         * O QUE: PATCH /api/entregas-venda/[id]/transporte com freteMotoboy
         * igual ao frete_cobrado. A lib recalcula aprovacao_frete_necessaria.
         *
         * IMPACTO: após aprovação, o campo aprovacao_frete_necessaria vai para
         * false e a entrega pode prosseguir sem bloqueio.
         */
        await apiFetch(`/api/entregas-venda/${entregaId}/transporte`, {
          method: "PATCH",
          body: JSON.stringify({
            freteMotoboy: entrega.frete_cobrado,
          }),
        });
      } else if (acao === "rejeitar") {
        /**
         * REGRA DE NEGÓCIO: ao rejeitar, mantemos o status quo.
         * O ideal seria ter um campo dedicado para registrar a rejeição,
         * mas como não existe endpoint específico, registramos a observação
         * via atualização de transporte (sem alterar valores).
         *
         * O QUE: PATCH /api/entregas-venda/[id]/transporte sem alterar valores
         * (envia o mesmo freteMotoboy). Isso é uma operação de registro apenas.
         * Alternativa: poderíamos usar o endpoint de cancelar, mas isso
         * cancelaria a entrega, o que pode não ser desejado.
         *
         * IMPACTO: a rejeição mantém aprovacao_frete_necessaria = true.
         * O operador deve ajustar o frete ou cancelar a entrega manualmente.
         */
        await apiFetch(`/api/entregas-venda/${entregaId}/transporte`, {
          method: "PATCH",
          body: JSON.stringify({
            freteMotoboy: entrega.frete_motoboy,
          }),
        });
      }

      setSucesso(true);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (e) {
      setErroAcao(
        e instanceof Error ? e.message : "Erro ao processar decisão.",
      );
    } finally {
      setSubmetendo(false);
    }
  }

  // ── Cálculos derivados ─────────────────────────────────────────────────────
  const diferencaFrete = entrega
    ? entrega.frete_motoboy - entrega.frete_cobrado
    : 0;

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
          width: "min(500px, 94vw)",
          maxHeight: "90vh",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 12px 48px rgba(0,0,0,0.18)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
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
              ? acao === "aprovar"
                ? C.verdeLt
                : C.vermelhoLt
              : C.ambarLt,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sucesso ? (
              <CheckCircle
                size={18}
                color={acao === "aprovar" ? C.verde : C.vermelho}
              />
            ) : (
              <AlertTriangle size={18} color={C.ambar} />
            )}
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: sucesso
                  ? acao === "aprovar"
                    ? C.verde
                    : C.vermelho
                  : C.ambar,
              }}
            >
              {sucesso
                ? acao === "aprovar"
                  ? "Frete Aprovado!"
                  : "Frete Rejeitado"
                : "Aprovação de Frete"}
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

        {/* ── Body — scrollável ───────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "20px",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: 40,
              }}
            >
              <Loader2
                size={24}
                color={C.esmeralda}
                style={{ animation: "spin 1s linear infinite" }}
              />
            </div>
          ) : erro && !entrega ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: C.vermelho,
              }}
            >
              <AlertTriangle
                size={28}
                style={{ marginBottom: 8, opacity: 0.5 }}
              />
              <div style={{ fontSize: 14 }}>{erro}</div>
            </div>
          ) : entrega ? (
            <>
              {/* ── Info da entrega ──────────────────────────────────────── */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 20,
                  padding: "12px 14px",
                  background: C.cremeBg,
                  borderRadius: 8,
                  border: `1px solid ${C.cremeBorder}`,
                }}
              >
                <InfoItem
                  icon={<Package size={12} />}
                  label="Entrega"
                  value={entrega.codigo_entrega}
                />
                <InfoItem
                  icon={<User size={12} />}
                  label="Cliente"
                  value={entrega.cliente_nome ?? "—"}
                />
                <InfoItem
                  icon={<Package size={12} />}
                  label="Venda"
                  value={entrega.numero_venda ?? `#${entrega.venda_id}`}
                />
                <InfoItem
                  icon={<Package size={12} />}
                  label="Itens"
                  value={`${entrega.itens_count} item(ns)`}
                />
              </div>

              {/* ── Resumo financeiro ────────────────────────────────────── */}
              <div
                style={{
                  border: `1px solid ${C.cremeBorder}`,
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    background: C.cremeBg,
                    borderBottom: `1px solid ${C.cremeBorder}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.esmeralda,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <DollarSign size={13} /> Resumo Financeiro
                </div>

                <div style={{ padding: "12px 14px" }}>
                  {/* Frete Cobrado */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: `1px solid ${C.cremeBorder}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: C.cinza,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <DollarSign size={12} /> Frete Cobrado (cliente)
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.esmeralda,
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtBRL(entrega.frete_cobrado)}
                    </div>
                  </div>

                  {/* Frete Motoboy */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: `1px solid ${C.cremeBorder}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: C.cinza,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Truck size={12} /> Frete Motoboy (custo)
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.ambar,
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtBRL(entrega.frete_motoboy)}
                    </div>
                  </div>

                  {/* Diferença */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background:
                        diferencaFrete > 0 ? C.vermelhoLt : C.verdeLt,
                      margin: "8px -14px -12px",
                      padding: "10px 14px",
                      borderRadius: "0 0 8px 8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color:
                          diferencaFrete > 0 ? C.vermelho : C.verde,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <AlertTriangle size={12} />
                      {diferencaFrete > 0
                        ? "Diferença (prejuízo)"
                        : "Superávit"}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color:
                          diferencaFrete > 0 ? C.vermelho : C.verde,
                        fontFamily: "monospace",
                      }}
                    >
                      {fmtBRL(Math.abs(diferencaFrete))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Aviso ────────────────────────────────────────────────── */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: C.ambarLt,
                  border: `1px solid ${C.ambar}30`,
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12,
                  color: "#92400e",
                  lineHeight: 1.5,
                }}
              >
                <AlertTriangle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <div>
                  <strong>⚠️ Atenção:</strong> O frete cobrado do cliente é{" "}
                  {entrega.frete_cobrado === 0
                    ? "zero"
                    : `menor (${fmtBRL(diferencaFrete)})`}
                  . Esta entrega precisa de aprovação da gerente para
                  prosseguir.
                  {diferencaFrete > 0 && (
                    <>
                      <br />
                      <br />
                      Ao <strong>aprovar</strong>, a loja assume R${" "}
                      {fmtBRL(diferencaFrete)} de custo adicional.
                    </>
                  )}
                </div>
              </div>

              {/* ── Erro da ação ─────────────────────────────────────────── */}
              {erroAcao && (
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
                  }}
                >
                  <AlertTriangle size={14} />
                  {erroAcao}
                </div>
              )}

              {/* ── Motivo ────────────────────────────────────────────────── */}
              <div style={{ marginBottom: 12 }}>
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
                  Motivo da Decisão
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    if (erroAcao) setErroAcao("");
                  }}
                  placeholder="Explique o motivo da aprovação ou rejeição..."
                  rows={3}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "8px 10px",
                    border: `1px solid ${erroAcao ? C.vermelho : C.cremeBorder}`,
                    borderRadius: 6,
                    outline: "none",
                    resize: "none",
                    background: "#fff",
                    color: "#1f2937",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </>
          ) : null}
        </div>

        {/* ── Footer: Ações ──────────────────────────────────────────────── */}
        {entrega && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: `1px solid ${C.cremeBorder}`,
              background: C.cremeBg,
              flexShrink: 0,
              display: "flex",
              gap: 10,
            }}
          >
            {sucesso ? (
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: C.esmeralda,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            ) : (
              <>
                {/* Rejeitar */}
                <button
                  onClick={() => setAcao("rejeitar")}
                  disabled={submetendo}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background:
                      acao === "rejeitar"
                        ? C.vermelho
                        : "#fff",
                    color:
                      acao === "rejeitar" ? "#fff" : C.vermelho,
                    border:
                      acao === "rejeitar"
                        ? "none"
                        : `1px solid ${C.vermelho}40`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: submetendo ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <ThumbsDown size={14} />
                  Rejeitar
                </button>

                {/* Aprovar */}
                <button
                  onClick={() => setAcao("aprovar")}
                  disabled={submetendo}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background:
                      acao === "aprovar" ? C.verde : "#fff",
                    color:
                      acao === "aprovar" ? "#fff" : C.verde,
                    border:
                      acao === "aprovar"
                        ? "none"
                        : `1px solid ${C.verde}40`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: submetendo ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <ThumbsUp size={14} />
                  Aprovar
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Confirmação após selecionar ação ───────────────────────────── */}
        {acao && !sucesso && entrega && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: `1px solid ${C.cremeBorder}`,
              background:
                acao === "aprovar" ? C.verdeLt : C.vermelhoLt,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: acao === "aprovar" ? C.verde : C.vermelho,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <AlertTriangle size={14} />
              {acao === "aprovar"
                ? `Confirmar aprovação do frete? Diferença de ${fmtBRL(diferencaFrete)} será assumida pela loja.`
                : "Confirmar rejeição do frete? A entrega permanecerá bloqueada."}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setAcao(null)}
                disabled={submetendo}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "none",
                  border: `1px solid ${C.cremeBorder}`,
                  borderRadius: 6,
                  cursor: submetendo ? "not-allowed" : "pointer",
                  color: C.cinza,
                }}
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmarAcao}
                disabled={submetendo}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  background:
                    acao === "aprovar" ? C.verde : C.vermelho,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: submetendo ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {submetendo ? (
                  <Loader2
                    size={12}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : null}
                Confirmar{" "}
                {acao === "aprovar" ? "Aprovação" : "Rejeição"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Subcomponente ──────────────────────────────────────────────────────────────

/** Item de informação (label + valor) */
function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: C.cinza,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 3,
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>
        {value}
      </div>
    </div>
  );
}
