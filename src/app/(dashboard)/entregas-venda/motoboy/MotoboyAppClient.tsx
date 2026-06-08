"use client";

/**
 * MotoboyAppClient — Tela principal do app do entregador.
 *
 * REGRA DE NEGÓCIO: o motoboy vê apenas suas entregas, com cards de resumo
 * (pendentes, em rota, entregues, total no mês, a receber, já recebido) e
 * tabela com filtros. Layout limpo, sem sidebar de admin.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Bike, Clock, Truck, CheckCircle, DollarSign,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

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

interface EntregaMotoboy {
  id: number;
  venda_id: number;
  codigo_entrega: string;
  tipo: string;
  situacao: string;
  forma_entrega: string;
  regiao: string | null;
  frete_motoboy: number;
  data_saida: string | null;
  data_entrega_realizada: string | null;
  created_at: string;
  numero_venda: string | null;
  total_venda: number | null;
  cliente_nome: string | null;
  foi_pago: boolean;
}

interface Cards {
  pendentes: number;
  em_rota: number;
  entregues: number;
  total_mes: number;
  a_receber: number;
  ja_recebido: number;
}

interface Props {
  motoboyNome: string;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(situacao: string) {
  switch (situacao) {
    case "pendente": return { text: "Pendente", color: C.ambar, bg: C.ambarLt };
    case "em_rota": return { text: "Em Rota", color: "#9A3412", bg: "#FFF7ED" };
    case "confirmada": return { text: "Entregue", color: C.verde, bg: C.verdeLt };
    default: return { text: situacao, color: C.cinza, bg: C.cremeBg };
  }
}

export default function MotoboyAppClient({ motoboyNome }: Props) {
  const [items, setItems] = useState<EntregaMotoboy[]>([]);
  const [cards, setCards] = useState<Cards | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = situacaoFiltro ? `?situacao=${situacaoFiltro}` : "";
      const data = await apiFetch<{ items: EntregaMotoboy[]; cards: Cards }>(
        `/api/entregas-venda/motoboy/minhas${params}`,
      );
      setItems(data.items);
      setCards(data.cards);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [situacaoFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const situacoes = [
    { value: "", label: "Todas" },
    { value: "pendente", label: "Pendentes" },
    { value: "em_rota", label: "Em Rota" },
    { value: "confirmada", label: "Entregues" },
  ];

  return (
    <div style={{ background: C.cremeBg, minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: C.esmeraldaLt, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <Bike size={20} color={C.esmeralda} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.esmeralda }}>
              Minhas Entregas
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: C.cinza }}>
              {motoboyNome}
            </p>
          </div>
        </div>

        {/* Cards */}
        {cards && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 10, marginBottom: 20,
          }}>
            <Card icon={<Clock size={14} />} label="Pendentes" value={cards.pendentes} color={C.ambar} />
            <Card icon={<Truck size={14} />} label="Em Rota" value={cards.em_rota} color="#9A3412" />
            <Card icon={<CheckCircle size={14} />} label="Entregues" value={cards.entregues} color={C.verde} />
            <Card icon={<DollarSign size={14} />} label="Total no Mês" value={fmtBRL(cards.total_mes)} color={C.esmeralda} />
            <Card icon={<DollarSign size={14} />} label="A Receber" value={fmtBRL(cards.a_receber)} color={C.cinza} />
            <Card icon={<CheckCircle size={14} />} label="Já Recebido" value={fmtBRL(cards.ja_recebido)} color={C.verde} />
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {situacoes.map((s) => (
            <button key={s.value}
              onClick={() => setSituacaoFiltro(s.value)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: `1px solid ${C.cremeBorder}`,
                background: situacaoFiltro === s.value ? C.esmeralda : "#fff",
                color: situacaoFiltro === s.value ? "#fff" : C.cinza,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Loading / Erro */}
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Loader2 size={24} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {erro && (
          <div style={{ padding: 12, borderRadius: 8, background: C.vermelhoLt, color: C.vermelho, fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        {/* Tabela */}
        {!loading && !erro && items.length === 0 && (
          <p style={{ textAlign: "center", color: C.cinza, padding: 40 }}>Nenhuma entrega encontrada.</p>
        )}

        {!loading && items.length > 0 && (
          <div style={{ overflow: "auto", borderRadius: 10, border: `1px solid ${C.cremeBorder}`, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.cremeBg }}>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Venda</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Frete</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Pago?</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const badge = statusBadge(item.situacao);
                  return (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${C.cremeBorder}` }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, fontSize: 11 }}>{item.codigo_entrega}</span>
                      </td>
                      <td style={tdStyle}>{item.numero_venda ?? "—"}</td>
                      <td style={tdStyle}>{item.cliente_nome ?? "—"}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: badge.bg, color: badge.color,
                        }}>
                          {badge.text}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                        {fmtBRL(item.frete_motoboy)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          padding: "2px 6px", borderRadius: 4,
                          background: item.foi_pago ? C.verdeLt : C.cremeBg,
                          color: item.foi_pago ? C.verde : C.cinza,
                        }}>
                          {item.foi_pago ? "Pago" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Card({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; color: string;
}) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.cremeBorder}`,
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{ fontSize: 10, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: typeof value === "string" ? 16 : 20, color }}>
        {value}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px", fontSize: 10, fontWeight: 600, color: C.cinza,
  textTransform: "uppercase", textAlign: "left", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px", color: "#1f2937", whiteSpace: "nowrap",
};
