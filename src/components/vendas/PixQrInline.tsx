"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import {
  QrCode, Copy, Check, Loader2, MessageCircle, CheckCircle, AlertTriangle, RefreshCw,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// PixQrInline — QR Code PIX NATIVO via Mercado Pago Payment API
//
// Usa o endpoint /criar-pix (não /criar-link) que gera um PIX verdadeiro
// no formato EMV/BR Code do Banco Central, escaneável em qualquer app
// bancário (diferente do QR da Preference que vai pro checkout MP).
//
// Exibe:
//   - Imagem do QR Code (PNG base64 retornado direto do MP)
//   - Código copia-e-cola (string EMV)
//   - Botões copiar e WhatsApp
//   - Polling pra detectar confirmação automática via webhook
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface Props {
  /** vendaId da venda se já existe. Se null, usa obterVendaId para criar rascunho primeiro. */
  vendaId: number | null;
  /** Label legível ("V-00123") ou "Nova" quando ainda não salvou */
  numeroVenda: string;
  valor: number;
  /**
   * Quando vendaId é null, o componente chama essa função no clique do "Gerar QR"
   * pra salvar a venda como rascunho e obter o vendaId real. Deve retornar o id
   * criado ou lançar erro se a validação falhar.
   */
  obterVendaId?: () => Promise<{ id: number; numero_venda: string }>;
  /** Callback quando webhook MP detecta pagamento confirmado. Recebe o vendaId efetivo. */
  onPagamentoConfirmado: (vendaId: number) => void;
  /** Se true, não mostra o componente (quando venda já tem pag MP confirmado) */
  ocultar?: boolean;
  /** Endpoint alternativo. Default: "criar-pix". Use "criar-pix-instore" para taxa zero. */
  endpoint?: "criar-pix" | "criar-pix-instore";
  /** ID do pagamento_venda pré-criado (Múltiplas). Garante que cada widget use seu próprio registro. */
  pagamentoId?: number;
}

