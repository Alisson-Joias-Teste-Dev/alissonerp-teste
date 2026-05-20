"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Star, Trash2, Loader2, X } from "lucide-react";

type Imagem = {
  id: number;
  produto_id: number;
  url_publica: string;
  ordem: number;
  eh_capa: boolean;
  origem: string | null;
  filename: string | null;
  herdada: boolean;
};

type Props = {
  produtoId: number;
  podeEditar?: boolean;
  /** Disparado quando a capa muda — útil pro pai sincronizar listagem. */
  onCapaChange?: (url: string | null) => void;
};

export default function GaleriaProduto({ produtoId, podeEditar = false, onCapaChange }: Props) {
  const [imagens, setImagens] = useState<Imagem[]>([]);
  const [herdadaDe, setHerdadaDe] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | "upload" | null>(null);
  const [capaIdx, setCapaIdx] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/produtos/${produtoId}/imagens`);
      const data = await res.json();
      const list: Imagem[] = data.imagens ?? [];
      setImagens(list);
      setHerdadaDe(data.herdada_de ?? null);
      const ci = list.findIndex((i) => i.eh_capa);
      setCapaIdx(ci >= 0 ? ci : 0);
      onCapaChange?.(list.find((i) => i.eh_capa)?.url_publica ?? list[0]?.url_publica ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar();   }, [produtoId]);

  async function uploadFoto(file: File) {
    setBusy("upload");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch(`/api/produtos/${produtoId}/imagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto_base64: base64, filename: file.name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Falha ao enviar imagem: " + (err.error ?? res.statusText));
      }
      await carregar();
    } finally {
      setBusy(null);
    }
  }

  async function definirCapa(img: Imagem) {
    if (img.herdada) return;
    setBusy(img.id);
    try {
      await fetch(`/api/produtos/${produtoId}/imagens/${img.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eh_capa: true }),
      });
      await carregar();
    } finally {
      setBusy(null);
    }
  }

  async function excluir(img: Imagem) {
    if (img.herdada) return;
    if (!confirm("Excluir essa foto?")) return;
    setBusy(img.id);
    try {
      await fetch(`/api/produtos/${produtoId}/imagens/${img.id}`, { method: "DELETE" });
      await carregar();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="w-full h-36 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
        <Loader2 className="animate-spin text-gray-400" size={18} />
      </div>
    );
  }

  const capa = imagens[capaIdx] ?? null;
  const readonly = !podeEditar || herdadaDe !== null;

  return (
    <div className="space-y-2">
      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFoto(f);
          e.target.value = "";
        }}
      />

      {/* aviso herdada */}
      {herdadaDe !== null && (
        <p className="text-[11px] text-gray-500 italic">
          Imagens herdadas do produto pai (#{herdadaDe}). Edite o pai para alterar.
        </p>
      )}

      {/* foto principal */}
      {capa ? (
        <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
          <img
            src={capa.url_publica}
            alt={capa.filename ?? "Foto do produto"}
            className="w-full h-full object-contain bg-white cursor-zoom-in"
            onClick={() => setLightbox(capa.url_publica)}
          />
          {capa.eh_capa && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-400/95 text-amber-900 text-[10px] font-semibold rounded-md shadow">
              <Star size={10} fill="currentColor" /> CAPA
            </span>
          )}
          {!readonly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 bg-white/95 rounded-md text-xs font-medium text-gray-700 border border-gray-200 shadow hover:bg-white disabled:opacity-50"
            >
              {busy === "upload" ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
              Adicionar foto
            </button>
          )}
        </div>
      ) : (
        !readonly && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg px-4 py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-[#184036] hover:text-[#184036] transition-colors disabled:opacity-50"
          >
            {busy === "upload" ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
            <span className="text-xs font-medium">Adicionar primeira foto</span>
          </button>
        )
      )}

      {/* strip de thumbnails */}
      {imagens.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {imagens.map((img, i) => (
            <div key={img.id} className="relative group flex-shrink-0">
              <button
                type="button"
                onClick={() => setCapaIdx(i)}
                className={`relative w-14 h-14 rounded-md overflow-hidden border-2 transition ${
                  i === capaIdx ? "border-[#184036]" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <img src={img.url_publica} alt="" className="w-full h-full object-cover" />
                {img.eh_capa && (
                  <span className="absolute top-0.5 left-0.5 bg-amber-400 rounded-full p-0.5">
                    <Star size={8} className="text-amber-900" fill="currentColor" />
                  </span>
                )}
              </button>
              {!readonly && (
                <div className="absolute -top-1.5 -right-1.5 hidden group-hover:flex gap-0.5">
                  {!img.eh_capa && (
                    <button
                      type="button"
                      title="Definir como capa"
                      onClick={() => definirCapa(img)}
                      disabled={busy !== null}
                      className="w-5 h-5 flex items-center justify-center bg-amber-400 text-amber-900 rounded-full shadow hover:bg-amber-300 disabled:opacity-50"
                    >
                      <Star size={9} fill="currentColor" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Excluir"
                    onClick={() => excluir(img)}
                    disabled={busy !== null}
                    className="w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full shadow hover:bg-red-400 disabled:opacity-50"
                  >
                    {busy === img.id ? <Loader2 size={9} className="animate-spin" /> : <X size={10} />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {imagens.length > 0 && (
        <p className="text-[10px] text-gray-400">
          {imagens.length} {imagens.length === 1 ? "imagem" : "imagens"}
          {!readonly && " · passe o mouse na thumb pra definir capa ou excluir"}
        </p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          >
            <X size={18} />
          </button>
          <img
            src={lightbox}
            alt="Foto ampliada"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
