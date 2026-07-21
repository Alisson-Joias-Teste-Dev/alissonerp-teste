"use client";

/**
 * EntregasVendaClient.tsx — Componente client-side da listagem de entregas.
 *
 * REGRA DE NEGÓCIO (reforma da tela, 21/07 — mockup aprovado pelo Jonathan):
 * a tela virou 3 ABAS (ver AbaEntrega em page.tsx) — Retirada em loja,
 * Entregas motoboy e Pagamento do motoboy — substituindo a lista única que
 * misturava retirada e motoboy na mesma tabela. Filtros (situação/período)
 * viraram SELECT (antes eram chips) e a paginação passou de 50 para 10 por
 * página. O arquivo foi COMPONENTIZADO — a tabela, os cards, os filtros, as
 * abas e o painel de pagamento moraram para
 * src/components/entregas/lista/ (+ PagamentoMotoboyPainel.tsx) — este
 * arquivo agora só ORQUESTRA: mantém o estado (aba/filtros/paginação na URL,
 * igual antes), busca dados e decide o que renderizar.
 *
 * A paginação é server-side via URL (usando o componente Paginacao com Link,
 * reusado de @/components/ui/Paginacao — já existia, não recriado).
 * Filtros de aba/situação/busca/período atualizam a URL, disparando nova
 * renderização SSR. Após ações no drawer (confirmar, cancelar), os dados são
 * recarregados client-side via apiFetch para refletir as mudanças sem full
 * page reload.
 *
 * O QUE: renderiza a UI completa da tela /entregas-venda com todos os
 * estados (carregando, vazio, erro, dados) nas 3 abas.
 *
 * IMPACTO SE ALTERADO: a UI é o ponto central de visualização de entregas.
 * Alterar abas, colunas, filtros ou ações pode quebrar o fluxo de logística.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Truck, Bike, Package, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import Paginacao from "@/components/ui/Paginacao";
import EntregaDetalheDrawer from "@/components/entregas/EntregaDetalheDrawer";
import MotoboyDrawer from "@/components/entregas/MotoboyDrawer";
import PagarMotoboyModal from "@/components/entregas/PagarMotoboyModal";
import PagamentoMotoboyPainel from "@/components/entregas/PagamentoMotoboyPainel";
import type { RelatorioPagamentoMotoboyListItem } from "@/lib/pagamento-motoboy";
import FreteAvulsoModal from "@/components/entregas/FreteAvulsoModal";
// REGRA DE NEGÓCIO (BLOCO 3 — fonte única de permissão): quem pode CRIAR
// frete avulso DIRETO (o botão desta tela) vem de
// src/lib/permissoes/frete-avulso.ts — backend (route.ts) e este front usam
// o MESMO predicado. NUNCA reescrever a lista aqui.
import { podeCriarFreteAvulsoDireto } from "@/lib/permissoes/frete-avulso";
import AbasEntrega from "@/components/entregas/lista/AbasEntrega";
import FiltrosEntrega from "@/components/entregas/lista/FiltrosEntrega";
import TabelaEntregas from "@/components/entregas/lista/TabelaEntregas";
import CardsResumo from "@/components/entregas/lista/CardsResumo";
import { C } from "@/components/entregas/lista/formatters";
import type { EntregaItem, ContagensEntregas, AbaEntrega } from "./page";

// ── Props ───────────────────────────────────────────────────────────────────────

interface EntregasVendaClientProps {
  /** Itens da página atual (pré-carregados via SSR) — [] na aba "pagamento" */
  items: EntregaItem[];
  /** Contagens para os cards de stats — zeradas na aba "pagamento" */
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
  /** Filtro de data início da URL */
  dataInicioFiltro: string;
  /** Filtro de data fim da URL */
  dataFimFiltro: string;
  /** Role do usuário logado */
  userRole: string;
  /** Aba ativa (retirada | motoboy | pagamento) — vinda da URL (?aba=) */
  aba: AbaEntrega;
  /**
   * Relatórios de pagamento do motoboy (aba "pagamento") — SSR paginado,
   * MESMO padrão de `items` para as outras abas. [] nas demais abas.
   * Ver docs/regras-negocio/entregas.md §12.8 (relatórios PERSISTIDOS).
   */
  relatoriosPagamento: RelatorioPagamentoMotoboyListItem[];
}

