"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle,
  Settings2, Loader2, Save, AlertTriangle, CheckCircle,
  RotateCcw, ArrowRightLeft, Bookmark, X, TrendingDown, RefreshCw, MapPin,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { BotaoImprimirEtiqueta } from "@/components/rfid/BotaoImprimirEtiqueta";
import { MOTIVO_PERDA, CONFIRMACAO_PERDA } from "@/lib/perda-extravio";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Consolidado {
  produto_id:     number;
  nome_produto:   string;
  sku:            string | null;
  saldo_fisico:   number;
  reservado:      number;
  disponivel:     number;
  em_transito:    number;
  estoque_minimo: number;
  ativo:          boolean;
  alerta:         string;
}

interface SaldoLocal {
  local_estoque_id: number;
  local_nome:       string;
  saldo_fisico:     number;
  reservado:        number;
  disponivel:       number;
  em_transito:      number;
}

interface Movimento {
  id:               number;
  tipo:             "entrada" | "saida";
  quantidade:       number;
  motivo:           string;
  observacao:       string | null;
  referencia_tipo:  string | null;
  referencia_id:    number | null;
  local_estoque_id: number | null;
  local_nome:       string | null;
  status:           string;
  estorno_de_id:    number | null;
  estornado_por_id: number | null;
  ordem_id:         number | null;
  protocolo_id:     number | null;
  created_at:       string;
  criado_por:       string | null;
}

interface Reserva {
  id:           number;
  quantidade:   number;
  venda_id:     number | null;
  numero_venda: string | null;
  ordem_id:     number | null;
  numero_ordem: string | null;
  tipo_ordem:   string | null;
  tipo_reserva: "venda" | "conversao_sku" | "conversao_estoque" | "ordem" | "indefinida";
  origem_label: string;
  created_at:   string;
}

interface Transferencia {
  id:                  number;
  quantidade:          number;
  status:              string;
  local_origem_nome:   string;
  local_destino_nome:  string;
  ordem_solicitacao:   string;
  obs:                 string | null;
  created_at:          string;
  enviado_por_email:   string | null;
  recebido_por_email:  string | null;
  recebido_em:         string | null;
}

interface RfidItem {
  id:                string;
  epc:               string;
  sku:               string;
  nome:              string;
  localizacao_atual: string;
  status:            string;
  peso_g:            number | null;
  preco_venda:       number | null;
}

// Falta apurada em inventario: a "prova" que o dono ve antes de baixar por perda.
interface FaltaInventario {
  inventario_id: number;
  data:          string;
  local_nome:    string | null;
  faltou:        number;
  desfecho:      string | null;
}

interface DetalheData {
  consolidado:    Consolidado | null;
  localizacao:    string | null;
  saldoPorLocal:  SaldoLocal[];
  movimentos:     Movimento[];
  reservas:       Reserva[];
  transferencias: Transferencia[];
  rfidItens:      RfidItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const MOTIVO_LABEL: Record<string, string> = {
  producao:             "Producao",
  producao_auto:        "Producao (auto)",
  devolucao:            "Devolucao",
  ajuste_entrada:       "Ajuste de entrada",
  ajuste_saida:         "Ajuste de saida",
  inventario:           "Inventario",
  venda:                "Venda",
  cancelamento:         "Cancelamento",
  estorno:              "Estorno",
  transferencia_saida:  "Transferencia (saida)",
  transferencia_entrada:"Transferencia (entrada)",
  // Baixa por peca sumida/quebrada — unica baixa manual do ERP, so o dono faz.
  [MOTIVO_PERDA]:       "Perda / extravio",
};

type TabId = "movimentos" | "reservas" | "transferencias" | "rfid";

// Regra de negocio: cada reserva precisa mostrar a origem explicita para evitar confusao
// entre bloqueio comercial (venda) e bloqueio operacional (conversao/ordem).
// Impacto: sem esse mapeamento visual por tipo, a operacao pode interpretar saldo reservado incorretamente.
const RESERVA_TIPO_VISUAL: Record<Reserva["tipo_reserva"], { label: string; bg: string; color: string }> = {
  venda: { label: "Venda", bg: "#DBEAFE", color: "#1D4ED8" },
  conversao_sku: { label: "Conversao SKU", bg: "#F3E8FF", color: "#7E22CE" },
  conversao_estoque: { label: "Conversao Estoque", bg: "#DCFCE7", color: "#166534" },
  ordem: { label: "Ordem", bg: "#FEF3C7", color: "#92400E" },
  indefinida: { label: "Indefinida", bg: "#F3F4F6", color: "#4B5563" },
};

// ─── TransferirModal ──────────────────────────────────────────────────────────
function TransferirModal({
  produtoId, onClose, onDone,
}: { produtoId: number; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [locais, setLocais] = useState<{ id: number; nome: string }[]>([]);
  const [origem, setOrigem] = useState(0);
  const [destino, setDestino] = useState(0);
  const [quantidade, setQuantidade] = useState(1);
  const [ordemSol, setOrdemSol] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/locais-estoque")
      .then(r => r.json())
      .then((data: { id: number; nome: string }[]) => {
        setLocais(data);
        if (data.length >= 2) {
          setOrigem(data[0].id);
          setDestino(data[1].id);
        }
      })
      .catch(() => setErr("Erro ao carregar locais de estoque"));
  }, []);

