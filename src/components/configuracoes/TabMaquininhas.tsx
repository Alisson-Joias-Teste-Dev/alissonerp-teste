"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, Smartphone, Pencil, Save, X, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";
import { Alert } from "@/components/ui/Alert";

interface MaqDevice { id: number; device_id: string; nome_legivel: string; vendedor_id: number | null; is_reserva: boolean; ativo: boolean; loja: string | null; parcelas_padrao_mp: number; }
interface Vendedor { id_vendedor: number; nome: string; }

export default function TabMaquininhas() {
  const [devices, setDevices] = useState<MaqDevice[]>([]); const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true); const [erro, setErro] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false); const [syncMsg, setSyncMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState(""); const [editLoja, setEditLoja] = useState("");
  const [editVendedorId, setEditVendedorId] = useState<string>(""); const [editIsReserva, setEditIsReserva] = useState(false);
  const [editAtivo, setEditAtivo] = useState(true); const [editParcelasPadrao, setEditParcelasPadrao] = useState(1);
  const [saving, setSaving] = useState(false); const [saveErro, setSaveErro] = useState<string | null>(null);

  async function carregar() { setLoading(true); setErro(null); try { const [d, v] = await Promise.all([fetch("/api/mercado-pago/devices"), fetch("/api/vendedores")]); if (!d.ok) throw new Error("Erro"); setDevices(await d.json()); if (v.ok) setVendedores(await v.json()); } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setLoading(false); } }
  useEffect(() => { carregar(); }, []);

  async function sincronizar() { setSyncing(true); setSyncMsg(null); try { const res = await fetch("/api/mercado-pago/devices", { method: "POST" }); const body = await res.json(); if (res.ok) { setSyncMsg({ tipo: "ok", texto: `Sincronizado: ${body.inserted} novas, ${body.updated} atualizadas (total ${body.total})` }); await carregar(); } else setSyncMsg({ tipo: "erro", texto: body.error ?? "Erro" }); } catch { setSyncMsg({ tipo: "erro", texto: "Erro de rede" }); } finally { setSyncing(false); setTimeout(() => setSyncMsg(null), 5000); } }

  function abrirEdicao(d: MaqDevice) { setEditandoId(d.id); setEditNome(d.nome_legivel); setEditLoja(d.loja ?? ""); setEditVendedorId(d.vendedor_id != null ? String(d.vendedor_id) : ""); setEditIsReserva(d.is_reserva); setEditAtivo(d.ativo); setEditParcelasPadrao(d.parcelas_padrao_mp ?? 1); setSaveErro(null); }
  function cancelarEdicao() { setEditandoId(null); setSaveErro(null); }

  async function salvar(id: number) { setSaving(true); setSaveErro(null); try { const body: Record<string, unknown> = { id, nome_legivel: editNome.trim() || undefined, loja: editLoja.trim() || null, ativo: editAtivo }; if (editVendedorId) { body.vendedor_id = Number(editVendedorId); body.is_reserva = false; body.parcelas_padrao_mp = editParcelasPadrao; } else { body.vendedor_id = null; body.is_reserva = editIsReserva; } const res = await fetch("/api/mercado-pago/devices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await res.json(); if (!res.ok) { if (res.status === 409) throw new Error("Vendedor já tem outra maquininha"); throw new Error(data.error ?? "Erro"); } setEditandoId(null); await carregar(); } catch (e) { setSaveErro(e instanceof Error ? e.message : "Erro"); } finally { setSaving(false); } }

  const nomeVendedor = (id: number | null) => id == null ? "—" : vendedores.find(v => v.id_vendedor === id)?.nome ?? String(id);

  if (loading) return <div className="flex items-center justify-center py-12 gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" />Carregando...</div>;
  if (erro) return <Alert variant="error" message={erro} />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <Card title="Maquininhas" desc={`${devices.length} maquininha${devices.length > 1 ? "s" : ""} cadastrada${devices.length > 1 ? "s" : ""}`}
        headerRight={<Button size="sm" onClick={sincronizar} loading={syncing} startIcon={<RefreshCw size={13} />}>{syncing ? "Sincronizando..." : "Sincronizar com MP"}</Button>}>

        {syncMsg && <Alert variant={syncMsg.tipo === "ok" ? "success" : "error"} message={syncMsg.texto} showClose onClose={() => setSyncMsg(null)} />}

        {devices.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">Clique em "Sincronizar com MP" para importar as maquininhas.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {["Nome", "Device ID", "Vendedor", "Reserva", "Status", "Ações"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map(d => {
                const editando = editandoId === d.id;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      {editando ? (
                        <input value={editNome} onChange={e => setEditNome(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-esmeralda-300 focus:ring-1 focus:ring-esmeralda-500/20" />
                      ) : (
                        <div className="flex items-center gap-2"><Smartphone size={13} className="text-gray-500" /><span className="font-medium text-gray-900">{d.nome_legivel}</span></div>
                      )}
                    </TableCell>
                    <TableCell><span className="font-mono text-xs text-gray-400 break-all">{d.device_id}</span></TableCell>
                    <TableCell>
                      {editando ? (
                        <div className="space-y-2">
                          <select value={editVendedorId} onChange={e => { setEditVendedorId(e.target.value); if (e.target.value) setEditIsReserva(false); }}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-esmeralda-300 focus:ring-1 focus:ring-esmeralda-500/20">
                            <option value="">— Nenhum / Reserva</option>
                            {vendedores.map(v => <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>)}
                          </select>
                          {editVendedorId && (
                            <select value={editParcelasPadrao} onChange={e => setEditParcelasPadrao(Number(e.target.value))}
                              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none">
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div><span className={d.vendedor_id ? "text-gray-900" : "text-gray-400"}>{nomeVendedor(d.vendedor_id)}</span>{d.vendedor_id && d.parcelas_padrao_mp > 1 && <span className="block text-xs text-gray-400 mt-0.5">{d.parcelas_padrao_mp}x padrão</span>}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editando ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editIsReserva} disabled={!!editVendedorId} onChange={e => setEditIsReserva(e.target.checked)} className="rounded" />
                          <span className={`text-xs ${editVendedorId ? "text-gray-400" : "text-gray-900"}`}>Reserva</span>
                        </label>
                      ) : (
                        <Badge color={d.is_reserva ? "warning" : "neutral"} size="sm">{d.is_reserva ? "Sim" : "Não"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editando ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <button type="button" onClick={() => setEditAtivo(v => !v)}>{editAtivo ? <ToggleRight size={22} className="text-success-500" /> : <ToggleLeft size={22} className="text-gray-300" />}</button>
                          <span className={`text-xs ${editAtivo ? "text-success-600" : "text-gray-400"}`}>{editAtivo ? "Ativo" : "Inativo"}</span>
                        </label>
                      ) : (
                        <Badge color={d.ativo ? "success" : "neutral"} size="sm">{d.ativo ? "Ativo" : "Inativo"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editando ? (
                        <div className="space-y-1">
                          {saveErro && <p className="text-xs text-error-600">{saveErro}</p>}
                          <div className="flex items-center gap-1">
                            <Button size="sm" onClick={() => salvar(d.id)} loading={saving} startIcon={<Save size={11} />}>Salvar</Button>
                            <Button size="sm" variant="ghost" onClick={cancelarEdicao} startIcon={<X size={11} />}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => abrirEdicao(d)} startIcon={<Pencil size={11} />}>Editar</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
