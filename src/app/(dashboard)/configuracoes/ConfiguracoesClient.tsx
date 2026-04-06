"use client";

import { useState, useTransition, useEffect, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Webhook,
  Users,
  Save,
  CheckCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Bot,
  Eye,
  EyeOff,
  Camera,
  Loader2,
  Warehouse,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  X,
  Shield,
  Lock,
  PenLine,
  Flame,
  MapPin,
  Wrench,
  Link2,
  DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispararWebhook } from "@/lib/webhooks";
import UserEditDrawer, { type UsuarioEdit, type Deposito as DepositoEdit } from "@/components/UserEditDrawer";
import { useAuth } from "@/hooks/useAuth";
import LocaisEstoqueTab from "@/components/LocaisEstoqueTab";

// ─── Paleta (tema claro — alinhado com aba Usuários) ─────────────────────────
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

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Parametros {
  id?: number;
  ouro: number;
  dollar: number;
  euro: number;
  prata: number;
  updated_at?: string;
}

interface Webhook {
  id: number;
  nome: string;
  url: string;
  ativo: boolean;
  descricao: string | null;
  ultimo_disparo: string | null;
  total_disparos: number;
}

interface WebhookLog {
  id: number;
  webhook_nome: string | null;
  response_status: number | null;
  erro: string | null;
  created_at: string;
}

interface Usuario {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  created_at: string;
  avatar_url: string | null;
  tipos_ordem_permitidos?: string[];
  tipos_protocolo_permitidos?: string[];
}

interface TeorOuro {
  id: number;
  insumo_id: number;
  nome: string;
  teor: number;
  ativo: boolean;
  sku: string;
  updated_at: string;
}

interface LigaTipo {
  id: number;
  tipo_18k_insumo_id: number;
  tipo_18k_nome: string;
  liga_insumo_id: number;
  liga_nome: string;
  teor_default: number;
  ativo: boolean;
  saldo_liga: number;
}

interface Props {
  parametros: Parametros;
  webhooks: Webhook[];
  logs: WebhookLog[];
  usuarios: Usuario[];
  depositos: DepositoEdit[];
  teores: TeorOuro[];
  ligaTipos: LigaTipo[];
}

type Tab = "parametros" | "webhooks" | "usuarios" | "ia" | "depositos" | "permissoes" | "teores" | "locais" | "tipos_servico" | "cotacoes" | "integracoes";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

