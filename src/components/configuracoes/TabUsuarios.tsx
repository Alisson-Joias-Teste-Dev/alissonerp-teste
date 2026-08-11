"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Camera, Eye, EyeOff, Loader2, Plus, Search, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "./constants";
import type { Usuario, DepositoEdit, UsuarioEdit } from "./types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { InputField } from "@/components/ui/InputField";
import { Select } from "@/components/ui/Select";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/Table";
import UserAvatar from "@/components/UserAvatar";
import UserEditDrawer, { type UsuarioEdit as UsuarioEditSalvo } from "@/components/UserEditDrawer";

const ITENS_POR_PAGINA = 10;

export default function TabUsuarios({ usuarios: usuariosInit, depositos, initialUserId }: {
  usuarios: Usuario[]; depositos: DepositoEdit[]; initialUserId?: string | null;
}) {
  const router = useRouter();
  const { role: roleLogado, user: userLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosInit);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [rolesDisponiveis, setRolesDisponiveis] = useState([
    { value: "admin", label: "Admin" }, { value: "gerente_fabrica", label: "Gerente Fábrica" },
    { value: "gerente_loja", label: "Gerente Loja" }, { value: "ourives", label: "Ourives" },
    { value: "motoboy", label: "Motoboy" }, { value: "consultora", label: "Consultora" },
    { value: "estoquista_fabrica", label: "Estoquista Fábrica" }, { value: "estoquista_loja", label: "Estoquista Loja" },
    { value: "pcp", label: "PCP" },
  ]);

  const [showNovoModal, setShowNovoModal] = useState(false);
  const [novoUsuario, setNovoUsuario] = useState({ nome: "", email: "", senha: "", role: "" });
  const [criando, setCriando] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [novaFoto, setNovaFoto] = useState<File | null>(null);
  const [novaFotoPreview, setNovaFotoPreview] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const podeCriar = roleLogado === "admin" || roleLogado === "desenvolvedor";

  useEffect(() => { setPage(1); }, [search]);

  // Abre o painel de edição direto quando chega por link (?tab=usuarios&user=<id>)
  useEffect(() => {
    if (!initialUserId) return;
    const alvo = usuarios.find(u => u.id === initialUserId);
    if (alvo) setUsuarioEditando(alvo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId]);

  useEffect(() => {
    fetch("/api/configuracoes/roles")
      .then(r => r.ok ? r.json() : null)
      .then((data: { roles: { nome: string; descricao: string; ativo: boolean }[] } | null) => {
        if (!data?.roles) return;
        setRolesDisponiveis(data.roles.filter(r => r.ativo && r.nome !== "desenvolvedor").map(r => ({ value: r.nome, label: ROLE_LABEL[r.nome] ?? r.nome })));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildEditObj(u: Usuario): UsuarioEdit { return { id: u.id, email: u.email, nome: u.nome, role: u.role, ativo: u.ativo, avatar_url: u.avatar_url ?? null, deposito_id: u.deposito_id ?? null, vendedor_id: u.vendedor_id ?? null, tipos_ordem_permitidos: u.tipos_ordem_permitidos ?? [], tipos_protocolo_permitidos: u.tipos_protocolo_permitidos ?? [], is_operador_service: u.is_operador_service ?? false, is_transportador: u.is_transportador ?? false, mx_desconto_permitido: u.mx_desconto_permitido ?? null }; }

  function handleSaved(updated: UsuarioEditSalvo) {
    setUsuarios(prev => prev.map(u => u.id === updated.id ? { ...u, nome: updated.nome, role: updated.role, ativo: updated.ativo, avatar_url: updated.avatar_url ?? u.avatar_url, deposito_id: updated.deposito_id ?? u.deposito_id, vendedor_id: updated.vendedor_id ?? u.vendedor_id, tipos_ordem_permitidos: updated.tipos_ordem_permitidos ?? u.tipos_ordem_permitidos, tipos_protocolo_permitidos: updated.tipos_protocolo_permitidos ?? u.tipos_protocolo_permitidos, is_operador_service: updated.is_operador_service ?? u.is_operador_service, is_transportador: updated.is_transportador ?? u.is_transportador, mx_desconto_permitido: updated.mx_desconto_permitido !== undefined ? updated.mx_desconto_permitido : u.mx_desconto_permitido } : u));
    toast.success("Usuário atualizado com sucesso");
  }

  function comprimir(file: File, max = 200): Promise<Blob> { return new Promise(resolve => { const img = new Image(); img.onload = () => { const r = Math.min(max / img.width, max / img.height, 1); const c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => resolve(b!), "image/jpeg", 0.85); }; img.src = URL.createObjectURL(file); }); }

  function abrirModal() { setNovoUsuario({ nome: "", email: "", senha: "", role: "" }); setErroNovo(null); setMostrarSenha(false); setNovaFoto(null); setNovaFotoPreview(null); setShowNovoModal(true); }
  function fecharModal() { if (criando) return; setShowNovoModal(false); setErroNovo(null); setNovaFoto(null); setNovaFotoPreview(null); }

  async function criarUsuario() {
    if (!novoUsuario.nome.trim() || !novoUsuario.email.trim() || !novoUsuario.senha || !novoUsuario.role) { setErroNovo("Todos os campos são obrigatórios"); return; }
    if (novoUsuario.senha.length < 6) { setErroNovo("Senha deve ter no mínimo 6 caracteres"); return; }
    setCriando(true); setErroNovo(null);
    try {
      const res = await fetch("/api/user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novoUsuario) });
      const data = await res.json();
      if (!res.ok) { setErroNovo(data.error ?? `Erro ${res.status}`); return; }
      let avatarUrl: string | null = null;
      if (novaFoto) { const blob = await comprimir(novaFoto); const fd = new FormData(); fd.append("file", blob, "avatar.jpg"); fd.append("user_id", data.usuario.id); const ar = await fetch("/api/user/avatar", { method: "POST", body: fd }); if (ar.ok) avatarUrl = (await ar.json() as { avatar_url: string }).avatar_url; }
      setUsuarios(prev => [{ id: data.usuario.id, email: data.usuario.email, nome: data.usuario.nome, role: data.usuario.role, ativo: true, created_at: new Date().toISOString(), avatar_url: avatarUrl }, ...prev]);
      setShowNovoModal(false); setNovoUsuario({ nome: "", email: "", senha: "", role: "" }); setNovaFoto(null); setNovaFotoPreview(null); router.refresh();
      toast.success("Usuário criado com sucesso");
    } catch { setErroNovo("Erro ao criar usuário"); } finally { setCriando(false); }
  }

  const filtrados = search.trim() ? usuarios.filter(u => u.nome.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) : usuarios;
  const totalPages = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
  const paginados = filtrados.slice((page - 1) * ITENS_POR_PAGINA, page * ITENS_POR_PAGINA);

  const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:outline-none focus:ring-2 focus:ring-esmeralda-500/10 transition-all disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-esmeralda-300 focus:ring-2 focus:ring-esmeralda-500/10 outline-none transition" />
        </div>
        {podeCriar && <Button onClick={abrirModal} size="md" startIcon={<Plus size={16} />}>Novo Usuário</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {["Usuário", "Nome", "E-mail", "Perfil", "Status", "Criado em"].map(h => <TableCell key={h} isHeader>{h}</TableCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginados.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-16">
              <div className="flex flex-col items-center gap-2 text-gray-400"><Users size={32} className="text-gray-300" /><span>{search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}</span></div>
            </TableCell></TableRow>
          ) : paginados.map(u => (
            <TableRow key={u.id} className="cursor-pointer" onClick={() => setUsuarioEditando(u)}>
              <TableCell onClick={e => e.stopPropagation()}>
                <UserAvatar nome={u.nome} fotoUrl={u.avatar_url ?? null} size={36} userId={String(u.id)} clickable={false} />
              </TableCell>
              <TableCell className="font-medium text-gray-900">{u.nome}</TableCell>
              <TableCell className="text-gray-500">{u.email}</TableCell>
              <TableCell><Badge color="dourado">{ROLE_LABEL[u.role] ?? u.role}</Badge></TableCell>
              <TableCell>
                {u.ativo ? <span className="inline-flex items-center gap-1.5 text-sm text-success-600"><span className="w-1.5 h-1.5 rounded-full bg-success-500" />Ativo</span>
                : <span className="inline-flex items-center gap-1.5 text-sm text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Inativo</span>}
              </TableCell>
              <TableCell className="text-gray-500">{new Date(u.created_at).toLocaleDateString("pt-BR")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Página {page} de {totalPages} ({filtrados.length} itens)</p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? "bg-esmeralda-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{p}</button>
            ))}
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próximo</Button>
          </div>
        </div>
      )}

      <Modal isOpen={showNovoModal} onClose={fecharModal} title="Novo Usuário" description="Cria acesso imediato ao sistema" size="md">
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => fotoRef.current?.click()} disabled={criando}
              className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-esmeralda-400 hover:bg-esmeralda-50/30 disabled:opacity-60">
              {novaFotoPreview ? <img src={novaFotoPreview} alt="Preview" className="h-full w-full rounded-full object-cover" />
                : <Camera size={24} className="text-gray-400" />}
            </button>
            <span className="text-xs text-gray-500">{novaFotoPreview ? "Clique para trocar" : "Adicionar foto (opcional)"}</span>
            <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { setErroNovo("Foto deve ter no máximo 5MB"); return; } setNovaFoto(f); setNovaFotoPreview(URL.createObjectURL(f)); }} />
          </div>

          <InputField id="nome" label="Nome completo" placeholder="Ex: Ana Paula Silva" value={novoUsuario.nome} onChange={e => setNovoUsuario(p => ({ ...p, nome: e.target.value }))} disabled={criando} onKeyDown={e => e.key === "Enter" && criarUsuario()} />
          <InputField id="email" label="E-mail" type="email" placeholder="usuario@empresa.com" value={novoUsuario.email} onChange={e => setNovoUsuario(p => ({ ...p, email: e.target.value }))} disabled={criando} onKeyDown={e => e.key === "Enter" && criarUsuario()} />
          <InputField id="senha" label="Senha inicial" type="password" placeholder="Mínimo 6 caracteres" value={novoUsuario.senha} visible={mostrarSenha} onVisibleChange={() => setMostrarSenha(v => !v)}
            onChange={e => setNovoUsuario(p => ({ ...p, senha: e.target.value }))} disabled={criando} onKeyDown={e => e.key === "Enter" && criarUsuario()} />
          <Select id="role" label="Perfil de acesso" placeholder="Selecione um perfil..." options={rolesDisponiveis} value={novoUsuario.role} onChange={e => setNovoUsuario(p => ({ ...p, role: e.target.value }))} disabled={criando} />

          {erroNovo && <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700"><AlertTriangle size={15} className="shrink-0" />{erroNovo}</div>}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="md" onClick={fecharModal} disabled={criando} className="flex-1">Cancelar</Button>
            <Button size="md" onClick={criarUsuario} loading={criando} className="flex-1">Criar usuário</Button>
          </div>
        </div>
      </Modal>

      <UserEditDrawer
        usuario={usuarioEditando ? buildEditObj(usuarioEditando) : null}
        depositos={depositos}
        onClose={() => setUsuarioEditando(null)}
        onSaved={updated => { handleSaved(updated); setUsuarioEditando(null); }}
        userLogadoId={userLogado?.id}
      />
    </div>
  );
}
