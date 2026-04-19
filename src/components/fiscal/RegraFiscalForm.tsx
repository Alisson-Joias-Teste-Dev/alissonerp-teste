"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2 } from "lucide-react";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA" };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const ORIGEM_LABELS = [
  "0 - Nacional",
  "1 - Importação direta",
  "2 - Importado de terceiros",
  "3 - Nacional com conteúdo importado > 40% e <= 70%",
  "4 - Nacional produzido em conformidade",
  "5 - Nacional com conteúdo importado <= 40%",
  "6 - Importação direta (sem similar nacional)",
  "7 - Importado de terceiros (sem similar)",
  "8 - Nacional com conteúdo importado > 70%",
];

export interface RegraFiscal {
  id?: number;
  empresa_emitente_id?: number | null;
  ncm: string;
  uf_destino?: string | null;
  cfop_saida: string;
  cfop_devolucao?: string | null;
  csosn?: string | null;
  cst_icms?: string | null;
  origem?: number;
  aliq_ibpt_federal?: number;
  aliq_ibpt_estadual?: number;
  aliq_ibpt_municipal?: number;
  mva_st?: number | null;
  aliq_icms_st?: number | null;
  ativo?: boolean;
}

interface EmitenteOpt { id: number; razao_social: string }

interface Props {
  id: number | null;
  emitentes: EmitenteOpt[];
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: RegraFiscal = {
  empresa_emitente_id: null,
  ncm: "",
  uf_destino: null,
  cfop_saida: "",
  origem: 0,
  aliq_ibpt_federal: 0,
  aliq_ibpt_estadual: 0,
  aliq_ibpt_municipal: 0,
};

export default function RegraFiscalForm({ id, emitentes, onClose, onSaved }: Props) {
  const [data, setData] = useState<RegraFiscal>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (id == null) { setData(EMPTY); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/fiscal/regras/${id}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) { setErr(j.error ?? "Erro ao carregar"); return; }
        setData(j);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  function update<K extends keyof RegraFiscal>(k: K, v: RegraFiscal[K]) {
    setData((prev) => ({ ...prev, [k]: v }));
  }

  async function salvar() {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        empresa_emitente_id: data.empresa_emitente_id ?? null,
        ncm: data.ncm.replace(/\D/g, ""),
        uf_destino: data.uf_destino || null,
        cfop_saida: data.cfop_saida.replace(/\D/g, ""),
        cfop_devolucao: data.cfop_devolucao ? data.cfop_devolucao.replace(/\D/g, "") : null,
        csosn: data.csosn || null,
        cst_icms: data.cst_icms || null,
        origem: data.origem ?? 0,
        aliq_ibpt_federal: data.aliq_ibpt_federal ?? 0,
        aliq_ibpt_estadual: data.aliq_ibpt_estadual ?? 0,
        aliq_ibpt_municipal: data.aliq_ibpt_municipal ?? 0,
        mva_st: data.mva_st ?? null,
        aliq_icms_st: data.aliq_icms_st ?? null,
      };

      const res = id == null
        ? await fetch("/api/fiscal/regras", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/fiscal/regras/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erro");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 border" style={{ borderColor: C.cremeBorder }}>
        <header className="px-6 py-4 flex items-center justify-between rounded-t-xl" style={{ background: C.creme }}>
          <h2 className="text-xl font-serif" style={{ color: C.esmeralda }}>
            {id == null ? "Nova Regra Fiscal" : "Editar Regra Fiscal"}
          </h2>
          <button onClick={onClose}><X size={22} /></button>
        </header>

        {loading ? (
          <div className="py-16 flex justify-center items-center text-gray-500">
            <Loader2 size={24} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {err && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Emitente">
                <select
                  value={data.empresa_emitente_id ?? ""}
                  onChange={(e) => update("empresa_emitente_id", e.target.value === "" ? null : Number(e.target.value))}
                  className="inp"
                >
                  <option value="">Geral (todas)</option>
                  {emitentes.map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
                </select>
              </Field>
              <Field label="UF destino">
                <select
                  value={data.uf_destino ?? ""}
                  onChange={(e) => update("uf_destino", e.target.value || null)}
                  className="inp"
                >
                  <option value="">Qualquer UF</option>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="NCM * (8 dígitos)">
                <input
                  value={data.ncm}
                  onChange={(e) => update("ncm", e.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="inp font-mono"
                />
              </Field>
              <Field label="Origem">
                <select
                  value={data.origem ?? 0}
                  onChange={(e) => update("origem", Number(e.target.value))}
                  className="inp"
                >
                  {ORIGEM_LABELS.map((lbl, i) => <option key={i} value={i}>{lbl}</option>)}
                </select>
              </Field>
              <Field label="CFOP saída * (4 dígitos)">
                <input
                  value={data.cfop_saida}
                  onChange={(e) => update("cfop_saida", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="inp font-mono"
                />
              </Field>
              <Field label="CFOP devolução (4 dígitos)">
                <input
                  value={data.cfop_devolucao ?? ""}
                  onChange={(e) => update("cfop_devolucao", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="inp font-mono"
                />
              </Field>
              <Field label="CSOSN (Simples)">
                <input
                  value={data.csosn ?? ""}
                  onChange={(e) => update("csosn", e.target.value)}
                  className="inp font-mono"
                  placeholder="Ex: 102, 500"
                />
              </Field>
              <Field label="CST ICMS (Lucro Pres./Real)">
                <input
                  value={data.cst_icms ?? ""}
                  onChange={(e) => update("cst_icms", e.target.value)}
                  className="inp font-mono"
                  placeholder="Ex: 00, 60"
                />
              </Field>
              <Field label="IBPT Federal (%)">
                <input
                  type="number" step="0.01"
                  value={data.aliq_ibpt_federal ?? 0}
                  onChange={(e) => update("aliq_ibpt_federal", Number(e.target.value))}
                  className="inp"
                />
              </Field>
              <Field label="IBPT Estadual (%)">
                <input
                  type="number" step="0.01"
                  value={data.aliq_ibpt_estadual ?? 0}
                  onChange={(e) => update("aliq_ibpt_estadual", Number(e.target.value))}
                  className="inp"
                />
              </Field>
              <Field label="IBPT Municipal (%)">
                <input
                  type="number" step="0.01"
                  value={data.aliq_ibpt_municipal ?? 0}
                  onChange={(e) => update("aliq_ibpt_municipal", Number(e.target.value))}
                  className="inp"
                />
              </Field>
              <Field label="MVA ST">
                <input
                  type="number" step="0.0001"
                  value={data.mva_st ?? ""}
                  onChange={(e) => update("mva_st", e.target.value === "" ? null : Number(e.target.value))}
                  className="inp"
                />
              </Field>
              <Field label="Alíquota ICMS-ST (%)">
                <input
                  type="number" step="0.01"
                  value={data.aliq_icms_st ?? ""}
                  onChange={(e) => update("aliq_icms_st", e.target.value === "" ? null : Number(e.target.value))}
                  className="inp"
                />
              </Field>
            </div>

            <footer className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: C.cremeBorder }}>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: C.cremeBorder }}>Cancelar</button>
              <button
                onClick={salvar}
                disabled={saving || !data.ncm || !data.cfop_saida}
                className="px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2 disabled:opacity-50"
                style={{ background: C.esmeralda }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </div>
        )}
      </div>
      <style jsx>{`
        :global(.inp) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid ${C.cremeBorder};
          border-radius: 0.5rem;
          background: white;
          font-size: 0.875rem;
        }
        :global(.inp:focus) { outline: none; border-color: ${C.esmeralda}; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
