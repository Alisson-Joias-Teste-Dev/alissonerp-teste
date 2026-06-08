"use client";

/**
 * EntregaDetalheDrawer — Painel lateral com detalhes completos de uma entrega.
 *
 * REGRA DE NEGÓCIO: exibe todas as informações de uma entrega: cabeçalho,
 * timeline de eventos, itens entregues, dados de transporte, códigos de
 * verificação, rastreio dos Correios e ações disponíveis conforme a situação.
 *
 * Ações disponíveis:
 *   - Pendente + retirada: "Confirmar Retirada" → usa código A do cliente
 *   - Pendente + motoboy + sem data_saida: "Registrar Saída" → usa código B do motoboy
 *   - Pendente: "Cancelar Entrega" → confirmação + POST cancelar
 *   - "Informar Correios" → abre CorreiosRastreioModal
 *
 * O QUE: busca GET /api/entregas-venda/[id], renderiza seções organizadas,
 * e dispara sub-modais (ConfirmarEntregaModal, CorreiosRastreioModal) conforme
 * ações do usuário.
 *
 * IMPACTO SE ALTERADO: o drawer é o ponto central de visualização de entregas.
 * Alterar a estrutura das seções ou as condições das ações pode quebrar
 * a operação de logística e confirmação de entregas.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  X,
  Loader2,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  Bike,
  ClipboardList,
  Hash,
  History,
  User,
  ExternalLink,
  ArrowRight,
  Store,
  Ban,
  Eye,
  EyeOff,
  Send,
  Camera,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import ConfirmarEntregaModal from "./ConfirmarEntregaModal";
import CorreiosRastreioModal from "./CorreiosRastreioModal";

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

/** Estrutura completa retornada por GET /api/entregas-venda/[id] */
interface EntregaDetalhe {
  id: number;
  venda_id: number;
  codigo_entrega: string;
  codigo_cliente: string;
  codigo_motoboy: string | null;
  tipo: string;
  forma_entrega: string;
  situacao: string;
  regiao: string | null;
  motoboy_id: string | null;
  frete_cobrado: number;
  frete_motoboy: number;
  aprovacao_frete_necessaria: boolean;
  data_saida: string | null;
  data_retirada: string | null;
  data_entrega_realizada: string | null;
  data_entrega_prevista: string | null;
  correios_rastreio: string | null;
  correios_data_postagem: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
  foto_entrega_path: string | null;
  numero_venda: string | null;
  total_venda: number | null;
  venda_situacao: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  vendedor_id: number | null;
  endereco_entrega: string | null;
  endereco_entrega_numero: string | null;
  endereco_entrega_complemento: string | null;
  endereco_entrega_bairro: string | null;
  endereco_entrega_cidade: string | null;
  endereco_entrega_cep: string | null;
  endereco_entrega_uf: string | null;
  cliente_endereco: string | null;
  cliente_numero: string | null;
  cliente_complemento: string | null;
  cliente_bairro: string | null;
  cliente_municipio: string | null;
  cliente_cep: string | null;
  cliente_uf: string | null;
  motoboy_nome: string | null;
  motoboy_telefone: string | null;
  criado_por_nome: string | null;
  confirmado_motoboy_retirada_nome: string | null;
  confirmado_retirada_nome: string | null;
  confirmado_motoboy_entrega_nome: string | null;
  itens: Array<{
    id: number;
    entrega_id: number;
    item_venda_id: number;
    quantidade: number;
    baixa_estoque_realizada: boolean;
    nome_produto: string;
    sku: string;
  }>;
  itens_count: number;
}

// ── Props ───────────────────────────────────────────────────────────────────────

