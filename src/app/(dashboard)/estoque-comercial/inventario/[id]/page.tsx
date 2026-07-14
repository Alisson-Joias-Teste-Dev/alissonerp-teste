"use client";

/**
 * Detalhe do Inventário Comercial (/estoque-comercial/inventario/[id])
 *
 * O QUÊ: tela de conferência do inventário — mostra o que está OK,
 *   faltando, sobrando e SEM contagem, e permite registrar a PENDÊNCIA
 *   de cada divergência (o que aconteceu) e o desfecho ("foi resolvida?").
 * POR QUÊ: o estoque comercial vale milhões — cada divergência precisa
 *   de explicação escrita, responsável e acompanhamento até o desfecho.
 * IMPACTO SE ALTERADO: sem esta tela a gerência perde a visão de
 *   faltas/sobras e o rastreio das pendências do inventário.
 *
 * Regras de blindagem no front (o servidor revalida todas):
 *   - Marcar "conferido" NUNCA inventa contagem: item sem contagem exige
 *     digitar a quantidade real (era o bug que transformava pendente em OK).
 *   - Concluir com itens sem contagem ou pendências sem resposta exige
 *     dupla confirmação (o servidor devolve 409 e pede "forcar").
 *   - Cancelar exige motivo (fica gravado quem cancelou e por quê).
 *   - Toda falha de rede/API aparece na faixa de mensagem — nada silencioso.
 *
 * APRESENTAÇÃO (redesenho v-relayout, só front — nenhuma regra mudou):
 *   - VEREDITO no topo (uma linha: falta/excesso/sem contagem/pendências).
 *   - 4 cartões de MÉTRICA em contagem dupla PEÇAS × SKUs (Faltando/Excesso
 *     continuam clicáveis = filtro). Peça = unidade física; SKU = modelo.
 *   - Faixa ÚNICA de filtros (status + pendência + categoria) em vez do muro
 *     de cartões grandes empilhados.
 *   - Linha do item enxuta: o resultado do detetive vira uma LINHA discreta
 *     sob o nome (não mais pílulas amontoadas à direita).
 *   - Drill-down mostra o NÚMERO DO CHIP de cada peça lida (epcsPorProduto,
 *     dado que a API já resolve — nada de novo no banco além de agrupar).
 */

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Search, X, FileDown,
  ChevronDown, ChevronUp, AlertTriangle, MessageSquareText, Info, Gem,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface InventarioHeader {
  id: number;
  local_nome: string;
  status: string;
  obs: string | null;
  categoria: string | null;
  data_abertura: string;
  data_conclusao: string | null;
  criado_por_email: string | null;
  concluido_por_email: string | null;
  cancelado_por_email: string | null;
  motivo_cancelamento: string | null;
}

interface ItemInventario {
  id: number;
  produto_id: number;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  diferenca: number;
  nome_produto: string;
  sku: string | null;
  conferido: boolean;
  contado_por_email: string | null;
  contado_em: string | null;
  pendencia_obs: string | null;
  pendencia_registrada_por_email: string | null;
  pendencia_registrada_em: string | null;
  pendencia_resolvida: boolean | null;
  pendencia_resolucao_obs: string | null;
  pendencia_resolvida_por_email: string | null;
  pendencia_resolvida_em: string | null;
  pendencia_desfecho_tipo: string | null;
  pendencia_desfecho_venda_id: number | null;
  pendencia_desfecho_numero_venda: string | null;
  categoria_produto: string | null;
}

interface LeiturasEPC {
  epc: string;
  evento: string;
  lido_em: string;
  operador: string;
}

interface ExcedenteForaInventario {
  id_api_produto: number;
  sku: string;
  nome_produto: string;
  categoria_produto: string | null;
  quantidade: number;
  epcs: string[];   // números dos chips lidos deste produto (fora da lista)
}

// Valores do inventário (restrito a desenvolvedor + dono): valor de venda e
// peso da FONTE por SKU, com totais em esperado e contado. Só chega no JSON
// quando o usuário tem permissão (a API não envia para os demais).
interface ValorItem {
  produto_id: number;
  sku: string | null;
  nome_produto: string;
  quantidade_sistema: number;
  quantidade_contada: number | null;
  valor_unitario: number;   // preço de venda (R$, inteiro)
  peso_unitario: number;    // peso da fonte (g)
}
interface Valores {
  itens: ValorItem[];
  totais: { valor_esperado: number; valor_contado: number; peso_esperado: number; peso_contado: number };
}

type StatusItem = "ok" | "faltando" | "excesso" | "pendente";
type Msg = { tipo: "ok" | "erro"; texto: string } | null;

function getStatus(item: ItemInventario): StatusItem {
  if (item.quantidade_contada === null) return "pendente";
  if (item.diferenca > 0) return "excesso";
  if (item.diferenca < 0) return "faltando";
  return "ok";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Nome legível a partir do e-mail (a auth só guarda o e-mail): "ytalo@..." -> "Ytalo",
// "maria.silva@..." -> "Maria Silva". Assinatura fica limpa sem expor o e-mail.
function nomeDoEmail(email: string | null | undefined): string {
  if (!email) return "?";
  const base = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!base) return "?";
  return base.split(" ").filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// R$ sem centavos (o preço de venda já é inteiro) e peso em gramas com 1 casa.
const fmtBRL = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtG = (n: number) =>
  `${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g`;

const STATUS_LABEL: Record<StatusItem, string> = {
  ok: "OK", faltando: "Faltando", excesso: "Excedente", pendente: "Sem contagem",
};

const STATUS_COLOR: Record<StatusItem, { bg: string; text: string; border: string }> = {
  ok:       { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  faltando: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
  excesso:  { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
  pendente: { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" },
};

function Badge({ status }: { status: StatusItem }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// Situação da pendência do item: nada | aberta | resolvida | não resolvida
function PendenciaBadge({ item }: { item: ItemInventario }) {
  if (!item.pendencia_obs) return null;
  if (item.pendencia_resolvida === true) {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "#D1FAE5", color: "#065F46", border: "1px solid #6EE7B7" }}>Resolvida</span>;
  }
  if (item.pendencia_resolvida === false) {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5" }}>Não resolvida</span>;
  }
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
    style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>Pendência aberta</span>;
}

/**
 * Cartão de MÉTRICA em contagem dupla: PEÇAS (número grande) + SKUs (sub).
 * POR QUÊ: 1 SKU pode faltar várias PEÇAS — contar só linhas escondia o
 *   tamanho real da falta. Faltando/Excesso são clicáveis = filtram a lista
 *   (clicar de novo limpa). Esperado/Contado são só leitura.
 * O status muda SÓ a cor do número — nunca o formato do cartão.
 */
function MetricCard({ label, pecas, skus, color, onClick, ativo }: {
  label: string; pecas: number; skus: number; color: string;
  onClick?: () => void; ativo?: boolean;
}) {
  const clicavel = !!onClick;
  return (
    <button onClick={onClick} disabled={!clicavel}
      className="rounded-xl px-3 py-2.5 text-left flex-1 transition-shadow"
      style={{
        background: "#fff",
        border: `1px solid ${ativo ? color : "#E8DCC8"}`,
        boxShadow: ativo ? `0 0 0 1.5px ${color}` : "none",
        cursor: clicavel ? "pointer" : "default",
      }}>
      <p className="text-xs" style={{ color: "#8A857A" }}>{label}{ativo ? " ✕" : ""}</p>
      <p className="text-xl font-bold leading-tight" style={{ color }}>
        {pecas} <span className="text-xs font-medium" style={{ color: "#9A948A" }}>pç</span>
      </p>
      <p className="text-[11px]" style={{ color: "#9A948A" }}>{skus} SKU{skus === 1 ? "" : "s"}</p>
    </button>
  );
}

// Chip de filtro (status). Ativo = pintado da cor do status; clicar de novo limpa.
function FiltroChip({ label, count, ativo, color, onClick }: {
  label: string; count?: number; ativo: boolean; color?: string; onClick: () => void;
}) {
  const c = color ?? "#184036";
  return (
    <button onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-full font-medium"
      style={ativo
        ? { background: c, color: "#fff", border: `1px solid ${c}` }
        : { background: "#fff", color: "#6B7280", border: "1px solid #E8DCC8" }}>
      {label}{count !== undefined ? <span style={{ opacity: 0.65 }}> ({count})</span> : null}{ativo ? " ✕" : ""}
    </button>
  );
}

// Explicação de cada status — mostrada pelo botão "!" ao lado dos filtros
const STATUS_EXPLICACAO: { status: StatusItem | "fora"; label: string; color: string; texto: string }[] = [
  { status: "ok", label: "OK", color: "#059669", texto: "Item foi contado e a quantidade bateu exatamente com o sistema." },
  { status: "faltando", label: "Faltando", color: "#DC2626", texto: "Item foi contado e apareceu MENOS do que o sistema esperava." },
  { status: "excesso", label: "Excesso", color: "#2563EB", texto: "Item foi contado e apareceu MAIS do que o sistema esperava." },
  { status: "pendente", label: "Sem contagem", color: "#6B7280", texto: "Ninguém contou esse item ainda — falta informar a quantidade real." },
  { status: "fora", label: "Fora do invent.", color: "#7C3AED", texto: "Etiqueta lida pelo app RFID de um produto que NÃO faz parte da lista deste inventário." },
];

function StatusInfoBox() {
  return (
    <div className="rounded-xl p-3 mb-3 text-xs space-y-1.5" style={{ background: "#F9F6F0", border: "1px solid #E8DCC8" }}>
      {STATUS_EXPLICACAO.map(s => (
        <p key={s.status}>
          <b style={{ color: s.color }}>{s.label}:</b>{" "}
          <span style={{ color: "#374151" }}>{s.texto}</span>
        </p>
      ))}
    </div>
  );
}

// Rótulos dos desfechos blindados (espelho do enum aceito pela API)
const DESFECHO_LABEL: Record<string, string> = {
  venda_sem_baixa: "Conciliar com venda sem baixa (gera a saída da venda)",
  perda: "Peça perdida (só registro — NÃO baixa estoque)",
  localizada: "Peça localizada (zera a falta)",
  excedente_confirmado: "Conciliar com devolução/vale-troca (gera a entrada)",
  outro: "Outro (só registro, sem efeito no estoque)",
};

interface Investigacao {
  falta: number | null;
  sobra: number | null;
  conclusao: { tipo: string; confianca: "alta" | "media"; resumo: string } | null;
  reservas: { reserva_id: number; quantidade: number; venda_id: number; numero_venda: string; situacao: string; data_venda: string | null; vendedor_nome: string | null; created_at: string }[];
  transferencias: { id: number; quantidade: number; local_destino_nome: string | null; created_at: string }[];
  movimentacoes: { id: number; tipo: string; quantidade: number; motivo: string; created_at: string }[];
  devolucoes: { id: number; numero: string; status: string; created_at: string; qtd_aprovada: number; qtd_entrada: number; qtd_pendente: number }[];
}

/**
 * Bloco "Peças e chips" (novo): lista cada PEÇA lida com o número do chip
 * (EPC) e marca as que faltaram como "não lida". Só leitura — o dado vem do
 * mapa epcsPorProduto que a API já resolve.
 */
function PecasChips({ item, epcs }: { item: ItemInventario; epcs: string[] }) {
  const contadas = item.quantidade_contada ?? 0;
  // Peças não lidas = a falta (diferença negativa). Excesso/OK não têm "não lida".
  const naoLidas = item.diferenca < 0 ? -item.diferenca : 0;
  // Contadas manualmente sem etiqueta (contagem digitada > nº de chips lidos)
  const semEtiqueta = Math.max(0, contadas - epcs.length);

  if (epcs.length === 0 && naoLidas === 0 && semEtiqueta === 0) {
    return (
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color: "#7A5A4A" }}>Peças e chips</p>
        <p className="text-xs text-gray-400">Sem etiqueta lida para esta peça.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color: "#7A5A4A" }}>Peças e chips</p>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #F1ECE1" }}>
        {epcs.map((epc, i) => (
          <div key={epc} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]"
            style={{ borderTop: i === 0 ? "none" : "1px solid #F1ECE1" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#059669" }} />
            <span className="flex-1 min-w-0">peça {i + 1} · <span className="font-mono text-gray-500 break-all">chip {epc}</span></span>
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "#D1FAE5", color: "#065F46" }}>lida</span>
          </div>
        ))}
        {semEtiqueta > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]" style={{ borderTop: epcs.length ? "1px solid #F1ECE1" : "none", color: "#7A5A4A" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#059669" }} />
            <span className="flex-1">{semEtiqueta} peça(s) contada(s) sem etiqueta</span>
          </div>
        )}
        {naoLidas > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]" style={{ borderTop: (epcs.length || semEtiqueta) ? "1px solid #F1ECE1" : "none", color: "#9A948A" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#DC2626" }} />
            <span className="flex-1">{naoLidas} peça(s) não lida(s)</span>
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "#FEE2E2", color: "#991B1B" }}>não encontrada</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Painel expandido do item: PEÇAS E CHIPS + campo "Qual é a pendência?" + o
 * DETETIVE (investigação automática da falta, só leitura) + DESFECHO BLINDADO
 * (fechar como resolvida exige dizer o que aconteceu com a peça; a API
 * aplica o efeito no estoque). Também é onde o item SEM contagem recebe
 * a quantidade real ao ser conferido.
 * IMPACTO SE ALTERADO: sem o desfecho tipado a API rejeita o "Sim" (422).
 */
