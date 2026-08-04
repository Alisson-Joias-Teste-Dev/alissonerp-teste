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
 *
 * REGRA DE NEGÓCIO (pedido do Jonathan, 03/08/2026 — reverte a opcionalidade
 * das fotos SÓ para o motoboy confirmando a entrega ao cliente): quando
 * `exigirLocalizacaoEFoto` vem true (EntregaDetalheDrawer só manda isso para
 * `userRole==='entregador'` E o botão específico "Confirmar Entrega ao
 * Cliente", nunca para "Confirmar Retirada" nem para o código B), localização
 * + pelo menos 1 foto passam a ser obrigatórias para habilitar "Confirmar".
 * Fora disso (admin/gerente confirmando pelo escritório, ou código B/retirada
 * na loja), continua tudo opcional como sempre foi.
 */

import { useState, useRef, useEffect } from "react";
import { X, Loader2, CheckCircle, Shield, AlertTriangle, Camera, MapPin } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { lerArquivosComoBase64 } from "@/lib/fotos-base64";
import { useLocalizacaoMotoboy } from "@/hooks/useLocalizacaoMotoboy";

// REGRA DE NEGÓCIO (migration 357): limite de fotos por confirmação — mesmo
// valor usado no backend (MAX_FOTOS_ENTREGA, src/lib/entrega-venda.ts) e no
// padrão já existente do projeto (solicitação de peça, migration 349).
const MAX_FOTOS = 5;

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
  /** Ver REGRA DE NEGÓCIO no topo do arquivo — true só quando o motoboy
   *  confirma a entrega ao cliente no próprio app. */
  exigirLocalizacaoEFoto?: boolean;
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
  exigirLocalizacaoEFoto = false,
}: ConfirmarEntregaModalProps) {
  const [codigo, setCodigo] = useState("");
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<ConfirmacaoResponse | null>(null);
  // MULTIFOTO (migration 357): várias fotos opcionais, até MAX_FOTOS.
  const [fotosBase64, setFotosBase64] = useState<string[]>([]);
  const [fotoErro, setFotoErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const { coords, buscando: buscandoLocalizacao, erro: erroLocalizacao, tentarNovamente: tentarLocalizacaoNovamente } =
    useLocalizacaoMotoboy(isOpen && exigirLocalizacaoEFoto);

  // Foco automático no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setCodigo("");
      setErro("");
      setSucesso(null);
      setFotosBase64([]);
      setFotoErro("");
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
      // REGRA DE NEGÓCIO (alerta Jonathan): fotos NUNCA condicionam nem
      // antecipam a validação do código — o backend valida `codigo` primeiro,
      // sempre; `fotos_base64` só é processado depois de aprovado (best-effort,
      // opcional). Este front só empacota o que foi digitado/anexado.
      const body: Record<string, unknown> = { codigo: code };
      if (fotosBase64.length > 0) body.fotos_base64 = fotosBase64;
      if (coords) { body.latitude = coords.latitude; body.longitude = coords.longitude; }

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

  /**
   * Lê os arquivos selecionados (1 ou vários) como base64 para envio.
   * REGRA DE NEGÓCIO: soma com as fotos já anexadas, até MAX_FOTOS — o
   * excedente é descartado com um aviso (não trava a tela, só informa).
   */
  async function handleFotoSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    // REGRA DE NEGÓCIO (04/08/2026 — bug real achado em teste, mesmo de
    // FinalizarAvulsoModal): `e.target.files` é uma REFERÊNCIA ao FileList —
    // `e.target.value = ""` logo abaixo (necessário pra permitir escolher o
    // mesmo arquivo de novo) esvazia essa MESMA referência em alguns
    // navegadores, fazendo o array virar vazio antes de processar.
    // `Array.from(...)` copia os File objects, imune a isso.
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo depois
    if (files.length === 0) return;

    const vagas = MAX_FOTOS - fotosBase64.length;
    if (vagas <= 0) {
      setFotoErro(`Máximo de ${MAX_FOTOS} fotos.`);
      return;
    }
    const excedente = files.length > vagas;
    // REGRA DE NEGÓCIO (04/08/2026 — mesmo bug de FinalizarAvulsoModal):
    // sem try/catch, falha no FileReader (ex.: arquivo de pasta sincronizada
    // na nuvem ainda não baixado) rejeitava a Promise em silêncio — nenhum
    // aviso na tela. Agora mostra o erro.
    try {
      const novas = await lerArquivosComoBase64(files, vagas);
      setFotosBase64((prev) => [...prev, ...novas]);
      setFotoErro(excedente ? `Só cabiam mais ${vagas} foto(s) — o restante foi ignorado.` : "");
    } catch (err) {
      setFotoErro(err instanceof Error ? `Não consegui ler o arquivo: ${err.message}` : "Não consegui ler o arquivo selecionado. Tente outra foto.");
    }
  }

  function removerFoto(idx: number) {
    setFotosBase64((prev) => prev.filter((_, i) => i !== idx));
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

              {/* ── Localização (obrigatória só quando exigirLocalizacaoEFoto) ── */}
              {exigirLocalizacaoEFoto && (
                <div style={{
                  marginBottom: 16, padding: "10px 14px", borderRadius: 8,
                  background: coords ? C.verdeLt : erroLocalizacao ? C.vermelhoLt : C.cremeBorder + "40",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontSize: 12, fontWeight: 600,
                  color: coords ? C.verde : erroLocalizacao ? C.vermelho : C.cinza,
                }}>
                  {buscandoLocalizacao ? (
                    <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Obtendo localização...</>
                  ) : coords ? (
                    <><MapPin size={14} /> Localização confirmada</>
                  ) : (
                    <><AlertTriangle size={14} /> {erroLocalizacao || "Localização não obtida"}</>
                  )}
                  {!buscandoLocalizacao && !coords && (
                    <button
                      type="button"
                      onClick={tentarLocalizacaoNovamente}
                      style={{
                        marginLeft: 4, padding: "3px 8px", borderRadius: 6,
                        border: `1px solid ${C.vermelho}`, background: "#fff",
                        color: C.vermelho, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Tentar de novo
                    </button>
                  )}
                </div>
              )}

              {/* ── Fotos de comprovação (opcional, migration 357 — exceto
                  quando exigirLocalizacaoEFoto, ver REGRA DE NEGÓCIO no topo
                  do arquivo) ──── */}
              {/* REGRA DE NEGÓCIO: até MAX_FOTOS fotos. Nunca antecipa/substitui
                  a validação do código (acima) — só se soma a ela quando o
                  código já é válido. */}
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  // REGRA DE NEGÓCIO (04/08/2026 — mesmo bug de FinalizarAvulsoModal):
                  // `capture="environment"` + `multiple` juntos têm
                  // comportamento inconsistente em várias versões do Chrome —
                  // a lista de arquivos chega vazia, sem erro. Removido; o
                  // seletor nativo do celular ainda oferece "Câmera" como
                  // opção, só não força mais direto pra ela.
                  multiple
                  onChange={handleFotoSelecionada}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={submetendo || fotosBase64.length >= MAX_FOTOS}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 6,
                    border: `1px solid ${C.cremeBorder}`,
                    background: fotosBase64.length > 0 ? C.verdeLt : "#fff",
                    color: fotosBase64.length > 0 ? C.verde : C.cinza,
                    fontSize: 12, fontWeight: 600,
                    cursor: submetendo || fotosBase64.length >= MAX_FOTOS ? "not-allowed" : "pointer",
                  }}
                >
                  <Camera size={14} />
                  {fotosBase64.length > 0
                    ? `${fotosBase64.length} foto(s) anexada(s)${exigirLocalizacaoEFoto ? "" : " (opcional)"}`
                    : exigirLocalizacaoEFoto ? "Anexar foto da entrega (obrigatório)" : "Anexar fotos da entrega (opcional)"}
                </button>
                {fotoErro && (
                  <div style={{ marginTop: 6, fontSize: 11, color: C.ambar }}>{fotoErro}</div>
                )}
                {fotosBase64.length > 0 && (
                  <div style={{
                    marginTop: 8, display: "flex", flexWrap: "wrap",
                    gap: 8, justifyContent: "center",
                  }}>
                    {fotosBase64.map((foto, idx) => (
                      <div key={idx} style={{ position: "relative" }}>
                        <img
                          src={foto}
                          alt={`Foto ${idx + 1} da entrega`}
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

              {/* Botão Confirmar — com exigirLocalizacaoEFoto, também trava até
                  foto + localização baterem (código continua sendo a ÚNICA
                  coisa validada no servidor antes de qualquer outra coisa —
                  isto aqui é só o gate de UX do botão). */}
              {(() => {
                const faltaExigencia = exigirLocalizacaoEFoto && (fotosBase64.length === 0 || !coords);
                const desabilitado = submetendo || codigo.trim().length < 6 || faltaExigencia;
                return (
              <button
                onClick={handleConfirmar}
                disabled={desabilitado}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: desabilitado ? "#9CA3AF" : corTema,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: desabilitado ? "not-allowed" : "pointer",
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
                );
              })()}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
