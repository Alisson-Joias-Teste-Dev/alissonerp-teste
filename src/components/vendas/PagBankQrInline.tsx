/**
 * PagBankQrInline — QR Code PIX NATIVO via PagBank Orders API
 *
 * Usa o endpoint /pagbank/criar-pix que gera um PIX via Orders API PagBank.
 * O QR code EMV é escaneável em qualquer app bancário.
 *
 * Exibe:
 *   - Imagem do QR Code (PNG base64 do PagBank)
 *   - Código copia-e-cola (string EMV)
 *   - Botões copiar e WhatsApp
 *   - Contagem regressiva de expiração
 *   - Polling para detectar confirmação automática via webhook
 *
 * Gateway: "PagBank Pix"
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import {
  QrCode, Copy, Check, Loader2, MessageCircle, CheckCircle, AlertTriangle, RefreshCw,
} from "lucide-react";

const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface Props {
  vendaId: number | null;
  numeroVenda: string;
  valor: number;
  obterVendaId?: () => Promise<{ id: number; numero_venda: string }>;
  onPagamentoConfirmado: (vendaId: number) => void;
  ocultar?: boolean;
  pagamentoId?: number;
}

export default function PagBankQrInline({
  vendaId: vendaIdProp,
  numeroVenda: numeroVendaProp,
  valor,
  obterVendaId,
  onPagamentoConfirmado,
  ocultar,
  pagamentoId,
}: Props) {
  const [vendaIdEfetivo, setVendaIdEfetivo] = useState<number | null>(vendaIdProp);
  const [numeroVenda, setNumeroVenda] = useState(numeroVendaProp);

  useEffect(() => { setVendaIdEfetivo(vendaIdProp); }, [vendaIdProp]);
  useEffect(() => { setNumeroVenda(numeroVendaProp); }, [numeroVendaProp]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [qrFallback, setQrFallback] = useState(false);
  const [expiraEm, setExpiraEm] = useState<Date | null>(null);
  const [expirado, setExpirado] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [tempoRestante, setTempoRestante] = useState<string>("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Gera QR code data URL a partir do base64 (com fallback para geração local)
  useEffect(() => {
    if (pixQrBase64 && !qrFallback) {
      setPixQrDataUrl(`data:image/png;base64,${pixQrBase64}`);
    } else if (pixCode) {
      // Fallback: gera QR code localmente do EMV string
      QRCode.toDataURL(pixCode, { width: 240, margin: 1 })
        .then((url) => setPixQrDataUrl(url))
        .catch(console.error);
    }
  }, [pixCode, pixQrBase64, qrFallback]);

  // Contagem regressiva de expiração
  useEffect(() => {
    if (!expiraEm) return;
    const update = () => {
      const agora = new Date();
      const diff = expiraEm.getTime() - agora.getTime();
      if (diff <= 0) {
        setTempoRestante("Expirado");
        setExpirado(true);
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }
      const min = Math.floor(diff / 60000);
      const seg = Math.floor((diff % 60000) / 1000);
      setTempoRestante(`${min}:${String(seg).padStart(2, "0")}`);
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiraEm]);

  // Cleanup polling ao desmontar
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Polling de confirmação
  const iniciarPolling = useCallback((vendaId: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/vendas/${vendaId}/pagbank/checar-point`);
        const data = await res.json();
        if (data?.confirmados > 0) {
          setConfirmado(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          onPagamentoConfirmado(vendaId);
        }
      } catch {
        // Silencia erros de polling
      }
    }, 5000);
  }, [onPagamentoConfirmado]);

  // Gerar PIX
  const gerarPix = async () => {
    setError(null);
    setLoading(true);

    try {
      let vId = vendaIdEfetivo;
      let nVenda = numeroVenda;

      // Se não tem vendaId, cria rascunho primeiro
      if (!vId && obterVendaId) {
        const result = await obterVendaId();
        vId = result.id;
        nVenda = result.numero_venda;
        setVendaIdEfetivo(vId);
        setNumeroVenda(nVenda);
      }

      if (!vId) {
        setError("Salve a venda primeiro para gerar o PIX");
        setLoading(false);
        return;
      }

      const body: Record<string, unknown> = { valor, expira_em_minutos: 30 };
      if (pagamentoId) body.pagamento_id = pagamentoId;

      const res = await fetch(`/api/vendas/${vId}/pagbank/criar-pix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX PagBank");

      setPixCode(data.qr_code || null);
      if (data.qr_code_base64) setPixQrBase64(data.qr_code_base64);
      if (data.expira_em_minutos) {
        setExpiraEm(new Date(Date.now() + data.expira_em_minutos * 60000));
      }

      iniciarPolling(vId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar PIX");
    } finally {
      setLoading(false);
    }
  };

  // Copiar EMV
  const copiarPix = async () => {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: seleciona o texto
      const ta = document.createElement("textarea");
      ta.value = pixCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Compartilhar via WhatsApp
  const compartilharWhatsApp = () => {
    const msg = pixCode
      ? `Pague via PIX (PagBank):\n\n${pixCode}`
      : `Link de pagamento PagBank para ${numeroVenda}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (ocultar) return null;

  // Estado: PIX confirmado
  if (confirmado) {
    return (
      <div className="rounded-lg border p-4 text-center space-y-2" style={{ borderColor: "#22c55e", backgroundColor: "#f0fdf4" }}>
        <CheckCircle className="w-8 h-8 mx-auto" style={{ color: "#22c55e" }} />
        <p className="text-sm font-medium" style={{ color: "#166534" }}>
          PIX PagBank confirmado — R$ {fmt(valor)}
        </p>
      </div>
    );
  }

  // Estado: PIX gerado
  if (pixCode) {
    return (
      <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: "#fafafa" }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: C.esmeralda }}>
            PIX PagBank — {fmt(valor)}
          </span>
          {tempoRestante && !expirado && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: C.creme, color: "#92400e" }}>
              Expira em {tempoRestante}
            </span>
          )}
          {expirado && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>
              Expirado
            </span>
          )}
        </div>

        {pixQrDataUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pixQrDataUrl}
              alt="QR Code PIX PagBank"
              className="rounded-lg border"
              style={{ width: 200, height: 200, borderColor: C.cremeBorder }}
              onError={() => {
                if (!qrFallback) setQrFallback(true);
              }}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={copiarPix}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{
              borderColor: C.cremeBorder,
              color: copied ? "#166534" : C.esmeralda,
              backgroundColor: copied ? "#dcfce7" : C.cremeBg,
            }}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copiado!" : "Copiar PIX"}
          </button>
          <button
            onClick={compartilharWhatsApp}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: C.cremeBorder, color: "#25D366", backgroundColor: C.cremeBg }}
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>
        </div>

        {expirado && (
          <button
            onClick={() => {
              setPixCode(null);
              setPixQrBase64(null);
              setPixQrDataUrl(null);
              setExpirado(false);
              setError(null);
              gerarPix();
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
          >
            <RefreshCw className="w-4 h-4" />
            Gerar novo PIX
          </button>
        )}
      </div>
    );
  }

  // Estado: erro
  if (error) {
    return (
      <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: "#fca5a5", backgroundColor: "#fef2f2" }}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#dc2626" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#991b1b" }}>Erro no PIX PagBank</p>
            <p className="text-xs" style={{ color: "#b91c1c" }}>{error}</p>
          </div>
        </div>
        <button
          onClick={() => { setError(null); gerarPix(); }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
          style={{ borderColor: "#fca5a5", color: "#dc2626" }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Estado: botão gerar
  return (
    <button
      onClick={gerarPix}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors"
      style={{
        backgroundColor: C.esmeralda,
        color: "#fff",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <QrCode className="w-4 h-4" />
      )}
      {loading ? "Gerando PIX PagBank..." : "Gerar PIX PagBank"}
    </button>
  );
}
