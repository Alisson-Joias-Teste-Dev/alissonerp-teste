"use client";

import { toast } from "sonner";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Pencil, Loader2, Check } from "lucide-react";
import type { TeorOuro, LigaTipo } from "./types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";

export default function TabTeores({ teores: initial, ligaTipos: initialLiga }: { teores: TeorOuro[]; ligaTipos: LigaTipo[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [teores, setTeores] = useState<TeorOuro[]>(initial);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editTeor, setEditTeor] = useState("");
  const [saving, setSaving] = useState(false);
  const [erros, setErros] = useState<Record<number, string>>({});

  const [ligaTipos, setLigaTipos] = useState<LigaTipo[]>(initialLiga);
  const [editandoLigaId, setEditandoLigaId] = useState<number | null>(null);
  const [editLigaTeor, setEditLigaTeor] = useState("");
  const [savingLiga, setSavingLiga] = useState(false);
  const [errosLiga, setErrosLiga] = useState<Record<number, string>>({});

  async function handleSave(t: TeorOuro) {
    const novoTeor = parseFloat(editTeor) / 100;
    if (isNaN(novoTeor) || novoTeor <= 0 || novoTeor > 1) { setErros(prev => ({ ...prev, [t.id]: "Teor entre 0.01 e 100%" })); return; }
    setSaving(true); setErros(prev => { const n = { ...prev }; delete n[t.id]; return n; });
    const res = await fetch(`/api/purificacao/teores/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teor: novoTeor, user_role: "admin" }) });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setErros(prev => ({ ...prev, [t.id]: d.error ?? "Erro ao salvar" })); return; }
    setTeores(prev => prev.map(x => x.id === t.id ? { ...x, teor: novoTeor } : x)); setEditandoId(null);
    toast.success("Teor atualizado"); startTransition(() => router.refresh());
  }

  async function handleSaveLiga(lt: LigaTipo) {
    const novoTeor = parseFloat(editLigaTeor) / 100;
    if (isNaN(novoTeor) || novoTeor <= 0 || novoTeor > 1) { setErrosLiga(prev => ({ ...prev, [lt.id]: "Teor entre 0.01 e 100%" })); return; }
    setSavingLiga(true); setErrosLiga(prev => { const n = { ...prev }; delete n[lt.id]; return n; });
    const res = await fetch(`/api/purificacao/liga-tipos/${lt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teor_default: novoTeor, user_role: "admin" }) });
    setSavingLiga(false);
    if (!res.ok) { const d = await res.json(); setErrosLiga(prev => ({ ...prev, [lt.id]: d.error ?? "Erro ao salvar" })); return; }
    setLigaTipos(prev => prev.map(x => x.id === lt.id ? { ...x, teor_default: novoTeor } : x)); setEditandoLigaId(null);
    toast.success("Liga atualizada"); startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Tabela 1 — Teores de Purificação */}
      <Table>
        <TableHeader>
          <TableRow>
            {["Tipo de Ouro", "SKU", "Teor (%)", "Status", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {teores.map(t => (
            <TableRow key={t.id}>
              <TableCell className="font-medium text-gray-900">{t.nome}</TableCell>
              <TableCell className="font-mono text-xs text-gray-500">{t.sku}</TableCell>
              <TableCell>
                {editandoId === t.id ? (
                  <div>
                    <input type="number" value={editTeor} min={1} max={100} step={0.01}
                      onChange={e => setEditTeor(e.target.value)}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-esmeralda-300 focus:ring-1 focus:ring-esmeralda-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" autoFocus />
                    {erros[t.id] && <p className="text-xs mt-1 text-error-600">{erros[t.id]}</p>}
                  </div>
                ) : (
                  <span className="font-semibold text-dourado-DEFAULT">{(t.teor * 100).toFixed(2)}%</span>
                )}
              </TableCell>
              <TableCell><Badge color={t.ativo ? "success" : "neutral"} size="sm">{t.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {editandoId === t.id ? (
                    <>
                      <button onClick={() => handleSave(t)} disabled={saving}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 transition-colors disabled:opacity-50">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditandoId(null)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditandoId(t.id); setEditTeor(String((t.teor * 100).toFixed(2))); }}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-700 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button disabled
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Tabela 2 — Mapeamento Liga */}
      <Table>
        <TableHeader>
          <TableRow>
            {["Tipo 18k", "Liga", "Teor Padrão (%)", "Saldo Liga", "Status", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ligaTipos.map(lt => (
            <TableRow key={lt.id}>
              <TableCell className="font-medium text-gray-900">{lt.tipo_18k_nome}</TableCell>
              <TableCell className="text-gray-500">{lt.liga_nome}</TableCell>
              <TableCell>
                {editandoLigaId === lt.id ? (
                  <div>
                    <input type="number" value={editLigaTeor} min={1} max={100} step={0.01}
                      onChange={e => setEditLigaTeor(e.target.value)}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-esmeralda-300 focus:ring-1 focus:ring-esmeralda-500/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" autoFocus />
                    {errosLiga[lt.id] && <p className="text-xs mt-1 text-error-600">{errosLiga[lt.id]}</p>}
                  </div>
                ) : (
                  <span className="font-semibold text-dourado-DEFAULT">{(Number(lt.teor_default) * 100).toFixed(2)}%</span>
                )}
              </TableCell>
              <TableCell className="text-gray-500">{Number(lt.saldo_liga).toFixed(2)}g</TableCell>
              <TableCell><Badge color={lt.ativo ? "success" : "neutral"} size="sm">{lt.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {editandoLigaId === lt.id ? (
                    <>
                      <button onClick={() => handleSaveLiga(lt)} disabled={savingLiga}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-esmeralda-500 text-white shadow-theme-xs hover:bg-esmeralda-600 transition-colors disabled:opacity-50">
                        {savingLiga ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditandoLigaId(null)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-error-500 transition-colors">
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditandoLigaId(lt.id); setEditLigaTeor(String((Number(lt.teor_default) * 100).toFixed(2))); }}
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-700 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button disabled
                        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
