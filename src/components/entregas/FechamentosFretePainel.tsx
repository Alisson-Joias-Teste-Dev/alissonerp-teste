"use client";

/**
 * FechamentosFretePainel — aba "Fechamentos de frete": relatório READ-ONLY,
 * mês a mês, dos fechamentos gravados por `fecharMesFreteGratisAutomatico`
 * (BLOCO 4, `src/lib/frete-fechamento.ts`) — BLOCO 5 (21/07/2026, mockup
 * aprovado pelo Jonathan; ver docs/regras-negocio/entregas.md §10.6).
 *
 * O QUE: lista PAGINADA (10/página, SSR via `fechamentosSSR` — MESMO padrão
 * de `relatoriosSSR` em PagamentoMotoboyPainel.tsx) dos fechamentos mensais,
 * do mês mais recente pro mais antigo: verba creditada, créditos, débitos,
 * saldo final (verde se >= 0, vermelho se < 0) e o status do ciclo de
 * aprovação/pagamento do saldo negativo (Fechado / Aguardando aprovação /
 * Pago / Recusado), com link pra tarefa (`/tarefas?abrir=<id>` — MESMO
 * contrato de deep-link já usado pelas notificações de tarefa, ver
 * TarefasClient.tsx ~L666) e/ou conta a pagar quando existir.
 *
 * REGRA DE NEGÓCIO: 100% READ-ONLY — o fechamento em si é feito pela rotina
 * automática do dia 01 (cron) ou disparo manual do endpoint de fechamento
 * (`POST /api/entregas-venda/fechamento-frete-cron`), NUNCA por esta tela.
 * Não há formulário, não há ação de linha — só leitura. Por isso, ao
 * contrário de PagamentoMotoboyPainel, não precisa de `apiFetch`/estado de
 * recarregamento client-side (não existe ação que exija refresh sem
 * navegação de página).
 *
 * ⚠️ Não linka direto pra dentro de uma conta a pagar específica — a tela
 * `/financeiro/a-pagar` (FinanceiroClient.tsx) não tem um contrato de
 * deep-link por id (diferente de `/tarefas?abrir=`, que já existe). O link
 * "Conta a pagar #N" leva pra aba geral; o Jonathan decide se vale a pena
 * abrir um contrato de deep-link lá também.
 *
 * IMPACTO SE ALTERADO: mexer na paginação sem sincronizar com `page.tsx`
 * (SSR) desalinha "Mostrando X–Y de Z", mesmo risco de PagamentoMotoboyPainel.
 */

import Link from "next/link";
import Paginacao from "@/components/ui/Paginacao";
import type { FechamentoFreteListItem } from "@/lib/frete-fechamento";
import { fmtBRL, C } from "./lista/formatters";

/** Badge de status do fechamento — os 4 valores do domínio (migration 356, CHECK). */
function badgeStatusFechamento(status: FechamentoFreteListItem["status"]) {
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

/** "julho de 2026" a partir de "YYYY-MM-DD" (mes_referencia é sempre dia 1). */
function fmtMesReferencia(mesReferencia: string): string {
  const [y, m] = mesReferencia.slice(0, 10).split("-");
  if (!y || !m) return mesReferencia || "—";
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

interface FechamentosFretePainelProps {
  /** Página atual (SSR, já paginada por page.tsx) de fechamentos. */
  fechamentosSSR: FechamentoFreteListItem[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export default function FechamentosFretePainel({
  fechamentosSSR,
  currentPage,
  totalPages,
  totalItems,
  pageSize,
}: FechamentosFretePainelProps) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      border: `1px solid ${C.cremeBorder}`, padding: 20,
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: 0 }}>
          Fechamentos mensais da verba de frete grátis
        </h3>
        <p style={{ fontSize: 11, color: C.cinza, margin: "4px 0 0" }}>
          Relatório — o fechamento é feito pela rotina automática do dia 01, não por esta tela.
          Clique no mês para ver os lançamentos que compõem cada fechamento.
        </p>
      </div>

      {fechamentosSSR.length === 0 ? (
        <p style={{ fontSize: 13, color: C.cinza, textAlign: "center", padding: 20 }}>
          Nenhum fechamento registrado ainda.
        </p>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.cremeBorder}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.cremeBg, textAlign: "left" }}>
                <th style={{ padding: "8px 10px" }}>Mês</th>
                <th style={{ padding: "8px 10px" }}>Gerente</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Verba creditada</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Créditos</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Débitos</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Saldo final</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px" }}>Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {fechamentosSSR.map((f) => {
                const badge = badgeStatusFechamento(f.status);
                const saldoCor = f.saldoFinal >= 0 ? C.verde : C.vermelho;
                return (
                  <tr key={f.id} style={{ borderTop: `1px solid ${C.cremeBorder}` }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, textTransform: "capitalize" }}>
                      {/* Abre o detalhe (03/08/2026): página própria, não drawer
                          — decisão do Jonathan, pra o link poder ser mandado
                          pra gerente/chefe. Ver .../fechamentos/[id]/page.tsx. */}
                      <Link href={`/entregas-venda/fechamentos/${f.id}`} style={{ color: C.esmeralda }}>
                        {fmtMesReferencia(f.mesReferencia)}
                      </Link>
                    </td>
                    <td style={{ padding: "8px 10px" }}>{f.gerenteNome}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(f.verbaCreditada)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(f.totalCreditos)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(f.totalDebitos)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: saldoCor }}>
                      {fmtBRL(f.saldoFinal)}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{
                        padding: "3px 8px", borderRadius: 999, background: badge.bg,
                        color: badge.color, fontWeight: 700, fontSize: 11,
                      }}>
                        {badge.text}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {f.tarefaAprovacaoId != null && (
                          <Link
                            href={`/tarefas?abrir=${f.tarefaAprovacaoId}`}
                            style={{ color: C.esmeralda, fontWeight: 600, fontSize: 11 }}
                          >
                            Ver tarefa #{f.tarefaAprovacaoId}
                          </Link>
                        )}
                        {f.contaPagarId != null && (
                          <Link
                            href="/financeiro/a-pagar"
                            style={{ color: C.esmeralda, fontWeight: 600, fontSize: 11 }}
                          >
                            Conta a pagar #{f.contaPagarId}
                          </Link>
                        )}
                        {f.tarefaAprovacaoId == null && f.contaPagarId == null && (
                          <span style={{ color: C.cinza, fontSize: 11 }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        baseUrl="/entregas-venda"
        extraParams="aba=fechamentos"
      />
    </div>
  );
}