/** Formato de resposta da API de listagem de entregas */
interface EntregasListResponse {
  items: EntregaItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  dataInicioFiltro,
  dataFimFiltro,
  userRole,
  aba,
  relatoriosPagamento,
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

  // REGRA DE NEGÓCIO: sincroniza estado local com props do SSR quando a URL muda
  // (router.push com novos filtros/aba). Sem isso, o estado fica preso nos dados iniciais.
  useEffect(() => {
    setItems(ssrItems);
    setContagens(ssrContagens);
  }, [ssrItems, ssrContagens]);

  // Input de busca (estado local, não sincronizado com URL em tempo real)
  const [buscaInput, setBuscaInput] = useState(buscaFiltro);

  // REGRA DE NEGÓCIO: filtro de período. "personalizado" mostra inputs de data.
  const [periodo, setPeriodo] = useState("");
  const [dataInicioInput, setDataInicioInput] = useState(dataInicioFiltro);
  const [dataFimInput, setDataFimInput] = useState(dataFimFiltro);

  // Entrega selecionada para abrir o drawer
  const [selectedEntregaId, setSelectedEntregaId] = useState<number | null>(null);

  // Drawer de motoboys
  const [motoboyDrawerOpen, setMotoboyDrawerOpen] = useState(false);
  // Modal de pagamento em lote (acessado pelo drawer de Motoboys — ver §
  // "Pagamento do motoboy" no relato: reusa PagamentoMotoboyPainel, igual à aba)
  const [pagarMotoboyOpen, setPagarMotoboyOpen] = useState(false);
  // Modal de frete avulso
  const [freteAvulsoOpen, setFreteAvulsoOpen] = useState(false);
  // REGRA DE NEGÓCIO (BLOCO 3 — fonte única de permissão): este botão cria
  // frete avulso DIRETO (já liberado, lança saldo na hora) — antes não
  // checava cargo nenhum aqui (qualquer um que chegasse até a página via
  // page.tsx via a lista antiga). Agora usa o MESMO predicado do backend
  // (route.ts) — se um papel for removido/adicionado, os dois lados mudam
  // juntos (fonte única em src/lib/permissoes/frete-avulso.ts).
  // IMPACTO SE REMOVIDO: o botão volta a aparecer pra quem o backend recusa
  // com 403 (UX ruim — clique sem efeito), ou some pra quem deveria ver.
  const podeCriarDireto = podeCriarFreteAvulsoDireto(userRole);

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
  // Mantém a página, aba e filtros atuais para consistência com a URL.
  // Usa apiFetch que lança erro em falhas de rede e respostas não-2xx.
  // Nunca roda na aba "pagamento" (não há lista de entregas lá).
  const recarregar = useCallback(async () => {
    if (aba === "pagamento") return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        forma_entrega: aba,
      });
      if (situacaoFiltro) params.set("situacao", situacaoFiltro);
      if (dataInicioFiltro) params.set("data_inicio", dataInicioFiltro);
      if (dataFimFiltro) params.set("data_fim", dataFimFiltro);

      const data = await apiFetch<EntregasListResponse>(
        `/api/entregas-venda?${params.toString()}`,
      );

