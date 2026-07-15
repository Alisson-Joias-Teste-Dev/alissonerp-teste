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
  Wallet,
  Landmark,
  ShoppingCart,
  Package,
  CreditCard,
  Smartphone,
  Truck,
  Search,
  Scale,
  MessageCircle,
  Bike,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispararWebhook } from "@/lib/webhooks";
import UserEditDrawer, { type UsuarioEdit, type Deposito as DepositoEdit } from "@/components/UserEditDrawer";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";
import LocaisEstoqueTab from "@/components/LocaisEstoqueTab";
import { useErrorStore } from "@/stores/errorStore";
import TabProdutoVisibilidade from "@/components/configuracoes/TabProdutoVisibilidade";
import TabAprovadores from "@/components/configuracoes/TabAprovadores";
import TabFreteAvulsoLiberadores from "@/components/configuracoes/TabFreteAvulsoLiberadores";

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
  deposito_id?: number | null;
  vendedor_id?: number | null;
  tipos_ordem_permitidos?: string[];
  tipos_protocolo_permitidos?: string[];
  is_operador_service?: boolean;
  is_transportador?: boolean;
  mx_desconto_permitido?: number | null;
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

type Tab = "parametros" | "webhooks" | "usuarios" | "ia" | "depositos" | "permissoes" | "teores" | "locais" | "tipos_servico" | "cotacoes" | "integracoes" | "comissoes" | "credito_loja" | "maquininhas" | "fretes" | "gateways" | "metal" | "produto_visibilidade" | "aprovadores" | "frete_avulso_liberadores";

