"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CreditCard, Smartphone, Link as LinkIcon, Copy, Check, Loader2,
  MessageCircle, CheckCircle, AlertTriangle, X, RefreshCw,
} from "lucide-react";
import QRCode from "qrcode";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";

// ═══════════════════════════════════════════════════════════════════════════
// CartaoInline — Cobrança via Cartão de Crédito no Mercado Pago
//
// Inline no form de pagamento (NovaVendaClient + VendaDetalheClient), aparece
// quando a vendedora seleciona "Cartão de Crédito". Oferece dois caminhos:
//
//   1. Link de Pagamento (Preference API)
//      - Gera init_point → QR Code local (biblioteca qrcode) + link copiável
//      - Cliente paga remoto via checkout MP (aceita crédito + PIX)
//      - Ideal pra venda online, WhatsApp, email
//
//   2. Maquininha Point (Point Integration API)
//      - Seleciona device + tipo + parcelas
//      - Dispara intent no terminal físico
//      - Countdown 3 min, botão cancelar
//      - Ideal pra venda presencial na loja
//
// Suporta vendaId=null (obterVendaId cria rascunho primeiro) igual PixQrInline.
// Polling a cada 4s detecta pagamento confirmado via webhook.
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
  /** vendaId da venda se já existe. Se null, usa obterVendaId para criar rascunho primeiro. */
  vendaId: number | null;
  numeroVenda: string;
  valor: number;
  /** Parcelas sugeridas (1-12). Pré-preenche o seletor do Point. */
  installments?: number;
  obterVendaId?: () => Promise<{ id: number; numero_venda: string }>;
  onPagamentoConfirmado: (vendaId: number) => void;
  ocultar?: boolean;
}

type Modo = "idle" | "link" | "maquininha";

