"use client";

import { useState, useEffect, Fragment } from "react";
import { Loader2, Lock, Eye, PenLine, Plus, Save, X, CheckCircle, AlertTriangle, Trash2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { InputField } from "@/components/ui/InputField";

const MODULO_LABEL: Record<string, string> = {
  dashboard: "Dashboard", dashboard_fabrica: "Dashboard Fábrica", dashboard_comercial: "Dashboard Comercial",
  ordens: "Ordens", pcp: "PCP", distribuicao: "Distribuição", purificacao: "Purificação",
  estoque: "Estoque", quebra: "Quebra", insumos: "Insumos", compras: "Compras",
  protocolo: "Protocolo", conferencia: "Conferência", entrega: "Entrega", auditoria: "Auditoria",
  vendas: "Vendas", financeiro: "Financeiro", produtos: "Produtos", precificacao: "Precificação", configuracoes: "Configurações",
};

const MODULO_GRUPOS = [
  { label: "Geral", modulos: ["dashboard", "dashboard_fabrica"] },
  { label: "Produção", modulos: ["ordens", "pcp", "distribuicao", "purificacao"] },
  { label: "Suprimentos", modulos: ["estoque", "quebra", "insumos", "compras"] },
  { label: "Logística", modulos: ["protocolo", "conferencia", "entrega"] },
  { label: "Qualidade", modulos: ["auditoria"] },
  { label: "Comercial", modulos: ["vendas", "dashboard_comercial", "financeiro", "produtos", "precificacao"] },
  { label: "Sistema", modulos: ["configuracoes"] },
];

type PermMap = Record<string, Record<string, { pode_ler: boolean; pode_escrever: boolean }>>;
type RoleItem = { key: string; label: string; ativo: boolean };
const SUPER_ADMINS = ["desenvolvedor", "admin"];

function getLevel(pode_ler: boolean, pode_escrever: boolean): 0 | 1 | 2 { if (pode_escrever) return 2; if (pode_ler) return 1; return 0; }
function fromLevel(level: 0 | 1 | 2) { return { pode_ler: level >= 1, pode_escrever: level === 2 }; }
function labelFromNome(nome: string): string {
  const map: Record<string, string> = { gerente_fabrica: "G. Fábrica", gerente_loja: "G. Loja", ourives: "Ourives", motoboy: "Motoboy", consultora: "Consultora", estoquista_fabrica: "Est. Fáb.", estoquista_loja: "Est. Loja", pcp: "PCP" };
  return map[nome] ?? nome.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

const levels = [
  { key: 0, Icon: Lock, bg: "bg-gray-100", color: "text-gray-400", title: "Sem acesso" },
  { key: 1, Icon: Eye, bg: "bg-sky-100", color: "text-sky-600", title: "Leitura" },
  { key: 2, Icon: PenLine, bg: "bg-success-50", color: "text-success-600", title: "Leitura+Escrita" },
];

export default function TabPermissoes() {
  const [perms, setPerms] = useState<PermMap>({});
  const [original, setOriginal] = useState<PermMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState("");
  const [rolesAtivas, setRolesAtivas] = useState<RoleItem[]>([]);
  const [novaRoleOpen, setNovaRoleOpen] = useState(false);
  const [novaRoleNome, setNovaRoleNome] = useState("");
  const [novaRoleDesc, setNovaRoleDesc] = useState("");
  const [criandoRole, setCriandoRole] = useState(false);
  const [erroNovaRole, setErroNovaRole] = useState("");

  async function carregarRoles() { const res = await fetch("/api/configuracoes/roles").catch(() => null); if (!res?.ok) return; const data = await res.json() as { roles: { nome: string; descricao: string; ativo: boolean }[] }; setRolesAtivas((data.roles ?? []).filter(r => !SUPER_ADMINS.includes(r.nome) && r.ativo).map(r => ({ key: r.nome, label: labelFromNome(r.nome), ativo: r.ativo }))); }

  async function carregarPermissoes() { const res = await fetch("/api/configuracoes/permissoes").catch(() => null); if (!res?.ok) { setErro("Erro ao carregar"); setLoading(false); return; } const data = await res.json(); const map: PermMap = {}; for (const { role, modulos } of (data.permissoes ?? [])) { map[role] = {}; for (const m of modulos) map[role][m.modulo] = { pode_ler: m.pode_ler, pode_escrever: m.pode_escrever }; } setPerms(map); setOriginal(JSON.parse(JSON.stringify(map))); setLoading(false); }

  useEffect(() => { Promise.all([carregarRoles(), carregarPermissoes()]); }, []);

  function toggleLevel(role: string, modulo: string) { setPerms(prev => { const cur = prev[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false }; const next = ((getLevel(cur.pode_ler, cur.pode_escrever) + 1) % 3) as 0 | 1 | 2; return { ...prev, [role]: { ...(prev[role] ?? {}), [modulo]: fromLevel(next) } }; }); }

  function isDirty(role: string, modulo: string) { const cur = perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false }; const ori = original[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false }; return cur.pode_ler !== ori.pode_ler || cur.pode_escrever !== ori.pode_escrever; }

  const totalPending = rolesAtivas.flatMap(r => Object.keys(MODULO_LABEL).filter(m => isDirty(r.key, m))).length;

  async function handleCriarRole() { const nome = novaRoleNome.trim().toLowerCase(); if (!nome) { setErroNovaRole("Nome obrigatório"); return; } setCriandoRole(true); setErroNovaRole(""); const res = await fetch("/api/configuracoes/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, descricao: novaRoleDesc.trim() || undefined }) }); const data = await res.json().catch(() => ({})) as { error?: string }; setCriandoRole(false); if (!res.ok) { setErroNovaRole(data.error ?? `Erro ${res.status}`); return; } setNovaRoleOpen(false); setNovaRoleNome(""); setNovaRoleDesc(""); await Promise.all([carregarRoles(), carregarPermissoes()]); }

  async function handleDesativarRole(nome: string) { if (!confirm(`Desativar a role "${nome}"?`)) return; await fetch(`/api/configuracoes/roles/${encodeURIComponent(nome)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: false }) }); await carregarRoles(); }

  async function handleSave() {
    setSaving(true); setErro(""); setSaved(false);
    const changes = rolesAtivas.flatMap(({ key: role }) => Object.keys(MODULO_LABEL).filter(modulo => isDirty(role, modulo)).map(modulo => ({ role, modulo, ...(perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false }) })));
    try { const res = await fetch("/api/configuracoes/permissoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) }); if (!res.ok) throw new Error(`HTTP ${res.status}`); setOriginal(JSON.parse(JSON.stringify(perms))); setSaved(true); setTimeout(() => setSaved(false), 3000); } catch (e: unknown) { setErro(e instanceof Error ? e.message : "Erro ao salvar"); } finally { setSaving(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <Card title="Permissões por Role" desc="Configure o acesso de cada role aos módulos do sistema">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Lock size={12} />Sem acesso</span>
            <span className="flex items-center gap-1"><Eye size={12} className="text-sky-500" /><span className="text-sky-500">Leitura</span></span>
            <span className="flex items-center gap-1"><PenLine size={12} className="text-success-500" /><span className="text-success-500">Leitura+Escrita</span></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-dourado-DEFAULT inline-block" />Modificada</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setNovaRoleOpen(true); setErroNovaRole(""); setNovaRoleNome(""); setNovaRoleDesc(""); }} startIcon={<Plus size={13} />}>Nova Role</Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={totalPending === 0}
              startIcon={saved ? <CheckCircle size={14} /> : saving ? undefined : <Save size={14} />}>
              {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {totalPending > 0 && <Badge color="warning" size="sm" className="mb-3">{totalPending} alteração{totalPending > 1 ? "ões" : ""} pendente{totalPending > 1 ? "s" : ""}</Badge>}
        {erro && <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs bg-error-50 text-error-600 mb-3"><AlertTriangle size={13} />{erro}</div>}

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold sticky left-0 z-10 min-w-[140px] text-gray-600 bg-gray-50">Módulo</th>
                {(["desenvolvedor", "admin"] as const).map(r => (
                  <th key={r} className="px-3 py-3 text-center font-semibold min-w-[80px] text-gray-400">{r === "desenvolvedor" ? "Dev" : "Admin"}</th>
                ))}
                {rolesAtivas.map(({ key, label }) => (
                  <th key={key} className="px-3 py-3 text-center font-semibold min-w-[80px] text-gray-700">
                    <div className="flex flex-col items-center gap-1">
                      <span>{label}</span>
                      <button onClick={() => handleDesativarRole(key)} title="Desativar" className="opacity-30 hover:opacity-100"><Trash2 size={10} className="text-error-500" /></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULO_GRUPOS.map(({ label: grupoLabel, modulos }) => (
                <Fragment key={grupoLabel}>
                  <tr className="bg-gray-100"><td colSpan={2 + rolesAtivas.length + 2} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">{grupoLabel}</td></tr>
                  {modulos.map((modulo, idx) => (
                    <tr key={modulo} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} border-b border-gray-100`}>
                      <td className={`px-4 py-2.5 font-medium sticky left-0 z-10 text-gray-800 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>{MODULO_LABEL[modulo]}</td>
                      {(["desenvolvedor", "admin"] as const).map(role => (
                        <td key={role} className="px-3 py-2.5 text-center"><span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-success-50 text-success-600"><PenLine size={13} /></span></td>
                      ))}
                      {rolesAtivas.map(({ key: role }) => {
                        const cur = perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false };
                        const level = getLevel(cur.pode_ler, cur.pode_escrever);
                        const dirty = isDirty(role, modulo);
                        const lvl = levels[level];
                        return (
                          <td key={role} className="px-3 py-2.5 text-center">
                            <button onClick={() => toggleLevel(role, modulo)}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110 ${lvl.bg} ${lvl.color}`}
                              style={dirty ? { outline: "2px solid #DB9864", outlineOffset: "1px" } : {}}>
                              <lvl.Icon size={13} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">Clique em uma célula para alternar: Sem acesso → Leitura → Leitura+Escrita. Pendências ficam com borda dourada.</p>
      </Card>

      <Modal isOpen={novaRoleOpen} onClose={() => setNovaRoleOpen(false)} title="Nova Role" description="Uma nova coluna aparecerá no grid com tudo zerado" size="sm">
        <div className="space-y-4">
          <InputField label="Nome (slug) *" placeholder="ex: supervisor" value={novaRoleNome} onChange={e => setNovaRoleNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} hint="Apenas letras minúsculas, números e underscore" />
          <InputField label="Descrição (opcional)" placeholder="ex: Supervisor de produção" value={novaRoleDesc} onChange={e => setNovaRoleDesc(e.target.value)} />
          {erroNovaRole && <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-error-50 text-error-600"><AlertTriangle size={12} />{erroNovaRole}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setNovaRoleOpen(false)}>Cancelar</Button>
            <Button size="md" onClick={handleCriarRole} loading={criandoRole} disabled={!novaRoleNome.trim()} startIcon={!criandoRole ? <Plus size={14} /> : undefined}>Criar Role</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
