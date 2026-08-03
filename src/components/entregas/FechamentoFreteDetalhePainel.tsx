"use client";

/**
 * FechamentoFreteDetalhePainel — página de detalhe de UM fechamento mensal da
 * verba de frete grátis (03/08/2026, mockup aprovado pelo Jonathan; pedido:
 * "preciso abrir e ver tudo que é referente a esse fechamento").
 *
 * O QUE: cabeçalho + memória de cálculo da verba + trilha do saldo + a lista
 * completa dos lançamentos que o fechamento carimbou, cada um amarrado à
 * entrega/venda/cliente que o originou. READ-ONLY — nenhuma ação de escrita
 * (o fechamento é da rotina do dia 01, ver FechamentosFretePainel.tsx).
 *
 * ⚠️ REGRA DE NEGÓCIO — os DOIS blocos de lançamento (o detalhe que faz as
 * contas fecharem): os lançamentos com `doFechamento = true` são os que a
 * PRÓPRIA rotina gravou (zeragem do saldo + verba nova). Eles NÃO entram nos
 * totais do mês — somar tudo junto não reproduz `totalCreditos`/`totalDebitos`
 * do cabeçalho (no fechamento #1 daria R$ 1.457,37 / R$ 706,36 em vez de
 * R$ 706,36 / R$ 697,00). Ver o comentário de `obterFechamentoFreteDetalhe`
 * (src/lib/frete-fechamento.ts) para o critério exato.
 *
 * Os números dos cards vêm do CABEÇALHO (colunas gravadas pelo fechamento),
 * nunca de soma feita aqui — o cabeçalho é o que foi de fato apurado no dia,
 * e recalcular no front abriria uma 2ª fonte de verdade.
 *
 * IMPACTO SE ALTERADO: esta é a única tela que explica de onde saiu a verba do
 * mês — é o que a gerente e o chefe abrem quando questionam o valor.
 */

import { useState } from "react";
import Link from "next/link";
import type {
  FechamentoFreteDetalhe,
  LancamentoFechamentoFrete,
} from "@/lib/frete-fechamento";
import { fmtBRL, fmtDtHr, C } from "./lista/formatters";

/** Badge de status do fechamento — MESMOS 4 valores/cores de FechamentosFretePainel.tsx. */
function badgeStatusFechamento(status: FechamentoFreteDetalhe["cabecalho"]["status"]) {
  switch (status) {
    case "fechado":
      return { text: "Fechado", color: C.verde, bg: C.verdeLt };
    case "aguardando_aprovacao":
      return { text: "Aguardando aprovação", color: C.ambar, bg: C.ambarLt };
    case "pago":
      return { text: "Pago", color: C.esmeralda, bg: C.esmeraldaLt };
    case "recusado":
      return { text: "Recusado", color: C.vermelho, bg: C.vermelhoLt };
    default:
      return { text: status, color: C.cinza, bg: C.cremeBg };
  }
}

