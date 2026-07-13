"use client";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const P = {
  card: "#ffffff",
  border: "#e5e7eb",
  texto: "#111827",
  secundario: "#6b7280",
  dourado: "#d97706",
  verde: "#16a34a",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Usuario {
  id: string;
  nome: string;
  role?: string;
}

interface ConfigItem {
  chave: string;
  titulo: string;
  descricao: string;
  usuariosKey: keyof UsuariosPorRole;
  icone: string;
  multi?: boolean;
}

interface UsuariosPorRole {
  gerentes: Usuario[];
  diretores_admins: Usuario[];
  admins_devs: Usuario[];
  metal_aprovadores: Usuario[];
  aprovadores_limpeza: Usuario[];
  aprovadores_entrega_sem_pagamento: Usuario[];
  todos_usuarios: Usuario[];
  conversao_aprovadores: Usuario[];
  precificacao_aprovadores: Usuario[];
  devolucao_aprovadores: Usuario[];
}

interface FormularioAprovadorProps {
  item: ConfigItem;
  config: Record<string, string>;
  usuarios: UsuariosPorRole;
  podeEditar: boolean;
  onChange: (chave: string, valor: string) => void;
  toggleMulti: (chave: string, userId: string) => void;
  getMultiNames: (chave: string) => string;
  getUserName: (chave: string) => string;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FormularioAprovador({
  item,
  config,
  usuarios,
  podeEditar,
  onChange,
  toggleMulti,
  getMultiNames,
  getUserName,
}: FormularioAprovadorProps) {
  const valorAtual = String((config as any)[item.chave] ?? "");
  const lista = usuarios[item.usuariosKey] ?? [];

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ backgroundColor: P.card, borderColor: P.border }}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">{item.icone}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: P.texto }}>
            {item.titulo}
          </p>
          <p className="text-xs mt-0.5" style={{ color: P.secundario }}>
            {item.descricao}
          </p>
        </div>
      </div>

      {item.multi ? (
        podeEditar ? (
          <div className="rounded-lg border divide-y" style={{ borderColor: P.border }}>
            {lista.map((u) => {
              const sel = String(valorAtual).split(",").map((s) => s.trim()).includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleMulti(item.chave, u.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors"
                  style={{ backgroundColor: sel ? "#eff6ff" : "#fff", color: P.texto }}
                >
                  <span style={{ color: sel ? "#2563eb" : "#9ca3af", fontSize: 16, lineHeight: 1 }}>
                    {sel ? "☑" : "☐"}
                  </span>
                  <span style={{ fontWeight: sel ? 500 : 400 }}>{u.nome}{u.role ? ` (${u.role})` : ""}</span>
                </button>
              );
            })}
            <div className="px-3 py-1.5 text-[11px]" style={{ color: P.secundario, backgroundColor: "#fafafa" }}>
              {String(valorAtual).split(",").map((s) => s.trim()).filter(Boolean).length} selecionado(s) — marque mais de um se quiser
            </div>
          </div>
        ) : (
          <div
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}
          >
            {getMultiNames(item.chave) || "— Nenhum aprovador configurado —"}
          </div>
        )
      ) : podeEditar ? (
        <select
          value={valorAtual}
          onChange={(e) => onChange(item.chave, e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: P.border, color: P.texto, backgroundColor: "#fff" }}
        >
          <option value="">— Selecione um aprovador —</option>
          {lista.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}{u.role ? ` (${u.role})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}
        >
          {getUserName(item.chave) || "— Nenhum aprovador configurado —"}
        </div>
      )}
    </div>
  );
}
