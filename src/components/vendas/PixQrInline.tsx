"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  QrCode, Copy, Check, Loader2, MessageCircle, CheckCircle, AlertTriangle, RefreshCw,
} from "lucide-react";
import QRCode from "qrcode";

// ═══════════════════════════════════════════════════════════════════════════
// PixQrInline — QR Code Pix via Mercado Pago, inline no form de pagamento
//
// Usado dentro do VendaDetalheClient quando a vendedora seleciona "Pix"
// como forma de recebimento. Gera Preference MP, exibe QR + link, faz
// polling pra detectar confirmação automática via webhook.
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
  vendaId: number;
  numeroVenda: string;
  valor: number;
  /** Callback quando webhook MP detecta pagamento confirmado */
  onPagamentoConfirmado: () => void;
  /** Se true, não mostra o componente (quando venda já tem pag MP confirmado) */
  ocultar?: boolean;
}

export default function PixQrInline({
  vendaId,
  numeroVenda,
  valor,
  onPagamentoConfirmado,
  ocultar,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initPoint, setInitPoint] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pago, setPago] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Gera QR code do init_point quando criado ────────────────────────────
  useEffect(() => {
    if (!initPoint) { setQrDataUrl(null); return; }
    QRCode.toDataURL(initPoint, {
      width: 240,
      margin: 1,
      color: { dark: C.esmeralda, light: "#ffffff" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [initPoint]);

  // ─── Polling de confirmação ──────────────────────────────────────────────
  const iniciarPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/vendas/${vendaId}`);
        if (!res.ok) return;
        const data = await res.json();
        const temMpConfirmado = (data.pagamentos ?? []).some(
          (p: { gateway?: string; status: string }) =>
            (p.gateway === "Mercado Pago Online" || p.gateway === "Mercado Pago Point")
            && p.status === "confirmado"
        );
        if (data.situacao === "concluido" || temMpConfirmado) {
          setPago(true);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setTimeout(() => onPagamentoConfirmado(), 2500);
        }
      } catch { /* ignora erros de rede temporários */ }
    }, 4000);
  }, [vendaId, onPagamentoConfirmado]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ─── Ações ────────────────────────────────────────────────────────────────
  async function gerarQr() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/mercado-pago/criar-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao gerar QR Code");
      setInitPoint(body.init_point);
      iniciarPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function regenerar() {
    setInitPoint(null);
    setQrDataUrl(null);
    setPago(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    await gerarQr();
  }

  function copiarLink() {
    if (!initPoint) return;
    navigator.clipboard.writeText(initPoint);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function abrirWhats() {
    if (!initPoint) return;
    const msg = `Olá! Segue o link de pagamento da sua compra na Alisson Joias (Venda ${numeroVenda}, ${fmt(valor)}):\n\n${initPoint}\n\nAceita PIX ou cartão de crédito.`;
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
      {!initPoint && !loading && !pago && (
        <>
          <p className="text-xs mb-3" style={{ color: "#6B7280" }}>
            Gera um QR Code Pix do Mercado Pago para o cliente pagar via aplicativo bancário.
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
      {initPoint && !pago && !loading && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-4">
            {/* QR Code */}
            {qrDataUrl && (
              <div
                className="flex-shrink-0 self-center p-2 rounded-lg"
                style={{ backgroundColor: "#fff", border: `1px solid ${C.cremeBorder}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Code Pix" width={200} height={200} />
              </div>
            )}

            {/* Ações */}
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <p className="text-xs mb-1" style={{ color: "#6B7280" }}>
                Cliente pode pagar escaneando o QR Code ou pelo link:
              </p>

              <div
                className="flex items-center gap-2 p-2 rounded-lg border text-xs break-all"
                style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: "#fff" }}
              >
                <span className="flex-1 font-mono">{initPoint.slice(0, 42)}...</span>
                <button
                  onClick={copiarLink}
                  className="p-1.5 rounded hover:bg-stone-100"
                  style={{ color: C.esmeralda }}
                  title="Copiar link"
                >
                  {copiado ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>

              <button
                onClick={abrirWhats}
                className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#25D366", color: "#fff" }}
              >
                <MessageCircle size={13} /> Enviar pelo WhatsApp
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
