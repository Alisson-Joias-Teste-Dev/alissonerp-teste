"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
  creme: "#F3EADA",
  bg: "#FAFAF7",
  dourado: "#DB9864",
};

interface FotoItem {
  path: string;
  url: string;
  origem: "pdv" | "erp";
}

interface GaleriaFotosOrdemProps {
  ordemId: number;
  // Permite passar paths iniciais já carregados (opcional — se não passar, busca via API)
  arquivosPaths?: string[] | null;
}

export default function GaleriaFotosOrdem({ ordemId, arquivosPaths }: GaleriaFotosOrdemProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "desenvolvedor";

  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Modal lightbox
  const [modalAberto, setModalAberto] = useState(false);
  const [modalIdx, setModalIdx] = useState(0);

  // Preview de upload
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregarFotos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordens/${ordemId}/fotos`);
      const data = await res.json();
      if (data.fotos) setFotos(data.fotos);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [ordemId]);

  useEffect(() => {
    // Se arquivosPaths foi passado mas está vazio, ainda carrega da API
    // (arquivosPaths é da view antiga que não tem o campo — usamos sempre a API)
    carregarFotos();
  }, [carregarFotos]);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function abrirModal(idx: number) {
    setModalIdx(idx);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
  }

  function navegar(delta: number) {
    setModalIdx((i) => {
      const next = i + delta;
      if (next < 0) return fotos.length - 1;
      if (next >= fotos.length) return 0;
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") navegar(-1);
    else if (e.key === "ArrowRight") navegar(1);
    else if (e.key === "Escape") fecharModal();
  }

  function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadError("");

    // Limpar input para permitir re-seleção do mesmo arquivo
    e.target.value = "";
  }

  function cancelarUpload() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
    setUploadError("");
  }

  async function enviarFoto() {
    if (!previewFile || uploading) return;
    setUploading(true);
    setUploadError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const ext = previewFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const timestamp = Date.now();
      const path = `ordens/${ordemId}/${timestamp}-${user.id.substring(0, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("ordem-fotos")
        .upload(path, previewFile, {
          contentType: previewFile.type || "image/jpeg",
          upsert: false,
        });

      if (uploadErr) throw new Error(`Upload: ${uploadErr.message}`);

      // Registrar path na ordem
      const res = await fetch(`/api/ordens/${ordemId}/fotos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Erro ao registrar foto");
      }

      cancelarUpload();
      await carregarFotos();
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Erro ao enviar foto");
    } finally {
      setUploading(false);
    }
  }

  async function removerFoto(path: string) {
    if (!confirm("Remover esta foto da ordem?")) return;

    const res = await fetch(`/api/ordens/${ordemId}/fotos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (res.ok) {
      setFotos((prev) => prev.filter((f) => f.path !== path));
      if (modalAberto) fecharModal();
    }
  }

  if (loading) {
    return (
      <div
        className="bg-white rounded-xl border p-5"
        style={{ borderColor: C.cremeBorder }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
            Fotos da Ordem
          </span>
        </div>
        <div className="flex justify-center py-6">
          <div
            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: C.esmeralda }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="bg-white rounded-xl border p-5"
        style={{ borderColor: C.cremeBorder }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
              Fotos da Ordem
            </span>
            {fotos.length > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: "#E8F0ED", color: C.esmeralda }}
              >
                {fotos.length}
              </span>
            )}
          </div>

          {/* Botão adicionar foto */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: C.creme, color: C.esmeralda }}
            title="Adicionar foto"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Adicionar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={selecionarArquivo}
          />
        </div>

        {/* Preview de upload */}
        {previewFile && previewUrl && (
          <div
            className="mb-4 p-3 rounded-lg border"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
          >
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="w-16 h-16 object-cover rounded-lg border"
                style={{ borderColor: C.cremeBorder }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: "#1A1A1A" }}>
                  {previewFile.name}
                </p>
                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                  {(previewFile.size / 1024).toFixed(0)} KB
                </p>
                {uploadError && (
                  <p className="text-[11px] mt-1" style={{ color: "#DC2626" }}>
                    {uploadError}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={enviarFoto}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: C.esmeralda }}
                >
                  {uploading ? "Enviando…" : "Enviar"}
                </button>
                <button
                  onClick={cancelarUpload}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium border disabled:opacity-50"
                  style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Grid de fotos */}
        {fotos.length === 0 ? (
          <div
            className="py-8 text-center rounded-lg border border-dashed"
            style={{ borderColor: C.cremeBorder }}
          >
            <p className="text-sm" style={{ color: "#9CA3AF" }}>
              Nenhuma foto anexada
            </p>
            <p className="text-[11px] mt-1" style={{ color: "#C4B5A0" }}>
              Clique em "Adicionar" para enviar uma foto desta ordem.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {fotos.map((foto, idx) => (
              <div key={foto.path} className="relative group">
                <button
                  onClick={() => abrirModal(idx)}
                  className="w-full aspect-square rounded-lg overflow-hidden border transition-all hover:border-current"
                  style={{ borderColor: C.cremeBorder }}
                  title="Ver foto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto.url}
                    alt={`Foto ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>

                {/* Badge de origem */}
                <span
                  className="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold leading-none"
                  style={{
                    backgroundColor: foto.origem === "pdv" ? "rgba(59,130,246,0.85)" : "rgba(24,64,54,0.75)",
                    color: "#fff",
                  }}
                >
                  {foto.origem === "pdv" ? "PDV" : "ERP"}
                </span>

                {/* Botão remover (somente admin, somente fotos ERP) */}
                {isAdmin && foto.origem === "erp" && (
                  <button
                    onClick={() => removerFoto(foto.path)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: "rgba(220,38,38,0.85)" }}
                    title="Remover foto"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal lightbox */}
      {modalAberto && fotos.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={fecharModal}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
          role="dialog"
          aria-modal="true"
          aria-label="Galeria de fotos"
        >
          {/* Fechar */}
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white z-10 transition-colors hover:bg-white/10"
            onClick={fecharModal}
            aria-label="Fechar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* Contador */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
            {modalIdx + 1} / {fotos.length}
          </div>

          {/* Navegação anterior */}
          {fotos.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white z-10 transition-colors hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); navegar(-1); }}
              aria-label="Foto anterior"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}

          {/* Imagem principal */}
          <div
            className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotos[modalIdx].url}
              alt={`Foto ${modalIdx + 1} da ordem`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Navegação próxima */}
          {fotos.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white z-10 transition-colors hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); navegar(1); }}
              aria-label="Próxima foto"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          )}

          {/* Remover (admin, somente fotos ERP) */}
          {isAdmin && fotos[modalIdx].origem === "erp" && (
            <button
              className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-colors hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); removerFoto(fotos[modalIdx].path); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Remover foto
            </button>
          )}

          {/* Thumbnails na base */}
          {fotos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto pb-1">
              {fotos.map((foto, idx) => (
                <button
                  key={foto.path}
                  onClick={(e) => { e.stopPropagation(); setModalIdx(idx); }}
                  className="shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-colors"
                  style={{
                    borderColor: idx === modalIdx ? "#ffffff" : "transparent",
                    opacity: idx === modalIdx ? 1 : 0.5,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