interface Gateway {
  id: number;
  nome: string;
  tipo: "pix" | "cartao" | "dinheiro" | "ouro" | "outro";
  ativo: boolean;
  cor: string;
  obs: string | null;
  created_at: string;
}

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
  const [comentariosAtivos, setComentariosAtivos] = useState(true);
  const [salvandoComentarios, setSalvandoComentarios] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/sistema")
      .then(r => r.json())
      .then((d: { comentarios_ordens_ativo?: boolean }) => setComentariosAtivos(d.comentarios_ordens_ativo ?? true))
      .catch(() => {});
  }, []);

  async function toggleComentarios() {
    setSalvandoComentarios(true);
    const novoValor = !comentariosAtivos;
    await fetch("/api/configuracoes/sistema", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios_ordens_ativo: novoValor }),
    });
    setComentariosAtivos(novoValor);
    setSalvandoComentarios(false);
  }

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

      {/* ── Comentários de Ordens ── */}
      <div
        className="flex items-center justify-between px-5 py-4 rounded-xl"
        style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>Comentários de Ordens</p>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            {comentariosAtivos
              ? "Ativos — colaboradores podem comentar em ordens"
              : "Desativados — campo de comentário oculto"}
          </p>
        </div>
        <button
          onClick={toggleComentarios}
          disabled={salvandoComentarios}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-40"
          style={{ color: comentariosAtivos ? P.verde : P.muted }}
        >
          {comentariosAtivos ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          {comentariosAtivos ? "Ativo" : "Inativo"}
        </button>
      </div>
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
      .catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao carregar roles", { level: "warning" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-abre drawer quando há ?user=UUID na URL
  useEffect(() => {
    if (!initialUserId) return;
    const u = usuariosInit.find((u) => u.id === initialUserId);
    if (u) {
      setEditando(buildEditObj(u));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId]);

  function buildEditObj(u: Usuario): UsuarioEdit {
    return {
      id:                         u.id,
      email:                      u.email,
      nome:                       u.nome,
      role:                       u.role,
      ativo:                      u.ativo,
      avatar_url:                 u.avatar_url ?? null,
      deposito_id:                u.deposito_id ?? null,
      vendedor_id:                u.vendedor_id ?? null,
      tipos_ordem_permitidos:     u.tipos_ordem_permitidos ?? [],
      tipos_protocolo_permitidos: u.tipos_protocolo_permitidos ?? [],
      is_operador_service:        u.is_operador_service ?? false,
      is_transportador:           u.is_transportador ?? false,
      mx_desconto_permitido:      u.mx_desconto_permitido ?? null,
    };
  }

  function abrirDrawer(u: Usuario) {
    setEditando(buildEditObj(u));
  }

  function handleSaved(updated: UsuarioEdit) {
    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === updated.id
          ? {
              ...u,
              nome:                       updated.nome,
              role:                       updated.role,
              ativo:                      updated.ativo,
              avatar_url:                 updated.avatar_url ?? u.avatar_url,
              deposito_id:                updated.deposito_id ?? u.deposito_id,
              vendedor_id:                updated.vendedor_id ?? u.vendedor_id,
              tipos_ordem_permitidos:     updated.tipos_ordem_permitidos ?? u.tipos_ordem_permitidos,
              tipos_protocolo_permitidos: updated.tipos_protocolo_permitidos ?? u.tipos_protocolo_permitidos,
              is_operador_service:        updated.is_operador_service ?? u.is_operador_service,
              is_transportador:           updated.is_transportador ?? u.is_transportador,
              mx_desconto_permitido:      updated.mx_desconto_permitido !== undefined ? updated.mx_desconto_permitido : u.mx_desconto_permitido,
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

                      const levelColors: { [k: number]: { bg: string; color: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> } } = {
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
    const res = await fetch("/api/tipos-servico?todos=true").catch((e) => { useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao carregar tipos de serviço", { level: "warning" }); return null; });
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
    }).catch((e) => { useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao criar tipo de serviço", { level: "critical" }); return null; });
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
    }).catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao editar tipo de serviço", { level: "critical" }));
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
    }).catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao alterar tipo de serviço", { level: "critical" }));
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
  const [keyConfigured, setKeyConfigured] = useState(false);
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
      setKeyConfigured(data.config.api_key_configured ?? false);
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
  const [tinyConfigured, setTinyConfigured] = useState(false);
  const [tinyHasCredentials, setTinyHasCredentials] = useState(false);
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

  // Tiny ERP fields
  const [tinyClientId, setTinyClientId] = useState("");
  const [tinyClientSecret, setTinyClientSecret] = useState("");
  const [showTinySecret, setShowTinySecret] = useState(false);

  // Mercado Pago fields
  const [mpConfigured, setMpConfigured] = useState(false);
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpWebhookSecret, setMpWebhookSecret] = useState("");
  const [mpUserId, setMpUserId] = useState("");
  /** REGRA DE NEGÓCIO: toggle ativar/desativar gateway Mercado Pago.
   *  O QUE: controla se o Mercado Pago aparece no dropdown de gateways das vendas.
   *  POR QUE: permite operar só com PagBank ou só com MP, sem precisar excluir config.
   *  IMPACTO: fonte da verdade é fin_gateways.ativo — lido do GET /api/configuracoes/integracoes. */
  const [mpAtivo, setMpAtivo] = useState(true);
  // PagBank
  const [pagbankToken, setPagbankToken] = useState("");
  const [pagbankWebhookSecret, setPagbankWebhookSecret] = useState("");
  const [pagbankWebhookBaseUrl, setPagbankWebhookBaseUrl] = useState("");
  const [pagbankConfigured, setPagbankConfigured] = useState(false);
  const [pagbankSaved, setPagbankSaved] = useState(false);
  /** REGRA DE NEGÓCIO: toggle ativar/desativar gateway PagBank.
   *  O QUE: controla se o PagBank aparece no dropdown de gateways das vendas.
   *  POR QUE: permite operar só com Mercado Pago ou só com PagBank, sem precisar excluir config.
   *  IMPACTO: fonte da verdade é fin_gateways.ativo — lido do GET /api/configuracoes/integracoes. */
  const [pagbankAtivo, setPagbankAtivo] = useState(true);
  const [mpWebhookBaseUrl, setMpWebhookBaseUrl] = useState("");
  const [showMpToken, setShowMpToken] = useState(false);
  const [showMpSecret, setShowMpSecret] = useState(false);

  // Banco Inter fields
  const [interConfigured, setInterConfigured] = useState(false);
  const [interExpanded, setInterExpanded] = useState(false);
  const [wooExpanded, setWooExpanded] = useState(false);
  const [kommoExpanded, setKommoExpanded] = useState(false);
  const [tinyExpanded, setTinyExpanded] = useState(false);
  const [retryingAllTiny, setRetryingAllTiny] = useState(false);
  const [retryAllMsg, setRetryAllMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [mpExpanded, setMpExpanded] = useState(false);
  const [interClientId, setInterClientId] = useState("");
  const [interClientSecret, setInterClientSecret] = useState("");
  const [interCertPem, setInterCertPem] = useState("");
  const [interKeyPem, setInterKeyPem] = useState("");
  const [interContaCorrente, setInterContaCorrente] = useState("");
  const [interCronSecret, setInterCronSecret] = useState("");
  const [showInterClientSecret, setShowInterClientSecret] = useState(false);
  const [showInterCronSecret, setShowInterCronSecret] = useState(false);

  // WhatsApp do desenvolvedor (Etapa 3) — recebe o código quando o envio ao
  // cliente falha. Não é segredo; o valor é exibido no campo.
  const [whatsappDev, setWhatsappDev] = useState("");
  const [savingWhatsappDev, setSavingWhatsappDev] = useState(false);

  // Mercado Pago Point devices
  interface PointDeviceRow {
    id: number;
    device_id: string;
    nome_legivel: string;
    loja: string | null;
    operating_mode: string | null;
    ativo: boolean;
    last_sync_at: string | null;
  }
  const [mpDevices, setMpDevices] = useState<PointDeviceRow[]>([]);
  const [mpSyncLoading, setMpSyncLoading] = useState(false);
  const [mpEditDeviceId, setMpEditDeviceId] = useState<number | null>(null);
  const [mpEditNome, setMpEditNome] = useState("");
  const [mpEditLoja, setMpEditLoja] = useState("");

  const carregarMpDevices = async () => {
    try {
      const res = await fetch("/api/mercado-pago/devices");
      if (res.ok) setMpDevices(await res.json());
    } catch { /* silenciar */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) {
          const data = await res.json();
          setWooConfigured(data.woo_configured);
          setKommoConfigured(data.kommo_configured);
          setTinyConfigured(data.tiny_configured);
          setMpConfigured(data.mp_configured ?? false);
          setInterConfigured(data.inter_configured ?? false);
          setPagbankConfigured(data.pagbank_configured ?? false);
          /** Le estado de ativacao dos gateways do banco (fin_gateways.ativo) */
          if (typeof data.mp_ativo === "boolean") setMpAtivo(data.mp_ativo);
          if (typeof data.pagbank_ativo === "boolean") setPagbankAtivo(data.pagbank_ativo);
          if (typeof data.whatsapp_desenvolvedor === "string") setWhatsappDev(data.whatsapp_desenvolvedor);
          if (data.mp_configured) carregarMpDevices();
        }
      } catch { /* silenciar */ }
      setLoading(false);
    })();
  }, []);

  async function sincronizarMpDevices() {
    setMpSyncLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mercado-pago/devices", { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setMsg({
          tipo: "ok",
          texto: `Maquininhas sincronizadas: ${body.inserted} novas, ${body.updated} atualizadas (total ${body.total})`,
        });
        await carregarMpDevices();
      } else {
        setMsg({ tipo: "erro", texto: body.error ?? "Erro ao sincronizar" });
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede" });
    }
    setMpSyncLoading(false);
    setTimeout(() => setMsg(null), 5000);
  }

  async function salvarDevice(id: number) {
    const res = await fetch("/api/mercado-pago/devices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        nome_legivel: mpEditNome.trim() || undefined,
        loja: mpEditLoja.trim() || null,
      }),
    });
    if (res.ok) {
      setMpEditDeviceId(null);
      setMpEditNome("");
      setMpEditLoja("");
      await carregarMpDevices();
    }
  }

  async function alternarDeviceAtivo(id: number, ativo: boolean) {
    const res = await fetch("/api/mercado-pago/devices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ativo: !ativo }),
    });
    if (res.ok) await carregarMpDevices();
  }

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
      setWooUrl("");
      setWooKey("");
      setWooSecret("");
      setMsg({ tipo: "ok", texto: "WooCommerce salvo com sucesso" });
      // Re-fetch status real do servidor (não usar optimistic update)
      fetch("/api/configuracoes/integracoes").then(r => r.ok ? r.json() : null).then(d => {
        if (d) { setWooConfigured(d.woo_configured); setKommoConfigured(d.kommo_configured); setTinyConfigured(d.tiny_configured); setTinyHasCredentials(d.tiny_has_credentials ?? false); }
      }).catch(() => {});
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
      setKommoUrl("");
      setKommoToken("");
      setMsg({ tipo: "ok", texto: "Kommo salvo com sucesso" });
      // Re-fetch status real
      fetch("/api/configuracoes/integracoes").then(r => r.ok ? r.json() : null).then(d => {
        if (d) { setWooConfigured(d.woo_configured); setKommoConfigured(d.kommo_configured); setTinyConfigured(d.tiny_configured); setTinyHasCredentials(d.tiny_has_credentials ?? false); }
      }).catch(() => {});
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 4000);
  }

  async function salvarMercadoPago() {
    if (!mpAccessToken.trim() && !mpWebhookSecret.trim() && !mpUserId.trim() && !mpWebhookBaseUrl.trim()) return;
    setSaving(true);
    setMsg(null);
    const body: Record<string, string> = {};
    if (mpAccessToken.trim())    body.mp_access_token    = mpAccessToken.trim();
    if (mpWebhookSecret.trim())  body.mp_webhook_secret  = mpWebhookSecret.trim();
    if (mpUserId.trim())         body.mp_user_id         = mpUserId.trim();
    if (mpWebhookBaseUrl.trim()) body.mp_webhook_base_url = mpWebhookBaseUrl.trim();
    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setMpAccessToken("");
      setMpWebhookSecret("");
      setMpUserId("");
      setMpWebhookBaseUrl("");
      setMsg({ tipo: "ok", texto: "Mercado Pago salvo com sucesso" });
      fetch("/api/configuracoes/integracoes").then(r => r.ok ? r.json() : null).then(d => {
        if (d) {
          setWooConfigured(d.woo_configured);
          setKommoConfigured(d.kommo_configured);
          setTinyConfigured(d.tiny_configured);
          setTinyHasCredentials(d.tiny_has_credentials ?? false);
          setMpConfigured(d.mp_configured ?? false);
        }
      }).catch(() => {});
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 4000);
  }

  async function salvarPagBank() {
    if (!pagbankToken.trim() && !pagbankWebhookSecret.trim() && !pagbankWebhookBaseUrl.trim()) return;
    setSaving(true);
    setMsg(null);
    const body: Record<string, string> = {};
    if (pagbankToken.trim())          body.pagbank_access_token    = pagbankToken.trim();
    if (pagbankWebhookSecret.trim())  body.pagbank_webhook_secret  = pagbankWebhookSecret.trim();
    if (pagbankWebhookBaseUrl.trim()) body.pagbank_webhook_base_url = pagbankWebhookBaseUrl.trim();
    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setPagbankSaved(true);
      setTimeout(() => setPagbankSaved(false), 3000);
      setMsg({ tipo: "ok", texto: "PagBank salvo com sucesso" });
      fetch("/api/configuracoes/integracoes").then(r => r.ok ? r.json() : null).then(d => {
        if (d) {
          setWooConfigured(d.woo_configured);
          setKommoConfigured(d.kommo_configured);
          setTinyConfigured(d.tiny_configured);
          setTinyHasCredentials(d.tiny_has_credentials ?? false);
          setMpConfigured(d.mp_configured ?? false);
          setPagbankConfigured(d.pagbank_configured ?? false);
        }
      }).catch(() => {});
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 4000);
  }

  /** REGRA DE NEGÓCIO: toggle ativar/desativar gateway Mercado Pago.
   *  O QUE: inverte o estado e atualiza fin_gateways.ativo via PATCH.
   *  POR QUE: operadora pode querer desativar MP sem perder as credenciais.
   *  IMPACTO SE ALTERADO: toggle não mais sincroniza com o banco. */
  async function alternarMpAtivo() {
    const novo = !mpAtivo;
    setMpAtivo(novo);
    await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mp_ativo: String(novo) }),
    });
  }

  /** REGRA DE NEGÓCIO: toggle ativar/desativar gateway PagBank.
   *  O QUE: inverte o estado e atualiza fin_gateways.ativo via PATCH.
   *  POR QUE: operadora pode querer desativar PagBank sem perder as credenciais.
   *  IMPACTO SE ALTERADO: toggle não mais sincroniza com o banco. */
  async function alternarPagbankAtivo() {
    const novo = !pagbankAtivo;
    setPagbankAtivo(novo);
    await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagbank_ativo: String(novo) }),
    });
  }

  function gerarCronSecret() {
    // 32 chars hex aleatorio (sem dependencias)
    const arr = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
    setInterCronSecret(hex);
  }

  async function salvarInter() {
    // Validacoes
    if (!interClientId.trim() || !interClientSecret.trim() || !interCertPem.trim() || !interKeyPem.trim() || !interContaCorrente.trim()) {
      setMsg({ tipo: "erro", texto: "Preencha todos os campos obrigatórios (Client ID, Secret, Cert, Key, Conta Corrente)" });
      setTimeout(() => setMsg(null), 5000);
      return;
    }
    if (!interCertPem.trim().startsWith("-----BEGIN ")) {
      setMsg({ tipo: "erro", texto: "Certificado inválido — deve começar com '-----BEGIN '" });
      setTimeout(() => setMsg(null), 5000);
      return;
    }
    if (!interKeyPem.trim().startsWith("-----BEGIN ")) {
      setMsg({ tipo: "erro", texto: "Chave privada inválida — deve começar com '-----BEGIN '" });
      setTimeout(() => setMsg(null), 5000);
      return;
    }

    setSaving(true);
    setMsg(null);
    const body: Record<string, string> = {
      inter_client_id: interClientId.trim(),
      inter_client_secret: interClientSecret.trim(),
      inter_cert_pem: interCertPem.trim(),
      inter_key_pem: interKeyPem.trim(),
      inter_conta_corrente: interContaCorrente.trim(),
    };
    if (interCronSecret.trim()) body.inter_cron_secret = interCronSecret.trim();

    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setInterClientId("");
      setInterClientSecret("");
      setInterCertPem("");
      setInterKeyPem("");
      setInterContaCorrente("");
      setInterCronSecret("");
      setInterExpanded(false);
      setMsg({ tipo: "ok", texto: "Banco Inter salvo com sucesso" });
      fetch("/api/configuracoes/integracoes").then(r => r.ok ? r.json() : null).then(d => {
        if (d) {
          setWooConfigured(d.woo_configured);
          setKommoConfigured(d.kommo_configured);
          setTinyConfigured(d.tiny_configured);
          setTinyHasCredentials(d.tiny_has_credentials ?? false);
          setMpConfigured(d.mp_configured ?? false);
          setInterConfigured(d.inter_configured ?? false);
        }
      }).catch(() => {});
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 5000);
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

  async function salvarWhatsappDev() {
    setSavingWhatsappDev(true);
    setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_desenvolvedor: whatsappDev.trim() }),
      });
      if (res.ok) setMsg({ tipo: "ok", texto: "WhatsApp do desenvolvedor salvo." });
      else setMsg({ tipo: "erro", texto: "Erro ao salvar o WhatsApp do desenvolvedor." });
    } catch {
      setMsg({ tipo: "erro", texto: "Erro ao salvar o WhatsApp do desenvolvedor." });
    } finally {
      setSavingWhatsappDev(false);
    }
  }

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

      {/* WhatsApp do desenvolvedor (Etapa 3) — fallback quando o código não
          chega ao cliente: o sistema manda o código + erro para este número. */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="rounded-lg p-2 flex items-center justify-center"
            style={{ backgroundColor: "#25D366" + "22", color: "#128C7E" }}
          >
            <MessageCircle size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: P.creme }}>WhatsApp do desenvolvedor</p>
            <p className="text-xs" style={{ color: P.muted }}>
              Recebe o código de entrega + o erro quando o envio ao cliente falha
            </p>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium" style={{ color: P.muted }}>
              Número (com DDD, ex: 85999999999)
            </label>
            <input
              type="tel"
              value={whatsappDev}
              onChange={(e) => setWhatsappDev(e.target.value)}
              placeholder="85999999999"
              className="w-full mt-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: P.card, border: `1px solid ${P.border}`, color: P.creme }}
            />
          </div>
          <button
            onClick={salvarWhatsappDev}
            disabled={savingWhatsappDev}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: P.verde, color: "#fff" }}
          >
            {savingWhatsappDev ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {/* WooCommerce */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2 flex items-center justify-center"
              style={{ backgroundColor: "#96588A" + "22", color: "#96588A" }}
            >
              <ShoppingCart size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: P.creme }}>WooCommerce</p>
              <p className="text-xs" style={{ color: P.muted }}>Integração com loja virtual</p>
            </div>
          </div>
          <StatusBadge ok={wooConfigured} />
        </div>

        <button
          onClick={() => setWooExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ color: P.sage }}
        >
          {wooExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {wooExpanded ? "Ocultar credenciais" : (wooConfigured ? "Atualizar credenciais" : "Configurar credenciais")}
        </button>

        {wooExpanded && (
          <div className="space-y-4 pt-2">
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
        )}

        {wooConfigured && !wooExpanded && (
          <p className="text-xs flex items-center gap-1" style={{ color: P.verde }}>
            <CheckCircle size={12} /> WooCommerce ativo — sincronização de produtos e pedidos
          </p>
        )}
      </div>

      {/* Kommo */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2 flex items-center justify-center"
              style={{ backgroundColor: "#3E74DB" + "22", color: "#3E74DB" }}
            >
              <Users size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: P.creme }}>Kommo (CRM)</p>
              <p className="text-xs" style={{ color: P.muted }}>Integração com CRM de vendas</p>
            </div>
          </div>
          <StatusBadge ok={kommoConfigured} />
        </div>

        <button
          onClick={() => setKommoExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ color: P.sage }}
        >
          {kommoExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {kommoExpanded ? "Ocultar credenciais" : (kommoConfigured ? "Atualizar credenciais" : "Configurar credenciais")}
        </button>

        {kommoExpanded && (
          <div className="space-y-4 pt-2">
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
        )}

        {kommoConfigured && !kommoExpanded && (
          <p className="text-xs flex items-center gap-1" style={{ color: P.verde }}>
            <CheckCircle size={12} /> Kommo ativo — leads sincronizados
          </p>
        )}
      </div>

      {/* Tiny ERP (Olist) — OAuth2 */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2 flex items-center justify-center"
              style={{ backgroundColor: "#00B1A3" + "22", color: "#00B1A3" }}
            >
              <Package size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: P.creme }}>Tiny ERP (Olist)</p>
              <p className="text-xs" style={{ color: P.muted }}>ERP para estoque e pedidos (OAuth2)</p>
            </div>
          </div>
          <StatusBadge ok={tinyConfigured} />
        </div>

        <button
          onClick={() => setTinyExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ color: P.sage }}
        >
          {tinyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {tinyExpanded ? "Ocultar credenciais" : (tinyConfigured ? "Atualizar credenciais" : "Configurar credenciais")}
        </button>

        {tinyExpanded && (
          <div className="space-y-4 pt-2">
        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>URL de Redirecionamento (copie e cadastre no Tiny)</label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : "https://erp.alisson.api.br"}/api/integracoes/tiny/callback`}
              className="flex-1 bg-transparent px-3 py-2.5 text-xs outline-none select-all"
              style={{ color: P.sage }}
              onClick={e => (e.target as HTMLInputElement).select()}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>Client ID</label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              type="text"
              value={tinyClientId}
              onChange={(e) => setTinyClientId(e.target.value)}
              placeholder="Client ID do app Tiny"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ color: P.creme }}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>Client Secret</label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              type={showTinySecret ? "text" : "password"}
              value={tinyClientSecret}
              onChange={(e) => setTinyClientSecret(e.target.value)}
              placeholder="Client Secret do app Tiny"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ color: P.creme }}
            />
            <button onClick={() => setShowTinySecret(!showTinySecret)} className="px-3 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
              {showTinySecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={async () => {
              if (!tinyClientId.trim() || !tinyClientSecret.trim()) return;
              setSaving(true); setMsg(null);
              const res = await fetch("/api/configuracoes/integracoes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tiny_client_id: tinyClientId.trim(), tiny_client_secret: tinyClientSecret.trim() }),
              });
              setSaving(false);
              if (res.ok) {
                setTinyClientId(""); setTinyClientSecret("");
                setTinyHasCredentials(true);
                setMsg({ tipo: "ok", texto: "Credenciais Tiny salvas. Clique em 'Conectar ao Tiny' para autorizar." });
              } else {
                const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
                setMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
              }
              setTimeout(() => setMsg(null), 6000);
            }}
            disabled={saving || !tinyClientId.trim() || !tinyClientSecret.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: P.verde, color: "#fff" }}
          >
            <Save size={13} /> Salvar Credenciais
          </button>

        </div>

        {tinyConfigured && (
          <p className="text-xs flex items-center gap-1" style={{ color: P.verde }}>
            <CheckCircle size={12} /> Conexão ativa com o Tiny ERP
          </p>
        )}
          </div>
        )}

        {tinyHasCredentials && (
          <a
            href="/api/integracoes/tiny/auth"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 no-underline"
            style={{ backgroundColor: tinyConfigured ? P.sage : "#2563EB", color: "#fff" }}
          >
            {tinyConfigured ? "Reconectar Tiny" : "Conectar ao Tiny"}
          </a>
        )}

        {!tinyConfigured && !tinyHasCredentials && (
          <p className="text-xs flex items-center gap-1" style={{ color: P.muted }}>
            Configure as credenciais acima para conectar ao Tiny ERP
          </p>
        )}

        {tinyConfigured && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={async () => {
                setRetryingAllTiny(true); setRetryAllMsg(null);
                const res = await fetch("/api/tiny/resync-erros", { method: "POST" });
                setRetryingAllTiny(false);
                if (res.ok) {
                  const d = await res.json();
                  if (d.total === 0) {
                    setRetryAllMsg({ tipo: "ok", texto: "Nenhuma venda com erro para reenviar." });
                  } else {
                    setRetryAllMsg({
                      tipo: d.erros === 0 ? "ok" : "erro",
                      texto: `${d.sincronizados}/${d.total} vendas reenviadas.${d.erros > 0 ? ` ${d.erros} falharam.` : ""}`,
                    });
                  }
                } else {
                  const d = await res.json().catch(() => ({ error: "Erro" }));
                  setRetryAllMsg({ tipo: "erro", texto: d.error ?? "Erro ao reenviar" });
                }
                setTimeout(() => setRetryAllMsg(null), 8000);
              }}
              disabled={retryingAllTiny}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity hover:opacity-80"
              style={{ backgroundColor: P.card, border: `1px solid ${P.border}`, color: P.creme }}
            >
              {retryingAllTiny ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {retryingAllTiny ? "Reenviando..." : "Reenviar Pendentes"}
            </button>
            {retryAllMsg && (
              <p className="text-xs" style={{ color: retryAllMsg.tipo === "ok" ? P.verde : "#ef4444" }}>
                {retryAllMsg.texto}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Mercado Pago (Preference + Point Smart) */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2 flex items-center justify-center"
              style={{ backgroundColor: "#00B1EA" + "22", color: "#00B1EA" }}
            >
              <CreditCard size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: P.creme }}>Mercado Pago</p>
              <p className="text-xs" style={{ color: P.muted }}>
                Pagamentos PIX, cartão e link de pagamento
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge ok={mpConfigured} />
            {/* Toggle ativar/desativar gateway Mercado Pago nas vendas */}
            <button
              onClick={alternarMpAtivo}
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80"
              title={mpAtivo ? "Mercado Pago ativo — clique para desativar" : "Mercado Pago inativo — clique para ativar"}
            >
              {mpAtivo ? (
                <ToggleRight size={20} style={{ color: P.verde }} />
              ) : (
                <ToggleLeft size={20} style={{ color: P.muted }} />
              )}
              <span style={{ color: mpAtivo ? P.verde : P.muted, fontSize: "11px" }}>
                {mpAtivo ? "Ativo" : "Inativo"}
              </span>
            </button>
          </div>
        </div>

        <button
          onClick={() => setMpExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ color: P.sage }}
        >
          {mpExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {mpExpanded ? "Ocultar credenciais" : (mpConfigured ? "Atualizar credenciais" : "Configurar credenciais")}
        </button>

        {mpExpanded && (
          <div className="space-y-4 pt-2">
        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            URL do webhook (cadastre no painel MP)
          </label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : "https://erp.alisson.api.br"}/api/webhooks/mercado-pago`}
              className="flex-1 bg-transparent px-3 py-2.5 text-xs outline-none select-all"
              style={{ color: P.sage }}
              onClick={e => (e.target as HTMLInputElement).select()}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            Access Token (Production)
          </label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              type={showMpToken ? "text" : "password"}
              value={mpAccessToken}
              onChange={(e) => setMpAccessToken(e.target.value)}
              placeholder="APP_USR-..."
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ color: P.creme }}
            />
            <button onClick={() => setShowMpToken(!showMpToken)} className="px-3 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
              {showMpToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            Webhook Secret (chave de assinatura HMAC)
          </label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              type={showMpSecret ? "text" : "password"}
              value={mpWebhookSecret}
              onChange={(e) => setMpWebhookSecret(e.target.value)}
              placeholder="Chave secreta do painel MP"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ color: P.creme }}
            />
            <button onClick={() => setShowMpSecret(!showMpSecret)} className="px-3 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
              {showMpSecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            User ID (opcional)
          </label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              type="text"
              value={mpUserId}
              onChange={(e) => setMpUserId(e.target.value)}
              placeholder="User ID da conta MP"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ color: P.creme }}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            URL base p/ webhook (dev: ngrok, prod: domínio público)
          </label>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
            <input
              type="text"
              value={mpWebhookBaseUrl}
              onChange={(e) => setMpWebhookBaseUrl(e.target.value)}
              placeholder="https://abc123.ngrok.io"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ color: P.creme }}
            />
          </div>
          <p className="text-[10px] mt-1" style={{ color: P.muted }}>
            Usada como prefixo do notification_url nas Preferences. Deixe em branco para usar o origin atual.
          </p>
        </div>

        <button
          onClick={salvarMercadoPago}
          disabled={saving || (!mpAccessToken.trim() && !mpWebhookSecret.trim() && !mpUserId.trim() && !mpWebhookBaseUrl.trim())}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          <Save size={13} /> Salvar Mercado Pago
        </button>
          </div>
        )}

        {mpConfigured && !mpExpanded && (
          <p className="text-xs flex items-center gap-1" style={{ color: mpAtivo ? P.verde : P.muted }}>
            <CheckCircle size={12} /> {mpAtivo ? "Mercado Pago ativo — recebimentos automáticos" : "Mercado Pago configurado mas INATIVO nas vendas"}
          </p>
        )}

        {/* ─── Maquininhas Point ─── */}
        {mpConfigured && (
          <div className="pt-4 mt-2 border-t space-y-3" style={{ borderColor: P.border }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: P.sage }}>
                  Maquininhas Point
                </p>
                <p className="text-[11px]" style={{ color: P.muted }}>
                  {mpDevices.length === 0
                    ? "Nenhuma maquininha sincronizada ainda"
                    : `${mpDevices.length} maquininha${mpDevices.length > 1 ? "s" : ""} cadastrada${mpDevices.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <button
                onClick={sincronizarMpDevices}
                disabled={mpSyncLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: P.dourado, color: "#fff" }}
              >
                {mpSyncLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {mpSyncLoading ? "Sincronizando..." : "Sincronizar com MP"}
              </button>
            </div>

            {mpDevices.length > 0 && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: P.border }}>
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: P.bg }}>
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: P.sage }}>Nome</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: P.sage }}>Loja</th>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: P.sage }}>Modo</th>
                      <th className="text-center px-3 py-2 font-semibold" style={{ color: P.sage }}>Ativo</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mpDevices.map(d => {
                      const editando = mpEditDeviceId === d.id;
                      return (
                        <tr key={d.id} className="border-t" style={{ borderColor: P.border }}>
                          <td className="px-3 py-2">
                            {editando ? (
                              <input
                                value={mpEditNome}
                                onChange={e => setMpEditNome(e.target.value)}
                                className="w-full px-2 py-1 rounded border text-xs"
                                style={{ borderColor: P.border, color: P.creme }}
                              />
                            ) : (
                              <>
                                <div className="font-medium" style={{ color: P.creme }}>{d.nome_legivel}</div>
                                <div className="text-[10px] font-mono" style={{ color: P.muted }}>
                                  {d.device_id.slice(0, 32)}...
                                </div>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {editando ? (
                              <input
                                value={mpEditLoja}
                                onChange={e => setMpEditLoja(e.target.value)}
                                placeholder="Matriz / Filial..."
                                className="w-full px-2 py-1 rounded border text-xs"
                                style={{ borderColor: P.border, color: P.creme }}
                              />
                            ) : (
                              <span style={{ color: P.muted }}>{d.loja ?? "—"}</span>
                            )}
                          </td>
                          <td className="px-3 py-2" style={{ color: P.muted }}>
                            {d.operating_mode ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => alternarDeviceAtivo(d.id, d.ativo)}
                              style={{ color: d.ativo ? P.verde : P.muted }}
                            >
                              {d.ativo ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editando ? (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => salvarDevice(d.id)}
                                  className="px-2 py-1 rounded text-[10px] font-semibold"
                                  style={{ backgroundColor: P.verde, color: "#fff" }}
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => { setMpEditDeviceId(null); setMpEditNome(""); setMpEditLoja(""); }}
                                  style={{ color: P.muted }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setMpEditDeviceId(d.id);
                                  setMpEditNome(d.nome_legivel);
                                  setMpEditLoja(d.loja ?? "");
                                }}
                                style={{ color: P.sage }}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PagBank (Orders API + Moderninha) */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2 flex items-center justify-center"
              style={{ backgroundColor: "#00D972" + "22", color: "#00D972" }}
            >
              <CreditCard size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: P.creme }}>
                PagBank
                {pagbankConfigured && (
                  <span className="ml-2 text-xs font-normal" style={{ color: P.verde }}>✓ configurado</span>
                )}
              </p>
              <p className="text-xs" style={{ color: P.muted }}>
                Pagamentos via PIX, cartão de crédito e link de pagamento
              </p>
            </div>
          </div>
          {/* Toggle ativar/desativar gateway PagBank nas vendas */}
          <button
            onClick={alternarPagbankAtivo}
            className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80"
            title={pagbankAtivo ? "PagBank ativo — clique para desativar" : "PagBank inativo — clique para ativar"}
          >
            {pagbankAtivo ? (
              <ToggleRight size={20} style={{ color: P.verde }} />
            ) : (
              <ToggleLeft size={20} style={{ color: P.muted }} />
            )}
            <span style={{ color: pagbankAtivo ? P.verde : P.muted, fontSize: "11px" }}>
              {pagbankAtivo ? "Ativo" : "Inativo"}
            </span>
          </button>
        </div>

        <div className="space-y-3 text-xs" style={{ color: P.muted }}>
          <div>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
              URL do Webhook (copie e cole no painel PagBank)
            </label>
            <input
              type="text"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : "https://erp.alisson.api.br"}/api/webhooks/pagbank`}
              className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
              style={{ borderColor: P.border, color: P.muted }}
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
              Ambiente
            </label>
            <select
              defaultValue="producao"
              onChange={async (e) => {
                const v = e.target.value;
                try {
                  await fetch("/api/configuracoes/integracoes", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pagbank_ambiente: v }),
                  });
                } catch { /* silencia */ }
              }}
              className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
              style={{ borderColor: P.border, color: P.creme }}
            >
              <option value="producao">Produção (api.pagseguro.com)</option>
              <option value="sandbox">Sandbox (sandbox.api.pagseguro.com)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
              Token PagBank
              {pagbankSaved && <span className="ml-1 text-[10px] font-normal" style={{ color: P.verde }}>✓ salvou!</span>}
            </label>
            <input
              type="password"
              value={pagbankToken}
              onChange={(e) => setPagbankToken(e.target.value)}
              placeholder="Token de integração fornecido no painel PagBank"
              className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
              style={{
                borderColor: pagbankSaved ? P.verde : P.border,
                color: P.creme,
                transition: "border-color 0.3s ease",
              }}
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
              Webhook Secret (normalmente o mesmo Token)
              {pagbankSaved && <span className="ml-1 text-[10px] font-normal" style={{ color: P.verde }}>✓ salvou!</span>}
            </label>
            <input
              type="password"
              value={pagbankWebhookSecret}
              onChange={(e) => setPagbankWebhookSecret(e.target.value)}
              placeholder="Usado para validar notificações — geralmente o mesmo Token acima"
              className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
              style={{
                borderColor: pagbankSaved ? P.verde : P.border,
                color: P.creme,
                transition: "border-color 0.3s ease",
              }}
            />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
              Webhook Base URL (opcional)
            </label>
            <input
              type="text"
              value={pagbankWebhookBaseUrl}
              onChange={(e) => setPagbankWebhookBaseUrl(e.target.value)}
              placeholder="https://erp.alisson.api.br"
              className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
              style={{ borderColor: P.border, color: P.creme }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={salvarPagBank}
            disabled={saving || (!pagbankToken.trim() && !pagbankWebhookSecret.trim())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: P.dourado, color: "#fff" }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "Salvando..." : "Salvar PagBank"}
          </button>
          {pagbankConfigured && (
            <span className="text-xs flex items-center gap-1 font-semibold" style={{ color: pagbankAtivo ? P.verde : P.muted }}>
              <CheckCircle size={13} /> {pagbankAtivo ? "PagBank configurado e ativo" : "PagBank configurado mas INATIVO nas vendas"}
            </span>
          )}
        </div>

        <p className="text-[10px]" style={{ color: P.muted }}>
          As credenciais são salvas via API em configuracoes_secrets com criptografia. Configure também o webhook no painel PagBank apontando para a URL acima.
        </p>
      </div>

      {/* Banco Inter */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ backgroundColor: P.bg, border: `1px solid ${P.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg p-2 flex items-center justify-center"
              style={{ backgroundColor: "#FF7A00" + "22", color: "#FF7A00" }}
            >
              <Landmark size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: P.creme }}>Banco Inter</p>
              <p className="text-xs" style={{ color: P.muted }}>
                Pagamentos automáticos via PIX, boleto e TED (mTLS + OAuth2)
              </p>
            </div>
          </div>
          <StatusBadge ok={interConfigured} />
        </div>

        <button
          onClick={() => setInterExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
          style={{ color: P.sage }}
        >
          {interExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {interExpanded ? "Ocultar credenciais" : (interConfigured ? "Atualizar credenciais" : "Configurar credenciais")}
        </button>

        {interExpanded && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>Client ID</label>
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
                <input
                  type="text"
                  value={interClientId}
                  onChange={(e) => setInterClientId(e.target.value)}
                  placeholder="Client ID do app Inter"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                  style={{ color: P.creme }}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>Client Secret</label>
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
                <input
                  type={showInterClientSecret ? "text" : "password"}
                  value={interClientSecret}
                  onChange={(e) => setInterClientSecret(e.target.value)}
                  placeholder="Client Secret do app Inter"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                  style={{ color: P.creme }}
                />
                <button onClick={() => setShowInterClientSecret(!showInterClientSecret)} className="px-3 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
                  {showInterClientSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
                Certificado (.crt — cole o conteúdo PEM)
              </label>
              <textarea
                value={interCertPem}
                onChange={(e) => setInterCertPem(e.target.value)}
                placeholder={"-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"}
                rows={10}
                className="w-full bg-transparent px-3 py-2.5 text-xs outline-none rounded-lg font-mono"
                style={{ color: P.creme, border: `1px solid ${P.border}`, resize: "vertical" }}
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
                Chave Privada (.key — cole o conteúdo PEM)
              </label>
              <textarea
                value={interKeyPem}
                onChange={(e) => setInterKeyPem(e.target.value)}
                placeholder={"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"}
                rows={10}
                className="w-full bg-transparent px-3 py-2.5 text-xs outline-none rounded-lg font-mono"
                style={{ color: P.creme, border: `1px solid ${P.border}`, resize: "vertical" }}
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>Conta Corrente</label>
              <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
                <input
                  type="text"
                  value={interContaCorrente}
                  onChange={(e) => setInterContaCorrente(e.target.value)}
                  placeholder="Número da conta corrente"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                  style={{ color: P.creme }}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
                Cron Secret (opcional — protege endpoint /sync)
              </label>
              <div className="flex items-center rounded-lg overflow-hidden gap-2" style={{ border: `1px solid ${P.border}` }}>
                <input
                  type={showInterCronSecret ? "text" : "password"}
                  value={interCronSecret}
                  onChange={(e) => setInterCronSecret(e.target.value)}
                  placeholder="String aleatória (32+ chars)"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                  style={{ color: P.creme }}
                />
                <button onClick={() => setShowInterCronSecret(!showInterCronSecret)} className="px-2 py-2.5 transition-opacity hover:opacity-70" style={{ color: P.muted }}>
                  {showInterCronSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="button"
                  onClick={gerarCronSecret}
                  className="px-3 py-2.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
                  style={{ color: P.dourado }}
                >
                  Gerar
                </button>
              </div>
            </div>

            <button
              onClick={salvarInter}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: P.verde, color: "#fff" }}
            >
              <Save size={13} /> Salvar credenciais
            </button>
          </div>
        )}

        {interConfigured && !interExpanded && (
          <p className="text-xs flex items-center gap-1" style={{ color: P.verde }}>
            <CheckCircle size={12} /> Integração Inter ativa — pagamentos automáticos disponíveis
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tab Comissões ────────────────────────────────────────────────────────────
interface FaixaComissao { id: number; desconto_pct: number; comissao_pct: number; ativo: boolean; }

function TabComissoes() {
  const [faixas,    setFaixas]    = useState<FaixaComissao[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editId,    setEditId]    = useState<number | null>(null);
  const [editVal,   setEditVal]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [addMode,   setAddMode]   = useState(false);
  const [newDesc,   setNewDesc]   = useState("");
  const [newCom,    setNewCom]    = useState("");
  const [saveErr,   setSaveErr]   = useState("");

  useEffect(() => {
    fetch("/api/vendas/faixas-comissao?todas=1")
      .then(r => r.json())
      .then((d: FaixaComissao[]) => setFaixas(d))
      .finally(() => setLoading(false));
  }, []);

  async function salvarEdicao(faixa: FaixaComissao) {
    const v = parseFloat(editVal.replace(",", "."));
    if (isNaN(v) || v < 0) return;
    setSaving(true);
    await fetch("/api/vendas/faixas-comissao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: faixa.id, comissao_pct: v }),
    });
    setFaixas(prev => prev.map(f => f.id === faixa.id ? { ...f, comissao_pct: v } : f));
    setEditId(null);
    setSaving(false);
  }

  async function toggleAtivo(faixa: FaixaComissao) {
    await fetch("/api/vendas/faixas-comissao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: faixa.id, comissao_pct: faixa.comissao_pct, ativo: !faixa.ativo }),
    });
    setFaixas(prev => prev.map(f => f.id === faixa.id ? { ...f, ativo: !f.ativo } : f));
  }

  async function adicionarFaixa() {
    const d = parseFloat(newDesc.replace(",", "."));
    const c = parseFloat(newCom.replace(",", "."));
    if (isNaN(d) || isNaN(c)) { setSaveErr("Valores inválidos"); return; }
    setSaving(true); setSaveErr("");
    const res = await fetch("/api/vendas/faixas-comissao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desconto_pct: d, comissao_pct: c }),
    });
    const row = await res.json() as FaixaComissao;
    setFaixas(prev => {
      const sem = prev.filter(f => f.desconto_pct !== row.desconto_pct);
      return [...sem, { ...row, desconto_pct: Number(row.desconto_pct), comissao_pct: Number(row.comissao_pct) }]
        .sort((a, b) => a.desconto_pct - b.desconto_pct);
    });
    setNewDesc(""); setNewCom(""); setAddMode(false); setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: P.creme }}>Tabela de Comissões</h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            Comissão da vendedora por faixa de desconto concedido ao cliente
          </p>
        </div>
        <button onClick={() => setAddMode(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: P.verde, color: "#fff" }}>
          <Plus size={13} /> Nova faixa
        </button>
      </div>

      {addMode && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: P.border }}>
          <p className="text-xs font-semibold" style={{ color: P.creme }}>Nova faixa</p>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs mb-1 block" style={{ color: P.sage }}>Desconto (%)</label>
              <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="ex: 5" className="border rounded-lg px-3 py-2 text-sm w-28 outline-none"
                style={{ borderColor: P.border }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: P.sage }}>Comissão (%)</label>
              <input type="text" value={newCom} onChange={e => setNewCom(e.target.value)}
                placeholder="ex: 3.42" className="border rounded-lg px-3 py-2 text-sm w-28 outline-none"
                style={{ borderColor: P.border }} />
            </div>
            <button onClick={adicionarFaixa} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ backgroundColor: P.verde, color: "#fff" }}>
              <Save size={13} /> Salvar
            </button>
            <button onClick={() => { setAddMode(false); setSaveErr(""); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
              style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}>
              <X size={13} /> Cancelar
            </button>
          </div>
          {saveErr && <p className="text-xs" style={{ color: P.vermelho }}>{saveErr}</p>}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-center py-8" style={{ color: P.sage }}>Carregando...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: P.border }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: P.bg }}>
              <tr>
                {["Desconto concedido", "Comissão da vendedora", "Ativo", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: P.sage }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {faixas.map(f => (
                <tr key={f.id} className="border-t" style={{ borderColor: P.border, opacity: f.ativo ? 1 : 0.45 }}>
                  <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: P.creme }}>
                    {f.desconto_pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5">
                    {editId === f.id ? (
                      <div className="flex items-center gap-2">
                        <input autoFocus type="text" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") salvarEdicao(f); if (e.key === "Escape") setEditId(null); }}
                          className="border rounded-lg px-2 py-1 text-sm w-24 outline-none"
                          style={{ borderColor: P.dourado }} />
                        <span className="text-xs" style={{ color: P.sage }}>%</span>
                        <button onClick={() => salvarEdicao(f)} disabled={saving}
                          className="p-1 rounded" style={{ color: P.verde }}>
                          <CheckCircle size={14} />
                        </button>
                        <button onClick={() => setEditId(null)} className="p-1 rounded" style={{ color: P.sage }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="tabular-nums font-semibold" style={{ color: P.verde }}>
                        {f.comissao_pct.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => toggleAtivo(f)}
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: f.ativo ? "#dcfce7" : "#f3f4f6",
                        color: f.ativo ? P.verde : P.sage,
                      }}>
                      {f.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => { setEditId(f.id); setEditVal(f.comissao_pct.toFixed(2)); }}
                      className="p-1 rounded hover:bg-gray-100" style={{ color: P.sage }}>
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: P.muted }}>
        O limite máximo de desconto por vendedora é configurado na aba <strong>Usuários</strong>.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Maquininhas — Gerenciamento de devices Point por vendedor
// ═══════════════════════════════════════════════════════════════════════════════
interface MaqDevice {
  id: number;
  device_id: string;
  nome_legivel: string;
  vendedor_id: number | null;
  is_reserva: boolean;
  ativo: boolean;
  loja: string | null;
  parcelas_padrao_mp: number;
}

interface Vendedor {
  id_vendedor: number;
  nome: string;
}

function TabMaquininhas() {
  const [devices, setDevices] = useState<MaqDevice[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Estado modal edição inline
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editLoja, setEditLoja] = useState("");
  const [editVendedorId, setEditVendedorId] = useState<string>("");
  const [editIsReserva, setEditIsReserva] = useState(false);
  const [editAtivo, setEditAtivo] = useState(true);
  const [editParcelasPadrao, setEditParcelasPadrao] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveErro, setSaveErro] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const [devRes, vendRes] = await Promise.all([
        fetch("/api/mercado-pago/devices"),
        fetch("/api/vendedores"),
      ]);
      if (!devRes.ok) throw new Error("Erro ao carregar maquininhas");
      setDevices(await devRes.json());
      if (vendRes.ok) setVendedores(await vendRes.json());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function sincronizar() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/mercado-pago/devices", { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setSyncMsg({ tipo: "ok", texto: `Sincronizado: ${body.inserted} novas, ${body.updated} atualizadas (total ${body.total})` });
        await carregar();
      } else {
        setSyncMsg({ tipo: "erro", texto: body.error ?? "Erro ao sincronizar" });
      }
    } catch {
      setSyncMsg({ tipo: "erro", texto: "Erro de rede" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  function abrirEdicao(d: MaqDevice) {
    setEditandoId(d.id);
    setEditNome(d.nome_legivel);
    setEditLoja(d.loja ?? "");
    setEditVendedorId(d.vendedor_id != null ? String(d.vendedor_id) : "");
    setEditIsReserva(d.is_reserva);
    setEditAtivo(d.ativo);
    setEditParcelasPadrao(d.parcelas_padrao_mp ?? 1);
    setSaveErro(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setSaveErro(null);
  }

  async function salvar(id: number) {
    setSaving(true);
    setSaveErro(null);
    try {
      const body: Record<string, unknown> = {
        id,
        nome_legivel: editNome.trim() || undefined,
        loja: editLoja.trim() || null,
        ativo: editAtivo,
      };
      if (editVendedorId) {
        body.vendedor_id = Number(editVendedorId);
        body.is_reserva = false;
        body.parcelas_padrao_mp = editParcelasPadrao;
      } else {
        body.vendedor_id = null;
        body.is_reserva = editIsReserva;
      }
      const res = await fetch("/api/mercado-pago/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) throw new Error("Vendedor já tem outra maquininha atribuída");
        throw new Error(data.error ?? "Erro ao salvar");
      }
      setEditandoId(null);
      await carregar();
    } catch (e) {
      setSaveErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  const nomeVendedor = (id: number | null) => {
    if (id == null) return "—";
    return vendedores.find(v => v.id_vendedor === id)?.nome ?? String(id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: P.sage }}>
        <Loader2 size={16} className="animate-spin" /> Carregando maquininhas...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl text-sm" style={{ backgroundColor: P.vermelho + "18", color: P.vermelho }}>
        <AlertTriangle size={14} /> {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: P.creme }}>Maquininhas</h2>
          <p className="text-xs" style={{ color: P.muted }}>
            {devices.length === 0
              ? "Nenhuma maquininha sincronizada"
              : `${devices.length} maquininha${devices.length > 1 ? "s" : ""} cadastrada${devices.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={sincronizar}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-opacity hover:opacity-80"
          style={{ backgroundColor: P.dourado, color: "#fff" }}
        >
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {syncing ? "Sincronizando..." : "Sincronizar com MP"}
        </button>
      </div>

      {syncMsg && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg text-xs"
          style={{
            backgroundColor: syncMsg.tipo === "ok" ? P.verde + "18" : P.vermelho + "18",
            color: syncMsg.tipo === "ok" ? P.verde : P.vermelho,
          }}
        >
          {syncMsg.tipo === "ok" ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
          {syncMsg.texto}
        </div>
      )}

      {devices.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: P.muted }}>
          Clique em &ldquo;Sincronizar com MP&rdquo; para importar as maquininhas cadastradas no Mercado Pago.
        </div>
      )}

      {devices.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Nome Legível", "Device ID", "Vendedor Atribuído", "Reserva da Loja", "Status", "Ações"].map(h => (
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
              {devices.map(d => {
                const editando = editandoId === d.id;
                return (
                  <tr key={d.id} className="border-t" style={{ borderColor: P.border }}>
                    {/* Nome Legível */}
                    <td className="px-4 py-3">
                      {editando ? (
                        <input
                          value={editNome}
                          onChange={e => setEditNome(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
                          style={{ borderColor: P.border, color: P.creme }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Smartphone size={13} style={{ color: P.sage }} />
                          <span className="font-medium" style={{ color: P.creme }}>{d.nome_legivel}</span>
                        </div>
                      )}
                    </td>

                    {/* Device ID */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] break-all" style={{ color: P.muted }}>
                        {d.device_id}
                      </span>
                    </td>

                    {/* Vendedor Atribuído */}
                    <td className="px-4 py-3">
                      {editando ? (
                        <div className="space-y-2">
                          <select
                            value={editVendedorId}
                            onChange={e => {
                              setEditVendedorId(e.target.value);
                              if (e.target.value) setEditIsReserva(false);
                            }}
                            className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
                            style={{ borderColor: P.border, color: P.creme }}
                          >
                            <option value="">— Nenhum / Reserva</option>
                            {vendedores.map(v => (
                              <option key={v.id_vendedor} value={v.id_vendedor}>
                                {v.nome}
                              </option>
                            ))}
                          </select>
                          {/* Campo parcelas padrão — só habilitado quando há vendedor selecionado */}
          <div>
                            <label
                              className="text-[10px] uppercase tracking-wider block mb-1"
                              style={{ color: editVendedorId ? P.muted : P.muted + "80" }}
                            >
                              Parcelas padrão
                            </label>
                            <select
                              value={editParcelasPadrao}
                              disabled={!editVendedorId}
                              onChange={e => setEditParcelasPadrao(Number(e.target.value))}
                              className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none disabled:opacity-40"
                              style={{ borderColor: P.border, color: P.creme }}
                            >
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n}x</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span style={{ color: d.vendedor_id ? P.creme : P.muted }}>
                            {nomeVendedor(d.vendedor_id)}
                          </span>
                          {d.vendedor_id && d.parcelas_padrao_mp > 1 && (
                            <span
                              className="block text-[10px] mt-0.5"
                              style={{ color: P.muted }}
                            >
                              {d.parcelas_padrao_mp}x padrão
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Reserva da Loja */}
                    <td className="px-4 py-3">
                      {editando ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editIsReserva}
                            disabled={!!editVendedorId}
                            onChange={e => setEditIsReserva(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs" style={{ color: editVendedorId ? P.muted : P.creme }}>
                            Reserva
                          </span>
                        </label>
                      ) : (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: d.is_reserva ? P.dourado + "22" : P.border,
                            color: d.is_reserva ? P.dourado : P.muted,
                          }}
                        >
                          {d.is_reserva ? "Sim" : "Não"}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {editando ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <button
                            type="button"
                            onClick={() => setEditAtivo(v => !v)}
                            style={{ color: editAtivo ? P.verde : P.muted }}
                          >
                            {editAtivo ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                          </button>
                          <span className="text-xs" style={{ color: editAtivo ? P.verde : P.muted }}>
                            {editAtivo ? "Ativo" : "Inativo"}
                          </span>
                        </label>
                      ) : (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: d.ativo ? P.verde + "22" : P.border,
                            color: d.ativo ? P.verde : P.muted,
                          }}
                        >
                          {d.ativo ? "Ativo" : "Inativo"}
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      {editando ? (
                        <div className="space-y-1">
                          {saveErro && (
                            <p className="text-[11px]" style={{ color: P.vermelho }}>{saveErro}</p>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => salvar(d.id)}
                              disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                              style={{ backgroundColor: P.verde, color: "#fff" }}
                            >
                              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                              Salvar
                            </button>
                            <button
                              onClick={cancelarEdicao}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                              style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                            >
                              <X size={11} /> Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => abrirEdicao(d)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                          style={{ backgroundColor: P.bg, color: P.sage, border: `1px solid ${P.border}` }}
                        >
                          <Pencil size={11} /> Editar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ConfiguracoesClient({ parametros, webhooks, logs, usuarios, depositos, teores, ligaTipos }: Props) {
  const [tab, setTab] = useState<Tab>("parametros");
  const [initialUserId, setInitialUserId] = useState<string | null>(null);
  const { role: currentRole } = useAuth();
  const isSuperAdmin = currentRole === "desenvolvedor" || currentRole === "admin";
  const canSeeMaquininhas = isFullAccess(currentRole);

  // Ler query params (?tab=usuarios&user=UUID) uma vez no mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    const u = params.get("user");
    if (t && ["parametros", "webhooks", "usuarios", "ia", "depositos", "permissoes", "teores", "locais", "tipos_servico", "cotacoes", "integracoes", "maquininhas", "fretes", "gateways", "produto_visibilidade", "aprovadores", "frete_avulso_liberadores"].includes(t)) {
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
    { key: "comissoes",     label: "Comissões",       icon: PenLine },
    { key: "credito_loja", label: "Crédito Loja",    icon: Wallet },
    { key: "fretes",       label: "Fretes",           icon: Truck },
    { key: "gateways",    label: "Gateways",          icon: CreditCard },
    { key: "metal",       label: "Metal",             icon: Scale },
    { key: "aprovadores", label: "Aprovadores",       icon: Shield },
    { key: "frete_avulso_liberadores", label: "Liberadores Frete Avulso", icon: Bike },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tabs: { key: Tab; label: string; icon: any }[] = isSuperAdmin
    ? [...baseTabs,
        { key: "permissoes" as Tab,           label: "Permissões",      icon: Shield },
        { key: "produto_visibilidade" as Tab, label: "Visib. Produtos", icon: Eye    },
      ]
    : baseTabs;
  if (canSeeMaquininhas) {
    tabs = [...tabs, { key: "maquininhas" as Tab, label: "Maquininhas", icon: Smartphone }];
  }

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
      {tab === "comissoes"   && <TabComissoes />}
      {tab === "credito_loja" && <TabCreditoLoja />}
      {tab === "maquininhas" && canSeeMaquininhas && <TabMaquininhas />}
      {tab === "fretes"    && (isSuperAdmin || currentRole === "gerente_loja") && <TabFretes />}
      {tab === "gateways"            && isSuperAdmin && <TabGateways />}
      {tab === "produto_visibilidade" && isSuperAdmin && <TabProdutoVisibilidade />}
      {tab === "aprovadores" && <TabAprovadores />}
      {tab === "frete_avulso_liberadores" && <TabFreteAvulsoLiberadores />}

      {tab === "metal" && <TabMetal />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Crédito Loja — Saldo rotativo do gerente de loja
// ═══════════════════════════════════════════════════════════════════════════════
function TabCreditoLoja() {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [limite, setLimite] = useState<number | null>(null);
  const [movimentos, setMovimentos] = useState<Array<{
    id: number; tipo: string; valor: number; saldo_antes: number; saldo_depois: number;
    descricao: string | null; usuario_nome: string | null; numero_venda: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [novoLimite, setNovoLimite] = useState("");
  const [saving, setSaving] = useState(false);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  async function loadData() {
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        fetch("/api/saldo-credito").then(r => r.json()),
        fetch("/api/saldo-credito/movimentos?limit=30").then(r => r.json()),
      ]);
      setSaldo(sRes.saldo_atual);
      setLimite(sRes.limite);
      setNovoLimite(String(sRes.limite));
      setMovimentos(mRes.movimentos ?? []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleLimite() {
    const lim = parseFloat(novoLimite.replace(",", "."));
    if (isNaN(lim) || lim < 0) return alert("Limite inválido");
    setSaving(true);
    try {
      const res = await fetch("/api/saldo-credito", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: lim }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await loadData();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: P.creme }} /></div>;

  const pctUsado = limite && limite > 0 ? ((limite - (saldo ?? 0)) / limite) * 100 : 0;
  const corBarra = pctUsado > 80 ? "#EF4444" : pctUsado > 50 ? "#D97706" : "#059669";

  return (
    <div className="space-y-6">
      {/* Cards resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: P.sage }}>Saldo Disponível</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: (saldo ?? 0) < 0 ? "#EF4444" : "#059669" }}>{fmt(saldo ?? 0)}</p>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: P.sage }}>Limite Configurado</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: P.creme }}>{fmt(limite ?? 0)}</p>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: P.sage }}>Utilização</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold tabular-nums" style={{ color: corBarra }}>{pctUsado.toFixed(0)}%</p>
          </div>
          <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: P.border }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pctUsado, 100)}%`, backgroundColor: corBarra }} />
          </div>
        </div>
      </div>

      {/* Alterar limite (o saldo é derivado ao vivo; não há ajuste manual) */}
      <div className="rounded-xl border p-4" style={{ borderColor: P.border, backgroundColor: P.card }}>
        <p className="text-sm font-semibold mb-1" style={{ color: P.creme }}>Alterar Limite</p>
        <p className="text-xs mb-3" style={{ color: P.sage }}>O saldo disponível é calculado automaticamente: limite − total a receber pendente.</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <input type="text" value={novoLimite} onChange={e => setNovoLimite(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }} />
          </div>
          <button onClick={handleLimite} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: P.creme, color: P.card }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>

      {/* Tabela de movimentos */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: P.border }}>
        <div className="px-4 py-3" style={{ backgroundColor: P.card }}>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>Movimentações Recentes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Data</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Tipo</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Venda</th>
                <th className="text-right px-4 py-2 font-medium" style={{ color: P.sage }}>Valor</th>
                <th className="text-right px-4 py-2 font-medium" style={{ color: P.sage }}>Saldo</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Descrição</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: P.sage }}>Nenhuma movimentação registrada</td></tr>
              )}
              {movimentos.map(m => (
                <tr key={m.id} className="border-t" style={{ borderColor: P.border }}>
                  <td className="px-4 py-2 tabular-nums" style={{ color: P.sage }}>
                    {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: m.tipo === "credito" ? "#D1FAE5" : m.tipo === "debito" ? "#FEE2E2" : "#DBEAFE",
                        color: m.tipo === "credito" ? "#065F46" : m.tipo === "debito" ? "#991B1B" : "#1E40AF",
                      }}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2" style={{ color: P.creme }}>{m.numero_venda ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium"
                    style={{ color: m.tipo === "credito" ? "#059669" : m.tipo === "debito" ? "#EF4444" : "#3B82F6" }}>
                    {m.tipo === "debito" ? "-" : "+"}{fmt(m.valor)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.sage }}>{fmt(m.saldo_depois)}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: P.sage }}>{m.descricao ?? "—"}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: P.sage }}>{m.usuario_nome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Fretes por Bairro
// ═══════════════════════════════════════════════════════════════════════════════
const BAIRROS_FORTALEZA = [
  "Aerolândia","Água Fria","Aldeota","Alto da Balança","Alto da Paz","Alto da Vila Prudente",
  "Ancuri","Antônio Bezerra","Areninhas","Autran Nunes","Bairro de Fátima","Barroso",
  "Bela Vista","Benfica","Boa Vista","Bom Futuro","Bom Jardim","Bom Sucesso",
  "Cais do Porto","Cajazeiras","Caça e Pesca","Canindezinho","Carlito Pamplona",
  "Casa Amarela","Castelão","Conjunto Ceará I","Conjunto Ceará II","Couto Fernandes",
  "Cristo Redentor","Curió","Damas","Demócrito Rocha","Dendê","Dias Macêdo",
  "Dois Córregos","Dom Lustosa","Edson Queiroz","Ellery","Engenheiro Luciano Cavalcante",
  "Farias Brito","Floresta","Granja Lisboa","Granja Portugal","Guararapes",
  "Henrique Jorge","Itaoca","Itaperi","Itinga","Jacarecanga","Jardim América",
  "Jardim das Oliveiras","Jardim Guanabara","Jardim Iracema","Jardim União",
  "João XXIII","José Bonifácio","José de Alencar","Jóquei Clube","Lagoa Redonda",
  "Lavras da Mangabeira","Luciano Cavalcante","Luís Cavalcante","Manoel Sátiro",
  "Maraponga","Meireles","Messejana","Mondubim","Monte Castelo","Montese",
  "Mucuripe","Nabuco","Nova Aldeota","Novo Mondubim","Padre Andrade",
  "Padre Júlio Maria","Parangaba","Parque Araxá","Parque Dois Irmãos",
  "Parque Genibaú","Parque Iracema","Parque Manibura","Parque Santa Rosa",
  "Passaré","Paupina","Pici","Pirambu","Planalto Ayrton Senna","Prefeito José Walter",
  "Praia de Iracema","Praia do Futuro I","Praia do Futuro II","Quintino Cunha",
  "Rodolfo Teófilo","Salinas","Sabiaguaba","São Bento","São Gerardo","São João do Tauape",
  "São Miguel","Serrinha","Siqueira","Tarumã","Tauape","Varjota","Vicente Pinzón",
  "Vila Ellery","Vila Manoel Sátiro","Vila União","Vila Velha","Zé Bonifácio",
];

interface FreteBairro {
  id: number;
  bairro: string;
  municipio: string | null;
  valor: number;
  ativo: boolean;
}

function TabFretes() {
  const [fretes, setFretes] = useState<FreteBairro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [erroId, setErroId] = useState<number | null>(null);
  const [editValores, setEditValores] = useState<Record<number, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [novoForm, setNovoForm] = useState({ bairro: "", municipio: "Fortaleza", valor: "" });
  const [savingNovo, setSavingNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState("");
  const [bairroSugestoes, setBairroSugestoes] = useState<string[]>([]);
  const [bairroOpen, setBairroOpen] = useState(false);

  const fmtFrete = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracoes/fretes-bairro");
      const data = await res.json();
      setFretes(Array.isArray(data) ? data : (data.fretes ?? []));
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function handleSalvar(frete: FreteBairro) {
    const valorStr = editValores[frete.id] ?? String(frete.valor);
    const valor = parseFloat(valorStr.replace(",", "."));
    if (isNaN(valor) || valor < 0) return;
    setSalvandoId(frete.id); setErroId(null);
    try {
      const res = await fetch(`/api/configuracoes/fretes-bairro/${frete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor }),
      });
      if (!res.ok) throw new Error("Erro");
      setFretes(prev => prev.map(f => f.id === frete.id ? { ...f, valor } : f));
      setEditValores(prev => { const next = { ...prev }; delete next[frete.id]; return next; });
      setSavedId(frete.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      setErroId(frete.id);
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleToggleAtivo(frete: FreteBairro) {
    setSalvandoId(frete.id);
    try {
      const res = await fetch(`/api/configuracoes/fretes-bairro/${frete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !frete.ativo }),
      });
      if (!res.ok) throw new Error("Erro");
      setFretes(prev => prev.map(f => f.id === frete.id ? { ...f, ativo: !f.ativo } : f));
    } catch { /* silencioso */ }
    finally { setSalvandoId(null); }
  }

  async function handleCriarFrete() {
    if (!novoForm.bairro.trim()) { setErroNovo("Bairro é obrigatório"); return; }
    setSavingNovo(true); setErroNovo("");
    try {
      const res = await fetch("/api/configuracoes/fretes-bairro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bairro: novoForm.bairro, municipio: novoForm.municipio, valor: parseFloat(novoForm.valor.replace(",", ".")) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setFretes(prev => [...prev, { ...data, valor: Number(data.valor) }].sort((a, b) => a.bairro.localeCompare(b.bairro)));
      setNovoForm({ bairro: "", municipio: "Fortaleza", valor: "" });
      setShowForm(false);
    } catch (e) { setErroNovo(e instanceof Error ? e.message : "Erro ao cadastrar"); }
    finally { setSavingNovo(false); }
  }

  const filtered = fretes.filter(f =>
    filtro.trim() === "" ||
    f.bairro.toLowerCase().includes(filtro.toLowerCase()) ||
    (f.municipio ?? "").toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: P.muted }}>
      <Loader2 size={14} className="animate-spin" /> Carregando fretes...
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: P.creme }}>Fretes por Bairro</h3>
        <p className="text-xs mt-0.5" style={{ color: P.muted }}>
          Configure o valor de frete para cada bairro. Bairros inativos não aparecem no cálculo automático.
        </p>
      </div>

      {/* Botão novo + form inline */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold w-fit"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          <Plus size={13} /> Adicionar bairro
        </button>
      ) : (
        <div className="rounded-xl p-4 space-y-3" style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}>
          <p className="text-xs font-semibold" style={{ color: P.creme }}>Novo Bairro</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: P.muted }}>Bairro *</label>
              <input
                type="text"
                value={novoForm.bairro}
                onChange={e => {
                  const v = e.target.value;
                  setNovoForm(p => ({ ...p, bairro: v }));
                  if (v.trim().length >= 1) {
                    const sugs = BAIRROS_FORTALEZA.filter(b => b.toLowerCase().includes(v.toLowerCase())).slice(0, 8);
                    setBairroSugestoes(sugs);
                    setBairroOpen(sugs.length > 0);
                  } else {
                    setBairroOpen(false);
                  }
                }}
                onBlur={() => setTimeout(() => setBairroOpen(false), 150)}
                onFocus={() => {
                  if (novoForm.bairro.trim().length >= 1 && bairroSugestoes.length > 0) setBairroOpen(true);
                }}
                placeholder="Nome do bairro"
                className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
              />
              {bairroOpen && (
                <div className="absolute z-50 w-full mt-1 rounded-xl border shadow-lg bg-white overflow-hidden" style={{ borderColor: P.border, maxHeight: 220, overflowY: "auto" }}>
                  {bairroSugestoes.map(b => (
                    <button
                      key={b}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 border-b last:border-b-0"
                      style={{ borderColor: P.border, color: P.creme }}
                      onMouseDown={() => {
                        setNovoForm(p => ({ ...p, bairro: b }));
                        setBairroOpen(false);
                      }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: P.muted }}>Município</label>
              <input
                type="text"
                value={novoForm.municipio}
                onChange={e => setNovoForm(p => ({ ...p, municipio: e.target.value }))}
                className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ color: P.muted }}>Valor (R$)</label>
              <input
                type="text"
                value={novoForm.valor}
                onChange={e => setNovoForm(p => ({ ...p, valor: e.target.value }))}
                placeholder="0,00"
                className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
              />
            </div>
          </div>
          {erroNovo && <p className="text-xs text-red-500">{erroNovo}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setErroNovo(""); }} className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: P.border, color: P.muted }}>Cancelar</button>
            <button onClick={handleCriarFrete} disabled={savingNovo} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ backgroundColor: P.verde, color: "#fff" }}>
              {savingNovo ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Salvar
            </button>
          </div>
        </div>
      )}

      {/* Filtro */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: P.muted }} />
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar por bairro ou município..."
          className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
          style={{ borderColor: P.border, backgroundColor: P.bg, color: P.creme }}
        />
        {filtro && (
          <button onClick={() => setFiltro("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={12} />
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: P.muted }}>
        {filtered.length} {filtered.length === 1 ? "bairro" : "bairros"}{filtro ? " encontrado(s)" : " no total"}
      </p>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <div className="overflow-x-auto" style={{ maxHeight: 600, overflowY: "auto" }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Bairro", "Município", "Valor (R$)", "Ativo", "Ações"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: P.muted }}>
                    {filtro ? "Nenhum bairro encontrado para este filtro" : "Nenhum frete cadastrado"}
                  </td>
                </tr>
              ) : (
                filtered.map(frete => (
                  <tr key={frete.id} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: P.border }}>
                    <td className="px-4 py-3 font-medium" style={{ color: P.creme }}>{frete.bairro}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: P.sage }}>{frete.municipio ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs" style={{ color: P.muted }}>R$</span>
                        <input
                          type="text"
                          value={editValores[frete.id] !== undefined ? editValores[frete.id] : String(frete.valor)}
                          onChange={e => setEditValores(prev => ({ ...prev, [frete.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") handleSalvar(frete); }}
                          className="w-24 border rounded-lg px-2 py-1 text-sm text-right outline-none"
                          style={{ borderColor: P.border, backgroundColor: P.card, color: P.creme }}
                        />
                        {savedId === frete.id && <CheckCircle size={13} style={{ color: P.verde }} />}
                        {erroId === frete.id && <AlertTriangle size={13} style={{ color: P.vermelho }} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleAtivo(frete)}
                        disabled={salvandoId === frete.id}
                        className="flex items-center gap-1 text-xs disabled:opacity-50"
                      >
                        {salvandoId === frete.id ? (
                          <Loader2 size={14} className="animate-spin" style={{ color: P.muted }} />
                        ) : frete.ativo ? (
                          <ToggleRight size={20} style={{ color: P.verde }} />
                        ) : (
                          <ToggleLeft size={20} style={{ color: P.muted }} />
                        )}
                        <span style={{ color: frete.ativo ? P.verde : P.muted }}>
                          {frete.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSalvar(frete)}
                        disabled={salvandoId === frete.id || editValores[frete.id] === undefined}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
                        style={{
                          backgroundColor: editValores[frete.id] !== undefined ? P.verde : P.bg,
                          color: editValores[frete.id] !== undefined ? "#fff" : P.sage,
                          border: `1px solid ${editValores[frete.id] !== undefined ? P.verde : P.border}`,
                        }}
                      >
                        {salvandoId === frete.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        Salvar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {fmtFrete(0) && null /* suppress unused var */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Gateways — Gateways de Pagamento do Caixa
// ═══════════════════════════════════════════════════════════════════════════════
function TabGateways() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", tipo: "outro" as Gateway["tipo"], cor: "#6B7280", obs: "" });
  const [erro, setErro] = useState<string | null>(null);

  const TIPO_LABELS: Record<Gateway["tipo"], string> = {
    pix: "PIX", cartao: "Cartão", dinheiro: "Dinheiro", ouro: "Ouro", outro: "Outro",
  };
  const TIPO_CORES: Record<Gateway["tipo"], string> = {
    pix: "#1D4ED8", cartao: "#7C3AED", dinheiro: "#059669", ouro: "#D97706", outro: "#6B7280",
  };

  useEffect(() => {
    fetch("/api/configuracoes/gateways")
      .then(r => r.json())
      .then(data => { setGateways(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function startAdd() {
    setEditingId(null);
    setForm({ nome: "", tipo: "outro", cor: "#6B7280", obs: "" });
    setErro(null);
    setShowForm(true);
  }

  function startEdit(g: Gateway) {
    setEditingId(g.id);
    setForm({ nome: g.nome, tipo: g.tipo, cor: g.cor, obs: g.obs ?? "" });
    setErro(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { setErro("Nome obrigatório"); return; }
    setSaving(true);
    setErro(null);
    try {
      const url = editingId ? `/api/configuracoes/gateways/${editingId}` : "/api/configuracoes/gateways";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: form.nome.trim(), tipo: form.tipo, cor: form.cor, obs: form.obs.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error || "Erro ao salvar"); setSaving(false); return; }
      if (editingId) {
        setGateways(prev => prev.map(g => g.id === editingId ? data : g));
      } else {
        setGateways(prev => [...prev, data]);
      }
      setShowForm(false);
      setEditingId(null);
    } catch { setErro("Erro de rede"); }
    setSaving(false);
  }

  async function handleToggle(g: Gateway) {
    setTogglingId(g.id);
    const res = await fetch(`/api/configuracoes/gateways/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !g.ativo }),
    });
    if (res.ok) {
      const data = await res.json();
      setGateways(prev => prev.map(x => x.id === g.id ? data : x));
    }
    setTogglingId(null);
  }

  async function handleDelete(g: Gateway) {
    if (!confirm(`Excluir/desativar gateway "${g.nome}"?`)) return;
    setDeletingId(g.id);
    const res = await fetch(`/api/configuracoes/gateways/${g.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.deleted) {
      setGateways(prev => prev.filter(x => x.id !== g.id));
    } else if (data.deactivated) {
      setGateways(prev => prev.map(x => x.id === g.id ? { ...x, ativo: false } : x));
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: P.creme }}>Gateways de Pagamento</h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>Configure as contas/gateways que recebem os pagamentos do caixa</p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          <Plus size={14} /> Novo Gateway
        </button>
      </div>

      {/* Form novo/editar */}
      {showForm && (
        <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <h3 className="text-sm font-semibold" style={{ color: P.creme }}>
            {editingId ? "Editar Gateway" : "Novo Gateway"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Nome *</label>
              <input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Mercado Pago, Stone, Nubank..."
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: P.border, color: P.creme }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Tipo</label>
              <select
                value={form.tipo}
                onChange={e => {
                  const t = e.target.value as Gateway["tipo"];
                  setForm(f => ({ ...f, tipo: t, cor: TIPO_CORES[t] }));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: P.border, color: P.creme, backgroundColor: P.card }}
              >
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="ouro">Ouro</option>
                <option value="outro">Outro (múltiplos)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Cor</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                  className="w-10 h-9 rounded-lg border cursor-pointer" style={{ borderColor: P.border }} />
                <span className="text-xs font-mono" style={{ color: P.sage }}>{form.cor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Observação</label>
              <input
                value={form.obs}
                onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                placeholder="Ex: conta PJ Bradesco"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: P.border, color: P.creme }}
              />
            </div>
          </div>
          {erro && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#FEE2E2", color: P.vermelho }}>{erro}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); setEditingId(null); setErro(null); }}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm border font-medium disabled:opacity-40"
              style={{ borderColor: P.border, color: P.sage }}
            >Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: P.verde, color: "#fff" }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editingId ? "Salvar Alterações" : "Criar Gateway"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin" style={{ color: P.muted }} />
        </div>
      ) : gateways.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: P.border }}>
          <CreditCard size={28} className="mx-auto mb-2" style={{ color: P.muted }} />
          <p className="text-sm" style={{ color: P.sage }}>Nenhum gateway cadastrado.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: P.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Gateway", "Tipo", "Status", "Observação", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: P.sage }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gateways.map(g => (
                <tr key={g.id} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: P.border }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.cor }} />
                      <span className="font-medium" style={{ color: P.creme }}>{g.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: TIPO_CORES[g.tipo] + "18", color: TIPO_CORES[g.tipo] }}>
                      {TIPO_LABELS[g.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggle(g)} disabled={togglingId === g.id}
                      className="flex items-center gap-1 text-xs disabled:opacity-50">
                      {togglingId === g.id ? (
                        <Loader2 size={14} className="animate-spin" style={{ color: P.muted }} />
                      ) : g.ativo ? (
                        <ToggleRight size={20} style={{ color: P.verde }} />
                      ) : (
                        <ToggleLeft size={20} style={{ color: P.muted }} />
                      )}
                      <span style={{ color: g.ativo ? P.verde : P.muted }}>{g.ativo ? "Ativo" : "Inativo"}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: P.sage }}>{g.obs ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(g)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Editar">
                        <Pencil size={13} style={{ color: P.sage }} />
                      </button>
                      <button onClick={() => handleDelete(g)} disabled={deletingId === g.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Excluir">
                        {deletingId === g.id
                          ? <Loader2 size={13} className="animate-spin" style={{ color: P.vermelho }} />
                          : <Trash2 size={13} style={{ color: P.vermelho }} />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px]" style={{ color: P.muted }}>
        Gateways em uso por pagamentos serão desativados (não excluídos) ao remover.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Metal — Configurações do módulo de compra e recebimento de metal
//
// REGRA DE NEGÓCIO: Configura os percentuais da cotação do ouro que definem
// as faixas de preço para compra e recebimento de metal. Impacta diretamente
// o valor pago ao fornecedor e o crédito dado ao cliente.
// IMPACTO SE REMOVIDO: Não é possível ajustar as faixas de preço do metal.
// ═══════════════════════════════════════════════════════════════════════════════
function TabMetal() {
  const [config, setConfig] = useState({
    compra_metal_min_pct: 80,
    compra_metal_max_pct: 85,
    compra_metal_comm_pct: 50,
    receb_metal_min_pct: 95,
    receb_metal_max_pct: 100,
    metal_home_roles: [] as string[],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erroMsg, setErroMsg] = useState("");
  const [erroLoad, setErroLoad] = useState("");

  useEffect(() => {
    fetch("/api/metal/configuracoes")
      .then((r) => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao carregar`);
        return r.json();
      })
      .then((d) => {
        if (d && typeof d === "object") setConfig((c) => ({ ...c, ...d }));
      })
      .catch((e) => {
        setErroLoad((e as Error).message || "Falha ao carregar configurações");
      })
      .finally(() => setLoading(false));
  }, []);

  async function salvar() {
    setSaving(true);
    setSaved(false);
    setErroMsg("");
    try {
      const res = await fetch("/api/metal/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || `Erro ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErroMsg((e as Error).message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>;

  if (erroLoad) return (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-red-600">{erroLoad}</p>
      <button onClick={() => { setErroLoad(""); setLoading(true); window.location.reload(); }} className="text-xs text-[#1A3C34] underline">Tentar novamente</button>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Compra de Metal */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/20 p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1A3C34]">Compra de Metal (Fornecedor)</h3>
        <p className="text-xs text-[#1A3C34]/60">
          A empresa paga ao fornecedor um percentual da cotação do ouro. Comissão do funcionário é calculada sobre o spread.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-[#1A3C34]/60 mb-1">% Mínimo da Cotação</label>
            <input type="number" min={0} max={100} className="w-full bg-[#F2E8D5]/30 border border-[#C59B6D]/20 rounded-xl px-3 py-2 text-sm font-mono" value={config.compra_metal_min_pct} onChange={(e) => setConfig((c) => ({ ...c, compra_metal_min_pct: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#1A3C34]/60 mb-1">% Máximo da Cotação</label>
            <input type="number" min={0} max={100} className="w-full bg-[#F2E8D5]/30 border border-[#C59B6D]/20 rounded-xl px-3 py-2 text-sm font-mono" value={config.compra_metal_max_pct} onChange={(e) => setConfig((c) => ({ ...c, compra_metal_max_pct: Number(e.target.value) }))} />
            <div className="mt-2 bg-[#1A3C34]/10 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-[#1A3C34]" style={{ width: `${Math.min(100, config.compra_metal_max_pct - config.compra_metal_min_pct)}%` }} />
            </div>
            <p className="text-[10px] text-[#1A3C34]/40 mt-1">Faixa: {config.compra_metal_min_pct}% – {config.compra_metal_max_pct}%</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#1A3C34]/60 mb-1">% Comissão sobre Spread</label>
            <input type="number" min={0} max={100} className="w-full bg-[#F2E8D5]/30 border border-[#C59B6D]/20 rounded-xl px-3 py-2 text-sm font-mono" value={config.compra_metal_comm_pct} onChange={(e) => setConfig((c) => ({ ...c, compra_metal_comm_pct: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      {/* Recebimento de Metal */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/20 p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1A3C34]">Recebimento de Metal (Cliente)</h3>
        <p className="text-xs text-[#1A3C34]/60">
          Cliente entrega metal como parte do pagamento de uma joia. Percentual define o crédito concedido por grama.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-[#1A3C34]/60 mb-1">% Mínimo da Cotação</label>
            <input type="number" min={0} max={100} className="w-full bg-[#F2E8D5]/30 border border-[#C59B6D]/20 rounded-xl px-3 py-2 text-sm font-mono" value={config.receb_metal_min_pct} onChange={(e) => setConfig((c) => ({ ...c, receb_metal_min_pct: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#1A3C34]/60 mb-1">% Máximo da Cotação</label>
            <input type="number" min={0} max={100} className="w-full bg-[#F2E8D5]/30 border border-[#C59B6D]/20 rounded-xl px-3 py-2 text-sm font-mono" value={config.receb_metal_max_pct} onChange={(e) => setConfig((c) => ({ ...c, receb_metal_max_pct: Number(e.target.value) }))} />
            <div className="mt-2 bg-[#1A3C34]/10 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-[#1A3C34]" style={{ width: `${Math.min(100, config.receb_metal_max_pct - config.receb_metal_min_pct)}%` }} />
            </div>
            <p className="text-[10px] text-[#1A3C34]/40 mt-1">Faixa: {config.receb_metal_min_pct}% – {config.receb_metal_max_pct}%</p>
          </div>
        </div>
      </div>

      {/* REGRA DE NEGÓCIO: Roles que abrem o sistema direto no módulo Metal.
           Apenas roles com acesso ao módulo metal são listadas. */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/20 p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1A3C34]">Abrir Metal ao Logar</h3>
        <p className="text-xs text-[#1A3C34]/60">
          Usuários com estas roles serão redirecionados para o módulo Metal ao acessar o sistema.
          Nenhum selecionado = ninguém é redirecionado.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "consultora"].map((role) => {
            const checked = config.metal_home_roles.includes(role);
            return (
              <label
                key={role}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                  checked
                    ? "bg-[#1A3C34] border-[#1A3C34] text-[#F2E8D5]"
                    : "bg-[#F2E8D5]/20 border-[#C59B6D]/20 text-[#1A3C34]/70 hover:border-[#C59B6D]/50"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => {
                    setConfig((c) => ({
                      ...c,
                      metal_home_roles: checked
                        ? c.metal_home_roles.filter((r) => r !== role)
                        : [...c.metal_home_roles, role],
                    }));
                  }}
                />
                <span className="capitalize">{role.replace(/_/g, " ")}</span>
              </label>
            );
          })}
        </div>
      </div>

      {erroMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
          {erroMsg}
        </div>
      )}

      <button
        onClick={salvar}
        disabled={saving}
        className="w-full bg-[#1A3C34] text-white py-3 rounded-xl text-sm font-bold hover:bg-[#1A3C34]/90 disabled:opacity-50 transition-colors"
      >
        {saving ? "Salvando..." : saved ? "Salvo!" : erroMsg ? "Tentar Novamente" : "Salvar Configurações"}
      </button>
    </div>
  );
}
