"use client";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:              { bg: "#EEF2FF", color: "#4338CA" },
  desenvolvedor:      { bg: "#F3E8FF", color: "#7C3AED" },
  gerente_fabrica:    { bg: "#D1FAE5", color: "#065F46" },
  gerente_loja:       { bg: "#DBEAFE", color: "#1E40AF" },
  consultora:         { bg: "#FEF3C7", color: "#92400E" },
  ourives:            { bg: "#FEE2E2", color: "#991B1B" },
  motoboy:            { bg: "#F3F4F6", color: "#4B5563" },
  pcp:                { bg: "#E0F2FE", color: "#0369A1" },
  estoquista_fabrica: { bg: "#FFF7ED", color: "#C2410C" },
  estoquista_loja:    { bg: "#F9FAFB", color: "#6B7280" },
};

const ROLE_LABEL: Record<string, string> = {
  admin:              "Admin",
  desenvolvedor:      "Desenvolvedor",
  gerente_fabrica:    "Gerente Fábrica",
  gerente_loja:       "Gerente Loja",
  consultora:         "Consultora",
  ourives:            "Ourives",
  motoboy:            "Motoboy",
  pcp:                "PCP",
  estoquista_fabrica: "Estoquista Fábrica",
  estoquista_loja:    "Estoquista Loja",
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  onClose: () => void;
}

