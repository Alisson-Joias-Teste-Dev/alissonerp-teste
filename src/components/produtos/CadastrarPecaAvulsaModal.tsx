"use client";

/**
 * Modal de cadastro de Peça Avulsa — uma pedra única (diferente de
 * /precificacao > Markup Pedras que cadastra dezenas de tamanhos em lote).
 *
 * Fórmula: preco_venda = peso_ct × custo_usd_ct × dolar × markup
 * Dólar vem de public.parametros (read-only no form, exibido informativo).
 *
 * Backend: POST /api/produtos/peca-avulsa
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Check, Sparkles, AlertTriangle } from "lucide-react";
import { STONE_TYPES } from "@/app/(dashboard)/orcamento/constants";

interface Props {
  onClose: () => void;
  onSuccess: (info: { id_produto: number; sku: string; nome: string; preco_venda: number; criado: boolean }) => void;
}

const C = {
  esmeralda: "#184036",
  dourado: "#D4A843",
  roxo: "#7C3AED",
  bg: "#FAFAF7",
  cremeBorder: "#E8DCC8",
};

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors";
const labelCls =
  "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1";

const MARKUP_STORAGE_KEY = "peca_avulsa_last_markup";

function parseDecimal(s: string): number {
  if (!s) return NaN;
  const t = s.trim().replace(",", ".");
  return Number(t);
}

function fmtBRL(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtBRLInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CadastrarPecaAvulsaModal({ onClose, onSuccess }: Props) {
  // Setup
  const [dolar, setDolar] = useState<number | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Form
  const [tipoPedra, setTipoPedra] = useState<string>(STONE_TYPES[0]?.value ?? "");
  const [descricao, setDescricao] = useState("");
  const [pesoCtRaw, setPesoCtRaw] = useState("");
  const [custoUsdCtRaw, setCustoUsdCtRaw] = useState("");
  const [markupRaw, setMarkupRaw] = useState(() => {
    if (typeof window !== "undefined") {
      const last = window.localStorage.getItem(MARKUP_STORAGE_KEY);
      if (last) return last;
    }
    return "3,5";
  });
  const [criarEstoque, setCriarEstoque] = useState(true);

  // UX
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [sucesso, setSucesso] = useState<{
    id_produto: number;
    sku: string;
    nome: string;
    preco_venda: number;
    criado: boolean;
  } | null>(null);

  const descricaoRef = useRef<HTMLInputElement | null>(null);

  // Carrega cotação
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/produtos/setup");
        if (!res.ok) {
          const b = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(b.error ?? "Falha ao carregar cotação");
        }
        const data = await res.json() as { cotacao?: { dollar?: number } };
        const d = Number(data?.cotacao?.dollar ?? 0);
        if (!cancelado) {
          if (!Number.isFinite(d) || d <= 0) {
            setSetupError("Dólar não cadastrado em public.parametros");
          } else {
            setDolar(d);
          }
        }
      } catch (err) {
        if (!cancelado) {
          setSetupError(err instanceof Error ? err.message : "Erro ao carregar cotação");
        }
      } finally {
        if (!cancelado) setSetupLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  // Foco inicial no campo descrição quando setup acabar
  useEffect(() => {
    if (!setupLoading && !setupError) {
      descricaoRef.current?.focus();
    }
  }, [setupLoading, setupError]);

  // Cálculo ao vivo
  const peso = useMemo(() => parseDecimal(pesoCtRaw), [pesoCtRaw]);
  const custo = useMemo(() => parseDecimal(custoUsdCtRaw), [custoUsdCtRaw]);
  const markup = useMemo(() => parseDecimal(markupRaw), [markupRaw]);

  const precoCalc = useMemo(() => {
    if (!dolar) return NaN;
    if (!Number.isFinite(peso) || peso <= 0) return NaN;
    if (!Number.isFinite(custo) || custo <= 0) return NaN;
    if (!Number.isFinite(markup) || markup <= 0) return NaN;
    return peso * custo * dolar * markup;
  }, [peso, custo, markup, dolar]);

  const valid =
    !!dolar &&
    descricao.trim().length >= 3 &&
    Number.isFinite(peso) && peso > 0 &&
    Number.isFinite(custo) && custo > 0 &&
    Number.isFinite(markup) && markup > 0 &&
    !!tipoPedra;

  function showToast(tipo: "ok" | "erro", msg: string, ms = 4000) {
    setToast({ tipo, msg });
    window.setTimeout(() => setToast(null), ms);
  }

  async function handleSubmit() {
    if (!valid || saving || !dolar) return;
    setSaving(true);
    try {
      const res = await fetch("/api/produtos/peca-avulsa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_pedra: tipoPedra,
          descricao: descricao.trim(),
          peso_ct: peso,
          custo_usd_ct: custo,
          markup,
          criar_estoque: criarEstoque,
        }),
      });
      const body = await res.json().catch(() => ({})) as {
        ok?: boolean;
        id_produto?: number;
        sku?: string;
        nome?: string;
        preco_venda?: number;
        criado?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Falha ao cadastrar peça avulsa");
      }

      try {
        window.localStorage.setItem(MARKUP_STORAGE_KEY, markupRaw);
      } catch { /* localStorage indisponível, ignora */ }

      const info = {
        id_produto: Number(body.id_produto),
        sku: String(body.sku ?? ""),
        nome: String(body.nome ?? descricao.trim()),
        preco_venda: Number(body.preco_venda ?? precoCalc ?? 0),
        criado: Boolean(body.criado),
      };
      setSucesso(info);
      onSuccess(info);
    } catch (err) {
      showToast("erro", err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setSaving(false);
    }
  }

  function cadastrarOutra() {
    // Mantém tipo, markup, custo, estoque flag. Zera descrição + peso.
    setDescricao("");
    setPesoCtRaw("");
    setSucesso(null);
    window.setTimeout(() => descricaoRef.current?.focus(), 50);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col border"
        style={{ borderColor: C.cremeBorder }}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between border-b"
          style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: C.roxo }} />
            <h2 className="text-base font-semibold" style={{ color: C.esmeralda }}>
              Cadastrar Peça Avulsa
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Estado: erro de setup */}
          {setupError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Cadastro indisponível</div>
                <div className="text-xs mt-0.5">{setupError}. Cadastre o dólar em <code>public.parametros</code> antes de continuar.</div>
              </div>
            </div>
          )}

          {/* Estado: sucesso */}
          {sucesso && (
            <div className="flex flex-col gap-3 px-4 py-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
              <div className="flex items-start gap-2">
                <Check size={18} className="mt-0.5 shrink-0 text-emerald-700" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">
                    {sucesso.criado ? "Peça avulsa cadastrada" : "Peça avulsa já existia — atualizada"}
                  </div>
                  <div className="text-xs mt-1 space-y-0.5">
                    <div><span className="text-emerald-700/70">SKU:</span> <span className="font-mono">{sucesso.sku}</span></div>
                    <div><span className="text-emerald-700/70">Nome:</span> {sucesso.nome}</div>
                    <div><span className="text-emerald-700/70">Preço de venda:</span> <span className="font-semibold">{fmtBRLInt(sucesso.preco_venda)}</span></div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold border bg-white hover:bg-gray-50 transition-colors"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                >
                  Fechar
                </button>
                <button
                  onClick={cadastrarOutra}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: C.esmeralda }}
                >
                  Cadastrar outra
                </button>
              </div>
            </div>
          )}

          {!sucesso && (
            <>
              {/* Card de contexto */}
              <div
                className="grid grid-cols-2 gap-3 px-3 py-2.5 rounded-lg border text-xs"
                style={{ backgroundColor: C.bg, borderColor: C.cremeBorder }}
              >
                <div>
                  <div className="text-gray-500 uppercase tracking-widest text-[9px] font-bold">💵 Dólar hoje</div>
                  <div className="font-semibold text-sm mt-0.5" style={{ color: C.esmeralda }}>
                    {setupLoading ? "Carregando…" : dolar ? fmtBRL(dolar) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 uppercase tracking-widest text-[9px] font-bold">🏷️ Categoria</div>
                  <div className="font-semibold text-sm mt-0.5" style={{ color: C.esmeralda }}>Pedras</div>
                </div>
              </div>

              {/* Identificação */}
              <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Identificação
                </h3>
                <div>
                  <label className={labelCls}>Tipo de pedra *</label>
                  <select
                    value={tipoPedra}
                    onChange={(e) => setTipoPedra(e.target.value)}
                    className={inputCls}
                    disabled={saving || setupLoading || !!setupError}
                  >
                    {STONE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Descrição *</label>
                  <input
                    ref={descricaoRef}
                    type="text"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex: Safira pear 3x5mm AAA"
                    maxLength={200}
                    className={inputCls}
                    disabled={saving || setupLoading || !!setupError}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Mínimo 3 caracteres. Esse será o nome exibido na listagem.
                  </p>
                </div>
              </section>

              {/* Precificação */}
              <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Precificação
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Peso (ct) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pesoCtRaw}
                      onChange={(e) => setPesoCtRaw(e.target.value)}
                      placeholder="0,85"
                      className={inputCls}
                      disabled={saving || setupLoading || !!setupError}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Custo USD/ct *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={custoUsdCtRaw}
                      onChange={(e) => setCustoUsdCtRaw(e.target.value)}
                      placeholder="180,00"
                      className={inputCls}
                      disabled={saving || setupLoading || !!setupError}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Markup *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={markupRaw}
                      onChange={(e) => setMarkupRaw(e.target.value)}
                      placeholder="3,5"
                      className={inputCls}
                      disabled={saving || setupLoading || !!setupError}
                    />
                  </div>
                </div>

                {/* Preço calculado */}
                <div
                  className="px-4 py-3 rounded-lg border"
                  style={{
                    backgroundColor: Number.isFinite(precoCalc) ? "#F5F1E8" : "#FAFAF7",
                    borderColor: Number.isFinite(precoCalc) ? C.dourado : C.cremeBorder,
                  }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    💰 Preço calculado
                  </div>
                  <div className="mt-1 font-mono text-xs text-gray-600">
                    {Number.isFinite(peso) && peso > 0 ? peso.toString().replace(".", ",") : "—"} ct ×{" "}
                    {Number.isFinite(custo) && custo > 0 ? `USD ${custo.toString().replace(".", ",")}` : "—"} ×{" "}
                    {dolar ? fmtBRL(dolar) : "—"} ×{" "}
                    {Number.isFinite(markup) && markup > 0 ? markup.toString().replace(".", ",") : "—"}
                  </div>
                  <div className="mt-1.5 text-xl font-bold" style={{ color: C.esmeralda }}>
                    {Number.isFinite(precoCalc) ? fmtBRL(precoCalc) : "—"}
                  </div>
                  {Number.isFinite(precoCalc) && (
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Arredondado para {fmtBRLInt(Math.round(precoCalc))} ao salvar.
                    </div>
                  )}
                </div>
              </section>

              {/* Estoque */}
              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Estoque inicial
                </h3>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={criarEstoque}
                    onChange={(e) => setCriarEstoque(e.target.checked)}
                    className="accent-[#184036]"
                    disabled={saving || setupLoading || !!setupError}
                  />
                  Já entrar com 1 unidade em estoque comercial
                </label>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        {!sucesso && (
          <div
            className="px-5 py-3 flex items-center justify-end gap-2 border-t"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!valid || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{ backgroundColor: C.esmeralda }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Cadastrando…" : "Cadastrar"}
            </button>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className="fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium border"
            style={{
              backgroundColor: toast.tipo === "ok" ? "#ECFDF5" : "#FEF2F2",
              color: toast.tipo === "ok" ? "#065F46" : "#991B1B",
              borderColor: toast.tipo === "ok" ? "#A7F3D0" : "#FECACA",
            }}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
