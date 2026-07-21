"use client";

/**
 * PagamentoMotoboyPainel — aba "Pagamento do motoboy": formulário de CRIAR
 * relatório (entregador+período) + LISTA paginada dos relatórios já criados.
 *
 * REGRA DE NEGÓCIO (reforma 21/07/2026 — relatórios PERSISTIDOS, mockup
 * aprovado pelo Jonathan; ver docs/regras-negocio/entregas.md §12.8 e
 * migration 358): este arquivo ERA o painel de pagamento em lote AD-HOC
 * (seleciona motoboy solto no topo + checkbox + paga na hora). Essa lógica
 * foi REINTEGRADA em `PagarMotoboyModal.tsx` (único consumidor restante,
 * aberto pelo drawer de Motoboys — não duplicada, só mudou de arquivo) e
 * este componente foi REESCRITO para o novo fluxo da aba:
 *
 *   1. Formulário "Criar relatório" (entregador + de + até + botão) — a
 *      ÚNICA escolha de entregador que resta na aba (o seletor solto de
 *      antes foi removido, ver decisão 1 da task).
 *   2. Lista PAGINADA (10/página, SSR via `relatoriosSSR` — REUSA
 *      `@/components/ui/Paginacao`, mesmo padrão das outras abas desta
 *      tela) dos relatórios já criados — aguardando E pagos, NUNCA somem.
 *   3. Ações por linha: "Abrir" (mostra `RelatorioPagamentoMotoboy`, a
 *      tabela de corridas do relatório salvo) e "Confirmar pagamento"
 *      direto da lista quando `status==='aguardando'` (paga as corridas que
 *      o relatório marcou como sugestão "Pagar", sem precisar abrir).
 *
 * IMPACTO SE ALTERADO: este é o ÚNICO ponto de entrada da aba — mexer na
 * paginação sem sincronizar com `page.tsx` (que faz a consulta SSR)
 * desalinha "Mostrando X–Y de Z".
 */

