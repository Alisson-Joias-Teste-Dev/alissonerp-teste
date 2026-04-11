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

// ─── Tokens (alinhados com VendaDetalheClient) ───────────────────────────────
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
  operating_mode: string | null;
  loja: string | null;
}

interface Props {
  vendaId: number;
  numeroVenda: string;
  valorSugerido: number;      // total_venda - soma_confirmados
  situacao: string;            // pra decidir se exibe ou não
  bloqueado: boolean;
  onPagamentoConfirmado?: () => void; // callback quando polling detectar status=confirmado
  /** Ref para disparar polling externo quando um pagamento MP ativo está aguardando */
  vendaPolling: {
    pagamentoPendenteId: number | null;   // preference ou intent
    detectarConfirmacao: () => Promise<boolean>;
  };
}

type Modal = null | "link" | "maquininha";

export default function MercadoPagoCobranca({
  vendaId,
  numeroVenda,
  valorSugerido,
  situacao,
  bloqueado,
  onPagamentoConfirmado,
  vendaPolling,
}: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link online
  const [initPoint, setInitPoint] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Maquininha Point
  const [devices, setDevices] = useState<PointDevice[]>([]);
  const [deviceSelecionado, setDeviceSelecionado] = useState<string>("");
  const [pagType, setPagType] = useState<"credit_card" | "debit_card">("credit_card");
  const [parcelas, setParcelas] = useState(1);
  const [intentAtiva, setIntentAtiva] = useState<{
    pagamento_id: number;
    intent_id: string;
    device_id: string;
    device_nome: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Polling
  const [pago, setPago] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const visivel = !bloqueado && ["rascunho", "aprovado"].includes(situacao) && valorSugerido > 0.01;

  // ─── Fetch devices quando abre modal maquininha ──────────────────────────
  const carregarDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/mercado-pago/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
        if (data.length === 1) setDeviceSelecionado(data[0].device_id);
      }
    } catch {
      setError("Erro ao listar maquininhas");
    }
  }, []);

  useEffect(() => {
    if (modal === "maquininha") carregarDevices();
  }, [modal, carregarDevices]);

  // ─── Gera QR Code do init_point ───────────────────────────────────────────
  useEffect(() => {
    if (!initPoint) { setQrDataUrl(null); return; }
    QRCode.toDataURL(initPoint, {
      width: 220,
      margin: 1,
      color: { dark: C.esmeralda, light: "#ffffff" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [initPoint]);

  // ─── Polling de confirmação (compartilhado) ───────────────────────────────
  const iniciarPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const confirmado = await vendaPolling.detectarConfirmacao();
        if (confirmado) {
          setPago(true);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setTimeout(() => {
            setModal(null);
            setPago(false);
            setInitPoint(null);
            setQrDataUrl(null);
            setIntentAtiva(null);
            onPagamentoConfirmado?.();
          }, 2500);
        }
      } catch { /* ignora */ }
    }, 3500);
  }, [vendaPolling, onPagamentoConfirmado]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ─── Countdown Point (3 min padrão) ───────────────────────────────────────
  useEffect(() => {
    if (!intentAtiva || pago) return;
    setCountdown(180);
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [intentAtiva, pago]);

  // ─── Ações ────────────────────────────────────────────────────────────────
  async function gerarLink() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/mercado-pago/criar-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao gerar link");
      setInitPoint(body.init_point);
      iniciarPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function enviarParaMaquininha() {
    if (!deviceSelecionado) { setError("Selecione uma maquininha"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/vendas/${vendaId}/mercado-pago/criar-intent-point`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceSelecionado,
          installments: pagType === "credit_card" ? parcelas : 1,
          payment_type: pagType,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao enviar para maquininha");
      setIntentAtiva({
        pagamento_id: body.pagamento_id,
        intent_id: body.intent_id,
        device_id: body.device_id,
        device_nome: body.device_nome,
      });
      iniciarPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function cancelarIntent() {
    if (!intentAtiva) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/vendas/${vendaId}/mercado-pago/criar-intent-point?pagamento_id=${intentAtiva.pagamento_id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Erro ao cancelar");
      }
      setIntentAtiva(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  function copiarLink() {
    if (!initPoint) return;
    navigator.clipboard.writeText(initPoint);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function abrirWhats() {
    if (!initPoint) return;
    const msg = `Olá! Segue o link de pagamento da sua compra na Alisson Joias (Venda ${numeroVenda}, ${fmt(valorSugerido)}):\n\n${initPoint}\n\nAceita PIX ou cartão de crédito.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function fecharModal() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setModal(null);
    setError(null);
    setInitPoint(null);
    setQrDataUrl(null);
    setIntentAtiva(null);
    setPago(false);
  }

  if (!visivel) return null;

  return (
    <>
      <div
        className="mt-4 p-4 rounded-xl border"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.esmeralda }}>
              Mercado Pago
            </p>
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              Cobrar {fmt(valorSugerido)} — PIX ou cartão
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setModal("link"); setError(null); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <LinkIcon size={13} /> Gerar Link Online
          </button>
          <button
            onClick={() => { setModal("maquininha"); setError(null); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#fff", color: C.esmeralda, border: `1px solid ${C.esmeralda}` }}
          >
            <Smartphone size={13} /> Enviar pra Maquininha
          </button>
        </div>
      </div>

      {/* ═══ Modal overlay ═══ */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal(); }}
        >
          <div
            className="rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            style={{ backgroundColor: "#fff" }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between border-b"
              style={{ backgroundColor: C.cremeBg, borderColor: C.cremeBorder }}
            >
              <div className="flex items-center gap-2">
                {modal === "link"
                  ? <LinkIcon size={15} style={{ color: C.esmeralda }} />
                  : <Smartphone size={15} style={{ color: C.esmeralda }} />}
                <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>
                  {modal === "link" ? "Link de pagamento" : "Maquininha Point"}
                </p>
              </div>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Valor */}
              <div
                className="flex items-center justify-between rounded-lg p-3 border"
                style={{ borderColor: C.cremeBorder }}
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Venda {numeroVenda}</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: C.esmeralda }}>{fmt(valorSugerido)}</p>
                </div>
                {pago && (
                  <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#059669" }}>
                    <CheckCircle size={16} /> Pago!
                  </div>
                )}
              </div>

              {error && (
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-xs"
                  style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
                >
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* ─── Modal: Link Online ─── */}
              {modal === "link" && !initPoint && !loading && (
                <button
                  onClick={gerarLink}
                  className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: C.esmeralda, color: C.creme }}
                >
                  Gerar link agora
                </button>
              )}

              {modal === "link" && loading && (
                <div className="flex items-center justify-center py-6 gap-2 text-sm" style={{ color: "#6B7280" }}>
                  <Loader2 size={15} className="animate-spin" /> Gerando link...
                </div>
              )}

              {modal === "link" && initPoint && !pago && (
                <div className="space-y-3">
                  {qrDataUrl && (
                    <div className="flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR Code" width={200} height={200} className="rounded-lg" />
                    </div>
                  )}
                  <div
                    className="flex items-center gap-2 p-2 rounded-lg border text-xs break-all"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                  >
                    <span className="flex-1 font-mono">{initPoint.slice(0, 48)}...</span>
                    <button
                      onClick={copiarLink}
                      className="p-1.5 rounded hover:bg-stone-100"
                      style={{ color: C.esmeralda }}
                    >
                      {copiado ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <button
                    onClick={abrirWhats}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#25D366", color: "#fff" }}
                  >
                    <MessageCircle size={13} /> Enviar no WhatsApp
                  </button>
                  <div
                    className="flex items-center justify-center gap-2 py-2 text-xs"
                    style={{ color: "#6B7280" }}
                  >
                    <Loader2 size={12} className="animate-spin" />
                    Aguardando pagamento...
                  </div>
                </div>
              )}

              {/* ─── Modal: Maquininha ─── */}
              {modal === "maquininha" && !intentAtiva && !pago && (
                <div className="space-y-3">
                  {devices.length === 0 && (
                    <div className="text-xs py-3 text-center" style={{ color: "#9CA3AF" }}>
                      Nenhuma maquininha cadastrada.<br />
                      Vá em Configurações &gt; Integrações e sincronize.
                    </div>
                  )}

                  {devices.length > 0 && (
                    <>
                      <div>
                        <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#6B7280" }}>
                          Maquininha
                        </label>
                        <select
                          value={deviceSelecionado}
                          onChange={e => setDeviceSelecionado(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                          style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                        >
                          <option value="">Selecione...</option>
                          {devices.map(d => (
                            <option key={d.device_id} value={d.device_id}>
                              {d.nome_legivel}{d.loja ? ` — ${d.loja}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#6B7280" }}>
                          Forma
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["credit_card", "debit_card"] as const).map(t => (
                            <button
                              key={t}
                              onClick={() => setPagType(t)}
                              className="py-2.5 rounded-lg text-xs font-semibold transition-all"
                              style={{
                                backgroundColor: pagType === t ? C.esmeralda : "#fff",
                                color: pagType === t ? C.creme : C.esmeralda,
                                border: `1px solid ${C.esmeralda}`,
                              }}
                            >
                              {t === "credit_card" ? "Crédito" : "Débito"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {pagType === "credit_card" && (
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#6B7280" }}>
                            Parcelas
                          </label>
                          <select
                            value={parcelas}
                            onChange={e => setParcelas(Number(e.target.value))}
                            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                            style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n}x {fmt(valorSugerido / n)}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button
                        onClick={enviarParaMaquininha}
                        disabled={loading || !deviceSelecionado}
                        className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}
                      >
                        {loading ? <Loader2 size={15} className="animate-spin inline" /> : "Enviar pra maquininha"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {modal === "maquininha" && intentAtiva && !pago && (
                <div className="space-y-4 text-center">
                  <div className="flex justify-center">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: C.esmeraldaLt }}
                    >
                      <Smartphone size={32} style={{ color: C.esmeralda }} className="animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>
                      Aguardando cartão no terminal
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                      {intentAtiva.device_nome}
                    </p>
                    {countdown > 0 && (
                      <p className="text-xs mt-2 tabular-nums" style={{ color: "#9CA3AF" }}>
                        Expira em {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={cancelarIntent}
                    disabled={loading}
                    className="text-xs underline disabled:opacity-50"
                    style={{ color: "#DC2626" }}
                  >
                    {loading ? "Cancelando..." : "Cancelar envio"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
