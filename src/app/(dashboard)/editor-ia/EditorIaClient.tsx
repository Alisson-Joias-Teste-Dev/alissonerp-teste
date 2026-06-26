"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2, Download, Sparkles, X, Loader2, RefreshCw, History, Image as ImageIcon, Settings, Key, Check, AlertCircle } from "lucide-react";
import ModelSelector from "@/components/editor-ia/ModelSelector";
import SceneSelector from "@/components/editor-ia/SceneSelector";
import { CATEGORIES, LAYER_3_SCENES } from "@/lib/editor-ia/prompts";
import { AVAILABLE_MODELS, type ModelId, type AspectRatio } from "@/lib/editor-ia/engine";

type HistoricoItem = {
  id: number;
  user_id: string | null;
  user_nome: string | null;
  modelo: string;
  categoria: string | null;
  cenario_id: string | null;
  cenario_nome: string | null;
  aspect_ratio: string | null;
  detalhes: string | null;
  imagem_url: string;
  storage_path: string;
  elapsed_ms: number | null;
  cache_hits: number;
  created_at: string;
};

type ResultSlot =
  | { status: "loading"; model: ModelId; sceneId: string }
  | { status: "done"; model: ModelId; sceneId: string; cached: boolean; item: HistoricoItem }
  | { status: "error"; model: ModelId; sceneId: string; error: string };

const ASPECT_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: "1:1",  label: "1:1 (quadrado)" },
  { value: "3:4",  label: "3:4 (retrato)" },
  { value: "4:3",  label: "4:3 (paisagem)" },
  { value: "9:16", label: "9:16 (story/reel)" },
  { value: "16:9", label: "16:9 (widescreen)" },
];

interface Props {
  role: string;
}

