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
import EntregaDetalheDrawer from "@/components/entregas/EntregaDetalheDrawer";

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

  // Drawer de detalhe
  const [selectedEntregaId, setSelectedEntregaId] = useState<number | null>(null);

  // Filtro de período
  const [periodo, setPeriodo] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (situacaoFiltro) params.set("situacao", situacaoFiltro);
      if (dataInicio) params.set("data_inicio", dataInicio);
      if (dataFim) params.set("data_fim", dataFim);
      const qs = params.toString();
      const data = await apiFetch<{ items: EntregaMotoboy[]; cards: Cards }>(
        `/api/entregas-venda/motoboy/minhas${qs ? "?" + qs : ""}`,
      );
      setItems(data.items);
      setCards(data.cards);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [situacaoFiltro, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  function handlePeriodoChange(tipo: string) {
    setPeriodo(tipo);
    const hoje = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    if (tipo === "hoje") {
      setDataInicio(fmt(hoje)); setDataFim(fmt(hoje));
    } else if (tipo === "ontem") {
      const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
      setDataInicio(fmt(ontem)); setDataFim(fmt(ontem));
    } else if (tipo === "7dias") {
      const sete = new Date(hoje); sete.setDate(sete.getDate() - 7);
      setDataInicio(fmt(sete)); setDataFim(fmt(hoje));
    } else if (tipo === "mes") {
      setDataInicio(fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
      setDataFim(fmt(hoje));
    } else if (tipo.startsWith("mes_")) {
      const m = parseInt(tipo.split("_")[1]);
      setDataInicio(fmt(new Date(hoje.getFullYear(), m, 1)));
      setDataFim(fmt(new Date(hoje.getFullYear(), m + 1, 0)));
    } else if (tipo === "limpar") {
      setDataInicio(""); setDataFim("");
    }
  }

  function handlePersonalizado() {
    // already reads from dataInicio/dataFim state via carregar
    carregar();
  }

  const situacoes = [
    { value: "", label: "Todas" },
    { value: "pendente", label: "Pendentes" },
    { value: "em_rota", label: "Em Rota" },
    { value: "confirmada", label: "Entregues" },
  ];

  const meses = [
    { value: "mes_0", label: "Jan" }, { value: "mes_1", label: "Fev" },
    { value: "mes_2", label: "Mar" }, { value: "mes_3", label: "Abr" },
    { value: "mes_4", label: "Mai" }, { value: "mes_5", label: "Jun" },
    { value: "mes_6", label: "Jul" }, { value: "mes_7", label: "Ago" },
    { value: "mes_8", label: "Set" }, { value: "mes_9", label: "Out" },
    { value: "mes_10", label: "Nov" }, { value: "mes_11", label: "Dez" },
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

        {/* Filtros de período */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { val: "hoje", label: "Hoje" },
            { val: "ontem", label: "Ontem" },
            { val: "7dias", label: "7 dias" },
            { val: "mes", label: "Este mês" },
          ].map(p => (
            <button key={p.val}
              onClick={() => handlePeriodoChange(p.val)}
              style={{
                padding: "5px 10px", borderRadius: 20, border: `1px solid ${C.cremeBorder}`,
                background: periodo === p.val ? C.esmeralda : "#fff",
                color: periodo === p.val ? "#fff" : C.cinza,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
              {p.label}
            </button>
          ))}

          <select
            value={periodo.startsWith("mes_") ? periodo : ""}
            onChange={(e) => { if (e.target.value) handlePeriodoChange(e.target.value); }}
            style={{
              padding: "5px 8px", borderRadius: 20, border: `1px solid ${C.cremeBorder}`,
              background: "#fff", color: C.cinza, fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>
            <option value="">Mês...</option>
            {meses.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="date" value={dataInicio}
              onChange={e => { setDataInicio(e.target.value); setPeriodo(""); }}
              style={{
                padding: "5px 6px", borderRadius: 20, border: `1px solid ${C.cremeBorder}`,
                fontSize: 11, background: "#fff", color: "#1f2937", width: 115,
              }} />
            <span style={{ fontSize: 11, color: C.cinza }}>a</span>
            <input type="date" value={dataFim}
              onChange={e => { setDataFim(e.target.value); setPeriodo(""); }}
              style={{
                padding: "5px 6px", borderRadius: 20, border: `1px solid ${C.cremeBorder}`,
                fontSize: 11, background: "#fff", color: "#1f2937", width: 115,
              }} />
            <button onClick={handlePersonalizado}
              style={{
                padding: "5px 10px", borderRadius: 20, border: `1px solid ${C.esmeralda}`,
                background: C.esmeralda, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>
              OK
            </button>
          </div>

          {(dataInicio || dataFim) && (
            <button onClick={() => handlePeriodoChange("limpar")}
              style={{
                padding: "5px 10px", borderRadius: 20, border: "none",
                background: C.vermelhoLt, color: C.vermelho, fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
              ✕
            </button>
          )}
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

        {/* Lista de entregas */}
        {!loading && !erro && items.length === 0 && (
          <p style={{ textAlign: "center", color: C.cinza, padding: 40 }}>Nenhuma entrega encontrada.</p>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => {
              const badge = statusBadge(item.situacao);
              return (
                <div key={item.id}
                  onClick={() => setSelectedEntregaId(item.id)}
                  style={{
                    background: "#fff", borderRadius: 10,
                    border: `1px solid ${C.cremeBorder}`,
                    padding: "14px", cursor: "pointer",
                    transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                >
                  {/* Linha 1: código + status + frete */}
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 6,
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.esmeralda }}>
                      {item.codigo_entrega}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: badge.bg, color: badge.color,
                      }}>
                        {badge.text}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: C.esmeralda }}>
                        {fmtBRL(item.frete_motoboy)}
                      </span>
                    </div>
                  </div>

                  {/* Linha 2: cliente + venda + pago */}
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", fontSize: 12, color: C.cinza,
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: "#1f2937" }}>
                        {item.cliente_nome ?? "—"}
                      </span>
                      <span style={{ margin: "0 6px", color: C.cremeBorder }}>·</span>
                      Venda {item.numero_venda ?? "—"}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      padding: "2px 8px", borderRadius: 4,
                      background: item.foi_pago ? C.verdeLt : C.cremeBg,
                      color: item.foi_pago ? C.verde : C.cinza,
                    }}>
                      {item.foi_pago ? "Pago" : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ── Drawer de detalhe ────────────────────────────────────────────────── */}
      {selectedEntregaId !== null && (
        <EntregaDetalheDrawer
          entregaId={selectedEntregaId}
          isOpen={selectedEntregaId !== null}
          onClose={() => { setSelectedEntregaId(null); carregar(); }}
          userRole="entregador"
        />
      )}

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

