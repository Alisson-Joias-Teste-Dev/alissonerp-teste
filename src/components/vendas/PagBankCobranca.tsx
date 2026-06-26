/**
 * PagBankCobranca — Modal de cobrança via PagBank
 *
 * Oferece duas opções:
 *   1. Link de Pagamento — gera um link PagBank para o cliente pagar com cartão
 *   2. Maquininha Moderninha — envia intenção para terminal físico (futuro)
 *
 * Exibe QR Code do link, botões copiar/WhatsApp, polling de confirmação.
 *
 * Gateway: "PagBank Online" (link) / "PagBank Point" (maquininha)
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Link as LinkIcon,
  Smartphone,
  Copy,
  Check,
  Loader2,
  X,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";

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

interface PointDevice {
  id: number;
  device_id: string;
  nome_legivel: string;
  vendedor_id: number | null;
  is_reserva: boolean;
  ativo: boolean;
  loja: string | null;
}

interface Props {
  vendaId: number;
  numeroVenda: string;
  valorSugerido: number;
  situacao: string;
  bloqueado: boolean;
  onPagamentoConfirmado?: () => void;
}

type Modal = null | "link" | "maquininha";

export default function PagBankCobranca({
  vendaId,
  numeroVenda,
  valorSugerido,
  situacao,
  bloqueado,
  onPagamentoConfirmado,
}: Props) {
  const { role } = useAuth();
  const adminOuGerente = isFullAccess(role);

  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link online
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Maquininha
  const [devices, setDevices] = useState<PointDevice[]>([]);
  const [deviceSelecionado, setDeviceSelecionado] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [intentAtiva, setIntentAtiva] = useState<{
    pagamento_id: number;
    device_id: string;
    device_nome: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Reserva (futuro: implementar fluxo completo de reserva de maquininha)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [reservaLoading] = useState(false);

  // Polling
  const [pago, setPago] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const visivel = !bloqueado && ["rascunho", "aprovado"].includes(situacao) && valorSugerido > 0.01;

  // Carregar dispositivos ao abrir maquininha
  const carregarDevices = useCallback(async () => {
    if (adminOuGerente) {
      try {
        const res = await fetch("/api/pagbank/devices");
        if (res.ok) {
          const data = await res.json();
          setDevices(data.devices || []);
          if (data.devices?.length === 1) setDeviceSelecionado(data.devices[0].device_id);
        }
      } catch {
        setError("Erro ao listar maquininhas PagBank");
      }
    }
  }, [adminOuGerente]);

  // Limpa polling ao desmontar
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Countdown da maquininha
  useEffect(() => {
    if (!intentAtiva || countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [intentAtiva, countdown]);

  useEffect(() => {
    if (countdown === 0 && intentAtiva) {
      // Timeout sem pagamento — cancela intent
      cancelarIntent();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // Polling de confirmação
  const iniciarPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/vendas/${vendaId}/pagbank/checar-point`);
        const data = await res.json();
        if (data?.confirmados > 0) {
          setPago(true);
          if (pollRef.current) clearInterval(pollRef.current);
          onPagamentoConfirmado?.();
        }
      } catch {
        // Silencia erros de polling
      }
    }, 5000);
  }, [vendaId, onPagamentoConfirmado]);

  // ─── Criar Link de Pagamento ──────────────────────────────────────────────
  const criarLink = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/pagbank/criar-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: valorSugerido, installments: parcelas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar link PagBank");

      setPaymentUrl(data.payment_url || null);

      if (data.payment_url) {
        // Gera QR code do link
        const qr = await QRCode.toDataURL(data.payment_url, {
          width: 240,
          margin: 1,
        });
        setQrDataUrl(qr);
      }

      iniciarPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar link PagBank");
    } finally {
      setLoading(false);
    }
  };

  // ─── Copiar link ──────────────────────────────────────────────────────────
  const copiarLink = async () => {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = paymentUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  // ─── WhatsApp ─────────────────────────────────────────────────────────────
  const compartilharWhatsApp = () => {
    const msg = paymentUrl
      ? `Olá! Segue o link para pagamento da ${numeroVenda}:\n\n${paymentUrl}\n\nValor: ${fmt(valorSugerido)}`
      : `Link de pagamento PagBank para ${numeroVenda}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ─── Criar intent maquininha ──────────────────────────────────────────────
  const criarIntent = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/pagbank/criar-intent-point`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceSelecionado,
          valor: valorSugerido,
          installments: parcelas,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar intent PagBank");

      setIntentAtiva({
        pagamento_id: data.pagamento_id,
        device_id: deviceSelecionado,
        device_nome: devices.find((d) => d.device_id === deviceSelecionado)?.nome_legivel || "Moderninha",
      });
      setCountdown(120); // 2 minutos
      iniciarPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar para maquininha");
    } finally {
      setLoading(false);
    }
  };

  // ─── Cancelar intent ──────────────────────────────────────────────────────
  const cancelarIntent = async () => {
    if (!intentAtiva) return;
    try {
      await fetch(`/api/vendas/${vendaId}/pagbank/criar-intent-point`, {
        method: "DELETE",
      });
    } catch {
      // Silencia
    }
    setIntentAtiva(null);
    setCountdown(0);
  };

  if (!visivel) return null;

  // Pagamento já confirmado
  if (pago) {
    return (
      <div className="rounded-lg border p-3 text-center space-y-1" style={{ borderColor: "#22c55e", backgroundColor: "#f0fdf4" }}>
        <CheckCircle className="w-5 h-5 mx-auto" style={{ color: "#22c55e" }} />
        <p className="text-sm font-medium" style={{ color: "#166534" }}>
          Pagamento PagBank confirmado!
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Botões de ação */}
      <div className="flex gap-2">
        <button
          onClick={() => { setModal("link"); setError(null); }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: C.esmeralda, color: "#fff" }}
        >
          <LinkIcon className="w-4 h-4" />
          Link PagBank
        </button>
        {adminOuGerente && (
          <button
            onClick={() => { setModal("maquininha"); setError(null); carregarDevices(); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
          >
            <Smartphone className="w-4 h-4" />
            Maquininha
          </button>
        )}
      </div>

      {/* ─── Modal ─────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: C.esmeralda }}>
                {modal === "link" ? "Link de Pagamento PagBank" : "Maquininha PagBank"}
              </h3>
              <button
                onClick={() => {
                  setModal(null);
                  if (intentAtiva) cancelarIntent();
                }}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Valor */}
            <p className="text-sm" style={{ color: "#6B7280" }}>
              Cobrança: <strong>{fmt(valorSugerido)}</strong> — {numeroVenda}
            </p>

            {/* ─── Modal: Link ─────────────────────────────────────────────── */}
            {modal === "link" && !paymentUrl && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Parcelas</label>
                  <select
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>{n}x de {fmt(valorSugerido / n)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={criarLink}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: C.esmeralda, color: "#fff", opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                  {loading ? "Criando link..." : "Criar Link de Pagamento"}
                </button>
              </div>
            )}

            {modal === "link" && paymentUrl && (
              <div className="space-y-3">
                {qrDataUrl && (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR Code PagBank" className="rounded-lg border" style={{ width: 180, height: 180, borderColor: C.cremeBorder }} />
                  </div>
                )}
                <p className="text-xs text-center" style={{ color: "#6B7280" }}>
                  Escaneie o QR code ou compartilhe o link
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={copiarLink}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: C.cremeBorder, color: copiado ? "#166534" : C.esmeralda, backgroundColor: copiado ? "#dcfce7" : C.cremeBg }}
                  >
                    {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiado ? "Copiado!" : "Copiar link"}
                  </button>
                  <button
                    onClick={compartilharWhatsApp}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: C.cremeBorder, color: "#25D366", backgroundColor: C.cremeBg }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>
                </div>
                <button
                  onClick={() => { setPaymentUrl(null); setQrDataUrl(null); }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ color: C.esmeralda }}
                >
                  <RefreshCw className="w-3 h-3" />
                  Gerar novo link
                </button>
              </div>
            )}

            {/* ─── Modal: Maquininha ───────────────────────────────────────── */}
            {modal === "maquininha" && !intentAtiva && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Maquininha</label>
                  <select
                    value={deviceSelecionado}
                    onChange={(e) => setDeviceSelecionado(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <option value="">Selecione...</option>
                    {devices.filter((d) => d.ativo).map((d) => (
                      <option key={d.device_id} value={d.device_id}>
                        {d.nome_legivel} {d.loja ? `(${d.loja})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Parcelas</label>
                  <select
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>{n}x de {fmt(valorSugerido / n)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={criarIntent}
                  disabled={loading || !deviceSelecionado}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: C.esmeralda, color: "#fff", opacity: loading || !deviceSelecionado ? 0.7 : 1 }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {loading ? "Enviando..." : "Enviar para Maquininha"}
                </button>
              </div>
            )}

            {modal === "maquininha" && intentAtiva && (
              <div className="space-y-3 text-center">
                <div className="rounded-lg border p-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <Smartphone className="w-8 h-8 mx-auto mb-1" style={{ color: C.esmeralda }} />
                  <p className="text-sm font-medium" style={{ color: C.esmeralda }}>
                    Aguardando pagamento em {intentAtiva.device_nome}
                  </p>
                  <p className="text-xs" style={{ color: "#92400e" }}>
                    {countdown}s restantes
                  </p>
                </div>
                <button
                  onClick={cancelarIntent}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ color: "#dc2626" }}
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Erro */}
            {error && (
              <div className="rounded-lg border p-3" style={{ borderColor: "#fca5a5", backgroundColor: "#fef2f2" }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#dc2626" }} />
                  <p className="text-xs" style={{ color: "#991b1b" }}>{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
