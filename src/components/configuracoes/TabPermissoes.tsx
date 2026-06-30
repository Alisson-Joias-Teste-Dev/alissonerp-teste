"use client";

import { useState, useEffect } from "react";
import {
  Save,
  CheckCircle,
  Plus,
  Lock,
  Eye,
  PenLine,
} from "lucide-react";
import { Button, Spinner, Badge, MessageBox, Modal, Input } from "@/components/ui";
import { useErrorStore } from "@/stores/errorStore";
import TabelaPermissoes from "./permissoes/TabelaPermissoes";

// ─── Paleta (tema claro) ─────────────────────────────────────────────────────
const P = {
  bg:       "#f9fafb",  // gray-50
  card:     "#ffffff",  // white
  border:   "#e5e7eb",  // gray-200
  creme:    "#111827",  // gray-900 — texto principal
  sage:     "#6b7280",  // gray-500 — texto secundário
  muted:    "#9ca3af",  // gray-400 — texto mutado
  dourado:  "#d97706",  // amber-600
  verde:    "#16a34a",  // green-600
  vermelho: "#dc2626",  // red-600
};

// ─── Constantes e helpers ────────────────────────────────────────────────────

const MODULO_LABEL: Record<string, string> = {
  dashboard:        "Dashboard",
  dashboard_fabrica:"Dashboard Fábrica",
  dashboard_comercial: "Dashboard Comercial",
  ordens:           "Ordens",
  pcp:              "PCP",
  distribuicao:     "Distribuição",
  purificacao:      "Purificação",
  estoque:          "Estoque",
  quebra:           "Quebra",
  insumos:          "Insumos",
  compras:          "Compras",
  protocolo:        "Protocolo",
  conferencia:      "Conferência",
  entrega:          "Entrega",
  auditoria:        "Auditoria",
  vendas:           "Vendas",
  financeiro:       "Financeiro",
  produtos:         "Produtos",
  precificacao:     "Precificação",
  configuracoes:    "Configurações",
};

const MODULO_GRUPOS = [
  { label: "📊 Geral",       modulos: ["dashboard", "dashboard_fabrica"] },
  { label: "🔧 Produção",    modulos: ["ordens", "pcp", "distribuicao", "purificacao"] },
  { label: "📦 Suprimentos", modulos: ["estoque", "quebra", "insumos", "compras"] },
  { label: "🚚 Logística",   modulos: ["protocolo", "conferencia", "entrega"] },
  { label: "✅ Qualidade",   modulos: ["auditoria"] },
  { label: "💼 Comercial",   modulos: ["vendas", "dashboard_comercial", "financeiro", "produtos", "precificacao"] },
  { label: "⚙️ Sistema",    modulos: ["configuracoes"] },
];

type PermMap = Record<string, Record<string, { pode_ler: boolean; pode_escrever: boolean }>>;

function getLevel(pode_ler: boolean, pode_escrever: boolean): 0 | 1 | 2 {
  if (pode_escrever) return 2;
  if (pode_ler)      return 1;
  return 0;
}

function fromLevel(level: 0 | 1 | 2) {
  return { pode_ler: level >= 1, pode_escrever: level === 2 };
}

type RoleItem = { key: string; label: string; ativo: boolean };

const SUPER_ADMINS = ["desenvolvedor", "admin"];

