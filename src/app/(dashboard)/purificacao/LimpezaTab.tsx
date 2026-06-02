"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Loader2, CheckCircle, AlertTriangle,
  Camera, RotateCcw, TrendingDown, Clock, Circle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, STATUS_COLORS } from "@/lib/cofre-ouro-status";

/**
 * REGRA DE NEGÓCIO: aba Limpeza dentro de Purificação para tratar metal sujo
 * vindo da sangria (cofre_ouro_baixas com status "recebido").
 *
 * O QUE: exibe baixas recebidas, permite iniciar e concluir limpeza com
 *   foto e peso de saída. Ao concluir, transita para aguardando_aprovacao.
 * POR QUE: separa o processo metalúrgico do fluxo logístico/financeiro.
 * IMPACTO SE REMOVIDO: metal sujo não tem caminho para entrar no estoque.
 */

const P = {
  bg: "#f9fafb", card: "#ffffff", border: "#e5e7eb",
  text: "#111827", muted: "#6b7280", amber: "#d97706",
  verde: "#16a34a", vermelho: "#dc2626", azul: "#2563eb",
};

interface BaixaLimpeza {
  id: number;
  gramas: number;
  destino: string;
  status: string;
  protocolo_id: number | null;
  realizado_nome: string | null;
  recebedor_nome: string | null;
  foto_comprovacao: string | null;
  obs: string | null;
  created_at: string;
  limpeza_peso_limpo?: number | null;
  limpeza_houve_pedras?: boolean | null;
  limpeza_peso_pedras?: number | null;
  limpeza_foto_antes_path?: string | null;
  limpeza_foto_depois_path?: string | null;
  limpeza_foto_peso_pedras_path?: string | null;
}

interface Props {
  userRole: string | null;
  userId: string | null;
}