interface EntregaDetalheDrawerProps {
  entregaId: number | null;
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

function fmtDtHr(s: string | null) {
  if (!s) return null;
  return new Date(s).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Label amigável para a região */
function labelRegiao(regiao: string | null): string {
  switch (regiao) {
    case "fortaleza":
      return "Fortaleza";
    case "fora_fortaleza":
      return "Fora Fortaleza";
    case "longe":
      return "Muito Longe";
    case "correios":
      return "Correios";
    default:
      return regiao ?? "—";
  }
}

/** Label amigável para forma de entrega */
function labelForma(f: string): string {
  return f === "retirada" ? "Retirada na Loja" : "Motoboy";
}

/** Label amigável para tipo */
function labelTipo(t: string): string {
  return t === "total" ? "Total" : "Parcial";
}

/** Badge de status */
function statusBadge(situacao: string) {
  switch (situacao) {
    case "pendente":
      return { text: "Pendente", color: C.ambar, bg: C.ambarLt };
    case "confirmada":
      return { text: "Confirmada", color: C.verde, bg: C.verdeLt };
    case "cancelada":
      return { text: "Cancelada", color: C.vermelho, bg: C.vermelhoLt };
    default:
      return { text: situacao, color: C.cinza, bg: C.cremeBg };
  }
}

/** Máscara parcial de código: mostra últimos 3 dígitos */
function mascaraCodigo(codigo: string | null): string {
  if (!codigo) return "—";
  if (codigo.length <= 3) return codigo;
  return "•••" + codigo.slice(-3);
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function EntregaDetalheDrawer({
  entregaId,
  isOpen,
  onClose,
  userRole = "",
}: EntregaDetalheDrawerProps) {
  // ── Estado ──────────────────────────────────────────────────────────────────

  const [detalhe, setDetalhe] = useState<EntregaDetalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // Sub-modais
  const [modalConfirmar, setModalConfirmar] = useState<{
    entregaId: number;
    tipo: "codigo_motoboy" | "codigo_cliente";
    aberto: boolean;
  }>({ entregaId: 0, tipo: "codigo_cliente", aberto: false });

  const [modalCorreios, setModalCorreios] = useState(false);

  // Cancelamento
  const [cancelando, setCancelando] = useState(false);
  const [mostrarCancelarConfirm, setMostrarCancelarConfirm] = useState(false);

  // Toggle visibilidade dos códigos (mascarados → completos)
  const [mostrarCodigos, setMostrarCodigos] = useState(false);

  // REGRA DE SEGURANÇA: apenas admin e desenvolvedor podem ver
  // os códigos completos. Demais roles veem sempre mascarado.
  const podeVerCodigos = userRole === "desenvolvedor" || userRole === "admin";

  // ── Carregar detalhe ────────────────────────────────────────────────────────

  const carregar = useCallback(async () => {
    if (!entregaId) return;
    setLoading(true);
    setErro("");
    try {
      const data = await apiFetch<EntregaDetalhe>(
        `/api/entregas-venda/${entregaId}`,
      );
      setDetalhe(data);
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
      setDetalhe(null);
      setErro("");
      setMostrarCodigos(false);
      setMostrarCancelarConfirm(false);
    }
  }, [isOpen, entregaId, carregar]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Confirmar retirada (código A) ou registrar saída (código B) */
  function abrirConfirmar(tipo: "codigo_motoboy" | "codigo_cliente") {
    if (!entregaId) return;
    setModalConfirmar({ entregaId, tipo, aberto: true });
  }

  /** Cancelar entrega */
  async function handleCancelar() {
    if (!entregaId) return;
    setCancelando(true);
    try {
      await apiFetch(`/api/entregas-venda/${entregaId}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ motivo: "Cancelado pelo operador" }),
      });
      setMostrarCancelarConfirm(false);
      await carregar();
    } catch (e) {
      alert(
        e instanceof Error ? e.message : "Erro ao cancelar entrega.",
      );
    } finally {
      setCancelando(false);
    }
  }

  /** Callback após confirmação ou rastreio bem-sucedidos */
  function handleRefresh() {
    void carregar();
  }

  // ── Estados derivados ───────────────────────────────────────────────────────

  const status = detalhe ? statusBadge(detalhe.situacao) : null;
  const isPendente = detalhe?.situacao === "pendente";
  const isConfirmada = detalhe?.situacao === "confirmada";
  const isCancelada = detalhe?.situacao === "cancelada";
  const isRetirada = detalhe?.forma_entrega === "retirada";
  const isMotoboy = detalhe?.forma_entrega === "motoboy";

  // Ações disponíveis
  const podeConfirmarRetirada =
    isPendente && isRetirada;
  const podeRegistrarSaida =
    isPendente && isMotoboy && !detalhe?.data_saida;
  const podeCancelar = isPendente;
  const podeInformarCorreios =
    !isCancelada;
  const podeConfirmarEntregaCliente =
    isPendente && isMotoboy && !!detalhe?.data_saida;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

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

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw)",
          background: "#fff",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${C.cremeBorder}`,
            background: C.cremeBg,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Package size={18} color={C.esmeralda} />
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: C.esmeralda,
                }}
              >
                Detalhe da Entrega
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

        {/* ── Body ────────────────────────────────────────────────────────── */}
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flex: 1,
            }}
          >
            <Loader2
              size={24}
              color={C.esmeralda}
              style={{ animation: "spin 1s linear infinite" }}
            />
          </div>
        ) : erro && !detalhe ? (
          <div
            style={{
              padding: 24,
              color: C.vermelho,
              textAlign: "center",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <AlertTriangle size={28} color={C.vermelho} />
            <div style={{ fontSize: 14 }}>{erro}</div>
          </div>
        ) : detalhe ? (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "16px 20px",
            }}
          >
            {/* ── Cabeçalho ──────────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.esmeralda,
                    fontFamily: "monospace",
                  }}
                >
                  {detalhe.codigo_entrega}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.cinza,
                    marginTop: 2,
                  }}
                >
                  Criada em {fmtDtHr(detalhe.created_at)}
                </div>
              </div>
              {status && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 12px",
                    borderRadius: 20,
                    background: status.bg,
                    color: status.color,
                  }}
                >
                  {status.text}
                </span>
              )}
            </div>

            {/* ── Info rápida ────────────────────────────────────────────── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 16,
                background: C.cremeBg,
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.cinza,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 3,
                  }}
                >
                  Tipo
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>
                  {labelTipo(detalhe.tipo)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.cinza,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 3,
                  }}
                >
                  Forma
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1f2937",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {isRetirada ? (
                    <Store size={12} />
                  ) : (
                    <Bike size={12} />
                  )}
                  {labelForma(detalhe.forma_entrega)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.cinza,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 3,
                  }}
                >
                  Venda
                </div>
                <a
                  href={`/vendas/${detalhe.venda_id}`}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.esmeralda,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {detalhe.numero_venda ?? `#${detalhe.venda_id}`}
                  <ExternalLink size={11} />
                </a>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.cinza,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 3,
                  }}
                >
                  Cliente
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>
                  {detalhe.cliente_nome ?? "—"}
                </div>
              </div>
            </div>

            {/* ── Endereço de Entrega (apenas motoboy) ─────────────────────── */}
            {/* REGRA DE NEGÓCIO: endereço de entrega é crítico para o motoboy.
                A venda pode ter um endereço diferente do cadastro do cliente.
                Exibido com destaque para o entregador não errar a rota. */}
            {detalhe.forma_entrega === "motoboy" && (
              <div style={{
                padding: "12px 14px", borderRadius: 8,
                background: "#FFF7ED", border: "1px solid #FED7AA",
                marginBottom: 16,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: "#9A3412",
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <MapPin size={12} /> Endereço de Entrega
                </div>
                {(detalhe.endereco_entrega || detalhe.endereco_entrega_bairro ||
                  detalhe.cliente_endereco || detalhe.cliente_bairro) ? (
                  (() => {
                    // REGRA DE NEGÓCIO: prioriza endereço da venda. Se vazio,
                    // usa o cadastro do cliente como fallback.
                    const rua = detalhe.endereco_entrega || detalhe.cliente_endereco;
                    const num = detalhe.endereco_entrega_numero || detalhe.cliente_numero;
                    const comp = detalhe.endereco_entrega_complemento || detalhe.cliente_complemento;
                    const bairro = detalhe.endereco_entrega_bairro || detalhe.cliente_bairro;
                    const cidade = detalhe.endereco_entrega_cidade || detalhe.cliente_municipio;
                    const uf = detalhe.endereco_entrega_uf || detalhe.cliente_uf;
                    const cep = detalhe.endereco_entrega_cep || detalhe.cliente_cep;
                    return (
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#7C2D12", lineHeight: 1.5 }}>
                        {[rua, num].filter(Boolean).join(", ")}
                        {comp && <span> — {comp}</span>}
                        {bairro && (
                          <div style={{ marginTop: 2 }}>
                            {[bairro, cidade && uf ? `${cidade}/${uf}` : cidade].filter(Boolean).join(" — ")}
                          </div>
                        )}
                        {cep && (
                          <div style={{ marginTop: 2, fontSize: 12, color: "#9A3412" }}>
                            CEP: {cep}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ fontSize: 12, color: "#9A3412" }}>
                    Endereço não informado na venda.
                  </div>
                )}
              </div>
            )}

            {/* ── Timeline ────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.cinza,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <History size={13} /> Timeline
              </div>

              <div style={{ position: "relative", paddingLeft: 28 }}>
                {/* Linha vertical da timeline */}
                <div
                  style={{
                    position: "absolute",
                    left: 11,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    background: C.cremeBorder,
                  }}
                />

                {/* Evento 1: Criação */}
                <TimelineItem
                  icon={<Clock size={12} />}
                  iconBg={C.esmeraldaLt}
                  iconColor={C.esmeralda}
                  title="Criada"
                  date={fmtDtHr(detalhe.created_at)}
                  subtitle={
                    detalhe.criado_por_nome
                      ? `por ${detalhe.criado_por_nome}`
                      : undefined
                  }
                  active
                />

                {/* Evento 2: Saída (motoboy retirou) */}
                {detalhe.data_saida && (
                  <TimelineItem
                    icon={<Bike size={12} />}
                    iconBg={C.ambarLt}
                    iconColor={C.ambar}
                    title="Retirada pelo Motoboy"
                    date={fmtDtHr(detalhe.data_saida)}
                    subtitle={
                      detalhe.confirmado_motoboy_retirada_nome
                        ? `por ${detalhe.confirmado_motoboy_retirada_nome}`
                        : undefined
                    }
                    active
                  />
                )}

                {/* Evento 3: Retirada (cliente na loja) */}
                {detalhe.data_retirada && (
                  <TimelineItem
                    icon={<Store size={12} />}
                    iconBg={C.verdeLt}
                    iconColor={C.verde}
                    title="Retirada pelo Cliente"
                    date={fmtDtHr(detalhe.data_retirada)}
                    subtitle={
                      detalhe.confirmado_retirada_nome
                        ? `por ${detalhe.confirmado_retirada_nome}`
                        : undefined
                    }
                    active
                  />
                )}

                {/* Evento 4: Entregue ao cliente (via motoboy) */}
                {detalhe.data_entrega_realizada && (
                  <TimelineItem
                    icon={<CheckCircle size={12} />}
                    iconBg={C.verdeLt}
                    iconColor={C.verde}
                    title="Entregue ao Cliente"
                    date={fmtDtHr(detalhe.data_entrega_realizada)}
                    subtitle={
                      detalhe.confirmado_motoboy_entrega_nome
                        ? `por ${detalhe.confirmado_motoboy_entrega_nome}`
                        : undefined
                    }
                    active
                  />
                )}

                {/* Evento futuro: previsão de entrega */}
                {detalhe.data_entrega_prevista &&
                  !detalhe.data_entrega_realizada && (
                    <TimelineItem
                      icon={<Clock size={12} />}
                      iconBg={C.cremeBg}
                      iconColor={C.cinza}
                      title="Previsão de Entrega"
                      date={fmtDtHr(detalhe.data_entrega_prevista)}
                      active={false}
                    />
                  )}
              </div>
            </div>

            {/* ── Itens ───────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.cinza,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Package size={13} /> Itens ({detalhe.itens_count})
              </div>
              <div
                style={{
                  border: `1px solid ${C.cremeBorder}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {/* Cabeçalho da tabela */}
                <div
                  style={{
                    display: "flex",
                    padding: "8px 12px",
                    background: C.cremeBg,
                    borderBottom: `1px solid ${C.cremeBorder}`,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.cinza,
                    textTransform: "uppercase",
                  }}
                >
                  <div style={{ flex: 1 }}>Produto</div>
                  <div style={{ width: 60, textAlign: "right" }}>Qtd</div>
                </div>
                {detalhe.itens.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderBottom: `1px solid ${C.cremeBorder}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                        {item.nome_produto}
                      </div>
                      {item.sku && (
                        <div style={{ fontSize: 11, color: C.cinza }}>
                          SKU: {item.sku}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        width: 60,
                        textAlign: "right",
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.esmeralda,
                      }}
                    >
                      {item.quantidade}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Transporte ───────────────────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.cinza,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Truck size={13} /> Transporte
              </div>
              <div
                style={{
                  border: `1px solid ${C.cremeBorder}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  background: "#fff",
                  display: "grid",
                  gap: 10,
                }}
              >
                {/* Forma */}
                <TransporteRow
                  icon={
                    isRetirada ? <Store size={12} /> : <Bike size={12} />
                  }
                  label="Forma"
                  value={labelForma(detalhe.forma_entrega)}
                />

                {/* Região */}
                <TransporteRow
                  icon={<MapPin size={12} />}
                  label="Região"
                  value={labelRegiao(detalhe.regiao)}
                />

                {/* Motoboy */}
                {isMotoboy && (
                  <TransporteRow
                    icon={<User size={12} />}
                    label="Motoboy"
                    value={
                      detalhe.motoboy_nome
                        ? `${detalhe.motoboy_nome}${
                            detalhe.motoboy_telefone
                              ? ` · ${detalhe.motoboy_telefone}`
                              : ""
                          }`
                        : "—"
                    }
                  />
                )}

                {/* Frete */}
                <TransporteRow
                  icon={<DollarSign size={12} />}
                  label="Frete Cobrado"
                  value={fmtBRL(detalhe.frete_cobrado)}
                />
                <TransporteRow
                  icon={<Truck size={12} />}
                  label="Frete Motoboy"
                  value={fmtBRL(detalhe.frete_motoboy)}
                />

                {/* Aprovação pendente */}
                {detalhe.aprovacao_frete_necessaria && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: C.ambarLt,
                      fontSize: 11,
                      color: "#92400e",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AlertTriangle size={12} />
                    Aguardando aprovação da gerente (frete)
                  </div>
                )}
              </div>
            </div>

            {/* ── Correios ─────────────────────────────────────────────────── */}
            {detalhe.correios_rastreio && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.cinza,
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Send size={13} /> Correios
                </div>
                <div
                  style={{
                    border: `1px solid ${C.cremeBorder}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    background: "#fff",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <TransporteRow
                    icon={<Hash size={12} />}
                    label="Rastreio"
                    value={detalhe.correios_rastreio}
                  />
                  {detalhe.correios_data_postagem && (
                    <TransporteRow
                      icon={<Clock size={12} />}
                      label="Postagem"
                      value={fmtDtHr(detalhe.correios_data_postagem) ?? "—"}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Códigos ──────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.cinza,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Hash size={13} /> Códigos de Verificação
                </div>
                {/* REGRA DE SEGURANÇA: apenas admin/dev podem revelar códigos */}
                {podeVerCodigos && (
                <button
                  onClick={() => setMostrarCodigos((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: C.esmeralda,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  {mostrarCodigos ? (
                    <>
                      <EyeOff size={12} /> Ocultar
                    </>
                  ) : (
                    <>
                      <Eye size={12} /> Mostrar
                    </>
                  )}
                </button>
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {/* Código A — Cliente */}
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.cremeBorder}`,
                    background: C.cremeBg,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: C.cinza,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Código A · Cliente
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: C.esmeralda,
                      fontFamily: "monospace",
                      letterSpacing: 3,
                    }}
                  >
                    {mostrarCodigos && podeVerCodigos
                      ? detalhe.codigo_cliente
                      : mascaraCodigo(detalhe.codigo_cliente)}
                  </div>
                </div>

                {/* Código B — Motoboy */}
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.cremeBorder}`,
                    background: C.cremeBg,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: C.cinza,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Código B · Motoboy
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: detalhe.codigo_motoboy
                        ? C.ambar
                        : C.cinza,
                      fontFamily: "monospace",
                      letterSpacing: 3,
                    }}
                  >
                    {detalhe.codigo_motoboy
                      ? (mostrarCodigos && podeVerCodigos)
                        ? detalhe.codigo_motoboy
                        : mascaraCodigo(detalhe.codigo_motoboy)
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Foto de comprovação ───────────────────────────────────── */}
            {/* REGRA DE NEGÓCIO: foto anexada na confirmação da entrega
                como comprovante visual. Acessível via proxy autenticado. */}
            {detalhe.foto_entrega_path && (
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
                  <Camera size={13} /> Foto da entrega
                </div>
                <img
                  src={`/api/storage/pagamento-fotos/${detalhe.foto_entrega_path}`}
                  alt="Foto da entrega"
                  style={{
                    width: "100%",
                    maxWidth: 320,
                    borderRadius: 8,
                    border: `1px solid ${C.cremeBorder}`,
                  }}
                />
              </div>
            )}

            {/* ── Observações ──────────────────────────────────────────────── */}
            {detalhe.observacoes && (
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
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: C.cremeBg,
                    border: `1px solid ${C.cremeBorder}`,
                    fontSize: 12,
                    color: "#1f2937",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {detalhe.observacoes}
                </div>
              </div>
            )}

            {/* ── Erro carregamento parcial ────────────────────────────────── */}
            {erro && detalhe && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: C.vermelhoLt,
                  color: C.vermelho,
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                {erro}
              </div>
            )}
          </div>
        ) : null}

        {/* ── Footer: Ações ────────────────────────────────────────────────── */}
        {detalhe && (
          <div
            style={{
              padding: "14px 20px",
              borderTop: `1px solid ${C.cremeBorder}`,
              background: C.cremeBg,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Confirmação de cancelamento */}
            {mostrarCancelarConfirm && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: C.vermelhoLt,
                  border: `1px solid ${C.vermelho}30`,
                  fontSize: 12,
                  color: C.vermelho,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={14} />
                  <span>Confirmar cancelamento?</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setMostrarCancelarConfirm(false)}
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      border: `1px solid ${C.cremeBorder}`,
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "pointer",
                      color: C.cinza,
                    }}
                  >
                    Não
                  </button>
                  <button
                    onClick={handleCancelar}
                    disabled={cancelando}
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      border: "none",
                      borderRadius: 6,
                      background: C.vermelho,
                      color: "#fff",
                      cursor: cancelando ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {cancelando ? (
                      <Loader2
                        size={11}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                    ) : null}
                    Sim, Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Botões de ação */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 8,
              }}
            >
              {/* Confirmar Retirada (retirada loja) */}
              {podeConfirmarRetirada && (
                <button
                  onClick={() => abrirConfirmar("codigo_cliente")}
                  style={{
                    padding: "10px 12px",
                    background: C.verde,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <CheckCircle size={14} />
                  Confirmar Retirada
                </button>
              )}

              {/* Registrar Saída (motoboy retira) */}
              {podeRegistrarSaida && (
                <button
                  onClick={() => abrirConfirmar("codigo_motoboy")}
                  style={{
                    padding: "10px 12px",
                    background: C.ambar,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <ArrowRight size={14} />
                  Registrar Saída
                </button>
              )}

              {/* Confirmar Entrega ao Cliente (via motoboy, após saída) */}
              {podeConfirmarEntregaCliente && (
                <button
                  onClick={() => abrirConfirmar("codigo_cliente")}
                  style={{
                    padding: "10px 12px",
                    background: C.verde,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <CheckCircle size={14} />
                  Confirmar Entrega
                </button>
              )}

              {/* Informar Correios */}
              {podeInformarCorreios && (
                <button
                  onClick={() => setModalCorreios(true)}
                  style={{
                    padding: "10px 12px",
                    background: C.esmeraldaLt,
                    color: C.esmeralda,
                    border: `1px solid ${C.esmeralda}30`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Send size={14} />
                  Informar Correios
                </button>
              )}

              {/* Cancelar */}
              {podeCancelar && (
                <button
                  onClick={() => setMostrarCancelarConfirm(true)}
                  disabled={cancelando}
                  style={{
                    padding: "10px 12px",
                    background: "#fff",
                    color: C.vermelho,
                    border: `1px solid ${C.vermelho}40`,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: cancelando ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Ban size={14} />
                  Cancelar Entrega
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Sub-modais ────────────────────────────────────────────────────── */}
      {modalConfirmar.aberto && (
        <ConfirmarEntregaModal
          entregaId={modalConfirmar.entregaId}
          tipo={modalConfirmar.tipo}
          isOpen={modalConfirmar.aberto}
          onClose={() =>
            setModalConfirmar((prev) => ({ ...prev, aberto: false }))
          }
          onSuccess={handleRefresh}
        />
      )}

      {modalCorreios && entregaId && (
        <CorreiosRastreioModal
          entregaId={entregaId}
          isOpen={modalCorreios}
          onClose={() => setModalCorreios(false)}
          onSuccess={handleRefresh}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────────

/** Item individual da timeline */
function TimelineItem({
  icon,
  iconBg,
  iconColor,
  title,
  date,
  subtitle,
  active,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  date: string | null;
  subtitle?: string;
  active: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        paddingBottom: 16,
        opacity: active ? 1 : 0.5,
      }}
    >
      {/* Ícone */}
      <div
        style={{
          position: "absolute",
          left: -23,
          top: 2,
          width: 22,
          height: 22,
          borderRadius: 11,
          background: active ? iconBg : C.cremeBg,
          border: `2px solid ${active ? iconColor : C.cremeBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? iconColor : C.cinza,
        }}
      >
        {icon}
      </div>

      {/* Conteúdo */}
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: active ? "#1f2937" : C.cinza,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: C.cinza, marginTop: 2 }}>
          {date ?? "—"}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: C.cinza, marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/** Linha de informação de transporte */
function TransporteRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
      }}
    >
      <span style={{ color: C.cinza, flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          color: C.cinza,
          fontWeight: 500,
          minWidth: 90,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ color: "#1f2937", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/** Ícone de cifrão usado nos componentes (não importado do lucide-react diretamente no subcomponente) */
function DollarSign({ size }: { size: number }) {
  return (
    <span
      style={{
        fontSize: size,
        lineHeight: 1,
        fontWeight: 700,
        display: "inline-block",
      }}
    >
      R$
    </span>
  );
}
