"use client";

/**
 * FinalizarAvulsoModal — Modal para finalizar uma corrida avulsa (sem código).
 *
 * REGRA DE NEGÓCIO (migration 357, decisão Jonathan 21/07): "sempre que o
 * motoboy finalizar uma entrega, PERGUNTAR se quer adicionar algum
 * comprovante" — mas sem tornar obrigatório (pular é 1 clique: o botão
 * principal "Finalizar entrega" funciona igual, com ou sem foto anexada).
 *
 * Corrida avulsa não usa código de verificação (ver ConfirmarEntregaModal
 * para o fluxo COM código) — por isso este modal só existe pra dar o passo
 * de "quer anexar fotos?" antes de chamar POST /confirmar-avulso, que antes
 * era um botão direto sem nenhuma pergunta.
 *
 * IMPACTO SE ALTERADO: usado tanto no app do motoboy (MotoboyAppClient) quanto
 * no drawer de detalhe (EntregaDetalheDrawer) — mesma UI, mesmo endpoint, para
 * as duas telas não divergirem no fluxo de finalizar corrida avulsa.
 */

import { useState, useRef, useEffect } from "react";
import { X, Loader2, CheckCircle, Camera } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { lerArquivosComoBase64 } from "@/lib/fotos-base64";

const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  cremeBorder: "#E8DCC8",
  vermelho: "#DC2626",
  vermelhoLt: "#FEE2E2",
  ambar: "#D97706",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
};

// REGRA DE NEGÓCIO (migration 357): mesmo limite usado no backend
// (MAX_FOTOS_ENTREGA) e no modal de confirmação com código.
const MAX_FOTOS = 5;

interface FinalizarAvulsoModalProps {
  entregaId: number;
  isOpen: boolean;
  onClose: () => void;
  /** Callback chamado após finalização bem-sucedida */
  onSuccess: () => void;
}

export default function FinalizarAvulsoModal({
  entregaId,
  isOpen,
  onClose,
  onSuccess,
}: FinalizarAvulsoModalProps) {
  const [fotosBase64, setFotosBase64] = useState<string[]>([]);
  const [fotoErro, setFotoErro] = useState("");
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");
  const fotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFotosBase64([]);
      setFotoErro("");
      setErro("");
      setSubmetendo(false);
    }
  }, [isOpen]);

  async function handleFotoSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;

    const vagas = MAX_FOTOS - fotosBase64.length;
    if (vagas <= 0) {
      setFotoErro(`Máximo de ${MAX_FOTOS} fotos.`);
      return;
    }
    const excedente = files.length > vagas;
    const novas = await lerArquivosComoBase64(files, vagas);
    setFotosBase64((prev) => [...prev, ...novas]);
    setFotoErro(excedente ? `Só cabiam mais ${vagas} foto(s) — o restante foi ignorado.` : "");
  }

  function removerFoto(idx: number) {
    setFotosBase64((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Finaliza a corrida — com ou sem foto anexada (opcional, nunca bloqueia). */
  async function handleFinalizar() {
    if (submetendo) return; // trava duplo clique
    setSubmetendo(true);
    setErro("");
    try {
      const body: Record<string, unknown> = {};
      if (fotosBase64.length > 0) body.fotos_base64 = fotosBase64;

      await apiFetch(`/api/entregas-venda/${entregaId}/confirmar-avulso`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao finalizar corrida.");
      setSubmetendo(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={submetendo ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 70, width: "min(420px, 92vw)", background: "#fff", borderRadius: 14,
          boxShadow: "0 12px 48px rgba(0,0,0,0.18)", overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: `1px solid ${C.cremeBorder}`,
            background: C.esmeraldaLt,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15, color: C.esmeralda }}>
            Finalizar entrega
          </span>
          <button
            onClick={onClose}
            disabled={submetendo}
            style={{ background: "none", border: "none", cursor: submetendo ? "not-allowed" : "pointer" }}
          >
            <X size={18} color={C.cinza} />
          </button>
        </div>

        <div style={{ padding: "24px 20px" }}>
          <p style={{ fontSize: 13, color: C.cinza, marginBottom: 18, lineHeight: 1.5, textAlign: "center" }}>
            Quer anexar um comprovante (foto) desta corrida? É opcional — você pode finalizar sem foto.
          </p>

          {erro && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, background: C.vermelhoLt, color: C.vermelho,
              fontSize: 12, marginBottom: 16,
            }}>
              {erro}
            </div>
          )}

          <div style={{ marginBottom: 20, textAlign: "center" }}>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handleFotoSelecionada}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fotoInputRef.current?.click()}
              disabled={submetendo || fotosBase64.length >= MAX_FOTOS}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                border: `1px solid ${C.cremeBorder}`,
                background: fotosBase64.length > 0 ? C.verdeLt : "#fff",
                color: fotosBase64.length > 0 ? C.verde : C.cinza,
                fontSize: 12, fontWeight: 600,
                cursor: submetendo || fotosBase64.length >= MAX_FOTOS ? "not-allowed" : "pointer",
              }}
            >
              <Camera size={14} />
              {fotosBase64.length > 0
                ? `${fotosBase64.length} foto(s) anexada(s)`
                : "Anexar fotos (opcional)"}
            </button>
            {fotoErro && (
              <div style={{ marginTop: 6, fontSize: 11, color: C.ambar }}>{fotoErro}</div>
            )}
            {fotosBase64.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {fotosBase64.map((foto, idx) => (
                  <div key={idx} style={{ position: "relative" }}>
                    <img
                      src={foto}
                      alt={`Foto ${idx + 1} da corrida`}
                      style={{
                        width: 72, height: 72, objectFit: "cover", borderRadius: 8,
                        border: `1px solid ${C.cremeBorder}`,
                      }}
                    />
                    <button
                      onClick={() => removerFoto(idx)}
                      disabled={submetendo}
                      aria-label={`Remover foto ${idx + 1}`}
                      style={{
                        position: "absolute", top: -6, right: -6,
                        width: 18, height: 18, borderRadius: "50%",
                        background: C.vermelho, color: "#fff", border: "none",
                        fontSize: 11, lineHeight: "18px", cursor: "pointer", padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botão único — funciona igual com ou sem foto (pular = 1 clique) */}
          <button
            onClick={handleFinalizar}
            disabled={submetendo}
            style={{
              width: "100%", padding: "12px",
              background: submetendo ? "#9CA3AF" : C.esmeralda,
              color: "#fff", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              cursor: submetendo ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {submetendo ? (
              <>
                <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                Finalizando...
              </>
            ) : (
              <>
                <CheckCircle size={15} />
                {fotosBase64.length > 0 ? "Finalizar com fotos" : "Finalizar sem foto"}
              </>
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
