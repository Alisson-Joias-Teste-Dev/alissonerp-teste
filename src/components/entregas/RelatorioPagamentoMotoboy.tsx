"use client";

/**
 * RelatorioPagamentoMotoboy — detalhe de UM relatório de pagamento SALVO
 * (tabela de corridas com fotos e ajuste por linha), dentro da aba
 * "Pagamento do motoboy".
 *
 * REGRA DE NEGÓCIO (reforma 21/07/2026 — relatórios PERSISTIDOS, mockup
 * aprovado pelo Jonathan; ver docs/regras-negocio/entregas.md §12.8): até
 * aqui este componente TINHA o formulário (entregador+período+"Gerar
 * relatório") e calculava em tempo real. Agora esse formulário mudou de
 * lugar — mora em `PagamentoMotoboyPainel.tsx` (que virou "criar relatório +
 * lista paginada"). Este componente passou a ser SÓ o "Abrir": recebe
 * `relatorioId` de um relatório JÁ CRIADO, carrega o detalhe
 * (`GET /motoboy/relatorio-pagamento/[id]`) e mostra a tabela de corridas —
 * REUSADO tal como pedido na task ("REUSE RelatorioPagamentoMotoboy.tsx que
 * já existe"), só a fonte de dados mudou (de "calcular por período" para
 * "carregar relatório salvo").
 *
 * REGRA DE NEGÓCIO: cada corrida (ainda não paga) tem uma DECISÃO editável
 * (toggle Pagar/Não pagar), inicializada pela decisão PERSISTIDA na criação
 * do relatório (`decisaoInicialFinanceiro`, gravada em
 * `relatorios_pagamento_motoboy_itens.decisao`). O ajuste enquanto a tela
 * está aberta continua sendo efêmero no estado React (igual antes) — vira
 * fato gravado só quando "Confirmar pagamento" é clicado AQUI DENTRO (o
 * body da confirmação manda a decisão atual de cada linha).
 *
 * PAGO = HISTÓRICO TRAVADO: quando `status === 'pago'`, nenhuma linha tem
 * toggle (só o badge "Paga"/"Não paga" fixo) e não há botão de confirmar —
 * o relatório não reedita, não paga de novo.
 *
 * IMPACTO SE ALTERADO: a SUGESTÃO (classificação) mora no BACKEND, snapshot
 * gravado na criação do relatório — este componente exibe e gerencia o
 * ajuste da decisão FINAL, nunca recalcula a sugestão em si.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, ImageOff, CheckCircle, X, Lock } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import {
  calcularTotalAjustado,
  type DecisaoPagamentoMotoboy,
} from "@/lib/relatorio-pagamento-motoboy";
import { fmtBRL, fmtData, C } from "./lista/formatters";

type Classificacao = "pagar" | "revisar" | "nao_pagar";
type StatusRelatorio = "aguardando" | "pago";

interface CorridaRelatorio {
  id: number;
  codigo_entrega: string;
  venda_id: number | null;
  numero_venda: string | null;
  cliente_nome: string | null;
  is_avulso: boolean;
  descricao_avulso: string | null;
  regiao: string | null;
  frete_motoboy: number;
  data_entrega_realizada: string | null;
  classificacao: Classificacao;
  decisao: DecisaoPagamentoMotoboy;
  foi_pago: boolean;
  fotos: string[];
}

interface RelatorioDetalhe {
  id: number;
  motoboy_id: string;
  motoboy_nome: string;
  data_inicio: string;
  data_fim: string;
  status: StatusRelatorio;
  total_sugerido: number;
  created_at: string;
  pago_em: string | null;
  corridas: CorridaRelatorio[];
}

/** Badge da SUGESTÃO do sistema — mesmo espírito de statusBadge (formatters.tsx). */
function badgeSugestao(classificacao: Classificacao) {
  switch (classificacao) {
    case "pagar":
      return { text: "Pagar", color: C.verde, bg: C.verdeLt };
    case "revisar":
      return { text: "Revisar", color: C.ambar, bg: C.ambarLt };
    case "nao_pagar":
      return { text: "Não pagar", color: C.vermelho, bg: C.vermelhoLt };
  }
}

interface RelatorioPagamentoMotoboyProps {
  /** ID do relatório salvo a abrir (nunca calcula por período aqui). */
  relatorioId: number;
  /** Fecha o painel de detalhe (volta só pra lista). */
  onFechar: () => void;
  /** Chamado após confirmar pagamento com sucesso — pai re-busca a lista (status muda para "pago"). */
  onConfirmado: () => void;
}

