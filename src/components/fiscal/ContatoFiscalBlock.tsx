// Bloco fiscal de contato (cliente/fornecedor). Uso pretendido: importar
// na tela de detalhe do contato. NAO integrado automaticamente — integracao
// fica como task futura para nao mexer na tela existente.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Loader2, UserCheck } from "lucide-react";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA" };

interface Dados {
  ie: string | null;
  indicador_ie: number | null;
  codigo_ibge_municipio: string | null;
  regime_tributario: number | null;
}

interface Props {
  idContato: string;
  canEdit?: boolean;
}

const EMPTY: Dados = {
  ie: "",
  indicador_ie: 9,
  codigo_ibge_municipio: "",
  regime_tributario: null,
};

export default function ContatoFiscalBlock({ idContato, canEdit = true }: Props) {
  const [data, setData] = useState<Dados>(EMPTY);
  const [existente, setExistente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/fiscal/contatos-fiscais/${idContato}`, { cache: "no-store" });
      if (res.status === 404) { setExistente(false); setData(EMPTY); return; }
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      const j = await res.json();
      setExistente(true);
      setData({
        ie: j.ie ?? "",
        indicador_ie: j.indicador_ie ?? 9,
        codigo_ibge_municipio: j.codigo_ibge_municipio ?? "",
        regime_tributario: j.regime_tributario ?? null,
      });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [idContato]);

  useEffect(() => { load(); }, [load]);

  const ieBloqueada = data.indicador_ie === 2 || data.indicador_ie === 9;

  async function salvar() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/fiscal/contatos-fiscais/${idContato}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ie: ieBloqueada ? null : (data.ie || null),
          indicador_ie: data.indicador_ie,
          codigo_ibge_municipio: data.codigo_ibge_municipio || null,
          regime_tributario: data.regime_tributario,
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
        <UserCheck size={18} style={{ color: C.esmeralda }} />
        <h3 className="text-sm font-medium" style={{ color: C.esmeralda }}>Dados Fiscais do Contato</h3>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <>
          {!existente && (
            <div className="mb-3 p-2 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs">
              Sem dados fiscais — preencha para poder emitir nota para este contato.
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Field label="Indicador IE">
              <select
                value={data.indicador_ie ?? 9}
                onChange={(e) => setData({ ...data, indicador_ie: Number(e.target.value) })}
                disabled={!canEdit}
                className="inp"
              >
                <option value={1}>1 - Contribuinte ICMS</option>
                <option value={2}>2 - Isento de IE</option>
                <option value={9}>9 - Não contribuinte</option>
              </select>
            </Field>
            <Field label={`Inscrição Estadual${ieBloqueada ? " (não aplicável)" : " *"}`}>
              <input
                value={ieBloqueada ? "" : (data.ie ?? "")}
                onChange={(e) => setData({ ...data, ie: e.target.value.replace(/\D/g, "").slice(0, 20) })}
                disabled={!canEdit || ieBloqueada}
                className="inp font-mono"
              />
            </Field>
            <Field label="Código IBGE município (7 dígitos)">
              <input
                value={data.codigo_ibge_municipio ?? ""}
                onChange={(e) => setData({ ...data, codigo_ibge_municipio: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                disabled={!canEdit}
                className="inp font-mono"
              />
            </Field>
            <Field label="Regime Tributário">
              <select
                value={data.regime_tributario ?? ""}
                onChange={(e) => setData({ ...data, regime_tributario: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={!canEdit}
                className="inp"
              >
                <option value="">—</option>
                <option value={1}>1 - Simples Nacional</option>
                <option value={2}>2 - Lucro Presumido</option>
                <option value={3}>3 - Lucro Real</option>
              </select>
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
