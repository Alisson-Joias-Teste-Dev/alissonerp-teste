"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Loader2, CheckCircle, XCircle,
  Ticket, FileText, ChevronRight,
} from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface VendaItem {
  id: number;
  produto_id: number;
  nome_produto: string;
  sku: string | null;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
}

interface Venda {
  id: number;
  numero_venda: string;
  cliente_id: number | null;
  cliente_nome: string | null;
  data_venda: string;
  situacao: string;
  total_venda: number;
  itens: VendaItem[];
  pagamentos: Array<{ id: number; forma: string; gateway: string | null; status: string }>;
  // devoluções já existentes — backend retorna valor_total_devolvido agregado
  devolucoes?: Array<{ id: number; numero: string; status: string; tipo: string }>;
}

type TipoCompensacao = "vale_troca" | "reembolso_manual";

interface Props {
  role: string;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function NovaDevolucaoClient({ role }: Props) {
  const router = useRouter();
  void role;

  const [step, setStep] = useState(1);

  // Step 1: Buscar Venda
  const [buscaInput, setBuscaInput] = useState("");
  const [buscandoVenda, setBuscandoVenda] = useState(false);
  const [buscaErr, setBuscaErr] = useState("");
  const [venda, setVenda] = useState<Venda | null>(null);

  // Step 2: Selecionar Itens
  const [selecionados, setSelecionados] = useState<Record<number, number>>({}); // item_venda_id -> qtd
  const [foiEntregue, setFoiEntregue] = useState(false);
  const [percRetencao, setPercRetencao] = useState(30);

  // Step 3: Compensacao
  const [tipoComp, setTipoComp] = useState<TipoCompensacao>("vale_troca");
  const [motivo, setMotivo] = useState("");

  // Salvando
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const buscarVenda = useCallback(async () => {
    if (!buscaInput.trim()) return;
    setBuscandoVenda(true);
    setBuscaErr("");
    setVenda(null);
    try {
      // Busca via GET /api/vendas (q=numero) para descobrir o id, depois carrega completa
      // /api/vendas exige inicio+fim — usa janela ampla (5 anos) pra permitir devolução de vendas antigas
      const hoje = new Date();
      const fim = hoje.toISOString().slice(0, 10);
      const inicioDt = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate());
      const inicio = inicioDt.toISOString().slice(0, 10);
      const listRes = await fetch(`/api/vendas?q=${encodeURIComponent(buscaInput.trim())}&inicio=${inicio}&fim=${fim}`);
      if (!listRes.ok) throw new Error("Erro ao buscar venda");
      const listaRaw = await listRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lista = (Array.isArray(listaRaw) ? listaRaw : (listaRaw as any).data ?? []) as Array<{ id: number; numero_venda: string }>;

      const match = lista.find((v) => v.numero_venda === buscaInput.trim()) ?? lista[0];
      if (!match) {
        setBuscaErr("Venda não encontrada");
        return;
      }
      const detRes = await fetch(`/api/vendas/${match.id}`);
      if (!detRes.ok) throw new Error("Erro ao carregar detalhes da venda");
      const d = (await detRes.json()) as Venda;
      if (!["aprovado", "enviado", "concluido"].includes(d.situacao)) {
        setBuscaErr(`Venda ${d.numero_venda} está em situação '${d.situacao}' — só é possível devolver vendas aprovadas, enviadas ou concluídas`);
        return;
      }
      setVenda(d);
      setSelecionados({});
    } catch (e) {
      setBuscaErr(e instanceof Error ? e.message : "Erro ao buscar");
    } finally {
      setBuscandoVenda(false);
    }
  }, [buscaInput]);

  // Derivados
  const itensSelecionados = Object.entries(selecionados).filter(([, q]) => q > 0);
  const valorTotalDev = itensSelecionados.reduce((s, [id, qtd]) => {
    const it = venda?.itens.find((i) => i.id === Number(id));
    return s + (it ? it.preco_unitario * qtd : 0);
  }, 0);
  const valorRetido = (valorTotalDev * percRetencao) / 100;
  const valorCompensacao = valorTotalDev - valorRetido;

