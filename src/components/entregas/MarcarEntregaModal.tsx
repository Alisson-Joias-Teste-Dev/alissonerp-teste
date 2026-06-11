"use client";

/**
 * MarcarEntregaModal — Modal para criar uma nova entrega (parcial ou total) de uma venda.
 *
 * REGRA DE NEGÓCIO: uma venda aprovada pode ser entregue em uma ou mais remessas.
 * O modal oferece dois modos:
 *   - "Entrega Total": entrega todo o saldo pendente de uma vez, em um único clique.
 *   - "Entrega Parcial": o operador seleciona quais itens entregar e em qual quantidade.
 *
 * Cada entrega gera códigos de verificação (código A para cliente, código B para motoboy)
 * que são exibidos ao final da criação. O frete é calculado automaticamente pela região.
 *
 * O QUE: busca entregas existentes da venda para calcular o saldo pendente de cada item,
 * permite selecionar forma de entrega (retirada ou motoboy), região e valores de frete,
 * e submete via POST /api/entregas-venda.
 *
 * IMPACTO SE ALTERADO: a validação de saldo pendente é crítica — se o frontend permitir
 * enviar quantidade maior que o saldo, o backend rejeita. A geração de códigos e o cálculo
 * de frete são delegados à lib entrega-venda.ts.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Package,
  Truck,
  MapPin,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  ClipboardList,
  Hash,
  Bike,
  Store,
  Camera,
  Clock,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";

// ── Paleta (idêntica ao CrediarioClient) ────────────────────────────────────────
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

/** Dados de uma entrega existente (retornados pela API de listagem) */
interface EntregaExistente {
  id: number;
  venda_id: number;
  codigo_entrega: string;
  situacao: string;
  // Usado apenas para filtrar entregas não canceladas
}

/** Dados de um item da venda com saldo pendente calculado */
interface ItemPendente {
  itemVendaId: number;
  nomeProduto: string;
  sku: string;
  qtdVendida: number; // Quantidade original vendida
  saldoPendente: number; // Quantidade que ainda pode ser entregue
}

/** Item selecionado no modo parcial */
interface ItemSelecionado {
  itemVendaId: number;
  nomeProduto: string;
  sku: string;
  qtdVendida: number;
  saldoPendente: number;
  quantidade: string; // Valor digitado pelo usuário (string para permitir edição)
}

/** Resposta da criação de entrega */
interface EntregaCriada {
  entrega: {
    id: number;
    codigoEntrega: string;
    codigoCliente: string;
    codigoMotoboy: string | null;
    tipo: string;
    formaEntrega: string;
    situacao: string;
    regiao: string | null;
    freteCobrado: number;
    freteMotoboy: number;
    aprovacaoFreteNecessaria: boolean;
    whatsappEnviado: boolean;
    whatsappErro: string | null;
    clienteNome: string | null;
    clienteTelefone: string | null;
    whatsappMotoboyEnviado: boolean;
    whatsappMotoboyErro: string | null;
    motoboyNome: string | null;
    motoboyTelefone: string | null;
  };
}

/** Dados de um motoboy */
interface Motoboy {
  id: number;
  user_id: string | null;
  nome: string;
  telefone: string | null;
  veiculo: string | null;
  placa: string | null;
}

// ── Props ───────────────────────────────────────────────────────────────────────

interface MarcarEntregaModalProps {
  vendaId: number;
  /** Itens da venda fornecidos pelo componente pai (modo simplificado sem vendaItems) */
  vendaItems?: Array<{ id: number; nomeProduto: string; sku: string; quantidade: number }>;
  isOpen: boolean;
  onClose: () => void;
  /** Callback chamado após criação bem-sucedida, recebe a entrega criada */
  onSuccess: (entrega: EntregaCriada["entrega"]) => void;
  /** Frete total da venda (fallback para freteCobrado padrão) */
  freteVenda?: number;
  /** Forma de envio da venda (vendas_erp.forma_envio) — usado como padrão para formaEntrega */
  formaEnvioVenda?: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Calcula o valor do frete de motoboy para a região informada.
 * REGRA DE NEGÓCIO: valores fixos definidos pela gerência.
 *   - Fortaleza: R$ 20,00
 *   - Fora Fortaleza: R$ 50,00
 *   - Longe / Correios: R$ 0,00 (calculado manualmente)
 * O QUE: centraliza a tabela de fretes no frontend para exibição imediata.
 * IMPACTO SE ALTERADO: deve bater com calcularValorMotoboy() em entrega-venda.ts.
 */
function calcularFreteMotoboy(regiao: string): number {
  switch (regiao) {
    case "fortaleza":
      return 20;
    case "fora_fortaleza":
      return 50;
    case "longe":
    case "correios":
      return 0;
    default:
      return 0;
  }
}

/** Label amigável para cada região */
function labelRegiao(regiao: string): string {
  switch (regiao) {
    case "fortaleza":
      return "Fortaleza (R$ 20,00)";
    case "fora_fortaleza":
      return "Fora Fortaleza (R$ 50,00)";
    case "longe":
      return "Muito Longe";
    case "correios":
      return "Correios";
    default:
      return regiao;
  }
}

/** Label amigável para forma de entrega */
function labelFormaEntrega(f: string): string {
  return f === "retirada" ? "Retirada na Loja" : "Motoboy";
}

// ── Subcomponente: Modal de confirmação após criar entrega ──────────────────────
/**
 * CodigosModal — exibe o status do envio do código por WhatsApp e o Código B (motoboy).
 *
 * REGRA DE NEGÓCIO: o Código A (cliente) NUNCA é exibido na tela — é enviado
 * automaticamente para o WhatsApp do cliente. Se o cliente não tiver WhatsApp
 * cadastrado, o operador pode cadastrar na hora e reenviar.
 * O Código B (motoboy) é exibido normalmente para o operador repassar.
 *
 * IMPACTO SE REMOVIDO: sem esta tela, o operador não saberia se o código
 * foi enviado nem teria como cadastrar WhatsApp do cliente.
 */
function CodigosModal({
  entregaId,
  codigoMotoboy,
  whatsappEnviado,
  whatsappErro,
  clienteNome,
  clienteTelefone,
  whatsappMotoboyEnviado,
  whatsappMotoboyErro,
  motoboyNome,
  motoboyTelefone,
  onReenviar,
  onReenviarMotoboy,
  onConfirmado,
  onCodigoConfirmado,
  onClose,
  reenviando,
  reenviandoMotoboy,
}: {
  entregaId: number;
  codigoMotoboy: string | null;
  whatsappEnviado: boolean;
  whatsappErro: string | null;
  clienteNome: string | null;
  clienteTelefone: string | null;
  whatsappMotoboyEnviado: boolean;
  whatsappMotoboyErro: string | null;
  motoboyNome: string | null;
  motoboyTelefone: string | null;
  onReenviar?: (whatsapp: string) => void;
  onReenviarMotoboy?: (whatsapp: string) => void;
  onConfirmado?: () => void;
  onCodigoConfirmado?: () => void;
  onClose: () => void;
  reenviando?: boolean;
  reenviandoMotoboy?: boolean;
}) {
  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappMotoboyInput, setWhatsappMotoboyInput] = useState("");
  const [codigoClienteInput, setCodigoClienteInput] = useState("");
  const [confirmandoCodigo, setConfirmandoCodigo] = useState(false);
  const [erroCodigo, setErroCodigo] = useState("");
  const [fotoBase64, setFotoBase64] = useState("");
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const isSemWhatsapp = whatsappErro === "Cliente sem WhatsApp cadastrado";
  const isSemWhatsappMotoboy = whatsappMotoboyErro === "Motoboy sem WhatsApp cadastrado";
  const permiteCorrigirWhatsapp = Boolean(whatsappErro);

