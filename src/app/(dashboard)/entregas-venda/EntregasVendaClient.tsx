"use client";

/**
 * EntregasVendaClient.tsx — Componente client-side da listagem de entregas.
 *
 * REGRA DE NEGÓCIO: exibe a lista paginada de entregas de venda com cards
 * de stats (pendentes, em andamento, confirmadas, total), filtros por
 * situação, busca por código/venda, tabela com colunas clicáveis e
 * drawer de detalhe ao clicar em uma entrega.
 *
 * A paginação é server-side via URL (usando o componente Paginacao com Link).
 * Filtros de situação e busca atualizam a URL, disparando nova renderização SSR.
 * Após ações no drawer (confirmar, cancelar), os dados são recarregados
 * client-side via apiFetch para refletir as mudanças sem full page reload.
 *
 * O QUE: renderiza a UI completa da tela /entregas-venda com todos os
 * estados (carregando, vazio, erro, dados).
 *
 * IMPACTO SE ALTERADO: a UI é o ponto central de visualização de entregas.
 * Alterar colunas, filtros ou ações pode quebrar o fluxo de logística.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Truck,
  Clock,
  CheckCircle,
  AlertTriangle,
  Search,
  X,
  Loader2,
  Bike,
  Store,
  ExternalLink,
  DollarSign,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import Paginacao from "@/components/ui/Paginacao";
import EntregaDetalheDrawer from "@/components/entregas/EntregaDetalheDrawer";
import MotoboyDrawer from "@/components/entregas/MotoboyDrawer";
import PagarMotoboyModal from "@/components/entregas/PagarMotoboyModal";
import type { EntregaItem, ContagensEntregas } from "./page";

// ── Paleta ──────────────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  vermelho:    "#DC2626",
  vermelhoLt:  "#FEE2E2",
  ambar:       "#D97706",
  ambarLt:     "#FEF3C7",
  verde:       "#059669",
  verdeLt:     "#D1FAE5",
  cinza:       "#6B7280",
  cinzaBorder: "#E5E7EB",
};

// ── Props ───────────────────────────────────────────────────────────────────────

interface EntregasVendaClientProps {
  /** Itens da página atual (pré-carregados via SSR) */
  items: EntregaItem[];
  /** Contagens para os cards de stats */
  contagens: ContagensEntregas;
  /** Página atual (1-indexed) */
  currentPage: number;
  /** Total de páginas */
  totalPages: number;
  /** Total de itens (para o texto "Mostrando X–Y de Z") */
  totalItems: number;
  /** Tamanho da página */
  pageSize: number;
  /** Filtro de situação vindo da URL */
  situacaoFiltro: string;
  /** Texto de busca vindo da URL */
  buscaFiltro: string;
  /** Role do usuário logado */
  userRole: string;
}

/** Formato de resposta da API de listagem de entregas */
interface EntregasListResponse {
  items: EntregaItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Formata valor monetário em BRL */
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata data ISO para dd/mm/aaaa */
function fmtData(s: string | null) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

/** Formata data ISO para dd/mm/aaaa HH:MM */
function fmtDtHr(s: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return s;
  }
}

/** Label amigável para forma de entrega */
function labelForma(f: string): string {
  return f === "retirada" ? "Retirada" : "Motoboy";
}