function formatPeso(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return isNaN(v) ? "—" : v.toFixed(2) + "g";
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

/**
 * REGRA DE NEGÓCIO: peso de saída da limpeza fica registrado no texto de obs
 * até existir coluna dedicada no banco.
 *
 * O QUE: extrai "Peso limpo" da observação para exibir entrada x saída.
 * POR QUE: operação precisa comparar rapidamente o que entrou e o que saiu.
 * IMPACTO SE REMOVIDO: UI mostra só peso sujo e perde rastreabilidade visual.
 */
function extrairPesoSaida(obs: string | null | undefined): number | null {
  const txt = String(obs ?? "");

  // Formato legado JSON em algumas baixas antigas
  try {
    const parsed = JSON.parse(txt) as Record<string, unknown>;
    const legado = Number(parsed.peso_limpo ?? 0);
    if (Number.isFinite(legado) && legado > 0) return legado;
  } catch {
    // segue para parsing textual
  }

  // Novo formato textual: "Peso limpo: 8.050g" (ou com vírgula)
  const matches = Array.from(txt.matchAll(/Peso limpo:\s*([0-9]+(?:[\.,][0-9]+)?)g/gi));
  if (matches.length === 0) return null;

  /**
   * REGRA DE NEGÓCIO: em caso de múltiplas limpezas (ex.: reprovação e nova
   * submissão), vale o ÚLTIMO "Peso limpo" registrado no histórico textual.
   */
  const ultimo = matches[matches.length - 1]?.[1] ?? "";
  const valor = Number(String(ultimo).replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

export default function LimpezaTab({ userRole, userId }: Props) {
  const router = useRouter();
  const [recebidas, setRecebidas] = useState<BaixaLimpeza[]>([]);
  const [emLimpeza, setEmLimpeza] = useState<BaixaLimpeza[]>([]);
  const [aguardando, setAguardando] = useState<BaixaLimpeza[]>([]);
  const [concluidos, setConcluidos] = useState<BaixaLimpeza[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalIniciar, setModalIniciar] = useState<BaixaLimpeza | null>(null);
  const [fotoEntrada, setFotoEntrada] = useState<File | null>(null);
  const [fotoEntradaPreview, setFotoEntradaPreview] = useState<string | null>(null);
  const [modalConcluir, setModalConcluir] = useState<BaixaLimpeza | null>(null);
  const [fotoSaida, setFotoSaida] = useState<File | null>(null);
  const [fotoSaidaPreview, setFotoSaidaPreview] = useState<string | null>(null);
  const [houvePedras, setHouvePedras] = useState(false);
  const [pesoPedras, setPesoPedras] = useState("");
  const [fotoPedras, setFotoPedras] = useState<File | null>(null);
  const [fotoPedrasPreview, setFotoPedrasPreview] = useState<string | null>(null);
  const [pesoSaida, setPesoSaida] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pesoSaidaByBaixa, setPesoSaidaByBaixa] = useState<Record<number, number>>({});

  /**
   * REGRA DE NEGÓCIO: o peso de saída oficial deve vir dos rastreios da limpeza
   * (eventos limpeza_concluida/limpeza_aprovada), não apenas do campo obs.
   *
   * O QUE: carrega o último peso de saída por baixa a partir da timeline.
   * POR QUE: evita divergência visual quando obs está incompleta/fora de padrão.
   * IMPACTO SE REMOVIDO: card pode mostrar saída igual à entrada (ex.: 8,11)
   * quando o valor correto de saída foi 8,05.
   */
  async function carregarPesosSaida(baixas: BaixaLimpeza[]) {
    if (baixas.length === 0) {
      setPesoSaidaByBaixa({});
      return;
    }

    const resultados = await Promise.all(
      baixas.map(async (b) => {
        try {
          const res = await fetch(`/api/financeiro/cofre-ouro/rastreios?baixa_id=${b.id}`);
          const rows = await res.json().catch(() => []);
          if (!res.ok || !Array.isArray(rows)) return [b.id, null] as const;

          const eventos = rows.filter((r: any) =>
            ["limpeza_aprovada", "limpeza_concluida"].includes(String(r?.evento ?? ""))
          );
          if (eventos.length === 0) return [b.id, null] as const;

          const ultimo = eventos[eventos.length - 1];
          const peso = Number(ultimo?.gramas);
          return [b.id, Number.isFinite(peso) && peso > 0 ? peso : null] as const;
        } catch {
          return [b.id, null] as const;
        }
      })
    );

    const mapa: Record<number, number> = {};
    for (const [id, peso] of resultados) {
      if (peso != null) mapa[id] = peso;
    }
    setPesoSaidaByBaixa(mapa);
  }

  async function carregar() {
    setLoading(true);
    try {
      const [recebidasRes, emLimpezaRes, aguardandoRes, concluidosRes] = await Promise.all([
        fetch("/api/purificacao/limpeza?status=recebido").then(r => r.ok ? r.json() : []),
        fetch("/api/purificacao/limpeza?status=em_limpeza").then(r => r.ok ? r.json() : []),
        fetch("/api/purificacao/limpeza?status=aguardando_aprovacao").then(r => r.ok ? r.json() : []),
        fetch("/api/purificacao/limpeza?status=concluido").then(r => r.ok ? r.json() : []),
      ]);
      /**
       * REGRA DE NEGÓCIO: baixas destino "alisson" não passam pelo processo de
       * limpeza, pois são concluídas direto no fluxo de cofre.
       *
       * O QUE: remove destino alisson da aba Limpeza em todas as colunas.
       * POR QUE: evita misturar baixa direta com fluxo metalúrgico.
       * IMPACTO SE REMOVIDO: aparecem cards sem ação de limpeza, gerando ruído.
       */
      const semAlisson = (list: BaixaLimpeza[]) => list.filter((b) => String(b.destino) !== "alisson");

      const recebidasFiltradas = Array.isArray(recebidasRes) ? semAlisson(recebidasRes as BaixaLimpeza[]) : [];
      const emLimpezaFiltradas = Array.isArray(emLimpezaRes) ? semAlisson(emLimpezaRes as BaixaLimpeza[]) : [];
      const aguardandoFiltradas = Array.isArray(aguardandoRes) ? semAlisson(aguardandoRes as BaixaLimpeza[]) : [];
      const concluidosFiltrados = Array.isArray(concluidosRes) ? semAlisson(concluidosRes as BaixaLimpeza[]) : [];

      setRecebidas(recebidasFiltradas);
      setEmLimpeza(emLimpezaFiltradas);
      setAguardando(aguardandoFiltradas);
      setConcluidos(concluidosFiltrados);
      await carregarPesosSaida([...aguardandoFiltradas, ...concluidosFiltrados]);
    } catch { }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  /**
   * REGRA DE NEGÓCIO: iniciar limpeza transita recebido → em_limpeza.
   * O peso sujo (gramas da baixa) é preservado automaticamente.
   */
  async function iniciarLimpeza() {
    if (!modalIniciar) return;
    if (!fotoEntrada) { setErro("Foto do metal antes da limpeza é obrigatória."); return; }

    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const fotoPath = `limpeza/${modalIniciar.id}/antes-${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("purificacao-fotos")
        .upload(fotoPath, fotoEntrada, { contentType: fotoEntrada.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      const res = await fetch("/api/purificacao/limpeza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "iniciar", baixa_id: modalIniciar.id, foto_entrada: fotoPath }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? "Erro ao iniciar limpeza");
        return;
      }
      setModalIniciar(null);
      setFotoEntrada(null);
      setFotoEntradaPreview(null);
      carregar();
      router.refresh();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro de rede"); }
    finally { setSalvando(false); }
  }

  /**
   * REGRA DE NEGÓCIO: concluir limpeza exige foto + peso de saída.
   * Transita em_limpeza → aguardando_aprovacao. Gera tarefa de aprovação.
   */
  async function concluirLimpeza() {
    if (!modalConcluir) return;
    if (!fotoSaida) { setErro("Foto da limpeza é obrigatória."); return; }
    const peso = parseFloat(pesoSaida.replace(",", "."));
    if (!peso || peso <= 0) { setErro("Informe o peso de saída."); return; }
    if (peso > Number(modalConcluir.gramas)) { setErro("Peso de saída não pode ser maior que o peso sujo."); return; }
    const pedras = parseFloat(pesoPedras.replace(",", "."));
    if (houvePedras && (!pedras || pedras <= 0)) { setErro("Informe o peso das pedras removidas."); return; }
    if (houvePedras && !fotoPedras) { setErro("Foto do peso das pedras é obrigatória."); return; }

    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const fotoPath = `limpeza/${modalConcluir.id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("purificacao-fotos")
        .upload(fotoPath, fotoSaida, { contentType: fotoSaida.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      let fotoPedrasPath: string | undefined;
      if (houvePedras && fotoPedras) {
        fotoPedrasPath = `limpeza/${modalConcluir.id}/pedras-${Date.now()}.jpg`;
        const { error: uploadPedrasErr } = await supabase.storage
          .from("purificacao-fotos")
          .upload(fotoPedrasPath, fotoPedras, { contentType: fotoPedras.type || "image/jpeg", upsert: false });
        if (uploadPedrasErr) throw new Error(uploadPedrasErr.message);
      }

      const res = await fetch("/api/purificacao/limpeza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "concluir",
          baixa_id: modalConcluir.id,
          peso_saida: peso,
          foto_saida: fotoPath,
          houve_pedras: houvePedras,
          peso_pedras: houvePedras ? pedras : undefined,
          foto_peso_pedras: fotoPedrasPath,
          obs: obs || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? "Erro ao concluir limpeza");
        setSalvando(false);
        return;
      }
      setModalConcluir(null);
      setFotoSaida(null);
      setFotoSaidaPreview(null);
      setHouvePedras(false);
      setPesoPedras("");
      setFotoPedras(null);
      setFotoPedrasPreview(null);
      setPesoSaida("");
      setObs("");
      carregar();
      router.refresh();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro de rede"); }
    setSalvando(false);
  }

  const podeLimpar = ["admin", "desenvolvedor", "gerente_fabrica"].includes(userRole ?? "");

  const destinos: Record<string, string> = { alisson: "Alisson", fabrica: "Fábrica", service: "Service" };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: P.muted }} />
      </div>
    );
  }

  return (
    <div>
      {erro && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, marginBottom: 16, backgroundColor: "#FEF2F2", color: P.vermelho, fontSize: 13 }}>
          <AlertTriangle size={14} /> {erro}
          <button onClick={() => setErro(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: P.muted }}>✕</button>
        </div>
      )}

      {/**
       * REGRA DE NEGÓCIO: a operação da limpeza precisa visualização estilo kanban
       * horizontal (colunas lado a lado) para leitura rápida do gargalo por etapa.
       *
       * O QUE: renderiza as 4 etapas em grade horizontal com scroll no mobile.
       * POR QUE: facilita gestão de fluxo (aguardando -> limpeza -> aprovação -> concluído).
       * IMPACTO SE REMOVIDO: o fluxo volta a ficar vertical e dificulta priorização operacional.
       */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(260px, 1fr))", gap: 16, overflowX: "auto", alignItems: "start", paddingBottom: 8 }}>
        {/* ─── Aguardando Limpeza ──────────────────────────────────────────────── */}
        <Section title="Aguardando Limpeza" count={recebidas.length} color={P.verde}>
          {recebidas.length === 0 ? (
            <p style={{ color: P.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Nenhum metal aguardando limpeza.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {recebidas.map(b => {
                const st = STATUS_COLORS[b.status] ?? { bg: "#FEF3C7", text: "#92400E" };
                return (
                  <div key={b.id} style={{ backgroundColor: P.card, borderRadius: 12, border: `1px solid ${P.border}`, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ fontWeight: 700, color: P.text, margin: 0 }}>Baixa Ouro #{b.id}</p>
                        <p style={{ fontSize: 12, color: P.muted, margin: "4px 0 0" }}>
                          {destinos[b.destino] ?? b.destino} · Recebido por {b.recebedor_nome ?? "—"}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, backgroundColor: st.bg, color: st.text }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 24, fontWeight: 700, color: P.verde, margin: "0 0 4px" }}>{formatPeso(Number(b.gramas))}</p>
                    <p style={{ fontSize: 11, color: P.muted, margin: "0 0 12px" }}>Peso sujo</p>
                    <button
                      onClick={() => setModalIniciar(b)}
                      disabled={!podeLimpar}
                      style={{
                        width: "100%", padding: "10px 0", borderRadius: 8,
                        backgroundColor: P.amber, color: "#fff", border: "none",
                        fontWeight: 600, fontSize: 13, cursor: podeLimpar ? "pointer" : "not-allowed",
                        opacity: podeLimpar ? 1 : 0.5,
                      }}
                    >
                      <Sparkles size={14} style={{ marginRight: 6 }} />
                      Iniciar Limpeza
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ─── Em Limpeza ──────────────────────────────────────────────────────── */}
        <Section title="Em Limpeza" count={emLimpeza.length} color={P.amber}>
          {emLimpeza.length === 0 ? (
            <p style={{ color: P.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Nenhum metal em limpeza no momento.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {emLimpeza.map(b => {
                const st = STATUS_COLORS[b.status] ?? { bg: "#FEF3C7", text: "#92400E" };
                return (
                  <div key={b.id} style={{ backgroundColor: P.card, borderRadius: 12, border: `1px solid ${P.border}`, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <p style={{ fontWeight: 700, color: P.text, margin: 0 }}>Baixa Ouro #{b.id}</p>
                        <p style={{ fontSize: 12, color: P.muted, margin: "4px 0 0" }}>
                          {destinos[b.destino] ?? b.destino} · {formatDate(b.created_at)}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, backgroundColor: st.bg, color: st.text }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 24, fontWeight: 700, color: P.amber, margin: "0 0 4px" }}>{formatPeso(Number(b.gramas))}</p>
                    <p style={{ fontSize: 11, color: P.muted, margin: "0 0 12px" }}>Peso sujo de entrada</p>
                    <button
                      onClick={() => setModalConcluir(b)}
                      disabled={!podeLimpar}
                      style={{
                        width: "100%", padding: "10px 0", borderRadius: 8,
                        backgroundColor: P.azul, color: "#fff", border: "none",
                        fontWeight: 600, fontSize: 13, cursor: podeLimpar ? "pointer" : "not-allowed",
                        opacity: podeLimpar ? 1 : 0.5,
                      }}
                    >
                      <Sparkles size={14} style={{ marginRight: 6 }} />
                      Finalizar Limpeza
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ─── Aguardando Aprovação ──────────────────────────────────────────── */}
        <Section title="Aguardando Aprovação" count={aguardando.length} color="#7C3AED">
          {aguardando.length === 0 ? (
            <p style={{ color: P.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Nenhum metal aguardando aprovação.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {aguardando.map(b => {
                const st = STATUS_COLORS[b.status] ?? { bg: "#FEF3C7", text: "#92400E" };
                return (
                  <div key={b.id} style={{ backgroundColor: P.card, borderRadius: 12, border: `1px solid #7C3AED`, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <p style={{ fontWeight: 700, color: P.text, margin: 0 }}>Baixa Ouro #{b.id}</p>
                        <p style={{ fontSize: 12, color: P.muted, margin: "4px 0 0" }}>
                          {destinos[b.destino] ?? b.destino} · {formatDate(b.created_at)}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, backgroundColor: st.bg, color: st.text }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "#7C3AED", margin: "0 0 4px" }}>{formatPeso(Number(b.gramas))}</p>
                    <p style={{ fontSize: 11, color: P.muted, margin: "0 0 2px" }}>Entrada (sujo): {formatPeso(Number(b.gramas))}</p>
                    <p style={{ fontSize: 11, color: P.muted, margin: "0 0 14px" }}>
                      Saída (limpo): {formatPeso(Number(b.limpeza_peso_limpo ?? pesoSaidaByBaixa[b.id] ?? extrairPesoSaida(b.obs) ?? Number(b.gramas)))}
                    </p>

                    {/**
                     * REGRA DE NEGÓCIO: aprovação/reprovação da limpeza acontece
                     * exclusivamente via módulo de Tarefas, nunca pela aba Limpeza.
                     *
                     * O QUE: substitui ações diretas por CTA de navegação.
                     * POR QUE: centraliza decisão no workflow de aprovação com
                     * rastreabilidade única (tarefa + aprovação vinculada).
                     * IMPACTO SE REMOVIDO: volta a existir aprovação paralela fora
                     * da tarefa, quebrando a governança definida.
                     */}
                    <button
                      onClick={() => router.push(`/tarefas?busca=limpeza_ouro:${b.id}`)}
                      style={{
                        width: "100%",
                        padding: "10px 0",
                        borderRadius: 8,
                        backgroundColor: "#F3F4F6",
                        color: "#374151",
                        border: `1px solid ${P.border}`,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Abrir tarefa de aprovação
                    </button>
                </div>
              );
            })}
            </div>
          )}
        </Section>

        {/* ─── Concluídos ─────────────────────────────────────────────────────── */}
        <Section title="Concluídos" count={concluidos.length} color={P.verde}>
          {concluidos.length === 0 ? (
            <p style={{ color: P.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Nenhum metal concluído ainda.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {concluidos.map(b => {
                const st = STATUS_COLORS[b.status] ?? { bg: "#D1FAE5", text: "#065F46" };
                return (
                  <div key={b.id} style={{ backgroundColor: P.card, borderRadius: 12, border: `1px solid ${P.border}`, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <p style={{ fontWeight: 700, color: P.text, margin: 0 }}>Baixa Ouro #{b.id}</p>
                        <p style={{ fontSize: 12, color: P.muted, margin: "4px 0 0" }}>
                          {destinos[b.destino] ?? b.destino} · {formatDate(b.created_at)}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, backgroundColor: st.bg, color: st.text }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 700, color: P.verde, margin: "0 0 4px" }}>{formatPeso(Number(b.gramas))}</p>
                    <p style={{ fontSize: 11, color: P.muted, margin: "0 0 2px" }}>Entrada (sujo): {formatPeso(Number(b.gramas))}</p>
                    <p style={{ fontSize: 11, color: P.muted, margin: 0 }}>
                      Saída (limpo): {formatPeso(Number(b.limpeza_peso_limpo ?? pesoSaidaByBaixa[b.id] ?? extrairPesoSaida(b.obs) ?? Number(b.gramas)))}
                    </p>
                </div>
              );
            })}
            </div>
          )}
        </Section>
      </div>

      {/* ─── Modal Iniciar Limpeza ──────────────────────────────────────────── */}
      {modalIniciar && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 }}
          onClick={() => !salvando && setModalIniciar(null)}>
          <div style={{ backgroundColor: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 18, color: P.text, margin: "0 0 4px" }}>
              Iniciar Limpeza — Baixa #{modalIniciar.id}
            </h3>
            <p style={{ fontSize: 13, color: P.muted, margin: "0 0 20px" }}>
              Peso sujo: {formatPeso(Number(modalIniciar.gramas))}
            </p>

            {/**
             * REGRA DE NEGÓCIO: a limpeza v2 só inicia com foto do metal antes
             * do processo.
             * O QUE: captura a evidência inicial enviada para a API.
             * POR QUE: o aprovador precisa comparar antes/depois para validar a
             * quebra e eventuais pedras removidas.
             * IMPACTO SE REMOVIDO: a aprovação fica sem prova visual de entrada.
             */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 6 }}>
                Foto antes da limpeza <span style={{ color: P.vermelho }}>*</span>
              </p>
              {fotoEntradaPreview ? (
                <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoEntradaPreview} alt="Foto antes" style={{ width: "100%", maxHeight: 180, objectFit: "cover" }} />
                  <button onClick={() => { setFotoEntrada(null); setFotoEntradaPreview(null); }}
                    style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer" }}>
                    <RotateCcw size={13} color="white" />
                  </button>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 120, borderRadius: 12, border: `2px dashed ${P.border}`, backgroundColor: P.bg, cursor: "pointer" }}>
                  <Camera size={20} style={{ color: P.muted }} />
                  <span style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>Tirar foto antes da limpeza</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setFotoEntrada(file); setFotoEntradaPreview(URL.createObjectURL(file)); }
                    }} />
                </label>
              )}
            </div>

            {erro && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, marginBottom: 12, backgroundColor: "#FEF2F2", color: P.vermelho, fontSize: 12 }}>
                <AlertTriangle size={12} /> {erro}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setModalIniciar(null); setErro(null); }} disabled={salvando}
                style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${P.border}`, backgroundColor: "#fff", color: P.muted, fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={iniciarLimpeza} disabled={salvando || !fotoEntrada}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 8, border: "none", backgroundColor: P.amber, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: salvando ? 0.5 : 1 }}>
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Iniciar Limpeza
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Concluir Limpeza ──────────────────────────────────────────── */}
      {modalConcluir && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 }}
          onClick={() => !salvando && setModalConcluir(null)}>
          <div style={{ backgroundColor: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, fontSize: 18, color: P.text, margin: "0 0 4px" }}>
              Finalizar Limpeza — Baixa #{modalConcluir.id}
            </h3>
            <p style={{ fontSize: 13, color: P.muted, margin: "0 0 20px" }}>
              Destino: {destinos[modalConcluir.destino] ?? modalConcluir.destino} · Peso sujo: {formatPeso(Number(modalConcluir.gramas))}
            </p>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 6 }}>
                Peso de saída (limpo) <span style={{ color: P.vermelho }}>*</span>
              </p>
              <input
                type="text" inputMode="decimal"
                value={pesoSaida}
                onChange={e => setPesoSaida(e.target.value)}
                placeholder="Ex: 15.32"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  border: `1px solid ${P.border}`, fontSize: 14, boxSizing: "border-box",
                }}
              />
              {pesoSaida && !isNaN(parseFloat(pesoSaida.replace(",", "."))) && (
                <p style={{ fontSize: 11, color: P.muted, marginTop: 4 }}>
                  Perda estimada: {formatPeso(Number(modalConcluir.gramas) - parseFloat(pesoSaida.replace(",", ".")))} ({((Number(modalConcluir.gramas) - parseFloat(pesoSaida.replace(",", "."))) / Number(modalConcluir.gramas) * 100).toFixed(1)}%)
                </p>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 6 }}>
                Foto depois da limpeza <span style={{ color: P.vermelho }}>*</span>
              </p>
              {fotoSaidaPreview ? (
                <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoSaidaPreview} alt="Foto" style={{ width: "100%", maxHeight: 160, objectFit: "cover" }} />
                  <button
                    onClick={() => { setFotoSaida(null); setFotoSaidaPreview(null); }}
                    style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer" }}
                  >
                    <RotateCcw size={13} color="white" />
                  </button>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 100, borderRadius: 12, border: `2px dashed ${P.border}`, backgroundColor: P.bg, cursor: "pointer" }}>
                  <Camera size={20} style={{ color: P.muted }} />
                  <span style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>Tirar foto ou selecionar</span>
                  <input
                    type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setFotoSaida(file); setFotoSaidaPreview(URL.createObjectURL(file)); }
                    }}
                  />
                </label>
              )}
            </div>

            {/**
             * REGRA DE NEGÓCIO: pedras removidas na limpeza precisam ser
             * evidenciadas com peso e foto da balança.
             * O QUE: quando o operador marca que houve pedras, campos de peso e
             * foto ficam obrigatórios antes de concluir.
             * POR QUE: pedras explicam parte da diferença entre peso sujo e peso
             * limpo, mas não entram como ouro no estoque.
             * IMPACTO SE REMOVIDO: a quebra pode parecer perda de metal sem
             * evidência do material removido.
             */}
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, border: `1px solid ${P.border}`, backgroundColor: P.bg }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: P.text, cursor: "pointer" }}>
                <input type="checkbox" checked={houvePedras} onChange={e => setHouvePedras(e.target.checked)} />
                Houve pedras removidas
              </label>

              {houvePedras && (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 6 }}>
                      Peso das pedras <span style={{ color: P.vermelho }}>*</span>
                    </p>
                    <input type="text" inputMode="decimal" value={pesoPedras} onChange={e => setPesoPedras(e.target.value)} placeholder="Ex: 0.18"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${P.border}`, fontSize: 14, boxSizing: "border-box" }} />
                  </div>

                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 6 }}>
                      Foto do peso das pedras <span style={{ color: P.vermelho }}>*</span>
                    </p>
                    {fotoPedrasPreview ? (
                      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoPedrasPreview} alt="Foto peso pedras" style={{ width: "100%", maxHeight: 140, objectFit: "cover" }} />
                        <button onClick={() => { setFotoPedras(null); setFotoPedrasPreview(null); }}
                          style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer" }}>
                          <RotateCcw size={13} color="white" />
                        </button>
                      </div>
                    ) : (
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 90, borderRadius: 12, border: `2px dashed ${P.border}`, backgroundColor: "#fff", cursor: "pointer" }}>
                        <Camera size={18} style={{ color: P.muted }} />
                        <span style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>Foto da balança com pedras</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) { setFotoPedras(file); setFotoPedrasPreview(URL.createObjectURL(file)); }
                          }} />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: P.text, marginBottom: 6 }}>Observação</p>
              <input
                type="text" value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="Ex: pedras removidas, impurezas"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${P.border}`, fontSize: 14, boxSizing: "border-box" }}
              />
            </div>

            {erro && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, marginBottom: 12, backgroundColor: "#FEF2F2", color: P.vermelho, fontSize: 12 }}>
                <AlertTriangle size={12} /> {erro}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setModalConcluir(null); setErro(null); }}
                disabled={salvando}
                style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${P.border}`, backgroundColor: "#fff", color: P.muted, fontSize: 13, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={concluirLimpeza}
                disabled={salvando || !fotoSaida || !pesoSaida || (houvePedras && (!pesoPedras || !fotoPedras))}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 8, border: "none", backgroundColor: P.azul, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: salvando ? 0.5 : 1 }}
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Concluir Limpeza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0, backgroundColor: "#fff", border: `1px solid ${P.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 4, height: 24, borderRadius: 4, backgroundColor: color }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, fontWeight: 600, color: P.muted, backgroundColor: P.border, padding: "2px 10px", borderRadius: 20 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}
