// Bloco fiscal de produto. Uso pretendido: importar na tela de detalhe
// do produto para exibir/editar os campos NCM/CEST/CFOP/origem/EAN.
// NAO integrado automaticamente — a integracao fica como task futura para
// evitar refatoracao na tela de produto existente.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Loader2, FileBadge2 } from "lucide-react";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA" };

const ORIGENS = [
  "0 - Nacional",
  "1 - Importação direta",
  "2 - Importado de terceiros",
  "3 - Nacional c/ imp. > 40% e <= 70%",
  "4 - Nacional conforme PPB",
  "5 - Nacional c/ imp. <= 40%",
  "6 - Imp. direta (sem similar nacional)",
  "7 - Imp. terceiros (sem similar)",
  "8 - Nacional c/ imp. > 70%",
];

interface Dados {
  ncm: string | null;
  cest: string | null;
  cfop_saida: string | null;
  origem: number | null;
  unidade_comercial: string | null;
  ean: string | null;
}

interface Props {
  idProduto: string; // BIGINT como string
  canEdit?: boolean;
}

const EMPTY: Dados = {
  ncm: "",
  cest: "",
  cfop_saida: "",
  origem: 0,
  unidade_comercial: "UN",
  ean: "",
};

export default function ProdutoFiscalBlock({ idProduto, canEdit = true }: Props) {
  const [data, setData] = useState<Dados>(EMPTY);
  const [existente, setExistente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/fiscal/produtos-fiscais/${idProduto}`, { cache: "no-store" });
      if (res.status === 404) {
        setExistente(false);
        setData(EMPTY);
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      const j = await res.json();
      setExistente(true);
      setData({
        ncm: j.ncm ?? "",
        cest: j.cest ?? "",
        cfop_saida: j.cfop_saida ?? "",
        origem: j.origem ?? 0,
        unidade_comercial: j.unidade_comercial ?? "UN",
        ean: j.ean ?? "",
      });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [idProduto]);

  useEffect(() => { load(); }, [load]);

  async function salvar() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/fiscal/produtos-fiscais/${idProduto}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ncm: data.ncm || null,
          cest: data.cest || null,
          cfop_saida: data.cfop_saida || null,
          origem: data.origem ?? 0,
          unidade_comercial: data.unidade_comercial || "UN",
          ean: data.ean || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erro");
      setMsg({ type: "ok", text: "Dados fiscais salvos." });
      setExistente(true);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-4" style={{ borderColor: C.cremeBorder }}>
      <div className="flex items-center gap-2 mb-3">
        <FileBadge2 size={18} style={{ color: C.esmeralda }} />
        <h3 className="text-sm font-medium" style={{ color: C.esmeralda }}>Dados Fiscais do Produto</h3>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <>
          {!existente && (
            <div className="mb-3 p-2 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs">
              Sem dados fiscais — preencha para poder emitir nota fiscal deste produto.
            </div>
          )}
          {msg && (
            <div className={`mb-3 p-2 rounded text-xs ${
              msg.type === "ok" ? "bg-green-50 border border-green-200 text-green-800"
                                : "bg-red-50 border border-red-200 text-red-800"
            }`}>
              {msg.text}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="NCM (8 dígitos)">
              <input
                value={data.ncm ?? ""}
                onChange={(e) => setData({ ...data, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                disabled={!canEdit}
                className="inp font-mono"
              />
            </Field>
            <Field label="CEST (7 dígitos)">
              <input
                value={data.cest ?? ""}
                onChange={(e) => setData({ ...data, cest: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                disabled={!canEdit}
                className="inp font-mono"
              />
            </Field>
            <Field label="CFOP saída (4 dígitos)">
              <input
                value={data.cfop_saida ?? ""}
                onChange={(e) => setData({ ...data, cfop_saida: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                disabled={!canEdit}
                className="inp font-mono"
              />
            </Field>
            <Field label="Origem">
              <select
                value={data.origem ?? 0}
                onChange={(e) => setData({ ...data, origem: Number(e.target.value) })}
                disabled={!canEdit}
                className="inp"
              >
                {ORIGENS.map((lbl, i) => <option key={i} value={i}>{lbl}</option>)}
              </select>
            </Field>
            <Field label="Unid. comercial">
              <input
                value={data.unidade_comercial ?? "UN"}
                onChange={(e) => setData({ ...data, unidade_comercial: e.target.value.slice(0, 6) })}
                disabled={!canEdit}
                className="inp"
              />
            </Field>
            <Field label="EAN (8/12/13/14 dígitos)">
              <input
                value={data.ean ?? ""}
                onChange={(e) => setData({ ...data, ean: e.target.value.replace(/\D/g, "").slice(0, 14) })}
                disabled={!canEdit}
                className="inp font-mono"
              />
            </Field>
          </div>

          {canEdit && (
            <div className="flex justify-end mt-4">
              <button
                onClick={salvar}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2 disabled:opacity-50"
                style={{ background: C.esmeralda }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvando..." : "Salvar dados fiscais"}
              </button>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        :global(.inp) {
          width: 100%;
          padding: 0.4rem 0.6rem;
          border: 1px solid ${C.cremeBorder};
          border-radius: 0.5rem;
          background: white;
          font-size: 0.85rem;
        }
        :global(.inp:disabled) { background: #F3F4F6; color: #6B7280; }
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