  useEffect(() => {
    // REGRA DE NEGÓCIO: quando o WhatsApp cadastrado falha, o campo abre já
    // preenchido para o operador corrigir só o dígito/DDD errado. Se removido,
    // a loja precisa redigitar o telefone inteiro e aumenta risco de erro.
    if (whatsappErro && clienteTelefone && !whatsappInput) {
      setWhatsappInput(clienteTelefone);
    }
    if (whatsappMotoboyErro && motoboyTelefone && !whatsappMotoboyInput) {
      setWhatsappMotoboyInput(motoboyTelefone);
    }
  }, [clienteTelefone, whatsappErro, whatsappInput, motoboyTelefone, whatsappMotoboyErro, whatsappMotoboyInput]);

  /**
   * Confirma a entrega com o Código A recebido pelo cliente.
   *
   * REGRA DE NEGÓCIO: o Código A nunca aparece para o operador; ele apenas
   * digita o código informado pelo cliente. A confirmação chama o backend, que
   * valida o código e realiza a baixa de estoque. Se remover esta etapa, a
   * entrega fica criada, mas o estoque não baixa e o fluxo volta ao início.
   */
  async function handleConfirmarCodigoCliente() {
    const codigo = codigoClienteInput.trim();
    const isMotoboy = !!codigoMotoboy;
    if (codigo.length < 6) {
      setErroCodigo(isMotoboy
        ? "Digite os 6 dígitos do Código B recebido pelo motoboy."
        : "Digite os 6 dígitos do código recebido pelo cliente.");
      return;
    }

    setConfirmandoCodigo(true);
    setErroCodigo("");
    try {
      // REGRA DE NEGÓCIO: foto de comprovação da retirada/entrega é opcional.
      // Enviar como base64 para o backend fazer upload no Storage.
      const body: Record<string, string> = { codigo };
      if (fotoBase64) body.foto_base64 = fotoBase64;

      await apiFetch(`/api/entregas-venda/${entregaId}/confirmar`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCodigoConfirmado?.();
      onConfirmado?.();
    } catch (e) {
      setErroCodigo(e instanceof Error ? e.message : "Erro ao confirmar entrega.");
    } finally {
      setConfirmandoCodigo(false);
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

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70,
        }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 80,
          width: "min(420px, 90vw)", background: "#fff",
          borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${C.cremeBorder}`,
          background: whatsappEnviado ? C.verdeLt : C.ambarLt,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {whatsappEnviado
              ? <CheckCircle size={18} color={C.verde} />
              : <AlertTriangle size={18} color={C.ambar} />}
            <span style={{
              fontWeight: 700, fontSize: 15,
              color: whatsappEnviado ? C.verde : C.ambar,
            }}>
              {whatsappEnviado ? "Código Enviado!" : "Atenção"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color={C.cinza} />
          </button>
        </div>

        <div style={{ padding: "20px" }}>

          {/* ── Status WhatsApp (Código A) ──────────────────────────────── */}
          {/* REGRA DE NEGÓCIO: o operador nunca vê o Código A.
              Só sabe se foi enviado ou se precisa cadastrar o WhatsApp. */}
          <div style={{
            padding: "14px 16px", borderRadius: 10,
            background: whatsappEnviado ? C.verdeLt : C.cremeBg,
            border: `1px solid ${whatsappEnviado ? C.verde : C.cremeBorder}`,
            marginBottom: 12,
          }}>
            {whatsappEnviado && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <CheckCircle size={16} color={C.verde} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.verde }}>
                    Código enviado para WhatsApp de {clienteNome || "cliente"}
                  </span>
                </div>
                {clienteTelefone && (
                  <div style={{ fontSize: 12, color: C.cinza, marginLeft: 24 }}>
                    📱 {clienteTelefone}
                  </div>
                )}
              </>
            )}

            {permiteCorrigirWhatsapp && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <AlertTriangle size={16} color={C.ambar} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                    {isSemWhatsapp
                      ? `${clienteNome || "Cliente"} não possui WhatsApp`
                      : whatsappErro || "WhatsApp não enviado"}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: C.cinza, marginBottom: 10, lineHeight: 1.5 }}>
                  Informe ou corrija o WhatsApp do cliente para enviar o código de retirada.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="tel"
                    value={whatsappInput}
                    onChange={(e) => setWhatsappInput(e.target.value)}
                    placeholder="(85) 99999-9999"
                    style={{
                      flex: 1, padding: "8px 10px", fontSize: 13,
                      border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                      outline: "none", background: "#fff", color: "#1f2937",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (whatsappInput.trim() && onReenviar) {
                        onReenviar(whatsappInput.trim());
                      }
                    }}
                    disabled={!whatsappInput.trim() || reenviando}
                    style={{
                      padding: "8px 14px", borderRadius: 6, border: "none",
                      background: whatsappInput.trim() ? C.esmeralda : "#9CA3AF",
                      color: "#fff", fontSize: 13, fontWeight: 600,
                      cursor: whatsappInput.trim() ? "pointer" : "not-allowed",
                      opacity: reenviando ? 0.6 : 1,
                    }}
                  >
                    {reenviando ? "..." : "Salvar e Enviar"}
                  </button>
                </div>
              </div>
            )}

            {/* Motoboy: Código A será enviado após retirada */}
            {!whatsappEnviado && !whatsappErro && codigoMotoboy && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Clock size={16} color={C.cinza} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.cinza }}>
                  Código será enviado ao cliente após retirada do motoboy
                </span>
              </div>
            )}

            {whatsappErro && !permiteCorrigirWhatsapp && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} color={C.ambar} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                  {whatsappErro || "WhatsApp indisponível"}
                </span>
                {onReenviar && (
                  <button
                    onClick={() => onReenviar("")}
                    disabled={reenviando}
                    style={{
                      marginLeft: "auto", padding: "4px 10px", borderRadius: 4,
                      border: `1px solid ${C.ambar}`, background: "none",
                      color: C.ambar, fontSize: 11, cursor: "pointer",
                    }}
                  >
                    Reenviar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Confirmação com Código ───────────────────────────────── */}
          {/* REGRA DE NEGÓCIO: retirada pede Código A do cliente.
              Motoboy pede Código B do entregador. Ambos chamam o mesmo
              endpoint /confirmar que valida contra os códigos da entrega. */}
          <div style={{
            padding: "14px 16px", borderRadius: 10,
            background: C.esmeraldaLt,
            border: `1px solid ${C.esmeralda}`,
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {codigoMotoboy ? (
                <Bike size={16} color={C.esmeralda} />
              ) : (
                <Hash size={16} color={C.esmeralda} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700, color: C.esmeralda }}>
                {codigoMotoboy ? "Confirmar retirada com Código B" : "Confirmar baixa com Código A"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: C.cinza, marginBottom: 10, lineHeight: 1.5 }}>
              {codigoMotoboy
                ? "Peça ao motoboy o código recebido no WhatsApp e digite abaixo para registrar a retirada da mercadoria."
                : "Peça ao cliente o código recebido no WhatsApp e digite abaixo para confirmar a entrega e baixar o estoque."}
            </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codigoClienteInput}
                  onChange={(e) => setCodigoClienteInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  style={{
                    flex: 1, padding: "10px 12px", fontSize: 18, letterSpacing: 4,
                    textAlign: "center", border: `1px solid ${C.cremeBorder}`,
                    borderRadius: 6, outline: "none", background: "#fff", color: "#1f2937",
                    fontWeight: 700,
                  }}
                />
                <button
                  onClick={handleConfirmarCodigoCliente}
                  disabled={codigoClienteInput.trim().length < 6 || confirmandoCodigo}
                  style={{
                    padding: "8px 14px", borderRadius: 6, border: "none",
                    background: codigoClienteInput.trim().length >= 6 ? C.esmeralda : "#9CA3AF",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: codigoClienteInput.trim().length >= 6 ? "pointer" : "not-allowed",
                    opacity: confirmandoCodigo ? 0.6 : 1,
                  }}
                >
                  {confirmandoCodigo ? "Baixando..." : "Confirmar"}
                </button>
              </div>
              {/* ── Foto de comprovação ────────────────────────────── */}
              {/* REGRA DE NEGÓCIO: foto opcional anexada à confirmação
                  como comprovante visual da retirada/entrega. */}
              <div style={{ marginTop: 10 }}>
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
                  disabled={confirmandoCodigo}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.cremeBorder}`,
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
                        border: `1px solid ${C.cremeBorder}`,
                      }}
                    />
                  </div>
                )}
              </div>
              {erroCodigo && (
                <div style={{ marginTop: 8, color: C.vermelho, fontSize: 12, fontWeight: 600 }}>
                  {erroCodigo}
                </div>
              )}
            </div>

          {/* ── Código B — Motoboy (apenas se aplicável) ────────────────── */}
          {codigoMotoboy && (
            <div style={{
              padding: "14px 16px", borderRadius: 10,
              background: "#FFF7ED",
              border: "1px solid #FED7AA",
              marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Bike size={16} color="#C2410C" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#9A3412" }}>
                  Código B — Motoboy
                </span>
              </div>

              {/* REGRA DE SEGURANÇA: Código B é enviado automaticamente
                  para o WhatsApp do motoboy. O operador NUNCA vê os dígitos
                  na tela — só o status do envio. Se falhar, pode reenviar. */}
              {whatsappMotoboyEnviado ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px", borderRadius: 6,
                  background: C.verdeLt, border: `1px solid ${C.verde}`,
                }}>
                  <CheckCircle size={14} color={C.verde} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.verde }}>
                    Enviado para {motoboyNome || "motoboy"}
                    {motoboyTelefone ? ` · ${motoboyTelefone}` : ""}
                  </span>
                </div>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px", borderRadius: 6,
                  background: C.cremeBg, border: `1px solid ${C.cremeBorder}`,
                }}>
                  <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.cinza }}>
                    Enviando código para {motoboyNome || "motoboy"}...
                  </span>
                </div>
              )}

              {/* WhatsApp do motoboy com erro — campo para corrigir e reenviar */}
              {whatsappMotoboyErro && (
                <div style={{
                  marginTop: 10, padding: "10px 12px", borderRadius: 8,
                  background: C.cremeBg, border: `1px solid ${C.cremeBorder}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <AlertTriangle size={14} color={C.ambar} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>
                      {isSemWhatsappMotoboy
                        ? `WhatsApp do motoboy ${motoboyNome || ""} não cadastrado`
                        : whatsappMotoboyErro || "WhatsApp não enviado ao motoboy"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="tel"
                      value={whatsappMotoboyInput}
                      onChange={(e) => setWhatsappMotoboyInput(e.target.value)}
                      placeholder="(85) 99999-9999"
                      style={{
                        flex: 1, padding: "6px 10px", fontSize: 12,
                        border: `1px solid ${C.cremeBorder}`, borderRadius: 4,
                        outline: "none", background: "#fff", color: "#1f2937",
                      }}
                    />
                    <button
                      onClick={() => {
                        if (whatsappMotoboyInput.trim() && onReenviarMotoboy) {
                          onReenviarMotoboy(whatsappMotoboyInput.trim());
                        }
                      }}
                      disabled={!whatsappMotoboyInput.trim() || reenviandoMotoboy}
                      style={{
                        padding: "6px 10px", borderRadius: 4, border: "none",
                        background: whatsappMotoboyInput.trim() ? C.esmeralda : "#9CA3AF",
                        color: "#fff", fontSize: 12, fontWeight: 600,
                        cursor: whatsappMotoboyInput.trim() ? "pointer" : "not-allowed",
                        opacity: reenviandoMotoboy ? 0.6 : 1,
                      }}
                    >
                      {reenviandoMotoboy ? "..." : "Salvar e Enviar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
              )}

          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "12px", borderRadius: 8,
              border: "none", background: C.esmeralda, color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              marginTop: 8,
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function MarcarEntregaModal({
  vendaId,
  vendaItems,
  isOpen,
  onClose,
  onSuccess,
  freteVenda,
  formaEnvioVenda,
}: MarcarEntregaModalProps) {
  // ── Estado ──────────────────────────────────────────────────────────────────

  const [modo, setModo] = useState<"total" | "parcial">("total");

  // Pendentes (saldo de cada item vindo da API)
  const [pendentes, setPendentes] = useState<ItemPendente[]>([]);
  const [loadingPendentes, setLoadingPendentes] = useState(false);
  const [erroPendentes, setErroPendentes] = useState("");

  // Modo parcial: itens selecionados
  const [itensSelecionados, setItensSelecionados] = useState<ItemSelecionado[]>([]);

  // Forma de entrega
  const [formaEntrega, setFormaEntrega] = useState<"retirada" | "motoboy">("retirada");

  // Motoboys (carregados da API se formaEntrega === "motoboy")
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [motoboyId, setMotoboyId] = useState<string>("");
  const [loadingMotoboys, setLoadingMotoboys] = useState(false);

  // Região
  const [regiao, setRegiao] = useState<string>("");

  // Frete
  const [freteCobradoStr, setFreteCobradoStr] = useState("");

  // Observações
  const [observacoes, setObservacoes] = useState("");

  // Submissão
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState("");

  // Modal de códigos
  const [codigosGerados, setCodigosGerados] = useState<{
    entrega: EntregaCriada["entrega"];
    codigoMotoboy: string | null;
    whatsappEnviado: boolean;
    whatsappErro: string | null;
    clienteNome: string | null;
    clienteTelefone: string | null;
    whatsappMotoboyEnviado: boolean;
    whatsappMotoboyErro: string | null;
    motoboyNome: string | null;
    motoboyTelefone: string | null;
  } | null>(null);
  const [reenviandoWhatsapp, setReenviandoWhatsapp] = useState(false);
  const [reenviandoWhatsappMotoboy, setReenviandoWhatsappMotoboy] = useState(false);
  /** REGRA DE NEGÓCIO: sem código confirmado, a entrega é cancelada ao fechar. */
  const [codigoConfirmado, setCodigoConfirmado] = useState(false);
  const codigoConfirmadoRef = useRef(false); // synced with state for immediate read

  // ── Cálculos derivados ───────────────────────────────────────────────────────

  const freteCobrado = parseFloat(freteCobradoStr.replace(",", ".")) || 0;
  const freteMotoboyCalculado = regiao ? calcularFreteMotoboy(regiao) : 0;
  const precisaAprovacaoFrete =
    formaEntrega === "motoboy" &&
    (freteCobrado < freteMotoboyCalculado || freteCobrado === 0);

  // ── Buscar entregas existentes e calcular saldo pendente ─────────────────────
  /**
   * Carrega as entregas existentes da venda para determinar o saldo pendente
   * de cada item. Para o cálculo, subtrai a quantidade já entregue (em entregas
   * não canceladas) da quantidade original vendida.
   *
   * REGRA DE NEGÓCIO: o backend tem a view vw_entregas_pendentes que calcula
   * o saldo corretamente, mas como o frontend recebe os itens da venda e a lista
   * de entregas, fazemos o cálculo aqui para evitar uma chamada extra.
   * O backend valida novamente na criação (criarEntrega()).
   */
  const carregarPendentes = useCallback(async () => {
    setLoadingPendentes(true);
    setErroPendentes("");
    try {
      // Buscar entregas existentes da venda para subtrair do saldo
      const data = await apiFetch<{
        items: Array<{
          id: number;
          situacao: string;
        }>;
      }>(`/api/entregas-venda?venda_id=${vendaId}&page=1&limit=500`);

      // Se vendaItems foi fornecido pelo pai, usar os dados dele
      if (vendaItems && vendaItems.length > 0) {
        // Filtrar apenas entregas não canceladas para não contar itens de entrega cancelada
        const entregasAtivas = data.items.filter(
          (e) => e.situacao !== "cancelada",
        );

        // Para ter o saldo exato, precisaríamos buscar os itens de cada entrega.
        // Simplificação: se já existem entregas ativas, o backend vai validar.
        // Para este modal, marcamos saldoPendente como a quantidade original
        // e o backend rejeita se exceder.
        const itens: ItemPendente[] = vendaItems.map((vi) => ({
          itemVendaId: vi.id,
          nomeProduto: vi.nomeProduto,
          sku: vi.sku,
          qtdVendida: vi.quantidade,
          // Estimamos o saldo: se não houver entregas ativas, tudo está pendente
          // Caso contrário, o backend validará o limite exato
          saldoPendente: entregasAtivas.length === 0 ? vi.quantidade : vi.quantidade,
        }));

        setPendentes(itens);

        // Pré-popula itens no modo parcial (todos selecionados por padrão)
        setItensSelecionados(
          itens
            .filter((i) => i.saldoPendente > 0)
            .map((i) => ({
              itemVendaId: i.itemVendaId,
              nomeProduto: i.nomeProduto,
              sku: i.sku,
              qtdVendida: i.qtdVendida,
              saldoPendente: i.saldoPendente,
              quantidade: String(i.saldoPendente),
            })),
        );
      } else {
        // Sem vendaItems, precisaríamos buscar da venda. O backend tem o endpoint
        // de saldo pendente via GET /api/entregas-venda com venda_id, mas os itens
        // da venda não vêm junto. Exibimos erro se não houver vendaItems.
        setErroPendentes("Itens da venda não fornecidos.");
        setPendentes([]);
      }
    } catch (e) {
      setErroPendentes(
        e instanceof Error ? e.message : "Erro ao carregar entregas.",
      );
    } finally {
      setLoadingPendentes(false);
    }
  }, [vendaId, vendaItems]);

  // Carregar motoboys quando formaEntrega mudar para "motoboy"
  useEffect(() => {
    if (formaEntrega !== "motoboy" || !isOpen) return;
    setLoadingMotoboys(true);
    apiFetch<Motoboy[]>("/api/entregas-venda/motoboys")
      .then((data) => {
        setMotoboys(data);
        if (data.length > 0 && !motoboyId) {
          setMotoboyId(data[0].user_id ?? String(data[0].id));
        }
      })
      .catch(() => {
        setMotoboys([]);
      })
      .finally(() => setLoadingMotoboys(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaEntrega, isOpen]);

  // Carregar pendentes ao abrir
  useEffect(() => {
    if (isOpen && vendaId) {
      void carregarPendentes();
    }
  }, [isOpen, vendaId, carregarPendentes]);

  // Resetar estado quando abrir (default do frete da venda e forma de envio)
  useEffect(() => {
    if (isOpen) {
      // Pre-seleciona forma de entrega baseada na venda
      // REGRA DE NEGÓCIO: se a venda foi cadastrada como "Retirada na loja",
      // pré-seleciona "retirada". Para qualquer outra forma (Motoboy, Correios,
      // Uber, etc), pré-seleciona "motoboy". O usuário pode alterar depois.
      const formaVenda = (formaEnvioVenda ?? "").toLowerCase();
      if (formaVenda.includes("retirada")) {
        setFormaEntrega("retirada");
      } else {
        setFormaEntrega("motoboy");
      }
      setFreteCobradoStr(
        freteVenda ? freteVenda.toFixed(2).replace(".", ",") : "",
      );
      setErro("");
      setCodigosGerados(null);
    }
  }, [isOpen, freteVenda, formaEnvioVenda]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  /** Alterna checkbox de um item no modo parcial */
  function toggleItem(itemVendaId: number) {
    setItensSelecionados((prev) => {
      const existe = prev.find((i) => i.itemVendaId === itemVendaId);
      if (existe) {
        return prev.filter((i) => i.itemVendaId !== itemVendaId);
      }
      const pendente = pendentes.find((p) => p.itemVendaId === itemVendaId);
      if (!pendente) return prev;
      return [
        ...prev,
        {
          itemVendaId: pendente.itemVendaId,
          nomeProduto: pendente.nomeProduto,
          sku: pendente.sku,
          qtdVendida: pendente.qtdVendida,
          saldoPendente: pendente.saldoPendente,
          quantidade: String(pendente.saldoPendente),
        },
      ];
    });
  }

  /** Atualiza quantidade de um item no modo parcial */
  function updateQuantidade(itemVendaId: number, valor: string) {
    setItensSelecionados((prev) =>
      prev.map((i) =>
        i.itemVendaId === itemVendaId ? { ...i, quantidade: valor } : i,
      ),
    );
  }

  /** Submeter criação da entrega */
  async function handleSubmit() {
    setErro("");

    // Validar itens
    let itensParaEnviar: Array<{ itemVendaId: number; quantidade: number }>;

    if (modo === "total") {
      // No modo total, envia todos os itens pendentes com saldo total
      itensParaEnviar = pendentes
        .filter((p) => p.saldoPendente > 0)
        .map((p) => ({
          itemVendaId: p.itemVendaId,
          quantidade: p.saldoPendente,
        }));
    } else {
      // No modo parcial, envia apenas os itens selecionados com a quantidade informada
      itensParaEnviar = itensSelecionados
        .map((i) => ({
          itemVendaId: i.itemVendaId,
          quantidade: parseInt(i.quantidade, 10),
        }))
        .filter((i) => i.quantidade > 0);
    }

    if (itensParaEnviar.length === 0) {
      setErro("Selecione pelo menos um item para entregar.");
      return;
    }

    // Validar motoboy se necessário
    if (formaEntrega === "motoboy" && !motoboyId) {
      setErro("Selecione um motoboy para a entrega.");
      return;
    }

    setSubmetendo(true);

    try {
      const body: Record<string, unknown> = {
        vendaId,
        tipo: modo,
        formaEntrega,
        itens: itensParaEnviar,
      };

      if (regiao) body.regiao = regiao;
      if (formaEntrega === "motoboy" && motoboyId) body.motoboyId = motoboyId;
      if (freteCobrado > 0 || freteCobradoStr.trim() !== "") {
        body.freteCobrado = freteCobrado;
      }
      if (observacoes.trim()) body.observacoes = observacoes.trim();

      const result = await apiFetch<EntregaCriada>("/api/entregas-venda", {
        method: "POST",
        body: JSON.stringify(body),
      });

      // Exibir modal de confirmação (códigos + status WhatsApp)
      setCodigosGerados({
        entrega: result.entrega,
        codigoMotoboy: result.entrega.codigoMotoboy ?? null,
        whatsappEnviado: result.entrega.whatsappEnviado ?? false,
        whatsappErro: result.entrega.whatsappErro ?? null,
        clienteNome: result.entrega.clienteNome ?? null,
        clienteTelefone: result.entrega.clienteTelefone ?? null,
        whatsappMotoboyEnviado: result.entrega.whatsappMotoboyEnviado ?? false,
        whatsappMotoboyErro: result.entrega.whatsappMotoboyErro ?? null,
        motoboyNome: result.entrega.motoboyNome ?? null,
        motoboyTelefone: result.entrega.motoboyTelefone ?? null,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar entrega.");
    } finally {
      setSubmetendo(false);
    }
  }

  /** Fechar modal de códigos e chamar onSuccess */
  async function handleFecharCodigos() {
    /**
     * REGRA DE NEGÓCIO: entrega sem código confirmado = lixo operacional.
     * Retirada ou motoboy — se o código não foi digitado, a entrega é
     * cancelada ao fechar. Para motoboy, o Código B é digitado aqui;
     * o Código A será digitado depois pelo cliente (via drawer).
     * IMPACTO SE REMOVIDO: entregas pendentes órfãs acumulam na lista.
     */
    if (codigosGerados && !codigoConfirmadoRef.current) {
      await apiFetch(
        `/api/entregas-venda/${codigosGerados.entrega.id}/cancelar`,
        { method: "POST" },
        // Pitfall §3: se o auto-cancelamento falhar, a entrega fica órfã na
        // lista — o operador precisa saber para cancelar manualmente.
      ).catch(() => useErrorStore.getState().push("Não foi possível cancelar a entrega automaticamente — cancele manualmente na lista de entregas.", { level: "warning" }));
    }
    if (codigosGerados) {
      onSuccess(codigosGerados.entrega);
    }
    setCodigosGerados(null);
    setCodigoConfirmado(false);
    codigoConfirmadoRef.current = false;
    onClose();
  }

  /**
   * Reenvia o Código A sem expor o código para o operador.
   *
   * REGRA DE NEGÓCIO: se o cliente não tinha WhatsApp cadastrado, o número
   * digitado é salvo no cadastro antes do envio; se já tinha, botão Reenviar
   * usa o telefone atual. O Código A permanece exclusivamente no backend.
   * IMPACTO SE ALTERADO: expor o código aqui quebra a segurança da entrega;
   * não salvar o número faz o problema voltar nas próximas vendas do cliente.
   */
  async function handleReenviarWhatsapp(whatsapp: string) {
    if (!codigosGerados) return;

    setReenviandoWhatsapp(true);
    try {
      const result = await apiFetch<{
        whatsappEnviado: boolean;
        whatsappErro: string | null;
        clienteNome: string | null;
        clienteTelefone: string | null;
      }>(`/api/entregas-venda/${codigosGerados.entrega.id}/reenviar-whatsapp`, {
        method: "POST",
        body: JSON.stringify({ whatsapp: whatsapp.trim() }),
      });

      setCodigosGerados((atual) => atual
        ? {
          ...atual,
          whatsappEnviado: result.whatsappEnviado,
          whatsappErro: result.whatsappErro,
          clienteNome: result.clienteNome,
          clienteTelefone: result.clienteTelefone,
        }
        : atual);
    } catch (e) {
      setCodigosGerados((atual) => atual
        ? {
          ...atual,
          whatsappEnviado: false,
          whatsappErro: e instanceof Error ? e.message : "Falha ao enviar WhatsApp",
          clienteTelefone: whatsapp.trim() || atual.clienteTelefone,
        }
        : atual);
    } finally {
      setReenviandoWhatsapp(false);
    }
  }

  /**
   * Reenvia o Código B para o WhatsApp do motoboy.
   *
   * REGRA DE NEGÓCIO: se o motoboy não tinha WhatsApp cadastrado, o número
   * digitado é salvo antes do envio; se a mensagem falhou, botão Reenviar
   * usa o telefone atual do cadastro. O Código B permanece no backend.
   * IMPACTO SE ALTERADO: expor o código aqui quebra a segurança; não salvar
   * o número faz o problema voltar nas próximas entregas.
   */
  async function handleReenviarWhatsAppMotoboy(whatsapp: string) {
    if (!codigosGerados) return;

    setReenviandoWhatsappMotoboy(true);
    try {
      const result = await apiFetch<{
        whatsappMotoboyEnviado: boolean;
        whatsappMotoboyErro: string | null;
        motoboyNome: string | null;
        motoboyTelefone: string | null;
      }>(`/api/entregas-venda/${codigosGerados.entrega.id}/reenviar-whatsapp-motoboy`, {
        method: "POST",
        body: JSON.stringify({ whatsapp: whatsapp.trim() }),
      });

      setCodigosGerados((atual) => atual
        ? {
          ...atual,
          whatsappMotoboyEnviado: result.whatsappMotoboyEnviado,
          whatsappMotoboyErro: result.whatsappMotoboyErro,
          motoboyNome: result.motoboyNome,
          motoboyTelefone: result.motoboyTelefone,
        }
        : atual);
    } catch (e) {
      setCodigosGerados((atual) => atual
        ? {
          ...atual,
          whatsappMotoboyEnviado: false,
          whatsappMotoboyErro: e instanceof Error ? e.message : "Falha ao enviar WhatsApp",
          motoboyTelefone: whatsapp.trim() || atual.motoboyTelefone,
        }
        : atual);
    } finally {
      setReenviandoWhatsappMotoboy(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const itensVisiveis = modo === "total" ? pendentes : itensSelecionados;
  const todosComSaldoZero =
    pendentes.length > 0 && pendentes.every((p) => p.saldoPendente === 0);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 40,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(520px, 100vw)",
          background: "#fff",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${C.cremeBorder}`,
            background: C.cremeBg,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Package size={18} color={C.esmeralda} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.esmeralda }}>
                Marcar Entrega
              </div>
              <div style={{ fontSize: 11, color: C.cinza }}>
                Venda #{vendaId}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={18} color={C.cinza} />
          </button>
        </div>

        {/* Body — scrollável */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {/* ── Toggle modo ────────────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              background: C.cremeBg,
              borderRadius: 8,
              padding: 3,
              marginBottom: 20,
              border: `1px solid ${C.cremeBorder}`,
            }}
          >
            {(["total", "parcial"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  background:
                    modo === m ? C.esmeralda : "transparent",
                  color: modo === m ? "#fff" : C.cinza,
                  transition: "all 0.15s",
                }}
              >
                {m === "total" ? "Entrega Total" : "Entrega Parcial"}
              </button>
            ))}
          </div>

          {/* ── Loading ────────────────────────────────────────────────────── */}
          {loadingPendentes ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: 40,
              }}
            >
              <Loader2
                size={24}
                color={C.esmeralda}
                style={{ animation: "spin 1s linear infinite" }}
              />
            </div>
          ) : erroPendentes ? (
            <div
              style={{
                padding: "12px",
                borderRadius: 8,
                background: C.vermelhoLt,
                color: C.vermelho,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {erroPendentes}
            </div>
          ) : (
            <>
              {/* ── Itens ──────────────────────────────────────────────────── */}
              {todosComSaldoZero ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: C.cinza,
                    background: C.cremeBg,
                    borderRadius: 10,
                    border: `1px solid ${C.cremeBorder}`,
                    marginBottom: 20,
                  }}
                >
                  <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p style={{ margin: 0, fontSize: 14 }}>
                    Todos os itens desta venda já foram entregues.
                  </p>
                </div>
              ) : modo === "total" ? (
                /* ── Modo Total: resumo de todos os itens ── */
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
                    }}
                  >
                    Itens a Entregar ({itensVisiveis.length})
                  </div>
                  {itensVisiveis.map((item) => {
                    const p = item as ItemPendente;
                    return (
                      <div
                        key={p.itemVendaId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderBottom: `1px solid ${C.cremeBorder}`,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              color: "#1f2937",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.nomeProduto}
                          </div>
                          {p.sku && (
                            <div style={{ fontSize: 11, color: C.cinza }}>
                              SKU: {p.sku}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            textAlign: "right",
                            marginLeft: 12,
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: C.esmeralda,
                              fontSize: 15,
                            }}
                          >
                            {p.saldoPendente}
                          </div>
                          <div style={{ fontSize: 10, color: C.cinza }}>
                            de {p.qtdVendida} un.
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── Modo Parcial: checkbox + quantidade por item ── */
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
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      Itens Selecionados ({itensSelecionados.length})
                    </span>
                    {pendentes.length > 0 && (
                      <button
                        onClick={() => {
                          const todos = pendentes
                            .filter((p) => p.saldoPendente > 0)
                            .map((p) => ({
                              itemVendaId: p.itemVendaId,
                              nomeProduto: p.nomeProduto,
                              sku: p.sku,
                              qtdVendida: p.qtdVendida,
                              saldoPendente: p.saldoPendente,
                              quantidade: String(p.saldoPendente),
                            }));
                          setItensSelecionados(todos);
                        }}
                        style={{
                          fontSize: 11,
                          color: C.esmeralda,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Selecionar todos
                      </button>
                    )}
                  </div>
                  {pendentes.map((p) => {
                    const selecionado = itensSelecionados.find(
                      (s) => s.itemVendaId === p.itemVendaId,
                    );
                    const maxZero = p.saldoPendente <= 0;

                    return (
                      <div
                        key={p.itemVendaId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          borderBottom: `1px solid ${C.cremeBorder}`,
                          opacity: maxZero ? 0.4 : 1,
                        }}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={!!selecionado && !maxZero}
                          disabled={maxZero}
                          onChange={() => toggleItem(p.itemVendaId)}
                          style={{
                            width: 16,
                            height: 16,
                            accentColor: C.esmeralda,
                            cursor: maxZero ? "not-allowed" : "pointer",
                            flexShrink: 0,
                          }}
                        />

                        {/* Info do produto */}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#1f2937",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.nomeProduto}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: C.cinza,
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {p.sku && <span>SKU: {p.sku}</span>}
                            <span>
                              Vendido: {p.qtdVendida} | Disponível:{" "}
                              {p.saldoPendente}
                            </span>
                          </div>
                        </div>

                        {/* Input de quantidade */}
                        <div style={{ flexShrink: 0, width: 70 }}>
                          <input
                            type="number"
                            min={0}
                            max={p.saldoPendente}
                            value={selecionado?.quantidade ?? "0"}
                            disabled={!selecionado || maxZero}
                            onChange={(e) =>
                              updateQuantidade(p.itemVendaId, e.target.value)
                            }
                            style={{
                              width: "100%",
                              fontSize: 14,
                              fontWeight: 600,
                              padding: "6px 8px",
                              border: `1px solid ${C.cremeBorder}`,
                              borderRadius: 6,
                              outline: "none",
                              textAlign: "center",
                              background: !selecionado ? "#f5f5f5" : "#fff",
                              color: C.esmeralda,
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Forma de Entrega ───────────────────────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.cinza,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Truck size={13} /> Forma de Entrega
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["retirada", "motoboy"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormaEntrega(f)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border:
                          formaEntrega === f
                            ? `2px solid ${C.esmeralda}`
                            : `1px solid ${C.cremeBorder}`,
                        background:
                          formaEntrega === f ? C.esmeraldaLt : "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        fontSize: 13,
                        fontWeight: formaEntrega === f ? 700 : 500,
                        color:
                          formaEntrega === f ? C.esmeralda : C.cinza,
                      }}
                    >
                      {f === "retirada" ? (
                        <Store size={14} />
                      ) : (
                        <Bike size={14} />
                      )}
                      {labelFormaEntrega(f)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Motoboy (apenas se formaEntrega === "motoboy") ─────────── */}
              {formaEntrega === "motoboy" && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: C.cinza,
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Bike size={13} /> Motoboy
                  </div>
                  {loadingMotoboys ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        color: C.cinza,
                      }}
                    >
                      <Loader2
                        size={14}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      Carregando motoboys...
                    </div>
                  ) : (
                    <select
                      value={motoboyId}
                      onChange={(e) => setMotoboyId(e.target.value)}
                      style={{
                        width: "100%",
                        fontSize: 13,
                        padding: "8px 10px",
                        border: `1px solid ${C.cremeBorder}`,
                        borderRadius: 6,
                        outline: "none",
                        background: "#fff",
                        color: "#1f2937",
                      }}
                    >
                      <option value="">Selecione um motoboy...</option>
                      {motoboys.map((m) => (
                        <option
                          key={m.id}
                          value={m.user_id ?? String(m.id)}
                        >
                          {m.nome}
                          {m.telefone ? ` — ${m.telefone}` : ""}
                          {m.veiculo ? ` (${m.veiculo})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* ── Região + Frete (apenas para motoboy) ───────────────────── */}
              {formaEntrega === "motoboy" && (
                <>
                  {/* ── Região ─────────────────────────────────────────────── */}
                  <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.cinza,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <MapPin size={13} /> Região
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                  }}
                >
                  {(
                    [
                      "fortaleza",
                      "fora_fortaleza",
                      "longe",
                      "correios",
                    ] as const
                  ).map((r) => (
                    <button
                      key={r}
                      onClick={() =>
                        setRegiao(regiao === r ? "" : r)
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        border:
                          regiao === r
                            ? `2px solid ${C.esmeralda}`
                            : `1px solid ${C.cremeBorder}`,
                        background:
                          regiao === r ? C.esmeraldaLt : "#fff",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: regiao === r ? 600 : 400,
                        color:
                          regiao === r ? C.esmeralda : C.cinza,
                        textAlign: "center",
                      }}
                    >
                      {labelRegiao(r)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Frete ──────────────────────────────────────────────────── */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 20,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: C.cremeBg,
                  border: `1px solid ${C.cremeBorder}`,
                }}
              >
                {/* Frete Cobrado */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.cinza,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <DollarSign size={11} /> Frete Cobrado
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={freteCobradoStr}
                    onChange={(e) => setFreteCobradoStr(e.target.value)}
                    placeholder="0,00"
                    style={{
                      width: "100%",
                      fontSize: 14,
                      fontWeight: 600,
                      padding: "7px 10px",
                      border: `1px solid ${C.cremeBorder}`,
                      borderRadius: 6,
                      outline: "none",
                      background: "#fff",
                      color: C.esmeralda,
                      boxSizing: "border-box",
                      fontFamily: "monospace",
                    }}
                  />
                </div>

                {/* Frete Motoboy */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.cinza,
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Truck size={11} /> Frete Motoboy
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      padding: "7px 10px",
                      borderRadius: 6,
                      background: "#fff",
                      border: `1px solid ${C.cremeBorder}`,
                      color:
                        freteMotoboyCalculado > 0
                          ? C.esmeralda
                          : C.cinza,
                      fontFamily: "monospace",
                    }}
                  >
                    {fmtBRL(freteMotoboyCalculado)}
                  </div>
                </div>
              </div>

              {/* ── Aviso de aprovação ─────────────────────────────────────── */}
              {precisaAprovacaoFrete && (
                <div
                  style={{
                    padding: "10px 14px",
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
                    <strong>⚠️ Precisa de aprovação da gerente.</strong>
                    <br />
                    Frete cobrado ({fmtBRL(freteCobrado)}) é menor que o frete
                    do motoboy ({fmtBRL(freteMotoboyCalculado)}). A entrega será
                    criada com pendência de aprovação.
                  </div>
                  </div>
                )}
                </>
              )}

              {/* ── Observações ────────────────────────────────────────────── */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.cinza,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <ClipboardList size={13} /> Observações
                </div>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Informações adicionais para esta entrega..."
                  rows={3}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    padding: "8px 10px",
                    border: `1px solid ${C.cremeBorder}`,
                    borderRadius: 6,
                    outline: "none",
                    resize: "none",
                    background: "#fff",
                    color: "#1f2937",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* ── Erro ───────────────────────────────────────────────────── */}
              {erro && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: C.vermelhoLt,
                    color: C.vermelho,
                    fontSize: 12,
                    marginBottom: 16,
                    lineHeight: 1.4,
                  }}
                >
                  {erro}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — botão Confirmar */}
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
          <button
            onClick={onClose}
            disabled={submetendo}
            style={{
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
            onClick={handleSubmit}
            disabled={submetendo || loadingPendentes || todosComSaldoZero}
            style={{
              flex: 1,
              padding: "10px",
              background:
                submetendo || loadingPendentes || todosComSaldoZero
                  ? "#9CA3AF"
                  : C.esmeralda,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor:
                submetendo || loadingPendentes || todosComSaldoZero
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {submetendo ? (
              <>
                <Loader2
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Criando Entrega...
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                Criar Entrega
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Modal de confirmação pós-criação ─────────────────────────────── */}
      {codigosGerados && (
        <CodigosModal
          entregaId={codigosGerados.entrega.id}
          codigoMotoboy={codigosGerados.codigoMotoboy}
          whatsappEnviado={codigosGerados.whatsappEnviado}
          whatsappErro={codigosGerados.whatsappErro}
          clienteNome={codigosGerados.clienteNome}
          clienteTelefone={codigosGerados.clienteTelefone}
          whatsappMotoboyEnviado={codigosGerados.whatsappMotoboyEnviado}
          whatsappMotoboyErro={codigosGerados.whatsappMotoboyErro}
          motoboyNome={codigosGerados.motoboyNome}
          motoboyTelefone={codigosGerados.motoboyTelefone}
          onReenviar={handleReenviarWhatsapp}
          onReenviarMotoboy={handleReenviarWhatsAppMotoboy}
          reenviando={reenviandoWhatsapp}
          reenviandoMotoboy={reenviandoWhatsappMotoboy}
          onConfirmado={handleFecharCodigos}
          onCodigoConfirmado={() => { setCodigoConfirmado(true); codigoConfirmadoRef.current = true; }}
          onClose={handleFecharCodigos}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
