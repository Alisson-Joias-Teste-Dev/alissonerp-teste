"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/apiFetch";
import { useGlobalError } from "@/stores/errorStore";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  X, Search, Loader2, Shield, Calendar, CheckSquare, Square,
  Upload, Trash2, Camera, CheckCircle2, AlertCircle, Video,
  ShoppingBag, Package, ChevronRight,
} from "lucide-react";

// ─── Cores ────────────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg:          "#FAFAF7",
  vermelho:    "#991B1B",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cliente {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  celular: string | null;
}

interface Venda {
  id: number;
  numero_venda: string;
  data_venda: string;
  total_venda: number;
  situacao: string;
  qtd_itens: number;
}

interface ItemVenda {
  id: number;
  produto_id: number;
  nome_produto: string;
  sku: string | null;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
}

interface TipoServico {
  id: number;
  nome: string;
}

export type TipoOrdemServico = "garantia" | "servico_venda";

const TIPO_CONFIG: Record<TipoOrdemServico, { titulo: string; bannerColor: string; label: string; itensLabel: string }> = {
  garantia:      { titulo: "Nova Ordem de Garantia",       bannerColor: "#991B1B", label: "Ordem de Garantia",       itensLabel: "Iten(s) em garantia" },
  servico_venda: { titulo: "Nova Ordem de Serviço Venda",  bannerColor: "#1E40AF", label: "Ordem de Serviço Venda",  itensLabel: "Iten(s) de serviço" },
};

export interface NovaOrdemServicoBaseModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: (numeroOrdem: string) => void;
  userId:     string;
  userName:   string;
  tipoOrdem:  TipoOrdemServico;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img   = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1920;
      let { width, height } = img;
      if (width > max || height > max) {
        if (width > height) { height = Math.round((height * max) / width); width = max; }
        else { width = Math.round((width * max) / height); height = max; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objUrl);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(""); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(""); };
    img.src = objUrl;
  });
}

