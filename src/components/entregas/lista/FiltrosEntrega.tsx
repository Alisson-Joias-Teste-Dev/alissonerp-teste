"use client";

/**
 * FiltrosEntrega — filtros da tela Entregas de Venda (situação, período, busca).
 *
 * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — mockup aprovado pelo
 * Jonathan): os chips de situação/período viraram SELECT — um select de
 * Situação, um de Período (unifica os antigos botões Hoje/Ontem/7 dias/Este
 * mês + dropdown de mês + botão Personalizado numa única lista) e a busca,
 * lado a lado num grid responsivo (empilha em telas estreitas).
 *
 * O QUE: componente PURAMENTE apresentacional — todo o estado (valores,
 * handlers que montam a URL) continua em EntregasVendaClient.tsx, que já
 * tinha essa lógica funcionando (mantém o comportamento "estado na URL",
 * compartilhável/voltável). Este componente só recebe valores + callbacks.
 *
 * IMPACTO SE ALTERADO: os `value`s do select de período precisam continuar
 * batendo com o que `handlePeriodoChange` (EntregasVendaClient) espera
 * ("hoje", "ontem", "7dias", "mes", "mes_0".."mes_11", "personalizado").
 */

import { Search, X } from "lucide-react";
import { C } from "./formatters";

const SITUACOES = [
  { value: "", label: "Todas as situações" },
  { value: "pendente", label: "Pendentes" },
  { value: "em_rota", label: "Em Rota" },
  { value: "confirmada", label: "Confirmadas" },
];

const MESES = [
  { value: "mes_0", label: "Janeiro" },
  { value: "mes_1", label: "Fevereiro" },
  { value: "mes_2", label: "Março" },
  { value: "mes_3", label: "Abril" },
  { value: "mes_4", label: "Maio" },
  { value: "mes_5", label: "Junho" },
  { value: "mes_6", label: "Julho" },
  { value: "mes_7", label: "Agosto" },
  { value: "mes_8", label: "Setembro" },
  { value: "mes_9", label: "Outubro" },
  { value: "mes_10", label: "Novembro" },
  { value: "mes_11", label: "Dezembro" },
];

interface FiltrosEntregaProps {
  situacaoFiltro: string;
  onSituacaoChange: (v: string) => void;

  periodo: string;
  onPeriodoChange: (v: string) => void;
  dataInicioInput: string;
  dataFimInput: string;
  onDataInicioChange: (v: string) => void;
  onDataFimChange: (v: string) => void;
  onAplicarPersonalizado: () => void;
  /** true quando há filtro de data já aplicado na URL (mostra "Limpar"). */
  temFiltroData: boolean;
  onLimparData: () => void;

  buscaInput: string;
  onBuscaInputChange: (v: string) => void;
  onBuscaSubmit: () => void;
  onLimparBusca: () => void;
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${C.cremeBorder}`,
  background: "#fff",
  color: "#1f2937",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  boxSizing: "border-box",
};

export default function FiltrosEntrega({
  situacaoFiltro,
  onSituacaoChange,
  periodo,
  onPeriodoChange,
  dataInicioInput,
  dataFimInput,
  onDataInicioChange,
  onDataFimChange,
  onAplicarPersonalizado,
  temFiltroData,
  onLimparData,
  buscaInput,
  onBuscaInputChange,
  onBuscaSubmit,
  onLimparBusca,
}: FiltrosEntregaProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* REGRA DE LAYOUT (mockup aprovado 21/07): selects lado a lado, busca
          ocupando o resto — grid responsivo (empilha em 1 coluna no celular),
          mesmo padrão de auto-fit/minmax já usado em FreteAvulsoModal.tsx. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr)) minmax(min(240px, 100%), 2fr)",
          gap: 8,
        }}
      >
        {/* Situação */}
        <select
          value={situacaoFiltro}
          onChange={(e) => onSituacaoChange(e.target.value)}
          style={selectStyle}
        >
          {SITUACOES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Período */}
        <select
          value={periodo}
          onChange={(e) => onPeriodoChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todo período</option>
          <option value="hoje">Hoje</option>
          <option value="ontem">Ontem</option>
          <option value="7dias">7 dias</option>
          <option value="mes">Este mês</option>
          <optgroup label="Mês específico">
            {MESES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </optgroup>
          <option value="personalizado">Personalizado...</option>
        </select>

        {/* Busca */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#fff", border: `1px solid ${C.cremeBorder}`,
            borderRadius: 8, padding: "8px 12px",
          }}
        >
          <Search size={15} color={C.cinza} />
          <input
            value={buscaInput}
            onChange={(e) => onBuscaInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onBuscaSubmit(); }}
            placeholder="Buscar por código ou número da venda..."
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13, background: "transparent", color: "#1f2937" }}
          />
          {buscaInput && (
            <button onClick={onLimparBusca} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }} aria-label="Limpar busca">
              <X size={14} color={C.cinza} />
            </button>
          )}
          <button
            onClick={onBuscaSubmit}
            style={{ padding: "5px 12px", background: C.esmeralda, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Inputs de data personalizada — só quando período = personalizado */}
      {periodo === "personalizado" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: C.cinza, fontWeight: 600 }}>De:</label>
          <input
            type="date"
            value={dataInicioInput}
            onChange={(e) => onDataInicioChange(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.cremeBorder}`, fontSize: 12, background: "#fff", color: "#1f2937" }}
          />
          <label style={{ fontSize: 12, color: C.cinza, fontWeight: 600 }}>Até:</label>
          <input
            type="date"
            value={dataFimInput}
            onChange={(e) => onDataFimChange(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.cremeBorder}`, fontSize: 12, background: "#fff", color: "#1f2937" }}
          />
          <button
            onClick={onAplicarPersonalizado}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: C.esmeralda, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Filtrar
          </button>
          {temFiltroData && (
            <button
              onClick={onLimparData}
              style={{ padding: "5px 10px", borderRadius: 20, border: "none", background: C.vermelhoLt, color: C.vermelho, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              ✕ Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
