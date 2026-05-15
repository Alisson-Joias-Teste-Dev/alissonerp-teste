"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Loader2, Building2, KeyRound, PowerOff } from "lucide-react";
import EmitenteForm, { type Emitente } from "@/components/fiscal/EmitenteForm";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface EmitenteListRow extends Omit<Emitente, "id"> {
  id: number;
  local_estoque_nome: string | null;
  tem_token: boolean;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

function fmtCnpj(v: string | null | undefined) {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const REGIME_LABEL: Record<number, string> = {
  1: "Simples",
  2: "Lucro Presumido",
  3: "Lucro Real",
};

interface Props { role: string }

export default function EmitentesClient(_props: Props) {
  const [rows, setRows] = useState<EmitenteListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/fiscal/emitentes", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao carregar");
      setRows(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function inativar(id: number) {
    if (!confirm("Inativar este emitente? Ele não poderá mais emitir notas.")) return;
    try {
      const res = await fetch(`/api/fiscal/emitentes/${id}`, { method: "DELETE" });
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
            <Building2 size={28} style={{ color: C.esmeralda }} />
            <div>
              <h1 className="text-2xl md:text-3xl font-serif" style={{ color: C.esmeralda }}>
                Emitentes Fiscais
              </h1>
              <p className="text-sm text-gray-600">
                CNPJs cadastrados para emissão de NF-e 55 e NFC-e 65
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2 hover:bg-white transition"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            >
              <RefreshCw size={16} /> Atualizar
            </button>
            <button
              onClick={() => { setEditingId(null); setFormOpen(true); }}
              className="px-4 py-2 rounded-lg text-white text-sm flex items-center gap-2 hover:opacity-90 transition"
              style={{ background: C.esmeralda }}
            >
              <Plus size={16} /> Novo emitente
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {err}
          </div>
        )}

        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          {loading ? (
            <div className="py-16 flex justify-center items-center text-gray-500">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              Nenhum emitente cadastrado. Clique em &quot;Novo emitente&quot; para começar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead style={{ background: C.creme }}>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>Razão Social</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>CNPJ</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>UF</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>Regime</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>Ambiente</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>Token</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>Local</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ color: C.esmeralda }}>Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t cursor-pointer hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder }}
                      onClick={() => { setEditingId(r.id); setFormOpen(true); }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.razao_social}</div>
                        {r.nome_fantasia && <div className="text-xs text-gray-500">{r.nome_fantasia}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtCnpj(r.cnpj)}</td>
                      <td className="px-4 py-3">{r.uf ?? "—"}</td>
                      <td className="px-4 py-3">{REGIME_LABEL[r.regime_tributario ?? 1] ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            background: r.ambiente === "producao" ? "#D1FAE5" : "#FEF9C3",
                            color: r.ambiente === "producao" ? "#065F46" : "#713F12",
                          }}
                        >
                          {r.ambiente === "producao" ? "Produção" : "Homologação"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                          style={{
                            background: r.tem_token ? "#D1FAE5" : "#FEE2E2",
                            color: r.tem_token ? "#065F46" : "#991B1B",
                          }}
                        >
                          <KeyRound size={11} />
                          {r.tem_token ? "Configurado" : "Ausente"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{r.local_estoque_nome ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            background: r.ativo ? "#D1FAE5" : "#E5E7EB",
                            color: r.ativo ? "#065F46" : "#374151",
                          }}
                        >
                          {r.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.ativo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); inativar(r.id); }}
                            className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                          >
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
          <EmitenteForm
            id={editingId}
            onClose={() => setFormOpen(false)}
            onSaved={() => { setFormOpen(false); load(); }}
          />
        )}
      </div>
    </div>
  );
}