export default function PixQrInline({
  vendaId: vendaIdProp,
  numeroVenda: numeroVendaProp,
  valor,
  obterVendaId,
  onPagamentoConfirmado,
  ocultar,
  endpoint = "criar-pix",
  pagamentoId,
}: Props) {
  // vendaId "efetivo" — inicialmente o prop, mas pode ser atualizado quando
  // o componente salva rascunho via obterVendaId.
  const [vendaIdEfetivo, setVendaIdEfetivo] = useState<number | null>(vendaIdProp);
  const [numeroVenda, setNumeroVenda] = useState(numeroVendaProp);

  // Mantém sincronizado se o prop mudar (ex: navegou pra outra venda)
  useEffect(() => { setVendaIdEfetivo(vendaIdProp); }, [vendaIdProp]);
  useEffect(() => { setNumeroVenda(numeroVendaProp); }, [numeroVendaProp]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // pixCode = string EMV "copia e cola" (ex: "00020101021...")
  const [pixCode, setPixCode] = useState<string | null>(null);
  // pixQrBase64 = imagem PNG direto do MP (sem precisar gerar local)
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pago, setPago] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Polling de confirmação ──────────────────────────────────────────────
  const iniciarPolling = useCallback((idParaMonitorar: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/vendas/${idParaMonitorar}`);
        if (!res.ok) return;
        const data = await res.json();
        const temMpConfirmado = (data.pagamentos ?? []).some(
          (p: { gateway?: string; status: string }) =>
            (p.gateway === "Mercado Pago Online" || p.gateway === "Mercado Pago Point" ||
             p.gateway === "Mercado Pago Pix" || p.gateway === "Mercado Pago Pix In-Store")
            && p.status === "confirmado"
        );
        if (data.situacao === "concluido" || data.situacao === "aprovado" || temMpConfirmado) {
          setPago(true);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setTimeout(() => onPagamentoConfirmado(idParaMonitorar), 2500);
        }
      } catch { /* ignora erros de rede temporários */ }
    }, 4000);
  }, [onPagamentoConfirmado]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ─── Ações ────────────────────────────────────────────────────────────────
  async function gerarQr() {
    setLoading(true);
    setError(null);
    try {
      // Se ainda não tem vendaId (caso Nova Venda), salva rascunho primeiro
      let idParaUsar = vendaIdEfetivo;
      if (idParaUsar == null) {
        if (!obterVendaId) {
          throw new Error("Venda ainda não foi salva e não há callback de criação");
        }
        const vendaCriada = await obterVendaId();
        idParaUsar = vendaCriada.id;
        setVendaIdEfetivo(idParaUsar);
        setNumeroVenda(vendaCriada.numero_venda);
      }

      // Usa o endpoint criar-pix (Payment API, PIX nativo) em vez do
      // criar-link (Preference, checkout MP).
      const res = await fetch(`/api/vendas/${idParaUsar}/mercado-pago/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor, ...(pagamentoId ? { pagamento_id: pagamentoId } : {}) }),
      });

      // Detecta se resposta é HTML (404/500 do Next) antes de tentar parsear JSON
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        if (res.status === 404) {
          throw new Error(
            "Endpoint /criar-pix não encontrado no servidor. O deploy dessa versão ainda não foi publicado. Aguarde ou faça o merge da branch."
          );
        }
        const raw = await res.text();
        throw new Error(`Servidor retornou ${res.status} com HTML: ${raw.slice(0, 120)}`);
      }

      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao gerar QR Code Pix");
      setPixCode(body.qr_code);
      // In-Store API não retorna base64 — gera client-side
      if (body.qr_code_base64) {
        setPixQrBase64(body.qr_code_base64);
      } else if (body.qr_code) {
        const dataUrl = await QRCode.toDataURL(body.qr_code, {
          width: 220, margin: 1,
          color: { dark: C.esmeralda, light: "#ffffff" },
        });
        setPixQrBase64(dataUrl.replace(/^data:image\/\w+;base64,/, ""));
      }
      iniciarPolling(idParaUsar);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function regenerar() {
    setPixCode(null);
    setPixQrBase64(null);
    setPago(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    await gerarQr();
  }

  function copiarPix() {
    if (!pixCode) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pixCode).catch(() => copiarFallback(pixCode));
    } else {
      copiarFallback(pixCode);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function copiarFallback(texto: string) {
    const el = document.createElement("textarea");
    el.value = texto;
    el.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  function abrirWhats() {
    if (!pixCode) return;
    const msg = `Olá! Segue o código Pix da sua compra na Alisson Joias (Venda ${numeroVenda}, ${fmt(valor)}).\n\nCopie e cole no seu app bancário:\n\n${pixCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  if (ocultar) return null;

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
    >
      <div className="flex items-center gap-2 mb-3">
        <QrCode size={14} style={{ color: C.esmeralda }} />
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.esmeralda }}>
          QR Code Pix — Mercado Pago
        </p>
      </div>

      {/* Erro */}
      {error && (
        <div
          className="flex items-start gap-2 p-3 mb-3 rounded-lg text-xs"
          style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Estado: ainda não gerou */}
      {!pixCode && !loading && !pago && (
        <>
          <p className="text-xs mb-3" style={{ color: "#6B7280" }}>
            Gera um QR Code Pix do Mercado Pago pra cliente pagar no app bancário.
            Quando o pagamento cair, a venda é <b>concluída automaticamente</b>.
          </p>
          <button
            onClick={gerarQr}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <QrCode size={13} /> Gerar QR Code Pix ({fmt(valor)})
          </button>
        </>
      )}

      {/* Estado: gerando */}
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-sm" style={{ color: "#6B7280" }}>
          <Loader2 size={15} className="animate-spin" /> Gerando QR Code...
        </div>
      )}

      {/* Estado: gerado e esperando pagamento */}
      {pixCode && !pago && !loading && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-4">
            {/* QR Code (PNG base64 direto do Mercado Pago) */}
            {pixQrBase64 && (
              <div
                className="flex-shrink-0 self-center p-2 rounded-lg"
                style={{ backgroundColor: "#fff", border: `1px solid ${C.cremeBorder}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${pixQrBase64}`}
                  alt="QR Code Pix"
                  width={220}
                  height={220}
                />
              </div>
            )}

            {/* Ações */}
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <p className="text-xs mb-1" style={{ color: "#6B7280" }}>
                Escaneie o QR Code no app do banco <b>ou</b> copie o código Pix:
              </p>

              <div
                className="flex items-center gap-2 p-2 rounded-lg border text-xs break-all"
                style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: "#fff" }}
              >
                <span className="flex-1 font-mono">{pixCode.slice(0, 36)}...</span>
                <button
                  onClick={copiarPix}
                  className="p-1.5 rounded hover:bg-stone-100"
                  style={{ color: C.esmeralda }}
                  title="Copiar código Pix"
                >
                  {copiado ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>

              <button
                onClick={abrirWhats}
                className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#25D366", color: "#fff" }}
              >
                <MessageCircle size={13} /> Enviar Pix pelo WhatsApp
              </button>

              <button
                onClick={regenerar}
                className="flex items-center justify-center gap-1.5 py-1.5 text-[11px]"
                style={{ color: "#6B7280" }}
                title="Gerar novo link"
              >
                <RefreshCw size={11} /> Regenerar link
              </button>
            </div>
          </div>

          <div
            className="flex items-center justify-center gap-2 py-2 text-xs border-t"
            style={{ color: "#6B7280", borderColor: C.cremeBorder }}
          >
            <Loader2 size={12} className="animate-spin" />
            Aguardando confirmação do pagamento...
          </div>
        </div>
      )}

      {/* Estado: pago */}
      {pago && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm font-semibold" style={{ color: "#059669" }}>
          <CheckCircle size={18} /> Pagamento confirmado! Atualizando venda...
        </div>
      )}
    </div>
  );
}