  async function handleTransferir() {
    if (origem === destino) { setErr("Origem e destino devem ser diferentes"); return; }
    if (!ordemSol.trim()) { setErr("Ordem de solicitação é obrigatória"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/transferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: produtoId,
          quantidade,
          local_origem_id: origem,
          local_destino_id: destino,
          ordem_solicitacao: ordemSol.trim(),
        }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Erro");
      setDone(true);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={24} style={{ color: "#059669" }} />
          </div>
          <h2 className="font-bold text-lg mb-1" style={{ color: "#184036" }}>Transferencia Criada!</h2>
          <p className="text-sm text-gray-500 mb-5">
            O produto esta em transito. Va em Transferencias para concluir o recebimento.
          </p>
          <div className="flex gap-2">
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
              style={{ color: "#6B7280", borderColor: "#E5E7EB" }}
              onClick={onClose}
            >
              Fechar
            </button>
            <button
              className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: "#184036", color: "#F3EADA" }}
              onClick={() => router.push("/estoque-comercial/transferencias")}
            >
              <ArrowRightLeft size={14} />
              Ver Transferencias
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: "#184036" }}>Transferir Produto</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Origem</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: "#E8DCC8" }}
                  value={origem}
                  onChange={e => setOrigem(Number(e.target.value))}
                >
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Destino</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: "#E8DCC8" }}
                  value={destino}
                  onChange={e => setDestino(Number(e.target.value))}
                >
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Ordem de solicitacao <span className="text-red-400">*</span></label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                placeholder="Ex: SOL-2026-00123"
                value={ordemSol} onChange={e => setOrdemSol(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Quantidade</label>
              <input
                type="number" min={1}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                value={quantidade}
                onChange={e => setQuantidade(Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>
        {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
        <button
          className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          style={{ background: "#D97706", color: "#fff" }}
          onClick={handleTransferir}
          disabled={saving || locais.length === 0}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
          Transferir
        </button>
      </div>
    </div>
  );
}

// ─── PerdaModal ───────────────────────────────────────────────────────────────
/**
 * Modal de baixa por PERDA / EXTRAVIO.
 *
 * REGRA DE NEGOCIO: peca que sumiu precisa sair do estoque, senao o saldo mente
 * para sempre. E a unica baixa manual do ERP e so o master admin (o dono) faz —
 * quem controla isso e o backend; aqui a tela so nao mostra o botao pros demais.
 *
 * Tres freios de mao antes de gravar:
 *   1) historico de faltas em inventario (a prova de que a peca sumiu mesmo);
 *   2) motivo escrito, minimo 10 caracteres;
 *   3) a palavra PERDA digitada — impede baixa por clique acidental.
 *
 * IMPACTO SE REMOVIDOS: baixa de joia vira um clique, sem rastro do porque.
 */
function PerdaModal({
  produtoId, saldoPorLocal, faltas, onClose, onDone,
}: {
  produtoId: number;
  saldoPorLocal: SaldoLocal[];
  faltas: FaltaInventario[];
  onClose: () => void;
  onDone: () => void;
}) {
  // So faz sentido oferecer local onde exista saldo disponivel para baixar.
  const locaisComSaldo = saldoPorLocal.filter(sl => sl.disponivel > 0);

  const [localId,     setLocalId]     = useState(locaisComSaldo[0]?.local_estoque_id ?? 0);
  const [quantidade,  setQuantidade]  = useState("1");
  const [motivo,      setMotivo]      = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState("");

  const localSel  = locaisComSaldo.find(l => l.local_estoque_id === localId);
  const podeGravar =
    localId > 0 &&
    Number(quantidade) > 0 &&
    motivo.trim().length >= 10 &&
    confirmacao.trim().toUpperCase() === CONFIRMACAO_PERDA;

  async function handleGravar() {
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/perda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: produtoId,
          local_estoque_id: localId,
          quantidade: Number(quantidade),
          motivo: motivo.trim(),
          confirmacao: confirmacao.trim().toUpperCase(),
        }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Erro");
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-lg" style={{ color: "#991B1B" }}>Registrar perda / extravio</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Isso baixa o estoque de verdade. So o administrador master consegue fazer e desfazer.
        </p>

        {/* Prova: em quais inventarios a peca deu falta */}
        {faltas.length > 0 && (
          <div className="rounded-xl p-3 mb-4" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "#184036" }}>
              Deu falta em {faltas.length} inventario{faltas.length > 1 ? "s" : ""}
            </p>
            {faltas.map(f => (
              <div
                key={f.inventario_id}
                className="flex items-center justify-between gap-2 py-1 border-t"
                style={{ borderColor: "#E8DCC8" }}
              >
                <span className="text-xs text-gray-500">
                  {fmtDate(f.data)} {f.local_nome ? `· ${f.local_nome}` : ""}
                </span>
                <span className="text-xs font-semibold" style={{ color: "#DC2626" }}>-{f.faltou}</span>
              </div>
            ))}
          </div>
        )}
        {faltas.length === 0 && (
          <div className="rounded-xl p-3 mb-4" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <p className="text-xs" style={{ color: "#92400E" }}>
              Esta peca nunca deu falta em inventario. Confira antes de baixar.
            </p>
          </div>
        )}

        {locaisComSaldo.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">
            Nao ha saldo disponivel em nenhum local para baixar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1 text-gray-500">Local</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: "#E8DCC8" }}
                  value={localId}
                  onChange={e => setLocalId(Number(e.target.value))}
                >
                  {locaisComSaldo.map(l => (
                    <option key={l.local_estoque_id} value={l.local_estoque_id}>
                      {l.local_nome} — disponivel: {l.disponivel}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Qtd</label>
                <input
                  type="number" min={1} max={localSel?.disponivel ?? 1}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#E8DCC8" }}
                  value={quantidade}
                  onChange={e => setQuantidade(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-gray-500">
                O que aconteceu <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                placeholder="Ex: nao localizada em 3 inventarios seguidos, busca em todas as gavetas"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
              />
            </div>

            <div className="rounded-xl p-3 mb-3" style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
              <p className="text-xs flex items-start gap-1.5" style={{ color: "#991B1B" }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                Digite <strong>{CONFIRMACAO_PERDA}</strong> para confirmar a baixa.
              </p>
            </div>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none mb-3 font-mono"
              style={{ borderColor: "#E8DCC8" }}
              placeholder={CONFIRMACAO_PERDA}
              value={confirmacao}
              onChange={e => setConfirmacao(e.target.value)}
            />

            {err && <p className="text-xs text-red-500 mb-3">{err}</p>}

            <div className="flex gap-2">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ color: "#6B7280", borderColor: "#E5E7EB" }}
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: "#991B1B", color: "#fff" }}
                onClick={handleGravar}
                disabled={saving || !podeGravar}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <TrendingDown size={14} />}
                Confirmar baixa
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EstoqueComercialDetalheClient({ produtoId }: { produtoId: number }) {
  const router  = useRouter();
  const { role } = useAuth();
  const podeAdminDev = role === "admin" || role === "desenvolvedor";

  const [data,    setData]    = useState<DetalheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<TabId>("movimentos");
  const [estornando, setEstornando] = useState<number | null>(null);
  const [transferindo, setTransferindo] = useState(false);

  // Perda / extravio — quem pode e o historico de faltas vem do backend.
  // O gate real e no servidor (master admin); aqui so escondemos o botao.
  const [podePerda,   setPodePerda]   = useState(false);
  const [faltas,      setFaltas]      = useState<FaltaInventario[]>([]);
  const [perdaAberta, setPerdaAberta] = useState(false);

  // Ajuste manual (entrada ou saída)
  // Ajuste manual e SO DE ENTRADA. A saida manual foi removida da tela: a API
  // devolve 403 para qualquer saida desde a v2.81.3 (o botao era morto) e a unica
  // baixa que existe hoje e a de perda/extravio, exclusiva do master admin.
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajusteQtd,     setAjusteQtd]     = useState("1");
  const [ajusteDesc,    setAjusteDesc]    = useState("");
  const [ajusteErr,     setAjusteErr]     = useState("");
  const [ajusteLoading, setAjusteLoading] = useState(false);

  // Config edit
  const [editMin,    setEditMin]    = useState(0);
  const [editAtivo,  setEditAtivo]  = useState(true);
  const [savingCfg,  setSavingCfg]  = useState(false);
  const [cfgMsg,     setCfgMsg]     = useState("");

  // Localizacao (edicao manual — o ERP e o dono do dado apos a carga inicial)
  const [locEdit,   setLocEdit]   = useState("");
  const [savingLoc, setSavingLoc] = useState(false);
  const [locMsg,    setLocMsg]    = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/estoque-comercial/${produtoId}?limit=100`);
      if (r.ok) {
        const d = await r.json() as DetalheData;
        setData(d);
        setLocEdit(d.localizacao ?? "");
        if (d.consolidado) {
          setEditMin(d.consolidado.estoque_minimo);
          setEditAtivo(d.consolidado.ativo);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [produtoId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Carrega, em paralelo ao detalhe, se este usuario pode baixar por perda e o
  // historico de faltas da peca em inventarios. Falha aqui nao quebra a tela:
  // sem resposta, o botao simplesmente nao aparece.
  const fetchPerda = useCallback(async () => {
    try {
      const r = await fetch(`/api/estoque-comercial/perda?produto_id=${produtoId}`);
      if (!r.ok) return;
      const d = await r.json() as { podeRegistrar: boolean; faltas: FaltaInventario[] };
      setPodePerda(d.podeRegistrar);
      setFaltas(d.faltas ?? []);
    } catch {
      setPodePerda(false);
    }
  }, [produtoId]);

  useEffect(() => { fetchPerda(); }, [fetchPerda]);

  // Grava a localizacao editada a mao (o ERP e o dono do dado). String vazia limpa.
  async function saveLocalizacao() {
    setSavingLoc(true); setLocMsg("");
    try {
      const r = await fetch(`/api/estoque-comercial/${produtoId}/localizacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localizacao: locEdit }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      setLocMsg("Salvo!");
      await fetchData();
    } catch (e) {
      setLocMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingLoc(false);
      setTimeout(() => setLocMsg(""), 3000);
    }
  }

  async function saveConfig() {
    setSavingCfg(true); setCfgMsg("");
    try {
      const r = await fetch(`/api/estoque-comercial/config/${produtoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estoque_minimo: editMin, ativo: editAtivo }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      setCfgMsg("Salvo!");
      await fetchData();
    } catch (e) {
      setCfgMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingCfg(false);
      setTimeout(() => setCfgMsg(""), 3000);
    }
  }

  async function handleEstorno(movId: number) {
    if (!confirm("Confirma o estorno deste movimento?")) return;
    setEstornando(movId);
    try {
      const r = await fetch(`/api/estoque-comercial/estornar/${movId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json() as { error?: string };
        alert(err.error ?? "Erro ao estornar");
      } else {
        await fetchData();
      }
    } finally {
      setEstornando(null);
    }
  }

  function abrirAjuste() {
    setAjusteAberto(true);
    setAjusteQtd("1");
    setAjusteDesc("");
    setAjusteErr("");
  }

  async function handleAjusteManual() {
    const qtd = parseInt(ajusteQtd, 10);
    if (!qtd || qtd < 1) { setAjusteErr("Quantidade inválida"); return; }
    if (!ajusteDesc.trim()) { setAjusteErr("Descrição obrigatória"); return; }
    setAjusteLoading(true); setAjusteErr("");
    try {
      const r = await fetch("/api/estoque-comercial/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: produtoId,
          tipo: "entrada",
          motivo: "ajuste_entrada",
          quantidade: qtd,
          observacao: ajusteDesc.trim(),
          local_estoque_id: 2,
        }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Erro");
      setAjusteAberto(false);
      await fetchData();
    } catch (e) {
      setAjusteErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setAjusteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
      </div>
    );
  }

  const c = data?.consolidado;
  const movimentos = data?.movimentos ?? [];
  const reservas = data?.reservas ?? [];
  const transferencias = data?.transferencias ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-5">
        <button
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ color: "#184036" }}
          onClick={() => router.push("/estoque-comercial")}
        >
          <ArrowLeft size={15} />
          Estoque Comercial
        </button>
        <span className="text-gray-300">|</span>
        <button
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ color: "#D97706" }}
          onClick={() => router.push("/estoque-comercial/transferencias")}
        >
          <ArrowRightLeft size={14} />
          Transferencias
        </button>
      </div>

      {/* Hero Section */}
      <div className="rounded-2xl p-5 sm:p-6 mb-6" style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
              {c?.nome_produto ?? `Produto #${produtoId}`}
            </h1>
            {c?.sku && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">{c.sku}</span>
                {c && (
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{
                      background: c.alerta === "ok" ? "#D1FAE5" : c.alerta === "zerado" ? "#F3F4F6" : "#FEE2E2",
                      color: c.alerta === "ok" ? "#065F46" : c.alerta === "zerado" ? "#6B7280" : "#991B1B",
                    }}
                  >
                    {c.alerta === "ok" ? "OK" : c.alerta === "zerado" ? "Zerado" : "Critico"}
                  </span>
                )}
              </div>
            )}

            {/* Localizacao fisica da peca: importada da fonte externa e editavel aqui
                (o ERP e o dono do dado apos a carga inicial). */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin size={13} /> Localização
              </span>
              {podeAdminDev ? (
                <>
                  <input
                    value={locEdit}
                    onChange={e => setLocEdit(e.target.value)}
                    placeholder="ex: LJ-ET04"
                    className="border rounded-lg px-2 py-1 text-sm font-mono outline-none"
                    style={{ borderColor: "#E8DCC8", minWidth: 140 }}
                  />
                  <button
                    onClick={saveLocalizacao}
                    disabled={savingLoc || locEdit.trim() === (data?.localizacao ?? "")}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    style={{ background: "#184036", color: "#fff" }}
                  >
                    {savingLoc ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Salvar
                  </button>
                  {locMsg && (
                    <span className="text-xs" style={{ color: locMsg === "Salvo!" ? "#059669" : "#DC2626" }}>{locMsg}</span>
                  )}
                </>
              ) : (
                <span className="text-sm font-mono px-2 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#374151" }}>
                  {data?.localizacao || "—"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* REGRA DE NEGOCIO: so ENTRADA manual. O botao "Baixa Manual" foi
                removido em 21/07/2026 — a API recusa qualquer saida manual desde
                a v2.81.3 (403 para todos), entao ele so servia para dar erro. A
                unica baixa que existe e a de perda/extravio, logo abaixo, e e
                exclusiva do master admin.
                IMPACTO SE VOLTAR: botao que nunca funciona e induz a operacao a
                achar que da para "acertar" o estoque na mao. */}
            {podeAdminDev && (
              <button
                onClick={abrirAjuste}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "#D1FAE5", color: "#065F46", border: "1px solid #6EE7B7" }}
                title="Registrar entrada manual no estoque"
              >
                <ArrowUpCircle size={15} />
                Entrada Manual
              </button>
            )}
            {/* REGRA DE NEGOCIO: baixa por peca sumida. Botao SO existe para o
                master admin (o dono) — nem admin, nem desenvolvedor, nem gerente.
                A permissao de verdade e checada no backend; isto so esconde. */}
            {podePerda && (
              <button
                onClick={() => setPerdaAberta(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
                title="Baixar peca perdida ou extraviada"
              >
                <AlertTriangle size={15} />
                Perda / extravio
              </button>
            )}
            {/* REGRA DE NEGOCIO: botao de etiqueta RFID (imprimir + gravar chip) do produto desta tela */}
            <BotaoImprimirEtiqueta produtoId={produtoId} variant="compact" />
            <button
              onClick={() => setTransferindo(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
              title="Transferir este produto"
            >
              <ArrowRightLeft size={15} />
              Transferir
            </button>
            {c && (
              <div className="text-center min-w-[80px]">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Disponivel</p>
                <p
                  className="text-3xl sm:text-4xl font-bold leading-none"
                  style={{ color: c.disponivel <= 0 ? "#DC2626" : "#059669" }}
                >
                  {c.disponivel}
                </p>
                {c.reservado > 0 && (
                  <p className="text-xs mt-1 font-medium" style={{ color: "#2563EB" }}>
                    {c.reservado} reservado{c.reservado > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saldo por local */}
      {data?.saldoPorLocal && data.saldoPorLocal.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {data.saldoPorLocal.map(sl => (
            <div
              key={sl.local_estoque_id}
              className="rounded-xl p-4"
              style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
            >
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">{sl.local_nome}</p>
              <p className="text-2xl font-bold mb-2" style={{ color: "#184036" }}>{sl.disponivel}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className="text-gray-500">Fisico: <strong>{sl.saldo_fisico}</strong></span>
                {sl.reservado > 0 && (
                  <span style={{ color: "#2563EB" }}>Res: <strong>{sl.reservado}</strong></span>
                )}
                {sl.em_transito > 0 && (
                  <span style={{ color: "#D97706" }}>Transito: <strong>{sl.em_transito}</strong></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Config Collapsible */}
      <details className="mb-6 group">
        <summary
          className="flex items-center gap-2 cursor-pointer rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
          style={{ color: "#184036", border: "1px solid #E8DCC8", background: "#FAFAF7" }}
        >
          <Settings2 size={15} />
          Configuracao
          <span className="text-xs text-gray-400 ml-auto group-open:rotate-180 transition-transform">&#9660;</span>
        </summary>
        <div className="mt-3 rounded-xl p-5" style={{ border: "1px solid #E8DCC8", background: "#FAFAF7" }}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Estoque minimo</label>
              <input
                type="number" min={0}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={editMin}
                onChange={e => setEditMin(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-gray-500">Status</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={editAtivo ? "ativo" : "inativo"}
                onChange={e => setEditAtivo(e.target.value === "ativo")}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "#184036", color: "#F3EADA" }}
              onClick={saveConfig}
              disabled={savingCfg}
            >
              {savingCfg ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
            {cfgMsg && (
              <p className="text-xs" style={{ color: cfgMsg === "Salvo!" ? "#059669" : "#DC2626" }}>
                {cfgMsg}
              </p>
            )}
          </div>
        </div>
      </details>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "#E8DCC8" }}>
        {([
          { id: "movimentos" as TabId, label: "Movimentacoes", count: movimentos.length },
          { id: "reservas" as TabId, label: "Reservas", count: reservas.length },
          { id: "transferencias" as TabId, label: "Transferencias", count: transferencias.length },
          { id: "rfid" as TabId, label: "Itens RFID", count: data?.rfidItens?.length ?? 0 },
        ]).map(t => (
          <button
            key={t.id}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: tab === t.id ? "#184036" : "#9CA3AF",
              borderBottom: tab === t.id ? "2px solid #184036" : "2px solid transparent",
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label} {t.count > 0 && <span className="text-xs opacity-60">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content: Movimentacoes */}
      {tab === "movimentos" && (
        movimentos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma movimentacao registrada.</p>
        ) : (
          <div className="space-y-2">
            {movimentos.map(m => {
              const isEstornado = m.status === "estornado";
              return (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl px-4 py-3"
                  style={{
                    border: "1px solid #F3F4F6",
                    opacity: isEstornado ? 0.5 : 1,
                  }}
                >
                  <div className="mt-0.5">
                    {m.tipo === "entrada"
                      ? <ArrowUpCircle size={16} style={{ color: "#059669" }} />
                      : <ArrowDownCircle size={16} style={{ color: "#DC2626" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="font-semibold text-sm"
                        style={{ color: m.tipo === "entrada" ? "#059669" : "#DC2626" }}
                      >
                        {m.tipo === "entrada" ? "+" : "-"}{m.quantidade}
                      </span>
                      {/* REGRA DE NEGOCIO: perda/extravio ganha destaque vermelho no
                          extrato. E a linha que responde "cade a peca?" numa auditoria
                          — precisa saltar aos olhos no meio de venda/producao. */}
                      {m.motivo === MOTIVO_PERDA ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded font-semibold"
                          style={{ background: "#FEE2E2", color: "#991B1B" }}
                        >
                          {MOTIVO_LABEL[MOTIVO_PERDA]}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600">
                          {MOTIVO_LABEL[m.motivo] ?? m.motivo}
                        </span>
                      )}
                      {m.local_nome && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          {m.local_nome}
                        </span>
                      )}
                      {isEstornado && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                          Estornado
                        </span>
                      )}
                      {m.estorno_de_id && (
                        <span className="text-xs text-gray-400">(estorno de #{m.estorno_de_id})</span>
                      )}
                    </div>
                    {m.observacao && (
                      <p className="text-xs text-gray-400 mt-0.5">{m.observacao}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <p className="text-xs text-gray-400">{fmtDate(m.created_at)}</p>
                    {m.criado_por && (
                      <p className="text-xs text-gray-300 truncate max-w-[120px]">{m.criado_por}</p>
                    )}
                    {!isEstornado && !m.estornado_por_id && !m.estorno_de_id && (
                      <button
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        style={{ color: "#DC2626" }}
                        onClick={() => handleEstorno(m.id)}
                        disabled={estornando === m.id}
                        title="Estornar"
                      >
                        {estornando === m.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <RotateCcw size={11} />}
                        Estornar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Tab content: Reservas */}
      {tab === "reservas" && (
        reservas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma reserva ativa.</p>
        ) : (
          <div className="space-y-2">
            {reservas.map(r => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <Bookmark size={16} style={{ color: "#2563EB" }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "#2563EB" }}>
                      {r.quantidade} un
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: RESERVA_TIPO_VISUAL[r.tipo_reserva]?.bg ?? RESERVA_TIPO_VISUAL.indefinida.bg,
                        color: RESERVA_TIPO_VISUAL[r.tipo_reserva]?.color ?? RESERVA_TIPO_VISUAL.indefinida.color,
                      }}
                    >
                      {RESERVA_TIPO_VISUAL[r.tipo_reserva]?.label ?? RESERVA_TIPO_VISUAL.indefinida.label}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 mt-0.5 inline-block">
                    {/* Regra de negocio: a origem da reserva precisa ser explicita (venda x conversao/ordem).
                        Impacto: se remover este label dinamico, a conversao volta a aparecer como venda e confunde a operacao. */}
                    {r.origem_label}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{fmtDate(r.created_at)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab content: Transferencias */}
      {tab === "transferencias" && (
        transferencias.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma transferencia.</p>
        ) : (
          <div className="space-y-2">
            {transferencias.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <ArrowRightLeft size={16} style={{ color: "#D97706" }} />
                <div className="flex-1">
                  <span className="text-sm font-medium">{t.quantidade} un</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {t.local_origem_nome} &rarr; {t.local_destino_nome}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">Ordem: {t.ordem_solicitacao}</span>
                  <span
                    className="text-xs ml-2 px-1.5 py-0.5 rounded"
                    style={{
                      background: t.status === "concluido" ? "#D1FAE5" : t.status === "cancelado" ? "#FEE2E2" : "#FEF3C7",
                      color: t.status === "concluido" ? "#065F46" : t.status === "cancelado" ? "#991B1B" : "#92400E",
                    }}
                  >
                    {t.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{fmtDate(t.created_at)}</p>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab content: Itens RFID */}
      {tab === "rfid" && (
        !data?.rfidItens || data.rfidItens.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum item RFID cadastrado para este produto.</p>
        ) : (
          <div className="space-y-2">
            {data.rfidItens.map(r => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ border: "1px solid #F3F4F6" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-gray-500">{r.epc.slice(-12)}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: r.status === "ativo" ? "#D1FAE5" : r.status === "pendente_impressao" ? "#FEF3C7" : "#FEE2E2",
                        color: r.status === "ativo" ? "#065F46" : r.status === "pendente_impressao" ? "#92400E" : "#991B1B",
                      }}
                    >
                      {r.status === "ativo" ? "Disponivel" : r.status === "pendente_impressao" ? "Pendente" : "Inativo"}
                    </span>
                    <span className="text-xs text-gray-400">{r.localizacao_atual}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">ID: {r.id.slice(0, 8)}...</p>
                </div>
                <div className="text-right shrink-0">
                  {r.peso_g != null && <p className="text-xs text-gray-500">{r.peso_g}g</p>}
                  {r.preco_venda != null && <p className="text-xs text-gray-500">R$ {Number(r.preco_venda).toFixed(2)}</p>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Transferir Modal */}
      {transferindo && (
        <TransferirModal
          produtoId={produtoId}
          onClose={() => setTransferindo(false)}
          onDone={fetchData}
        />
      )}

      {/* Perda / extravio Modal — so o master admin chega aqui */}
      {perdaAberta && (
        <PerdaModal
          produtoId={produtoId}
          saldoPorLocal={data?.saldoPorLocal ?? []}
          faltas={faltas}
          onClose={() => setPerdaAberta(false)}
          onDone={() => { fetchData(); fetchPerda(); }}
        />
      )}

      {/* Ajuste Manual Modal — SO ENTRADA (ver comentario no botao) */}
      {ajusteAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ArrowUpCircle size={18} style={{ color: "#059669" }} />
                <h2 className="font-bold text-lg" style={{ color: "#184036" }}>
                  Entrada Manual
                </h2>
              </div>
              <button onClick={() => setAjusteAberto(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            <p className="text-sm text-gray-500 mb-4">{c?.nome_produto}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#E8DCC8" }}
                  value={ajusteQtd}
                  onChange={e => setAjusteQtd(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">
                  Descrição <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ borderColor: "#E8DCC8" }}
                  placeholder="Motivo da entrada manual..."
                  value={ajusteDesc}
                  onChange={e => setAjusteDesc(e.target.value)}
                />
              </div>
            </div>

            {ajusteErr && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertTriangle size={12} /> {ajusteErr}
              </p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ color: "#6B7280", borderColor: "#E5E7EB" }}
                onClick={() => setAjusteAberto(false)}
                disabled={ajusteLoading}
              >
                Cancelar
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: "#059669", color: "#fff" }}
                onClick={handleAjusteManual}
                disabled={ajusteLoading}
              >
                {ajusteLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <ArrowUpCircle size={14} />}
                Confirmar Entrada
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
