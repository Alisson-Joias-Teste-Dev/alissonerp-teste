"use client";

import { useState, useRef, useEffect } from "react";
import { X, Save, Loader2, Camera, Eye, EyeOff, AlertTriangle, Shield } from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";

// Roles são carregadas da API (veja estado rolesDisponiveis no componente)

export interface UsuarioEdit {
  id: string;
  email: string;
  nome: string;
  role: string;
  ativo: boolean;
  avatar_url: string | null;
  deposito_id: number | null;
  vendedor_id: number | null;
  tipos_ordem_permitidos?: string[];
  tipos_protocolo_permitidos?: string[];
  is_operador_service?: boolean;
  is_transportador?: boolean;
  mx_desconto_permitido?: number | null;
}

const TODOS_TIPOS_ORDEM: Record<string, string> = {
  servico_venda:     "Serviço Venda",
  servico_interno:   "Serviço Interno",
  fabricacao:        "Fabricação",
  reposicao_venda:   "Reposição Venda",
  reposicao_loja:    "Reposição Loja",
  garantia:          "Garantia",
  compra_fornecedor: "Compra Fornecedor",
};

export interface Deposito {
  id: number;
  nome: string;
}

interface Props {
  usuario: UsuarioEdit | null;
  depositos: Deposito[];
  onClose: () => void;
  onSaved: (updated: UsuarioEdit) => void;
  userLogadoId?: string; // para bloquear troca de role própria
}

// ─── Input style ──────────────────────────────────────────────────────────────
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors";
const inputDisabledCls = "w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50";
const labelCls = "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1";

