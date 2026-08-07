"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Search, Camera, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, STATUS_COLORS } from "@/lib/cofre-ouro-status";
import { localElegivelTransferencia } from "@/lib/protocolo-transferencia";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

const TIPO_LABEL: Record<string, string> = {
  servico_venda: "Serv. Venda",
  fabricacao: "Fabricação",
  reposicao_venda: "Rep. Venda",
  reposicao_loja: "Rep. Loja",
  compra_fornecedor: "Compra",
  garantia: "Garantia",
  servico_interno: "S. Interno",
};

interface OrdemOption {
  id: number;
  numero_ordem: string | null;
  status: string | null;
  tipo_ordem?: string | null;
}

/**
 * REGRA DE NEGÓCIO: interface para baixa de ouro pendente de protocolo (sangria).
 * Lista apenas baixas com status "esperando_protocolo" do destino correto.
 */
interface BaixaSangriaOption {
  id: number;
  gramas: number;
  destino: string;
  status: string;
  realizado_nome: string | null;
  created_at: string;
  obs: string | null;
}

/**
 * REGRA DE NEGÓCIO: item de uma transferência de estoque — produto do estoque
 * comercial disponível no local de ORIGEM, com a quantidade que vai viajar.
 */
interface ProdutoEstoqueOption {
  produto_id: number;
  sku: string | null;
  nome_produto: string | null;
  disponivel: number;
}

interface LocalOption {
  id: number;
  nome: string;
  ativo?: boolean;
  parent_local_id?: number | null;
}

interface TransportadorOption {
  id: string;
  nome: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  direcao: "ida" | "volta";
  tipoProtocolo: string;
  onSuccess?: () => void;
  /**
   * REGRA DE NEGÓCIO: modo sangria lista baixas de ouro pendentes do destino,
   * modo ordens lista ordens de produção (comportamento atual), modo
   * transferencia move produto do estoque comercial entre dois locais.
   */
  modo?: "ordens" | "sangria" | "transferencia";
}

