"use client";

import { useEffect, useRef, useState } from "react";

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
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora — mantém a tela compacta (select fechado
  // por padrão) em vez da lista de checkboxes sempre expandida, que ficava
  // poluída em chaves com muitos usuários elegíveis (ex.: admins/devs).
  useEffect(() => {
    if (!aberto) return;
    function onClickFora(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [aberto]);

  return (
    <div
      className="rounded-lg border p-2.5 space-y-2"
      style={{ backgroundColor: P.card, borderColor: P.border }}
    >
      {/* REGRA DE NEGÓCIO (16/07): descrição saiu de parágrafo sempre visível
          pra tooltip nativo (title=) no ícone de info — card ficou com metade
          da altura, pra caber a grade de 2 colunas sem estourar a tela de
          rolagem (pedido do Jonathan, 16 tipos de aprovação numa tela só). */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm shrink-0">{item.icone}</span>
        <p className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: P.texto }} title={item.titulo}>
          {item.titulo}
        </p>
        <span title={item.descricao} style={{ color: P.secundario, cursor: "help", flexShrink: 0, fontSize: 13, lineHeight: 1 }}>
          ⓘ
        </span>
      </div>

      {item.multi ? (
        podeEditar ? (
          <div className="relative" ref={boxRef}>
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-left"
              style={{ borderColor: P.border, color: P.texto, backgroundColor: "#fff" }}
            >
              <span className="truncate" style={{ color: getMultiNames(item.chave) ? P.texto : P.secundario }}>
                {getMultiNames(item.chave) || "— Selecione —"}
              </span>
              <span style={{ color: P.secundario, fontSize: 10, flexShrink: 0 }}>
                {aberto ? "▲" : "▼"}
              </span>
            </button>

            {aberto && (
              <div
                className="absolute z-10 mt-1 w-full rounded-lg border divide-y shadow-lg max-h-64 overflow-y-auto"
                style={{ borderColor: P.border, backgroundColor: "#fff" }}
              >
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
              </div>
            )}
          </div>
        ) : (
          <div
            className="w-full rounded-lg border px-2.5 py-1.5 text-xs truncate"
            style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}
          >
            {getMultiNames(item.chave) || "— Nenhum —"}
          </div>
        )
      ) : podeEditar ? (
        <select
          value={valorAtual}
          onChange={(e) => onChange(item.chave, e.target.value)}
          className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
          style={{ borderColor: P.border, color: P.texto, backgroundColor: "#fff" }}
        >
          <option value="">— Selecione —</option>
          {lista.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}{u.role ? ` (${u.role})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div
          className="w-full rounded-lg border px-2.5 py-1.5 text-xs truncate"
          style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}
        >
          {getUserName(item.chave) || "— Nenhum —"}
        </div>
      )}
    </div>
  );
}