export default function UserEditDrawer({ usuario, depositos, onClose, onSaved, userLogadoId }: Props) {
  const aberto = !!usuario;

  const [nome, setNome]             = useState("");
  const [email, setEmail]           = useState("");
  const [role, setRole]             = useState("");
  const [ativo, setAtivo]           = useState(true);
  const [depositoId, setDepositoId] = useState<string>("");
  const [fotoUrl, setFotoUrl]       = useState<string | null>(null);
  const [novaSenha, setNovaSenha]   = useState("");
  const [confirmar, setConfirmar]   = useState("");

  // Permissões granulares de purificação/ligação
  const [permPurif, setPermPurif] = useState({
    abrir_purificacao:    false,
    concluir_purificacao: false,
    abrir_ligacao:        false,
    concluir_ligacao:     false,
    editar_teor_ligacao:  false,
  });
  const [permLoading, setPermLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id_vendedor: number; nome: string }[]>([]);
  const [rolesDisponiveis, setRolesDisponiveis] = useState<{ value: string; label: string }[]>([]);
  const [tiposPermitidos, setTiposPermitidos] = useState<string[]>([]);
  const [tiposProtocoloPermitidos, setTiposProtocoloPermitidos] = useState<string[]>([]);

  const [isOperadorService, setIsOperadorService] = useState(false);
  const [isTransportador, setIsTransportador] = useState(false);
  const [mxDesconto, setMxDesconto] = useState<string>("");

  const [salvando, setSalvando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const [fotoVendedorUrl, setFotoVendedorUrl] = useState<string | null>(null);
  const [fotoVendedorUploadando, setFotoVendedorUploadando] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const vendedorFotoRef = useRef<HTMLInputElement>(null);

  // Carregar roles do banco
  useEffect(() => {
    fetch("/api/configuracoes/roles")
      .then(r => r.json())
      .then((data: { roles?: { nome: string; descricao: string; ativo: boolean }[] }) => {
        setRolesDisponiveis(
          (data.roles ?? [])
            .filter(r => r.ativo)
            .map(r => ({
              value: r.nome,
              label: r.descricao
                ? `${r.nome.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — ${r.descricao.split("—")[0].trim()}`
                : r.nome.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            }))
        );
      })
      .catch(() => {});
  }, []);

  // Sincronizar campos ao abrir/trocar usuário
  useEffect(() => {
    if (usuario) {
      setNome(usuario.nome);
      setEmail(usuario.email);
      setRole(usuario.role);
      setAtivo(usuario.ativo);
      setDepositoId(usuario.deposito_id ? String(usuario.deposito_id) : "");
      setFotoUrl(usuario.avatar_url);
      setVendedorId(usuario.vendedor_id ?? null);
      // Carregar foto atual da consultora vinculada ao vendedor
      if (usuario.vendedor_id) {
        fetch(`/api/vendedores/${usuario.vendedor_id}/foto`)
          .then(r => r.ok ? r.json() : null)
          .then((d: { foto_url: string | null } | null) => setFotoVendedorUrl(d?.foto_url ?? null))
          .catch(() => setFotoVendedorUrl(null));
      } else {
        setFotoVendedorUrl(null);
      }
      setNovaSenha("");
      setConfirmar("");
      setTiposPermitidos(usuario.tipos_ordem_permitidos ?? []);
      setTiposProtocoloPermitidos(usuario.tipos_protocolo_permitidos ?? []);
      setIsOperadorService(usuario.is_operador_service ?? false);
      setIsTransportador(usuario.is_transportador ?? false);
      setMxDesconto(usuario.mx_desconto_permitido != null ? String(usuario.mx_desconto_permitido) : "");

      // Buscar permissões granulares do usuário
      setPermLoading(true);
      fetch(`/api/configuracoes/permissoes-usuario?user_id=${usuario.id}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { permissoes: Record<string, boolean> } | null) => {
          if (data?.permissoes) {
            setPermPurif({
              abrir_purificacao:    !!data.permissoes.abrir_purificacao,
              concluir_purificacao: !!data.permissoes.concluir_purificacao,
              abrir_ligacao:        !!data.permissoes.abrir_ligacao,
              concluir_ligacao:     !!data.permissoes.concluir_ligacao,
              editar_teor_ligacao:  !!data.permissoes.editar_teor_ligacao,
            });
          }
        })
        .catch(() => {})
        .finally(() => setPermLoading(false));

      // Buscar lista de vendedores se for consultora ou gerente_loja
      if (usuario.role === "consultora" || usuario.role === "gerente_loja") {
        fetch("/api/vendedores")
          .then((r) => r.json())
          .then((data) => setVendedores(data as { id_vendedor: number; nome: string }[]))
          .catch(() => setVendedores([]));
      } else {
        setVendedores([]);
      }
    }
  }, [usuario]);

  // Buscar vendedores quando role muda para consultora/gerente_loja
  useEffect(() => {
    if (!aberto) return;
    if (role === "consultora" || role === "gerente_loja") {
      fetch("/api/vendedores")
        .then((r) => r.json())
        .then((data) => setVendedores(data as { id_vendedor: number; nome: string }[]))
        .catch(() => setVendedores([]));
    } else {
      setVendedores([]);
      setVendedorId(null);
    }
  }, [role, aberto]);

  // ESC para fechar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (aberto) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [aberto, onClose]);

  function comprimirImagem(file: File, maxSize = 200): Promise<Blob> {
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

  async function handleFotoUpload(file: File) {
    if (!usuario) return;
    setUploadando(true);
    const blob = await comprimirImagem(file);
    const fd = new FormData();
    fd.append("file", blob, "avatar.jpg");
    fd.append("user_id", usuario.id);
    const res = await fetch("/api/user/avatar", { method: "POST", body: fd });
    setUploadando(false);
    if (res.ok) {
      const { avatar_url } = await res.json() as { avatar_url: string };
      setFotoUrl(avatar_url);
      toast.success("Foto alterada com sucesso!");
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string };
      toast.error(b.error ?? "Erro no upload da foto");
    }
  }

  /**
   * Upload de foto da consultora vinculada ao vendedor.
   * Faz upload para o bucket pagamento-fotos e atualiza public.vendedores.foto.
   * A foto aparece automaticamente na dashboard comercial.
   */
  async function handleVendedorFotoUpload(file: File) {
    if (!vendedorId) return;
    setFotoVendedorUploadando(true);
    const blob = await comprimirImagem(file);
    const fd = new FormData();
    fd.append("file", blob, "consultora.jpg");
    const res = await fetch(`/api/vendedores/${vendedorId}/foto`, { method: "POST", body: fd });
    setFotoVendedorUploadando(false);
    if (res.ok) {
      const { foto_url } = await res.json() as { foto_url: string };
      setFotoVendedorUrl(foto_url);
      toast.success("Foto da consultora atualizada!");
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string };
      toast.error(b.error ?? "Erro no upload da foto");
    }
  }

  /**
   * Atualiza a foto da consultora via URL colada (sem upload de arquivo).
   */
  async function handleVendedorFotoUrl(url: string) {
    if (!vendedorId || !url.trim()) return;
    setFotoVendedorUploadando(true);
    const fd = new FormData();
    fd.append("foto_url", url.trim());
    const res = await fetch(`/api/vendedores/${vendedorId}/foto`, { method: "POST", body: fd });
    setFotoVendedorUploadando(false);
    if (res.ok) {
      const { foto_url } = await res.json() as { foto_url: string };
      setFotoVendedorUrl(foto_url);
      toast.success("Foto atualizada!");
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string };
      toast.error(b.error ?? "URL inválida");
    }
  }

  async function handleSalvar() {
    if (!usuario) return;
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!email.trim()) { toast.error("E-mail é obrigatório"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { toast.error("E-mail inválido"); return; }
    if (novaSenha && novaSenha !== confirmar) { toast.error("Senhas não conferem"); return; }
    if (novaSenha && novaSenha.length < 6)   { toast.error("Senha mínimo 6 caracteres"); return; }

    setSalvando(true);

    const body: Record<string, unknown> = {
      nome:                        nome.trim(),
      role,
      ativo,
      deposito_id:                 depositoId ? parseInt(depositoId) : null,
      vendedor_id:                 (role === "consultora" || role === "gerente_loja") ? vendedorId : null,
      tipos_ordem_permitidos:      tiposPermitidos,
      tipos_protocolo_permitidos:  tiposProtocoloPermitidos,
      is_operador_service:         isOperadorService,
      is_transportador:            isTransportador,
      mx_desconto_permitido:       mxDesconto !== "" ? parseFloat(mxDesconto) : null,
    };
    // Só envia email se mudou
    if (email.trim() !== usuario.email) body.email = email.trim();
    if (novaSenha) body.nova_senha = novaSenha;

    const res = await fetch(`/api/user/${usuario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSalvando(false);

    if (res.ok) {
      const data = await res.json() as { usuario: UsuarioEdit };
      const saved: UsuarioEdit = {
        ...data.usuario,
        avatar_url: fotoUrl,
      };

      // Salvar permissões granulares em paralelo (não bloqueia se falhar)
      fetch("/api/configuracoes/permissoes-usuario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: usuario.id, permissoes: permPurif }),
      }).catch(() => {});

      const senhaAlterada = !!novaSenha;
      const outrosAlterados =
        nome.trim() !== usuario.nome ||
        email.trim() !== usuario.email ||
        role !== usuario.role ||
        ativo !== usuario.ativo ||
        depositoId !== String(usuario.deposito_id ?? "") ||
        vendedorId !== usuario.vendedor_id ||
        JSON.stringify(tiposPermitidos) !== JSON.stringify(usuario.tipos_ordem_permitidos ?? []) ||
        JSON.stringify(tiposProtocoloPermitidos) !== JSON.stringify(usuario.tipos_protocolo_permitidos ?? []) ||
        isOperadorService !== (usuario.is_operador_service ?? false) ||
        isTransportador !== (usuario.is_transportador ?? false) ||
        mxDesconto !== String(usuario.mx_desconto_permitido ?? "");

      const msg = senhaAlterada && !outrosAlterados
        ? "Senha alterada com sucesso!"
        : "Alterações feitas com sucesso!";

      toast.success(msg);
      onSaved(saved);
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string };
      toast.error(b.error ?? "Erro ao salvar");
    }
  }

  const senhasMismatch    = novaSenha && confirmar && novaSenha !== confirmar;
  const senhaCurta        = novaSenha && novaSenha.length < 6;
  const isProprioUsuario  = !!(userLogadoId && usuario && userLogadoId === usuario.id);

  const isVendedor  = ["consultora", "gerente_loja"].includes(role);
  const isFabrica   = ["ourives", "pcp", "gerente_fabrica", "motoboy"].includes(role);
  const isSuperAdmin2 = ["desenvolvedor", "admin"].includes(role);

  return (
    <>
      {/* Overlay */}
      {aberto && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-full md:w-[400px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          aberto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-800">Editar Usuário</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo (scrollável) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 pb-28">

          {/* Avatar + trocar foto */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="relative">
              <UserAvatar nome={nome} fotoUrl={fotoUrl} size={64} />
              {uploadando && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40">
                  <Loader2 size={18} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-[#DB9864] cursor-pointer hover:underline select-none">
              <Camera size={12} />
              Trocar foto
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                ref={fileRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFotoUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Foto da Consultora (vinculada ao vendedor_id — aparece na dashboard) */}
          {vendedorId && (
            <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-dashed border-gray-200">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Foto da Consultora
              </span>
              <div className="relative">
                {fotoVendedorUrl ? (
                  <img
                    src={fotoVendedorUrl}
                    alt="Foto consultora"
                    className="rounded-full object-cover border-2 border-[#DB9864]"
                    style={{ width: 56, height: 56 }}
                  />
                ) : (
                  <div
                    className="rounded-full flex items-center justify-center border-2 border-dashed border-gray-300"
                    style={{ width: 56, height: 56 }}
                  >
                    <Camera size={18} className="text-gray-300" />
                  </div>
                )}
                {fotoVendedorUploadando && (
                  <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[#DB9864] cursor-pointer hover:underline select-none">
                  <Camera size={11} />
                  {fotoVendedorUrl ? "Trocar" : "Enviar foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    ref={vendedorFotoRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleVendedorFotoUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="w-full flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Ou cole uma URL (https://...)"
                  className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 text-gray-500 focus:outline-none focus:border-[#184036]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleVendedorFotoUrl((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className={labelCls}>Nome *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={inputCls}
              placeholder="Nome completo"
            />
          </div>

          {/* Email */}
          <div>
            <label className={labelCls}>E-mail *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="email@exemplo.com"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Altera o e-mail de login do usuário
            </p>
          </div>

          {/* Role */}
          <div>
            <label className={labelCls}>Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isProprioUsuario}
              className={isProprioUsuario ? inputDisabledCls : inputCls}
            >
              {rolesDisponiveis.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {isProprioUsuario && (
              <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                <AlertTriangle size={10} /> Você não pode alterar sua própria role
              </p>
            )}
          </div>

          {/* ── Campos de Vendedor ────────────────────────────────── */}
          {isVendedor && (
            <>
              <div>
                <label className={labelCls}>Vendedor(a) Vinculado</label>
                <select
                  value={vendedorId ?? ""}
                  onChange={(e) => setVendedorId(e.target.value ? Number(e.target.value) : null)}
                  className={inputCls}
                >
                  <option value="">Nenhum</option>
                  {vendedores.map((v) => (
                    <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5">Vincula o usuário a um vendedor(a) no ERP</p>
              </div>

              <div>
                <label className={labelCls}>Desconto máximo permitido (%)</label>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={mxDesconto}
                  onChange={e => setMxDesconto(e.target.value)}
                  placeholder="Padrão por role (deixe em branco)"
                  className={inputCls}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Deixe em branco para usar o padrão do perfil.
                </p>
              </div>
            </>
          )}

          {/* ── Campos de Fábrica/PCP ─────────────────────────────── */}
          {isFabrica && (
            <div>
              <label className={labelCls}>Depósito / Operador</label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                className={inputCls}
              >
                <option value="">Sem vínculo</option>
                {depositos.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.nome}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">Vincula o usuário a um depósito/operador no PCP</p>
            </div>
          )}

          {/* Status ativo/inativo */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setAtivo(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  ativo
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-gray-100 text-gray-400 border border-transparent"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Ativo
              </button>
              <button
                onClick={() => setAtivo(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !ativo
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-gray-100 text-gray-400 border border-transparent"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Inativo
              </button>
            </div>
          </div>

          {/* Operador Service — apenas fábrica/motoboy */}
          {isFabrica && <div className="border-t border-gray-100 pt-5">
            <label className={labelCls}>App Service</label>
            <div className="flex items-center justify-between mt-2 px-3 py-3 rounded-lg border border-gray-200 bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-800">Operador Service</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Acessa o app Service no celular — receber, concluir, transferir serviços
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOperadorService(v => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  isOperadorService ? "bg-[#184036]" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                    isOperadorService ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Toggle Transportador */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Transportador</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Pode levar peças entre fábrica e service (aparece no &quot;Quem vai levar?&quot;)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransportador(v => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  isTransportador ? "bg-[#184036]" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                    isTransportador ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>}

          {/* ── Permissões de Vendedor ────────────────────────────── */}
          {/* Permissões de Criação de Ordens — apenas vendedor */}
          {isVendedor && <div className="border-t border-gray-100 pt-5">
            <label className={labelCls}>Permissões de Criação de Ordens</label>
            {isSuperAdmin2 ? (
              <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg text-xs bg-blue-50 border border-blue-200 text-blue-700">
                <Shield size={12} className="mt-0.5 shrink-0" />
                <span>Este usuário tem acesso total — estas permissões não se aplicam.</span>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] text-gray-400 mb-2">
                  Tipos de ordem que este usuário pode criar:
                </p>
                {Object.entries(TODOS_TIPOS_ORDEM).map(([value, label]) => {
                  const checked = tiposPermitidos.includes(value);
                  return (
                    <label key={value} className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setTiposPermitidos((prev) =>
                            checked ? prev.filter((t) => t !== value) : [...prev, value]
                          )
                        }
                        className="w-4 h-4 rounded border-gray-300 accent-[#184036]"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  );
                })}
                <p className="text-[10px] text-gray-400 mt-2">
                  Vazio = não pode criar nenhuma ordem (botão oculto).
                </p>
              </div>
            )}
          </div>}

          {/* Permissões de Protocolo — apenas vendedor */}
          {isVendedor && <div className="border-t border-gray-100 pt-5">
            <label className={labelCls}>Permissões de Protocolo</label>
            {isSuperAdmin2 ? (
              <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-lg text-xs bg-blue-50 border border-blue-200 text-blue-700">
                <Shield size={12} className="mt-0.5 shrink-0" />
                <span>Este usuário tem acesso total — estas permissões não se aplicam.</span>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] text-gray-400 mb-2">
                  Tipos de protocolo que este usuário pode criar:
                </p>
                {(
                  [
                    ["fabrica", "🏭 Protocolo Fábrica", "ida/volta com motoboy"],
                    ["service", "🔧 Protocolo Service", "ida/volta loja ↔ service"],
                  ] as [string, string, string][]
                ).map(([value, label, hint]) => {
                  const checked = tiposProtocoloPermitidos.includes(value);
                  return (
                    <label key={value} className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setTiposProtocoloPermitidos((prev) =>
                            checked ? prev.filter((t) => t !== value) : [...prev, value]
                          )
                        }
                        className="w-4 h-4 rounded border-gray-300 accent-[#184036] mt-0.5"
                      />
                      <span className="text-sm text-gray-700">
                        {label}
                        <span className="block text-[10px] text-gray-400">{hint}</span>
                      </span>
                    </label>
                  );
                })}
                <p className="text-[10px] text-gray-400 mt-2">
                  Vazio = não pode criar nenhum protocolo.
                </p>
              </div>
            )}
          </div>}

          {/* Purificação / Ligação — apenas fábrica */}
          {isFabrica && <div className="border-t border-gray-100 pt-5">
            <label className={labelCls}>Purificação / Ligação</label>
            {permLoading ? (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Carregando...
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {(
                  [
                    ["abrir_purificacao",    "Abrir purificação"],
                    ["concluir_purificacao", "Concluir purificação"],
                    ["abrir_ligacao",        "Abrir ligação"],
                    ["concluir_ligacao",     "Concluir ligação"],
                    ["editar_teor_ligacao",  "Editar teor na ligação"],
                  ] as [keyof typeof permPurif, string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={permPurif[key]}
                      onChange={() =>
                        setPermPurif(prev => ({ ...prev, [key]: !prev[key] }))
                      }
                      className="w-4 h-4 rounded border-gray-300 accent-[#184036]"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>}

          {/* Alterar senha */}
          <div className="border-t border-gray-100 pt-5">
            <label className={labelCls}>Alterar Senha</label>
            <p className="text-[10px] text-gray-400 mb-3">Deixe vazio para manter a senha atual</p>

            <div className="space-y-2">
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Nova senha"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <input
                type={mostrarSenha ? "text" : "password"}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Confirmar nova senha"
                className={inputCls}
              />
            </div>

            {senhaCurta && (
              <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={11} /> Mínimo 6 caracteres
              </p>
            )}
            {senhasMismatch && (
              <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={11} /> Senhas não conferem
              </p>
            )}
          </div>

        </div>

        {/* Footer fixo */}
        <div className="absolute bottom-0 left-0 right-0 px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || !!senhasMismatch || !!senhaCurta}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#184036", color: "#F3EADA" }}
          >
            {salvando ? (
              <><Loader2 size={14} className="animate-spin" /> Salvando...</>
            ) : (
              <><Save size={14} /> Salvar Alterações</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
