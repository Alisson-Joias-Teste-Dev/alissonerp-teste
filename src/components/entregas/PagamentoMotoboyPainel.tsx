"use client";

/**
 * PagamentoMotoboyPainel — painel de pagamento em lote de entregas de um motoboy.
 *
 * REGRA DE NEGÓCIO: admin/gerente seleciona entregas confirmadas ainda não
 * pagas de um motoboy e confirma o pagamento em lote. Cada entrega só pode
 * ser paga 1x (garantido pela UNIQUE no banco).
 *
 * O QUE: extraído de PagarMotoboyModal.tsx na reforma da tela Entregas
 * (21/07 — 3 abas, mockup aprovado pelo Jonathan) para ser reusado em DOIS
 * lugares SEM DUPLICAR a lógica (pedido explícito: "quero tudo
 * componentizado evitando duplicações"):
 *   1. Dentro do modal `PagarMotoboyModal.tsx` (acessado pelo botão "Pagar"
 *      do drawer de Motoboys) — comportamento 100% preservado, o modal virou
 *      só a "moldura" (overlay + header + X) em volta deste painel.
 *   2. Direto, inline, na aba "Pagamento do motoboy" da tela de Entregas
 *      (EntregasVendaClient.tsx) — sem moldura de modal, ocupando o espaço
 *      da aba.
 * Nenhuma chamada de API, validação ou estado foi reescrito — é o MESMO
 * código que já existia dentro do modal, só movido para fora da moldura.
 *
 * IMPACTO SE ALTERADO: sem validação de unicidade, pagamento duplicado. Como
 * os dois pontos de entrada (modal e aba) reusam este componente, uma
 * correção aqui vale para os dois automaticamente — e um bug aqui também.
 */

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

const C = {
  esmeralda: "#184036", esmeraldaLt: "#18403612",
  creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7",
  vermelho: "#DC2626", vermelhoLt: "#FEE2E2",
  verde: "#059669", verdeLt: "#D1FAE5",
  cinza: "#6B7280",
};

interface MotoboyOption {
  id: number;
  user_id: string;
  nome: string;
  ativo: boolean;
}