export default function PerfilDrawer({ onClose }: Props) {
  const { user, role, nome: nomeInicial, fotoUrl: fotoInicial } = useAuth();

  // Nome state
  const [nome, setNome] = useState(nomeInicial ?? "");

  // Foto state
  const [fotoPreview, setFotoPreview] = useState<string | null>(fotoInicial ?? null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Senha state
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showSenhaAtual, setShowSenhaAtual] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  // UI state
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  // Sync nome when auth loads
  useEffect(() => {
    if (nomeInicial) setNome(nomeInicial);
    if (fotoInicial) setFotoPreview(fotoInicial);
  }, [nomeInicial, fotoInicial]);

  // ESC para fechar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleFotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErro("Foto deve ter no máximo 5MB");
      return;
    }
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    setErro(null);
  }

  async function salvar() {
    if (!user) return;
    setErro(null);
    setErroSenha(null);
    setSucesso(false);

    // Validate senha if any field filled
    const querAlterarSenha = senhaAtual || novaSenha || confirmarSenha;
    if (querAlterarSenha) {
      if (!senhaAtual || !novaSenha || !confirmarSenha) {
        setErroSenha("Preencha os 3 campos para alterar a senha");
        return;
      }
      if (novaSenha.length < 6) {
        setErroSenha("Nova senha deve ter ao menos 6 caracteres");
        return;
      }
      if (novaSenha !== confirmarSenha) {
        setErroSenha("Senhas não coincidem");
        return;
      }
    }

    setSalvando(true);
    try {
      // 1. Upload foto if changed
      if (fotoFile) {
        const fd = new FormData();
        fd.append("file", fotoFile);
        const r = await fetch("/api/user/avatar", { method: "POST", body: fd });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setErro((d as { error?: string }).error ?? "Erro ao enviar foto");
          return;
        }
      }

      // 2. Update nome if changed
      if (nome.trim() !== (nomeInicial ?? "").trim()) {
        const r = await fetch(`/api/user/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: nome.trim() }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setErro((d as { error?: string }).error ?? "Erro ao atualizar nome");
          return;
        }
      }

      // 3. Change password if requested
      if (querAlterarSenha) {
        const r = await fetch("/api/user/alterar-senha", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setErroSenha((d as { error?: string }).error ?? "Erro ao alterar senha");
          return;
        }
        setSenhaAtual(""); setNovaSenha(""); setConfirmarSenha("");
      }

      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } finally {
      setSalvando(false);
    }
  }

  const rc = ROLE_COLORS[role ?? ""] ?? { bg: "#F3F4F6", color: "#6B7280" };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-96 bg-white z-50 shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "#E8DCC8" }}>
          <h2 className="font-semibold text-[15px]" style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}>
            Meu Perfil
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-stone-100 text-stone-400"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-6 space-y-5">

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 hover:opacity-80 transition-opacity group"
              style={{ borderColor: "#E8DCC8" }}
              title="Trocar foto"
            >
              {fotoPreview ? (
                <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-2xl font-bold"
                  style={{ backgroundColor: rc.bg, color: rc.color }}
                >
                  {iniciais(nome || "?")}
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                Trocar
              </div>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px]"
              style={{ color: "#80A795" }}
            >
              Trocar foto
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFotoSelect}
            />
          </div>

          {/* Nome */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "#9CA3AF" }}>
              Nome
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1"
              style={{ borderColor: "#E8DCC8", color: "#1A1A1A", backgroundColor: "#fff" }}
            />
          </div>

          {/* Email — read only */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "#9CA3AF" }}>
              E-mail
            </label>
            <p
              className="text-sm px-3 py-2 rounded-lg border"
              style={{ color: "#6B7280", borderColor: "#F3EADA", backgroundColor: "#FAFAF7" }}
            >
              {user?.email ?? "—"}
            </p>
          </div>

          {/* Role — read only */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "#9CA3AF" }}>
              Perfil de Acesso
            </label>
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: rc.bg, color: rc.color }}
              >
                {ROLE_LABEL[role ?? ""] ?? role ?? "—"}
              </span>
              <span className="text-[10px]" style={{ color: "#C4B5A0" }}>
                Para alterar, contate o administrador
              </span>
            </div>
          </div>

          {/* Divider + Senha */}
          <div className="border-t pt-4" style={{ borderColor: "#E8DCC8" }}>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-4" style={{ color: "#9CA3AF" }}>
              Alterar Senha
            </p>

            <div className="space-y-3">
              {([
                { label: "Senha Atual", value: senhaAtual, set: setSenhaAtual, show: showSenhaAtual, toggle: () => setShowSenhaAtual(v => !v) },
                { label: "Nova Senha", value: novaSenha, set: setNovaSenha, show: showNovaSenha, toggle: () => setShowNovaSenha(v => !v) },
                { label: "Confirmar Nova Senha", value: confirmarSenha, set: setConfirmarSenha, show: showConfirmar, toggle: () => setShowConfirmar(v => !v) },
              ] as { label: string; value: string; set: (v: string) => void; show: boolean; toggle: () => void }[]).map(({ label, value, set, show, toggle }) => (
                <div key={label}>
                  <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1.5" style={{ color: "#9CA3AF" }}>
                    {label}
                  </label>
                  <div className="relative">
                    <input
                      type={show ? "text" : "password"}
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="••••••••"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 pr-9"
                      style={{ borderColor: "#E8DCC8", color: "#1A1A1A", backgroundColor: "#fff" }}
                    />
                    <button
                      type="button"
                      onClick={toggle}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                      tabIndex={-1}
                    >
                      {show ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {erroSenha && (
              <p className="text-xs mt-2" style={{ color: "#DC2626" }}>{erroSenha}</p>
            )}
          </div>

          {/* Global error */}
          {erro && (
            <p className="text-xs" style={{ color: "#DC2626" }}>{erro}</p>
          )}

          {/* Success */}
          {sucesso && (
            <p className="text-xs font-medium" style={{ color: "#065F46" }}>✓ Perfil atualizado com sucesso!</p>
          )}
        </div>

        {/* Footer — Save button */}
        <div className="px-5 py-4 border-t shrink-0" style={{ borderColor: "#E8DCC8" }}>
          <button
            onClick={salvar}
            disabled={salvando}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: "#184036" }}
          >
            {salvando ? "Salvando…" : "Salvar Alterações"}
          </button>
        </div>
      </div>
    </>
  );
}
