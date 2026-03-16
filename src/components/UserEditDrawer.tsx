"use client";

import { useState, useRef, useEffect } from "react";
import { X, Save, Loader2, Camera, Eye, EyeOff, AlertTriangle, CheckCircle } from "lucide-react";
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
}

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
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id_vendedor: number; nome: string }[]>([]);
  const [rolesDisponiveis, setRolesDisponiveis] = useState<{ value: string; label: string }[]>([]);

  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [uploadando, setUploadando] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

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
      setNovaSenha("");
      setConfirmar("");
      setMsg(null);

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
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string };
      setMsg({ ok: false, texto: b.error ?? "Erro no upload da foto" });
      setTimeout(() => setMsg(null), 3000);
    }
  }

  async function handleSalvar() {
    if (!usuario) return;
    if (!nome.trim()) { setMsg({ ok: false, texto: "Nome é obrigatório" }); return; }
    if (!email.trim()) { setMsg({ ok: false, texto: "E-mail é obrigatório" }); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) { setMsg({ ok: false, texto: "E-mail inválido" }); return; }
    if (novaSenha && novaSenha !== confirmar) { setMsg({ ok: false, texto: "Senhas não conferem" }); return; }
    if (novaSenha && novaSenha.length < 6)   { setMsg({ ok: false, texto: "Senha mínimo 6 caracteres" }); return; }

    setSalvando(true);
    setMsg(null);

    const body: Record<string, unknown> = {
      nome:        nome.trim(),
      role,
      ativo,
      deposito_id: depositoId ? parseInt(depositoId) : null,
      vendedor_id: (role === "consultora" || role === "gerente_loja") ? vendedorId : null,
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
      setMsg({ ok: true, texto: "Alterações salvas!" });
      onSaved(saved);
      setTimeout(() => setMsg(null), 2500);
    } else {
      const b = await res.json().catch(() => ({})) as { error?: string };
      setMsg({ ok: false, texto: b.error ?? "Erro ao salvar" });
    }
  }

  const senhasMismatch    = novaSenha && confirmar && novaSenha !== confirmar;
  const senhaCurta        = novaSenha && novaSenha.length < 6;
  const isProprioUsuario  = !!(userLogadoId && usuario && userLogadoId === usuario.id);

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
        className={`fixed inset-y-0 right-0 w-[400px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
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

          {/* Vendedor(a) Vinculado — visível só para consultora/gerente_loja */}
          {(role === "consultora" || role === "gerente_loja") && (
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
              <p className="text-[10px] text-gray-400 mt-0.5">
                Vincula o usuário a um vendedor(a) no ERP
              </p>
            </div>
          )}

          {/* Depósito / Operador */}
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
            <p className="text-[10px] text-gray-400 mt-0.5">
              Vincula o usuário a um depósito/operador no PCP
            </p>
          </div>

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

          {/* Mensagem de retorno */}
          {msg && (
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                msg.ok
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {msg.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {msg.texto}
            </div>
          )}
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
