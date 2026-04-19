"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Loader2, Scale, PowerOff } from "lucide-react";
import RegraFiscalForm, { type RegraFiscal } from "@/components/fiscal/RegraFiscalForm";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface RegraRow extends RegraFiscal {
  id: number;
  empresa_razao_social: string | null;
  ativo: boolean;
}

interface EmitenteOpt { id: number; razao_social: string; ativo: boolean }

const UFS = ["","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

interface Props { role: string }

export default function RegrasClient(_props: Props) {
  const [rows, setRows] = useState<RegraRow[]>([]);
  const [emitentes, setEmitentes] = useState<EmitenteOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [fEmpresa, setFEmpresa] = useState<string>("");
  const [fNcm, setFNcm] = useState("");
  const [fUf, setFUf] = useState("");
  const [fAtivo, setFAtivo] = useState<"true" | "false" | "">("true");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (fEmpresa) qs.set("empresa_emitente_id", fEmpresa);
      if (fNcm)     qs.set("ncm", fNcm);
      if (fUf)      qs.set("uf", fUf);
      if (fAtivo !== "") qs.set("ativo", fAtivo);
      const res = await fetch(`/api/fiscal/regras?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      setRows(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fEmpresa, fNcm, fUf, fAtivo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/fiscal/emitentes", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : [])
      .then(setEmitentes)
      .catch(() => setEmitentes([]));
  }, []);

  async function inativar(id: number) {
    if (!confirm("Inativar esta regra?")) return;
    try {
      const res = await fetch(`/api/fiscal/regras/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: C.cremeBg }}>
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Scale size={28} style={{ color: C.esmeralda }} />
            <div>
              <h1 className="text-2xl md:text-3xl font-serif" style={{ color: C.esmeralda }}>
                Regras Fiscais
              </h1>
              <p className="text-sm text-gray-600">Matriz por NCM × UF destino × empresa (com fallbacks)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2 hover:bg-white"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            >
              <RefreshCw size={16} /> Atualizar
            </button>
            <button
              onClick={() => { setEditingId(null); setFormOpen(true); }}
              className="px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2"
              style={{ background: C.esmeralda }}
            >
              <Plus size={16} /> Nova regra
            </button>
          </div>
        </header>

        <div className="bg-white rounded-xl border p-4 mb-4" style={{ borderColor: C.cremeBorder }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Emitente</span>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.cremeBorder }}>
                <option value="">Todos</option>
                {emitentes.map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">NCM</span>
              <input value={fNcm} onChange={(e) => setFNcm(e.target.value.replace(/\D/g, "").slice(0, 8))} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.cremeBorder }} placeholder="8 dígitos" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">UF destino</span>
              <select value={fUf} onChange={(e) => setFUf(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.cremeBorder }}>
                {UFS.map((u) => <option key={u || "all"} value={u}>{u || "Todas"}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Status</span>
              <select value={fAtivo} onChange={(e) => setFAtivo(e.target.value as "true" | "false" | "")} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: C.cremeBorder }}>
                <option value="true">Ativas</option>
                <option value="false">Inativas</option>
                <option value="">Todas</option>
              </select>
            </label>
          </div>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>
        )}

        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          {loading ? (
            <div className="py-16 flex justify-center items-center text-gray-500">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-gray-500">Nenhuma regra encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead style={{ background: C.creme }}>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>NCM</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>UF</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>Emitente</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>CFOP saída</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>CFOP dev.</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>CSOSN</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>CST</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>Orig.</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>IBPT F/E/M %</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: C.esmeralda }}>Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t cursor-pointer hover:bg-gray-50" style={{ borderColor: C.cremeBorder }} onClick={() => { setEditingId(r.id); setFormOpen(true); }}>
                      <td className="px-3 py-2 font-mono text-xs">{r.ncm}</td>
                      <td className="px-3 py-2">{r.uf_destino ?? <span className="text-gray-400">*</span>}</td>
                      <td className="px-3 py-2 text-xs">{r.empresa_razao_social ?? <span className="italic text-gray-500">GERAL</span>}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cfop_saida}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cfop_devolucao ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.csosn ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cst_icms ?? "—"}</td>
                      <td className="px-3 py-2">{r.origem}</td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {Number(r.aliq_ibpt_federal).toFixed(2)} / {Number(r.aliq_ibpt_estadual).toFixed(2)} / {Number(r.aliq_ibpt_municipal).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs" style={{ background: r.ativo ? "#D1FAE5" : "#E5E7EB", color: r.ativo ? "#065F46" : "#374151" }}>
                          {r.ativo ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.ativo && (
                          <button onClick={(e) => { e.stopPropagation(); inativar(r.id); }} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1">
                            <PowerOff size={12} /> Inativar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {formOpen && (
          <RegraFiscalForm
            id={editingId}
            emitentes={emitentes}
            onClose={() => setFormOpen(false)}
            onSaved={() => { setFormOpen(false); load(); }}
          />
        )}
      </div>
    </div>
  );
}