  const tipoDev: "parcial" | "total" = venda
    ? itensSelecionados.length === venda.itens.length &&
      itensSelecionados.every(([id, qtd]) => {
        const it = venda.itens.find((i) => i.id === Number(id));
        return it ? qtd === it.quantidade : false;
      })
      ? "total"
      : "parcial"
    : "parcial";

  function toggleItem(itemId: number, qtdMaxima: number) {
    setSelecionados((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = qtdMaxima;
      return next;
    });
  }

  function setQtd(itemId: number, qtd: number, qtdMaxima: number) {
    setSelecionados((prev) => {
      const next = { ...prev };
      if (qtd <= 0) delete next[itemId];
      else next[itemId] = Math.min(qtd, qtdMaxima);
      return next;
    });
  }

  async function salvar(submeterAprovacao: boolean) {
    if (!venda) return;
    if (itensSelecionados.length === 0) {
      setSaveErr("Selecione ao menos 1 item");
      return;
    }
    if (!motivo.trim()) {
      setSaveErr("Motivo é obrigatório");
      return;
    }
    setSaving(true);
    setSaveErr("");
    try {
      const body = {
        venda_id: venda.id,
        tipo: tipoDev,
        motivo: motivo.trim(),
        tipo_compensacao: tipoComp,
        foi_entregue: foiEntregue,
        percentual_retencao: percRetencao,
        itens: itensSelecionados.map(([id, qtd]) => ({
          item_venda_id: Number(id),
          quantidade: qtd,
        })),
      };
      const res = await fetch("/api/devolucoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as { id: number; numero: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);

      if (submeterAprovacao) {
        const apRes = await fetch(`/api/devolucoes/${d.id}/solicitar-aprovacao`, { method: "POST" });
        const apData = await apRes.json();
        if (!apRes.ok) throw new Error(apData.error ?? "Erro ao solicitar aprovação");
      }
      router.push(`/devolucoes/${d.id}`);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/devolucoes" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              Nova Devolução
            </h2>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Registre uma devolução de venda para vale-troca ou reembolso.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <Stepper step={step} />

      {saveErr && (
        <div className="px-4 py-3 rounded-lg border flex items-start gap-2"
          style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}>
          <XCircle size={16} className="shrink-0 mt-0.5" />
          <p className="text-sm">{saveErr}</p>
        </div>
      )}

      {/* ─── Step 1: Buscar Venda ─── */}
      {step === 1 && (
        <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "#374151" }}>
              1. Localize a venda que será devolvida
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                <input
                  type="text"
                  value={buscaInput}
                  onChange={(e) => setBuscaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarVenda()}
                  placeholder="Digite o nº da venda (ex: 14791)"
                  className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder, color: "#374151" }}
                />
              </div>
              <button
                onClick={buscarVenda}
                disabled={buscandoVenda || !buscaInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {buscandoVenda ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar
              </button>
            </div>
            {buscaErr && <p className="text-sm text-red-600 mt-2">{buscaErr}</p>}
          </div>

          {venda && (
            <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold" style={{ color: C.esmeralda }}>
                  Venda #{venda.numero_venda}
                </h4>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
                  {venda.situacao}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm" style={{ color: "#374151" }}>
                <div>
                  <span style={{ color: "#9CA3AF" }}>Cliente:</span> {venda.cliente_nome ?? "—"}
                </div>
                <div>
                  <span style={{ color: "#9CA3AF" }}>Data:</span> {fmtDate(venda.data_venda)}
                </div>
                <div>
                  <span style={{ color: "#9CA3AF" }}>Total:</span>{" "}
                  <span className="font-semibold" style={{ color: C.esmeralda }}>
                    {fmt(Number(venda.total_venda))}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#9CA3AF" }}>Itens:</span> {venda.itens.length}
                </div>
              </div>
              {venda.devolucoes && venda.devolucoes.length > 0 && (
                <div className="text-xs pt-2 border-t" style={{ color: "#9A3412", borderColor: C.cremeBorder }}>
                  Esta venda já possui {venda.devolucoes.length} devolução(ões) registrada(s).
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!venda}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              Avançar <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Selecionar Itens ─── */}
      {step === 2 && venda && (
        <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#374151" }}>
            2. Selecione os itens a devolver
          </h3>
          <p className="text-xs mb-2" style={{ color: "#9CA3AF" }}>
            Tipo da devolução: <span className="font-semibold" style={{ color: C.esmeralda }}>{tipoDev}</span>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.cremeBg }}>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold w-8"></th>
                  <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#6B7280" }}>Produto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Qtd Vendida</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Unit.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Qtd a Devolver</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "#6B7280" }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {venda.itens.map((it) => {
                  const qtdSel = selecionados[it.id] ?? 0;
                  const checked = qtdSel > 0;
                  const sub = it.preco_unitario * qtdSel;
                  return (
                    <tr key={it.id} className="border-t" style={{ borderColor: C.cremeBorder }}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItem(it.id, it.quantidade)}
                          className="w-4 h-4 accent-current"
                          style={{ accentColor: C.esmeralda }}
                        />
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "#1A1A1A" }}>
                        <p className="font-medium">{it.nome_produto}</p>
                        {it.sku && <p className="text-xs" style={{ color: "#9CA3AF" }}>{it.sku}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#374151" }}>
                        {it.quantidade}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#374151" }}>
                        {fmt(Number(it.preco_unitario))}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={it.quantidade}
                          value={qtdSel}
                          onChange={(e) => setQtd(it.id, parseInt(e.target.value) || 0, it.quantidade)}
                          disabled={!checked}
                          className="w-16 border rounded px-2 py-1 text-sm text-right outline-none disabled:opacity-50"
                          style={{ borderColor: C.cremeBorder, color: "#374151" }}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: C.esmeralda }}>
                        {fmt(sub)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Foi entregue? */}
          <div className="pt-3 border-t space-y-3" style={{ borderColor: C.cremeBorder }}>
            <div>
              <label className="text-xs font-medium" style={{ color: "#374151" }}>Produto foi entregue ao cliente?</label>
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={() => {
                    setFoiEntregue(true);
                    setPercRetencao(0);
                  }}
                  className="px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
                  style={{
                    borderColor: foiEntregue ? C.esmeralda : C.cremeBorder,
                    backgroundColor: foiEntregue ? C.esmeraldaLt : "#fff",
                    color: foiEntregue ? C.esmeralda : "#6B7280",
                  }}
                >
                  Sim
                </button>
                <button
                  onClick={() => {
                    setFoiEntregue(false);
                    setPercRetencao(30);
                  }}
                  className="px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
                  style={{
                    borderColor: !foiEntregue ? C.esmeralda : C.cremeBorder,
                    backgroundColor: !foiEntregue ? C.esmeraldaLt : "#fff",
                    color: !foiEntregue ? C.esmeralda : "#6B7280",
                  }}
                >
                  Não
                </button>
              </div>
            </div>

            {!foiEntregue && (
              <div>
                <label className="text-xs font-medium" style={{ color: "#374151" }}>
                  Retenção: <span className="font-bold" style={{ color: C.esmeralda }}>{percRetencao}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={percRetencao}
                  onChange={(e) => setPercRetencao(parseInt(e.target.value))}
                  className="w-full mt-1"
                  style={{ accentColor: C.esmeralda }}
                />
                <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                  Percentual retido pela loja (padrão 30% quando não entregue — cliente recebe 70%).
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 pt-2 text-sm">
              <div>
                <p className="text-xs" style={{ color: "#9CA3AF" }}>Total devolvido</p>
                <p className="font-semibold tabular-nums" style={{ color: "#1A1A1A" }}>{fmt(valorTotalDev)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "#9CA3AF" }}>Valor retido</p>
                <p className="font-semibold tabular-nums" style={{ color: "#D97706" }}>{fmt(valorRetido)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "#9CA3AF" }}>Compensação</p>
                <p className="font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(valorCompensacao)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              <ArrowLeft size={14} /> Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={itensSelecionados.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              Avançar <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Compensação ─── */}
      {step === 3 && venda && (
        <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>
            3. Forma de compensação
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CompensacaoCard
              selected={tipoComp === "vale_troca"}
              onClick={() => setTipoComp("vale_troca")}
              icon={<Ticket size={20} />}
              emoji="🎟️"
              titulo="Vale-Troca"
              descricao="Cliente recebe crédito para nova compra"
            />
            <CompensacaoCard
              selected={tipoComp === "reembolso_manual"}
              onClick={() => setTipoComp("reembolso_manual")}
              icon={<FileText size={20} />}
              emoji="📄"
              titulo="Reembolso Manual"
              descricao="Gera conta a pagar"
            />
          </div>

          <div className="pt-2">
            <label className="text-xs font-medium mb-1 block" style={{ color: "#374151" }}>
              Motivo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo da devolução..."
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ borderColor: C.cremeBorder, color: "#374151" }}
            />
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              <ArrowLeft size={14} /> Voltar
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!motivo.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              Avançar <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Revisão ─── */}
      {step === 4 && venda && (
        <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>
            4. Revisão
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <InfoRow label="Venda" value={`#${venda.numero_venda}`} />
            <InfoRow label="Cliente" value={venda.cliente_nome ?? "—"} />
            <InfoRow label="Tipo" value={tipoDev} />
            <InfoRow label="Itens" value={`${itensSelecionados.length} item(ns)`} />
            <InfoRow label="Foi entregue" value={foiEntregue ? "Sim" : "Não"} />
            <InfoRow label="Retenção" value={`${percRetencao}%`} />
            <InfoRow label="Valor devolvido" value={fmt(valorTotalDev)} />
            <InfoRow label="Valor retido" value={fmt(valorRetido)} />
            <InfoRow
              label="Compensação"
              value={fmt(valorCompensacao)}
              highlight
            />
            <InfoRow
              label="Via"
              value={
                tipoComp === "vale_troca" ? "🎟️ Vale-Troca"
                  : "📄 Reembolso Manual"
              }
            />
          </div>

          <div className="pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
            <p className="text-xs font-medium mb-1" style={{ color: "#9CA3AF" }}>Motivo</p>
            <p className="text-sm" style={{ color: "#374151" }}>{motivo}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              onClick={() => setStep(3)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              <ArrowLeft size={14} /> Voltar
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => salvar(false)}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-40"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Salvar Rascunho
              </button>
              <button
                onClick={() => salvar(true)}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: C.esmeralda, color: C.creme }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Solicitar Aprovação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function Stepper({ step }: { step: number }) {
  const steps = ["Venda", "Itens", "Compensação", "Revisão"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: active ? C.esmeralda : done ? "#D1FAE5" : "#F3F4F6",
                  color: active ? C.creme : done ? "#065F46" : "#9CA3AF",
                }}
              >
                {done ? <CheckCircle size={14} /> : n}
              </div>
              <span
                className="text-xs font-medium hidden md:inline"
                style={{ color: active ? C.esmeralda : done ? "#065F46" : "#9CA3AF" }}
              >
                {label}
              </span>
            </div>
            {n < steps.length && (
              <div className="flex-1 h-px" style={{ backgroundColor: done ? "#D1FAE5" : C.cremeBorder }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompensacaoCard({
  selected, onClick, icon, emoji, titulo, descricao, disabled, avisoDisabled,
}: {
  selected: boolean; onClick: () => void;
  icon: React.ReactNode; emoji: string; titulo: string; descricao: string;
  disabled?: boolean; avisoDisabled?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border p-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        borderColor: selected ? C.esmeralda : C.cremeBorder,
        backgroundColor: selected ? C.esmeraldaLt : "#fff",
        boxShadow: selected ? `0 0 0 2px ${C.esmeralda}30` : "none",
      }}
    >
      <div className="flex items-center justify-between mb-2" style={{ color: selected ? C.esmeralda : "#6B7280" }}>
        <span className="text-lg">{emoji}</span>
        {icon}
      </div>
      <p className="font-semibold text-sm" style={{ color: selected ? C.esmeralda : "#374151" }}>
        {titulo}
      </p>
      <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
        {descricao}
      </p>
      {disabled && avisoDisabled && (
        <p className="text-[10px] mt-1" style={{ color: "#DC2626" }}>{avisoDisabled}</p>
      )}
    </button>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs" style={{ color: "#9CA3AF" }}>{label}</p>
      <p
        className="font-medium tabular-nums"
        style={{ color: highlight ? C.esmeralda : "#1A1A1A", fontSize: highlight ? "1.05rem" : undefined }}
      >
        {value}
      </p>
    </div>
  );
}
