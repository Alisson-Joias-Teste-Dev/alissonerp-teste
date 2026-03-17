"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
};

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
  desenvolvedor:      "Dev",
  gerente_fabrica:    "Ger. Fábrica",
  gerente_loja:       "Ger. Loja",
  consultora:         "Consultora",
  ourives:            "Ourives",
  motoboy:            "Motoboy",
  pcp:                "PCP",
  estoquista_fabrica: "Est. Fábrica",
  estoquista_loja:    "Est. Loja",
};

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function dataRelativa(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = 60_000;
  const h = 3_600_000;
  const d = 86_400_000;
  if (diff < min) return "agora";
  if (diff < 60 * min) return `há ${Math.floor(diff / min)}min`;
  if (diff < 24 * h) return `há ${Math.floor(diff / h)}h`;
  if (diff < 48 * h) return "ontem";
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function renderTexto(texto: string) {
  // Highlight @word mentions
  const parts = texto.split(/(@[^\s]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} style={{ color: C.esmeralda, fontWeight: 500 }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface Comentario {
  id: number;
  texto: string;
  mencoes: string[];
  autor_id: string;
  autor_nome: string;
  autor_role: string;
  editado: boolean;
  editado_em: string | null;
  created_at: string;
}

interface UsuarioBusca {
  id: string;
  nome: string;
  role: string;
}

interface Props {
  ordemId: number;
  onCountChange?: (count: number) => void;
}

export default function ComentariosOrdem({ ordemId, onCountChange }: Props) {
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "desenvolvedor";

  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);

  // Input
  const [texto, setTexto] = useState("");
  const [mencoes, setMencoes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  // @mention
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<UsuarioBusca[]>([]);
  const [mentionIdx, setMentionIdx] = useState(0);

  // Edit
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editTexto, setEditTexto] = useState("");

  // Delete confirm
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load initial comments
  useEffect(() => {
    fetch(`/api/ordens/${ordemId}/comentarios`)
      .then((r) => r.json())
      .then((data: Comentario[]) => {
        setComentarios(data);
        onCountChange?.(data.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ordemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new comments
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comentarios.length]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`comentarios-ordem-${ordemId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "alissonerp",
          table: "comentarios_ordem",
          filter: `ordem_id=eq.${ordemId}`,
        },
        () => {
          fetch(`/api/ordens/${ordemId}/comentarios`)
            .then((r) => r.json())
            .then((data: Comentario[]) => {
              setComentarios(data);
              onCountChange?.(data.length);
            })
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ordemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // @mention search (debounced)
  useEffect(() => {
    if (!showMention) {
      setMentionResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/usuarios/busca?q=${encodeURIComponent(mentionQuery)}`)
        .then((r) => r.json())
        .then((data: UsuarioBusca[]) => {
          setMentionResults(data);
          setMentionIdx(0);
        })
        .catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [mentionQuery, showMention]);

  function handleTextoChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTexto(val);

    const cursor = e.target.selectionStart ?? val.length;
    const antes = val.slice(0, cursor);
    const match = antes.match(/@([A-Za-zÀ-ÿ]*)$/);
    if (match) {
      setShowMention(true);
      setMentionQuery(match[1]);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  }

  function handleTextoKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMention || mentionResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIdx((i) => Math.min(i + 1, mentionResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selecionarMencao(mentionResults[mentionIdx]);
    } else if (e.key === "Escape") {
      setShowMention(false);
    }
  }

  function selecionarMencao(usuario: UsuarioBusca) {
    const cursor = textareaRef.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor);
    const match = antes.match(/@([A-Za-zÀ-ÿ]*)$/);

    if (match) {
      const primeiroNome = usuario.nome.split(" ")[0];
      const inicio = cursor - match[0].length;
      const novoTexto =
        texto.slice(0, inicio) + `@${primeiroNome} ` + texto.slice(cursor);
      setTexto(novoTexto);
    }

    setMencoes((prev) =>
      prev.includes(usuario.id) ? prev : [...prev, usuario.id]
    );
    setShowMention(false);
    setMentionResults([]);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/ordens/${ordemId}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), mencoes }),
      });
      if (res.ok) {
        setTexto("");
        setMencoes([]);
        const novos: Comentario[] = await fetch(
          `/api/ordens/${ordemId}/comentarios`
        ).then((r) => r.json());
        setComentarios(novos);
        onCountChange?.(novos.length);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function salvarEdicao(id: number) {
    if (!editTexto.trim()) return;
    const res = await fetch(`/api/ordens/${ordemId}/comentarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: editTexto.trim() }),
    });
    if (res.ok) {
      const agora = new Date().toISOString();
      setComentarios((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, texto: editTexto.trim(), editado: true, editado_em: agora } : c
        )
      );
      setEditandoId(null);
    }
  }

  async function confirmarDelete(id: number) {
    const res = await fetch(`/api/ordens/${ordemId}/comentarios/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const novos = comentarios.filter((c) => c.id !== id);
      setComentarios(novos);
      onCountChange?.(novos.length);
      setDeletandoId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div
          className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: C.esmeralda }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Lista de comentários */}
      <div
        ref={listRef}
        className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1"
      >
        {comentarios.length === 0 ? (
          <div
            className="py-10 text-center rounded-xl border"
            style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
          >
            <p className="text-sm" style={{ color: "#9CA3AF" }}>
              Nenhum comentário ainda.
            </p>
            <p className="text-[11px] mt-1" style={{ color: "#C4B5A0" }}>
              Seja o primeiro a comentar nesta ordem.
            </p>
          </div>
        ) : (
          comentarios.map((c) => {
            const roleColors =
              ROLE_COLORS[c.autor_role] ?? { bg: "#F3F4F6", color: "#6B7280" };
            const isAutor = c.autor_id === user?.id;
            const podeEditar = isAutor;
            const podeDeletar = isAutor || isAdmin;
            const isEditando = editandoId === c.id;
            const isDeletando = deletandoId === c.id;

            return (
              <div
                key={c.id}
                className="rounded-xl border p-4 bg-white"
                style={{ borderColor: C.cremeBorder }}
              >
                {/* Header do comentário */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {/* Avatar */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        backgroundColor: roleColors.bg,
                        color: roleColors.color,
                      }}
                    >
                      {iniciais(c.autor_nome)}
                    </div>
                    {/* Nome + role + data */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[13px] font-semibold"
                        style={{ color: "#1A1A1A" }}
                      >
                        {c.autor_nome}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{
                          backgroundColor: roleColors.bg,
                          color: roleColors.color,
                        }}
                      >
                        {ROLE_LABEL[c.autor_role] ?? c.autor_role}
                      </span>
                      <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                        · {dataRelativa(c.created_at)}
                      </span>
                      {c.editado && c.editado_em && (
                        <span
                          className="text-[10px] italic"
                          style={{ color: "#C4B5A0" }}
                        >
                          · (editado {new Date(c.editado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {new Date(c.editado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Ações */}
                  {!isEditando && !isDeletando && (
                    <div className="flex gap-1 shrink-0">
                      {podeEditar && (
                        <button
                          onClick={() => {
                            setEditandoId(c.id);
                            setEditTexto(c.texto);
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-sm transition-colors hover:bg-stone-100"
                          title="Editar"
                        >
                          ✏️
                        </button>
                      )}
                      {podeDeletar && (
                        <button
                          onClick={() => setDeletandoId(c.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-sm transition-colors hover:bg-red-50"
                          title="Deletar"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                {isEditando ? (
                  <div className="space-y-2">
                    <textarea
                      value={editTexto}
                      onChange={(e) => setEditTexto(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border px-3 py-2 text-sm resize-none outline-none"
                      style={{ borderColor: C.cremeBorder }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => salvarEdicao(c.id)}
                        disabled={!editTexto.trim()}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: C.esmeralda }}
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="px-3 py-1 rounded-lg text-xs font-medium border"
                        style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : isDeletando ? (
                  <div
                    className="rounded-lg p-3 text-sm"
                    style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}
                  >
                    <p className="font-medium mb-2" style={{ color: "#991B1B" }}>
                      Tem certeza que deseja deletar este comentário?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmarDelete(c.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white"
                        style={{ backgroundColor: "#DC2626" }}
                      >
                        Deletar
                      </button>
                      <button
                        onClick={() => setDeletandoId(null)}
                        className="px-3 py-1 rounded-lg text-xs font-medium border"
                        style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed" style={{ color: "#374151" }}>
                    {renderTexto(c.texto)}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input de novo comentário */}
      <div className="relative">
        {/* Dropdown @mention */}
        {showMention && mentionResults.length > 0 && (
          <div
            className="absolute bottom-full mb-1 left-0 right-0 rounded-lg border shadow-lg z-10 overflow-hidden"
            style={{ backgroundColor: "#fff", borderColor: C.cremeBorder }}
          >
            {mentionResults.map((u, i) => {
              const rc = ROLE_COLORS[u.role] ?? { bg: "#F3F4F6", color: "#6B7280" };
              return (
                <button
                  key={u.id}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent textarea blur
                    selecionarMencao(u);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    backgroundColor: i === mentionIdx ? C.cremeBorder : "transparent",
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: rc.bg, color: rc.color }}
                  >
                    {iniciais(u.nome)}
                  </div>
                  <span className="font-medium" style={{ color: "#1A1A1A" }}>
                    {u.nome}
                  </span>
                  <span
                    className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ backgroundColor: rc.bg, color: rc.color }}
                  >
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div
          className="flex gap-2 rounded-xl border p-3"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={handleTextoChange}
            onKeyDown={handleTextoKeyDown}
            placeholder="💬 Escreva um comentário... (@ para mencionar)"
            rows={2}
            className="flex-1 resize-none outline-none text-sm"
            style={{ color: "#374151" }}
          />
          <button
            onClick={enviar}
            disabled={!texto.trim() || enviando}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white self-end disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: C.esmeralda }}
          >
            {enviando ? "…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