export default function NovaProtocoloModal({ isOpen, onClose, direcao, tipoProtocolo, onSuccess, modo = "ordens" }: Props) {
  const [ordens, setOrdens] = useState<OrdemOption[]>([]);
  const [baixasSangria, setBaixasSangria] = useState<BaixaSangriaOption[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedBaixaId, setSelectedBaixaId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingItens, setLoadingItens] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // ─── Transferência de estoque ──────────────────────────────────────────────
  const [locais, setLocais] = useState<LocalOption[]>([]);
  const [transportadores, setTransportadores] = useState<TransportadorOption[]>([]);
  const [localOrigemId, setLocalOrigemId] = useState<number | "">("");
  const [localDestinoId, setLocalDestinoId] = useState<number | "">("");
  const [motoboyId, setMotoboyId] = useState<string>("");
  const [produtos, setProdutos] = useState<ProdutoEstoqueOption[]>([]);
  const [itens, setItens] = useState<Record<number, number>>({}); // produto_id -> quantidade

  /**
   * REGRA DE NEGÓCIO: modo sangria carrega baixas de ouro esperando protocolo,
   * filtradas pelo destino (fabrica/service). Uma baixa por protocolo.
   * Modo ordens carrega ordens de produção (comportamento atual).
   */
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setSelectedBaixaId(null);
    setSearch("");
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setOrdens([]);
    setBaixasSangria([]);
    setLoadingItens(true);

    if (modo === "transferencia") {
      setLocalOrigemId("");
      setLocalDestinoId("");
      setMotoboyId("");
      setProdutos([]);
      setItens({});
      /**
       * REGRA DE NEGÓCIO: os locais elegíveis saem do MESMO filtro que o backend
       * usa para validar (`localElegivelTransferencia`) — a tela nunca oferece um
       * local que a API vai recusar. "Em Trânsito" e seus sub-locais ficam de fora:
       * trânsito é a própria transferência pendente, não um local com saldo.
       */
      Promise.all([
        fetch("/api/locais-estoque").then((r) => r.json()).catch(() => []),
        fetch("/api/usuarios/transportadores").then((r) => r.json()).catch(() => []),
      ])
        .then(([locaisData, transpData]) => {
          setLocais((Array.isArray(locaisData) ? locaisData : []).filter(localElegivelTransferencia));
          setTransportadores(Array.isArray(transpData) ? transpData : []);
        })
        .finally(() => setLoadingItens(false));
    } else if (modo === "sangria") {
      // Carregar baixas pendentes de protocolo do destino específico
      const destino = tipoProtocolo; // "fabrica" ou "service"
      fetch(`/api/financeiro/cofre-ouro/baixas?status=esperando_protocolo&destino=${destino}`)
        .then((r) => r.json())
        .then((data) => setBaixasSangria(Array.isArray(data) ? data : []))
        .catch(() => setBaixasSangria([]))
        .finally(() => setLoadingItens(false));
    } else {
      fetch(`/api/protocolo/ordens?direcao=${direcao}&tipo_protocolo=${tipoProtocolo}`)
        .then((r) => r.json())
        .then((data) => setOrdens(Array.isArray(data) ? data : []))
        .catch(() => setOrdens([]))
        .finally(() => setLoadingItens(false));
    }
  }, [isOpen, direcao, tipoProtocolo, modo]);

  /**
   * REGRA DE NEGÓCIO: a lista de peças vem SEMPRE do local de origem escolhido —
   * só se transfere o que está disponível lá. Trocar a origem zera os itens já
   * marcados, senão sobraria peça de um local que não é mais o de partida.
   * IMPACTO SE REMOVIDO: dá para montar um protocolo com peça que não existe na
   * origem, e a API recusa só no fim, depois do trabalho todo.
   */
  useEffect(() => {
    if (!isOpen || modo !== "transferencia") return;
    setItens({});
    setProdutos([]);
    if (!localOrigemId) return;
    fetch(`/api/estoque-comercial?local_estoque_id=${localOrigemId}&consolidado=false`)
      .then((r) => r.json())
      .then((data) => {
        const lista: ProdutoEstoqueOption[] = (Array.isArray(data) ? data : [])
          .filter((p: { disponivel?: number }) => Number(p.disponivel ?? 0) > 0);
        setProdutos(lista);
      })
      .catch(() => setProdutos([]));
  }, [isOpen, modo, localOrigemId]);

  const filteredProdutos = produtos.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.sku ?? "").toLowerCase().includes(q) || (p.nome_produto ?? "").toLowerCase().includes(q);
  });

  const totalPecas = Object.values(itens).reduce((acc, q) => acc + q, 0);

  function setQuantidadeItem(produtoId: number, quantidade: number, disponivel: number) {
    setItens((prev) => {
      const next = { ...prev };
      const qtd = Math.max(0, Math.min(quantidade, disponivel));
      if (qtd === 0) delete next[produtoId];
      else next[produtoId] = qtd;
      return next;
    });
  }

  const filteredOrdens = ordens.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.numero_ordem ?? "").toLowerCase().includes(q) ||
      (o.status ?? "").toLowerCase().includes(q)
    );
  });

  const filteredBaixas = baixasSangria.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(b.id).includes(q) ||
      (b.realizado_nome ?? "").toLowerCase().includes(q) ||
      (b.obs ?? "").toLowerCase().includes(q)
    );
  });

  function toggleOrdem(id: number) {
    if (modo === "sangria") return; // sangria usa selectedBaixaId, não Set
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBaixa(id: number) {
    setSelectedBaixaId((prev) => (prev === id ? null : id));
  }

  /**
   * REGRA DE NEGÓCIO: solicitação de transferência NÃO pede foto — quem solicita
   * ainda não pegou a peça em mãos; ela continua na prateleira do local de origem.
   * A foto acontece nos dois momentos em que a peça troca de mão: coleta (motoboy)
   * e chegada (quem recebe).
   * IMPACTO SE ALTERADO: exigir foto aqui trava a solicitação de quem está no
   * balcão pedindo a peça que está no depósito.
   */
  async function handleSubmitTransferencia() {
    setError("");
    if (!localOrigemId || !localDestinoId) { setError("Escolha o local de origem e o de destino."); return; }
    if (localOrigemId === localDestinoId) { setError("Origem e destino devem ser diferentes."); return; }
    if (totalPecas === 0) { setError("Selecione ao menos uma peça."); return; }
    setLoading(true);

    try {
      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_protocolo: "transferencia",
          local_origem_id: localOrigemId,
          local_destino_id: localDestinoId,
          motoboy_id: motoboyId || undefined,
          itens: Object.entries(itens).map(([produto_id, quantidade]) => ({
            produto_id: Number(produto_id),
            quantidade,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar transferência");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setError("");

    if (modo === "transferencia") return handleSubmitTransferencia();

    if (modo === "sangria") {
      if (!selectedBaixaId) { setError("Selecione uma baixa."); return; }
    } else {
      if (selected.size === 0) { setError("Selecione ao menos uma ordem."); return; }
    }

    if (!fotoFile) { setError("Foto das joias é obrigatória."); return; }
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const fotoPath = `criacao/${user?.id ?? "anon"}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(`Upload foto: ${uploadErr.message}`);

      /**
       * REGRA DE NEGÓCIO: sangria envia baixa_id em vez de ordem_ids.
       * O backend vincula a baixa ao protocolo e transita status → em_trafego.
       */
      const body = modo === "sangria"
        ? {
            direcao,
            baixa_id: selectedBaixaId,
            motoboy_id: user?.id,
            foto_criacao: fotoPath,
            user_id: user?.id,
            tipo_protocolo: tipoProtocolo,
          }
        : {
            direcao,
            ordem_ids: Array.from(selected),
            motoboy_id: user?.id,
            foto_criacao: fotoPath,
            user_id: user?.id,
            tipo_protocolo: tipoProtocolo,
          };

      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar protocolo");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const isService = tipoProtocolo === "service";
  const isSangria = modo === "sangria";
  const isTransferencia = modo === "transferencia";
  const titulo = isTransferencia
    ? "Nova transferência de estoque"
    : direcao === "ida"
      ? `Novo Protocolo Ida${isSangria ? " — Sangria" : ""}`
      : `Novo Protocolo Volta${isSangria ? " — Sangria" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header com badge de tipo + modo */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>{titulo}</h3>
              {!isTransferencia && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    backgroundColor: isService ? "#FEF3C7" : "#F3F4F6",
                    color: isService ? "#B45309" : "#6B7280",
                  }}
                >
                  {isService ? "🔧 Service" : "🏭 Fábrica"}
                </span>
              )}
              {isSangria && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
                  🧪 Sangria
                </span>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {isTransferencia
                ? `${totalPecas} peça${totalPecas !== 1 ? "s" : ""} · ${Object.keys(itens).length} SKU${Object.keys(itens).length !== 1 ? "s" : ""}`
                : isSangria
                  ? (selectedBaixaId ? "1 baixa selecionada" : "Selecione uma baixa")
                  : `${selected.size} ordem${selected.size !== 1 ? "s" : ""} selecionada${selected.size !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Trajeto (só transferência): origem, destino e transporte */}
        {isTransferencia && (
          <div className="px-6 pt-4 pb-1 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "#6B7280" }}>Origem</label>
              <select
                value={localOrigemId}
                onChange={(e) => setLocalOrigemId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2.5 md:py-2 rounded-lg border text-base md:text-sm focus:outline-none bg-white"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">Escolher...</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "#6B7280" }}>Destino</label>
              <select
                value={localDestinoId}
                onChange={(e) => setLocalDestinoId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2.5 md:py-2 rounded-lg border text-base md:text-sm focus:outline-none bg-white"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">Escolher...</option>
                {locais.filter((l) => l.id !== localOrigemId).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div>
              {/*
                REGRA DE NEGÓCIO: transporte é OPCIONAL. Quando origem e destino
                ficam no mesmo prédio (hoje Reposição ↔ Loja), não há motoboy: a
                peça sai e entra no mesmo ato, na confirmação de chegada. Escolher
                um motoboy acrescenta o passo da coleta, com foto.
              */}
              <label className="block text-[11px] font-medium mb-1" style={{ color: "#6B7280" }}>Transporte</label>
              <select
                value={motoboyId}
                onChange={(e) => setMotoboyId(e.target.value)}
                className="w-full px-3 py-2.5 md:py-2 rounded-lg border text-base md:text-sm focus:outline-none bg-white"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">Sem motoboy (mesmo prédio)</option>
                {transportadores.map((t) => <option key={t.id} value={t.id}>{t.nome ?? "Sem nome"}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
            <input
              type="text"
              placeholder={isTransferencia ? "Buscar por SKU ou nome..." : isSangria ? "Buscar baixa..." : "Buscar ordem..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-3 md:py-2 rounded-lg border text-base md:text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>
        </div>

        {/* Lista: Transferência (produtos), Sangria (baixas) ou Ordens */}
        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {loadingItens ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: "#9CA3AF" }} />
            </div>
          ) : isTransferencia ? (
            // ─── Lista de peças disponíveis na origem ──────────────────────────
            !localOrigemId ? (
              <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
                Escolha o local de origem para ver as peças disponíveis
              </p>
            ) : filteredProdutos.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
                Nenhuma peça disponível neste local
              </p>
            ) : (
              <div className="space-y-1">
                {filteredProdutos.map((p) => {
                  const qtd = itens[p.produto_id] ?? 0;
                  const marcado = qtd > 0;
                  return (
                    <div
                      key={p.produto_id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{
                        backgroundColor: marcado ? "#18403612" : "transparent",
                        border: `1px solid ${marcado ? C.esmeralda + "40" : C.cremeBorder}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>{p.sku ?? `#${p.produto_id}`}</p>
                        <p className="text-[11px] truncate" style={{ color: "#9CA3AF" }}>
                          {p.nome_produto ?? "Sem nome"} · {p.disponivel} disponível{p.disponivel !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setQuantidadeItem(p.produto_id, qtd - 1, p.disponivel)}
                          className="w-8 h-8 rounded-lg border flex items-center justify-center text-base"
                          style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                          aria-label={`Diminuir ${p.sku ?? p.produto_id}`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={p.disponivel}
                          value={qtd}
                          onChange={(e) => setQuantidadeItem(p.produto_id, Number(e.target.value), p.disponivel)}
                          className="w-14 text-center px-1 py-1.5 rounded-lg border text-sm focus:outline-none"
                          style={{ borderColor: C.cremeBorder }}
                        />
                        <button
                          type="button"
                          onClick={() => setQuantidadeItem(p.produto_id, qtd + 1, p.disponivel)}
                          className="w-8 h-8 rounded-lg border flex items-center justify-center text-base"
                          style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                          aria-label={`Aumentar ${p.sku ?? p.produto_id}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : isSangria ? (
            // ─── Lista de Baixas (Sangria) ─────────────────────────────────────
            filteredBaixas.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
                Nenhuma baixa pendente de protocolo para {tipoProtocolo === "service" ? "Service" : "Fábrica"}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredBaixas.map((b) => {
                  const isSelected = selectedBaixaId === b.id;
                  const st = STATUS_COLORS[b.status] ?? { bg: "#FEF3C7", text: "#92400E" };
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleBaixa(b.id)}
                      className="w-full flex items-center gap-3 px-3 py-3.5 md:py-2.5 rounded-lg text-left transition-colors active:scale-[0.98]"
                      style={{
                        backgroundColor: isSelected ? "#18403612" : "transparent",
                        border: `1px solid ${isSelected ? C.esmeralda + "40" : C.cremeBorder}`,
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors"
                        style={{
                          backgroundColor: isSelected ? C.esmeralda : "#fff",
                          borderColor: isSelected ? C.esmeralda : "#D1D5DB",
                        }}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F3EADA" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>
                          Baixa Ouro #{b.id} · {Number(b.gramas).toFixed(3)}g
                        </p>
                        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                          {b.realizado_nome ?? "—"} · {new Date(b.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ backgroundColor: st.bg, color: st.text }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            // ─── Lista de Ordens (comportamento atual) ──────────────────────────
            filteredOrdens.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma ordem encontrada</p>
            ) : (
              <div className="space-y-1">
                {filteredOrdens.map((o) => {
                  const isSelected = selected.has(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggleOrdem(o.id)}
                      className="w-full flex items-center gap-3 px-3 py-3.5 md:py-2.5 rounded-lg text-left transition-colors active:scale-[0.98]"
                      style={{
                        backgroundColor: isSelected ? "#18403612" : "transparent",
                        border: `1px solid ${isSelected ? C.esmeralda + "40" : C.cremeBorder}`,
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors"
                        style={{
                          backgroundColor: isSelected ? C.esmeralda : "#fff",
                          borderColor: isSelected ? C.esmeralda : "#D1D5DB",
                        }}
                      >
                        {isSelected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 5.5L8 1" stroke="#F3EADA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>
                          {o.numero_ordem ?? `Ordem #${o.id}`}
                        </p>
                        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                          {o.tipo_ordem ? (TIPO_LABEL[o.tipo_ordem] ?? o.tipo_ordem) : (o.status ?? "—")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/*
          Foto obrigatória — só nos protocolos em que quem cria está com a peça
          na mão. Na SOLICITAÇÃO de transferência a peça continua na prateleira
          da origem; a foto acontece na coleta e na chegada.
        */}
        <div className={`px-6 pb-3 shrink-0${isTransferencia ? " hidden" : ""}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
            Foto das Joias <span style={{ color: "#DC2626" }}>*</span>
          </p>
          {fotoPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoPreview} alt="Foto" className="w-full max-h-36 object-cover rounded-xl" />
              <button
                onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
              >
                <RotateCcw size={13} color="white" />
              </button>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
              style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
            >
              <Camera size={22} style={{ color: "#9CA3AF" }} />
              <span className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)); }
                }}
              />
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />{isTransferencia ? "Transferência solicitada! As peças estão reservadas na origem." : "Protocolo criado!"}
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center"
              style={{ color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                loading || success ||
                (isTransferencia
                  ? (!localOrigemId || !localDestinoId || totalPecas === 0)
                  : ((isSangria ? !selectedBaixaId : selected.size === 0) || !fotoFile))
              }
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: C.esmeralda, color: C.creme, minHeight: 44 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />Criando...</>
                : isTransferencia
                  ? `Solicitar transferência (${totalPecas})`
                  : isSangria
                    ? `Criar Protocolo Sangria${selectedBaixaId ? ` (Baixa #${selectedBaixaId})` : ""}`
                    : `Criar Protocolo (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
