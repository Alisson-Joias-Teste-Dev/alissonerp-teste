"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { invalidarCacheAuth } from "@/hooks/useAuth";
import { useSearchParams } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", desenvolvedor: "Desenvolvedor", gerente_fabrica: "Gerente Fábrica",
  gerente_loja: "Gerente Loja", consultora: "Consultora", ourives: "Ourives",
  motoboy: "Motoboy", pcp: "PCP", estoquista_fabrica: "Estoquista Fábrica", estoquista_loja: "Estoquista Loja",
};

export default function PerfilClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const { nome: meuNome, role: minhaRole, fotoUrl: minhaFoto, user: meuUser } = useAuth();

  const isProprio = !userId || userId === meuUser?.id;
  const [userData, setUserData] = useState<{ id: string; nome: string; email: string; role: string; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const nomeAtual = isProprio ? meuNome : userData?.nome ?? "";
  const roleAtual = isProprio ? minhaRole : userData?.role ?? "";
  const emailAtual = isProprio ? meuUser?.email ?? "" : userData?.email ?? "";
  const fotoAtual = isProprio ? minhaFoto : userData?.avatar_url ?? null;
  const idAtual = isProprio ? meuUser?.id ?? "" : userData?.id ?? "";

  useEffect(() => {
    if (!userId || !meuUser) return;
    if (userId === meuUser.id) return;
    setLoading(true);
    fetch(`/api/user/${userId}`).then(r => r.json()).then(d => {
      setUserData({ id: d.id, nome: d.nome, email: d.email, role: d.role ?? "", avatar_url: d.avatar_url ?? null });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId, meuUser]);

  const [nome, setNome] = useState(nomeAtual);
  const [fotoPreview, setFotoPreview] = useState<string | null>(fotoAtual);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => { setNome(nomeAtual); setFotoPreview(fotoAtual); }, [nomeAtual, fotoAtual]);

  if (!meuUser) return null;
  if (!isProprio && loading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  function comprimirImagem(file: File, max = 200): Promise<Blob> {
    return new Promise(resolve => { const img = new Image(); img.onload = () => { const r = Math.min(max / img.width, max / img.height, 1); const c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => resolve(b!), "image/jpeg", 0.85); }; img.src = URL.createObjectURL(file); });
  }

  function handleFotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setErro("Foto deve ter no máximo 5MB"); return; }
    setFotoFile(file); setFotoPreview(URL.createObjectURL(file)); setErro(null);
  }

  async function salvarPerfil() {
    if (!meuUser) return; setErro(null); setSucesso(false);
    setSalvando(true);
    try {
      if (fotoFile) {
        const blob = await comprimirImagem(fotoFile); const fd = new FormData(); fd.append("file", blob, "avatar.jpg");
        const r = await fetch("/api/user/avatar", { method: "POST", body: fd });
        if (!r.ok) { const d = await r.json().catch(() => ({})); setErro((d as { error?: string }).error ?? "Erro ao enviar foto"); return; }
        const d = await r.json() as { avatar_url?: string };
        if (d.avatar_url) { setFotoPreview(d.avatar_url); setFotoFile(null); window.dispatchEvent(new CustomEvent("perfil:foto-atualizada", { detail: d.avatar_url })); }
      }
      if (nome.trim() !== (nomeAtual ?? "").trim()) {
        const r = await fetch(`/api/user/${idAtual}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim() }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); setErro((d as { error?: string }).error ?? "Erro ao atualizar nome"); return; }
        invalidarCacheAuth();
      }
      setSucesso(true); setEditModalOpen(false);
      setTimeout(() => setSucesso(false), 3000);
    } finally { setSalvando(false); }
  }

  async function salvarSenha() {
    setErroSenha(null);
    if (!senhaAtual || !novaSenha || !confirmarSenha) { setErroSenha("Preencha todos os campos"); return; }
    if (novaSenha.length < 6) { setErroSenha("Nova senha deve ter ao menos 6 caracteres"); return; }
    if (novaSenha !== confirmarSenha) { setErroSenha("Senhas não coincidem"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/user/alterar-senha", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErroSenha((d as { error?: string }).error ?? "Erro ao alterar senha"); return; }
      setSenhaAtual(""); setNovaSenha(""); setConfirmarSenha(""); setPasswordModalOpen(false);
    } catch { setErroSenha("Erro ao alterar senha"); } finally { setSalvando(false); }
  }

  if (!meuUser) return null;

  return (
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 lg:mb-7">Perfil</h3>

        <div className="space-y-6">
          {/* Meta Card — avatar + nome + role */}
          <div className="p-5 border border-gray-200 rounded-2xl lg:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col items-center w-full gap-6 xl:flex-row">
                <div className="w-20 h-20 overflow-hidden border border-gray-200 rounded-full">
                  <UserAvatar nome={nomeAtual ?? ""} fotoUrl={fotoAtual} size={80} userId={idAtual} clickable={false} />
                </div>
                <div className="order-3 xl:order-2">
                  <h4 className="mb-2 text-lg font-semibold text-center text-gray-800 xl:text-left">{nomeAtual}</h4>
                  <div className="flex flex-col items-center gap-1 text-center xl:flex-row xl:gap-3 xl:text-left">
                    <Badge color="brand">{ROLE_LABEL[roleAtual ?? ""] ?? roleAtual}</Badge>
                    <div className="hidden h-3.5 w-px bg-gray-300 xl:block" />
                    <p className="text-sm text-gray-500">{emailAtual}</p>
                  </div>
                </div>
              </div>
              <button onClick={() => { setNome(nomeAtual ?? ""); setEditModalOpen(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 lg:inline-flex lg:w-auto">
                <svg className="fill-current" width="18" height="18" viewBox="0 0 18 18" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z" fill="currentColor" /></svg>
                Edit
              </button>
            </div>
          </div>

          {/* Info Card — dados pessoais */}
          <div className="p-5 border border-gray-200 rounded-2xl lg:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-lg font-semibold text-gray-800 lg:mb-6">Informações Pessoais</h4>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7">
                  <div><p className="mb-2 text-xs text-gray-500">Nome</p><p className="text-sm font-medium text-gray-800">{nomeAtual}</p></div>
                  <div><p className="mb-2 text-xs text-gray-500">E-mail</p><p className="text-sm font-medium text-gray-800">{emailAtual}</p></div>
                  <div><p className="mb-2 text-xs text-gray-500">Perfil de Acesso</p>                    <Badge color="brand">{ROLE_LABEL[roleAtual ?? ""] ?? roleAtual}</Badge></div>
                  <div><p className="mb-2 text-xs text-gray-500">ID do Usuário</p><p className="text-sm font-medium text-gray-800 font-mono text-xs">{idAtual.slice(0, 12)}...</p></div>
                </div>
              </div>
              {isProprio && (
              <button onClick={() => { setNome(nomeAtual ?? ""); setEditModalOpen(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 lg:inline-flex lg:w-auto">
                <svg className="fill-current" width="18" height="18" viewBox="0 0 18 18" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z" fill="currentColor" /></svg>
                Edit
              </button>
              )}
            </div>
          </div>

          {/* Security Card — senha */}
          <div className="p-5 border border-gray-200 rounded-2xl lg:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-lg font-semibold text-gray-800 lg:mb-6">Segurança</h4>
                <div>
                  <p className="mb-2 text-xs text-gray-500">Senha</p>
                  <p className="text-sm font-medium text-gray-800">••••••••</p>
                </div>
              </div>
              {isProprio && (
              <button onClick={() => { setNome(nomeAtual ?? ""); setEditModalOpen(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 lg:inline-flex lg:w-auto">
                <svg className="fill-current" width="18" height="18" viewBox="0 0 18 18" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z" fill="currentColor" /></svg>
                Edit
              </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Editar Perfil */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Editar Informações Pessoais" description="Atualize seus dados de perfil" size="lg">
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 hover:opacity-80 transition-opacity group">
              {fotoPreview ? <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-esmeralda-100 text-esmeralda-600">{(nome || "?")[0].toUpperCase()}</div>}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">Trocar</div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFotoSelect} />
            <span className="text-xs text-gray-500">Clique para trocar a foto</span>
          </div>
          <InputField label="Nome" value={nome} onChange={e => setNome(e.target.value)} />
          <div><Label>E-mail</Label><p className="text-sm px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-500">{emailAtual}</p></div>
          {erro && <p className="text-sm text-error-600">{erro}</p>}
          {sucesso && <p className="text-sm font-medium text-success-600">Perfil atualizado com sucesso!</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setEditModalOpen(false)}>Cancelar</Button>
            <Button size="md" onClick={salvarPerfil} loading={salvando}>Salvar Alterações</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Alterar Senha */}
      <Modal isOpen={passwordModalOpen} onClose={() => setPasswordModalOpen(false)} title="Alterar Senha" size="md">
        <div className="space-y-4">
          <InputField label="Senha Atual" type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} placeholder="••••••••" />
          <InputField label="Nova Senha" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
          <InputField label="Confirmar Nova Senha" type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} placeholder="Repita a nova senha" />
          {erroSenha && <p className="text-xs text-error-600">{erroSenha}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="md" onClick={() => setPasswordModalOpen(false)}>Cancelar</Button>
            <Button size="md" onClick={salvarSenha} loading={salvando}>Alterar Senha</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