/** "agosto de 2026" a partir de "YYYY-MM-DD" — mesma função de FechamentosFretePainel. */
function fmtMesReferencia(mesReferencia: string): string {
  const [y, m] = mesReferencia.slice(0, 10).split("-");
  if (!y || !m) return mesReferencia || "—";
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Mês ANTERIOR ao de referência — é dele que sai o faturamento base da verba. */
function fmtMesBase(mesReferencia: string): string {
  const [y, m] = mesReferencia.slice(0, 10).split("-");
  if (!y || !m) return "—";
  return new Date(Number(y), Number(m) - 2, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** dd/mm — a lista é sempre do mesmo período, o ano só polui. */
function fmtDiaMes(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Link para a entrega na listagem (busca por código — a listagem já filtra por
 * `codigo_entrega`). Entrega cancelada/solicitada precisa do `situacao` na URL:
 * o default da listagem EXCLUI as duas (ver whereSituacao em page.tsx), então
 * sem isso o link abriria uma lista vazia — e vários lançamentos daqui são
 * justamente estornos de entrega cancelada.
 */
function hrefEntrega(l: LancamentoFechamentoFrete): string {
  const base = `/entregas-venda?busca=${encodeURIComponent(l.codigoEntrega ?? "")}`;
  return l.situacaoEntrega === "cancelada" || l.situacaoEntrega === "solicitada"
    ? `${base}&situacao=${l.situacaoEntrega}`
    : base;
}

type FiltroLancamento = "todos" | "credito" | "debito" | "ajuste";

interface Props {
  detalhe: FechamentoFreteDetalhe;
}

export default function FechamentoFreteDetalhePainel({ detalhe }: Props) {
  const { cabecalho: f, lancamentos, aprovacao } = detalhe;
  const [filtro, setFiltro] = useState<FiltroLancamento>("todos");

  const doMes = lancamentos.filter((l) => !l.doFechamento);
  const doFechamento = lancamentos.filter((l) => l.doFechamento);

  // "Ajuste" = lançamento sem entrega vinculada (ajuste manual/correção feita
  // direto no saldo). Não é um tipo no banco — é a leitura de "não veio de uma
  // corrida", que é exatamente o que o Jonathan precisa isolar ao auditar.
  const filtrados = doMes.filter((l) =>
    filtro === "todos" ? true
    : filtro === "ajuste" ? l.entregaId == null
    : l.tipo === filtro && l.entregaId != null
  );

  const qtdCreditos = doMes.filter((l) => l.tipo === "credito").length;
  const qtdDebitos = doMes.filter((l) => l.tipo === "debito").length;
  const qtdAjustes = doMes.filter((l) => l.entregaId == null).length;

  const badge = badgeStatusFechamento(f.status);
  const chip = (id: FiltroLancamento, label: string, qtd: number) => (
    <button
      key={id}
      onClick={() => setFiltro(id)}
      style={{
        padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
        cursor: "pointer", border: "none",
        background: filtro === id ? C.esmeralda : C.cremeBg,
        color: filtro === id ? "#fff" : C.cinza,
      }}
    >
      {label} ({qtd})
    </button>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <Link
        href="/entregas-venda?aba=fechamentos"
        style={{ fontSize: 12, color: C.cinza, fontWeight: 600 }}
      >
        ← Fechamentos de frete
      </Link>

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 10, border: `1px solid ${C.cremeBorder}`,
        padding: 20, marginTop: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{
              fontSize: 18, fontWeight: 700, color: C.esmeralda, margin: 0,
              textTransform: "capitalize",
            }}>
              Fechamento de {fmtMesReferencia(f.mesReferencia)}
            </h1>
            <p style={{ fontSize: 12, color: C.cinza, margin: "4px 0 0" }}>
              {f.gerenteNome} · executado em {fmtDtHr(f.createdAt)} · fechamento #{f.id}
            </p>
          </div>
          <span style={{
            padding: "4px 12px", borderRadius: 999, background: badge.bg,
            color: badge.color, fontWeight: 700, fontSize: 11, alignSelf: "flex-start",
          }}>
            {badge.text}
          </span>
        </div>

        {/* ── Cards: números do CABEÇALHO (não recalculados aqui) ─────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10, marginTop: 16,
        }}>
          {[
            { label: "Créditos do mês", valor: fmtBRL(f.totalCreditos), hint: `${qtdCreditos} lançamentos`, cor: undefined },
            { label: "Débitos do mês", valor: fmtBRL(f.totalDebitos), hint: `${qtdDebitos} lançamentos`, cor: undefined },
            { label: "Saldo apurado", valor: fmtBRL(f.saldoFinal), hint: "zerado no fechamento", cor: f.saldoFinal >= 0 ? C.verde : C.vermelho },
            { label: "Verba creditada", valor: fmtBRL(f.verbaCreditada), hint: fmtMesReferencia(f.mesReferencia), cor: C.esmeralda },
          ].map((c) => (
            <div key={c.label} style={{ background: C.cremeBg, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.cinza }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: c.cor }}>{c.valor}</div>
              <div style={{ fontSize: 11, color: C.cinza, textTransform: "capitalize" }}>{c.hint}</div>
            </div>
          ))}
        </div>

        {/* ── Memória de cálculo da verba ──────────────────────────────────── */}
        <div style={{ background: C.esmeraldaLt, borderRadius: 8, padding: "12px 14px", marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.esmeralda, marginBottom: 6 }}>
            Memória de cálculo da verba
          </div>
          <div style={{ fontSize: 12, color: C.esmeralda, lineHeight: 1.7, textTransform: "capitalize" }}>
            Faturamento de {fmtMesBase(f.mesReferencia)} — <strong>{fmtBRL(f.faturamentoBase)}</strong>
          </div>
          <div style={{ fontSize: 12, color: C.esmeralda, lineHeight: 1.7 }}>
            × {f.percentualVerba}% (config <code>percentual_verba_frete</code>) = <strong>{fmtBRL(f.verbaCreditada)}</strong>
          </div>
        </div>

        {/* ── Trilha do saldo ───────────────────────────────────────────────
            REGRA DE NEGÓCIO: o saldo NÃO acumula de um mês pro outro — o
            fechamento zera o que sobrou (positivo vira débito, negativo vira
            crédito) e a verba nova entra por cima. Esta linha é a leitura
            visual disso. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          fontSize: 12, color: C.cinza, marginTop: 14,
        }}>
          <span style={{ fontWeight: 700, color: "#111" }}>Como o saldo andou:</span>
          <span style={{ padding: "3px 9px", borderRadius: 6, background: C.cremeBg }}>{fmtBRL(f.saldoFinal)}</span>
          <span>→</span>
          <span style={{ padding: "3px 9px", borderRadius: 6, background: C.cremeBg }}>
            {f.saldoFinal >= 0 ? "zeragem" : "crédito de zeragem"} {fmtBRL(-f.saldoFinal)}
          </span>
          <span>→</span>
          <span style={{ padding: "3px 9px", borderRadius: 6, background: C.cremeBg }}>{fmtBRL(0)}</span>
          <span>→</span>
          <span style={{
            padding: "3px 9px", borderRadius: 6, background: C.verdeLt,
            color: C.verde, fontWeight: 700,
          }}>
            verba +{fmtBRL(f.verbaCreditada)}
          </span>
        </div>
      </div>

      {/* ── Bloco de aprovação (só quando o mês fechou negativo) ───────────── */}
      {aprovacao && (
        <div style={{
          background: "#fff", borderRadius: 10, border: `1px solid ${C.cremeBorder}`,
          padding: 20, marginTop: 14,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: "0 0 10px" }}>
            Aprovação do saldo negativo
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {[
              { label: "Solicitado em", valor: fmtDtHr(aprovacao.criadoEm) },
              { label: "Aprovador", valor: aprovacao.aprovadorNome ?? "—" },
              {
                label: "Decisão",
                valor: aprovacao.statusAprovacao === "aprovado" ? "Aprovado"
                  : aprovacao.statusAprovacao === "recusado" ? "Recusado"
                  : "Pendente",
              },
              { label: "Decidido em", valor: aprovacao.respondidoEm ? fmtDtHr(aprovacao.respondidoEm) : "—" },
            ].map((c) => (
              <div key={c.label}>
                <div style={{ fontSize: 11, color: C.cinza }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{c.valor}</div>
              </div>
            ))}
          </div>

          {aprovacao.motivo && (
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 8,
              background: C.vermelhoLt, color: C.vermelho, fontSize: 12,
            }}>
              <strong>Motivo da recusa:</strong> {aprovacao.motivo}
            </div>
          )}

          <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <Link href={`/tarefas?abrir=${aprovacao.tarefaId}`} style={{ color: C.esmeralda, fontWeight: 600, fontSize: 12 }}>
              Ver tarefa #{aprovacao.tarefaId}
            </Link>
            {f.contaPagarId != null && (
              /* Sem deep-link por id em /financeiro/a-pagar — mesma limitação
                 já registrada em FechamentosFretePainel.tsx. */
              <Link href="/financeiro/a-pagar" style={{ color: C.esmeralda, fontWeight: 600, fontSize: 12 }}>
                Conta a pagar #{f.contaPagarId}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Lançamentos do mês ────────────────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 10, border: `1px solid ${C.cremeBorder}`,
        padding: 20, marginTop: 14,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10, flexWrap: "wrap", marginBottom: 10,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: 0 }}>
            Movimento do mês{" "}
            <span style={{ color: C.cinza, fontWeight: 400 }}>· {doMes.length} lançamentos</span>
          </h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {chip("todos", "Todos", doMes.length)}
            {chip("credito", "Créditos", qtdCreditos)}
            {chip("debito", "Débitos", qtdDebitos)}
            {chip("ajuste", "Ajustes", qtdAjustes)}
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p style={{ fontSize: 13, color: C.cinza, textAlign: "center", padding: 20 }}>
            Nenhum lançamento neste filtro.
          </p>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${C.cremeBorder}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.cremeBg, textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>Data</th>
                  <th style={{ padding: "8px 10px" }}>Entrega</th>
                  <th style={{ padding: "8px 10px" }}>Cliente</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Cobrado</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Motoboy</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Efeito</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => {
                  const ehAjuste = l.entregaId == null;
                  const cor = l.tipo === "credito" ? C.verde : C.vermelho;
                  const sinal = l.tipo === "credito" ? "+" : "−";
                  return (
                    <tr key={l.id} style={{
                      borderTop: `1px solid ${C.cremeBorder}`,
                      background: ehAjuste ? C.ambarLt : undefined,
                    }}>
                      <td style={{ padding: "8px 10px", color: C.cinza, whiteSpace: "nowrap" }}>
                        {fmtDiaMes(l.createdAt)}
                      </td>
                      {ehAjuste ? (
                        /* Ajuste manual não tem entrega/cliente/valores de frete —
                           a descrição ocupa as 4 colunas em vez de deixar tudo "—". */
                        <td colSpan={4} style={{ padding: "8px 10px", color: C.ambar }}>
                          {l.descricao}
                        </td>
                      ) : (
                        <>
                          <td style={{ padding: "8px 10px" }}>
                            <Link href={hrefEntrega(l)} style={{ color: C.esmeralda, fontWeight: 600 }}>
                              {l.codigoEntrega}
                            </Link>
                            <div style={{ color: C.cinza, fontSize: 11 }}>
                              {l.vendaId != null && l.numeroVenda ? (
                                <Link href={`/vendas/${l.vendaId}`} style={{ color: C.cinza }}>
                                  venda {l.numeroVenda}
                                </Link>
                              ) : "—"}
                              {l.situacaoEntrega === "cancelada" && " · cancelada"}
                            </div>
                          </td>
                          {/* Frete avulso é corrida sem venda e sem cliente
                              (CONFERIDO: 6 dos 68 lançamentos do fechamento #1).
                              Mostrar "—" jogaria fora a única informação que
                              existe sobre a corrida — o que o motoboy foi fazer. */}
                          <td style={{ padding: "8px 10px" }}>
                            {l.clienteNome ?? (
                              l.isAvulso ? (
                                <span style={{ color: C.cinza, fontStyle: "italic" }}>
                                  Avulso — {l.descricaoAvulso ?? "sem descrição"}
                                </span>
                              ) : "—"
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }}>
                            {l.freteCobrado != null ? fmtBRL(l.freteCobrado) : "—"}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }}>
                            {l.freteMotoboy != null ? fmtBRL(l.freteMotoboy) : "—"}
                          </td>
                        </>
                      )}
                      <td style={{
                        padding: "8px 10px", textAlign: "right", fontWeight: 700,
                        color: ehAjuste ? C.ambar : cor, whiteSpace: "nowrap",
                      }}>
                        {sinal}{fmtBRL(l.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Lançamentos gerados pela própria rotina ─────────────────────── */}
        {doFechamento.length > 0 && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: "18px 0 4px" }}>
              Lançamentos gerados pelo fechamento{" "}
              <span style={{ color: C.cinza, fontWeight: 400 }}>· {doFechamento.length}</span>
            </h2>
            <p style={{ fontSize: 11, color: C.cinza, margin: "0 0 8px" }}>
              Não entram nos totais do mês acima — são o efeito do próprio fechamento sobre o saldo.
            </p>
            <div style={{ border: `1px solid ${C.cremeBorder}`, borderRadius: 8, overflow: "hidden" }}>
              {doFechamento.map((l, i) => (
                <div key={l.id} style={{
                  display: "flex", justifyContent: "space-between", gap: 10,
                  padding: "8px 10px", fontSize: 12,
                  borderTop: i === 0 ? undefined : `1px solid ${C.cremeBorder}`,
                }}>
                  <span style={{ color: C.cinza }}>#{l.id} · {l.descricao}</span>
                  <span style={{
                    fontWeight: 700, whiteSpace: "nowrap",
                    color: l.tipo === "credito" ? C.verde : C.vermelho,
                  }}>
                    {l.tipo === "credito" ? "+" : "−"}{fmtBRL(l.valor)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
