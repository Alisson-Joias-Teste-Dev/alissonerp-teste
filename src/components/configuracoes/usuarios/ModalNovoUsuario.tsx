"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Camera, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Button, Spinner, Modal, MessageBox } from "@/components/ui";

interface Props {
  onCriado: (usuario: any) => void;
  onClose: () => void;
  rolesDisponiveis: { value: string; label: string }[];
}

export default function ModalNovoUsuario({ onCriado, onClose, rolesDisponiveis }: Props) {
  const router = useRouter();
  const [novoUsuario, setNovoUsuario] = useState({ nome: "", email: "", senha: "", role: "" });
  const [criandoUsuario, setCriandoUsuario] = useState(false);
  const [erroNovoUsuario, setErroNovoUsuario] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [novaFotoPreview, setNovaFotoPreview] = useState<string | null>(null);
  const novaFotoRef = useRef<HTMLInputElement>(null);

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

      const criado: any = {
        id: data.usuario.id,
        email: data.usuario.email,
        nome: data.usuario.nome,
        role: data.usuario.role,
        ativo: true,
        created_at: new Date().toISOString(),
        avatar_url: avatarUrl,
      };
      onCriado(criado);
      onClose();
      router.refresh();
    } catch {
      setErroNovoUsuario("Erro ao criar usuário");
    } finally {
      setCriandoUsuario(false);
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Novo Usuário" description="Cria acesso imediato ao sistema">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => novaFotoRef.current?.click()}
            disabled={criandoUsuario}
            className="relative w-20 h-20 rounded-full overflow-hidden flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-60"
            style={{ border: "2px dashed #E8DCC8", backgroundColor: "#FAFAF7" }}
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
          <input ref={novaFotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
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

        {["nome", "email", "senha"].map((field) => (
          <div key={field}>
            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#6B7280" }}>
              {field === "nome" ? "Nome completo" : field === "email" ? "E-mail" : "Senha inicial"}
            </label>
            {field === "senha" ? (
              <div className="relative">
                <input type={mostrarSenha ? "text" : "password"}
                  value={novoUsuario.senha}
                  onChange={(e) => setNovoUsuario((p) => ({ ...p, senha: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" disabled={criandoUsuario}
                  className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm outline-none transition-colors disabled:opacity-60"
                  style={{ border: "1px solid #E8DCC8", backgroundColor: "#fff", color: "#374151" }}
                  onKeyDown={(e) => e.key === "Enter" && handleCriarUsuario()}
                />
                <button type="button" onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}
                >
                  {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            ) : (
              <input type={field === "email" ? "email" : "text"}
                value={(novoUsuario as any)[field]}
                onChange={(e) => setNovoUsuario((p) => ({ ...p, [field]: e.target.value }))}
                placeholder={field === "nome" ? "Ex: Ana Paula Silva" : "usuario@empresa.com"}
                disabled={criandoUsuario}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors disabled:opacity-60"
                style={{ border: "1px solid #E8DCC8", backgroundColor: "#fff", color: "#374151" }}
                onKeyDown={(e) => e.key === "Enter" && handleCriarUsuario()}
              />
            )}
          </div>
        ))}

        <div>
          <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "#6B7280" }}>
            Perfil de acesso
          </label>
          <select value={novoUsuario.role}
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

      {erroNovoUsuario && (
        <div className="mt-4">
          <MessageBox tipo="erro" mensagem={erroNovoUsuario} onFechar={() => setErroNovoUsuario(null)} />
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="md" loading={criandoUsuario} className="flex-1" onClick={handleCriarUsuario}>
          <Plus size={14} /> Criar usuário
        </Button>
      </div>
    </Modal>
  );
}
