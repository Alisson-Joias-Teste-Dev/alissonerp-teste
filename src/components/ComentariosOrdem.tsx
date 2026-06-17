"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPublicUrl } from "@/lib/storage-url";

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
  foto_path: string | null;
  foto_url?: string; // signed URL, gerado no cliente
}

interface UsuarioBusca {
  id: string;
  nome: string;
  role: string;
}

// Componente reutilizavel de comentarios+alarme. Por padrao opera sobre ORDENS
// (ordemId), mantendo 100% do comportamento atual. Passando `devolucaoId` ele
// opera sobre a DEVOLUCAO (tabela/rota/realtime proprios) — reuso sem duplicar
// e sem alterar nada das ordens.
interface Props {
  ordemId?: number;
  devolucaoId?: number;
  onCountChange?: (count: number) => void;
}

const SOMENTE_LEITURA = false;

export default function ComentariosOrdem({ ordemId, devolucaoId, onCountChange }: Props) {
  const { user, role } = useAuth();
  const isAdmin = role === "admin" || role === "desenvolvedor";

  // Entidade-alvo: devolucao (se passado) ou ordem (padrao).
  const isDevolucao = devolucaoId != null;
  const entityId = (devolucaoId ?? ordemId) as number;
  const apiBase = isDevolucao
    ? `/api/devolucoes/${entityId}/comentarios`
    : `/api/ordens/${entityId}/comentarios`;
  const realtimeTable = isDevolucao ? "comentarios_devolucao" : "comentarios_ordem";
  const realtimeFilter = isDevolucao ? `devolucao_id=eq.${entityId}` : `ordem_id=eq.${entityId}`;

  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);

  // Input
  const [texto, setTexto] = useState("");
  const [mencoes, setMencoes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Foto no comentário
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

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

  // Helper de URL agora vem de @/lib/storage-url. Decide entre proxy autenticado
  // (bucket privado) e URL pública direta, e normaliza URLs antigas salvas no DB.

  function carregarSignedUrls(lista: Comentario[]): Comentario[] {
    return lista.map((c) =>
      c.foto_path
        ? { ...c, foto_url: getPublicUrl("ordem-fotos", c.foto_path) }
        : c
    );
  }

  // Load initial comments
  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then(async (data: Comentario[]) => {
        const comUrls = carregarSignedUrls(data);
        setComentarios(comUrls);
        onCountChange?.(comUrls.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      .channel(`comentarios-${realtimeTable}-${entityId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "alissonerp",
          table: realtimeTable,
          filter: realtimeFilter,
        },
        () => {
          fetch(apiBase)
            .then((r) => r.json())
            .then(async (data: Comentario[]) => {
              const comUrls = carregarSignedUrls(data);
              setComentarios(comUrls);
              onCountChange?.(comUrls.length);
            })
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entityId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Enter sem Shift envia o comentário (quando dropdown de menção não está aberto)
    if (e.key === "Enter" && !e.shiftKey && (!showMention || mentionResults.length === 0)) {
      if (texto.trim() && !enviando) {
        e.preventDefault();
        enviar();
      }
      return;
    }

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

  function lerBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function selecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    // Pré-carrega base64 para envio server-side
    lerBase64(file).then(setFotoBase64).catch(() => setFotoBase64(null));
    e.target.value = "";
  }

  function removerFotoSelecionada() {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(null);
    setFotoPreview(null);
    setFotoBase64(null);
  }

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), mencoes, foto_base64: fotoBase64 ?? null }),
      });
      if (res.ok) {
        setTexto("");
        setMencoes([]);
        removerFotoSelecionada();
        const novos: Comentario[] = await fetch(
          apiBase
        ).then((r) => r.json());
        const comUrls = carregarSignedUrls(novos);
        setComentarios(comUrls);
        onCountChange?.(comUrls.length);
      }
    } finally {
      setEnviando(false);
    }
  }

  async function salvarEdicao(id: number) {
    if (!editTexto.trim()) return;
    const res = await fetch(`${apiBase}/${id}`, {
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
    const res = await fetch(`${apiBase}/${id}`, {
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
              Seja o primeiro a comentar {isDevolucao ? "nesta devolução" : "nesta ordem"}.
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
                  {/* Ações (ocultas em modo somente leitura) */}
                  {!SOMENTE_LEITURA && !isEditando && !isDeletando && (
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
                  <div>
                    <p className="text-[13px] leading-relaxed" style={{ color: "#374151" }}>
                      {renderTexto(c.texto)}
                    </p>
                    {/* Foto do comentário */}
                    {c.foto_url && (
                      <div className="mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.foto_url}
                          alt="Foto do comentário"
                          className="max-w-[240px] max-h-[200px] rounded-lg border object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          style={{ borderColor: C.cremeBorder }}
                          onClick={() => window.open(c.foto_url, "_blank")}
                        />
                      </div>
                    )}
                    {/* Foto path sem URL (signed URL expirado) */}
                    {c.foto_path && !c.foto_url && (
                      <p className="text-[11px] mt-1 italic" style={{ color: "#9CA3AF" }}>
                        [foto anexada — recarregue para visualizar]
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input de novo comentário (oculto em modo somente leitura) */}
      {!SOMENTE_LEITURA && (
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
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          {/* Preview de foto selecionada */}
          {fotoPreview && fotoFile && (
            <div
              className="flex items-center gap-2 px-3 pt-3 pb-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fotoPreview}
                alt="Preview"
                className="w-12 h-12 object-cover rounded-lg border shrink-0"
                style={{ borderColor: C.cremeBorder }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate" style={{ color: "#1A1A1A" }}>
                  {fotoFile.name}
                </p>
                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  {(fotoFile.size / 1024).toFixed(0)} KB — será enviada com o comentário
                </p>
              </div>
              <button
                onClick={removerFotoSelecionada}
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white"
                style={{ backgroundColor: "#DC2626" }}
                title="Remover foto"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}

          <div className="flex gap-2 p-3">
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={handleTextoChange}
              onKeyDown={handleTextoKeyDown}
              placeholder="Escreva um comentário... (@ para mencionar)"
              rows={2}
              className="flex-1 resize-none outline-none text-sm"
              style={{ color: "#374151" }}
            />
            <div className="flex flex-col gap-1.5 self-end shrink-0">
              {/* Botão câmera */}
              <button
                onClick={() => fotoInputRef.current?.click()}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-stone-100"
                title="Adicionar foto"
                style={{ color: fotoFile ? C.esmeralda : "#9CA3AF" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={selecionarFoto}
              />

              {/* Botão enviar */}
              <button
                onClick={enviar}
                disabled={!texto.trim() || enviando}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: C.esmeralda }}
              >
                {enviando ? "…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