export default function RelatorioPagamentoMotoboy({ relatorioId, onFechar, onConfirmado }: RelatorioPagamentoMotoboyProps) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<RelatorioDetalhe | null>(null);

  // Decisão FINAL editável por corrida — só existe entrada para corridas
  // ainda não pagas (foi_pago=false); inicializada pela decisão persistida.
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoPagamentoMotoboy>>({});

  const [dataVencimento, setDataVencimento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [confirmando, setConfirmando] = useState(false);
  const [sucessoPagamento, setSucessoPagamento] = useState("");

  const buscarDetalhe = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const resultado = await apiFetch<RelatorioDetalhe>(
        `/api/entregas-venda/motoboy/relatorio-pagamento/${relatorioId}`,
      );
      setDados(resultado);
      const novasDecisoes: Record<number, DecisaoPagamentoMotoboy> = {};
      for (const c of resultado.corridas) {
        if (!c.foi_pago) novasDecisoes[c.id] = c.decisao;
      }
      setDecisoes(novasDecisoes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar relatório");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [relatorioId]);

  useEffect(() => {
    buscarDetalhe();
  }, [buscarDetalhe]);

  function alternarDecisao(corridaId: number) {
    setDecisoes((atual) => ({
      ...atual,
      [corridaId]: atual[corridaId] === "pagar" ? "nao_pagar" : "pagar",
    }));
  }

  const totalAjustado = useMemo(() => {
    if (!dados) return 0;
    return calcularTotalAjustado(
      dados.corridas.map((c) => ({
        decisaoFinal: decisoes[c.id] ?? "nao_pagar",
        freteMotoboy: c.frete_motoboy,
        foiPago: c.foi_pago,
      })),
    );
  }, [dados, decisoes]);

  const idsParaPagar = useMemo(
    () => (dados?.corridas ?? []).filter((c) => !c.foi_pago && decisoes[c.id] === "pagar").map((c) => c.id),
    [dados, decisoes],
  );

  /**
   * REGRA DE NEGÓCIO: "Confirmar pagamento" NÃO cria mecanismo novo — reusa
   * `criarPagamentoMotoboyTx`/`buscarEntregasValidasParaPagar` (mesma
   * validação e MESMO INSERT de `motoboy/pagar`), agora via
   * `POST .../relatorio-pagamento/[id]/confirmar`, mandando a decisão ATUAL
   * de cada corrida ainda não paga (inclui "nao_pagar" explícito para quem
   * o financeiro desmarcou, não só as marcadas "pagar" — o backend usa isso
   * pra sobrepor a decisão persistida na criação).
   */
  async function handleConfirmarPagamento() {
    if (!dados || idsParaPagar.length === 0) return;
    setConfirmando(true);
    setErro("");
    setSucessoPagamento("");
    try {
      const decisoesBody: Record<string, DecisaoPagamentoMotoboy> = {};
      for (const c of dados.corridas) {
        if (!c.foi_pago) decisoesBody[String(c.id)] = decisoes[c.id] ?? "nao_pagar";
      }
      const resultado = await apiFetch<{ message: string }>(
        `/api/entregas-venda/motoboy/relatorio-pagamento/${relatorioId}/confirmar`,
        {
          method: "POST",
          body: JSON.stringify({ decisoes: decisoesBody, data_vencimento: dataVencimento }),
        },
      );
      setSucessoPagamento(resultado.message ?? "Pagamento registrado.");
      // Rebusca o relatório — reflete status='pago' e foi_pago=true já
      // persistidos no banco (fonte da verdade), em vez de adivinhar no client.
      await buscarDetalhe();
      onConfirmado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao confirmar pagamento");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      border: `1px solid ${C.cremeBorder}`, padding: 20, marginBottom: 20,
    }}>
      {/* Cabeçalho do detalhe + fechar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: 0 }}>
          {dados ? `Relatório — ${dados.motoboy_nome} (${fmtData(dados.data_inicio)} a ${fmtData(dados.data_fim)})` : "Relatório de pagamento"}
        </h3>
        <button onClick={onFechar} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
          <X size={16} color={C.cinza} />
        </button>
      </div>

      {carregando && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <Loader2 size={20} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {erro && (
        <div style={{ padding: 10, borderRadius: 6, background: C.vermelhoLt, color: C.vermelho, fontSize: 12, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {dados && dados.status === "pago" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", borderRadius: 6,
          background: C.esmeraldaLt, color: C.esmeralda, fontSize: 12, fontWeight: 600,
          marginBottom: 16,
        }}>
          <Lock size={14} />
          <span>
            Relatório PAGO em {dados.pago_em ? fmtData(dados.pago_em) : "—"} — histórico travado,
            não pode ser reeditado nem pago novamente.
          </span>
        </div>
      )}

      {dados && dados.status === "aguardando" && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "10px 12px", borderRadius: 6,
          background: C.ambarLt, color: "#92400E", fontSize: 12,
          marginBottom: 16,
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            A classificação abaixo é uma <strong>sugestão</strong> — revise e ajuste a decisão de
            cada corrida antes de confirmar o pagamento.
          </span>
        </div>
      )}

      {sucessoPagamento && (
        <div style={{ padding: 10, borderRadius: 6, background: C.verdeLt, color: C.verde, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
          {sucessoPagamento}
        </div>
      )}

      {dados && (
        <>
          {dados.corridas.length === 0 ? (
            <p style={{ fontSize: 13, color: C.cinza, textAlign: "center", padding: 20 }}>
              Este relatório não tem corridas.
            </p>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.cremeBorder}`, borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.cremeBg, textAlign: "left" }}>
                    <th style={{ padding: "8px 10px" }}>Código</th>
                    <th style={{ padding: "8px 10px" }}>Data</th>
                    <th style={{ padding: "8px 10px" }}>Venda / Cliente</th>
                    <th style={{ padding: "8px 10px" }}>Tipo</th>
                    <th style={{ padding: "8px 10px" }}>Fotos</th>
                    <th style={{ padding: "8px 10px" }}>Sugestão</th>
                    <th style={{ padding: "8px 10px" }}>Decisão</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Frete</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.corridas.map((c) => {
                    const badge = badgeSugestao(c.classificacao);
                    const decisao = decisoes[c.id] ?? "nao_pagar";
                    const editavel = dados.status === "aguardando" && !c.foi_pago;
                    return (
                      <tr key={c.id} style={{ borderTop: `1px solid ${C.cremeBorder}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{c.codigo_entrega}</td>
                        <td style={{ padding: "8px 10px" }}>{fmtData(c.data_entrega_realizada)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {c.numero_venda ? `Venda ${c.numero_venda}` : (c.descricao_avulso || "Avulsa sem venda")}
                          {c.cliente_nome && <div style={{ fontSize: 10, color: C.cinza }}>{c.cliente_nome}</div>}
                        </td>
                        <td style={{ padding: "8px 10px" }}>{c.is_avulso ? "Avulsa" : "Pedido"}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {c.fotos.length === 0 ? (
                            <span style={{ color: C.cinza, display: "flex", alignItems: "center", gap: 4 }}>
                              <ImageOff size={13} /> —
                            </span>
                          ) : (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {c.fotos.map((url, i) => (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                                  style={{ color: C.esmeralda, fontWeight: 600 }}>
                                  Foto {i + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ padding: "3px 8px", borderRadius: 999, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: 11 }}>
                            {badge.text}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {c.foi_pago ? (
                            <span style={{ padding: "3px 8px", borderRadius: 999, background: C.esmeraldaLt, color: C.esmeralda, fontWeight: 700, fontSize: 11 }}>
                              Já paga
                            </span>
                          ) : editavel ? (
                            // REGRA DE NEGÓCIO: toggle editável — a sugestão é só o
                            // ponto de partida (decisão persistida na criação), o
                            // financeiro pode sobrepor clicando aqui.
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={() => decisao !== "pagar" && alternarDecisao(c.id)}
                                style={{
                                  padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${decisao === "pagar" ? C.verde : C.cremeBorder}`,
                                  background: decisao === "pagar" ? C.verdeLt : "#fff",
                                  color: decisao === "pagar" ? C.verde : C.cinza,
                                  cursor: "pointer",
                                }}>
                                Pagar
                              </button>
                              <button
                                onClick={() => decisao !== "nao_pagar" && alternarDecisao(c.id)}
                                style={{
                                  padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${decisao === "nao_pagar" ? C.vermelho : C.cremeBorder}`,
                                  background: decisao === "nao_pagar" ? C.vermelhoLt : "#fff",
                                  color: decisao === "nao_pagar" ? C.vermelho : C.cinza,
                                  cursor: "pointer",
                                }}>
                                Não pagar
                              </button>
                            </div>
                          ) : (
                            // Relatório já PAGO (histórico travado) — só exibe a
                            // decisão final gravada, sem toggle.
                            <span style={{ padding: "3px 8px", borderRadius: 999, background: c.decisao === "pagar" ? C.verdeLt : C.vermelhoLt, color: c.decisao === "pagar" ? C.verde : C.vermelho, fontWeight: 700, fontSize: 11 }}>
                              {c.decisao === "pagar" ? "Pagar" : "Não pagar"}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>
                          {fmtBRL(c.frete_motoboy)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Rodapé: total AJUSTADO (após revisão) + confirmação do pagamento */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.cremeBorder}`, marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.cinza }}>
              {dados.status === "pago" ? "Histórico do pagamento confirmado" : `${idsParaPagar.length} selecionada(s) para pagar agora`}
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.esmeralda }}>
              {dados.status === "pago" ? "Total pago: " : "Total a pagar (após revisão): "}{fmtBRL(dados.status === "pago" ? dados.total_sugerido : totalAjustado)}
            </span>
          </div>

          {dados.status === "aguardando" && dados.corridas.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
                  Vencimento da conta a pagar
                </label>
                <input type="date" value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  style={{ padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937" }} />
              </div>
              <button onClick={handleConfirmarPagamento} disabled={idsParaPagar.length === 0 || confirmando}
                style={{
                  padding: "10px 16px", borderRadius: 8, border: "none",
                  background: idsParaPagar.length > 0 ? C.esmeralda : "#9CA3AF",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: idsParaPagar.length > 0 ? "pointer" : "not-allowed",
                  opacity: confirmando ? 0.6 : 1,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                <CheckCircle size={15} />
                {confirmando ? "Confirmando..." : `Confirmar pagamento de ${idsParaPagar.length} corrida(s)`}
              </button>
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