/** Badge de status com cores */
function statusBadge(situacao: string) {
  switch (situacao) {
    case "pendente":
      return { text: "Pendente", color: C.ambar, bg: C.ambarLt };
    case "confirmada":
      return { text: "Confirmada", color: C.verde, bg: C.verdeLt };
    case "cancelada":
      return { text: "Cancelada", color: C.cinza, bg: C.cremeBg };
    default:
      return { text: situacao, color: C.cinza, bg: C.cremeBg };
  }
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function EntregasVendaClient({
  items: ssrItems,
  contagens: ssrContagens,
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  situacaoFiltro,
  buscaFiltro,
  userRole: _userRole, // prefixado com _: reservado para ações futuras (ex: permissões)
}: EntregasVendaClientProps) {
  const router = useRouter();

  // ── Estado ──────────────────────────────────────────────────────────────────
  // REGRA DE NEGÓCIO: mantemos estado local para permitir refresh client-side
  // após ações no drawer (confirmar/cancelar entrega) sem full page reload.
  // Os valores iniciais vêm do SSR, e são atualizados via apiFetch após
  // mudanças no drawer.
  const [items, setItems] = useState<EntregaItem[]>(ssrItems);
  const [contagens, setContagens] = useState<ContagensEntregas>(ssrContagens);
  const [loading, setLoading] = useState(false);

  // Input de busca (estado local, não sincronizado com URL em tempo real)
  const [buscaInput, setBuscaInput] = useState(buscaFiltro);

  // Entrega selecionada para abrir o drawer
  const [selectedEntregaId, setSelectedEntregaId] = useState<number | null>(null);

  // Drawer de motoboys
  const [motoboyDrawerOpen, setMotoboyDrawerOpen] = useState(false);
  // Modal de pagamento em lote
  const [pagarMotoboyOpen, setPagarMotoboyOpen] = useState(false);

  // ── Saldo de frete grátis ──────────────────────────────────────────────────
  const [saldoFrete, setSaldoFrete] = useState<number | null>(null);
  useEffect(() => {
    // REGRA DE NEGÓCIO: carrega o saldo de frete grátis da gerente logada.
    apiFetch<{ saldo: number }>("/api/entregas-venda/saldo-frete")
      .then((d) => setSaldoFrete(d.saldo))
      .catch(() => setSaldoFrete(null));
  }, []);

  // ── Recarregar dados via API (client-side) ──────────────────────────────────
  // REGRA DE NEGÓCIO: função usada para refresh após ações no drawer
  // (confirmação de retirada, registro de saída, cancelamento).
  // Mantém a página e filtros atuais para consistência com a URL.
  // Usa apiFetch que lança erro em falhas de rede e respostas não-2xx.
  const recarregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
      });
      if (situacaoFiltro) params.set("situacao", situacaoFiltro);

      const data = await apiFetch<EntregasListResponse>(
        `/api/entregas-venda?${params.toString()}`,
      );

      // Serializa campos numéricos (a API já converte, mas garantimos consistência)
      const serialized = (data.items || []).map((r) => ({
        ...r,
        id:                          Number(r.id),
        venda_id:                    Number(r.venda_id),
        frete_cobrado:               Number(r.frete_cobrado ?? 0),
        frete_motoboy:               Number(r.frete_motoboy ?? 0),
        total_venda:                 r.total_venda ? Number(r.total_venda) : null,
        aprovacao_frete_necessaria:  Boolean(r.aprovacao_frete_necessaria),
        motoboy_id:                  r.motoboy_id ? String(r.motoboy_id) : null,
      })) as EntregaItem[];

      setItems(serialized);

      // Atualiza contagens (a API de lista não retorna contagens, então
      // mantemos as contagens do SSR. Um futuro endpoint de stats pode
      // ser adicionado se necessário.)
      // NOTA: as contagens podem ficar levemente desatualizadas após ações
      // no drawer, mas o impacto é cosmético (card de stats).
    } catch (err) {
      console.error("Erro ao recarregar entregas:", err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, situacaoFiltro]);

  // ── Handlers de filtro (SSR-based via URL) ─────────────────────────────────
  // REGRA DE NEGÓCIO: filtros de situação e busca atualizam a URL,
  // disparando uma nova renderização SSR com os dados filtrados.
  // Isso mantém a URL compartilhável e o comportamento previsível.

  /** Altera o filtro de situação e recarrega a página 1 */
  function handleSituacaoChange(novaSituacao: string) {
    const params = new URLSearchParams();
    params.set("page", "1");
    if (novaSituacao) params.set("situacao", novaSituacao);
    if (buscaInput.trim()) params.set("busca", buscaInput.trim());
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Submete a busca e recarrega a página 1 */
  function handleBuscaSubmit() {
    const params = new URLSearchParams();
    params.set("page", "1");
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    if (buscaInput.trim()) params.set("busca", buscaInput.trim());
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Limpa a busca e recarrega */
  function handleLimparBusca() {
    setBuscaInput("");
    const params = new URLSearchParams();
    params.set("page", "1");
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Fecha o drawer e recarrega dados (pode ter havido alteração) */
  function handleDrawerClose() {
    setSelectedEntregaId(null);
    // Recarrega via API para refletir possíveis mudanças (confirmação, cancelamento)
    void recarregar();
  }

  // ── Construção do extraParams para Paginacao ────────────────────────────────
  // REGRA DE NEGÓCIO: Paginacao usa Links com query params. Precisamos
  // preservar os filtros atuais nos links de paginação para que a navegação
  // entre páginas mantenha os filtros aplicados.
  const paginacaoExtraParams = [
    situacaoFiltro ? `situacao=${encodeURIComponent(situacaoFiltro)}` : "",
    buscaFiltro ? `busca=${encodeURIComponent(buscaFiltro)}` : "",
  ].filter(Boolean).join("&");

  // ── Dados da UI ────────────────────────────────────────────────────────────

  const situacoes = [
    { value: "",            label: "Todas" },
    { value: "pendente",    label: "Pendentes" },
    { value: "confirmada",  label: "Confirmadas" },
    { value: "cancelada",   label: "Canceladas" },
  ];

  return (
    <div style={{ background: C.cremeBg, minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: C.esmeraldaLt, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <Truck size={20} color={C.esmeralda} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.esmeralda }}>
              Entregas de Venda
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: C.cinza }}>
              Logística — retirada, motoboy e correios
            </p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={() => setMotoboyDrawerOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.cremeBorder}`,
                background: "#fff", color: C.esmeralda, fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Bike size={16} /> Motoboys
            </button>
          </div>
        </div>

        {/* ── Cards de Stats ─────────────────────────────────────────────────── */}
        {/* REGRA DE NEGÓCIO: 4 cards resumindo a situação das entregas.
            Pendentes = aguardando ação (retirada ou saída do motoboy).
            Em Andamento = motoboy já retirou (data_saida preenchida) mas não entregou.
            Confirmadas = entrega finalizada.
            Total = soma de todas as situações considerando os filtros ativos. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12, marginBottom: 20,
        }}>
          {/* Saldo de Frete Grátis — exibido antes dos cards de contagem */}
          {saldoFrete !== null && (
            <div style={{
              background: "#fff", border: `1px solid ${C.cremeBorder}`,
              borderRadius: 10, padding: "14px 16px",
            }}>
              <div style={{
                fontSize: 11, color: C.cinza, marginBottom: 4,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <DollarSign size={12} /> Saldo Frete Grátis
              </div>
              <div style={{
                fontWeight: 700, fontSize: 24,
                color: saldoFrete >= 0 ? C.verde : C.vermelho,
              }}>
                {fmtBRL(saldoFrete)}
              </div>
            </div>
          )}
          {/* Pendentes */}
          <div style={{
            background: "#fff", border: `1px solid ${C.cremeBorder}`,
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{
              fontSize: 11, color: C.cinza, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Clock size={12} /> Pendentes
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, color: C.ambar }}>
              {contagens.pendente}
            </div>
          </div>

          {/* Em Andamento */}
          <div style={{
            background: "#fff", border: `1px solid ${C.cremeBorder}`,
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{
              fontSize: 11, color: C.cinza, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Bike size={12} /> Em Andamento
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, color: C.esmeralda }}>
              {contagens.em_andamento}
            </div>
          </div>

          {/* Confirmadas */}
          <div style={{
            background: "#fff", border: `1px solid ${C.cremeBorder}`,
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{
              fontSize: 11, color: C.cinza, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <CheckCircle size={12} /> Confirmadas
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, color: C.verde }}>
              {contagens.confirmada}
            </div>
          </div>

          {/* Total */}
          <div style={{
            background: "#fff", border: `1px solid ${C.cremeBorder}`,
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{
              fontSize: 11, color: C.cinza, marginBottom: 4,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Package size={12} /> Total
            </div>
            <div style={{ fontWeight: 700, fontSize: 24, color: C.cinza }}>
              {contagens.total}
            </div>
          </div>
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          marginBottom: 14, flexWrap: "wrap",
        }}>
          {/* Botões de situação */}
          {situacoes.map(s => (
            <button
              key={s.value}
              onClick={() => handleSituacaoChange(s.value)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: "none",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: situacaoFiltro === s.value ? C.esmeralda : "#fff",
                color:      situacaoFiltro === s.value ? "#fff" : C.cinza,
                boxShadow:  situacaoFiltro === s.value ? "none" : `0 0 0 1px ${C.cremeBorder}`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Busca ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#fff", border: `1px solid ${C.cremeBorder}`,
          borderRadius: 8, padding: "8px 12px", marginBottom: 16,
        }}>
          <Search size={15} color={C.cinza} />
          <input
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleBuscaSubmit();
            }}
            placeholder="Buscar por código ou número da venda..."
            style={{
              border: "none", outline: "none", flex: 1, fontSize: 13,
              background: "transparent", color: "#1f2937",
            }}
          />
          {buscaInput && (
            <button
              onClick={handleLimparBusca}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "2px 4px",
              }}
              aria-label="Limpar busca"
            >
              <X size={14} color={C.cinza} />
            </button>
          )}
          <button
            onClick={handleBuscaSubmit}
            style={{
              padding: "5px 12px", background: C.esmeralda, color: "#fff",
              border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Buscar
          </button>
        </div>

        {/* ── Tabela / Loading / Empty State ─────────────────────────────────── */}
        {loading ? (
          <div style={{
            display: "flex", justifyContent: "center", padding: 40,
          }}>
            <Loader2 size={24} color={C.esmeralda}
              style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : items.length === 0 ? (
          /* ── Empty State ──────────────────────────────────────────────────── */
          <div style={{
            textAlign: "center", padding: 64, color: C.cinza,
            background: "#fff", borderRadius: 12,
            border: `1px solid ${C.cremeBorder}`,
          }}>
            <Package size={40} style={{ opacity: 0.25, marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.cinza }}>
              Nenhuma entrega encontrada
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.cinza }}>
              {situacaoFiltro
                ? `Não há entregas com situação "${situacaoFiltro}"`
                : buscaFiltro
                ? `Nenhum resultado para "${buscaFiltro}"`
                : "Nenhuma entrega registrada no sistema"}
            </p>
          </div>
        ) : (
          <>
            {/* ── Tabela ────────────────────────────────────────────────────── */}
            {/* REGRA DE NEGÓCIO: a tabela lista as colunas: Código, Venda,
                Cliente, Status, Forma, Motoboy, Frete, Data.
                Cada linha é clicável e abre o drawer de detalhe.
                O link da venda é independente (abre a página da venda). */}
            <div style={{
              overflowX: "auto",
              background: "#fff", borderRadius: 10,
              border: `1px solid ${C.cremeBorder}`,
            }}>
              <table style={{
                width: "100%", borderCollapse: "collapse",
                fontSize: 13,
              }}>
                <thead>
                  <tr style={{
                    background: C.cremeBg,
                    borderBottom: `1px solid ${C.cremeBorder}`,
                  }}>
                    <ThC label="Código" />
                    <ThC label="Venda" />
                    <ThC label="Cliente" />
                    <ThC label="Status" />
                    <ThC label="Forma" />
                    <ThC label="Motoboy" />
                    <ThC label="Frete" align="right" />
                    <ThC label="Data" align="right" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const badge = statusBadge(item.situacao);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedEntregaId(item.id)}
                        style={{
                          cursor: "pointer",
                          borderBottom: `1px solid ${C.cremeBorder}`,
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = C.cremeBg;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = "#fff";
                        }}
                      >
                        {/* Código */}
                        <td style={{
                          padding: "10px 14px", whiteSpace: "nowrap",
                        }}>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 600,
                            color: C.esmeralda, fontSize: 12,
                            cursor: "pointer",
                          }}>
                            {item.codigo_entrega}
                          </span>
                        </td>

                        {/* Venda */}
                        <td style={{
                          padding: "10px 14px", whiteSpace: "nowrap",
                        }}>
                          {item.numero_venda ? (
                            <a
                              href={`/vendas/${item.venda_id}`}
                              onClick={e => e.stopPropagation()}
                              style={{
                                color: C.esmeralda, textDecoration: "none",
                                fontWeight: 600, fontSize: 12,
                                display: "inline-flex", alignItems: "center", gap: 4,
                              }}
                            >
                              {item.numero_venda}
                              <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span style={{ color: C.cinza, fontSize: 12 }}>
                              #{item.venda_id}
                            </span>
                          )}
                        </td>

                        {/* Cliente */}
                        <td style={{
                          padding: "10px 14px", whiteSpace: "nowrap",
                          maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          <span style={{
                            color: "#1f2937", fontSize: 13,
                          }}>
                            {item.cliente_nome ?? "—"}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <span style={{
                            display: "inline-block",
                            fontSize: 11, fontWeight: 700,
                            padding: "3px 10px", borderRadius: 20,
                            background: badge.bg,
                            color: badge.color,
                          }}>
                            {badge.text}
                          </span>
                        </td>

                        {/* Forma */}
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <span style={{
                            display: "flex", alignItems: "center", gap: 4,
                            fontSize: 12, color: "#1f2937",
                          }}>
                            {item.forma_entrega === "retirada"
                              ? <Store size={12} color={C.cinza} />
                              : <Bike size={12} color={C.cinza} />
                            }
                            {labelForma(item.forma_entrega)}
                          </span>
                        </td>

                        {/* Motoboy */}
                        <td style={{
                          padding: "10px 14px", whiteSpace: "nowrap",
                        }}>
                          <span style={{
                            color: item.motoboy_nome ? "#1f2937" : C.cinza,
                            fontSize: 12,
                          }}>
                            {item.motoboy_nome ?? "—"}
                          </span>
                        </td>

                        {/* Frete */}
                        <td style={{
                          padding: "10px 14px", whiteSpace: "nowrap",
                          textAlign: "right",
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#1f2937" }}>
                            {fmtBRL(item.frete_cobrado)}
                          </div>
                          {item.frete_motoboy > 0 && (
                            <div style={{
                              fontSize: 10, color: C.cinza,
                            }}>
                              Motoboy: {fmtBRL(item.frete_motoboy)}
                            </div>
                          )}
                          {item.aprovacao_frete_necessaria && (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 3,
                              justifyContent: "flex-end", marginTop: 2,
                            }}>
                              <AlertTriangle size={9} color={C.ambar} />
                              <span style={{ fontSize: 9, color: C.ambar, fontWeight: 600 }}>
                                Pendente
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Data */}
                        <td style={{
                          padding: "10px 14px", whiteSpace: "nowrap",
                          textAlign: "right",
                        }}>
                          <div style={{ fontSize: 12, color: "#1f2937" }}>
                            {fmtData(item.created_at)}
                          </div>
                          <div style={{ fontSize: 10, color: C.cinza, marginTop: 2 }}>
                            {fmtDtHr(item.created_at)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Paginação ──────────────────────────────────────────────────────── */}
        {/* REGRA DE NEGÓCIO: Paginacao usa Link do Next.js para navegação
            server-side. Os parâmetros de filtro são preservados via extraParams.
            Só exibe se houver mais de uma página. */}
        {totalPages > 1 && (
          <Paginacao
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            baseUrl="/entregas-venda"
            extraParams={paginacaoExtraParams || undefined}
          />
        )}

        {/* ── Footer com resumo ─────────────────────────────────────────────── */}
        {items.length > 0 && (
          <p style={{
            textAlign: "center", fontSize: 12, color: C.cinza, marginTop: 12,
          }}>
            {items.length} entrega{items.length !== 1 ? "s" : ""} nesta página
            {situacaoFiltro && ` · situação: ${situacaoFiltro}`}
            {buscaFiltro && ` · busca: "${buscaFiltro}"`}
          </p>
        )}
      </div>

      {/* ── Drawer de detalhe ────────────────────────────────────────────────── */}
      {/* REGRA DE NEGÓCIO: ao clicar em uma linha da tabela, abre o drawer
          lateral com detalhes completos da entrega (timeline, itens, transporte,
          códigos de verificação, ações disponíveis).
          Ao fechar o drawer, os dados da lista são recarregados via apiFetch
          para refletir possíveis mudanças (confirmação, cancelamento).
          IMPACTO SE REMOVIDO: sem o drawer, não há como visualizar detalhes
          ou executar ações (confirmar retirada, registrar saída, etc). */}
      {selectedEntregaId !== null && (
        <EntregaDetalheDrawer
          entregaId={selectedEntregaId}
          isOpen={selectedEntregaId !== null}
          onClose={handleDrawerClose}
          userRole={_userRole}
        />
      )}

      {/* ── Drawer de Motoboys ─────────────────────────────────────────────── */}
      <MotoboyDrawer
        isOpen={motoboyDrawerOpen}
        onClose={() => setMotoboyDrawerOpen(false)}
        onPagar={() => { setMotoboyDrawerOpen(false); setPagarMotoboyOpen(true); }}
      />

      {/* ── Modal de Pagamento em Lote ──────────────────────────────────────── */}
      <PagarMotoboyModal
        isOpen={pagarMotoboyOpen}
        onClose={() => setPagarMotoboyOpen(false)}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Subcomponente: cabeçalho de coluna da tabela ──────────────────────────────

/**
 * ThC — Célula de cabeçalho da tabela de entregas.
 *
 * O QUE: renderiza um <th> estilizado consistentemente com a paleta do projeto.
 * Segue o padrão de design dos componentes de tabela do ERP.
 */
function ThC({ label, align }: { label: string; align?: "left" | "right" }) {
  return (
    <th style={{
      padding: "10px 14px",
      fontSize: 11,
      fontWeight: 600,
      color: C.cinza,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      textAlign: align ?? "left",
      whiteSpace: "nowrap",
    }}>
      {label}
    </th>
  );
}