function PendenciaPanel({
  item, invId, epcs, apenasChips, podeEditar, salvando, onSalvarPendencia, onResolver, onContar, precisaContagem,
}: {
  item: ItemInventario;
  invId: number;
  epcs: string[];
  apenasChips: boolean;     // item OK sem pendência: mostra só o bloco de chips
  podeEditar: boolean;      // inventário não cancelado
  salvando: boolean;
  onSalvarPendencia: (obs: string) => void;
  onResolver: (payload: { resolvida: boolean | null; resolucao_obs?: string; desfecho_tipo?: string; numero_venda?: string; numero_devolucao?: string; confirmar_baixa?: boolean }) => void;
  onContar: (qtd: number) => void;
  precisaContagem: boolean; // item ainda sem contagem
}) {
  const [obs, setObs] = useState(item.pendencia_obs ?? "");
  const [resObs, setResObs] = useState(item.pendencia_resolucao_obs ?? "");
  const [qtd, setQtd] = useState<string>("");
  // Desfecho blindado
  const [desfecho, setDesfecho] = useState<string>("");
  const [numeroVenda, setNumeroVenda] = useState("");
  const [devolucaoNumero, setDevolucaoNumero] = useState("");
  const [confirmarBaixa, setConfirmarBaixa] = useState(false);
  // Detetive (investigação automática, 100% leitura)
  const [investigando, setInvestigando] = useState(false);
  const [invest, setInvest] = useState<Investigacao | null>(null);
  const [investErro, setInvestErro] = useState<string | null>(null);

  const faltando = item.quantidade_contada !== null && item.diferenca < 0;
  const excesso  = item.quantidade_contada !== null && item.diferenca > 0;

  // Desfechos possíveis dependem do tipo de divergência (a API revalida)
  const opcoesDesfecho = faltando
    ? ["venda_sem_baixa", "perda", "localizada", "outro"]
    : excesso ? ["excedente_confirmado", "outro"] : ["outro"];

  // Conciliações (geram movimento) exigem o documento + confirmação;
  // registros (perda/localizada/outro) exigem o motivo escrito
  const desfechoValido =
    desfecho !== "" &&
    (desfecho !== "venda_sem_baixa" || (numeroVenda.trim() !== "" && confirmarBaixa)) &&
    (desfecho !== "excedente_confirmado" || (devolucaoNumero.trim() !== "" && confirmarBaixa)) &&
    (!["perda", "localizada", "outro"].includes(desfecho) || resObs.trim().length >= 3);

  // DETETIVE AUTOMÁTICO (v2.81.2): item faltando investiga sozinho ao abrir
  // o painel — o Jonathan não quer clique manual: contou e deu falta, o
  // sistema já mostra a causa provável com o nº da venda.
  useEffect(() => {
    if (faltando || excesso) void investigar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faltando, excesso, item.quantidade_contada]);

  async function investigar() {
    setInvestigando(true); setInvestErro(null);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/investigar?produto_id=${item.produto_id}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Erro ao investigar");
      setInvest(d as Investigacao);
    } catch (e) {
      setInvestErro(e instanceof Error ? e.message : "Erro ao investigar");
    } finally {
      setInvestigando(false);
    }
  }

  // Item OK sem pendência: só o bloco de peças e chips (nada de pendência/detetive).
  if (apenasChips) {
    return (
      <div className="px-4 py-3 rounded-b-xl"
        style={{ background: "#FDFBF6", border: "1px solid #F3F0E8", borderTop: "none" }}>
        <PecasChips item={item} epcs={epcs} />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 rounded-b-xl space-y-3"
      style={{ background: "#FDFBF6", border: "1px solid #F3F0E8", borderTop: "none" }}>

      {/* PEÇAS E CHIPS: número do chip de cada peça lida + o que faltou (só leitura) */}
      <PecasChips item={item} epcs={epcs} />

      {/* Contagem real para item sem contagem — nunca "inventar" o número */}
      {precisaContagem && podeEditar && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: "#92400E" }}>
            Item sem contagem — informe a quantidade real:
          </span>
          <input type="number" min={0} value={qtd} onChange={e => setQtd(e.target.value)}
            className="w-24 text-sm border rounded-lg px-2 py-1 outline-none"
            style={{ borderColor: "#E8DCC8" }} placeholder="Qtd." />
          <button
            disabled={salvando || qtd === "" || Number(qtd) < 0}
            onClick={() => onContar(Number(qtd))}
            className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{ background: "#184036", color: "#fff" }}>
            Salvar contagem
          </button>
        </div>
      )}

      {/* Descrição da pendência */}
      <div>
        <p className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: "#7A5A4A" }}>
          <MessageSquareText size={13} /> Qual é a pendência?
        </p>
        {podeEditar ? (
          <div className="flex gap-2 items-start">
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              className="flex-1 text-sm border rounded-lg px-2 py-1.5 outline-none resize-y"
              style={{ borderColor: "#E8DCC8", background: "#fff" }}
              placeholder="Ex: peça está no conserto, vendida sem baixa, extraviada..." />
            <button
              disabled={salvando || obs.trim().length < 3 || obs.trim() === (item.pendencia_obs ?? "")}
              onClick={() => onSalvarPendencia(obs.trim())}
              className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 shrink-0"
              style={{ background: "#B45309", color: "#fff" }}>
              {salvando ? "Salvando..." : item.pendencia_obs ? "Atualizar" : "Salvar pendência"}
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "#374151" }}>{item.pendencia_obs ?? "—"}</p>
        )}
        {item.pendencia_obs && item.pendencia_registrada_em && (
          <p className="text-[11px] text-gray-400 mt-1">
            Registrada por {nomeDoEmail(item.pendencia_registrada_por_email)} em {fmtDate(item.pendencia_registrada_em)}
          </p>
        )}
      </div>

      {/* DETETIVE: por que essa peça está faltando/sobrando? (só leitura) */}
      {(faltando || excesso) && (
        <div className="pt-2" style={{ borderTop: "1px dashed #E8DCC8" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <button disabled={investigando} onClick={investigar}
              className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: "#1E40AF", color: "#fff" }}>
              {investigando ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              {investigando ? "Investigando..." : "Investigar de novo"}
            </button>
            <span className="text-[11px] text-gray-400">roda sozinho ao abrir — busca vendas sem baixa, devoluções sem entrada, transferências e movimentos, sem alterar nada</span>
          </div>
          {investErro && <p className="text-xs mt-2" style={{ color: "#991B1B" }}>{investErro}</p>}
          {invest && (
            <div className="mt-2 space-y-2">
              {invest.conclusao ? (
                <div className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: invest.conclusao.confianca === "alta" ? "#DBEAFE" : "#FEF3C7",
                    color: invest.conclusao.confianca === "alta" ? "#1E40AF" : "#92400E" }}>
                  <span className="font-bold">{invest.conclusao.confianca === "alta" ? "Causa provável: " : "Possível causa: "}</span>
                  {invest.conclusao.resumo}
                </div>
              ) : (
                <p className="text-xs text-gray-500">Nenhuma causa óbvia encontrada — os achados abaixo são pistas, analise antes de fechar.</p>
              )}
              {invest.reservas.length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-semibold" style={{ color: "#7A5A4A" }}>Vendas não marcadas como entregues (reserva ativa):</p>
                  {invest.reservas.map(r => (
                    <div key={r.reserva_id} className="flex items-center gap-2 flex-wrap">
                      <span style={{ color: "#374151" }}>
                        Venda{" "}
                        <a href={`/vendas/${r.venda_id}`} target="_blank" rel="noreferrer"
                          className="font-bold underline" style={{ color: "#1E40AF" }}>
                          #{r.numero_venda}
                        </a>
                        {" "}— {r.quantidade} un. — {r.vendedor_nome ?? "vendedora ?"} — {r.situacao}{r.data_venda ? ` — ${new Date(r.data_venda).toLocaleDateString("pt-BR")}` : ""}
                      </span>
                      {podeEditar && item.pendencia_resolvida === null && (
                        <button className="underline" style={{ color: "#1E40AF" }}
                          onClick={() => { setDesfecho("venda_sem_baixa"); setNumeroVenda(r.numero_venda); }}>
                          usar esta venda no desfecho
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(invest.devolucoes ?? []).length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-semibold" style={{ color: "#7A5A4A" }}>Devoluções com retorno aprovado SEM entrada no saldo:</p>
                  {invest.devolucoes.map(d => (
                    <div key={d.id} className="flex items-center gap-2 flex-wrap">
                      <span style={{ color: "#374151" }}>
                        Devolução <b>{d.numero}</b> — {d.qtd_pendente} un. sem entrada ({d.status}) — {fmtDate(d.created_at)}
                      </span>
                      {podeEditar && item.pendencia_resolvida === null && (
                        <button className="underline" style={{ color: "#1E40AF" }}
                          onClick={() => { setDesfecho("excedente_confirmado"); setDevolucaoNumero(d.numero); }}>
                          usar esta devolução no desfecho
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {invest.transferencias.length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-semibold" style={{ color: "#7A5A4A" }}>Transferências pendentes (destino não confirmou):</p>
                  {invest.transferencias.map(t => (
                    <p key={t.id} style={{ color: "#374151" }}>{t.quantidade} un. para <b>{t.local_destino_nome ?? "?"}</b> em {fmtDate(t.created_at)}</p>
                  ))}
                </div>
              )}
              {invest.movimentacoes.length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-semibold" style={{ color: "#7A5A4A" }}>Movimentações DEPOIS da abertura do inventário:</p>
                  {invest.movimentacoes.map(m => (
                    <p key={m.id} style={{ color: "#374151" }}>{m.tipo} de {m.quantidade} un. ({m.motivo}) em {fmtDate(m.created_at)}</p>
                  ))}
                </div>
              )}
              {invest.reservas.length === 0 && invest.transferencias.length === 0 && invest.movimentacoes.length === 0 && (invest.devolucoes ?? []).length === 0 && (
                <p className="text-xs text-gray-500">Nenhum rastro encontrado (sem venda pendente, sem transferência, sem movimento) — pode ser perda real.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Desfecho BLINDADO: foi resolvida? (só aparece depois de descrever) */}
      {item.pendencia_obs && (
        <div className="pt-2" style={{ borderTop: "1px dashed #E8DCC8" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#7A5A4A" }}>
            A pendência foi resolvida?
          </p>
          {item.pendencia_resolvida === null ? (
            podeEditar && (
              <div className="space-y-2">
                {/* Escolha do desfecho — obrigatória para fechar como resolvida */}
                <select value={desfecho} onChange={e => { setDesfecho(e.target.value); setConfirmarBaixa(false); }}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 outline-none bg-white"
                  style={{ borderColor: "#E8DCC8" }}>
                  <option value="">O que aconteceu com a peça? (escolha o desfecho)</option>
                  {opcoesDesfecho.map(op => (
                    <option key={op} value={op}>{DESFECHO_LABEL[op]}</option>
                  ))}
                </select>
                {desfecho === "venda_sem_baixa" && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: "#7A5A4A" }}>Nº da venda:</span>
                    <input value={numeroVenda} onChange={e => setNumeroVenda(e.target.value)}
                      className="w-36 text-sm border rounded-lg px-2 py-1 outline-none"
                      style={{ borderColor: "#E8DCC8", background: "#fff" }} placeholder="Ex: 15628" />
                    <span className="text-[11px] text-gray-400">o sistema confere a venda antes de baixar</span>
                  </div>
                )}
                {desfecho === "excedente_confirmado" && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: "#7A5A4A" }}>Nº da devolução:</span>
                    <input value={devolucaoNumero} onChange={e => setDevolucaoNumero(e.target.value)}
                      className="w-36 text-sm border rounded-lg px-2 py-1 outline-none"
                      style={{ borderColor: "#E8DCC8", background: "#fff" }} placeholder="Ex: DEV-0012" />
                    <span className="text-[11px] text-gray-400">o sistema confere a devolução antes da entrada</span>
                  </div>
                )}
                {(desfecho === "venda_sem_baixa" || desfecho === "excedente_confirmado") && (
                  <label className="flex items-center gap-2 text-xs" style={{ color: "#991B1B" }}>
                    <input type="checkbox" checked={confirmarBaixa} onChange={e => setConfirmarBaixa(e.target.checked)} />
                    Confirmo a CONCILIAÇÃO de {Math.abs(item.diferenca)} un. (gera movimento no estoque, com rastro)
                  </label>
                )}
                {desfecho === "perda" && (
                  <p className="text-[11px]" style={{ color: "#92400E" }}>
                    Perda NÃO baixa o estoque (sem documento não há conciliação) — fica registrada e o saldo segue divergente até resolução.
                  </p>
                )}
                <textarea value={resObs} onChange={e => setResObs(e.target.value)} rows={2}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 outline-none resize-y"
                  style={{ borderColor: "#E8DCC8", background: "#fff" }}
                  placeholder={["perda", "localizada", "outro"].includes(desfecho)
                    ? "Motivo do desfecho (obrigatório)..."
                    : "Observação do desfecho (opcional)..."} />
                <div className="flex gap-2 flex-wrap">
                  <button disabled={salvando || !desfechoValido}
                    onClick={() => onResolver({
                      resolvida: true,
                      resolucao_obs: resObs.trim() || undefined,
                      desfecho_tipo: desfecho,
                      numero_venda: desfecho === "venda_sem_baixa" ? numeroVenda.trim() : undefined,
                      numero_devolucao: desfecho === "excedente_confirmado" ? devolucaoNumero.trim() : undefined,
                      confirmar_baixa: (desfecho === "venda_sem_baixa" || desfecho === "excedente_confirmado") ? confirmarBaixa : undefined,
                    })}
                    className="text-xs font-medium px-4 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: "#059669", color: "#fff" }}>
                    Sim, resolvida — aplicar desfecho
                  </button>
                  <button disabled={salvando}
                    onClick={() => onResolver({ resolvida: false, resolucao_obs: resObs.trim() || undefined })}
                    className="text-xs font-medium px-4 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: "#DC2626", color: "#fff" }}>
                    Não resolvida
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">Somente gerência responde. CONCILIAÇÕES (movem estoque, sempre casadas com venda/devolução) são exclusivas do administrador — mecanismo temporário até o sistema se organizar.</p>
              </div>
            )
          ) : (
            <div className="text-sm" style={{ color: "#374151" }}>
              <p className="font-medium" style={{ color: item.pendencia_resolvida ? "#065F46" : "#991B1B" }}>
                {item.pendencia_resolvida
                  ? `Sim — resolvida${item.pendencia_desfecho_tipo ? ` · ${DESFECHO_LABEL[item.pendencia_desfecho_tipo] ?? item.pendencia_desfecho_tipo}` : ""}`
                  : "Não — segue em aberto"}
              </p>
              {item.pendencia_desfecho_numero_venda && (
                <p className="text-xs mt-0.5">
                  Venda vinculada:{" "}
                  {item.pendencia_desfecho_venda_id ? (
                    <a href={`/vendas/${item.pendencia_desfecho_venda_id}`} target="_blank" rel="noreferrer"
                      className="font-bold underline" style={{ color: "#1E40AF" }}>
                      #{item.pendencia_desfecho_numero_venda}
                    </a>
                  ) : (
                    <b>#{item.pendencia_desfecho_numero_venda}</b>
                  )}
                </p>
              )}
              {item.pendencia_resolucao_obs && <p className="mt-0.5">{item.pendencia_resolucao_obs}</p>}
              {item.pendencia_resolvida_em && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Respondida por {nomeDoEmail(item.pendencia_resolvida_por_email)} em {fmtDate(item.pendencia_resolvida_em)}
                </p>
              )}
              {podeEditar && (
                <button disabled={salvando} onClick={() => onResolver({ resolvida: null })}
                  className="text-[11px] underline text-gray-400 hover:text-gray-600 mt-1"
                  title="Desfecho que gerou movimentação exige estorno — o sistema bloqueia">
                  desfazer resposta
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item, invId, status, epcs, conferido, salvando, expandido, onToggleConferido, onToggleExpand, isAberto, podeEditarPendencia,
  onSalvarPendencia, onResolver, onContar, investigacao, podeVerValores, valorInfo,
}: {
  item: ItemInventario;
  invId: number;
  status: StatusItem;
  epcs: string[];
  conferido: boolean;
  salvando: boolean;
  expandido: boolean;
  onToggleConferido: () => void;
  onToggleExpand: () => void;
  isAberto: boolean;
  podeEditarPendencia: boolean;
  onSalvarPendencia: (obs: string) => void;
  onResolver: (payload: { resolvida: boolean | null; resolucao_obs?: string; desfecho_tipo?: string; numero_venda?: string; numero_devolucao?: string; confirmar_baixa?: boolean }) => void;
  onContar: (qtd: number) => void;
  investigacao?: { conclusao: { tipo: string; confianca: "alta" | "media"; resumo: string } | null; temPistas: boolean } | null;
  podeVerValores: boolean;
  valorInfo?: ValorItem | null;
}) {
  const lido = item.quantidade_contada ?? 0;
  // Pendência só existe onde há problema: divergente ou sem contagem
  const temProblema = status !== "ok";
  const temChips = epcs.length > 0;
  // Item OK também abre quando tem chip lido — pra ver o número da(s) peça(s).
  const expandivel = temProblema || !!item.pendencia_obs || temChips;
  // OK sem pendência: expandir mostra SÓ os chips (sem a caixa de pendência/detetive).
  const apenasChips = !temProblema && !item.pendencia_obs;
  const statusDot = STATUS_COLOR[status].text;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3"
        style={{
          background: conferido ? "#F0FDF4" : "#FAFAF7",
          border: `1px solid ${conferido ? "#BBF7D0" : "#F3F0E8"}`,
          borderRadius: expandido ? "0.75rem 0.75rem 0 0" : "0.75rem",
        }}>
        {isAberto && (
          <button
            onClick={onToggleConferido}
            disabled={salvando}
            className="shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
            style={{
              borderColor: conferido ? "#059669" : "#D1D5DB",
              background: conferido ? "#059669" : "transparent",
            }}
            title={
              status === "pendente" && !conferido
                ? "Item sem contagem — informe a quantidade real para conferir"
                : conferido ? "Desmarcar conferido" : "Marcar como conferido"
            }
          >
            {salvando
              ? <span className="w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              : conferido && <svg viewBox="0 0 12 12" width="10" height="10" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            }
          </button>
        )}
        {/* Ponto de status à esquerda: cor = OK/Faltando/Excesso/Sem contagem */}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusDot }} />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => expandivel && onToggleExpand()}>
          <p className="text-sm font-medium truncate" style={{ fontFamily: "monospace", color: "#184036" }}>
            {item.sku ?? "—"}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {item.nome_produto}{item.categoria_produto ? ` · ${item.categoria_produto}` : ""}
          </p>
          {/* Detetive vira LINHA discreta (não pílula amontoada): conclusão em
              lote OU aviso de que há pistas para abrir e investigar */}
          {investigacao?.conclusao ? (
            <p className="text-[11px] truncate mt-0.5" style={{ color: investigacao.conclusao.confianca === "alta" ? "#1E40AF" : "#92400E" }}>
              🔎 {investigacao.conclusao.resumo}
            </p>
          ) : investigacao?.temPistas ? (
            <p className="text-[11px] truncate mt-0.5" style={{ color: "#92400E" }}>
              🔍 há pistas — abra para investigar
            </p>
          ) : null}
          {/* Valor (RESTRITO): unitário + total da quantidade deste SKU. Total usa
              a qtd contada (o que está em mãos); sem contagem, cai na do sistema. */}
          {podeVerValores && valorInfo && (
            <p className="text-[11px] truncate mt-0.5" style={{ color: "#7A5A4A" }}>
              💠 un {fmtBRL(valorInfo.valor_unitario)} · total {fmtBRL(valorInfo.valor_unitario * (item.quantidade_contada ?? item.quantidade_sistema))}
            </p>
          )}
        </div>
        <PendenciaBadge item={item} />
        <span className="text-sm font-bold shrink-0" style={{ color: "#374151" }}>
          {lido}/{item.quantidade_sistema}
        </span>
        <Badge status={status} />
        {expandivel && (
          <button onClick={onToggleExpand} className="shrink-0 text-gray-400 hover:text-gray-600"
            title={expandido ? "Fechar detalhes" : apenasChips ? "Ver peças e chips" : "Detalhar pendência"}>
            {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
      {expandido && expandivel && (
        <PendenciaPanel
          item={item}
          invId={invId}
          epcs={epcs}
          apenasChips={apenasChips}
          podeEditar={podeEditarPendencia}
          salvando={salvando}
          onSalvarPendencia={onSalvarPendencia}
          onResolver={onResolver}
          onContar={onContar}
          precisaContagem={item.quantidade_contada === null}
        />
      )}
    </div>
  );
}

// Caixa de total geral (valor ou peso). `destaque` = borda esmeralda (o número
// que mais importa: o contado).
function ValorBox({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "#fff", border: `1px solid ${destaque ? "#184036" : "#E8DCC8"}` }}>
      <p className="text-[11px]" style={{ color: "#8A857A" }}>{label}</p>
      <p className="text-base font-bold leading-tight" style={{ color: destaque ? "#184036" : "#374151" }}>{valor}</p>
    </div>
  );
}

/**
 * Painel RESTRITO de valores (só desenvolvedor + dono; a API nem manda o dado
 * para os demais). Mostra os TOTAIS gerais (valor/peso, esperado e contado) e,
 * recolhível, a tabela por SKU com o UNITÁRIO (valor e peso), a quantidade e o
 * total de cada SKU. Só leitura — nada aqui altera estoque.
 */
function ValoresPanel({ valores }: { valores: Valores }) {
  const [aberto, setAberto] = useState(true);
  const [tabelaAberta, setTabelaAberta] = useState(false);
  const t = valores.totais;
  const itens = [...valores.itens].sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? ""));

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid #E8DCC8", background: "#F9F6F0" }}>
      <button onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold"
        style={{ color: "#184036" }}>
        <span className="flex items-center gap-2">
          <Gem size={15} /> Valores do inventário
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#184036", color: "#F3EADA" }}>RESTRITO</span>
        </span>
        <span className="text-xs font-normal" style={{ color: "#6B7280" }}>{aberto ? "▲ ocultar" : "▼ mostrar"}</span>
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          {/* Totais gerais: valor e peso, esperado × contado (o contado em destaque) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <ValorBox label="Valor esperado" valor={fmtBRL(t.valor_esperado)} />
            <ValorBox label="Valor contado (total geral)" valor={fmtBRL(t.valor_contado)} destaque />
            <ValorBox label="Peso esperado" valor={fmtG(t.peso_esperado)} />
            <ValorBox label="Peso contado" valor={fmtG(t.peso_contado)} />
          </div>

          {/* Detalhe por SKU: unitário (R$/g), quantidade e total de cada SKU */}
          <button onClick={() => setTabelaAberta(v => !v)}
            className="text-xs font-medium underline" style={{ color: "#184036" }}>
            {tabelaAberta ? "▲ ocultar detalhe por SKU" : `▼ ver detalhe por SKU (${itens.length})`}
          </button>
          {tabelaAberta && (
            <div className="mt-2 overflow-x-auto rounded-lg" style={{ border: "1px solid #E8DCC8" }}>
              <table className="w-full text-xs" style={{ minWidth: 620 }}>
                <thead style={{ background: "#EFE7D6" }}>
                  <tr style={{ color: "#7A5A4A" }}>
                    <th className="text-left px-2.5 py-1.5 font-semibold">SKU</th>
                    <th className="text-right px-2.5 py-1.5 font-semibold">un. R$</th>
                    <th className="text-right px-2.5 py-1.5 font-semibold">un. g</th>
                    <th className="text-right px-2.5 py-1.5 font-semibold">qtd esp→cont</th>
                    <th className="text-right px-2.5 py-1.5 font-semibold">R$ esp / cont</th>
                    <th className="text-right px-2.5 py-1.5 font-semibold">g esp / cont</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map(it => {
                    const qs = it.quantidade_sistema;
                    const qc = it.quantidade_contada;
                    return (
                      <tr key={it.produto_id} style={{ borderTop: "1px solid #F1ECE1" }}>
                        <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={{ color: "#184036" }}>{it.sku ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{fmtBRL(it.valor_unitario)}</td>
                        <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{it.peso_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{qs}→{qc ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{fmtBRL(qs * it.valor_unitario)} / {qc == null ? "—" : fmtBRL(qc * it.valor_unitario)}</td>
                        <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{fmtG(qs * it.peso_unitario)} / {qc == null ? "—" : fmtG(qc * it.peso_unitario)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #E8DCC8", background: "#F3EADA" }}>
                    <td className="px-2.5 py-2 font-bold whitespace-nowrap" style={{ color: "#184036" }}>Total ({itens.length})</td>
                    <td /><td /><td />
                    <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap" style={{ color: "#184036" }}>{fmtBRL(t.valor_esperado)} / {fmtBRL(t.valor_contado)}</td>
                    <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap" style={{ color: "#184036" }}>{fmtG(t.peso_esperado)} / {fmtG(t.peso_contado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InventarioDetalhePage() {
  const router = useRouter();
  const params = useParams();
  const invId = Number(params.id);
  const { role, user } = useAuth();
  // Operador de inventário: ações viram PEDIDO de aprovação — os textos e
  // rótulos abaixo mudam para deixar isso claro (não conclui/cancela na hora).
  const isOperador = role === "operador_inventario";
  // Valores (R$/peso) são RESTRITOS: só desenvolvedor e o dono (Alisson). O
  // back também trava — este flag só decide o que renderizar (não é a barreira).
  const podeVerValores = role === "desenvolvedor" || user?.email === "alisson@alissonjoias.com.br";

  const [inventario, setInventario] = useState<InventarioHeader | null>(null);
  const [itens, setItens] = useState<ItemInventario[]>([]);
  const [leituras, setLeituras] = useState<LeiturasEPC[]>([]);
  const [totalLeituras, setTotalLeituras] = useState(0);
  // Mapa produto_id -> [epc,...] (número do chip de cada peça lida)
  const [epcsPorProduto, setEpcsPorProduto] = useState<Record<number, string[]>>({});
  // Valores (restrito): null quando o usuário não pode ver (a API não envia)
  const [valores, setValores] = useState<Valores | null>(null);
  // Linhas "fora do inventário" expandidas (mostram os chips lidos)
  const [foraExpandido, setForaExpandido] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [concluindo, setConcluindo] = useState(false);
  const [cancelModalAberto, setCancelModalAberto] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState(false);
  const [leiturasAbertas, setLeiturasAbertas] = useState(false);
  const [excedentesForaInventario, setExcedentesForaInventario] = useState<ExcedenteForaInventario[]>([]);
  const [conferidoIds, setConferidoIds] = useState<Set<number>>(new Set());
  const [salvandoIds, setSalvandoIds] = useState<Set<number>>(new Set());
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  // Filtro do placar de pendências: null = sem filtro (lista completa)
  const [filtroPendencia, setFiltroPendencia] = useState<"aberta" | "resolvida" | "nao_resolvida" | null>(null);
  // Filtros novos: categoria do produto e status (cartões OK/Faltando/Excesso/Sem contagem)
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusItem | "fora" | null>(null);
  const [infoStatusAberto, setInfoStatusAberto] = useState(false);
  // Paginação por seção (Excedentes/Faltando/Sem contagem/OK): quantos itens mostrar
  const PAGINA = 50;
  const [visivelPorSecao, setVisivelPorSecao] = useState<Record<string, number>>({});
  // "Conferidos OK" recolhido por padrão — costuma ser a maioria dos itens
  const [okAberto, setOkAberto] = useState(false);
  // Resultado do Detetive rodado em lote (produto_id -> conclusão), badge na linha
  const [investigacoes, setInvestigacoes] = useState<Record<number, { conclusao: { tipo: string; confianca: "alta" | "media"; resumo: string } | null; temPistas: boolean }>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        setMsg({ tipo: "erro", texto: e.error ?? `Erro ao carregar inventário (${r.status})` });
        return;
      }
      const d = await r.json() as {
        inventario: InventarioHeader;
        itens: ItemInventario[];
        leituras?: LeiturasEPC[];
        total_leituras?: number;
        excedentesForaInventario?: ExcedenteForaInventario[];
        epcsPorProduto?: Record<number, string[]>;
        valores?: Valores | null;
      };
      setInventario(d.inventario);
      setItens(d.itens);
      setLeituras(d.leituras ?? []);
      setTotalLeituras(d.total_leituras ?? d.leituras?.length ?? 0);
      setEpcsPorProduto(d.epcsPorProduto ?? {});
      setValores(d.valores ?? null);
      setExcedentesForaInventario(d.excedentesForaInventario ?? []);
      setConferidoIds(new Set(d.itens.filter(i => i.conferido).map(i => i.produto_id)));

      // Detetive em lote — busca resultado de todos os itens divergentes de
      // uma vez só (não bloqueia o carregamento principal: falha aqui não
      // impede ver a tela, só deixa de mostrar a pista na linha)
      fetch(`/api/estoque-comercial/inventario/${invId}/investigar-lote`)
        .then(res => res.ok ? res.json() : null)
        .then(dl => { if (dl?.resultados) setInvestigacoes(dl.resultados); })
        .catch(() => {});
    } catch {
      setMsg({ tipo: "erro", texto: "Falha de rede ao carregar o inventário." });
    } finally { setLoading(false); }
  }, [invId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Mostra mais 50 itens de uma seção (paginação simples)
  function mostrarMais(secao: string) {
    setVisivelPorSecao(prev => ({ ...prev, [secao]: (prev[secao] ?? PAGINA) + PAGINA }));
  }

  function marcarSalvando(produtoId: number, on: boolean) {
    setSalvandoIds(prev => {
      const s = new Set(prev);
      if (on) s.add(produtoId); else s.delete(produtoId);
      return s;
    });
  }

  /**
   * Conclusão com trava dupla: o servidor devolve 409 se houver itens sem
   * contagem ou pendências sem resposta — só conclui com confirmação
   * explícita (forcar), e isso fica gravado na auditoria.
   */
  async function concluirInventario() {
    if (!confirm(
      isOperador
        ? "Enviar pedido de CONCLUSÃO para aprovação do administrador?\n\nO inventário só será concluído depois que ele aprovar."
        : "Concluir inventário?\n\nA contagem será congelada como registro de auditoria. " +
          "NENHUM ajuste de estoque é feito automaticamente — divergências devem ser tratadas item a item."
    )) return;
    setConcluindo(true); setMsg(null);
    try {
      let r = await fetch(`/api/estoque-comercial/inventario/${invId}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forcar: false }),
      });
      if (r.status === 409) {
        const d = await r.json() as { requer_confirmacao?: boolean; nao_contados?: number; pendencias_abertas?: number; error?: string };
        if (!d.requer_confirmacao) throw new Error(d.error ?? "Erro");
        const detalhes = [
          d.nao_contados ? `${d.nao_contados} item(ns) SEM CONTAGEM` : null,
          d.pendencias_abertas ? `${d.pendencias_abertas} pendência(s) SEM RESPOSTA` : null,
        ].filter(Boolean).join(" e ");
        if (!confirm(`ATENÇÃO: há ${detalhes}.\n\nConcluir mesmo assim? Essa decisão fica registrada na auditoria.`)) {
          return;
        }
        r = await fetch(`/api/estoque-comercial/inventario/${invId}/concluir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forcar: true }),
        });
      }
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const data = await r.json() as { divergentes: number; nao_contados: number; pendencias_abertas: number; solicitado?: boolean; mensagem?: string };
      // Operador de inventário: conclusão vira PEDIDO aprovado pelo admin
      if (data.solicitado) {
        setMsg({ tipo: "ok", texto: data.mensagem ?? "Pedido de conclusão enviado para aprovação do administrador." });
        return;
      }
      setMsg({
        tipo: "ok",
        texto: `Inventário concluído. ${data.divergentes} divergência(s) registrada(s)` +
          (data.pendencias_abertas ? `, ${data.pendencias_abertas} pendência(s) aguardando resposta` : "") +
          ". Nenhum ajuste de estoque foi gerado automaticamente.",
      });
      await fetchData();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao concluir" });
    } finally { setConcluindo(false); }
  }

  async function confirmarCancelamento() {
    if (motivoCancelamento.trim().length < 5) {
      setMsg({ tipo: "erro", texto: "Informe o motivo do cancelamento (mínimo 5 caracteres)." });
      return;
    }
    setCancelando(true); setMsg(null);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivoCancelamento.trim() }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const dataCancel = await r.json().catch(() => ({})) as { solicitado?: boolean; mensagem?: string };
      setCancelModalAberto(false);
      setMotivoCancelamento("");
      // Operador de inventário: cancelamento vira PEDIDO aprovado pelo admin
      if (dataCancel.solicitado) {
        setMsg({ tipo: "ok", texto: dataCancel.mensagem ?? "Pedido de cancelamento enviado para aprovação do administrador." });
        return;
      }
      await fetchData();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao cancelar" });
    } finally { setCancelando(false); }
  }

  /**
   * Toggle do conferido — NUNCA envia contagem junto (era o bug que
   * transformava item pendente em OK sem ninguém contar).
   * Item sem contagem: abre o painel pedindo a quantidade real.
   */
  async function toggleConferido(item: ItemInventario) {
    if (!isAberto) return;
    if (item.quantidade_contada === null && !conferidoIds.has(item.produto_id)) {
      setExpandidoId(item.id);
      setMsg({ tipo: "erro", texto: `${item.sku ?? item.nome_produto}: informe a quantidade contada antes de marcar como conferido.` });
      return;
    }
    const novoConferido = !conferidoIds.has(item.produto_id);
    marcarSalvando(item.produto_id, true);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/contar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contagens: [{ produto_id: item.produto_id, conferido: novoConferido }] }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro ao salvar conferido");
      setConferidoIds(prev => {
        const next = new Set(prev);
        if (novoConferido) next.add(item.produto_id); else next.delete(item.produto_id);
        return next;
      });
      setItens(prev => prev.map(i => i.id === item.id ? { ...i, conferido: novoConferido } : i));
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao salvar conferido" });
    } finally {
      marcarSalvando(item.produto_id, false);
    }
  }

  // Contagem manual de item sem contagem (via painel expandido)
  async function contarItem(item: ItemInventario, qtd: number) {
    marcarSalvando(item.produto_id, true); setMsg(null);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/contar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contagens: [{ produto_id: item.produto_id, quantidade_contada: qtd, conferido: true }] }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro ao salvar contagem");
      await fetchData();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao salvar contagem" });
    } finally {
      marcarSalvando(item.produto_id, false);
    }
  }

  // Salva descrição e/ou resolução da pendência e atualiza o item na tela
  async function patchPendencia(item: ItemInventario, payload: Record<string, unknown>) {
    marcarSalvando(item.produto_id, true); setMsg(null);
    try {
      const r = await fetch(`/api/estoque-comercial/inventario/${invId}/pendencia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, ...payload }),
      });
      const d = await r.json().catch(() => ({})) as { error?: string; item?: Partial<ItemInventario> };
      if (!r.ok) throw new Error(d.error ?? "Erro ao salvar pendência");
      if (d.item) {
        setItens(prev => prev.map(i => i.id === item.id ? { ...i, ...d.item } : i));
      }
      setMsg({ tipo: "ok", texto: "Pendência salva." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao salvar pendência" });
    } finally {
      marcarSalvando(item.produto_id, false);
    }
  }

  // REGRA DE NEGÓCIO: Exporta os itens do inventário para CSV (abre no Excel)
  // O BOM (\uFEFF) garante que acentos e caracteres especiais sejam
  // reconhecidos corretamente ao abrir o arquivo no Excel.
  function exportarCSV() {
    const header = [
      "SKU", "Nome do Produto", "Qtd. Sistema", "Qtd. Contada", "Diferença",
      "Status", "Conferido", "Pendência", "Resolvida", "Obs. Resolução",
    ].join(",");

    const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const linhas = itens
      .map((item) => {
        const status = STATUS_LABEL[getStatus(item)];
        const conferido = conferidoIds.has(item.produto_id) ? "Sim" : "Não";
        const qtdContada = item.quantidade_contada ?? "";
        const resolvida = item.pendencia_obs
          ? (item.pendencia_resolvida === true ? "Sim" : item.pendencia_resolvida === false ? "Não" : "Sem resposta")
          : "";
        return [
          item.sku ?? "",
          csvCell(item.nome_produto),
          item.quantidade_sistema,
          qtdContada,
          item.diferenca,
          status,
          conferido,
          csvCell(item.pendencia_obs ?? ""),
          resolvida,
          csvCell(item.pendencia_resolucao_obs ?? ""),
        ].join(",");
      })
      .join("\n");

    const bom = "\uFEFF";
    const blob = new Blob([bom + header + "\n" + linhas], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario_${invId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
    </div>
  );

  if (!inventario) return (
    <div className="p-6 text-center text-gray-500">
      {msg?.texto ?? "Inventario nao encontrado."}
    </div>
  );

  const isAberto = inventario.status === "aberto" || inventario.status === "em_contagem";
  // Pendências podem ser tratadas até depois de concluído — só cancelado trava
  const podeEditarPendencia = inventario.status !== "cancelado";

  const totalEsperado = itens.length;
  const contados      = itens.filter(i => i.quantidade_contada !== null).length;
  const okCount       = itens.filter(i => getStatus(i) === "ok").length;
  const faltandoCount = itens.filter(i => getStatus(i) === "faltando").length;
  const semContagem   = itens.filter(i => getStatus(i) === "pendente").length;
  const excessoCount  = itens.filter(i => getStatus(i) === "excesso").length;
  // "Fora do inventário": etiquetas lidas pelo app de produto fora da lista —
  // card e filtro PRÓPRIOS (antes ficavam somados no card Excesso e a lista
  // nunca respeitava filtro nenhum — bug reportado pelo Jonathan v2.82.1)
  const foraCount     = excedentesForaInventario.length;
  const pendAbertas   = itens.filter(i => i.pendencia_obs && i.pendencia_resolvida === null).length;
  const pendResolvidas = itens.filter(i => i.pendencia_resolvida === true).length;
  const pendNaoResolvidas = itens.filter(i => i.pendencia_resolvida === false).length;

  // ── Contagem dupla: PEÇAS (unidades físicas) × SKUs (linhas/modelos) ──
  // POR QUÊ: 1 SKU pode faltar várias peças; contar só linhas escondia o
  //   tamanho real da falta. Tudo derivado do que a API já devolve.
  const esperadoPecas = itens.reduce((s, i) => s + i.quantidade_sistema, 0);
  const contadoPecas  = itens.reduce((s, i) => s + (i.quantidade_contada ?? 0), 0);
  // FALTANDO = peças esperadas NÃO encontradas = contadas A MENOS + NUNCA contadas.
  //   (regra do Jonathan 13/07: item sem contagem = peça não encontrada. Antes o
  //    card mostrava só as "a menos" e escondia as nunca contadas, subestimando a
  //    falta.) O "Sem contagem" segue como filtro/seção pra achar o que falta contar.
  const faltandoContadasPecas = itens.reduce((s, i) => s + (i.quantidade_contada !== null && i.diferenca < 0 ? -i.diferenca : 0), 0);
  const naoContadasPecas      = itens.reduce((s, i) => s + (i.quantidade_contada === null ? i.quantidade_sistema : 0), 0);
  const faltandoPecas = faltandoContadasPecas + naoContadasPecas;
  const faltandoSkus  = itens.filter(i => i.quantidade_sistema > (i.quantidade_contada ?? 0)).length;
  // EXCESSO = só peças contadas A MAIS de itens DA LISTA. O "fora do inventário"
  //   (etiqueta de produto que nem está na lista) tem seção/filtro próprios.
  const excessoPecas  = itens.reduce((s, i) => s + (i.diferenca > 0 ? i.diferenca : 0), 0);
  const excessoSkus   = excessoCount;

  // Categorias existentes NESTE inventário, com a contagem de cada uma —
  // vira o filtro de chips no topo (combinável com status/pendência/busca)
  const categorias = Array.from(new Set(
    itens.map(i => i.categoria_produto).filter((c): c is string => !!c)
  )).sort();
  const contagemCategoria = (cat: string) => itens.filter(i => i.categoria_produto === cat).length;

  /**
   * O QUÊ: filtro combinado — busca por SKU/nome + pendência (placar) +
   *   categoria do produto + status (cartões OK/Faltando/Excesso/Sem contagem).
   * POR QUÊ: item com pendência que volta a ficar OK desce para o bloco
   *   "Conferidos OK" no fim da página e a pendência parecia sumir — os
   *   filtros clicáveis trazem esses itens de volta à vista em um clique,
   *   e cruzam com categoria (ex: só "Faltando" dentro de "Anéis").
   * IMPACTO SE ALTERADO: pendência de item corrigido só seria achada rolando
   *   a lista inteira (em inventários grandes, na prática se perde).
   */
  const matchPendencia = (i: ItemInventario): boolean => {
    if (!filtroPendencia) return true;
    if (filtroPendencia === "aberta") return !!i.pendencia_obs && i.pendencia_resolvida === null;
    if (filtroPendencia === "resolvida") return i.pendencia_resolvida === true;
    return i.pendencia_resolvida === false;
  };
  const matchCategoria = (i: ItemInventario): boolean => !filtroCategoria || i.categoria_produto === filtroCategoria;
  // "Faltando" (card) mostra faltando + sem contagem (ambos = peças não
  // encontradas). O chip "Sem contagem" filtra só as nunca contadas (subconjunto).
  const matchStatus = (i: ItemInventario): boolean => {
    if (!filtroStatus) return true;
    if (filtroStatus === "faltando") { const st = getStatus(i); return st === "faltando" || st === "pendente"; }
    return getStatus(i) === filtroStatus;
  };
  const filtro = busca.trim().toLowerCase();
  const itensFiltrados = itens.filter(i =>
    matchPendencia(i) && matchCategoria(i) && matchStatus(i) &&
    (!filtro || !!i.sku?.toLowerCase().includes(filtro) || i.nome_produto.toLowerCase().includes(filtro))
  );

  const excessos   = itensFiltrados.filter(i => getStatus(i) === "excesso").sort((a, b) => b.diferenca - a.diferenca);
  const faltandoL  = itensFiltrados.filter(i => getStatus(i) === "faltando").sort((a, b) => a.diferenca - b.diferenca);
  const pendentesL = itensFiltrados.filter(i => getStatus(i) === "pendente");
  const okL        = itensFiltrados.filter(i => getStatus(i) === "ok");

  // Paginação: cada seção mostra 50 por vez ("mostrar mais" avança)
  const excessosVis   = excessos.slice(0, visivelPorSecao.excesso ?? PAGINA);
  const faltandoVis   = faltandoL.slice(0, visivelPorSecao.faltando ?? PAGINA);
  const pendentesVis  = pendentesL.slice(0, visivelPorSecao.pendente ?? PAGINA);
  const okVis         = okL.slice(0, visivelPorSecao.ok ?? PAGINA);

  /**
   * "Chips fora do inventário" (etiqueta lida pelo app de produto que NÃO
   * está na lista deste inventário) agora respeita categoria + busca, e SÓ
   * aparece quando o filtro de status é null, "excesso" ou "fora" — clicar
   * em Faltando/OK/Sem contagem esconde esta seção (bug do Jonathan v2.82.1:
   * a lista ficava fixa na tela não importa qual cartão fosse clicado).
   */
  const excedentesFiltrados = excedentesForaInventario.filter(e =>
    (!filtroCategoria || e.categoria_produto === filtroCategoria) &&
    (!filtro || e.sku.toLowerCase().includes(filtro) || e.nome_produto.toLowerCase().includes(filtro))
  );
  const mostraForaInventario = filtroStatus === null || filtroStatus === "fora";

  const statusMap: Record<string, { label: string; bg: string; txt: string }> = {
    aberto:      { label: "Aberto",      bg: "#DBEAFE", txt: "#1E40AF" },
    em_contagem: { label: "Em contagem", bg: "#FEF3C7", txt: "#92400E" },
    concluido:   { label: "Concluido",   bg: "#D1FAE5", txt: "#065F46" },
    cancelado:   { label: "Cancelado",   bg: "#FEE2E2", txt: "#991B1B" },
  };
  const s = statusMap[inventario.status] ?? { label: inventario.status, bg: "#F3F4F6", txt: "#6B7280" };

  // Mapa produto_id -> valores (para a linha do item mostrar R$ inline, restrito)
  const valorPorProduto: Record<number, ValorItem> = {};
  if (valores) for (const v of valores.itens) valorPorProduto[v.produto_id] = v;

  const renderRow = (item: ItemInventario, status: StatusItem) => (
    <ItemRow key={item.id} item={item} invId={invId} status={status}
      epcs={epcsPorProduto[item.produto_id] ?? []}
      podeVerValores={podeVerValores}
      valorInfo={valorPorProduto[item.produto_id]}
      investigacao={investigacoes[item.produto_id] ?? null}
      conferido={conferidoIds.has(item.produto_id)}
      salvando={salvandoIds.has(item.produto_id)}
      expandido={expandidoId === item.id}
      onToggleConferido={() => toggleConferido(item)}
      onToggleExpand={() => setExpandidoId(prev => prev === item.id ? null : item.id)}
      isAberto={isAberto}
      podeEditarPendencia={podeEditarPendencia}
      onSalvarPendencia={(obs) => patchPendencia(item, { pendencia_obs: obs })}
      onResolver={(payload) => patchPendencia(item, payload)}
      onContar={(qtd) => contarItem(item, qtd)}
    />
  );

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <button className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial/inventario")}>
        <ArrowLeft size={15} /> Inventarios
      </button>

      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Inventario #{inventario.id}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {inventario.local_nome} &middot; aberto em {fmtDate(inventario.data_abertura)}
            {inventario.criado_por_email ? ` por ${nomeDoEmail(inventario.criado_por_email)}` : ""}
          </p>
          {inventario.status === "concluido" && inventario.data_conclusao && (
            <p className="text-sm text-gray-500">
              Concluído em {fmtDate(inventario.data_conclusao)}
              {inventario.concluido_por_email ? ` por ${nomeDoEmail(inventario.concluido_por_email)}` : ""}
            </p>
          )}
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {inventario.categoria && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#F3EADA", color: "#7A5A4A" }}>
                {inventario.categoria}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: s.bg, color: s.txt }}>{s.label}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm hover:bg-gray-50"
            style={{ border: "1px solid #E8DCC8", color: "#6B7280" }}
            onClick={exportarCSV}>
            <FileDown size={14} />
            Exportar
          </button>
          {isAberto && (
            <>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm hover:bg-red-50"
                style={{ color: "#DC2626" }}
                onClick={() => { setCancelModalAberto(true); setMsg(null); }} disabled={cancelando}>
                <XCircle size={14} />
                {isOperador ? "Solicitar cancelamento" : "Cancelar"}
              </button>
              <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: "#059669", color: "#fff" }}
                onClick={concluirInventario}
                disabled={concluindo}
                title={semContagem > 0 ? `${semContagem} item(ns) sem contagem — será pedida confirmação` : ""}>
                {concluindo ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                {isOperador ? "Solicitar conclusão" : "Concluir"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Faixa de cancelamento: quem cancelou e por quê */}
      {inventario.status === "cancelado" && (
        <div className="rounded-xl px-4 py-2.5 mb-4 text-sm flex items-start gap-2"
          style={{ background: "#FEE2E2", color: "#991B1B" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Cancelado{inventario.cancelado_por_email ? ` por ${nomeDoEmail(inventario.cancelado_por_email)}` : ""}
            {inventario.data_conclusao ? ` em ${fmtDate(inventario.data_conclusao)}` : ""}.
            {inventario.motivo_cancelamento ? ` Motivo: ${inventario.motivo_cancelamento}` : ""}
          </span>
        </div>
      )}

      {msg && (
        <div className="rounded-xl px-4 py-2 mb-4 text-sm flex items-start justify-between gap-2"
          style={msg.tipo === "ok"
            ? { background: "#D1FAE5", color: "#065F46" }
            : { background: "#FEE2E2", color: "#991B1B" }}>
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* 1) 4 cartões de MÉTRICA (peças×SKU) no topo. Faltando/Excesso clicáveis = filtram. */}
      <div className="flex gap-2 mb-3">
        <MetricCard label="Esperado" pecas={esperadoPecas} skus={totalEsperado} color="#184036" />
        <MetricCard label="Contado"  pecas={contadoPecas}  skus={contados}      color="#184036" />
        <MetricCard label="Faltando" pecas={faltandoPecas} skus={faltandoSkus} color="#DC2626"
          ativo={filtroStatus === "faltando"} onClick={() => setFiltroStatus(p => p === "faltando" ? null : "faltando")} />
        <MetricCard label="Excesso"  pecas={excessoPecas}  skus={excessoSkus} color="#2563EB"
          ativo={filtroStatus === "excesso"} onClick={() => setFiltroStatus(p => p === "excesso" ? null : "excesso")} />
      </div>

      {/* 2) Filtros de status que NÃO têm card (OK / Sem contagem / Fora).
          Clicar no chip ativo (✕) limpa. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <FiltroChip label="OK" count={okCount} ativo={filtroStatus === "ok"} color="#059669"
          onClick={() => setFiltroStatus(p => p === "ok" ? null : "ok")} />
        <FiltroChip label="Sem contagem" count={semContagem} ativo={filtroStatus === "pendente"} color="#6B7280"
          onClick={() => setFiltroStatus(p => p === "pendente" ? null : "pendente")} />
        {foraCount > 0 && (
          <FiltroChip label="Fora do invent." count={foraCount} ativo={filtroStatus === "fora"} color="#7C3AED"
            onClick={() => setFiltroStatus(p => p === "fora" ? null : "fora")} />
        )}
        <button onClick={() => setInfoStatusAberto(v => !v)}
          className="shrink-0 text-gray-400 hover:text-gray-600 px-1"
          title="O que significa cada status?">
          <Info size={16} />
        </button>
      </div>
      {infoStatusAberto && <StatusInfoBox />}

      {/* 3) Categoria (seletor) — linha abaixo dos filtros */}
      {categorias.length > 0 && (
        <div className="mb-3">
          <label className="flex items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "#7A5A4A" }}>Categoria</span>
            <select value={filtroCategoria ?? ""} onChange={e => setFiltroCategoria(e.target.value || null)}
              className="text-sm border rounded-lg pl-2.5 pr-7 py-1.5 outline-none bg-white cursor-pointer max-w-[260px]"
              style={{ borderColor: "#E8DCC8", color: "#184036" }}>
              <option value="">Todas ({itens.length})</option>
              {categorias.map(cat => <option key={cat} value={cat}>{cat} ({contagemCategoria(cat)})</option>)}
            </select>
          </label>
        </div>
      )}

      {/* 4) Barra de contagem em PEÇAS (unidades, não SKUs) — abaixo da categoria */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Contagem: {contadoPecas}/{esperadoPecas} peças</div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#F3F0E8" }}>
          <div className="h-full rounded-full transition-all"
            style={{
              width: esperadoPecas ? `${Math.min(100, Math.round((contadoPecas / esperadoPecas) * 100))}%` : "0%",
              background: contadoPecas >= esperadoPecas ? "#059669" : "#B45309",
            }} />
        </div>
      </div>

      {/* Valores (RESTRITO): só desenvolvedor + dono. `valores` é null para os
          demais (a API não envia) — dupla trava com podeVerValores. */}
      {podeVerValores && valores && <ValoresPanel valores={valores} />}

      {/* Placar das pendências: aberta / resolvida / não resolvida.
          CLICÁVEL: filtra a lista pelo tipo (clicar de novo limpa) — é o caminho
          para achar pendência de item que já voltou a ficar OK. */}
      {(pendAbertas + pendResolvidas + pendNaoResolvidas) > 0 && (
        <div className="mb-2 flex gap-2 flex-wrap text-xs">
          {pendAbertas > 0 && (
            <button className="px-2.5 py-1 rounded-full font-semibold"
              style={{ background: "#FEF3C7", color: "#92400E",
                border: `1px solid ${filtroPendencia === "aberta" ? "#92400E" : "#FCD34D"}`,
                boxShadow: filtroPendencia === "aberta" ? "0 0 0 1px #92400E" : "none" }}
              title={filtroPendencia === "aberta" ? "Limpar filtro" : "Mostrar só itens com pendência aguardando resposta"}
              onClick={() => setFiltroPendencia(p => p === "aberta" ? null : "aberta")}>
              {pendAbertas} pendência(s) aguardando resposta{filtroPendencia === "aberta" ? " ✕" : ""}
            </button>
          )}
          {pendResolvidas > 0 && (
            <button className="px-2.5 py-1 rounded-full font-semibold"
              style={{ background: "#D1FAE5", color: "#065F46",
                border: `1px solid ${filtroPendencia === "resolvida" ? "#065F46" : "#6EE7B7"}`,
                boxShadow: filtroPendencia === "resolvida" ? "0 0 0 1px #065F46" : "none" }}
              title={filtroPendencia === "resolvida" ? "Limpar filtro" : "Mostrar só itens com pendência resolvida"}
              onClick={() => setFiltroPendencia(p => p === "resolvida" ? null : "resolvida")}>
              {pendResolvidas} resolvida(s){filtroPendencia === "resolvida" ? " ✕" : ""}
            </button>
          )}
          {pendNaoResolvidas > 0 && (
            <button className="px-2.5 py-1 rounded-full font-semibold"
              style={{ background: "#FEE2E2", color: "#991B1B",
                border: `1px solid ${filtroPendencia === "nao_resolvida" ? "#991B1B" : "#FCA5A5"}`,
                boxShadow: filtroPendencia === "nao_resolvida" ? "0 0 0 1px #991B1B" : "none" }}
              title={filtroPendencia === "nao_resolvida" ? "Limpar filtro" : "Mostrar só itens com pendência não resolvida"}
              onClick={() => setFiltroPendencia(p => p === "nao_resolvida" ? null : "nao_resolvida")}>
              {pendNaoResolvidas} não resolvida(s){filtroPendencia === "nao_resolvida" ? " ✕" : ""}
            </button>
          )}
        </div>
      )}

      {/* Faixa do filtro ativo: sempre visível enquanto filtrando (mesmo que o
          contador do chip zere, o usuário nunca fica preso na lista filtrada) */}
      {filtroPendencia && (
        <div className="mb-4 text-xs flex items-center gap-2">
          <span className="text-gray-500">
            Mostrando só itens com pendência {filtroPendencia === "aberta" ? "aguardando resposta" : filtroPendencia === "resolvida" ? "resolvida" : "não resolvida"} ({itensFiltrados.length})
          </span>
          <button onClick={() => setFiltroPendencia(null)} className="underline hover:opacity-70" style={{ color: "#184036" }}>
            limpar filtro
          </button>
        </div>
      )}

      <div className="mb-4 flex justify-end">
        {buscaAtiva ? (
          <div className="flex items-center gap-2 flex-1 border rounded-xl px-3 py-2"
            style={{ borderColor: "#E8DCC8" }}>
            <Search size={15} className="text-gray-400" />
            <input autoFocus className="flex-1 outline-none text-sm bg-transparent"
              placeholder="Buscar SKU ou nome..."
              value={busca} onChange={e => setBusca(e.target.value)} />
            <button onClick={() => { setBusca(""); setBuscaAtiva(false); }}>
              <X size={15} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>
        ) : (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm hover:bg-gray-50"
            style={{ border: "1px solid #E8DCC8", color: "#6B7280" }}
            onClick={() => setBuscaAtiva(true)}>
            <Search size={14} /> Buscar SKU
          </button>
        )}
      </div>

      {/* Chips lidos pelo app que nao estao no escopo do inventario — respeita
          categoria/busca e SÓ aparece com filtro nulo, "Excesso" ou "Fora do invent." */}
      {mostraForaInventario && excedentesFiltrados.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#7C3AED" }}>
            Chips fora do inventario ({excedentesFiltrados.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {excedentesFiltrados.map(e => {
              const aberto = foraExpandido.has(e.id_api_produto);
              const temChips = (e.epcs?.length ?? 0) > 0;
              return (
              <div key={e.id_api_produto}>
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ background: "#F5F3FF", border: "1px solid #DDD6FE",
                    borderRadius: aberto ? "0.75rem 0.75rem 0 0" : "0.75rem",
                    cursor: temChips ? "pointer" : "default" }}
                  onClick={() => temChips && setForaExpandido(prev => {
                    const s = new Set(prev);
                    if (s.has(e.id_api_produto)) s.delete(e.id_api_produto); else s.add(e.id_api_produto);
                    return s;
                  })}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ fontFamily: "monospace", color: "#184036" }}>
                      {e.sku}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {e.nome_produto}{e.categoria_produto ? ` · ${e.categoria_produto}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold shrink-0" style={{ color: "#374151" }}>
                    {e.quantidade}/0
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "#EDE9FE", color: "#6D28D9", border: "1px solid #C4B5FD" }}>
                    Fora do inventário
                  </span>
                  {temChips && (aberto
                    ? <ChevronUp size={16} className="shrink-0 text-gray-400" />
                    : <ChevronDown size={16} className="shrink-0 text-gray-400" />)}
                </div>
                {aberto && temChips && (
                  <div className="px-4 py-2.5 rounded-b-xl"
                    style={{ background: "#FAF9FF", border: "1px solid #DDD6FE", borderTop: "none" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#6D28D9" }}>Peças e chips</p>
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E9E3FB" }}>
                      {e.epcs.map((epc, i) => (
                        <div key={epc} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px]"
                          style={{ borderTop: i === 0 ? "none" : "1px solid #E9E3FB" }}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#7C3AED" }} />
                          <span className="flex-1 min-w-0">peça {i + 1} · <span className="font-mono text-gray-500 break-all">chip {epc}</span></span>
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "#EDE9FE", color: "#6D28D9" }}>lida</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {excessos.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#2563EB" }}>Excedentes ({excessos.length})</p>
          <div className="flex flex-col gap-1.5">
            {excessosVis.map(item => renderRow(item, "excesso"))}
          </div>
          {excessos.length > excessosVis.length && (
            <button onClick={() => mostrarMais("excesso")}
              style={{ width: "100%", textAlign: "center", padding: "9px", border: "1px dashed #E8DCC8", borderRadius: "0.75rem", color: "#184036", fontSize: "13px", background: "#fff", marginTop: "6px" }}>
              Mostrar mais {Math.min(PAGINA, excessos.length - excessosVis.length)} de {excessos.length - excessosVis.length} restantes
            </button>
          )}
        </div>
      )}

      {faltandoL.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#DC2626" }}>
            Faltando ({faltandoL.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {faltandoVis.map(item => renderRow(item, "faltando"))}
          </div>
          {faltandoL.length > faltandoVis.length && (
            <button onClick={() => mostrarMais("faltando")}
              style={{ width: "100%", textAlign: "center", padding: "9px", border: "1px dashed #E8DCC8", borderRadius: "0.75rem", color: "#184036", fontSize: "13px", background: "#fff", marginTop: "6px" }}>
              Mostrar mais {Math.min(PAGINA, faltandoL.length - faltandoVis.length)} de {faltandoL.length - faltandoVis.length} restantes
            </button>
          )}
        </div>
      )}

      {pendentesL.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold mb-2" style={{ color: "#6B7280" }}>
            Sem contagem ({pendentesL.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {pendentesVis.map(item => renderRow(item, "pendente"))}
          </div>
          {pendentesL.length > pendentesVis.length && (
            <button onClick={() => mostrarMais("pendente")}
              style={{ width: "100%", textAlign: "center", padding: "9px", border: "1px dashed #E8DCC8", borderRadius: "0.75rem", color: "#184036", fontSize: "13px", background: "#fff", marginTop: "6px" }}>
              Mostrar mais {Math.min(PAGINA, pendentesL.length - pendentesVis.length)} de {pendentesL.length - pendentesVis.length} restantes
            </button>
          )}
        </div>
      )}

      {/* "Conferidos OK" recolhido por padrão — normalmente é a maioria dos
          itens; abrir só quando precisar conferir algo específico */}
      {okL.length > 0 && (
        <div className="mb-4">
          <button onClick={() => setOkAberto(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#065F46" }}>
            <span>✓ Conferidos OK ({okL.length})</span>
            <span className="text-xs font-normal" style={{ color: "#6B7280" }}>{okAberto ? "▲ ocultar" : "▼ mostrar"}</span>
          </button>
          {okAberto && (
            <div className="flex flex-col gap-1.5 mt-2">
              {okVis.map(item => renderRow(item, "ok"))}
              {okL.length > okVis.length && (
                <button onClick={() => mostrarMais("ok")}
                  style={{ width: "100%", textAlign: "center", padding: "9px", border: "1px dashed #E8DCC8", borderRadius: "0.75rem", color: "#184036", fontSize: "13px", background: "#fff" }}>
                  Mostrar mais {Math.min(PAGINA, okL.length - okVis.length)} de {okL.length - okVis.length} restantes
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Diagnóstico: etiquetas lidas via app (fora do caminho principal —
          os chips por peça já aparecem no drill-down de cada item) */}
      {leituras.length > 0 && (
        <div className="mt-6 border-t pt-4" style={{ borderColor: "#F3F0E8" }}>
          <button className="flex items-center justify-between w-full text-sm font-semibold py-1"
            style={{ color: "#184036" }}
            onClick={() => setLeiturasAbertas(v => !v)}>
            <span>Diagnóstico — etiquetas lidas via app ({totalLeituras}{totalLeituras > 200 ? " — exibindo 200 mais recentes" : ""})</span>
            <span className="text-gray-400 text-xs">{leiturasAbertas ? "▲ ocultar" : "▼ mostrar"}</span>
          </button>
          {leiturasAbertas && (
            <div className="rounded-2xl overflow-hidden mt-2" style={{ border: "1px solid #E8DCC8" }}>
              <table className="w-full text-xs">
                <thead style={{ background: "#F9F6F0" }}>
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold uppercase text-gray-400">EPC</th>
                    <th className="text-left px-4 py-2 font-semibold uppercase text-gray-400">Lido em</th>
                  </tr>
                </thead>
                <tbody>
                  {leituras.slice(0, 200).map((l, i) => (
                    <tr key={i} style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F6" }}>
                      <td className="px-4 py-2 font-mono" style={{ color: "#184036" }}>{l.epc}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDate(l.lido_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de cancelamento — motivo obrigatório, fica gravado quem cancelou */}
      {cancelModalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => !cancelando && setCancelModalAberto(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1" style={{ fontFamily: "Georgia, serif", color: "#991B1B" }}>
              {isOperador ? "Solicitar cancelamento" : "Cancelar inventário"} #{inventario.id}
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              {isOperador
                ? "O pedido de cancelamento vai para a aprovação do administrador. Só depois que ele aprovar a contagem será descartada. Informe o motivo:"
                : "A contagem será descartada e nenhum ajuste será gerado. O motivo e o autor do cancelamento ficam registrados."}
            </p>
            <textarea autoFocus rows={3} value={motivoCancelamento}
              onChange={e => setMotivoCancelamento(e.target.value)}
              className="w-full text-sm border rounded-xl px-3 py-2 outline-none resize-y mb-3"
              style={{ borderColor: "#E8DCC8" }}
              placeholder="Motivo do cancelamento (obrigatório)..." />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-xl text-sm hover:bg-gray-50"
                style={{ border: "1px solid #E8DCC8", color: "#6B7280" }}
                disabled={cancelando}
                onClick={() => setCancelModalAberto(false)}>
                Voltar
              </button>
              <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: "#DC2626", color: "#fff" }}
                disabled={cancelando || motivoCancelamento.trim().length < 5}
                onClick={confirmarCancelamento}>
                {cancelando ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={14} />}
                {isOperador ? "Enviar pedido" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
