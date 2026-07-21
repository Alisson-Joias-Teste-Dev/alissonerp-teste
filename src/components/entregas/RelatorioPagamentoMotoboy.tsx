"use client";

/**
 * RelatorioPagamentoMotoboy — relatório de pagamento do motoboy por
 * ENTREGADOR + PERÍODO, dentro da aba "Pagamento do motoboy".
 *
 * REGRA DE NEGÓCIO (decisão do Jonathan, 21/07/2026 — ver
 * docs/regras-negocio/entregas.md §11-§12 e a memória
 * reference_relatorio_corridas_motoboy.md): substitui o processo manual
 * (PDF gerado por script Python que o Jonathan mandava ao financeiro). A
 * pessoa escolhe entregador + período, o sistema traz TODAS as corridas
 * confirmadas dele no período (avulsas e de pedido) já classificadas em
 * Pagar/Revisar/Não pagar — mas essa classificação é só uma SUGESTÃO.
 *
 * REGRA DE NEGÓCIO (mudança 21/07/2026, "o usuário pode revisar e ajustar os
 * pagamentos no relatório"): cada linha tem uma DECISÃO FINAL editável
 * (toggle Pagar/Não pagar), inicializada pela sugestão do sistema
 * (`decisaoInicialFinanceiro`) mas sobreponível pelo financeiro. O "Total a
 * pagar" do rodapé reflete a decisão FINAL (ajustada), não a sugestão crua.
 * Esse ajuste é EFÊMERO (fica só no estado deste componente, não é
 * persistido em nenhuma tabela nova) — a persistência de verdade acontece
 * quando o financeiro clica "Confirmar pagamento", que reusa a rota JÁ
 * EXISTENTE `POST /api/entregas-venda/motoboy/pagar` (mesmo mecanismo do
 * `PagamentoMotoboyPainel.tsx` acima na mesma aba) para as corridas
 * marcadas "pagar" e ainda não pagas — é ALI que vira fato gravado em
 * `pagamentos_motoboy`/`pagamentos_motoboy_itens`. Criar uma tabela nova só
 * para guardar o ajuste "ainda não pago" duplicaria o mecanismo que já
 * existe e decide exatamente isso (pago ou não pago).
 *
 * O QUE: SUBCOMPONENTE próprio (não inchar `PagamentoMotoboyPainel.tsx`,
 * que já cobre o pagamento em LOTE por checkbox, sem período/classificação)
 * — os dois convivem na mesma aba. Reusa `fmtBRL`/`fmtData`/`C` de
 * `./lista/formatters.tsx` e `getPublicUrl` para as fotos (proxy
 * autenticado, nunca embutir imagem).
 *
 * IMPACTO SE ALTERADO: a SUGESTÃO mora no BACKEND
 * (`classificarCorridaMotoboy`, src/lib/relatorio-pagamento-motoboy.ts) —
 * este componente exibe a sugestão e gerencia a decisão final ajustável,
 * nunca recalcula a sugestão em si.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, AlertTriangle, ImageOff, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import {
  MARCO_RELATORIO_PAGAMENTO_MOTOBOY,
  decisaoInicialFinanceiro,
  calcularTotalAjustado,
  type DecisaoPagamentoMotoboy,
} from "@/lib/relatorio-pagamento-motoboy";
import { fmtBRL, fmtData, C } from "./lista/formatters";

interface MotoboyOption {
  id: number;
  user_id: string;
  nome: string;
  ativo: boolean;
}

type Classificacao = "pagar" | "revisar" | "nao_pagar";

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
  motivo: string | null;
  foi_pago: boolean;
  fotos: string[];
}

interface RelatorioResponse {
  marco: string;
  corridas: CorridaRelatorio[];
  total_pagar: number;
  quantidade_pagar: number;
  quantidade_revisar: number;
  quantidade_nao_pagar: number;
}

/** Data (AAAA-MM-DD) de hoje, para default do campo "fim"/vencimento. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** dd/mm/aaaa a partir de 'AAAA-MM-DD' — mesmo formato do aviso do marco. */
function fmtMarco(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

export default function RelatorioPagamentoMotoboy() {
  const [motoboys, setMotoboys] = useState<MotoboyOption[]>([]);
  const [entregadorId, setEntregadorId] = useState("");
  const [inicio, setInicio] = useState(MARCO_RELATORIO_PAGAMENTO_MOTOBOY);
  const [fim, setFim] = useState(hojeISO());

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<RelatorioResponse | null>(null);

  // REGRA DE NEGÓCIO: decisão FINAL editável por corrida — inicializada pela
  // sugestão (`decisaoInicialFinanceiro`), mas o financeiro pode sobrepor
  // clicando no toggle da linha. Vive só neste estado (efêmero) até o
  // "Confirmar pagamento" persistir de verdade via motoboy/pagar.
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoPagamentoMotoboy>>({});

  const [dataVencimento, setDataVencimento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [confirmando, setConfirmando] = useState(false);
  const [sucessoPagamento, setSucessoPagamento] = useState("");

  const carregarMotoboys = useCallback(async () => {
    try {
      const data = await apiFetch<MotoboyOption[]>("/api/entregas-venda/motoboys?todos=true");
      setMotoboys(data.filter((m) => m.ativo));
    } catch {
      // ignora — mesmo padrão de PagamentoMotoboyPainel (select fica vazio)
    }
  }, []);

  useEffect(() => {
    carregarMotoboys();
  }, [carregarMotoboys]);

  /** Busca (ou re-busca, após confirmar pagamento) o relatório do período. */
  const buscarRelatorio = useCallback(async () => {
    if (!entregadorId) {
      setErro("Selecione um entregador.");
      return;
    }
    setCarregando(true);
    setErro("");
    setSucessoPagamento("");
    try {
      const params = new URLSearchParams({ entregadorId, inicio, fim });
      const resultado = await apiFetch<RelatorioResponse>(
        `/api/entregas-venda/motoboy/relatorio-pagamento?${params.toString()}`,
      );
      setDados(resultado);
      // REGRA DE NEGÓCIO: (re)inicializa a decisão de cada linha pela
      // sugestão do sistema — corridas já pagas não têm decisão (não são
      // editáveis, o toggle nem aparece pra elas).
      const novasDecisoes: Record<number, DecisaoPagamentoMotoboy> = {};
      for (const c of resultado.corridas) {
        if (!c.foi_pago) novasDecisoes[c.id] = decisaoInicialFinanceiro(c.classificacao);
      }
      setDecisoes(novasDecisoes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar relatório");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [entregadorId, inicio, fim]);

  function alternarDecisao(corridaId: number) {
    setDecisoes((atual) => ({
      ...atual,
      [corridaId]: atual[corridaId] === "pagar" ? "nao_pagar" : "pagar",
    }));
  }

  // REGRA DE NEGÓCIO: total REAL exibido — soma das corridas com decisão
  // FINAL "pagar" (após o financeiro revisar/ajustar), não a sugestão crua
  // que a rota devolveu. `calcularTotalAjustado` é a MESMA função testada em
  // relatorio-pagamento-motoboy.test.ts — não recalcular a soma aqui.
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
   * a MESMA rota `POST /api/entregas-venda/motoboy/pagar` que o
   * `PagamentoMotoboyPainel.tsx` já usa (pagamento em lote), mandando só as
   * corridas que o financeiro deixou marcadas "pagar" após revisar o
   * relatório. É essa chamada que persiste a decisão de verdade
   * (`pagamentos_motoboy`/`pagamentos_motoboy_itens`) — o toggle da tela é
   * só o rascunho até este clique.
   * IMPACTO SE ALTERADO: duplicar a lógica de pagamento aqui (em vez de
   * chamar a rota existente) criaria um segundo caminho para gravar
   * pagamento, arriscando divergir da validação de unicidade já garantida
   * lá (UNIQUE em pagamentos_motoboy_itens).
   */
  async function handleConfirmarPagamento() {
    if (idsParaPagar.length === 0) return;
    setConfirmando(true);
    setErro("");
    setSucessoPagamento("");
    try {
      const resultado = await apiFetch<{ message: string }>(
        "/api/entregas-venda/motoboy/pagar",
        {
          method: "POST",
          body: JSON.stringify({
            motoboy_id: entregadorId,
            entrega_ids: idsParaPagar,
            data_vencimento: dataVencimento,
          }),
        },
      );
      setSucessoPagamento(resultado.message ?? "Pagamento registrado.");
      // Rebusca o relatório — reflete `foi_pago=true` já persistido no banco
      // (fonte da verdade), em vez de tentar adivinhar o estado no client.
      await buscarRelatorio();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao confirmar pagamento");
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div>
      {/* REGRA DE NEGÓCIO: aviso PERMANENTE e visível — corridas anteriores ao
          marco já foram pagas manualmente (PDF antigo) e não entram aqui,
          nunca (evita pagamento em dobro ao entregador). */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "10px 12px", borderRadius: 6,
        background: C.ambarLt, color: "#92400E", fontSize: 12,
        marginBottom: 16,
      }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Corridas anteriores a <strong>{fmtMarco(MARCO_RELATORIO_PAGAMENTO_MOTOBOY)}</strong> já
          foram pagas e não entram neste relatório. A classificação abaixo é uma
          <strong> sugestão</strong> — revise e ajuste a decisão de cada corrida antes de confirmar o pagamento.
        </span>
      </div>

      {/* Filtros: entregador + período */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
            Entregador
          </label>
          <select value={entregadorId} onChange={(e) => setEntregadorId(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937" }}>
            <option value="">Selecione...</option>
            {motoboys.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
            Início
          </label>
          {/* REGRA DE NEGÓCIO: `min` bloqueia no seletor de data escolher antes
              do marco — a rota valida de novo no servidor (defesa em
              profundidade, o front nunca é a única barreira). */}
          <input type="date" value={inicio} min={MARCO_RELATORIO_PAGAMENTO_MOTOBOY}
            onChange={(e) => setInicio(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937" }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
            Fim
          </label>
          <input type="date" value={fim} min={MARCO_RELATORIO_PAGAMENTO_MOTOBOY}
            onChange={(e) => setFim(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937" }} />
        </div>
        <button onClick={buscarRelatorio} disabled={carregando}
          style={{
            padding: "10px 16px", borderRadius: 6, border: "none",
            background: C.esmeralda, color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer", opacity: carregando ? 0.6 : 1,
            display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          }}>
          {carregando && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
          Gerar relatório
        </button>
      </div>

      {erro && (
        <div style={{ padding: 10, borderRadius: 6, background: C.vermelhoLt, color: C.vermelho, fontSize: 12, marginBottom: 12 }}>
          {erro}
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
              Nenhuma corrida confirmada deste entregador no período selecionado.
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
                          {c.motivo && (
                            <div style={{ fontSize: 10, color: C.cinza, marginTop: 3, maxWidth: 220 }}>{c.motivo}</div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {c.foi_pago ? (
                            <span style={{ padding: "3px 8px", borderRadius: 999, background: C.esmeraldaLt, color: C.esmeralda, fontWeight: 700, fontSize: 11 }}>
                              Já paga
                            </span>
                          ) : (
                            // REGRA DE NEGÓCIO: toggle editável — a sugestão é só o
                            // ponto de partida (decisaoInicialFinanceiro), o
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
              {dados.quantidade_pagar} sugestão-pagar · {dados.quantidade_revisar} revisar · {dados.quantidade_nao_pagar} não pagar
              {" · "}{idsParaPagar.length} selecionada(s) para pagar agora
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.esmeralda }}>
              Total a pagar (após revisão): {fmtBRL(totalAjustado)}
            </span>
          </div>

          {dados.corridas.length > 0 && (
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