export default function CartaoInline({
  vendaId: vendaIdProp,
  numeroVenda: numeroVendaProp,
  valor,
  installments: installmentsProp,
  obterVendaId,
  onPagamentoConfirmado,
  ocultar,
}: Props) {
  const { role } = useAuth();
  const adminOuGerente = isFullAccess(role);

  const [vendaIdEfetivo, setVendaIdEfetivo] = useState<number | null>(vendaIdProp);
  const [numeroVenda, setNumeroVenda] = useState(numeroVendaProp);

  useEffect(() => { setVendaIdEfetivo(vendaIdProp); }, [vendaIdProp]);
  useEffect(() => { setNumeroVenda(numeroVendaProp); }, [numeroVendaProp]);

  const [modo, setModo] = useState<Modo>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState(false);

  // Link state
  const [initPoint, setInitPoint] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Maquininha state — admin: lista completa, vendedor: minha + reservas
  const [devices, setDevices] = useState<PointDevice[]>([]);
  const [minhaDevice, setMinhaDevice] = useState<PointDevice | null | undefined>(undefined); // undefined = carregando
  const [reservas, setReservas] = useState<PointDevice[]>([]);
  const [deviceSelected, setDeviceSelected] = useState("");
  const [parcelasPoint, setParcelasPoint] = useState(installmentsProp ?? 1);
  const [intentAtiva, setIntentAtiva] = useState<{
    pagamento_id: number;
    intent_id: string;
    device_id: string;
    device_nome: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Estado do form inline "usar reserva"
  const [showReservaForm, setShowReservaForm] = useState(false);
  const [reservaSelecionada, setReservaSelecionada] = useState("");
  const [reservaJustificativa, setReservaJustificativa] = useState("");
  const [reservaLoading, setReservaLoading] = useState(false);
  const [reservaError, setReservaError] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Gera QR do init_point via biblioteca qrcode ─────────────────────────
  useEffect(() => {
    if (!initPoint) { setQrDataUrl(null); return; }
    QRCode.toDataURL(initPoint, {
      width: 220,
      margin: 1,
      color: { dark: C.esmeralda, light: "#ffffff" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [initPoint]);

  // ─── Atualiza parcelasPoint se prop mudar (clamp ao máximo permitido) ───
  useEffect(() => {
    if (installmentsProp == null) return;
    const maxN = Math.min(12, Math.max(1, Math.floor(valor / 5)));
    setParcelasPoint(Math.min(installmentsProp, maxN));
  }, [installmentsProp, valor]);

  // ─── Fetch devices quando entra em modo maquininha ───────────────────────
  const carregarDevices = useCallback(async () => {
    if (adminOuGerente) {
      // Admin/gerente: lista completa
      try {
        const res = await fetch("/api/mercado-pago/devices");
        if (res.ok) {
          const data = await res.json() as PointDevice[];
          setDevices(data);
          if (data.length === 1) setDeviceSelected(data[0].device_id);
        }
      } catch { /* ignora */ }
    } else {
      // Vendedor: busca minha + reservas
      try {
        const res = await fetch("/api/mercado-pago/devices?minha=true");
        if (res.ok) {
          const data = await res.json() as { minha: PointDevice | null; reservas: PointDevice[] };
          setMinhaDevice(data.minha);
          setReservas(data.reservas);
          if (data.minha) {
            setDeviceSelected(data.minha.device_id);
          }
          // Pré-selecionar primeira reserva se houver apenas uma
          if (!data.minha && data.reservas.length === 1) {
            setReservaSelecionada(data.reservas[0].device_id);
          }
        }
      } catch { /* ignora */ }
    }
  }, [adminOuGerente]);

  useEffect(() => {
    if (modo === "maquininha" && devices.length === 0 && minhaDevice === undefined) {
      carregarDevices();
    }
  }, [modo, devices.length, minhaDevice, carregarDevices]);

  // ─── Polling de confirmação ──────────────────────────────────────────────
  // Dois mecanismos em paralelo:
  //   1. Poll /api/vendas/:id (detecta confirmação via webhook ou manual)
  //   2. Poll /api/vendas/:id/mercado-pago/checar-point (fallback ativo quando
  //      o webhook do MP Point não chega — busca por external_reference no MP)
  const iniciarPolling = useCallback((idParaMonitorar: number, pagamentoIdParaChecar?: number) => {
    if (pollRef.current) clearInterval(pollRef.current);

    let tick = 0;
    pollRef.current = setInterval(async () => {
      tick++;
      try {
        // 1. Poll status da venda
        const res = await fetch(`/api/vendas/${idParaMonitorar}`);
        if (res.ok) {
          const data = await res.json();
          const temMpConfirmado = (data.pagamentos ?? []).some(
            (p: { gateway?: string; status: string }) =>
              (p.gateway === "Mercado Pago Online" || p.gateway === "Mercado Pago Point")
              && p.status === "confirmado"
          );
          if (data.situacao === "concluido" || data.situacao === "aprovado" || temMpConfirmado) {
            setPago(true);
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setTimeout(() => onPagamentoConfirmado(idParaMonitorar), 2500);
            return;
          }
        }
      } catch { /* ignora */ }

      // 2. A cada 2 ticks (8s) checa ativamente no MP se o pagamento chegou
      if (pagamentoIdParaChecar && tick % 2 === 0) {
        try {
          const mpRes = await fetch(
            `/api/vendas/${idParaMonitorar}/mercado-pago/checar-point?pagamento_id=${pagamentoIdParaChecar}`
          );
          if (mpRes.ok) {
            const mpData = await mpRes.json();
            if (mpData.status === "confirmado") {
              setPago(true);
              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
              setTimeout(() => onPagamentoConfirmado(idParaMonitorar), 2500);
            }
          }
        } catch { /* ignora */ }
      }
    }, 4000);
  }, [onPagamentoConfirmado]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ─── Countdown Point (3 min) ─────────────────────────────────────────────
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

  // ─── Helper: garante vendaId (cria rascunho se necessário) ──────────────
  async function ensureVendaId(): Promise<number> {
    if (vendaIdEfetivo != null) return vendaIdEfetivo;
    if (!obterVendaId) throw new Error("Venda ainda não foi salva e não há callback de criação");
    const vendaCriada = await obterVendaId();
    setVendaIdEfetivo(vendaCriada.id);
    setNumeroVenda(vendaCriada.numero_venda);
    return vendaCriada.id;
  }

  // ─── Ações — Link de pagamento ──────────────────────────────────────────
  async function gerarLink() {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureVendaId();
      const res = await fetch(`/api/vendas/${id}/mercado-pago/criar-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Servidor retornou ${res.status}. Pode ser que o deploy ainda não esteja publicado.`);
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao gerar link");
      setInitPoint(body.init_point);
      iniciarPolling(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  // ─── Ações — Maquininha Point ───────────────────────────────────────────
  async function enviarMaquininha() {
    if (!deviceSelected) { setError("Selecione uma maquininha"); return; }
    setLoading(true);
    setError(null);
    try {
      const id = await ensureVendaId();
      const res = await fetch(`/api/vendas/${id}/mercado-pago/criar-intent-point`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceSelected,
          installments: parcelasPoint,
          payment_type: "credit_card",
          valor,
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Servidor retornou ${res.status}. Verifique o deploy.`);
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao enviar pra maquininha");
      setIntentAtiva({
        pagamento_id: body.pagamento_id,
        intent_id: body.intent_id,
        device_id: body.device_id,
        device_nome: body.device_nome,
      });
      iniciarPolling(id, body.pagamento_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function cancelarIntent() {
    if (!intentAtiva) return;
    const id = vendaIdEfetivo;
    if (id == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/vendas/${id}/mercado-pago/criar-intent-point?pagamento_id=${intentAtiva.pagamento_id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = body.error ?? "Erro ao cancelar";
        // 404 = intent já processada/expirada no MP — limpa o estado mesmo assim
        const isGone = msg.includes("404") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("doesn't exist");
        if (!isGone) throw new Error(msg);
      }
      setIntentAtiva(null);
      setModo("idle");
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
    const msg = `Olá! Segue o link de pagamento da sua compra na Alisson Joias (Venda ${numeroVenda}, ${fmt(valor)}).\n\nAcesse o link pra pagar com cartão de crédito ou PIX:\n\n${initPoint}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // ─── Confirmar uso de reserva (vendedor sem maquininha própria) ─────────
  async function confirmarReserva() {
    if (!reservaSelecionada) { setReservaError("Selecione uma maquininha reserva"); return; }
    if (reservaJustificativa.trim().length < 10) { setReservaError("Justificativa muito curta (mínimo 10 caracteres)"); return; }
    setReservaLoading(true);
    setReservaError(null);
    try {
      const res = await fetch("/api/mercado-pago/uso-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: vendaIdEfetivo ?? undefined,
          device_id_reserva: reservaSelecionada,
          justificativa: reservaJustificativa.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao registrar uso de reserva");
      setDeviceSelected(reservaSelecionada);
      setShowReservaForm(false);
      setReservaJustificativa("");
    } catch (e) {
      setReservaError(e instanceof Error ? e.message : "Erro");
    } finally {
      setReservaLoading(false);
    }
  }

  function voltarIdle() {
    setModo("idle");
    setError(null);
    setInitPoint(null);
    setQrDataUrl(null);
    setIntentAtiva(null);
    setShowReservaForm(false);
    setReservaJustificativa("");
    setReservaError(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  if (ocultar) return null;

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard size={14} style={{ color: C.esmeralda }} />
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.esmeralda }}>
            Cartão de Crédito — Mercado Pago
          </p>
        </div>
        {modo !== "idle" && !pago && (
          <button
            onClick={voltarIdle}
            className="text-[11px] underline"
            style={{ color: "#6B7280" }}
          >
            Voltar
          </button>
        )}
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

      {/* ═══ Estado idle — escolher canal ═══ */}
      {modo === "idle" && !pago && (
        <>
          <p className="text-xs mb-3" style={{ color: "#6B7280" }}>
            Escolha como cobrar o cartão do cliente. Quando o pagamento cair,
            a venda é <b>concluída automaticamente</b>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              onClick={() => setModo("link")}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              <LinkIcon size={13} /> Link de Pagamento
            </button>
            <button
              onClick={() => setModo("maquininha")}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#fff", color: C.esmeralda, border: `1px solid ${C.esmeralda}` }}
            >
              <Smartphone size={13} /> Maquininha Point
            </button>
          </div>
        </>
      )}

      {/* ═══ Estado link — gerando ou gerado ═══ */}
      {modo === "link" && !pago && (
        <div>
          {!initPoint && !loading && (
            <button
              onClick={gerarLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              <LinkIcon size={13} /> Gerar Link ({fmt(valor)})
            </button>
          )}

          {loading && !initPoint && (
            <div className="flex items-center justify-center py-6 gap-2 text-sm" style={{ color: "#6B7280" }}>
              <Loader2 size={15} className="animate-spin" /> Gerando link...
            </div>
          )}

          {initPoint && (
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row gap-4">
                {qrDataUrl && (
                  <div
                    className="flex-shrink-0 self-center p-2 rounded-lg"
                    style={{ backgroundColor: "#fff", border: `1px solid ${C.cremeBorder}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR Link Pagamento" width={200} height={200} />
                  </div>
                )}
                <div className="flex-1 flex flex-col gap-2 justify-center">
                  <p className="text-xs mb-1" style={{ color: "#6B7280" }}>
                    Escaneie o QR ou copie o link:
                  </p>
                  <div
                    className="flex items-center gap-2 p-2 rounded-lg border text-xs break-all"
                    style={{ borderColor: C.cremeBorder, color: "#374151", backgroundColor: "#fff" }}
                  >
                    <span className="flex-1 font-mono">{initPoint.slice(0, 36)}...</span>
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
                    onClick={() => { setInitPoint(null); setQrDataUrl(null); gerarLink(); }}
                    className="flex items-center justify-center gap-1.5 py-1.5 text-[11px]"
                    style={{ color: "#6B7280" }}
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
                Aguardando pagamento...
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Estado maquininha — escolher + enviar + countdown ═══ */}
      {modo === "maquininha" && !pago && (
        <div className="space-y-3">
          {!intentAtiva && (
            <>
              {/* ── Admin/gerente: dropdown completo ── */}
              {adminOuGerente && (
                <>
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
                          value={deviceSelected}
                          onChange={e => setDeviceSelected(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none bg-white"
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
                          Parcelas
                        </label>
                        <select
                          value={parcelasPoint}
                          onChange={e => setParcelasPoint(Number(e.target.value))}
                          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none bg-white"
                          style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n}x de {fmt(valor / n)}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={enviarMaquininha}
                        disabled={loading || !deviceSelected}
                        className="w-full py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}
                      >
                        {loading
                          ? <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Enviando...</span>
                          : <>{parcelasPoint}x · Enviar pra maquininha ({parcelasPoint === 1 ? fmt(valor) : `${fmt(valor / parcelasPoint)} / parcela`})</>}
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ── Vendedor: lógica minha / reserva ── */}
              {!adminOuGerente && (
                <>
                  {minhaDevice === undefined && (
                    <div className="flex items-center justify-center py-4 gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                      <Loader2 size={13} className="animate-spin" /> Carregando maquininha...
                    </div>
                  )}

                  {minhaDevice !== undefined && (
                    <>
                      {/* Tem maquininha própria — mostrar como texto e pré-selecionar */}
                      {minhaDevice !== null && !showReservaForm && (
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#6B7280" }}>
                            Maquininha
                          </label>
                          <div
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm"
                            style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: "#1A1A1A" }}
                          >
                            <Smartphone size={13} style={{ color: C.esmeralda }} />
                            <span className="font-medium">{minhaDevice.nome_legivel}</span>
                            {minhaDevice.loja && (
                              <span style={{ color: "#6B7280" }}>— {minhaDevice.loja}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Não tem maquininha própria */}
                      {minhaDevice === null && !showReservaForm && !deviceSelected && (
                        <div
                          className="flex items-start gap-2 p-3 rounded-lg text-xs"
                          style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}
                        >
                          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                          <span>Você não tem maquininha atribuída. Use a da loja.</span>
                        </div>
                      )}

                      {/* Device reserva já confirmado */}
                      {minhaDevice === null && !showReservaForm && deviceSelected && (
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#6B7280" }}>
                            Maquininha (reserva da loja)
                          </label>
                          <div
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm"
                            style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB", color: "#92400E" }}
                          >
                            <Smartphone size={13} />
                            <span className="font-medium">
                              {reservas.find(r => r.device_id === deviceSelected)?.nome_legivel ?? deviceSelected}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Botão "Usar maquininha da loja" */}
                      {!showReservaForm && (
                        <button
                          onClick={() => { setShowReservaForm(true); setReservaError(null); if (reservas.length === 1) setReservaSelecionada(reservas[0].device_id); }}
                          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
                          style={{ backgroundColor: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" }}
                        >
                          <AlertTriangle size={12} /> Usar maquininha da loja
                        </button>
                      )}

                      {/* Form inline para usar reserva */}
                      {showReservaForm && (
                        <div
                          className="space-y-3 p-3 rounded-lg border"
                          style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}
                        >
                          {reservas.length === 1 && (
                            <div>
                              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#92400E" }}>
                                Maquininha reserva
                              </label>
                              <p className="text-sm font-medium px-3 py-2 rounded-lg border" style={{ borderColor: "#FDE68A", backgroundColor: "#fff", color: "#1A1A1A" }}>
                                {reservas[0].nome_legivel}{reservas[0].loja ? ` — ${reservas[0].loja}` : ""}
                              </p>
                            </div>
                          )}
                          {reservas.length > 1 && (
                            <div>
                              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#92400E" }}>
                                Maquininha reserva
                              </label>
                              <select
                                value={reservaSelecionada}
                                onChange={e => setReservaSelecionada(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                                style={{ borderColor: "#FDE68A", color: "#1A1A1A", backgroundColor: "#fff" }}
                              >
                                <option value="">Selecione...</option>
                                {reservas.map(r => (
                                  <option key={r.device_id} value={r.device_id}>
                                    {r.nome_legivel}{r.loja ? ` — ${r.loja}` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {reservas.length === 0 && (
                            <p className="text-xs" style={{ color: "#92400E" }}>
                              Nenhuma maquininha reserva disponível no momento.
                            </p>
                          )}
                          <div>
                            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#92400E" }}>
                              Motivo / Justificativa *
                            </label>
                            <textarea
                              value={reservaJustificativa}
                              onChange={e => setReservaJustificativa(e.target.value)}
                              placeholder="Descreva o motivo (mín. 10 caracteres)..."
                              rows={3}
                              className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none"
                              style={{ borderColor: "#FDE68A", color: "#1A1A1A", backgroundColor: "#fff" }}
                            />
                          </div>
                          {reservaError && (
                            <p className="text-[11px]" style={{ color: "#DC2626" }}>{reservaError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={confirmarReserva}
                              disabled={reservaLoading || reservas.length === 0}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                              style={{ backgroundColor: "#B45309", color: "#fff" }}
                            >
                              {reservaLoading
                                ? <span className="inline-flex items-center gap-1 justify-center"><Loader2 size={11} className="animate-spin" /> Confirmando...</span>
                                : "Confirmar"}
                            </button>
                            <button
                              onClick={() => { setShowReservaForm(false); setReservaError(null); }}
                              className="px-3 py-2 rounded-lg text-xs"
                              style={{ backgroundColor: "#fff", color: "#6B7280", border: `1px solid ${C.cremeBorder}` }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Parcelas — mostrar quando tem device selecionado */}
                      {!showReservaForm && deviceSelected && (
                        <div>
                          <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "#6B7280" }}>
                            Parcelas
                          </label>
                          <select
                            value={parcelasPoint}
                            onChange={e => setParcelasPoint(Number(e.target.value))}
                            className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none bg-white"
                            style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
                          >
                            {Array.from({ length: Math.min(12, Math.max(1, Math.floor(valor / 5))) }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n}x de {fmt(valor / n)}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Botão enviar — só aparece quando tem device e não está no form de reserva */}
                      {!showReservaForm && deviceSelected && (
                        <button
                          onClick={enviarMaquininha}
                          disabled={loading}
                          className="w-full py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                          style={{ backgroundColor: C.esmeralda, color: C.creme }}
                        >
                          {loading
                            ? <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Enviando...</span>
                            : <>{parcelasPoint}x · Enviar pra maquininha ({parcelasPoint === 1 ? fmt(valor) : `${fmt(valor / parcelasPoint)} / parcela`})</>}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {intentAtiva && (
            <div className="space-y-3 text-center">
              <div className="flex justify-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: C.esmeraldaLt }}
                >
                  <Smartphone size={28} style={{ color: C.esmeralda }} className="animate-pulse" />
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
      )}

      {/* ═══ Estado pago ═══ */}
      {pago && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm font-semibold" style={{ color: "#059669" }}>
          <CheckCircle size={18} /> Pagamento confirmado! Atualizando venda...
        </div>
      )}
    </div>
  );
}
