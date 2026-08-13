"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
} from "lucide-react";
import { Button, Badge, StatusBadge } from "@/components/ui";
import UserEditDrawer, { type UsuarioEdit } from "@/components/UserEditDrawer";
import Tabela from "@/components/Tabela";
import ModalNovoUsuario from "./usuarios/ModalNovoUsuario";
import { useAuth } from "@/hooks/useAuth";
import { useErrorStore } from "@/stores/errorStore";

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

export default function TabUsuarios({ usuarios, depositos, initialUserId }: { usuarios: any[]; depositos: any[]; initialUserId?: string | null }) {
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
  const [listaUsuarios, setListaUsuarios] = useState<any[]>(usuarios);
  const [editando, setEditando] = useState<UsuarioEdit | null>(null);

  const podecriarUsuario = roleLogado === "admin" || roleLogado === "desenvolvedor";
  const [showNovoUsuarioModal, setShowNovoUsuarioModal] = useState(false);

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

  // Auto-abrir drawer quando initialUserId é passado (ex: clique no avatar)
  useEffect(() => {
    if (!initialUserId || usuarios.length === 0) return;
    const u = usuarios.find((user: any) => user.id === initialUserId);
    if (u) setEditando(buildEditObj(u));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId, usuarios]);

  function buildEditObj(u: any): UsuarioEdit {
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

  function abrirDrawer(u: any) {
    setEditando(buildEditObj(u));
  }

  function handleSaved(updated: UsuarioEdit) {
    setListaUsuarios((prev: any[]) =>
      prev.map((u: any) =>
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

  function abrirModalNovo() {
    setShowNovoUsuarioModal(true);
  }

  return (
    <>
      {/* Cabeçalho da aba com botão Novo Usuário */}
      {podecriarUsuario && (
        <div className="flex justify-end mb-4">
          <Button variant="primary" size="sm" onClick={abrirModalNovo}>
            <Plus size={15} />
            Novo Usuário
          </Button>
        </div>
      )}

      <Tabela
        colunas={[
          {
            key: "avatar",
            header: "",
            className: "w-12",
            render: (u: any) => (
              <div className="w-8 h-8">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt={u.nome} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold select-none bg-gray-200 text-gray-500">
                    {u.nome.trim().split(/\s+/).map((p: string) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "nome",
            header: "Nome",
            className: "font-semibold text-gray-800 whitespace-nowrap",
            render: (u: any) => <>{u.nome}</>,
          },
          {
            key: "email",
            header: "E-mail",
            className: "text-xs text-gray-500 truncate max-w-[200px]",
            render: (u: any) => <>{u.email}</>,
          },
          {
            key: "role",
            header: "Role",
            render: (u: any) => (
              <Badge>
                {ROLE_LABEL[u.role] ?? u.role}
              </Badge>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (u: any) => <StatusBadge ativo={u.ativo} />,
          },
          {
            key: "desde",
            header: "Desde",
            className: "text-xs text-gray-400 whitespace-nowrap",
            render: (u: any) => <>{new Date(u.created_at).toLocaleDateString("pt-BR")}</>,
          },
        ]}
        dados={listaUsuarios}
        onLinhaClick={(u: any) => abrirDrawer(u)}
        mensagemVazia="Nenhum usuário cadastrado"
      />

      {/* Drawer de edição */}
      <UserEditDrawer
        usuario={editando}
        depositos={depositos}
        onClose={() => setEditando(null)}
        onSaved={(updated) => { handleSaved(updated); }}
        userLogadoId={userLogado?.id}
      />

      {showNovoUsuarioModal && (
        <ModalNovoUsuario
          onCriado={(criado) => setListaUsuarios((prev: any[]) => [criado, ...prev])}
          onClose={() => setShowNovoUsuarioModal(false)}
          rolesDisponiveis={rolesDisponiveis}
        />
      )}
    </>
  );
}