// ─── Tab Parâmetros ───────────────────────────────────────────────────────────
function TabParametros({ parametros }: { parametros: Parametros }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({
    ouro:   String(parametros.ouro   ?? ""),
    dollar: String(parametros.dollar ?? ""),
    euro:   String(parametros.euro   ?? ""),
    prata:  String(parametros.prata  ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSave() {
    setSaving(true); setErro(""); setSaved(false);
    const res = await fetch("/api/configuracoes/parametros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ouro:   Number(form.ouro),
        dollar: Number(form.dollar),
        euro:   Number(form.euro),
        prata:  Number(form.prata),
      }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setErro(d.error ?? "Erro ao salvar"); return; }
    setSaved(true);
    startTransition(() => router.refresh());
    setTimeout(() => setSaved(false), 3000);
  }

  const campos = [
    { key: "ouro",   label: "Cotação Ouro", prefix: "R$/g" },
    { key: "dollar", label: "Dólar",        prefix: "R$"   },
    { key: "euro",   label: "Euro",         prefix: "R$"   },
    { key: "prata",  label: "Prata",        prefix: "R$/g" },
  ] as const;

  return (
    <div className="space-y-5 max-w-md">
      <div>
        <p className="text-xs" style={{ color: P.muted }}>
          Atualizado em: {fmtDate(parametros.updated_at ?? null)}
        </p>
      </div>

      <div className="space-y-3">
        {campos.map(({ key, label, prefix }) => (
          <div key={key}>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
              {label}
            </label>
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{ border: `1px solid ${P.border}` }}
            >
              <span
                className="px-3 py-2.5 text-xs border-r"
                style={{ backgroundColor: P.bg, color: P.muted, borderColor: P.border }}
              >
                {prefix}
              </span>
              <input
                type="number"
                step="0.01"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                style={{ color: P.creme }}
              />
            </div>
          </div>
        ))}
      </div>

      {erro && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{ backgroundColor: P.vermelho + "22", color: P.vermelho }}
        >
          <AlertTriangle size={13} /> {erro}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity"
        style={{ backgroundColor: P.verde, color: "#fff" }}
      >
        {saved ? (
          <><CheckCircle size={15} /> Salvo!</>
        ) : saving ? (
          <><RefreshCw size={15} className="animate-spin" /> Salvando...</>
        ) : (
          <><Save size={15} /> Salvar Cotações</>
        )}
      </button>
    </div>
  );
}

// ─── Tab Webhooks ─────────────────────────────────────────────────────────────
function TabWebhooks({ webhooks, logs }: { webhooks: Webhook[]; logs: WebhookLog[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toggling, setToggling] = useState<number | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const supabase = createClient();

  async function toggleAtivo(wh: Webhook) {
    setToggling(wh.id);
    await supabase
      .from("webhook_config")
      .update({ ativo: !wh.ativo })
      .eq("id", wh.id);
    setToggling(null);
    startTransition(() => router.refresh());
  }

  async function testar(nome: string) {
    setTestando(nome);
    const result = await dispararWebhook(nome, { teste: true, ts: Date.now() });
    setTestResult((r) => ({
      ...r,
      [nome]: {
        ok: result.success,
        msg: result.success
          ? `HTTP ${result.status}`
          : (result.error ?? "Erro desconhecido"),
      },
    }));
    setTestando(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {/* Tabela de webhooks */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
              {["Nome", "Descrição", "Disparos", "Último", "Ativo", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium"
                  style={{ color: P.muted }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh) => {
              const tr = testResult[wh.nome];
              return (
                <tr
                  key={wh.id}
                  style={{ borderBottom: `1px solid ${P.bg}` }}
                  className="hover:bg-[#0F2922]/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs" style={{ color: P.dourado }}>
                      {wh.nome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: P.sage }}>
                    {wh.descricao ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs text-center" style={{ color: P.creme }}>
                    {wh.total_disparos}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: P.muted }}>
                    {wh.ultimo_disparo ? fmtDate(wh.ultimo_disparo) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAtivo(wh)}
                      disabled={toggling === wh.id}
                      className="flex items-center gap-1.5 text-xs disabled:opacity-40 transition-opacity"
                      style={{ color: wh.ativo ? P.verde : P.muted }}
                    >
                      {wh.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      {wh.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {tr && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: tr.ok ? P.verde + "22" : P.vermelho + "22",
                            color: tr.ok ? P.verde : P.vermelho,
                          }}
                        >
                          {tr.msg}
                        </span>
                      )}
                      <button
                        onClick={() => testar(wh.nome)}
                        disabled={testando === wh.nome || !wh.ativo}
                        className="text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-30 transition-opacity flex items-center gap-1"
                        style={{ backgroundColor: P.border, color: P.creme }}
                      >
                        {testando === wh.nome ? (
                          <RefreshCw size={10} className="animate-spin" />
                        ) : (
                          <RefreshCw size={10} />
                        )}
                        Testar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Log de disparos */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: P.muted }}>
          Log — últimos 30 disparos
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                  {["Data", "Webhook", "Status", "Erro"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] uppercase tracking-widest font-medium"
                      style={{ color: P.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center" style={{ color: P.muted }}>
                      Nenhum disparo registrado ainda
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr
                      key={l.id}
                      style={{ borderBottom: `1px solid ${P.bg}` }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: P.muted }}>
                        {fmtDate(l.created_at)}
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: P.dourado }}>
                        {l.webhook_nome ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {l.response_status ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor:
                                l.response_status < 300 ? P.verde + "22" : P.vermelho + "22",
                              color: l.response_status < 300 ? P.verde : P.vermelho,
                            }}
                          >
                            {l.response_status}
                          </span>
                        ) : (
                          <span style={{ color: P.muted }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: P.vermelho }}>
                        {l.erro ?? ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Usuários ─────────────────────────────────────────────────────────────
function TabUsuarios({ usuarios: usuariosInit, depositos, initialUserId }: {
  usuarios: Usuario[];
  depositos: DepositoEdit[];
  initialUserId?: string | null;
}) {
  const ROLE_LABEL: Record<string, string> = {
    desenvolvedor:      "Desenvolvedor",
    admin:              "Admin",
    gerente_fabrica:    "Gerente Fábrica",
    gerente_loja:       "Gerente Loja",
    ourives:            "Ourives",
    motoboy:            "Motoboy",
    consultora:         "Consultora",
    estoquista_fabrica: "Estoquista Fábrica",
    estoquista_loja:    "Estoquista Loja",
    pcp:                "PCP",
  };

  // Roles disponíveis no dropdown — carregadas da API (desenvolvedor excluído — proteção intencional)
  const [rolesDisponiveis, setRolesDisponiveis] = useState([
    { value: "admin",              label: "Admin" },
    { value: "gerente_fabrica",    label: "Gerente Fábrica" },
    { value: "gerente_loja",       label: "Gerente Loja" },
    { value: "ourives",            label: "Ourives" },
    { value: "motoboy",            label: "Motoboy" },
    { value: "consultora",         label: "Consultora" },
    { value: "estoquista_fabrica", label: "Estoquista Fábrica" },
    { value: "estoquista_loja",    label: "Estoquista Loja" },
    { value: "pcp",                label: "PCP" },
  ]);

  const router = useRouter();
  const { user: userLogado, role: roleLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosInit);
  const [editando, setEditando] = useState<UsuarioEdit | null>(null);

  // ── Estado: modal Novo Usuário ──────────────────────────────────────────────
  const [showNovoUsuarioModal, setShowNovoUsuarioModal] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState({ nome: "", email: "", senha: "", role: "" });
  const [criandoUsuario, setCriandoUsuario] = useState(false);
  const [erroNovoUsuario, setErroNovoUsuario] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [novaFotoPreview, setNovaFotoPreview] = useState<string | null>(null);
  const novaFotoRef = useRef<HTMLInputElement>(null);

  const podecriarUsuario = roleLogado === "admin" || roleLogado === "desenvolvedor";

  // Carrega roles ativas da API para o dropdown "Novo Usuário"
  useEffect(() => {
    fetch("/api/configuracoes/roles")
      .then(r => r.ok ? r.json() : null)
      .then((data: { roles: { nome: string; descricao: string; ativo: boolean }[] } | null) => {
        if (!data?.roles) return;
        setRolesDisponiveis(
          data.roles
            .filter(r => r.ativo && r.nome !== "desenvolvedor")
            .map(r => ({ value: r.nome, label: ROLE_LABEL[r.nome] ?? r.nome }))
        );
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-abre drawer quando há ?user=UUID na URL
  useEffect(() => {
    if (!initialUserId) return;
    const u = usuariosInit.find((u) => u.id === initialUserId);
    if (u) {
      setEditando({
        id:                    u.id,
        email:                 u.email,
        nome:                  u.nome,
        role:                  u.role,
        ativo:                 u.ativo,
        avatar_url:            u.avatar_url ?? null,
        deposito_id:           null,
        vendedor_id:           null,
        tipos_ordem_permitidos:     u.tipos_ordem_permitidos ?? [],
        tipos_protocolo_permitidos: u.tipos_protocolo_permitidos ?? [],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId]);

  function abrirDrawer(u: Usuario) {
    setEditando({
      id:                         u.id,
      email:                      u.email,
      nome:                       u.nome,
      role:                       u.role,
      ativo:                      u.ativo,
      avatar_url:                 u.avatar_url ?? null,
      deposito_id:                null,
      vendedor_id:                null,
      tipos_ordem_permitidos:     u.tipos_ordem_permitidos ?? [],
      tipos_protocolo_permitidos: u.tipos_protocolo_permitidos ?? [],
    });
  }

  function handleSaved(updated: UsuarioEdit) {
    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === updated.id
          ? {
              ...u,
              nome:       updated.nome,
              role:       updated.role,
              ativo:      updated.ativo,
              avatar_url: updated.avatar_url ?? u.avatar_url,
            }
          : u
      )
    );
  }

  function comprimirImagemNovo(file: File, maxSize = 200): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.85);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function abrirModalNovo() {
    setNovoUsuario({ nome: "", email: "", senha: "", role: "" });
    setErroNovoUsuario(null);
    setMostrarSenha(false);
    setNovaFoto(null);
    setNovaFotoPreview(null);
    setShowNovoUsuarioModal(true);
  }

  function fecharModalNovo() {
    if (criandoUsuario) return;
    setShowNovoUsuarioModal(false);
    setErroNovoUsuario(null);
    setNovaFoto(null);
    setNovaFotoPreview(null);
  }

  async function handleCriarUsuario() {
    if (!novoUsuario.nome.trim() || !novoUsuario.email.trim() || !novoUsuario.senha || !novoUsuario.role) {
      setErroNovoUsuario("Todos os campos são obrigatórios");
      return;
    }
    if (novoUsuario.senha.length < 6) {
      setErroNovoUsuario("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setCriandoUsuario(true);
    setErroNovoUsuario(null);
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoUsuario),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroNovoUsuario(data.error ?? `Erro ${res.status}`);
        return;
      }
      // Upload de foto (opcional) — após ter o ID do novo usuário
      let avatarUrl: string | null = null;
      if (novaFoto) {
        const blob = await comprimirImagemNovo(novaFoto);
        const fd = new FormData();
        fd.append("file", blob, "avatar.jpg");
        fd.append("user_id", data.usuario.id);
        const avatarRes = await fetch("/api/user/avatar", { method: "POST", body: fd });
        if (avatarRes.ok) {
          const avatarData = await avatarRes.json() as { avatar_url: string };
          avatarUrl = avatarData.avatar_url;
        }
      }

      // Adiciona o novo usuário na lista local imediatamente
      const criado: Usuario = {
        id:         data.usuario.id,
        email:      data.usuario.email,
        nome:       data.usuario.nome,
        role:       data.usuario.role,
        ativo:      true,
        created_at: new Date().toISOString(),
        avatar_url: avatarUrl,
      };
      setUsuarios((prev) => [criado, ...prev]);
      setShowNovoUsuarioModal(false);
      setNovoUsuario({ nome: "", email: "", senha: "", role: "" });
      setNovaFoto(null);
      setNovaFotoPreview(null);
      router.refresh();
    } catch {
      setErroNovoUsuario("Erro ao criar usuário");
    } finally {
      setCriandoUsuario(false);
    }
  }

  return (
    <>
      {/* Cabeçalho da aba com botão Novo Usuário */}
      {podecriarUsuario && (
        <div className="flex justify-end mb-4">
          <button
            onClick={abrirModalNovo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            <Plus size={15} />
            Novo Usuário
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {["", "Nome", "E-mail", "Role", "Status", "Desde"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-semibold text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum usuário cadastrado
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => abrirDrawer(u)}
                >
                  {/* Avatar */}
                  <td className="px-4 py-3 w-12" onClick={(e) => e.stopPropagation()}>
                    <div className="relative group w-8 h-8 shrink-0 cursor-pointer" onClick={() => abrirDrawer(u)}>
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatar_url}
                          alt={u.nome}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold select-none"
                          style={{ backgroundColor: P.border, color: P.sage }}
                        >
                          {u.nome.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                      )}
                    </div>
                  </td>
                  {/* Nome */}
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {u.nome}
                  </td>
                  {/* Email */}
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.email}
                  </td>
                  {/* Role */}
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: P.dourado + "22", color: "#B37A4A" }}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    {u.ativo ? (
                      <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Ativo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Inativo
                      </span>
                    )}
                  </td>
                  {/* Desde */}
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer de edição */}
      <UserEditDrawer
        usuario={editando}
        depositos={depositos}
        onClose={() => setEditando(null)}
        onSaved={(updated) => { handleSaved(updated); }}
        userLogadoId={userLogado?.id}
      />

      {/* ── Modal: Novo Usuário ──────────────────────────────────────────────── */}
      {showNovoUsuarioModal && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={fecharModalNovo}
        >
          <div
            className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl p-6 md:max-w-md md:max-h-[90vh]"
            style={{ backgroundColor: "#FAFAF7", border: "1px solid #E8DCC8" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "#184036" }}>
                  Novo Usuário
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                  Cria acesso imediato ao sistema
                </p>
              </div>
              <button
                onClick={fecharModalNovo}
                disabled={criandoUsuario}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                <X size={16} style={{ color: "#6B7280" }} />
              </button>
            </div>

            {/* Campos */}
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => novaFotoRef.current?.click()}
                  disabled={criandoUsuario}
                  className="relative w-20 h-20 rounded-full overflow-hidden flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-60"
                  style={{ border: "2px dashed #E8DCC8", backgroundColor: "#FAFAF7" }}
                  title="Adicionar foto"
                >
                  {novaFotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={novaFotoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} style={{ color: "#9CA3AF" }} />
                  )}
                </button>
                <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  {novaFotoPreview ? "Trocar foto" : "Adicionar foto (opcional)"}
                </span>
                <input
                  ref={novaFotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      setErroNovoUsuario("Foto deve ter no máximo 5MB");
                      return;
                    }
                    setNovaFoto(file);
                    setNovaFotoPreview(URL.createObjectURL(file));
                  }}
                />
              </div>

              {/* Nome */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#6B7280" }}>
                  Nome completo
                </label>
                <input
                  type="text"
                  value={novoUsuario.nome}
                  onChange={(e) => setNovoUsuario((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Ana Paula Silva"
                  disabled={criandoUsuario}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors disabled:opacity-60"
                  style={{ border: "1px solid #E8DCC8", backgroundColor: "#fff", color: "#374151" }}
                  onKeyDown={(e) => e.key === "Enter" && handleCriarUsuario()}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#6B7280" }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={novoUsuario.email}
                  onChange={(e) => setNovoUsuario((p) => ({ ...p, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                  disabled={criandoUsuario}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors disabled:opacity-60"
                  style={{ border: "1px solid #E8DCC8", backgroundColor: "#fff", color: "#374151" }}
                  onKeyDown={(e) => e.key === "Enter" && handleCriarUsuario()}
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#6B7280" }}>
                  Senha inicial
                </label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    value={novoUsuario.senha}
                    onChange={(e) => setNovoUsuario((p) => ({ ...p, senha: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    disabled={criandoUsuario}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm outline-none transition-colors disabled:opacity-60"
                    style={{ border: "1px solid #E8DCC8", backgroundColor: "#fff", color: "#374151" }}
                    onKeyDown={(e) => e.key === "Enter" && handleCriarUsuario()}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#6B7280" }}>
                  Perfil de acesso
                </label>
                <select
                  value={novoUsuario.role}
                  onChange={(e) => setNovoUsuario((p) => ({ ...p, role: e.target.value }))}
                  disabled={criandoUsuario}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors disabled:opacity-60 appearance-none"
                  style={{ border: "1px solid #E8DCC8", backgroundColor: "#fff", color: novoUsuario.role ? "#374151" : "#9CA3AF" }}
                >
                  <option value="" disabled>Selecione um perfil…</option>
                  {rolesDisponiveis.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Erro */}
            {erroNovoUsuario && (
              <div className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                <AlertTriangle size={14} className="shrink-0" />
                {erroNovoUsuario}
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={fecharModalNovo}
                disabled={criandoUsuario}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                style={{ border: "1px solid #E8DCC8", color: "#374151", backgroundColor: "#fff" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCriarUsuario}
                disabled={criandoUsuario}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: "#184036", color: "#F3EADA" }}
              >
                {criandoUsuario ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Criando…
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    Criar usuário
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tab IA ───────────────────────────────────────────────────────────────────
interface ConfigIA {
  ia_ativa: string;
  ia_provedor: string;
  ia_modelo_claude: string;
  ia_modelo_openai: string;
  ia_modelo_gemini: string;
  ia_margem_pedra_pct?: string;
}
interface KeysStatus { claude: boolean; openai: boolean; gemini: boolean }
interface ResultadoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
  provedor: string;
}

const PROVEDORES = [
  { id: "claude",  nome: "Claude",  empresa: "Anthropic", prefixo: "sk-ant-" },
  { id: "openai",  nome: "GPT-4o",  empresa: "OpenAI",    prefixo: "sk-"     },
  { id: "gemini",  nome: "Gemini",  empresa: "Google",    prefixo: "AIza"    },
] as const;

function TabIA() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [config, setConfig] = useState<ConfigIA>({
    ia_ativa: "true",
    ia_provedor: "claude",
    ia_modelo_claude: "claude-haiku-4-5-20251001",
    ia_modelo_openai: "gpt-4o",
    ia_modelo_gemini: "gemini-2.0-flash",
  });
  const [keysStatus, setKeysStatus] = useState<KeysStatus>({ claude: false, openai: false, gemini: false });
  const [carregando, setCarregando] = useState(true);

  // Formulário de key
  const [keyProvedor, setKeyProvedor] = useState<"claude" | "openai" | "gemini">("claude");
  const [keyValor, setKeyValor] = useState("");
  const [mostrarKey, setMostrarKey] = useState(false);
  const [salvandoKey, setSalvandoKey] = useState(false);
  const [msgKey, setMsgKey] = useState<{ ok: boolean; texto: string } | null>(null);

  // Alterando provedor/ativa
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Margem de pedras
  const [margemPedra, setMargemPedra] = useState("10");
  const [salvandoMargem, setSalvandoMargem] = useState(false);
  const [msgMargem, setMsgMargem] = useState<{ ok: boolean; texto: string } | null>(null);

  // Teste
  const testFileRef = useRef<HTMLInputElement>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testPeso, setTestPeso] = useState("");
  const [testando, setTestando] = useState(false);
  const [testResult, setTestResult] = useState<ResultadoIA | null>(null);

  // Carregar config na montagem
  useEffect(() => {
    fetch("/api/configuracoes/ia")
      .then((r) => r.json())
      .then((data: { config: ConfigIA; keys_status: KeysStatus }) => {
        setConfig(data.config);
        setKeysStatus(data.keys_status);
        if (data.config.ia_margem_pedra_pct) setMargemPedra(data.config.ia_margem_pedra_pct);
        setCarregando(false);
      })
      .catch(() => setCarregando(false));
  }, []);

  async function salvarProvedor(novoProvedor: string) {
    setSalvandoConfig(true);
    const res = await fetch("/api/configuracoes/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provedor: novoProvedor }),
    });
    setSalvandoConfig(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setMsgKey({ ok: false, texto: "Erro ao salvar provedor: " + (body.error ?? res.status) });
      setTimeout(() => setMsgKey(null), 4000);
      return;
    }
    setConfig((c) => ({ ...c, ia_provedor: novoProvedor }));
    startTransition(() => router.refresh());
  }

  async function toggleIA() {
    const novoValor = config.ia_ativa !== "true";
    setSalvandoConfig(true);
    const res = await fetch("/api/configuracoes/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: novoValor }),
    });
    setSalvandoConfig(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setMsgKey({ ok: false, texto: "Erro ao salvar: " + (body.error ?? res.status) });
      setTimeout(() => setMsgKey(null), 4000);
      return;
    }
    setConfig((c) => ({ ...c, ia_ativa: novoValor ? "true" : "false" }));
  }

  async function salvarMargem() {
    const val = parseFloat(margemPedra);
    if (isNaN(val) || val < 0 || val > 50) {
      setMsgMargem({ ok: false, texto: "Margem deve ser entre 0 e 50%" });
      setTimeout(() => setMsgMargem(null), 3000);
      return;
    }
    setSalvandoMargem(true);
    const res = await fetch("/api/configuracoes/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ margem_pedra_pct: val }),
    });
    setSalvandoMargem(false);
    if (res.ok) {
      setMsgMargem({ ok: true, texto: "Margem salva!" });
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setMsgMargem({ ok: false, texto: body.error ?? "Erro ao salvar." });
    }
    setTimeout(() => setMsgMargem(null), 3000);
  }

  async function salvarKey() {
    if (!keyValor.trim()) return;
    setSalvandoKey(true);
    setMsgKey(null);
    const res = await fetch("/api/configuracoes/ia/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provedor: keyProvedor, api_key: keyValor }),
    });
    setSalvandoKey(false);
    if (res.ok) {
      setKeysStatus((k) => ({ ...k, [keyProvedor]: true }));
      setKeyValor("");
      setMsgKey({ ok: true, texto: "Key salva com sucesso!" });
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setMsgKey({ ok: false, texto: body.error ?? "Erro ao salvar." });
    }
    setTimeout(() => setMsgKey(null), 4000);
  }

  async function testar() {
    if (!testFile || !testPeso) return;
    setTestando(true);
    setTestResult(null);
    const fd = new FormData();
    fd.append("file", testFile);
    fd.append("peso", testPeso);
    const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
    const result = await res.json() as ResultadoIA;
    setTestResult(result);
    setTestando(false);
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm" style={{ color: P.muted }}>
        <Loader2 size={16} className="animate-spin" /> Carregando configurações de IA...
      </div>
    );
  }

  const iaAtiva = config.ia_ativa === "true";
  const modeloAtual = config[`ia_modelo_${config.ia_provedor}` as keyof ConfigIA] ?? "—";

  return (
    <div className="space-y-7 max-w-2xl">

      {/* ── Toggle IA ── */}
      <div
        className="flex items-center justify-between px-5 py-4 rounded-xl"
        style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>
            Validação por IA
          </p>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            {iaAtiva
              ? `Ativa — usando ${config.ia_provedor} · ${modeloAtual}`
              : "Desativada — peso aceito sem conferência da balança"}
          </p>
        </div>
        <button
          onClick={toggleIA}
          disabled={salvandoConfig}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-40"
          style={{ color: iaAtiva ? P.verde : P.muted }}
        >
          {iaAtiva ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          {iaAtiva ? "Ativa" : "Inativa"}
        </button>
      </div>

      {/* ── Provedor ativo ── */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
          Provedor Ativo
        </p>
        <div className="space-y-2">
          {PROVEDORES.map((prov) => {
            const selecionado = config.ia_provedor === prov.id;
            const temKey = keysStatus[prov.id as keyof KeysStatus];
            const modelo = config[`ia_modelo_${prov.id}` as keyof ConfigIA] ?? "—";
            return (
              <button
                key={prov.id}
                onClick={() => !selecionado && salvarProvedor(prov.id)}
                disabled={salvandoConfig}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all disabled:opacity-50 text-left"
                style={{
                  border: `1px solid ${selecionado ? P.sage : P.border}`,
                  backgroundColor: selecionado ? P.sage + "18" : P.card,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: selecionado ? P.sage : P.muted }}
                  >
                    {selecionado && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.sage }} />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: selecionado ? P.creme : P.sage }}>
                      {prov.nome}
                    </span>
                    <span className="text-xs ml-2" style={{ color: P.muted }}>
                      {prov.empresa}
                    </span>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: P.muted }}>
                      {modelo}
                    </p>
                  </div>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={
                    temKey
                      ? { backgroundColor: P.verde + "22", color: P.verde }
                      : { backgroundColor: P.vermelho + "22", color: P.vermelho }
                  }
                >
                  {temKey ? "✓ Key configurada" : "✗ Sem key"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tolerância de Validação ── */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
          Tolerância de Validação
        </p>
        <div
          className="p-4 rounded-xl space-y-4"
          style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
        >
          {/* Metal */}
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
              style={{ backgroundColor: P.dourado + "22", color: P.dourado }}
            >
              🥇
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: P.creme }}>Ouro / Metal</p>
              <p className="text-xs mt-0.5" style={{ color: P.muted }}>
                Tolerância zero — o peso lido pela IA deve coincidir exatamente com o digitado (±0.005g)
              </p>
            </div>
          </div>

          {/* Divisor */}
          <div style={{ borderTop: `1px solid ${P.border}` }} />

          {/* Pedra */}
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
              style={{ backgroundColor: P.sage + "22", color: P.sage }}
            >
              💎
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: P.creme }}>Pedras</p>
              <p className="text-xs mt-0.5 mb-3" style={{ color: P.muted }}>
                Margem configurável — compara o peso calculado (qtd × peso unitário) com a balança
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs whitespace-nowrap" style={{ color: P.sage }}>
                    Margem de erro:
                  </label>
                  <div
                    className="flex items-center rounded-lg overflow-hidden"
                    style={{ border: `1px solid ${P.border}` }}
                  >
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="1"
                      value={margemPedra}
                      onChange={(e) => setMargemPedra(e.target.value)}
                      className="w-16 bg-transparent px-3 py-1.5 text-sm font-mono outline-none text-right"
                      style={{ color: P.creme }}
                    />
                    <span className="px-2 text-xs" style={{ color: P.muted }}>%</span>
                  </div>
                  <button
                    onClick={salvarMargem}
                    disabled={salvandoMargem}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
                    style={{ backgroundColor: P.verde, color: "#fff" }}
                  >
                    {salvandoMargem ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    Salvar
                  </button>
                </div>
                {msgMargem && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                    style={{
                      backgroundColor: msgMargem.ok ? P.verde + "22" : P.vermelho + "22",
                      color: msgMargem.ok ? P.verde : P.vermelho,
                    }}
                  >
                    {msgMargem.ok ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                    {msgMargem.texto}
                  </div>
                )}
              </div>
              <p className="text-[10px] mt-2" style={{ color: P.muted }}>
                Ex: calculou 0.15g, balança mostra 0.14g → diferença 6.7% → dentro de {margemPedra}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Configurar API Key ── */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
          Configurar API Key
        </p>
        <div
          className="p-4 rounded-xl space-y-3"
          style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
        >
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: P.muted }}>
                Provedor
              </label>
              <select
                value={keyProvedor}
                onChange={(e) => { setKeyProvedor(e.target.value as typeof keyProvedor); setKeyValor(""); }}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: P.bg, border: `1px solid ${P.border}`, color: P.creme }}
              >
                {PROVEDORES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.empresa})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: P.muted }}>
              API Key{" "}
              <span style={{ color: P.muted, textTransform: "none", fontWeight: 400 }}>
                (começa com {PROVEDORES.find((p) => p.id === keyProvedor)?.prefixo}...)
              </span>
            </label>
            <div className="flex gap-2">
              <div
                className="flex-1 flex items-center rounded-lg overflow-hidden"
                style={{ border: `1px solid ${P.border}` }}
              >
                <input
                  type={mostrarKey ? "text" : "password"}
                  value={keyValor}
                  onChange={(e) => setKeyValor(e.target.value)}
                  placeholder="Cole a API key aqui..."
                  className="flex-1 bg-transparent px-3 py-2 text-sm outline-none font-mono"
                  style={{ color: P.creme }}
                />
                <button
                  type="button"
                  onClick={() => setMostrarKey((v) => !v)}
                  className="px-2 py-2 transition-colors"
                  style={{ color: P.muted }}
                >
                  {mostrarKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                onClick={salvarKey}
                disabled={salvandoKey || !keyValor.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: P.verde, color: "#fff" }}
              >
                {salvandoKey ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar
              </button>
            </div>
          </div>
          {msgKey && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                backgroundColor: msgKey.ok ? P.verde + "22" : P.vermelho + "22",
                color: msgKey.ok ? P.verde : P.vermelho,
              }}
            >
              {msgKey.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
              {msgKey.texto}
            </div>
          )}
          <p className="text-[10px]" style={{ color: P.muted }}>
            ⚠️ A key é armazenada no banco de dados. Use variáveis de ambiente para maior segurança em produção.
          </p>
        </div>
      </div>

      {/* ── Testar ── */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
          Testar Validação
        </p>
        <div
          className="p-4 rounded-xl space-y-3"
          style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
        >
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: P.muted }}>
                Foto da balança
              </label>
              <input
                ref={testFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { setTestFile(e.target.files?.[0] ?? null); setTestResult(null); }}
              />
              <button
                onClick={() => testFileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
                style={{ border: `1px solid ${P.border}`, color: testFile ? P.verde : P.sage }}
              >
                <Camera size={13} />
                {testFile ? testFile.name.slice(0, 20) + "…" : "Selecionar foto"}
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: P.muted }}>
                Peso digitado (g)
              </label>
              <input
                type="number"
                step="0.001"
                value={testPeso}
                onChange={(e) => { setTestPeso(e.target.value); setTestResult(null); }}
                placeholder="12.340"
                className="px-3 py-2 rounded-lg text-sm font-mono outline-none w-32"
                style={{ backgroundColor: P.bg, border: `1px solid ${P.border}`, color: P.creme }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={testar}
                disabled={testando || !testFile || !testPeso}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: P.dourado, color: P.bg }}
              >
                {testando ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                {testando ? "Analisando..." : "Testar IA"}
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className="px-4 py-3 rounded-xl text-sm space-y-1"
              style={
                testResult.match
                  ? { backgroundColor: P.verde + "18", border: `1px solid ${P.verde}44` }
                  : { backgroundColor: P.vermelho + "18", border: `1px solid ${P.vermelho}44` }
              }
            >
              <p className="font-semibold" style={{ color: testResult.match ? P.verde : P.vermelho }}>
                {testResult.match ? "✅ Peso confirmado" : "❌ " + testResult.mensagem}
              </p>
              {testResult.match && (
                <p style={{ color: P.sage }}>Balança: {testResult.peso_balanca}g</p>
              )}
              <p className="text-[11px]" style={{ color: P.muted }}>
                Provedor: {testResult.provedor} · Confiança: {testResult.confianca}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab Depósitos/Setores ────────────────────────────────────────────────────
interface DepositoItem { id: number; nome: string; tipo: string; ativo: boolean }
interface SetorItem    { id: number; nome: string; deposito_id: number | null; ativo: boolean }

function TabDepositos() {
  const [depositos, setDepositos]     = useState<DepositoItem[]>([]);
  const [setores, setSetores]         = useState<SetorItem[]>([]);
  const [expanded, setExpanded]       = useState<number | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // Formulário depósito
  const [showDepForm, setShowDepForm] = useState(false);
  const [editingDep, setEditingDep]   = useState<DepositoItem | null>(null);
  const [depNome, setDepNome]         = useState("");
  const [savingDep, setSavingDep]     = useState(false);

  // Formulário setor
  const [showSetorForm, setShowSetorForm] = useState<number | null>(null); // deposito_id
  const [editingSetor, setEditingSetor]   = useState<SetorItem | null>(null);
  const [setorNome, setSetorNome]         = useState("");
  const [savingSetor, setSavingSetor]     = useState(false);

  async function loadAll() {
    setLoading(true);
    const [deps, sets] = await Promise.all([
      fetch("/api/depositos").then(r => r.json()),
      fetch("/api/setores").then(r => r.json()),
    ]);
    setDepositos(Array.isArray(deps) ? deps : []);
    setSetores(Array.isArray(sets) ? sets : []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  // ── Depósito CRUD ──
  async function salvarDeposito() {
    if (!depNome.trim()) return;
    setSavingDep(true); setError("");
    try {
      if (editingDep) {
        const res = await fetch(`/api/depositos/${editingDep.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: depNome }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      } else {
        const res = await fetch("/api/depositos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: depNome, tipo: "producao" }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      }
      setShowDepForm(false); setEditingDep(null); setDepNome("");
      await loadAll();
    } catch (e) { setError((e as Error).message); }
    setSavingDep(false);
  }

  async function toggleDeposito(dep: DepositoItem) {
    if (dep.id === 1) return;
    const res = await fetch(`/api/depositos/${dep.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !dep.ativo }),
    });
    if (res.ok) await loadAll();
  }

  // ── Setor CRUD ──
  async function salvarSetor(depositoId: number) {
    if (!setorNome.trim()) return;
    setSavingSetor(true); setError("");
    try {
      if (editingSetor) {
        const res = await fetch(`/api/setores/${editingSetor.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: setorNome }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      } else {
        const res = await fetch("/api/setores", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: setorNome, deposito_id: depositoId }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      }
      setShowSetorForm(null); setEditingSetor(null); setSetorNome("");
      await loadAll();
    } catch (e) { setError((e as Error).message); }
    setSavingSetor(false);
  }

  async function toggleSetor(s: SetorItem) {
    const res = await fetch(`/api/setores/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !s.ativo }),
    });
    if (res.ok) await loadAll();
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8" style={{ color: P.sage }}>
      <Loader2 size={16} className="animate-spin" /> Carregando...
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: P.creme }}>
          Depósitos / Operadores
        </h2>
        <button
          onClick={() => { setShowDepForm(true); setEditingDep(null); setDepNome(""); setError(""); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
          style={{ backgroundColor: P.border, color: P.creme }}
        >
          <Plus size={13} /> Novo Depósito
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-[12px]" style={{ backgroundColor: "#fef2f2", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Formulário novo/editar depósito */}
      {showDepForm && (
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: P.card, border: `1px solid ${P.border}` }}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold" style={{ color: P.sage }}>
              {editingDep ? "Editar Depósito" : "Novo Depósito"}
            </span>
            <button onClick={() => { setShowDepForm(false); setEditingDep(null); setDepNome(""); }}>
              <X size={14} style={{ color: P.muted }} />
            </button>
          </div>
          <input
            autoFocus
            type="text"
            value={depNome}
            onChange={e => setDepNome(e.target.value)}
            placeholder="Nome do depósito..."
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ backgroundColor: P.bg, border: `1px solid ${P.border}`, color: P.creme }}
            onKeyDown={e => e.key === "Enter" && salvarDeposito()}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowDepForm(false); setEditingDep(null); setDepNome(""); }}
              className="px-3 py-1.5 rounded-lg text-[12px]" style={{ color: P.muted }}
            >Cancelar</button>
            <button
              onClick={salvarDeposito}
              disabled={savingDep || !depNome.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-40"
              style={{ backgroundColor: P.verde, color: "#fff" }}
            >
              {savingDep ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Lista de depósitos */}
      <div className="space-y-2">
        {depositos.map(dep => {
          const depSetores = setores.filter(s => s.deposito_id === dep.id);
          const isOpen = expanded === dep.id;

          return (
            <div key={dep.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
              {/* Linha do depósito */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                style={{ backgroundColor: isOpen ? P.card : P.bg }}
                onClick={() => setExpanded(isOpen ? null : dep.id)}
              >
                {isOpen ? <ChevronDown size={14} style={{ color: P.sage }} /> : <ChevronRight size={14} style={{ color: P.muted }} />}
                <Warehouse size={14} style={{ color: dep.ativo ? P.sage : P.muted }} />
                <span className="flex-1 text-sm font-medium" style={{ color: dep.ativo ? P.creme : P.muted }}>
                  {dep.nome}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: dep.ativo ? "#dcfce7" : "#fef2f2", color: dep.ativo ? P.verde : P.vermelho }}>
                  {dep.ativo ? "Ativo" : "Inativo"}
                </span>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    title="Editar"
                    onClick={() => { setEditingDep(dep); setDepNome(dep.nome); setShowDepForm(true); setError(""); }}
                    className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
                  >
                    <Pencil size={12} style={{ color: P.sage }} />
                  </button>
                  {dep.id !== 1 && (
                    <button
                      title={dep.ativo ? "Desativar" : "Ativar"}
                      onClick={() => toggleDeposito(dep)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
                    >
                      <Trash2 size={12} style={{ color: dep.ativo ? P.vermelho : P.sage }} />
                    </button>
                  )}
                </div>
              </div>

              {/* Setores do depósito (expandido) */}
              {isOpen && (
                <div className="px-4 pb-3 space-y-2" style={{ borderTop: `1px solid ${P.border}`, backgroundColor: P.card }}>
                  <div className="flex items-center justify-between pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: P.muted }}>
                      Setores ({depSetores.length})
                    </span>
                    <button
                      onClick={() => { setShowSetorForm(dep.id); setEditingSetor(null); setSetorNome(""); setError(""); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
                      style={{ backgroundColor: P.border, color: P.creme }}
                    >
                      <Plus size={11} /> Novo Setor
                    </button>
                  </div>

                  {/* Form novo/editar setor */}
                  {(showSetorForm === dep.id) && (
                    <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: P.sage }}>
                          {editingSetor ? "Editar Setor" : "Novo Setor"}
                        </span>
                        <button onClick={() => { setShowSetorForm(null); setEditingSetor(null); setSetorNome(""); }}>
                          <X size={12} style={{ color: P.muted }} />
                        </button>
                      </div>
                      <input
                        autoFocus
                        type="text"
                        value={setorNome}
                        onChange={e => setSetorNome(e.target.value)}
                        placeholder="Nome do setor..."
                        className="w-full px-2 py-1.5 rounded-lg text-[12px] focus:outline-none"
                        style={{ backgroundColor: P.card, border: `1px solid ${P.border}`, color: P.creme }}
                        onKeyDown={e => e.key === "Enter" && salvarSetor(dep.id)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowSetorForm(null); setEditingSetor(null); setSetorNome(""); }}
                          className="px-2 py-1 rounded text-[11px]" style={{ color: P.muted }}>
                          Cancelar
                        </button>
                        <button
                          onClick={() => salvarSetor(dep.id)}
                          disabled={savingSetor || !setorNome.trim()}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-40"
                          style={{ backgroundColor: P.verde, color: "#fff" }}
                        >
                          {savingSetor ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}

                  {depSetores.length === 0 ? (
                    <p className="text-[12px] py-1" style={{ color: P.muted }}>Nenhum setor vinculado.</p>
                  ) : (
                    <div className="space-y-1">
                      {depSetores.map(s => (
                        <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                          style={{ backgroundColor: P.bg }}>
                          <span className="flex-1 text-[12px]" style={{ color: s.ativo ? P.creme : P.muted }}>
                            {s.nome}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: s.ativo ? "#dcfce7" : "#fef2f2", color: s.ativo ? P.verde : P.vermelho }}>
                            {s.ativo ? "Ativo" : "Inativo"}
                          </span>
                          <button
                            title="Editar"
                            onClick={() => {
                              setEditingSetor(s); setSetorNome(s.nome);
                              setShowSetorForm(dep.id); setError("");
                            }}
                            className="p-1 rounded hover:bg-gray-100"
                          >
                            <Pencil size={11} style={{ color: P.sage }} />
                          </button>
                          <button
                            title={s.ativo ? "Desativar" : "Ativar"}
                            onClick={() => toggleSetor(s)}
                            className="p-1 rounded hover:bg-gray-100"
                          >
                            <Trash2 size={11} style={{ color: s.ativo ? P.vermelho : P.sage }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab Permissões ───────────────────────────────────────────────────────────
const MODULO_LABEL: Record<string, string> = {
  dashboard:        "Dashboard",
  dashboard_fabrica:"Dashboard Fábrica",
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
  { label: "💼 Comercial",   modulos: ["vendas", "financeiro", "produtos", "precificacao"] },
  { label: "⚙️ Sistema",    modulos: ["configuracoes"] },
];

// ALL_ROLES agora é carregado dinamicamente da API /api/configuracoes/roles
// (removido o array hardcoded — ver estado rolesAtivas dentro de TabPermissoes)

type PermMap = Record<string, Record<string, { pode_ler: boolean; pode_escrever: boolean }>>;

// Nível: 0=nenhum 1=ler 2=ler+escrever
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

function TabPermissoes() {
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
    const res = await fetch("/api/configuracoes/roles").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json() as { roles: { nome: string; descricao: string; ativo: boolean }[] };
    setRolesAtivas(
      (data.roles ?? [])
        .filter(r => !SUPER_ADMINS.includes(r.nome) && r.ativo)
        .map(r => ({ key: r.nome, label: labelFromNome(r.nome), ativo: r.ativo }))
    );
  }

  async function carregarPermissoes() {
    const res = await fetch("/api/configuracoes/permissoes").catch(() => null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <Loader2 size={20} className="animate-spin" style={{ color: P.muted }} />
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
            <span
              className="text-[11px] px-2 py-1 rounded-full font-medium"
              style={{ backgroundColor: P.dourado + "22", color: P.dourado }}
            >
              {totalPending} alteração{totalPending > 1 ? "ões" : ""} pendente{totalPending > 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => { setNovaRoleOpen(true); setErroNovaRole(""); setNovaRoleNome(""); setNovaRoleDesc(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-gray-50"
            style={{ borderColor: P.border, color: P.creme }}
          >
            <Plus size={13} /> Nova Role
          </button>
          <button
            onClick={handleSave}
            disabled={saving || totalPending === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: P.verde, color: "#fff" }}
          >
            {saved ? (
              <><CheckCircle size={14} /> Salvo!</>
            ) : saving ? (
              <><RefreshCw size={14} className="animate-spin" /> Salvando...</>
            ) : (
              <><Save size={14} /> Salvar Alterações</>
            )}
          </button>
        </div>
      </div>

      {erro && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: P.vermelho + "22", color: P.vermelho }}
        >
          <AlertTriangle size={13} /> {erro}
        </div>
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
      <div
        className="rounded-xl overflow-auto"
        style={{ border: `1px solid ${P.border}` }}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
              <th
                className="px-4 py-3 text-left font-semibold sticky left-0 z-10 min-w-[140px]"
                style={{ color: P.sage, backgroundColor: P.bg }}
              >
                Módulo
              </th>
              {/* Super-admins — não editáveis */}
              {(["desenvolvedor", "admin"] as const).map(r => (
                <th
                  key={r}
                  className="px-3 py-3 text-center font-semibold min-w-[80px]"
                  style={{ color: P.muted }}
                  title="Super-admin — sempre acesso total"
                >
                  {r === "desenvolvedor" ? "Dev" : "Admin"}
                </th>
              ))}
              {/* Roles editáveis (dinâmicas) */}
              {rolesAtivas.map(({ key, label }) => (
                <th
                  key={key}
                  className="px-3 py-3 text-center font-semibold min-w-[80px]"
                  style={{ color: P.creme }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{label}</span>
                    <button
                      onClick={() => handleDesativarRole(key)}
                      title={`Desativar role "${key}"`}
                      className="opacity-30 hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={10} style={{ color: P.vermelho }} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULO_GRUPOS.map(({ label: grupoLabel, modulos }) => (
              <Fragment key={`grupo-${grupoLabel}`}>
                {/* Linha de grupo */}
                <tr key={`g-${grupoLabel}`} style={{ backgroundColor: "#f3f4f6" }}>
                  <td
                    colSpan={2 + rolesAtivas.length + 2}
                    className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: P.sage }}
                  >
                    {grupoLabel}
                  </td>
                </tr>
                {/* Linhas de módulo */}
                {modulos.map((modulo, idx) => (
                  <tr
                    key={modulo}
                    style={{
                      backgroundColor: idx % 2 === 0 ? P.card : P.bg,
                      borderBottom: `1px solid ${P.border}`,
                    }}
                  >
                    <td
                      className="px-4 py-2.5 font-medium sticky left-0 z-10"
                      style={{
                        color: P.creme,
                        backgroundColor: idx % 2 === 0 ? P.card : P.bg,
                      }}
                    >
                      {MODULO_LABEL[modulo]}
                    </td>
                    {/* Super-admins: sempre nível 2, disabled */}
                    {(["desenvolvedor", "admin"] as const).map(role => (
                      <td key={role} className="px-3 py-2.5 text-center">
                        <div className="flex justify-center">
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
                            style={{ backgroundColor: P.verde + "15", color: P.verde }}
                            title="Super-admin — não editável"
                          >
                            <PenLine size={13} />
                          </span>
                        </div>
                      </td>
                    ))}
                    {/* Roles editáveis (dinâmicas) */}
                    {rolesAtivas.map(({ key: role }) => {
                      const cur   = perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false };
                      const level = getLevel(cur.pode_ler, cur.pode_escrever);
                      const dirty = isDirty(role, modulo);

                      const levelColors: Record<number, { bg: string; color: string; Icon: React.ElementType }> = {
                        0: { bg: "#f3f4f6",     color: P.muted,  Icon: Lock    },
                        1: { bg: "#e0f2fe",     color: "#0284c7", Icon: Eye    },
                        2: { bg: "#dcfce7",     color: "#16a34a", Icon: PenLine},
                      };
                      const { bg, color, Icon } = levelColors[level];

                      return (
                        <td key={role} className="px-3 py-2.5 text-center">
                          <div className="flex justify-center">
                            <button
                              onClick={() => toggleLevel(role, modulo)}
                              title={level === 0 ? "Sem acesso — clique para Leitura" : level === 1 ? "Somente leitura — clique para Leitura+Escrita" : "Leitura+Escrita — clique para remover"}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110"
                              style={{
                                backgroundColor: bg,
                                color,
                                outline: dirty ? `2px solid ${P.dourado}` : "none",
                                outlineOffset: "1px",
                              }}
                            >
                              <Icon size={13} />
                            </button>
                          </div>
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

      <p className="text-[10px]" style={{ color: P.muted }}>
        Clique em uma célula para alternar: Sem acesso → Leitura → Leitura+Escrita → Sem acesso
        · Alterações pendentes ficam com borda dourada · Clique em Salvar para aplicar
      </p>

      {/* ── Modal Nova Role ──────────────────────────────────────────────── */}
      {novaRoleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setNovaRoleOpen(false)}
        >
          <div
            className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-sm md:mx-4 p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: P.creme }}>Nova Role</p>
                <p className="text-xs mt-0.5" style={{ color: P.muted }}>Uma nova coluna aparecerá no grid com tudo zerado</p>
              </div>
              <button onClick={() => setNovaRoleOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
                <X size={15} style={{ color: P.muted }} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>
                  Nome (slug) *
                </label>
                <input
                  type="text"
                  value={novaRoleNome}
                  onChange={e => setNovaRoleNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="ex: supervisor"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#184036]"
                />
                <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>Apenas letras minúsculas, números e underscore</p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>
                  Descrição (opcional)
                </label>
                <input
                  type="text"
                  value={novaRoleDesc}
                  onChange={e => setNovaRoleDesc(e.target.value)}
                  placeholder="ex: Supervisor de produção"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#184036]"
                />
              </div>
            </div>

            {erroNovaRole && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: P.vermelho + "15", color: P.vermelho }}>
                <AlertTriangle size={12} /> {erroNovaRole}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setNovaRoleOpen(false)} className="px-4 py-2 text-sm" style={{ color: P.muted }}>
                Cancelar
              </button>
              <button
                onClick={handleCriarRole}
                disabled={criandoRole || !novaRoleNome.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: "#184036", color: "#F3EADA" }}
              >
                {criandoRole ? <><Loader2 size={13} className="animate-spin" /> Criando...</> : <><Plus size={13} /> Criar Role</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Teores de Ouro ───────────────────────────────────────────────────────
function TabTeores({ teores: initial, ligaTipos: initialLiga }: { teores: TeorOuro[]; ligaTipos: LigaTipo[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [teores, setTeores] = useState<TeorOuro[]>(initial);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editTeor, setEditTeor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [erros, setErros] = useState<Record<number, string>>({});

  const [ligaTipos, setLigaTipos] = useState<LigaTipo[]>(initialLiga);
  const [editandoLigaId, setEditandoLigaId] = useState<number | null>(null);
  const [editLigaTeor, setEditLigaTeor] = useState<string>("");
  const [savingLiga, setSavingLiga] = useState(false);
  const [savedLigaId, setSavedLigaId] = useState<number | null>(null);
  const [errosLiga, setErrosLiga] = useState<Record<number, string>>({});

  async function handleSave(t: TeorOuro) {
    const novoTeor = parseFloat(editTeor) / 100;
    if (isNaN(novoTeor) || novoTeor <= 0 || novoTeor > 1) {
      setErros(prev => ({ ...prev, [t.id]: "Teor deve ser entre 0.01 e 100%" }));
      return;
    }
    setSaving(true);
    setErros(prev => { const n = { ...prev }; delete n[t.id]; return n; });
    const res = await fetch(`/api/purificacao/teores/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teor: novoTeor, user_role: "admin" }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErros(prev => ({ ...prev, [t.id]: d.error ?? "Erro ao salvar" }));
      return;
    }
    setTeores(prev => prev.map(x => x.id === t.id ? { ...x, teor: novoTeor } : x));
    setEditandoId(null);
    setSavedId(t.id);
    setTimeout(() => setSavedId(null), 2000);
    startTransition(() => router.refresh());
  }

  async function handleSaveLiga(lt: LigaTipo) {
    const novoTeor = parseFloat(editLigaTeor) / 100;
    if (isNaN(novoTeor) || novoTeor <= 0 || novoTeor > 1) {
      setErrosLiga(prev => ({ ...prev, [lt.id]: "Teor deve ser entre 0.01 e 100%" }));
      return;
    }
    setSavingLiga(true);
    setErrosLiga(prev => { const n = { ...prev }; delete n[lt.id]; return n; });
    const res = await fetch(`/api/purificacao/liga-tipos/${lt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teor_default: novoTeor, user_role: "admin" }),
    });
    setSavingLiga(false);
    if (!res.ok) {
      const d = await res.json();
      setErrosLiga(prev => ({ ...prev, [lt.id]: d.error ?? "Erro ao salvar" }));
      return;
    }
    setLigaTipos(prev => prev.map(x => x.id === lt.id ? { ...x, teor_default: novoTeor } : x));
    setEditandoLigaId(null);
    setSavedLigaId(lt.id);
    setTimeout(() => setSavedLigaId(null), 2000);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Seção A — Teores de Purificação */}
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: P.creme }}>Teores de Purificação</h3>
        <p className="text-xs mb-3" style={{ color: P.muted }}>
          Teor de ouro puro por liga. Usado no cálculo da purificação (24k esperado).
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Tipo de Ouro", "SKU", "Teor (%)", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teores.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${P.bg}` }}>
                  <td className="px-4 py-3 font-medium text-sm" style={{ color: P.creme }}>{t.nome}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: P.muted }}>{t.sku}</td>
                  <td className="px-4 py-3">
                    {editandoId === t.id ? (
                      <div>
                        <input
                          type="number"
                          value={editTeor}
                          min={1}
                          max={100}
                          step={0.01}
                          onChange={e => setEditTeor(e.target.value)}
                          className="w-24 rounded-lg px-2 py-1 text-sm outline-none"
                          style={{ border: `1px solid ${P.border}`, color: P.creme }}
                          autoFocus
                        />
                        {erros[t.id] && <div className="text-[11px] mt-1" style={{ color: P.vermelho }}>{erros[t.id]}</div>}
                      </div>
                    ) : (
                      <span className="font-semibold" style={{ color: P.dourado }}>
                        {savedId === t.id ? "✓ " : ""}{(t.teor * 100).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: t.ativo ? P.verde : P.muted, fontSize: 12 }}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editandoId === t.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSave(t)}
                          disabled={saving}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                          style={{ backgroundColor: P.verde, color: "#fff" }}
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditandoId(null)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                          style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                        >
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditandoId(t.id); setEditTeor(String((t.teor * 100).toFixed(2))); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                        style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                      >
                        <Pencil size={12} /> Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção B — Mapeamento Liga */}
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: P.creme }}>Mapeamento Liga</h3>
        <p className="text-xs mb-3" style={{ color: P.muted }}>
          Qual liga italiana usar para cada tipo de Ouro 18k na fundição, e o teor padrão de cada combinação.
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Tipo 18k", "Liga", "Teor Padrão (%)", "Saldo Liga", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ligaTipos.map(lt => (
                <tr key={lt.id} style={{ borderBottom: `1px solid ${P.bg}` }}>
                  <td className="px-4 py-3 font-medium text-sm" style={{ color: P.creme }}>{lt.tipo_18k_nome}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: P.muted }}>{lt.liga_nome}</td>
                  <td className="px-4 py-3">
                    {editandoLigaId === lt.id ? (
                      <div>
                        <input
                          type="number"
                          value={editLigaTeor}
                          min={1}
                          max={100}
                          step={0.01}
                          onChange={e => setEditLigaTeor(e.target.value)}
                          className="w-24 rounded-lg px-2 py-1 text-sm outline-none"
                          style={{ border: `1px solid ${P.border}`, color: P.creme }}
                          autoFocus
                        />
                        {errosLiga[lt.id] && <div className="text-[11px] mt-1" style={{ color: P.vermelho }}>{errosLiga[lt.id]}</div>}
                      </div>
                    ) : (
                      <span className="font-semibold" style={{ color: P.dourado }}>
                        {savedLigaId === lt.id ? "✓ " : ""}{(Number(lt.teor_default) * 100).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: P.muted }}>{Number(lt.saldo_liga).toFixed(2)}g</td>
                  <td className="px-4 py-3">
                    <span style={{ color: lt.ativo ? P.verde : P.muted, fontSize: 12 }}>
                      {lt.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editandoLigaId === lt.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSaveLiga(lt)}
                          disabled={savingLiga}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                          style={{ backgroundColor: P.verde, color: "#fff" }}
                        >
                          {savingLiga ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditandoLigaId(null)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                          style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                        >
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditandoLigaId(lt.id); setEditLigaTeor(String((Number(lt.teor_default) * 100).toFixed(2))); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                        style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                      >
                        <Pencil size={12} /> Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Tipos de Serviço ─────────────────────────────────────────────────────

interface TipoServico {
  id: number;
  nome: string;
  ativo: boolean;
  created_at: string;
}

function TabTiposServico() {
  const [tipos, setTipos]             = useState<TipoServico[]>([]);
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState("");

  // Estado form novo/editar
  const [novoNome, setNovoNome]       = useState("");
  const [criando, setCriando]         = useState(false);
  const [erroCriar, setErroCriar]     = useState("");
  const [showForm, setShowForm]       = useState(false);

  const [editandoId, setEditandoId]   = useState<number | null>(null);
  const [editNome, setEditNome]       = useState("");
  const [salvandoId, setSalvandoId]   = useState<number | null>(null);
  const [savedId, setSavedId]         = useState<number | null>(null);

  async function carregar() {
    setLoading(true);
    setErro("");
    const res = await fetch("/api/tipos-servico?todos=true").catch(() => null);
    if (!res?.ok) { setErro("Erro ao carregar tipos"); setLoading(false); return; }
    const data = await res.json();
    setTipos(data.tipos ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function handleCriar() {
    const nome = novoNome.trim();
    if (!nome) { setErroCriar("Nome é obrigatório"); return; }
    setCriando(true); setErroCriar("");
    const res = await fetch("/api/tipos-servico", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    }).catch(() => null);
    setCriando(false);
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}));
      setErroCriar(d?.error ?? "Erro ao criar");
      return;
    }
    setNovoNome(""); setShowForm(false);
    carregar();
  }

  async function handleEditar(id: number, nome: string) {
    const nomeTrimmed = nome.trim();
    if (!nomeTrimmed) return;
    setSalvandoId(id);
    await fetch("/api/tipos-servico", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, nome: nomeTrimmed }),
    }).catch(() => null);
    setSalvandoId(null);
    setEditandoId(null);
    setSavedId(id);
    setTimeout(() => setSavedId(null), 2000);
    carregar();
  }

  async function handleToggleAtivo(t: TipoServico) {
    setSalvandoId(t.id);
    await fetch("/api/tipos-servico", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, ativo: !t.ativo }),
    }).catch(() => null);
    setSalvandoId(null);
    carregar();
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8" style={{ color: P.muted }}>
      <Loader2 size={14} className="animate-spin" /> Carregando...
    </div>
  );

  return (
    <div className="space-y-5 max-w-xl">
      {/* Header + botão novo */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: P.creme }}>Tipos de Serviço</h3>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            Tipos usados em ordens de Serviço Interno. Múltipla seleção por ordem.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setNovoNome(""); setErroCriar(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: P.verde, color: "#fff" }}
          >
            <Plus size={13} /> Novo Tipo
          </button>
        )}
      </div>

      {/* Form novo */}
      {showForm && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ border: `1px solid ${P.border}`, backgroundColor: P.bg }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: P.sage }}>
            Novo Tipo de Serviço
          </p>
          <input
            type="text"
            value={novoNome}
            onChange={e => { setNovoNome(e.target.value); setErroCriar(""); }}
            placeholder="Ex: Polimento Manual"
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#184036]"
            style={{ borderColor: P.border, color: P.creme }}
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleCriar(); if (e.key === "Escape") setShowForm(false); }}
          />
          {erroCriar && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: P.vermelho }}>
              <AlertTriangle size={12} /> {erroCriar}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCriar}
              disabled={criando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: P.verde, color: "#fff" }}
            >
              {criando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar
            </button>
            <button
              onClick={() => { setShowForm(false); setErroCriar(""); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
            >
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Erro geral */}
      {erro && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ backgroundColor: P.vermelho + "15", color: P.vermelho }}>
          <AlertTriangle size={13} /> {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
              {["Nome", "Status", "Ações"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tipos.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm" style={{ color: P.muted }}>
                  Nenhum tipo cadastrado
                </td>
              </tr>
            ) : (
              tipos.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${P.bg}` }} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    {editandoId === t.id ? (
                      <input
                        type="text"
                        value={editNome}
                        onChange={e => setEditNome(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[#184036] w-full max-w-xs"
                        style={{ borderColor: P.border, color: P.creme }}
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handleEditar(t.id, editNome); if (e.key === "Escape") setEditandoId(null); }}
                      />
                    ) : (
                      <span className="font-medium" style={{ color: P.creme }}>
                        {t.nome}
                        {savedId === t.id && (
                          <span className="ml-2 text-xs" style={{ color: P.verde }}>
                            <CheckCircle size={12} className="inline" /> Salvo
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: t.ativo ? P.verde + "15" : P.muted + "20",
                        color: t.ativo ? P.verde : P.muted,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.ativo ? P.verde : P.muted }} />
                      {t.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editandoId === t.id ? (
                        <>
                          <button
                            onClick={() => handleEditar(t.id, editNome)}
                            disabled={salvandoId === t.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ backgroundColor: P.verde, color: "#fff" }}
                          >
                            {salvandoId === t.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditandoId(null)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                            style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                          >
                            <X size={11} /> Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditandoId(t.id); setEditNome(t.nome); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                            style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                          >
                            <Pencil size={11} /> Editar
                          </button>
                          <button
                            onClick={() => handleToggleAtivo(t)}
                            disabled={salvandoId === t.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
                            style={{
                              backgroundColor: t.ativo ? P.vermelho + "15" : P.verde + "15",
                              color: t.ativo ? P.vermelho : P.verde,
                              border: `1px solid ${t.ativo ? P.vermelho + "40" : P.verde + "40"}`,
                            }}
                          >
                            {salvandoId === t.id ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : t.ativo ? (
                              <ToggleLeft size={11} />
                            ) : (
                              <ToggleRight size={11} />
                            )}
                            {t.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px]" style={{ color: P.muted }}>
        Tipos inativos não aparecem no modal de criação de ordens, mas são mantidos no histórico.
      </p>
    </div>
  );
}

// ─── Tab Cotações ─────────────────────────────────────────────────────────────
function TabCotacoes() {
  const [loading, setLoading] = useState(true);
  const [cotacoes, setCotacoes] = useState({ ouro: 0, dollar: 0, euro: 0, prata: 0 });
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [ultimoUpdate, setUltimoUpdate] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function carregarDados() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracoes/cotacoes");
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setCotacoes(data.cotacoes);
      setAutoAtivo(data.config.auto_ativo);
      setUltimoUpdate(data.config.ultimo_update);
    } catch {
      setMsg({ tipo: "erro", texto: "Erro ao carregar cotações" });
    }
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  async function toggleAuto() {
    const novo = !autoAtivo;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/configuracoes/cotacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_ativo: novo }),
    });
    setSaving(false);
    if (res.ok) {
      setAutoAtivo(novo);
      setMsg({ tipo: "ok", texto: `Automático ${novo ? "ativado" : "desativado"}` });
    } else {
      setMsg({ tipo: "erro", texto: "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 3000);
  }

  async function salvarApiKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/configuracoes/cotacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ tipo: "ok", texto: "API key salva com sucesso" });
    } else {
      setMsg({ tipo: "erro", texto: "Erro ao salvar API key" });
    }
    setTimeout(() => setMsg(null), 3000);
  }

  async function atualizarAgora() {
    setAtualizando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/cotacoes", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCotacoes(data.cotacoes);
        setUltimoUpdate(data.atualizado_em);
        setMsg({ tipo: "ok", texto: "Cotações atualizadas com sucesso" });
      } else {
        setMsg({ tipo: "erro", texto: data.error ?? "Erro ao atualizar" });
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Falha na requisição" });
    }
    setAtualizando(false);
    setTimeout(() => setMsg(null), 5000);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: P.muted }}>
        <RefreshCw size={14} className="animate-spin" /> Carregando cotações...
      </div>
    );
  }

  const cards = [
    { label: "Ouro (R$/g)", value: cotacoes.ouro.toFixed(2) },
    { label: "Dólar (R$)",  value: cotacoes.dollar.toFixed(4) },
    { label: "Euro (R$)",   value: cotacoes.euro.toFixed(4) },
    { label: "Prata (R$/g)", value: cotacoes.prata.toFixed(2) },
  ];

  return (
    <div className="space-y-5 max-w-xl">
      {/* Cards de cotação */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
          >
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: P.muted }}>{label}</p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: P.dourado }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Último update */}
      <p className="text-xs" style={{ color: P.muted }}>
        Ultimo update: {ultimoUpdate ? fmtDate(ultimoUpdate) : "Nunca"}
      </p>

      {/* Toggle automático */}
      <div
        className="flex items-center justify-between rounded-xl p-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: P.creme }}>Atualização Automática</p>
          <p className="text-xs" style={{ color: P.muted }}>Atualiza cotações automaticamente via n8n</p>
        </div>
        <button
          onClick={toggleAuto}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm disabled:opacity-40 transition-opacity"
          style={{ color: autoAtivo ? P.verde : P.muted }}
        >
          {autoAtivo ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
          {autoAtivo ? "Ativo" : "Inativo"}
        </button>
      </div>

      {/* API Key */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <p className="text-sm font-medium" style={{ color: P.creme }}>API Key (Open Exchange Rates)</p>
        <div
          className="flex items-center rounded-lg overflow-hidden"
          style={{ border: `1px solid ${P.border}` }}
        >
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole sua API key aqui"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
            style={{ color: P.creme }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-3 py-2.5 transition-opacity hover:opacity-70"
            style={{ color: P.muted }}
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button
          onClick={salvarApiKey}
          disabled={saving || !apiKey.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          <Save size={13} /> Salvar Key
        </button>
      </div>

      {/* Botão atualizar agora */}
      <button
        onClick={atualizarAgora}
        disabled={atualizando}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity"
        style={{ backgroundColor: P.dourado, color: "#fff" }}
      >
        {atualizando ? (
          <><Loader2 size={15} className="animate-spin" /> Atualizando...</>
        ) : (
          <><RefreshCw size={15} /> Atualizar Agora</>
        )}
      </button>

      {/* Mensagem */}
      {msg && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{
            backgroundColor: msg.tipo === "ok" ? P.verde + "22" : P.vermelho + "22",
            color: msg.tipo === "ok" ? P.verde : P.vermelho,
          }}
        >
          {msg.tipo === "ok" ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
          {msg.texto}
        </div>
      )}
    </div>
  );
}

// ─── Tab Integrações ──────────────────────────────────────────────────────────
function TabIntegracoes() {
  const [loading, setLoading] = useState(true);
  const [wooConfigured, setWooConfigured] = useState(false);
  const [kommoConfigured, setKommoConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // WooCommerce fields
  const [wooUrl, setWooUrl] = useState("");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");
  const [showWooKey, setShowWooKey] = useState(false);
  const [showWooSecret, setShowWooSecret] = useState(false);

  // Kommo fields
  const [kommoUrl, setKommoUrl] = useState("");
  const [kommoToken, setKommoToken] = useState("");
  const [showKommoToken, setShowKommoToken] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) {
          const data = await res.json();
          setWooConfigured(data.woo_configured);
          setKommoConfigured(data.kommo_configured);
        }
      } catch { /* silenciar */ }
      setLoading(false);
    })();
  }, []);

  async function salvarWoo() {
    if (!wooUrl.trim() && !wooKey.trim() && !wooSecret.trim()) return;
    setSaving(true);
    setMsg(null);
    const body: Record<string, string> = {};
    if (wooUrl.trim()) body.woo_url = wooUrl.trim();
    if (wooKey.trim()) body.woo_consumer_key = wooKey.trim();
    if (wooSecret.trim()) body.woo_consumer_secret = wooSecret.trim();
    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setWooConfigured(true);
      setWooUrl("");
      setWooKey("");
      setWooSecret("");
      setMsg({ tipo: "ok", texto: "WooCommerce salvo com sucesso" });
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 4000);
  }

  async function salvarKommo() {
    if (!kommoUrl.trim() && !kommoToken.trim()) return;
    setSaving(true);
    setMsg(null);
    const body: Record<string, string> = {};
    if (kommoUrl.trim()) body.kommo_url = kommoUrl.trim();
    if (kommoToken.trim()) body.kommo_token = kommoToken.trim();
    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setKommoConfigured(true);
      setKommoUrl("");
      setKommoToken("");
      setMsg({ tipo: "ok", texto: "Kommo salvo com sucesso" });
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 4000);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: P.muted }}>
        <RefreshCw size={14} className="animate-spin" /> Carregando...
      </div>
    );
  }

  const StatusBadge = ({ ok }: { ok: boolean }) => (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
      style={{
        backgroundColor: ok ? P.verde + "22" : P.vermelho + "22",
        color: ok ? P.verde : P.vermelho,
      }}
    >
      {ok ? <><CheckCircle size={10} /> Configurado</> : <><X size={10} /> Não configurado</>}
    </span>
  );

  return (
    <div className="space-y-6 max-w-xl">
      {/* Mensagem global */}
      {msg && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{
            backgroundColor: msg.tipo === "ok" ? P.verde + "22" : P.vermelho + "22",
            color: msg.tipo === "ok" ? P.verde : P.vermelho,
          }}
        >
          {msg.tipo === "ok" ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
          {msg.texto}
        </div>
      )}

      {/* WooCommerce */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: P.creme }}>WooCommerce</p>
            <p className="text-xs" style={{ color: P.muted }}>Integração com loja virtual</p>
          </div>
          <StatusBadge ok={wooConfigured} />
        </div>

        {[
          { label: "URL da Loja", value: wooUrl, set: setWooUrl, masked: false, placeholder: "https://sualoja.com.br" },
          { label: "Consumer Key", value: wooKey, set: setWooKey, masked: !showWooKey, toggle: () => setShowWooKey(!showWooKey), showState: showWooKey, placeholder: "ck_..." },
          { label: "Consumer Secret", value: wooSecret, set: setWooSecret, masked: !showWooSecret, toggle: () => setShowWooSecret(!showWooSecret), showState: showWooSecret, placeholder: "cs_..." },
        ].map(({ label, value, set, masked, toggle, showState, placeholder }) => (
          <div key={label}>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>{label}</label>
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
              <input
                type={masked ? "password" : "text"}
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                style={{ color: P.creme }}
              />
              {toggle && (
                <button onClick={toggle} className="px-3 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
                  {showState ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={salvarWoo}
          disabled={saving || (!wooUrl.trim() && !wooKey.trim() && !wooSecret.trim())}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          <Save size={13} /> Salvar WooCommerce
        </button>
      </div>

      {/* Kommo */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: P.creme }}>Kommo (CRM)</p>
            <p className="text-xs" style={{ color: P.muted }}>Integração com CRM de vendas</p>
          </div>
          <StatusBadge ok={kommoConfigured} />
        </div>

        {[
          { label: "URL do Kommo", value: kommoUrl, set: setKommoUrl, masked: false, placeholder: "https://suaempresa.kommo.com" },
          { label: "Token", value: kommoToken, set: setKommoToken, masked: !showKommoToken, toggle: () => setShowKommoToken(!showKommoToken), showState: showKommoToken, placeholder: "Token de acesso" },
        ].map(({ label, value, set, masked, toggle, showState, placeholder }) => (
          <div key={label}>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>{label}</label>
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
              <input
                type={masked ? "password" : "text"}
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                style={{ color: P.creme }}
              />
              {toggle && (
                <button onClick={toggle} className="px-3 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
                  {showState ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={salvarKommo}
          disabled={saving || (!kommoUrl.trim() && !kommoToken.trim())}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          <Save size={13} /> Salvar Kommo
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ConfiguracoesClient({ parametros, webhooks, logs, usuarios, depositos, teores, ligaTipos }: Props) {
  const [tab, setTab] = useState<Tab>("parametros");
  const [initialUserId, setInitialUserId] = useState<string | null>(null);
  const { role: currentRole } = useAuth();
  const isSuperAdmin = currentRole === "desenvolvedor" || currentRole === "admin";

  // Ler query params (?tab=usuarios&user=UUID) uma vez no mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const u = params.get("user");
    if (t && ["parametros", "webhooks", "usuarios", "ia", "depositos", "permissoes", "teores", "locais", "tipos_servico", "cotacoes", "integracoes"].includes(t)) {
      setTab(t as Tab);
    }
    if (u) setInitialUserId(u);
  }, []);

  const baseTabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "parametros",    label: "Parâmetros",     icon: Settings },
    { key: "cotacoes",      label: "Cotações",       icon: DollarSign },
    { key: "integracoes",   label: "Integrações",    icon: Link2 },
    { key: "webhooks",      label: "Webhooks",       icon: Webhook },
    { key: "usuarios",      label: "Usuários",       icon: Users },
    { key: "ia",            label: "IA",             icon: Bot },
    { key: "depositos",     label: "Depósitos",      icon: Warehouse },
    { key: "teores",        label: "Teores Ouro",    icon: Flame },
    { key: "locais",        label: "Locais",         icon: MapPin },
    { key: "tipos_servico", label: "Tipos Serviço",  icon: Wrench },
  ];
  const tabs = isSuperAdmin
    ? [...baseTabs, { key: "permissoes" as Tab, label: "Permissões", icon: Shield }]
    : baseTabs;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div>
        <h1
          className="text-xl font-semibold tracking-wide text-gray-800"
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          Configurações
        </h1>
        <p className="text-xs mt-0.5 text-gray-500">
          Somente administradores
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1 w-fit"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              backgroundColor: tab === key ? P.card : "transparent",
              color: tab === key ? P.creme : P.sage,
              boxShadow: tab === key ? "0 1px 3px 0 rgb(0 0 0 / 0.08)" : "none",
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === "parametros"  && <TabParametros parametros={parametros} />}
      {tab === "webhooks"    && <TabWebhooks webhooks={webhooks} logs={logs} />}
      {tab === "usuarios"    && <TabUsuarios usuarios={usuarios} depositos={depositos} initialUserId={initialUserId} />}
      {tab === "ia"          && <TabIA />}
      {tab === "depositos"   && <TabDepositos />}
      {tab === "teores"      && <TabTeores teores={teores} ligaTipos={ligaTipos} />}
      {tab === "permissoes"    && isSuperAdmin && <TabPermissoes />}
      {tab === "locais"        && <LocaisEstoqueTab canEdit={isSuperAdmin} />}
      {tab === "tipos_servico" && <TabTiposServico />}
      {tab === "cotacoes" && <TabCotacoes />}
      {tab === "integracoes" && <TabIntegracoes />}
    </div>
  );
}