import { useState, useEffect, useCallback } from "react";
import { FileText, Loader2, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import Paginacao from "@/components/ui/Paginacao";
import {
  MARCO_RELATORIO_PAGAMENTO_MOTOBOY,
} from "@/lib/relatorio-pagamento-motoboy";
import type { RelatorioPagamentoMotoboyListItem } from "@/lib/pagamento-motoboy";
import RelatorioPagamentoMotoboy from "./RelatorioPagamentoMotoboy";
import { fmtBRL, fmtData, C } from "./lista/formatters";

interface MotoboyOption {
  id: number;
  user_id: string;
  nome: string;
  ativo: boolean;
}

/** Badge de status do relatório — aguardando (âmbar) / pago (verde, travado). */
function badgeStatusRelatorio(status: "aguardando" | "pago") {
  return status === "pago"
    ? { text: "Pago", color: C.verde, bg: C.verdeLt }
    : { text: "Aguardando pagamento", color: C.ambar, bg: C.ambarLt };
}

/** Data (AAAA-MM-DD) de hoje, para default do campo "até". */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PagamentoMotoboyPainelProps {
  /** Página atual (SSR, já filtrada/paginada por page.tsx) de relatórios. */
  relatoriosSSR: RelatorioPagamentoMotoboyListItem[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export default function PagamentoMotoboyPainel({
  relatoriosSSR,
  currentPage,
  totalPages,
  totalItems,
  pageSize,
}: PagamentoMotoboyPainelProps) {
  // ── Lista (estado local sincronizado com SSR + refresh client-side) ──────
  // REGRA DE NEGÓCIO: mesmo padrão de `items`/`recarregar` em
  // EntregasVendaClient.tsx — os valores iniciais vêm do SSR (page.tsx) e
  // são atualizados via apiFetch após criar/confirmar um relatório, sem
  // navegar (full reload só acontece ao trocar de PÁGINA, via Paginacao/Link).
  const [relatorios, setRelatorios] = useState<RelatorioPagamentoMotoboyListItem[]>(relatoriosSSR);
  useEffect(() => {
    setRelatorios(relatoriosSSR);
  }, [relatoriosSSR]);

  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erroLista, setErroLista] = useState("");

  const recarregarLista = useCallback(async () => {
    setCarregandoLista(true);
    setErroLista("");
    try {
      const data = await apiFetch<{ items: RelatorioPagamentoMotoboyListItem[] }>(
        `/api/entregas-venda/motoboy/relatorio-pagamento?page=${currentPage}`,
      );
      setRelatorios(data.items);
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Erro ao recarregar lista de relatórios");
    } finally {
      setCarregandoLista(false);
    }
  }, [currentPage]);

  // ── Formulário "Criar relatório" ──────────────────────────────────────────
  const [motoboys, setMotoboys] = useState<MotoboyOption[]>([]);
  const [entregadorId, setEntregadorId] = useState("");
  const [inicio, setInicio] = useState(MARCO_RELATORIO_PAGAMENTO_MOTOBOY);
  const [fim, setFim] = useState(hojeISO());
  const [criando, setCriando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [sucessoForm, setSucessoForm] = useState("");

  useEffect(() => {
    apiFetch<MotoboyOption[]>("/api/entregas-venda/motoboys?todos=true")
      .then((data) => setMotoboys(data.filter((m) => m.ativo)))
      .catch(() => { /* ignora — select fica vazio */ });
  }, []);

  async function handleCriarRelatorio() {
    if (!entregadorId) {
      setErroForm("Selecione um entregador.");
      return;
    }
    setCriando(true);
    setErroForm("");
    setSucessoForm("");
    try {
      const resultado = await apiFetch<{ message: string }>(
        "/api/entregas-venda/motoboy/relatorio-pagamento",
        {
          method: "POST",
          body: JSON.stringify({ motoboy_id: entregadorId, inicio, fim }),
        },
      );
      setSucessoForm(resultado.message ?? "Relatório criado.");
      // REGRA DE NEGÓCIO: relatório novo aparece na lista (critério de
      // aceite 1) — recarrega a página ATUAL (normalmente 1, onde o novo
      // relatório aparece primeiro, ORDER BY created_at DESC).
      await recarregarLista();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Erro ao criar relatório");
    } finally {
      setCriando(false);
    }
  }

  // ── Ações por linha: Abrir / Confirmar pagamento direto da lista ─────────
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  /**
   * REGRA DE NEGÓCIO: "Confirmar pagamento" DIRETO da lista (sem abrir) —
   * body vazio, o backend usa a decisão já persistida na criação (sugestão
   * inicial). Para ajustar linha a linha, o usuário "Abre" antes (ver
   * `RelatorioPagamentoMotoboy`, que manda a decisão ajustada).
   */
  async function handleConfirmarDaLista(relatorioId: number) {
    setConfirmandoId(relatorioId);
    setErroLista("");
    try {
      await apiFetch<{ message: string }>(
        `/api/entregas-venda/motoboy/relatorio-pagamento/${relatorioId}/confirmar`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await recarregarLista();
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Erro ao confirmar pagamento");
    } finally {
      setConfirmandoId(null);
    }
  }

  return (
    <div>
      {/* ── Formulário: Criar relatório ──────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 10,
        border: `1px solid ${C.cremeBorder}`, padding: 20, marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, marginBottom: 4 }}>
          Criar relatório de pagamento
        </h3>
        <p style={{ fontSize: 11, color: C.cinza, marginBottom: 14 }}>
          Corridas anteriores a {MARCO_RELATORIO_PAGAMENTO_MOTOBOY.split("-").reverse().join("/")} já
          foram pagas manualmente e não entram em nenhum relatório novo.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
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
              De
            </label>
            <input type="date" value={inicio} min={MARCO_RELATORIO_PAGAMENTO_MOTOBOY}
              onChange={(e) => setInicio(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
              Até
            </label>
            <input type="date" value={fim} min={MARCO_RELATORIO_PAGAMENTO_MOTOBOY}
              onChange={(e) => setFim(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937" }} />
          </div>
          <button onClick={handleCriarRelatorio} disabled={criando}
            style={{
              padding: "10px 16px", borderRadius: 6, border: "none",
              background: C.esmeralda, color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: "pointer", opacity: criando ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
            }}>
            {criando ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileText size={14} />}
            Criar relatório
          </button>
        </div>

        {erroForm && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: C.vermelhoLt, color: C.vermelho, fontSize: 12 }}>
            {erroForm}
          </div>
        )}
        {sucessoForm && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: C.verdeLt, color: C.verde, fontSize: 12, fontWeight: 600 }}>
            {sucessoForm}
          </div>
        )}
      </div>

      {/* ── Detalhe aberto (se algum relatório foi "Aberto") ─────────────── */}
      {abertoId !== null && (
        <RelatorioPagamentoMotoboy
          relatorioId={abertoId}
          onFechar={() => setAbertoId(null)}
          onConfirmado={recarregarLista}
        />
      )}

      {/* ── Lista paginada de relatórios ─────────────────────────────────── */}
      <div style={{
        background: "#fff", borderRadius: 10,
        border: `1px solid ${C.cremeBorder}`, padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.esmeralda, margin: 0 }}>
            Relatórios de pagamento
          </h3>
          {carregandoLista && <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />}
        </div>

        {erroLista && (
          <div style={{ padding: 10, borderRadius: 6, background: C.vermelhoLt, color: C.vermelho, fontSize: 12, marginBottom: 12 }}>
            {erroLista}
          </div>
        )}

        {relatorios.length === 0 ? (
          <p style={{ fontSize: 13, color: C.cinza, textAlign: "center", padding: 20 }}>
            Nenhum relatório criado ainda.
          </p>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${C.cremeBorder}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.cremeBg, textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>Entregador</th>
                  <th style={{ padding: "8px 10px" }}>Período</th>
                  <th style={{ padding: "8px 10px" }}>Corridas</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Criado em</th>
                  <th style={{ padding: "8px 10px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {relatorios.map((r) => {
                  const badge = badgeStatusRelatorio(r.status);
                  return (
                    <tr key={r.id} style={{ borderTop: `1px solid ${C.cremeBorder}` }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.motoboy_nome}</td>
                      <td style={{ padding: "8px 10px" }}>{fmtData(r.data_inicio)} a {fmtData(r.data_fim)}</td>
                      <td style={{ padding: "8px 10px" }}>{r.quantidade_corridas}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{fmtBRL(r.total_sugerido)}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: 999, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: 11 }}>
                          {badge.text}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px" }}>{fmtData(r.created_at)}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setAbertoId(r.id)}
                            style={{
                              padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              border: `1px solid ${C.cremeBorder}`, background: "#fff", color: C.esmeralda,
                              cursor: "pointer",
                            }}>
                            Abrir
                          </button>
                          {r.status === "aguardando" && (
                            <button
                              onClick={() => handleConfirmarDaLista(r.id)}
                              disabled={confirmandoId === r.id}
                              style={{
                                padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                border: "none", background: C.esmeralda, color: "#fff",
                                cursor: confirmandoId === r.id ? "not-allowed" : "pointer",
                                opacity: confirmandoId === r.id ? 0.6 : 1,
                                display: "flex", alignItems: "center", gap: 4,
                              }}>
                              <CheckCircle size={12} />
                              {confirmandoId === r.id ? "Confirmando..." : "Confirmar pagamento"}
                            </button>
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
          extraParams="aba=pagamento"
        />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
