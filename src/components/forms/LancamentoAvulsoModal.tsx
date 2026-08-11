"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

type TipoLancamento = "entrada" | "saida" | "transferencia" | "sangria";

interface Insumo   { id: number; nome: string; sku?: string; categoria_id?: number; peso_pedra?: number | null; peso_pedra_ct?: number | null; }
interface Deposito  { id: number; nome: string; }
interface Categoria { categoria_id: number; categoria_nome: string; }

const TIPO_OPTIONS: { value: TipoLancamento; label: string; desc: string }[] = [
  { value: "entrada",       label: "Entrada Avulsa",       desc: "Entrada de material no depósito selecionado" },
  { value: "saida",         label: "Saída Avulsa",         desc: "Saída de material do depósito selecionado" },
  { value: "transferencia", label: "Transferência Avulsa", desc: "Move material entre depósitos" },
  { value: "sangria",       label: "Sangria",              desc: "Recolhimento de material para o Almoxarifado" },
];

function getInfoBox(tipo: TipoLancamento, deposito: Deposito | null, depositoDestino: Deposito | null) {
  const almox = "Almoxarifado Central";
  const dep   = deposito?.nome ?? "Depósito";
  const dest  = depositoDestino?.nome ?? almox;
  switch (tipo) {
    case "entrada":       return { from: "Externo",  to: dep,   color: "#059669" };
    case "saida":         return { from: dep,        to: "Externo", color: "#DC2626" };
    case "transferencia": return { from: dep,        to: dest,  color: "#2563EB" };
    case "sangria":       return { from: "Produção", to: almox, color: "#D97706" };
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LancamentoAvulsoModal({ isOpen, onClose, onSuccess }: Props) {
  const [tipo, setTipo]             = useState<TipoLancamento>("entrada");
  const [depositoId, setDepositoId] = useState("");
  const [depositoDestinoId, setDepositoDestinoId] = useState("");
  const [peso, setPeso]             = useState("");
  const [pesoCT, setPesoCT]         = useState("");
  const [obs, setObs]           = useState("");

  // Categoria + insumo com autocomplete
  const [categoriaId, setCategoriaId]             = useState<number | null>(null);
  const [categorias, setCategorias]               = useState<Categoria[]>([]);
  const [insumos, setInsumos]                     = useState<Insumo[]>([]);
  const [insumoId, setInsumoId]                   = useState<number | null>(null);
  const [insumoSelecionado, setInsumoSelecionado] = useState<Insumo | null>(null);
  const [buscaInsumo, setBuscaInsumo]             = useState("");
  const [mostrarDropdown, setMostrarDropdown]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [qtdCalculada, setQtdCalculada] = useState<number | null>(null);

  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [locaisEstoque, setLocaisEstoque] = useState<{id: number; nome: string}[]>([]);
  const [localEstoqueId, setLocalEstoqueId] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  // Carregar categorias + depósitos ao abrir
  useEffect(() => {
    if (!isOpen) return;
    setTipo("entrada");
    setCategoriaId(null);
    setInsumos([]);
    setInsumoId(null);
    setInsumoSelecionado(null);
    setBuscaInsumo("");
    setMostrarDropdown(false);
    setDepositoId("");
    setDepositoDestinoId("");
    setPeso("");
    setPesoCT("");
    setQtdCalculada(null);
    setObs("");
    setError("");
    setSuccess(false);

    Promise.all([
      fetch("/api/insumos/categorias").then((r) => r.json()),
      fetch("/api/depositos").then((r) => r.json()),
      fetch("/api/locais-estoque", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([cats, deps, locs]) => {
      setCategorias((cats as Categoria[]) ?? []);
      setDepositos((deps as Deposito[]) ?? []);
      setLocaisEstoque(Array.isArray(locs) ? locs : []);
      setLocalEstoqueId(1);
      if (deps?.length) {
        setDepositoId(String(deps[0].id));
        const almox = (deps as Deposito[]).find((d) => d.id === 1);
        setDepositoDestinoId(String(almox?.id ?? deps[0].id));
      }
    });
  }, [isOpen]);

  // Carregar insumos quando categoria muda
  useEffect(() => {
    if (!categoriaId) { setInsumos([]); return; }
    fetch(`/api/pcp/insumos?categoria_id=${categoriaId}`)
      .then((r) => r.json())
      .then((data: Insumo[]) => setInsumos(data ?? []));
  }, [categoriaId]);

  const selectedDeposito        = depositos.find((d) => d.id === Number(depositoId)) ?? null;
  const selectedDepositoDestino = depositos.find((d) => d.id === Number(depositoDestinoId)) ?? null;
  const isSangria               = tipo === "sangria";
  const isTransferencia         = tipo === "transferencia";
  const info                    = getInfoBox(tipo, selectedDeposito, selectedDepositoDestino);
  const showDeposito            = !isSangria;

  const insumosFiltrados = insumos.filter((i) => {
    const q = buscaInsumo.toLowerCase();
    return i.nome.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q);
  });

  function selecionarInsumo(ins: Insumo) {
    setInsumoId(ins.id);
    setInsumoSelecionado(ins);
    setBuscaInsumo(ins.nome);
    setMostrarDropdown(false);
    setPeso("");
    setPesoCT("");
    setQtdCalculada(null);
    setError("");
  }

  function handleCategoriaChange(id: number | null) {
    setCategoriaId(id);
    setInsumoId(null);
    setInsumoSelecionado(null);
    setBuscaInsumo("");
    setMostrarDropdown(false);
    setPeso("");
    setPesoCT("");
    setQtdCalculada(null);
  }

  const isPedra    = categoriaId === 2;
  const ctUnitario = insumoSelecionado?.peso_pedra_ct ?? null;

  function handlePesoCTChange(v: string) {
    setPesoCT(v);
    setError("");
    const ct = parseFloat(v);
    if (!isNaN(ct) && ct > 0 && ctUnitario && ctUnitario > 0) {
      const qtd = Math.round(ct / ctUnitario);
      const g   = Number((ct * 0.2).toFixed(3));
      setQtdCalculada(qtd);
      setPeso(String(g));
    } else {
      setQtdCalculada(null);
      setPeso(!isNaN(ct) && ct > 0 ? (ct * 0.2).toFixed(3) : "");
    }
  }

  async function handleSubmit() {
    setError("");
    const pesoNum = parseFloat(peso);
    if (!insumoId)                           { setError("Selecione o insumo.");         return; }
    if (isNaN(pesoNum) || pesoNum <= 0)      { setError("Informe o peso/quantidade.");  return; }
    if (!isSangria && !depositoId)           { setError("Selecione o depósito.");       return; }
    if (isTransferencia && !depositoDestinoId) { setError("Selecione o depósito de destino."); return; }
    if (isTransferencia && depositoId === depositoDestinoId) {
      setError("Origem e destino não podem ser iguais.");
      return;
    }

    setLoading(true);
    const body: Record<string, unknown> = {
      tipo_lancamento: tipo,
      insumo_id:       insumoId,
      peso:            pesoNum,
      obs:             obs || null,
      local_estoque_id: localEstoqueId,
    };
    if (!isSangria) body.deposito_id = Number(depositoId);
    if (isTransferencia) body.deposito_destino_id = Number(depositoDestinoId);

    const res = await fetch("/api/lancamentos-avulso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro ao registrar lançamento"); return; }
    setSuccess(true);
    setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
  }

  function handleClose() {
    if (loading) return;
    setError(""); setSuccess(false);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      {/* Modal — max-h 92vh mobile / 90vh desktop com scroll no corpo */}
      <div
        className="bg-white w-full max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixo */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Lançamento Avulso</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Movimentação manual de estoque</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Tipo de Lançamento
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TIPO_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setTipo(t.value); setError(""); }}
                  className="text-left px-3 py-2.5 rounded-lg border text-sm transition-all"
                  style={{
                    borderColor:     tipo === t.value ? C.esmeralda : C.cremeBorder,
                    backgroundColor: tipo === t.value ? "#18403610"  : "#fff",
                    color:           tipo === t.value ? C.esmeralda  : "#374151",
                  }}
                >
                  <p className="font-semibold text-[12px]">{t.label}</p>
                  <p className="text-[10px] mt-0.5 opacity-70">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Info Box — direção */}
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2.5"
            style={{ backgroundColor: info.color + "12", border: `1px solid ${info.color}30` }}
          >
            <span className="text-[12px] font-semibold" style={{ color: info.color }}>{info.from}</span>
            <ArrowRight size={13} style={{ color: info.color }} />
            <span className="text-[12px] font-semibold" style={{ color: info.color }}>{info.to}</span>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Categoria
            </label>
            <select
              value={categoriaId ?? ""}
              onChange={(e) => handleCategoriaChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            >
              <option value="">— Selecione uma categoria —</option>
              {categorias.map((c) => (
                <option key={c.categoria_id} value={c.categoria_id}>{c.categoria_nome}</option>
              ))}
            </select>
          </div>

          {/* Insumo — autocomplete */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Insumo
            </label>
            <div className="relative" ref={dropdownRef}>
              <input
                type="text"
                value={buscaInsumo}
                onChange={(e) => {
                  setBuscaInsumo(e.target.value);
                  setInsumoId(null);
                  setMostrarDropdown(true);
                  setError("");
                }}
                onFocus={() => { if (categoriaId) setMostrarDropdown(true); }}
                onBlur={() => setTimeout(() => setMostrarDropdown(false), 150)}
                disabled={!categoriaId}
                placeholder={categoriaId ? "Buscar por nome ou SKU..." : "Selecione uma categoria primeiro"}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{
                  borderColor: C.cremeBorder,
                  backgroundColor: !categoriaId ? C.cremeBg : "#fff",
                  color: !categoriaId ? "#9CA3AF" : "#111827",
                }}
              />
              {mostrarDropdown && insumosFiltrados.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: C.cremeBorder }}>
                  {insumosFiltrados.map((ins) => (
                    <div
                      key={ins.id}
                      onMouseDown={() => selecionarInsumo(ins)}
                      className="px-3 py-2 cursor-pointer hover:bg-amber-50 text-sm"
                    >
                      <span className="font-medium" style={{ color: C.esmeralda }}>{ins.nome}</span>
                      {ins.sku && (
                        <span className="ml-2 text-[11px]" style={{ color: "#9CA3AF" }}>{ins.sku}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {mostrarDropdown && buscaInsumo.length > 0 && insumosFiltrados.length === 0 && categoriaId && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg px-3 py-2 text-sm" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
                  Nenhum insumo encontrado
                </div>
              )}
            </div>
          </div>

          {/* Depósito */}
          {showDeposito && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                {isTransferencia ? "Depósito de Origem" : "Depósito"}
              </label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              >
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Depósito Destino — apenas para transferência */}
          {isTransferencia && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Depósito de Destino
              </label>
              <select
                value={depositoDestinoId}
                onChange={(e) => setDepositoDestinoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              >
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sangria: depósito fixo */}
          {isSangria && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Depósito Destino
              </label>
              <div className="px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, color: "#6B7280" }}>
                Almoxarifado Central (fixo)
              </div>
            </div>
          )}

          {/* Local de Estoque */}
          {locaisEstoque.length > 1 && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Local de Estoque
              </label>
              <select
                value={localEstoqueId}
                onChange={(e) => setLocalEstoqueId(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              >
                {locaisEstoque.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Peso — condicional: ct+calc para Pedra, g direto para Metal/outros */}
          {isPedra ? (
            <div className="space-y-3">
              {/* Aviso se insumo sem ct cadastrado */}
              {insumoSelecionado && !ctUnitario && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12px]"
                  style={{ backgroundColor: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E" }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>Peso unitário em ct não cadastrado para este insumo. Cadastre em <strong>Insumos</strong> primeiro.</span>
                </div>
              )}

              {/* Campo ct */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Peso total (ct) <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={pesoCT}
                    onChange={(e) => handlePesoCTChange(e.target.value)}
                    placeholder="0.000"
                    disabled={!insumoSelecionado}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none pr-12 disabled:opacity-50"
                    style={{ borderColor: C.cremeBorder }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold" style={{ color: "#9CA3AF" }}>ct</span>
                </div>
              </div>

              {/* Card de cálculo automático */}
              {pesoCT && parseFloat(pesoCT) > 0 && (
                <div className="rounded-lg border px-4 py-3 space-y-1.5 text-[12px]"
                  style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                    Cálculo automático
                  </p>
                  <div className="flex justify-between">
                    <span style={{ color: "#6B7280" }}>Ct unitário (cadastro):</span>
                    <span className="font-semibold" style={{ color: "#374151" }}>
                      {ctUnitario ? `${ctUnitario}ct` : <span style={{ color: "#D97706" }}>não cadastrado</span>}
                    </span>
                  </div>
                  {ctUnitario && qtdCalculada !== null && (
                    <>
                      <div className="flex justify-between">
                        <span style={{ color: "#6B7280" }}>Quantidade:</span>
                        <span className="font-bold text-[14px]" style={{ color: C.esmeralda }}>
                          {qtdCalculada} pedras
                        </span>
                      </div>
                      {Math.abs(parseFloat(pesoCT) / ctUnitario - qtdCalculada) > 0.01 && (
                        <div className="flex items-center gap-1.5 mt-1 pt-1.5 border-t" style={{ borderColor: C.cremeBorder }}>
                          <AlertCircle size={11} style={{ color: "#D97706" }} />
                          <span style={{ color: "#92400E" }}>
                            Resultado exato: {(parseFloat(pesoCT) / ctUnitario).toFixed(2)} — arredondado para {qtdCalculada}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
                    <span style={{ color: "#6B7280" }}>Peso total:</span>
                    <span className="font-semibold" style={{ color: "#374151" }}>
                      {peso ? `${peso}g` : "—"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                Peso / Quantidade
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={peso}
                onChange={(e) => { setPeso(e.target.value); setError(""); }}
                placeholder="0.000"
                className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
          )}

          {/* Obs */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Observação (opcional)
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Motivo ou detalhe do lançamento..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Lançamento registrado!
            </div>
          )}
        </div>

        {/* Footer fixo */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-shrink-0" style={{ borderColor: C.cremeBorder }}>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success || (isPedra && !!insumoSelecionado && !ctUnitario)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" />Registrando...</> : "Registrar Lançamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