interface EntregaNaoPaga {
  id: number;
  codigo_entrega: string;
  numero_venda: string | null;
  cliente_nome: string | null;
  frete_motoboy: number;
  data_entrega_realizada: string | null;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

/**
 * REGRA DE NEGÓCIO: aceita `ativo` opcional para que o componente seja
 * autocontido tanto como aba (sempre "ativo") quanto dentro do modal, que
 * só carrega/reseta quando `isOpen`. Default `true` cobre o uso como aba.
 */
interface PagamentoMotoboyPainelProps {
  ativo?: boolean;
}

export default function PagamentoMotoboyPainel({ ativo = true }: PagamentoMotoboyPainelProps) {
  const [motoboys, setMotoboys] = useState<MotoboyOption[]>([]);
  const [motoboyId, setMotoboyId] = useState("");
  const [entregas, setEntregas] = useState<EntregaNaoPaga[]>([]);
  const [loadingMotoboys, setLoadingMotoboys] = useState(false);
  const [loadingEntregas, setLoadingEntregas] = useState(false);
  const [erro, setErro] = useState("");

  // Checkbox: entrega_id → true
  const [selecionadas, setSelecionadas] = useState<Record<number, boolean>>({});

  const [submetendo, setSubmetendo] = useState(false);
  const [sucesso, setSucesso] = useState("");

  // Data de vencimento para conta a pagar (padrão: hoje + 7 dias)
  const hoje = new Date();
  hoje.setDate(hoje.getDate() + 7);
  const [dataVencimento, setDataVencimento] = useState(hoje.toISOString().slice(0, 10));

  // Carregar motoboys quando o painel fica ativo (aba selecionada ou modal aberto)
  const carregarMotoboys = useCallback(async () => {
    setLoadingMotoboys(true);
    try {
      const data = await apiFetch<MotoboyOption[]>("/api/entregas-venda/motoboys?todos=true");
      setMotoboys(data.filter((m) => m.ativo));
    } catch {
      // ignora
    } finally {
      setLoadingMotoboys(false);
    }
  }, []);

  useEffect(() => {
    if (ativo) {
      carregarMotoboys();
      setSucesso("");
      setErro("");
    }
  }, [ativo, carregarMotoboys]);

  // Carregar entregas não pagas do motoboy selecionado
  const carregarEntregas = useCallback(async () => {
    if (!motoboyId) return;
    setLoadingEntregas(true);
    setErro("");
    try {
      const data = await apiFetch<{ items: Array<{ id: number; codigo_entrega: string; numero_venda: string | null; cliente_nome: string | null; frete_motoboy: number; data_entrega_realizada: string | null; foi_pago: boolean }> }>(
        `/api/entregas-venda/motoboy/minhas?motoboy_id=${motoboyId}`,
      );
      // Filtra só confirmadas não pagas
      setEntregas(data.items.filter((e) => !e.foi_pago).map((e) => ({
        id: e.id,
        codigo_entrega: e.codigo_entrega,
        numero_venda: e.numero_venda,
        cliente_nome: e.cliente_nome,
        frete_motoboy: e.frete_motoboy,
        data_entrega_realizada: e.data_entrega_realizada,
      })));
      setSelecionadas({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar entregas");
    } finally {
      setLoadingEntregas(false);
    }
  }, [motoboyId]);

  useEffect(() => {
    if (motoboyId) carregarEntregas();
  }, [motoboyId, carregarEntregas]);

  function toggleSelecionarTodas() {
    if (entregas.length === 0) return;
    const todasMarcadas = entregas.every((e) => selecionadas[e.id]);
    const novo: Record<number, boolean> = {};
    for (const e of entregas) novo[e.id] = !todasMarcadas;
    setSelecionadas(novo);
  }

  function toggleEntrega(id: number) {
    setSelecionadas((s) => ({ ...s, [id]: !s[id] }));
  }

  const idsSelecionados = Object.entries(selecionadas)
    .filter(([, v]) => v)
    .map(([k]) => Number(k));

  const totalSelecionado = entregas
    .filter((e) => selecionadas[e.id])
    .reduce((sum, e) => sum + e.frete_motoboy, 0);

  async function handlePagar() {
    if (idsSelecionados.length === 0) return;
    setSubmetendo(true);
    setErro("");
    setSucesso("");
    try {
      const result = await apiFetch<{ message: string }>(
        "/api/entregas-venda/motoboy/pagar",
        {
          method: "POST",
          body: JSON.stringify({
            motoboy_id: motoboyId,
            entrega_ids: idsSelecionados,
            data_vencimento: dataVencimento,
          }),
        },
      );
      setSucesso(result.message ?? "Pagamento registrado.");
      await carregarEntregas();
      setSelecionadas({});
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar pagamento");
    } finally {
      setSubmetendo(false);
    }
  }

  return (
    <div>
      {/* Selecionar motoboy */}
      <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
        Motoboy
      </label>
      <select value={motoboyId}
        onChange={(e) => setMotoboyId(e.target.value)}
        disabled={loadingMotoboys}
        style={{
          width: "100%", padding: "10px 12px", fontSize: 13,
          border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
          background: "#fff", color: "#1f2937", marginBottom: 16,
        }}>
        <option value="">Selecione...</option>
        {motoboys.map((m) => (
          <option key={m.user_id} value={m.user_id}>{m.nome}</option>
        ))}
      </select>

      {/* Lista de entregas */}
      {loadingEntregas && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <Loader2 size={20} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}

      {erro && (
        <div style={{ padding: 10, borderRadius: 6, background: C.vermelhoLt, color: C.vermelho, fontSize: 12, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {sucesso && (
        <div style={{ padding: 10, borderRadius: 6, background: C.verdeLt, color: C.verde, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
          {sucesso}
        </div>
      )}

      {!loadingEntregas && motoboyId && entregas.length === 0 && (
        <p style={{ fontSize: 13, color: C.cinza, textAlign: "center", padding: 20 }}>
          Nenhuma entrega pendente de pagamento.
        </p>
      )}

      {entregas.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.cinza }}>
              {entregas.length} entrega(s)
            </span>
            <button onClick={toggleSelecionarTodas}
              style={{ fontSize: 11, color: C.esmeralda, border: "none", background: "none", cursor: "pointer", fontWeight: 600 }}>
              {entregas.every((e) => selecionadas[e.id]) ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>
          <div style={{ maxHeight: 250, overflow: "auto", marginBottom: 12, border: `1px solid ${C.cremeBorder}`, borderRadius: 8 }}>
            {entregas.map((e) => (
              <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${C.cremeBorder}`, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={!!selecionadas[e.id]}
                  onChange={() => toggleEntrega(e.id)}
                  style={{ accentColor: C.esmeralda }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {e.codigo_entrega} — Venda {e.numero_venda ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: C.cinza }}>
                    {e.cliente_nome ?? "—"} · {fmtData(e.data_entrega_realizada)}
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: C.esmeralda }}>
                  {fmtBRL(e.frete_motoboy)}
                </span>
              </label>
            ))}
          </div>

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.cremeBorder}`, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: C.cinza }}>
              {idsSelecionados.length} selecionada(s)
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.esmeralda }}>
              {fmtBRL(totalSelecionado)}
            </span>
          </div>

          {/* Data de vencimento para conta a pagar */}
          <label style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6, display: "block" }}>
            Vencimento da conta a pagar
          </label>
          <input type="date" value={dataVencimento}
            onChange={e => setDataVencimento(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", fontSize: 13, border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff", color: "#1f2937", marginBottom: 14 }} />

          <button onClick={handlePagar}
            disabled={idsSelecionados.length === 0 || submetendo}
            style={{
              width: "100%", padding: "12px", borderRadius: 8, border: "none",
              background: idsSelecionados.length > 0 ? C.esmeralda : "#9CA3AF",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: idsSelecionados.length > 0 ? "pointer" : "not-allowed",
              opacity: submetendo ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <CheckCircle size={16} />
            {submetendo ? "Registrando..." : `Confirmar Pagamento de ${fmtBRL(totalSelecionado)}`}
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