export default function EditorIaClient({ role }: Props) {
  const isAdmin = role === "desenvolvedor" || role === "admin";
  const [inputImages, setInputImages] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("");
  const [selectedScenes, setSelectedScenes] = useState<string[]>(["white-ecommerce"]);
  const [selectedModels, setSelectedModels] = useState<ModelId[]>(["gemini-2.5-flash-image"]);
  const [compareMode, setCompareMode] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [details, setDetails] = useState("");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<ResultSlot[]>([]);
  const [tab, setTab] = useState<"gerar" | "historico" | "config">("gerar");
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [historicoMine, setHistoricoMine] = useState(true);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- upload ----------------------------------------------------------
  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      arr.push(dataUrl);
    }
    setInputImages((prev) => [...prev, ...arr]);
  }

  function removeInput(idx: number) {
    setInputImages((prev) => prev.filter((_, i) => i !== idx));
  }

  // --- load historico --------------------------------------------------
  const loadHistorico = useMemo(
    () => async () => {
      setHistoricoLoading(true);
      try {
        const r = await fetch(`/api/editor-ia/historico?limit=100${historicoMine ? "&mine=1" : ""}`);
        const j = await r.json();
        setHistorico(j.items || []);
      } finally {
        setHistoricoLoading(false);
      }
    },
    [historicoMine],
  );

  useEffect(() => {
    if (tab === "historico") loadHistorico();
  }, [tab, loadHistorico]);

  // --- gerar -----------------------------------------------------------
  async function handleGenerate() {
    if (!inputImages.length || !selectedScenes.length || !selectedModels.length) return;

    setGenerating(true);
    setResults([]);

    const jobs: Array<{ model: ModelId; sceneId: string }> = [];
    for (const sceneId of selectedScenes) {
      for (const model of selectedModels) jobs.push({ model, sceneId });
    }

    // Marca todos como loading
    setResults(jobs.map((j) => ({ status: "loading" as const, model: j.model, sceneId: j.sceneId })));

    await Promise.all(
      jobs.map(async (job, idx) => {
        try {
          const scene = LAYER_3_SCENES.find((s) => s.id === job.sceneId);
          const r = await fetch("/api/editor-ia/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              images: inputImages,
              category: category || undefined,
              sceneId: job.sceneId,
              sceneName: scene?.name,
              model: job.model,
              aspectRatio,
              details: details || undefined,
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error || `Erro ${r.status}`);
          setResults((prev) => {
            const next = [...prev];
            next[idx] = { status: "done", model: job.model, sceneId: job.sceneId, cached: !!j.cached, item: j.item };
            return next;
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro desconhecido";
          setResults((prev) => {
            const next = [...prev];
            next[idx] = { status: "error", model: job.model, sceneId: job.sceneId, error: msg };
            return next;
          });
        }
      }),
    );

    setGenerating(false);
  }

  async function deleteHistoricoItem(id: number) {
    if (!confirm("Remover essa imagem do histórico?")) return;
    const r = await fetch(`/api/editor-ia/historico?id=${id}`, { method: "DELETE" });
    if (!r.ok) {
      alert("Erro ao remover.");
      return;
    }
    setHistorico((prev) => prev.filter((i) => i.id !== id));
  }

  // --- UI --------------------------------------------------------------
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles size={22} className="text-[#1C4A3C]" />
          <h1 className="text-2xl font-semibold text-neutral-900" style={{ fontFamily: "var(--font-playfair)" }}>
            Editor IA
          </h1>
          <span className="text-[11px] uppercase tracking-widest text-neutral-500">
            Gere fotos profissionais da peça
          </span>
        </div>

        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTab("gerar")}
            className={`px-4 py-1.5 text-[12px] rounded-md transition ${
              tab === "gerar" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
            }`}
          >
            <Sparkles size={12} className="inline mr-1.5" /> Gerar
          </button>
          <button
            type="button"
            onClick={() => setTab("historico")}
            className={`px-4 py-1.5 text-[12px] rounded-md transition ${
              tab === "historico" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
            }`}
          >
            <History size={12} className="inline mr-1.5" /> Histórico
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab("config")}
              className={`px-4 py-1.5 text-[12px] rounded-md transition ${
                tab === "config" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
              }`}
            >
              <Settings size={12} className="inline mr-1.5" /> Config API
            </button>
          )}
        </div>
      </div>

      {tab === "gerar" && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          {/* -------- Painel esquerdo: controles -------- */}
          <div className="flex flex-col gap-4">
            {/* Upload */}
            <div className="border border-neutral-200 rounded-md bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-medium">
                  Imagens de entrada
                </span>
                <span className="text-[10px] text-neutral-400">{inputImages.length} foto(s)</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-neutral-300 rounded-md text-neutral-500 hover:border-[#1C4A3C] hover:text-[#1C4A3C] transition text-[12px]"
              >
                <Upload size={14} /> Enviar foto(s)
              </button>
              {inputImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {inputImages.map((img, i) => (
                    <div key={i} className="relative group aspect-square rounded overflow-hidden border border-neutral-200">
                      { /* eslint-disable-next-line @next/next/no-img-element */ }
                      <img src={img} alt={`Input ${i}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeInput(i)}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      >
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Categoria */}
            <div className="border border-neutral-200 rounded-md bg-white p-4">
              <label className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-medium">
                Categoria da peça
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-2 px-3 py-2 text-[12px] border border-neutral-300 rounded focus:outline-none focus:border-[#1C4A3C]"
              >
                <option value="">— Sem categoria —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Aspect ratio */}
            <div className="border border-neutral-200 rounded-md bg-white p-4">
              <label className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-medium">
                Proporção
              </label>
              <div className="grid grid-cols-3 gap-1 mt-2">
                {ASPECT_OPTIONS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setAspectRatio(a.value)}
                    className={`px-2 py-1.5 text-[10px] rounded border transition ${
                      aspectRatio === a.value
                        ? "bg-[#1C4A3C] border-[#1C4A3C] text-white"
                        : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {a.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Detalhes extras */}
            <div className="border border-neutral-200 rounded-md bg-white p-4">
              <label className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-medium">
                Detalhes extras (opcional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                placeholder="Ex: destacar detalhes do fecho, sombra mais suave..."
                className="w-full mt-2 px-3 py-2 text-[12px] border border-neutral-300 rounded focus:outline-none focus:border-[#1C4A3C] resize-none"
              />
            </div>

            {/* Cenários */}
            <div className="border border-neutral-200 rounded-md bg-white p-4">
              <SceneSelector selectedSceneIds={selectedScenes} onChange={setSelectedScenes} multiSelect />
            </div>

            {/* Modelos */}
            <div className="border border-neutral-200 rounded-md bg-white p-4">
              <ModelSelector
                selectedModels={selectedModels}
                onChange={setSelectedModels}
                compareMode={compareMode}
                onCompareModeChange={setCompareMode}
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !inputImages.length || !selectedScenes.length || !selectedModels.length}
              className="py-3 rounded-md bg-[#1C4A3C] text-white text-[13px] font-medium hover:bg-[#2a5d4d] disabled:bg-neutral-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Loader2 size={14} className="animate-spin" /> Gerando...</>
              ) : (
                <><Sparkles size={14} /> Gerar {selectedScenes.length * selectedModels.length} imagem(ns)</>
              )}
            </button>
          </div>

          {/* -------- Painel direito: resultados -------- */}
          <div>
            {results.length === 0 ? (
              <div className="h-full min-h-[400px] border-2 border-dashed border-neutral-200 rounded-md flex flex-col items-center justify-center text-neutral-400 p-8">
                <ImageIcon size={32} className="mb-3 opacity-50" />
                <p className="text-[12px] text-center">
                  Envie uma foto, escolha cenário(s) e modelo(s) e clique em <strong>Gerar</strong>.
                </p>
                <p className="text-[11px] text-center text-neutral-400 mt-2">
                  Imagens idênticas (mesma entrada + mesmos parâmetros) vêm do cache automaticamente.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {results.map((slot, idx) => (
                  <ResultCard key={idx} slot={slot} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "config" && isAdmin && <ConfigApiPanel />}

      {tab === "historico" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setHistoricoMine(true)}
                className={`px-4 py-1.5 text-[12px] rounded-md transition ${
                  historicoMine ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
                }`}
              >
                Minhas
              </button>
              <button
                type="button"
                onClick={() => setHistoricoMine(false)}
                className={`px-4 py-1.5 text-[12px] rounded-md transition ${
                  !historicoMine ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
                }`}
              >
                Todas
              </button>
            </div>
            <button
              type="button"
              onClick={loadHistorico}
              className="flex items-center gap-1.5 text-[11px] text-neutral-600 hover:text-neutral-900"
            >
              <RefreshCw size={12} className={historicoLoading ? "animate-spin" : ""} /> Recarregar
            </button>
          </div>

          {historicoLoading ? (
            <div className="text-center py-10 text-neutral-400 text-[12px]">Carregando...</div>
          ) : historico.length === 0 ? (
            <div className="text-center py-16 text-neutral-400 text-[12px]">Sem imagens no histórico ainda.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {historico.map((item) => (
                <HistoricoCard key={item.id} item={item} onDelete={() => deleteHistoricoItem(item.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Cards
// ============================================================

function ResultCard({ slot }: { slot: ResultSlot }) {
  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === slot.model);
  const sceneInfo = LAYER_3_SCENES.find((s) => s.id === slot.sceneId);

  if (slot.status === "loading") {
    return (
      <div className="aspect-square border border-neutral-200 rounded-md bg-neutral-50 flex flex-col items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[#1C4A3C] mb-2" />
        <span className="text-[10px] text-neutral-500 text-center px-4">
          {modelInfo?.name}<br/>
          <span className="text-neutral-400">{sceneInfo?.name}</span>
        </span>
      </div>
    );
  }

  if (slot.status === "error") {
    return (
      <div className="aspect-square border border-red-200 rounded-md bg-red-50 flex flex-col items-center justify-center p-4">
        <X size={20} className="text-red-500 mb-2" />
        <span className="text-[10px] text-red-700 text-center">
          {modelInfo?.name}<br/>
          <span className="text-neutral-500">{sceneInfo?.name}</span><br/>
          <span className="mt-2 block">{slot.error}</span>
        </span>
      </div>
    );
  }

  const { item, cached } = slot;
  return (
    <div className="border border-neutral-200 rounded-md bg-white overflow-hidden flex flex-col">
      <div className="relative aspect-square bg-neutral-50">
        { /* eslint-disable-next-line @next/next/no-img-element */ }
        <img src={item.imagem_url} alt={item.cenario_nome || ""} className="w-full h-full object-cover" />
        {cached && (
          <span className="absolute top-2 left-2 bg-amber-500 text-white text-[9px] uppercase tracking-wider px-2 py-0.5 rounded">
            Já existia
          </span>
        )}
      </div>
      <div className="p-3 text-[11px]">
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-neutral-900 truncate">{sceneInfo?.name || item.cenario_nome}</span>
          <a
            href={item.imagem_url}
            download={`editor-ia-${item.id}.png`}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-500 hover:text-[#1C4A3C]"
            title="Baixar"
          >
            <Download size={12} />
          </a>
        </div>
        <span className="text-[10px] text-neutral-500">{modelInfo?.name}</span>
        {cached && item.cache_hits > 0 && (
          <span className="block text-[10px] text-amber-600 mt-0.5">
            Servida do cache ({item.cache_hits}x)
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Config API (só admin/desenvolvedor)
// ============================================================

type ConfigStatus = {
  gemini: { configured: boolean; source: "db" | "env" | null; masked: string | null; updatedAt: string | null };
  openai: { configured: boolean; source: "db" | "env" | null; masked: string | null; updatedAt: string | null };
};

function ConfigApiPanel() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [geminiInput, setGeminiInput] = useState("");
  const [openaiInput, setOpenaiInput] = useState("");
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [saving, setSaving] = useState<"gemini" | "openai" | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/editor-ia/config");
      const j = await r.json();
      if (r.ok) setStatus(j);
      else setToast({ type: "err", msg: j?.error || "Erro ao carregar" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(which: "gemini" | "openai", value: string) {
    setSaving(which);
    try {
      const r = await fetch("/api/editor-ia/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [which]: value }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Erro ao salvar");
      setToast({ type: "ok", msg: value ? "Chave salva com sucesso." : "Chave removida." });
      if (which === "gemini") setGeminiInput("");
      else setOpenaiInput("");
      await load();
    } catch (err) {
      setToast({ type: "err", msg: err instanceof Error ? err.message : "Erro" });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="border border-neutral-200 rounded-md bg-white p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <Key size={18} className="text-[#1C4A3C] mt-0.5" />
          <div>
            <h2 className="text-[14px] font-medium text-neutral-900">Chaves das APIs</h2>
            <p className="text-[11px] text-neutral-500 mt-1">
              Configure aqui as chaves do Gemini e OpenAI. Elas ficam salvas no banco (prioridade sobre <code className="bg-neutral-100 px-1 rounded">.env.local</code>) e são criptografadas no transporte. Só <strong>admin</strong> e <strong>desenvolvedor</strong> veem/alteram esta aba.
            </p>
          </div>
        </div>

        {toast && (
          <div
            className={`mb-4 px-3 py-2 rounded-md text-[12px] flex items-center gap-2 ${
              toast.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {toast.type === "ok" ? <Check size={12} /> : <AlertCircle size={12} />}
            {toast.msg}
          </div>
        )}

        {loading ? (
          <div className="text-center py-6 text-neutral-400 text-[12px]">
            <Loader2 size={14} className="animate-spin inline mr-2" />
            Carregando...
          </div>
        ) : (
          <div className="space-y-5">
            <KeyRow
              label="Gemini API Key"
              hint="Usada por Gemini 2.5 Flash, Gemini 3.1 Flash e Imagen 4"
              linkText="Gerar em aistudio.google.com"
              linkHref="https://aistudio.google.com/apikey"
              placeholder="AIzaSyX..."
              status={status?.gemini}
              value={geminiInput}
              onChange={setGeminiInput}
              show={showGemini}
              onToggleShow={() => setShowGemini((s) => !s)}
              onSave={() => save("gemini", geminiInput)}
              onRemove={() => save("gemini", "")}
              saving={saving === "gemini"}
            />
            <KeyRow
              label="OpenAI API Key"
              hint="Usada por GPT-Image-2 (opcional — só se quiser testar esse modelo)"
              linkText="Gerar em platform.openai.com"
              linkHref="https://platform.openai.com/api-keys"
              placeholder="sk-proj-..."
              status={status?.openai}
              value={openaiInput}
              onChange={setOpenaiInput}
              show={showOpenai}
              onToggleShow={() => setShowOpenai((s) => !s)}
              onSave={() => save("openai", openaiInput)}
              onRemove={() => save("openai", "")}
              saving={saving === "openai"}
            />
          </div>
        )}
      </div>

      <div className="text-[10px] text-neutral-500 px-1">
        ⓘ A chave nunca é exibida em texto pleno após salva — só os 4 últimos caracteres.
        Se preferir, ainda pode usar o arquivo <code className="bg-neutral-100 px-1 rounded">.env.local</code> —
        a chave gravada aqui no banco tem precedência sobre o env.
      </div>
    </div>
  );
}

function KeyRow({
  label, hint, linkText, linkHref, placeholder,
  status, value, onChange, show, onToggleShow, onSave, onRemove, saving,
}: {
  label: string;
  hint: string;
  linkText: string;
  linkHref: string;
  placeholder: string;
  status?: ConfigStatus["gemini"];
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  onSave: () => void;
  onRemove: () => void;
  saving: boolean;
}) {
  const configured = status?.configured;
  const source = status?.source;

  return (
    <div className="border-t border-neutral-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[12px] font-medium text-neutral-900">{label}</label>
        {configured ? (
          <span className="text-[10px] uppercase tracking-wider text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            <Check size={9} className="inline mr-0.5" />
            Configurada{source === "env" ? " (env)" : ""}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            Não configurada
          </span>
        )}
      </div>
      <p className="text-[10px] text-neutral-500">{hint}</p>

      {configured && status?.masked && (
        <div className="mt-2 text-[11px] text-neutral-600 bg-neutral-50 px-3 py-2 rounded font-mono">
          {status.masked}
          {status.updatedAt && (
            <span className="text-[10px] text-neutral-400 ml-2 font-sans">
              · atualizado {new Date(status.updatedAt).toLocaleString("pt-BR")}
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 pr-16 text-[12px] border border-neutral-300 rounded font-mono focus:outline-none focus:border-[#1C4A3C]"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 hover:text-neutral-900 uppercase"
          >
            {show ? "Ocultar" : "Ver"}
          </button>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!value || saving}
          className="px-4 py-2 text-[12px] bg-[#1C4A3C] text-white rounded hover:bg-[#2a5d4d] disabled:bg-neutral-300 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : "Salvar"}
        </button>
        {configured && source === "db" && (
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 rounded"
            title="Remover do banco"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <a href={linkHref} target="_blank" rel="noreferrer" className="text-[10px] text-[#1C4A3C] hover:underline mt-1 inline-block">
        {linkText} ↗
      </a>
    </div>
  );
}

function HistoricoCard({ item, onDelete }: { item: HistoricoItem; onDelete: () => void }) {
  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === item.modelo);
  return (
    <div className="border border-neutral-200 rounded-md bg-white overflow-hidden flex flex-col group">
      <div className="relative aspect-square bg-neutral-50">
        { /* eslint-disable-next-line @next/next/no-img-element */ }
        <img src={item.imagem_url} alt={item.cenario_nome || ""} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <a
            href={item.imagem_url}
            download={`editor-ia-${item.id}.png`}
            target="_blank"
            rel="noreferrer"
            className="bg-white/90 rounded-full p-1.5 hover:bg-white"
            title="Baixar"
          >
            <Download size={11} />
          </a>
          <button
            type="button"
            onClick={onDelete}
            className="bg-white/90 rounded-full p-1.5 hover:bg-red-500 hover:text-white"
            title="Remover"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      <div className="p-2 text-[10px]">
        <div className="font-medium text-neutral-900 truncate">{item.cenario_nome || item.cenario_id || "—"}</div>
        <div className="text-neutral-500 truncate">{modelInfo?.name || item.modelo}</div>
        {item.user_nome && <div className="text-neutral-400 truncate">{item.user_nome}</div>}
        {item.cache_hits > 0 && (
          <div className="text-amber-600 mt-0.5">{item.cache_hits}x do cache</div>
        )}
      </div>
    </div>
  );
}