function labelFromNome(nome: string): string {
  const map: Record<string, string> = {
    gerente_fabrica:    "G. Fábrica",
    gerente_loja:       "G. Loja",
    ourives:            "Ourives",
    motoboy:            "Motoboy",
    consultora:         "Consultora",
    estoquista_fabrica: "Est. Fáb.",
    estoquista_loja:    "Est. Loja",
    pcp:                "PCP",
  };
  return map[nome] ?? nome.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function TabPermissoes() {
  const [perms, setPerms]           = useState<PermMap>({});
  const [original, setOriginal]     = useState<PermMap>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [erro, setErro]             = useState("");

  // Roles dinâmicas (excluindo super-admins)
  const [rolesAtivas, setRolesAtivas] = useState<RoleItem[]>([]);

  // Modal Nova Role
  const [novaRoleOpen,  setNovaRoleOpen]  = useState(false);
  const [novaRoleNome,  setNovaRoleNome]  = useState("");
  const [novaRoleDesc,  setNovaRoleDesc]  = useState("");
  const [criandoRole,   setCriandoRole]   = useState(false);
  const [erroNovaRole,  setErroNovaRole]  = useState("");

  async function carregarRoles() {
    const res = await fetch("/api/configuracoes/roles").catch((e) => { useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao carregar roles", { level: "warning" }); return null; });
    if (!res?.ok) return;
    const data = await res.json() as { roles: { nome: string; descricao: string; ativo: boolean }[] };
    setRolesAtivas(
      (data.roles ?? [])
        .filter(r => !SUPER_ADMINS.includes(r.nome) && r.ativo)
        .map(r => ({ key: r.nome, label: labelFromNome(r.nome), ativo: r.ativo }))
    );
  }

  async function carregarPermissoes() {
    const res = await fetch("/api/configuracoes/permissoes").catch((e) => { useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao carregar permissões", { level: "warning" }); return null; });
    if (!res?.ok) { setErro("Erro ao carregar permissões"); setLoading(false); return; }
    const data = await res.json();
    const map: PermMap = {};
    for (const { role, modulos } of (data.permissoes ?? [])) {
      map[role] = {};
      for (const m of modulos) {
        map[role][m.modulo] = { pode_ler: m.pode_ler, pode_escrever: m.pode_escrever };
      }
    }
    setPerms(map);
    setOriginal(JSON.parse(JSON.stringify(map)));
    setLoading(false);
  }

  useEffect(() => {
    Promise.all([carregarRoles(), carregarPermissoes()]);
   
  }, []);

  function toggleLevel(role: string, modulo: string) {
    setPerms(prev => {
      const cur = prev[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false };
      const curLevel = getLevel(cur.pode_ler, cur.pode_escrever);
      const nextLevel = ((curLevel + 1) % 3) as 0 | 1 | 2;
      return {
        ...prev,
        [role]: { ...(prev[role] ?? {}), [modulo]: fromLevel(nextLevel) },
      };
    });
  }

  function isDirty(role: string, modulo: string) {
    const cur = perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false };
    const ori = original[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false };
    return cur.pode_ler !== ori.pode_ler || cur.pode_escrever !== ori.pode_escrever;
  }

  const totalPending = rolesAtivas.flatMap(r =>
    Object.keys(MODULO_LABEL).filter(m => isDirty(r.key, m))
  ).length;

  async function handleCriarRole() {
    const nome = novaRoleNome.trim().toLowerCase();
    if (!nome) { setErroNovaRole("Nome obrigatório"); return; }
    setCriandoRole(true); setErroNovaRole("");
    const res = await fetch("/api/configuracoes/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, descricao: novaRoleDesc.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    setCriandoRole(false);
    if (!res.ok) { setErroNovaRole(data.error ?? `Erro ${res.status}`); return; }
    setNovaRoleOpen(false);
    setNovaRoleNome("");
    setNovaRoleDesc("");
    await Promise.all([carregarRoles(), carregarPermissoes()]);
  }

  async function handleDesativarRole(nome: string) {
    if (!confirm(`Desativar a role "${nome}"? Ela sumirá do grid e do dropdown de usuários.`)) return;
    await fetch(`/api/configuracoes/roles/${encodeURIComponent(nome)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: false }),
    });
    await carregarRoles();
  }

  async function handleSave() {
    setSaving(true); setErro(""); setSaved(false);
    const changes = rolesAtivas.flatMap(({ key: role }) =>
      Object.keys(MODULO_LABEL)
        .filter(modulo => isDirty(role, modulo))
        .map(modulo => ({
          role,
          modulo,
          ...( perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false }),
        }))
    );
    try {
      const res = await fetch("/api/configuracoes/permissoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOriginal(JSON.parse(JSON.stringify(perms)));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + botão salvar */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>Permissões por Role</p>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            Configure o acesso de cada role aos módulos do sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalPending > 0 && (
            <Badge color="dourado">
              {totalPending} alteração{totalPending > 1 ? "ões" : ""} pendente{totalPending > 1 ? "s" : ""}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => { setNovaRoleOpen(true); setErroNovaRole(""); setNovaRoleNome(""); setNovaRoleDesc(""); }}>
            <Plus size={13} /> Nova Role
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={totalPending === 0} onClick={handleSave}>
            {saved ? <><CheckCircle size={14} /> Salvo!</> : <><Save size={14} /> Salvar Alterações</>}
          </Button>
        </div>
      </div>

      {erro && (
        <MessageBox tipo="erro" mensagem={erro} onFechar={() => setErro("")} />
      )}

      {/* Legenda */}
      <div className="flex items-center gap-5 text-[11px]" style={{ color: P.muted }}>
        <div className="flex items-center gap-1.5">
          <Lock size={11} />
          <span>Sem acesso</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Eye size={11} style={{ color: "#0ea5e9" }} />
          <span style={{ color: "#0ea5e9" }}>Somente leitura</span>
        </div>
        <div className="flex items-center gap-1.5">
          <PenLine size={11} style={{ color: P.verde }} />
          <span style={{ color: P.verde }}>Leitura + Escrita</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: P.dourado }} />
          <span>Célula modificada (não salva)</span>
        </div>
      </div>

      {/* Matriz */}
      <TabelaPermissoes
        rolesAtivas={rolesAtivas}
        perms={perms}
        toggleLevel={toggleLevel}
        isDirty={isDirty}
        handleDesativarRole={handleDesativarRole}
      />

      <p className="text-[10px]" style={{ color: P.muted }}>
        Clique em uma célula para alternar: Sem acesso → Leitura → Leitura+Escrita → Sem acesso
        · Alterações pendentes ficam com borda dourada · Clique em Salvar para aplicar
      </p>

      {/* ── Modal Nova Role ──────────────────────────────────────────────── */}
      <Modal isOpen={novaRoleOpen} onClose={() => setNovaRoleOpen(false)} title="Nova Role" description="Uma nova coluna aparecerá no grid com tudo zerado">
        <div className="space-y-3">
          <Input
            label="Nome (slug) *"
            type="text"
            value={novaRoleNome}
            onChange={e => setNovaRoleNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="ex: supervisor"
          />
          <Input
            label="Descrição (opcional)"
            type="text"
            value={novaRoleDesc}
            onChange={e => setNovaRoleDesc(e.target.value)}
            placeholder="ex: Supervisor de produção"
          />
        </div>

        {erroNovaRole && (
          <div className="mt-3">
            <MessageBox tipo="erro" mensagem={erroNovaRole} onFechar={() => setErroNovaRole("")} />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" size="sm" onClick={() => setNovaRoleOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" loading={criandoRole} disabled={!novaRoleNome.trim()} onClick={handleCriarRole}>
            <Plus size={13} /> Criar Role
          </Button>
        </div>
      </Modal>
    </div>
  );
}