      // Serializa campos numéricos (a API já converte, mas garantimos consistência)
      const serialized = (data.items || []).map((r) => ({
        ...r,
        id:                          Number(r.id),
        venda_id:                    r.venda_id != null ? Number(r.venda_id) : null,
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
  }, [aba, currentPage, pageSize, situacaoFiltro, dataInicioFiltro, dataFimFiltro]);

  // ── Handlers de filtro/aba (SSR-based via URL) ─────────────────────────────
  // REGRA DE NEGÓCIO: aba, filtros de situação e busca atualizam a URL,
  // disparando uma nova renderização SSR com os dados filtrados.
  // Isso mantém a URL compartilhável e o comportamento previsível.

  /** Troca de aba preservando os demais filtros ativos, volta para a página 1. */
  function handleAbaChange(novaAba: AbaEntrega) {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", novaAba);
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    if (buscaInput.trim()) params.set("busca", buscaInput.trim());
    if (dataInicioFiltro) params.set("data_inicio", dataInicioFiltro);
    if (dataFimFiltro) params.set("data_fim", dataFimFiltro);
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Altera o filtro de situação e recarrega a página 1 */
  function handleSituacaoChange(novaSituacao: string) {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", aba);
    if (novaSituacao) params.set("situacao", novaSituacao);
    if (buscaInput.trim()) params.set("busca", buscaInput.trim());
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Submete a busca e recarrega a página 1 */
  function handleBuscaSubmit() {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", aba);
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    if (buscaInput.trim()) params.set("busca", buscaInput.trim());
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Limpa a busca e recarrega */
  function handleLimparBusca() {
    setBuscaInput("");
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", aba);
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    if (dataInicioFiltro) params.set("data_inicio", dataInicioFiltro);
    if (dataFimFiltro) params.set("data_fim", dataFimFiltro);
    router.push(`/entregas-venda?${params.toString()}`);
  }

  /** Aplica período pré-definido ou personalizado */
  function handlePeriodoChange(tipo: string) {
    setPeriodo(tipo);
    const hoje = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let ini = "";
    let fim = "";

    if (tipo === "hoje") {
      ini = fim = fmt(hoje);
    } else if (tipo === "ontem") {
      const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
      ini = fim = fmt(ontem);
    } else if (tipo === "7dias") {
      const sete = new Date(hoje); sete.setDate(sete.getDate() - 7);
      ini = fmt(sete); fim = fmt(hoje);
    } else if (tipo === "mes") {
      ini = fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
      fim = fmt(hoje);
    } else if (tipo.startsWith("mes_")) {
      const m = parseInt(tipo.split("_")[1]);
      ini = fmt(new Date(hoje.getFullYear(), m, 1));
      fim = fmt(new Date(hoje.getFullYear(), m + 1, 0));
    } else if (tipo === "personalizado") {
      ini = dataInicioInput; fim = dataFimInput;
    }

    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", aba);
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    if (ini) params.set("data_inicio", ini);
    if (fim) params.set("data_fim", fim);
    router.push(`/entregas-venda?${params.toString()}`);
  }

  function handleAplicarPersonalizado() {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", aba);
    if (situacaoFiltro) params.set("situacao", situacaoFiltro);
    if (dataInicioInput) params.set("data_inicio", dataInicioInput);
    if (dataFimInput) params.set("data_fim", dataFimInput);
    router.push(`/entregas-venda?${params.toString()}`);
  }

  function handleLimparData() {
    setPeriodo("");
    setDataInicioInput("");
    setDataFimInput("");
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("aba", aba);
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
  // preservar aba + filtros atuais nos links de paginação para que a
  // navegação entre páginas mantenha a aba e os filtros aplicados.
  // Reusa o componente @/components/ui/Paginacao já existente no projeto —
  // não foi criado um novo (pedido de reuso, ver relato).
  const paginacaoExtraParams = [
    `aba=${encodeURIComponent(aba)}`,
    situacaoFiltro ? `situacao=${encodeURIComponent(situacaoFiltro)}` : "",
    buscaFiltro ? `busca=${encodeURIComponent(buscaFiltro)}` : "",
    dataInicioFiltro ? `data_inicio=${encodeURIComponent(dataInicioFiltro)}` : "",
    dataFimFiltro ? `data_fim=${encodeURIComponent(dataFimFiltro)}` : "",
  ].filter(Boolean).join("&");

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
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {podeCriarDireto && (
              <button
                onClick={() => setFreteAvulsoOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 8,
                  border: `1px solid ${C.esmeralda}`,
                  background: C.esmeralda, color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Bike size={16} /> Frete Avulso
              </button>
            )}
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

        {/* ── Abas ──────────────────────────────────────────────────────────── */}
        <AbasEntrega abaAtual={aba} onChange={handleAbaChange} />

        {aba === "pagamento" ? (
          /* ── Aba: Pagamento do motoboy ───────────────────────────────────────
             REGRA DE NEGÓCIO (reforma 21/07/2026 — relatórios PERSISTIDOS,
             mockup aprovado pelo Jonathan; ver
             docs/regras-negocio/entregas.md §12.8): o seletor de motoboy
             solto + pagamento em lote por checkbox SAIU desta aba (voltou a
             morar só no modal `PagarMotoboyModal.tsx`, aberto pelo drawer de
             Motoboys). Esta aba agora é SÓ `PagamentoMotoboyPainel`: form
             "Criar relatório" (entregador+período) + lista paginada (10/pg,
             SSR via `relatoriosPagamento`) que NUNCA some (aguardando E
             pagos) + "Abrir"/"Confirmar pagamento" por linha. */
          <PagamentoMotoboyPainel
            relatoriosSSR={relatoriosPagamento}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
          />
        ) : (
          <>
            {/* ── Cards de Stats ───────────────────────────────────────────────
                REGRA DE NEGÓCIO: contagens já vêm ESCOPADAS à aba atual (SSR
                filtra por forma_entrega). Saldo de Frete Grátis só na aba
                "Entregas motoboy" (retirada não tem frete). */}
            <CardsResumo
              contagens={contagens}
              saldoFrete={saldoFrete}
              mostrarSaldoFrete={aba === "motoboy"}
            />

            {/* ── Filtros (situação/período em SELECT + busca) ─────────────── */}
            <FiltrosEntrega
              situacaoFiltro={situacaoFiltro}
              onSituacaoChange={handleSituacaoChange}
              periodo={periodo}
              onPeriodoChange={handlePeriodoChange}
              dataInicioInput={dataInicioInput}
              dataFimInput={dataFimInput}
              onDataInicioChange={setDataInicioInput}
              onDataFimChange={setDataFimInput}
              onAplicarPersonalizado={handleAplicarPersonalizado}
              temFiltroData={!!(dataInicioFiltro || dataFimFiltro)}
              onLimparData={handleLimparData}
              buscaInput={buscaInput}
              onBuscaInputChange={setBuscaInput}
              onBuscaSubmit={handleBuscaSubmit}
              onLimparBusca={handleLimparBusca}
            />

            {/* ── Tabela / Loading / Empty State ───────────────────────────── */}
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 size={24} color={C.esmeralda} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : items.length === 0 ? (
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
                    : "Nenhuma entrega registrada nesta aba"}
                </p>
              </div>
            ) : (
              <TabelaEntregas
                items={items}
                onRowClick={setSelectedEntregaId}
                mostrarMotoboy={aba === "motoboy"}
                mostrarFrete={aba === "motoboy"}
              />
            )}

            {/* ── Paginação (reusa @/components/ui/Paginacao, 10 por página) ── */}
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

            {/* ── Footer com resumo ─────────────────────────────────────────── */}
            {items.length > 0 && (
              <p style={{ textAlign: "center", fontSize: 12, color: C.cinza, marginTop: 12 }}>
                {items.length} entrega{items.length !== 1 ? "s" : ""} nesta página
                {situacaoFiltro && ` · situação: ${situacaoFiltro}`}
                {buscaFiltro && ` · busca: "${buscaFiltro}"`}
              </p>
            )}
          </>
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
          userRole={userRole}
        />
      )}

      {/* ── Drawer de Motoboys ─────────────────────────────────────────────── */}
      <MotoboyDrawer
        isOpen={motoboyDrawerOpen}
        onClose={() => setMotoboyDrawerOpen(false)}
        onPagar={() => { setMotoboyDrawerOpen(false); setPagarMotoboyOpen(true); }}
      />

      {/* ── Modal de Pagamento em Lote (atalho do drawer de Motoboys) ───────── */}
      <PagarMotoboyModal
        isOpen={pagarMotoboyOpen}
        onClose={() => setPagarMotoboyOpen(false)}
      />

      {/* ── Modal de Frete Avulso ────────────────────────────────────────────
          REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — decisão do
          Jonathan: "mesmo formulário da tarefa, mas criação DIRETA"): o botão
          "Frete Avulso" desta tela abre o MESMO formulário completo da
          solicitação (`formularioCompleto`) — venda opcional, endereço
          estruturado, quem paga + comprovante, valor cobrado, região,
          observação — mas SEM `modoSolicitacao`, então continua criando
          DIRETO ('pendente', sem tarefa/pool). Ver comentário completo em
          FreteAvulsoModal.tsx.
          IMPACTO SE MUDAR PRA modoSolicitacao=true: o botão passaria a gerar
          uma solicitação/tarefa em vez de criar o avulso liberado na hora —
          quebra o uso real desta tela (loja cria corrida avulsa direto). */}
      <FreteAvulsoModal
        isOpen={freteAvulsoOpen}
        onClose={() => setFreteAvulsoOpen(false)}
        onCriado={() => { setFreteAvulsoOpen(false); router.refresh(); }}
        formularioCompleto
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