function fmtData(d: string) {
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SITUACAO_LABEL: Record<string, string> = {
  rascunho: "Rascunho", aprovado: "Aprovado",
  enviado: "Enviado",   concluido: "Concluído", cancelado: "Cancelado",
};

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ["Cliente", "Venda", "Itens", "Detalhes", "Revisão"];
  return (
    <div className="flex items-center gap-1 mb-5">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                background: i <= current ? C.esmeralda : "#E5E7EB",
                color:      i <= current ? C.creme     : "#9CA3AF",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className="text-xs font-medium hidden sm:block"
              style={{ color: i <= current ? C.esmeralda : "#9CA3AF" }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-px mx-1"
              style={{ background: i < current ? C.esmeralda : "#E5E7EB" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function NovaOrdemServicoBaseModal({
  isOpen, onClose, onSuccess, userId, userName, tipoOrdem,
}: NovaOrdemServicoBaseModalProps) {
  const cfg = TIPO_CONFIG[tipoOrdem];

  const { pushError } = useGlobalError();
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);

  // ── Step 0: Cliente ───────────────────────────────────────────────────────
  const [clienteBusca,       setClienteBusca]       = useState("");
  const [clienteResultados,  setClienteResultados]  = useState<Cliente[]>([]);
  const [clienteBuscando,    setClienteBuscando]     = useState(false);
  const [clienteDropOpen,    setClienteDropOpen]     = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const clienteRef      = useRef<HTMLDivElement>(null);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const clienteDebounced = useDebounce(clienteBusca, 300);

  // ── Step 1: Vendas ────────────────────────────────────────────────────────
  const [vendas,           setVendas]           = useState<Venda[]>([]);
  const [loadingVendas,    setLoadingVendas]     = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);

  // ── Step 2: Itens ─────────────────────────────────────────────────────────
  const [itensVenda,       setItensVenda]       = useState<ItemVenda[]>([]);
  const [loadingItens,     setLoadingItens]     = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<number[]>([]);

  // ── Step 3: Detalhes ──────────────────────────────────────────────────────
  const [dataEntrega,      setDataEntrega]      = useState("");
  const [tiposServico,     setTiposServico]     = useState<TipoServico[]>([]);
  const [tiposSelecionados, setTiposSelecionados] = useState<number[]>([]);
  const [outrosDescricao,   setOutrosDescricao]   = useState("");
  const [loadingTipos,     setLoadingTipos]     = useState(false);

  // Peso + foto balança
  const [pesoDigitado,     setPesoDigitado]     = useState("");
  const [fotoBalanca,      setFotoBalanca]       = useState<{ file: File; preview: string } | null>(null);
  const [fotoBalancaPath,  setFotoBalancaPath]   = useState<string | null>(null);
  const fotoBalancaRef = useRef<HTMLInputElement>(null);

  // IA validação balança
  const [iaStatus, setIaStatus] = useState<"idle" | "uploading" | "validating" | "ok" | "erro">("idle");
  const [iaMensagem, setIaMensagem] = useState("");

  // Vídeo
  const [video, setVideo] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Fotos adicionais da peça
  const [fotosAdicional, setFotosAdicional] = useState<{ file: File; preview: string }[]>([]);
  const fotosAdicionalRef = useRef<HTMLInputElement>(null);

  // Submit
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);

  // Step 4 — número da ordem
  const [proximoNumero,  setProximoNumero]  = useState<string | null>(null);
  const [loadingNumero,  setLoadingNumero]  = useState(false);

  // ── Reset ao fechar ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      setClienteBusca(""); setClienteResultados([]); setClienteSelecionado(null);
      setVendas([]); setVendaSelecionada(null);
      setItensVenda([]); setItensSelecionados([]);
      setDataEntrega(""); setTiposSelecionados([]);
      setPesoDigitado("");
      if (fotoBalanca) URL.revokeObjectURL(fotoBalanca.preview);
      setFotoBalanca(null); setFotoBalancaPath(null);
      setIaStatus("idle"); setIaMensagem("");
      if (video) URL.revokeObjectURL(video.url);
      setVideo(null);
      fotosAdicional.forEach(f => URL.revokeObjectURL(f.preview));
      setFotosAdicional([]);
      setSalvando(false); setErro(null);
      setProximoNumero(null); setLoadingNumero(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Fechar dropdown cliente ao clicar fora ────────────────────────────────
  useEffect(() => {
    function h(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node))
        setClienteDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Busca de cliente ──────────────────────────────────────────────────────
  useEffect(() => {
    if (clienteDebounced.length < 2 || clienteSelecionado) {
      setClienteResultados([]); setClienteDropOpen(false); setDropRect(null); return;
    }
    setClienteBuscando(true);
    fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(clienteDebounced)}&limit=8`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        setClienteResultados(Array.isArray(d) ? d : []);
        if ((Array.isArray(d) ? d : []).length > 0 && clienteInputRef.current) {
          const rect = clienteInputRef.current.getBoundingClientRect();
          setDropRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
        setClienteDropOpen(true);
      })
      .catch(() => setClienteResultados([]))
      .finally(() => setClienteBuscando(false));
  }, [clienteDebounced, clienteSelecionado]);

  // ── Carregar vendas quando cliente é selecionado ──────────────────────────
  async function handleClienteSelect(c: Cliente) {
    setClienteSelecionado(c);
    setClienteBusca(""); setClienteDropOpen(false); setClienteResultados([]);
    setLoadingVendas(true);
    try {
      const r = await fetch(`/api/vendas/por-cliente/${c.id}`);
      if (r.ok) setVendas(await r.json());
      else setVendas([]);
    } catch { setVendas([]); }
    finally { setLoadingVendas(false); setStep(1); }
  }

  // ── Carregar itens quando venda é selecionada ─────────────────────────────
  async function handleVendaSelect(v: Venda) {
    setVendaSelecionada(v);
    setLoadingItens(true);
    try {
      const r = await fetch(`/api/vendas/${v.id}`);
      if (r.ok) {
        const data = await r.json();
        setItensVenda(data.itens ?? []);
      }
    } catch { setItensVenda([]); }
    finally { setLoadingItens(false); setStep(2); }
  }

  // ── Carregar tipos de serviço ao chegar no step 3 ─────────────────────────
  useEffect(() => {
    if (step !== 3) return;
    setLoadingTipos(true);
    fetch("/api/tipos-servico")
      .then(r => r.ok ? r.json() : { tipos: [] })
      .then(d => setTiposServico(d.tipos ?? []))
      .catch(() => setTiposServico([]))
      .finally(() => setLoadingTipos(false));
  }, [step]);

  // ── Toggle item selecionado ───────────────────────────────────────────────
  function toggleItem(id: number) {
    setItensSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // ── Toggle tipo serviço ───────────────────────────────────────────────────
  function toggleTipo(id: number) {
    setTiposSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // ── IA — validação do peso na balança ────────────────────────────────────
  // Aceita o arquivo diretamente para poder ser chamada antes do estado atualizar
  async function validarComIA(fileArg?: File, pesoArg?: string) {
    const fileToUse  = fileArg  ?? fotoBalanca?.file;
    const pesoStr    = pesoArg  ?? pesoDigitado;
    if (!fileToUse || !pesoStr) return;

    const peso = parseFloat(pesoStr.replace(",", "."));
    if (isNaN(peso) || peso <= 0) return;

    setIaStatus("uploading"); setIaMensagem("Enviando foto...");
    setErro(null);
    try {
      // 1. Upload da foto para storage
      const base64 = await compressImage(fileToUse);
      const uploadR = await fetch("/api/ordens/upload-arquivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket:      "ordem-fotos",
          path:        `${tipoOrdem}/${userId}_${Date.now()}_balanca.jpg`,
          base64,
          contentType: "image/jpeg",
        }),
      });
      if (!uploadR.ok) throw new Error("Erro no upload da foto");
      const { path: storagePath } = await uploadR.json() as { path: string };
      setFotoBalancaPath(storagePath);

      // 2. Validar peso com IA
      setIaStatus("validating"); setIaMensagem("Analisando com IA...");
      const formData = new FormData();
      formData.append("file", fileToUse);
      formData.append("tipo", "metal");
      formData.append("peso", String(peso));
      const iaR   = await fetch("/api/pcp/validar-peso", { method: "POST", body: formData });
      const iaData = await iaR.json() as { match: boolean; mensagem: string; peso_balanca: number | null };

      if (iaData.match) {
        setIaStatus("ok");
        setIaMensagem(iaData.mensagem);
      } else {
        setIaStatus("erro");
        setIaMensagem(iaData.mensagem ?? `Balança lida: ${iaData.peso_balanca ?? "?"} g — verifique o peso`);
      }
    } catch (e) {
      setIaStatus("erro");
      setIaMensagem(e instanceof Error ? e.message : "Erro na validação");
    }
  }

  // ── Foto balança — auto-dispara IA se peso já digitado ────────────────────
  async function handleFotoBalancaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fotoBalanca) URL.revokeObjectURL(fotoBalanca.preview);
    setFotoBalanca({ file, preview: URL.createObjectURL(file) });
    setFotoBalancaPath(null);
    setIaStatus("idle"); setIaMensagem("");

    // Auto-disparo: peso já preenchido → validar imediatamente
    const peso = parseFloat(pesoDigitado.replace(",", "."));
    if (!isNaN(peso) && peso > 0) {
      await validarComIA(file, pesoDigitado);
    }
  }

  // ── Peso digitado — auto-dispara IA se foto já selecionada ───────────────
  // (via useEffect com debounce aplicado antes da chamada)
  const pesoDebounced = useDebounce(pesoDigitado, 800);
  useEffect(() => {
    if (!fotoBalanca || !pesoDebounced) return;
    const peso = parseFloat(pesoDebounced.replace(",", "."));
    if (isNaN(peso) || peso <= 0) return;
    // Só re-valida se estava idle (não re-valida se já ok ou em progresso)
    if (iaStatus !== "idle") return;
    validarComIA(fotoBalanca.file, pesoDebounced);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesoDebounced]);

  // ── Upload vídeo (máx. 30s) ───────────────────────────────────────────────
  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = 100 * 1024 * 1024; // 100 MB
    if (file.size > maxBytes) { setErro("Vídeo muito grande. Máximo 100 MB."); return; }

    // Validar duração (máx. 30s)
    const objUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.onloadedmetadata = () => {
      if (tempVideo.duration > 30) {
        URL.revokeObjectURL(objUrl);
        setErro(`Vídeo tem ${Math.round(tempVideo.duration)}s — máximo permitido é 30 segundos.`);
        return;
      }
      if (video) URL.revokeObjectURL(video.url);
      const ext = file.name.split(".").pop() ?? "mp4";
      setVideo({ blob: file, url: objUrl, ext });
      setErro(null);
    };
    tempVideo.onerror = () => {
      URL.revokeObjectURL(objUrl);
      // Se não conseguiu ler metadata, aceita o arquivo mesmo assim
      if (video) URL.revokeObjectURL(video.url);
      const ext = file.name.split(".").pop() ?? "mp4";
      setVideo({ blob: file, url: URL.createObjectURL(file), ext });
    };
    tempVideo.src = objUrl;
  }

  // ── Fotos adicionais ──────────────────────────────────────────────────────
  async function handleFotosAdicionalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const novos = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setFotosAdicional(prev => [...prev, ...novos]);
    e.target.value = "";
  }

  function removerFotoAdicional(idx: number) {
    setFotosAdicional(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // ── Ir para step 4 (validar step 3 + buscar próximo número) ──────────────
  async function irParaRevisao() {
    if (tiposSelecionados.length === 0) { setErro("Selecione pelo menos um tipo de serviço."); return; }
    const outrosId = tiposServico.find(t => t.nome === "Outros")?.id;
    if (outrosId && tiposSelecionados.includes(outrosId) && !outrosDescricao.trim()) {
      setErro("Descreva o serviço em \"Outros\" antes de continuar."); return;
    }
    const peso = parseFloat(pesoDigitado.replace(",", "."));
    if (isNaN(peso) || peso <= 0)       { setErro("Informe o peso do metal externo."); return; }
    if (!fotoBalanca)                   { setErro("Anexe a foto da balança."); return; }
    if (iaStatus !== "ok")             { setErro("Aguarde a IA validar o peso da balança antes de continuar."); return; }

    setErro(null);
    setLoadingNumero(true);
    try {
      const r = await fetch("/api/ordens/proximo-numero");
      if (r.ok) {
        const d = await r.json() as { numero: string };
        setProximoNumero(d.numero);
      }
    } catch { /* sem número, tudo bem */ }
    finally { setLoadingNumero(false); }
    setStep(4);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!clienteSelecionado) { setErro("Selecione um cliente."); return; }
    if (!vendaSelecionada)   { setErro("Selecione uma venda."); return; }
    if (itensSelecionados.length === 0) { setErro("Selecione pelo menos um item."); return; }
    if (tiposSelecionados.length === 0) { setErro("Selecione pelo menos um tipo de serviço."); return; }
    const outrosIdSub = tiposServico.find(t => t.nome === "Outros")?.id;
    if (outrosIdSub && tiposSelecionados.includes(outrosIdSub) && !outrosDescricao.trim()) {
      setErro("Descreva o serviço em \"Outros\"."); return;
    }

    const peso = parseFloat(pesoDigitado.replace(",", "."));
    if (isNaN(peso) || peso <= 0) { setErro("Informe o peso do metal externo."); return; }
    if (!fotoBalancaPath) { setErro("Valide a foto da balança antes de continuar."); return; }
    if (iaStatus !== "ok") { setErro("A foto da balança não foi validada pela IA. Verifique o peso."); return; }

    setSalvando(true); setErro(null);

    try {
      // Upload vídeo se existir
      let videoPatch: string | null = null;
      if (video) {
        // Upload direto do browser → Supabase Storage (bypassa limite 10MB do Next.js)
        const supabase  = createSupabaseClient();
        const videoPath = `${tipoOrdem}/${userId}_${Date.now()}.${video.ext}`;
        const { data: vData, error: vError } = await supabase.storage
          .from("ordem-videos")
          .upload(videoPath, video.blob, {
            contentType: video.blob.type || "video/mp4",
            upsert: true,
          });
        if (vError) throw new Error(`Erro ao enviar vídeo: ${vError.message}`);
        videoPatch = vData.path;
      }

      // Fotos adicionais base64
      const fotosBase64: string[] = [];
      for (const f of fotosAdicional) {
        const b64 = await compressImage(f.file);
        if (b64) fotosBase64.push(b64);
      }

      // Itens da venda selecionados
      const itensSelecionadosData = itensVenda.filter(i => itensSelecionados.includes(i.id));

      // Montar detalhes_ordem: inclui descrição de "Outros" se presente
      const outrosIdBody = tiposServico.find(t => t.nome === "Outros")?.id;
      const detalhesOrdem = outrosIdBody && tiposSelecionados.includes(outrosIdBody) && outrosDescricao.trim()
        ? `Outros: ${outrosDescricao.trim()}`
        : undefined;

      const body = {
        tipo_ordem:         tipoOrdem,
        cliente_id:         clienteSelecionado.id,
        data_entrega:       dataEntrega || undefined,
        peso_metal_externo: peso,
        foto_peca_servico:  fotoBalancaPath,        // foto da balança = "foto_peca" no modelo
        video_observacao:   videoPatch ?? undefined,
        tipos_servico_ids:  tiposSelecionados,
        venda_id:           vendaSelecionada.id,
        venda_item_ids:     itensSelecionados,
        detalhes_ordem:     detalhesOrdem,
        fotos_base64:       fotosBase64.length > 0 ? fotosBase64 : undefined,
        itens: itensSelecionadosData.map(i => ({
          produto_id:    i.produto_id,
          quantidade:    i.quantidade,
          peso_estimado: null,
        })),
      };

      const { numero_ordem } = await apiFetch<{ id: number; numero_ordem: string }>(
        "/api/ordens",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );

      onSuccess?.(numero_ordem);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Erro inesperado ao criar ${cfg.label.toLowerCase()}`;
      setErro(msg);
      pushError(`Falha ao criar ${cfg.label}`, msg);
    } finally {
      setSalvando(false);
    }
  }, [
    clienteSelecionado, vendaSelecionada, itensSelecionados, itensVenda,
    tiposSelecionados, tiposServico, outrosDescricao,
    pesoDigitado, fotoBalancaPath, iaStatus,
    video, fotosAdicional, dataEntrega, userId, onSuccess, onClose, pushError, tipoOrdem, cfg,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "90dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div className="flex items-center gap-2">
            <Shield size={17} style={{ color: cfg.bannerColor }} />
            <h2 className="font-bold text-base" style={{ color: C.esmeralda }}>{cfg.titulo}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={17} className="text-gray-400" />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 pt-4">
          <Steps current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">

          {/* ─── STEP 0: CLIENTE ─────────────────────────────────────────── */}
          {step === 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Consultor(a): <strong style={{ color: C.esmeralda }}>{userName}</strong>
              </p>

              {clienteSelecionado ? (
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: C.bg, border: `1px solid ${C.cremeBorder}` }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: C.esmeralda }}>{clienteSelecionado.nome}</p>
                    {clienteSelecionado.cpf_cnpj && (
                      <p className="text-xs text-gray-400">{clienteSelecionado.cpf_cnpj}</p>
                    )}
                  </div>
                  <button onClick={() => { setClienteSelecionado(null); setVendas([]); setVendaSelecionada(null); setStep(0); }}
                    className="text-xs text-red-500 hover:underline ml-3">Trocar</button>
                </div>
              ) : (
                <div className="relative" ref={clienteRef}>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={clienteInputRef}
                      autoFocus
                      className="w-full border rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none"
                      style={{ borderColor: C.cremeBorder }}
                      placeholder="Nome, CPF ou telefone do cliente…"
                      value={clienteBusca}
                      onChange={e => setClienteBusca(e.target.value)}
                    />
                    {clienteBuscando && (
                      <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                    )}
                  </div>
                  {clienteDropOpen && clienteResultados.length === 0 && !clienteBuscando && (
                    <p className="text-xs text-gray-400 mt-2 text-center">Nenhum cliente encontrado.</p>
                  )}
                  {/* Dropdown via portal para não ser cortado pelo overflow do modal */}
                  {clienteDropOpen && clienteResultados.length > 0 && dropRect && typeof document !== "undefined" &&
                    createPortal(
                      <div
                        className="bg-white rounded-xl shadow-xl border overflow-hidden"
                        style={{
                          position: "fixed",
                          top:      dropRect.top,
                          left:     dropRect.left,
                          width:    dropRect.width,
                          zIndex:   9999,
                          borderColor: C.cremeBorder,
                          maxHeight: 260,
                          overflowY: "auto",
                        }}
                      >
                        {clienteResultados.map(c => (
                          <button
                            key={c.id}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b last:border-0 transition-colors"
                            style={{ borderColor: "#F3F4F6" }}
                            onMouseDown={e => { e.preventDefault(); handleClienteSelect(c); }}
                          >
                            <p className="text-sm font-medium" style={{ color: C.esmeralda }}>{c.nome}</p>
                            {c.cpf_cnpj && <p className="text-xs text-gray-400">{c.cpf_cnpj}</p>}
                          </button>
                        ))}
                      </div>,
                      document.body
                    )
                  }
                </div>
              )}

              {loadingVendas && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={18} className="animate-spin" style={{ color: C.esmeralda }} />
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 1: VENDAS ──────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Cliente: <strong style={{ color: C.esmeralda }}>{clienteSelecionado?.nome}</strong>
              </p>

              {loadingVendas ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin" style={{ color: C.esmeralda }} />
                </div>
              ) : vendas.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingBag size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-400">Nenhuma venda encontrada para este cliente.</p>
                  <button className="mt-3 text-xs underline" style={{ color: C.esmeralda }} onClick={() => setStep(0)}>
                    Trocar cliente
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {vendas.map(v => (
                    <li key={v.id}>
                      <button
                        className="w-full text-left rounded-xl p-3 transition-colors hover:opacity-90"
                        style={{
                          border: `1px solid ${vendaSelecionada?.id === v.id ? C.esmeralda : C.cremeBorder}`,
                          background: vendaSelecionada?.id === v.id ? "#F0FDF4" : C.bg,
                        }}
                        onClick={() => handleVendaSelect(v)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm" style={{ color: C.esmeralda }}>{v.numero_venda}</p>
                            <p className="text-xs text-gray-400">{fmtData(v.data_venda)} · {v.qtd_itens} iten(s)</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium" style={{ color: C.esmeralda }}>{fmtBRL(v.total_venda)}</p>
                            <p className="text-xs text-gray-400">{SITUACAO_LABEL[v.situacao] ?? v.situacao}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {loadingItens && (
                <div className="flex items-center justify-center py-4 mt-2">
                  <Loader2 size={18} className="animate-spin" style={{ color: C.esmeralda }} />
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: ITENS ───────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">
                Venda: <strong style={{ color: C.esmeralda }}>{vendaSelecionada?.numero_venda}</strong>
                <button className="ml-2 text-xs underline" style={{ color: "#6B7280" }} onClick={() => setStep(1)}>Trocar</button>
              </p>
              <p className="text-xs text-gray-400 mb-3">Selecione o(s) item(ns) com defeito:</p>

              {loadingItens ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin" style={{ color: C.esmeralda }} />
                </div>
              ) : itensVenda.length === 0 ? (
                <div className="text-center py-8">
                  <Package size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-400">Nenhum item encontrado nesta venda.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {itensVenda.map(item => {
                    const selecionado = itensSelecionados.includes(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          className="w-full text-left rounded-xl p-3 flex items-center gap-3 transition-colors"
                          style={{
                            border: `1px solid ${selecionado ? C.esmeralda : C.cremeBorder}`,
                            background: selecionado ? "#F0FDF4" : C.bg,
                          }}
                          onClick={() => toggleItem(item.id)}
                        >
                          <div style={{ color: selecionado ? C.esmeralda : "#D1D5DB" }}>
                            {selecionado
                              ? <CheckSquare size={16} />
                              : <Square size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate" style={{ color: C.esmeralda }}>
                              {item.nome_produto}
                            </p>
                            {item.sku && <p className="text-xs text-gray-400">{item.sku}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-500">Qtd: {item.quantidade}</p>
                            <p className="text-xs text-gray-400">{fmtBRL(item.preco_unitario)}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {itensSelecionados.length > 0 && (
                <button
                  className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: C.esmeralda, color: C.creme }}
                  onClick={() => setStep(3)}
                >
                  Continuar ({itensSelecionados.length} iten(s) selecionado(s))
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          )}

          {/* ─── STEP 3: DETALHES ────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">

              {/* Data de entrega */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <Calendar size={12} /> Data de Entrega
                </label>
                <input
                  type="date"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }}
                  value={dataEntrega}
                  onChange={e => setDataEntrega(e.target.value)}
                />
              </div>

              {/* Tipos de serviço */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">
                  Tipo de Serviço *
                </label>
                {loadingTipos ? (
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {tiposServico.map(t => {
                      const sel = tiposSelecionados.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left"
                          style={{
                            border: `1px solid ${sel ? C.esmeralda : C.cremeBorder}`,
                            background: sel ? "#F0FDF4" : C.bg,
                            color: sel ? C.esmeralda : "#374151",
                          }}
                          onClick={() => toggleTipo(t.id)}
                        >
                          <span style={{ color: sel ? C.esmeralda : "#D1D5DB" }}>
                            {sel ? <CheckSquare size={14} /> : <Square size={14} />}
                          </span>
                          {t.nome}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Campo extra quando "Outros" estiver selecionado */}
                {(() => {
                  const outrosId = tiposServico.find(t => t.nome === "Outros")?.id;
                  return outrosId && tiposSelecionados.includes(outrosId) ? (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-400 mb-1">
                        Descreva o serviço "Outros" *
                      </label>
                      <textarea
                        rows={2}
                        className="w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none"
                        style={{ borderColor: C.cremeBorder }}
                        placeholder="Ex: Polimento especial, gravação personalizada..."
                        value={outrosDescricao}
                        onChange={e => setOutrosDescricao(e.target.value)}
                      />
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Peso metal externo + foto balança */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Peso do Metal Externo (g) *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ borderColor: C.cremeBorder }}
                  placeholder="Ex: 2.50"
                  value={pesoDigitado}
                  onChange={e => {
                    setPesoDigitado(e.target.value);
                    setIaStatus("idle"); setIaMensagem("");
                    setFotoBalancaPath(null);
                  }}
                />

                {/* Foto da balança */}
                <div className="mt-2">
                  <label className="block text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                    <Camera size={11} /> Foto da balança *
                  </label>
                  {fotoBalanca ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fotoBalanca.preview}
                        alt="balança"
                        className="w-full h-36 object-cover rounded-xl"
                      />
                      <button
                        className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
                        onClick={() => {
                          URL.revokeObjectURL(fotoBalanca.preview);
                          setFotoBalanca(null); setFotoBalancaPath(null);
                          setIaStatus("idle"); setIaMensagem("");
                        }}
                      >
                        <Trash2 size={12} className="text-red-500" />
                      </button>

                      {/* IA status — validação automática */}
                      {iaStatus === "idle" && fotoBalanca && pesoDigitado && (
                        <div className="absolute bottom-2 left-2 right-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                          style={{ background: "#6B7280", color: "#fff" }}>
                          <Loader2 size={11} className="animate-spin" />
                          Aguardando...
                        </div>
                      )}
                      {(iaStatus === "uploading" || iaStatus === "validating") && (
                        <div className="absolute bottom-2 left-2 right-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                          style={{ background: "#1D4ED8", color: "#fff" }}>
                          <Loader2 size={11} className="animate-spin" />
                          {iaMensagem}
                        </div>
                      )}
                      {iaStatus === "ok" && (
                        <div className="absolute bottom-2 left-2 right-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                          style={{ background: "#059669", color: "#fff" }}>
                          <CheckCircle2 size={11} />
                          {iaMensagem}
                        </div>
                      )}
                      {iaStatus === "erro" && (
                        <button
                          className="absolute bottom-2 left-2 right-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                          style={{ background: "#DC2626", color: "#fff" }}
                          onClick={() => { setIaStatus("idle"); setIaMensagem(""); validarComIA(); }}
                        >
                          <AlertCircle size={11} />
                          {iaMensagem} — Re-validar
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="w-full h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 hover:opacity-80 transition-opacity"
                      style={{ borderColor: C.cremeBorder }}
                      onClick={() => fotoBalancaRef.current?.click()}
                    >
                      <Camera size={20} className="text-gray-400" />
                      <p className="text-xs text-gray-400">Tirar/selecionar foto da balança</p>
                    </button>
                  )}
                  <input
                    ref={fotoBalancaRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFotoBalancaChange}
                  />
                </div>
              </div>

              {/* Vídeo de observação (máx. 30s) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <Video size={12} /> Vídeo de Detalhes — máx. 30s (opcional)
                </label>
                {video ? (
                  <div className="rounded-xl overflow-hidden relative">
                    <video src={video.url} controls className="w-full max-h-40 rounded-xl" />
                    <button
                      className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"
                      onClick={() => { URL.revokeObjectURL(video.url); setVideo(null); }}
                    >
                      <Trash2 size={12} className="text-red-500" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {/* Gravar vídeo (câmera) */}
                    <button
                      className="flex-1 h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 hover:opacity-80 transition-opacity"
                      style={{ borderColor: C.cremeBorder }}
                      onClick={() => {
                        // Input com capture para abrir câmera direto
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "video/*";
                        input.capture = "environment";
                        input.onchange = (ev) => handleVideoUpload(ev as unknown as React.ChangeEvent<HTMLInputElement>);
                        input.click();
                      }}
                    >
                      <Video size={15} className="text-gray-400" />
                      <p className="text-[10px] text-gray-400">Gravar</p>
                    </button>
                    {/* Upload vídeo (galeria) */}
                    <button
                      className="flex-1 h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 hover:opacity-80 transition-opacity"
                      style={{ borderColor: C.cremeBorder }}
                      onClick={() => videoInputRef.current?.click()}
                    >
                      <Upload size={15} className="text-gray-400" />
                      <p className="text-[10px] text-gray-400">Enviar da galeria</p>
                    </button>
                  </div>
                )}
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVideoUpload}
                />
              </div>

              {/* Fotos adicionais */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <Camera size={12} /> Fotos Adicionais (opcional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {fotosAdicional.map((f, i) => (
                    <div key={i} className="relative w-16 h-16">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.preview} alt={`foto ${i+1}`} className="w-full h-full object-cover rounded-lg" />
                      <button
                        className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow"
                        onClick={() => removerFotoAdicional(i)}
                      >
                        <X size={10} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                  {fotosAdicional.length < 6 && (
                    <button
                      className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center hover:opacity-70"
                      style={{ borderColor: C.cremeBorder }}
                      onClick={() => fotosAdicionalRef.current?.click()}
                    >
                      <Camera size={16} className="text-gray-400" />
                    </button>
                  )}
                </div>
                <input
                  ref={fotosAdicionalRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={handleFotosAdicionalChange}
                />
              </div>
            </div>
          )}

          {/* ─── STEP 4: REVISÃO / CONFIRMAÇÃO ──────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Número da ordem */}
              <div
                className="rounded-2xl p-4 text-center"
                style={{ background: C.esmeralda }}
              >
                {loadingNumero ? (
                  <Loader2 size={18} className="animate-spin mx-auto" style={{ color: C.creme }} />
                ) : (
                  <>
                    <p className="text-xs font-medium mb-0.5" style={{ color: "#A7C4BB" }}>Número da Ordem</p>
                    <p className="text-3xl font-bold tracking-wide" style={{ color: C.creme }}>
                      {proximoNumero ?? "C-????"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#A7C4BB" }}>
                      {cfg.label}
                    </p>
                  </>
                )}
              </div>

              {/* Detalhes */}
              <div
                className="rounded-xl divide-y text-sm"
                style={{ border: `1px solid ${C.cremeBorder}` }}
              >
                {/* Consultor(a) */}
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Consultor(a)</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{userName}</span>
                </div>

                {/* Cliente */}
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Cliente</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>{clienteSelecionado?.nome}</span>
                </div>

                {/* Venda */}
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Venda / Pedido</span>
                  <span className="font-medium text-xs" style={{ color: C.esmeralda }}>#{vendaSelecionada?.numero_venda}</span>
                </div>

                {/* Itens */}
                <div className="px-4 py-2.5">
                  <p className="text-xs text-gray-400 mb-1.5">{cfg.itensLabel}</p>
                  <div className="space-y-1">
                    {itensVenda.filter(i => itensSelecionados.includes(i.id)).map(i => (
                      <div key={i.id} className="flex items-center justify-between">
                        <p className="text-xs font-medium" style={{ color: C.esmeralda }}>{i.nome_produto}</p>
                        <p className="text-xs text-gray-400">Qtd: {i.quantidade}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tipos de serviço */}
                <div className="px-4 py-2.5">
                  <p className="text-xs text-gray-400 mb-1.5">Tipo(s) de serviço</p>
                  <div className="flex flex-wrap gap-1">
                    {tiposServico.filter(t => tiposSelecionados.includes(t.id)).map(t => (
                      <span
                        key={t.id}
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "#F0FDF4", color: C.esmeralda }}
                      >
                        {t.nome}
                      </span>
                    ))}
                  </div>
                  {/* Descrição "Outros" na revisão */}
                  {(() => {
                    const outrosId = tiposServico.find(t => t.nome === "Outros")?.id;
                    return outrosId && tiposSelecionados.includes(outrosId) && outrosDescricao.trim() ? (
                      <p className="text-xs mt-1.5 italic" style={{ color: "#6B7280" }}>
                        Outros: {outrosDescricao.trim()}
                      </p>
                    ) : null;
                  })()}
                </div>

                {/* Data de entrega */}
                {dataEntrega && (
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-gray-400">Data de entrega</span>
                    <span className="font-medium text-xs" style={{ color: C.esmeralda }}>
                      {new Date(dataEntrega + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}

                {/* Peso metal externo */}
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-gray-400">Metal externo</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-xs" style={{ color: C.esmeralda }}>
                      {pesoDigitado.replace(",", ".")} g
                    </span>
                    <CheckCircle2 size={12} style={{ color: "#059669" }} />
                  </div>
                </div>

                {/* Foto balança */}
                {fotoBalanca && (
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Foto balança</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fotoBalanca.preview}
                      alt="balança"
                      className="w-14 h-10 object-cover rounded-lg"
                    />
                  </div>
                )}

                {/* Vídeo */}
                {video && (
                  <div className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-xs text-gray-400">Vídeo</span>
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: C.esmeralda }}>
                      <Video size={12} /> Anexado
                    </span>
                  </div>
                )}

                {/* Fotos adicionais */}
                {fotosAdicional.length > 0 && (
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-gray-400 mb-1.5">Fotos adicionais</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {fotosAdicional.map((f, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={f.preview} alt="" className="w-12 h-10 object-cover rounded-lg" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          {erro && (
            <p className="text-xs text-red-500 mb-3 flex items-center gap-1">
              <AlertCircle size={12} /> {erro}
            </p>
          )}

          <div className="flex gap-2">
            {step > 0 && (
              <button
                className="flex-none px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "#F3F4F6", color: "#374151" }}
                onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2 | 3 | 4)}
                disabled={salvando}
              >
                Voltar
              </button>
            )}

            {step < 3 && step !== 0 && (
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: C.esmeralda, color: C.creme }}
                onClick={() => {
                  if (step === 1 && !vendaSelecionada) { setErro("Selecione uma venda."); return; }
                  if (step === 2 && itensSelecionados.length === 0) { setErro("Selecione pelo menos um item."); return; }
                  setErro(null);
                  setStep((s) => (s + 1) as 0 | 1 | 2 | 3 | 4);
                }}
              >
                Continuar
              </button>
            )}

            {/* Step 3 → vai para revisão */}
            {step === 3 && (() => {
              const iaOk = iaStatus === "ok";
              const iaBusy = iaStatus === "uploading" || iaStatus === "validating";
              const bloqueado = !iaOk || loadingNumero || iaBusy;
              return (
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-opacity"
                  style={{
                    background: bloqueado ? "#9CA3AF" : C.esmeralda,
                    color: C.creme,
                    cursor: bloqueado ? "not-allowed" : "pointer",
                  }}
                  onClick={irParaRevisao}
                  disabled={bloqueado}
                >
                  {(loadingNumero || iaBusy) ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  {loadingNumero ? "Carregando…" : iaBusy ? "Validando IA…" : !iaOk && fotoBalanca ? "Aguardando IA…" : "Revisar Ordem"}
                </button>
              );
            })()}

            {/* Step 4 → confirmar e criar */}
            {step === 4 && (
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: cfg.bannerColor, color: "#fff", opacity: salvando ? 0.7 : 1 }}
                onClick={handleSubmit}
                disabled={salvando}
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                {salvando ? "Criando ordem…" : "Confirmar e Criar Ordem"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
