"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Smartphone, CheckCircle, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";

// ═══════════════════════════════════════════════════════════════════════════
// PixPointInline — PIX via Maquininha Point (taxa zero)
//
// Envia payment intent PIX para o terminal físico. O cliente escaneia o QR
// que aparece na maquininha. Polling detecta confirmação via webhook.
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  esmeralda:   "#184036",
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
  vendaId: number | null;
  numeroVenda: string;
  valor: number;
  obterVendaId?: () => Promise<{ id: number; numero_venda: string }>;
  onPagamentoConfirmado: (vendaId: number) => void;
}

export default function PixPointInline({
  vendaId: vendaIdProp,
  numeroVenda: numeroVendaProp,
  valor,
  obterVendaId,
  onPagamentoConfirmado,
}: Props) {
  const { role } = useAuth();
  const adminOuGerente = isFullAccess(role);

  const [vendaIdEfetivo, setVendaIdEfetivo] = useState<number | null>(vendaIdProp);
  const [numeroVenda, setNumeroVenda] = useState(numeroVendaProp);

  useEffect(() => { setVendaIdEfetivo(vendaIdProp); }, [vendaIdProp]);
  useEffect(() => { setNumeroVenda(numeroVendaProp); }, [numeroVendaProp]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pago, setPago] = useState(false);

  const [devices, setDevices] = useState<PointDevice[]>([]);
  const [minhaDevice, setMinhaDevice] = useState<PointDevice | null | undefined>(undefined);
  const [reservas, setReservas] = useState<PointDevice[]>([]);
  const [deviceSelected, setDeviceSelected] = useState("");
  const [intentAtiva, setIntentAtiva] = useState<{
    pagamento_id: number;
    intent_id: string;
    device_id: string;
    device_nome: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Fetch devices ───────────────────────────────────────────────────────
  const carregarDevices = useCallback(async () => {
    if (adminOuGerente) {
      try {
        const res = await fetch("/api/mercado-pago/devices");
        if (res.ok) {
          const data = await res.json() as PointDevice[];
          setDevices(data);
          if (data.length === 1) setDeviceSelected(data[0].device_id);
        }
      } catch { /* ignora */ }
    } else {
      try {
        const res = await fetch("/api/mercado-pago/devices?minha=true");
        if (res.ok) {
          const data = await res.json() as { minha: PointDevice | null; reservas: PointDevice[] };
          setMinhaDevice(data.minha);
          setReservas(data.reservas);
          if (data.minha) setDeviceSelected(data.minha.device_id);
        }
      } catch { /* ignora */ }
    }
  }, [adminOuGerente]);

  useEffect(() => {
    carregarDevices();
  }, [carregarDevices]);

  // ─── Polling ─────────────────────────────────────────────────────────────
  const iniciarPolling = useCallback((idParaMonitorar: number, pagamentoIdParaChecar?: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let tick = 0;
    pollRef.current = setInterval(async () => {
      tick++;
      try {
        const res = await fetch(`/api/vendas/${idParaMonitorar}`);
        if (res.ok) {
          const data = await res.json();
          const temMpConfirmado = (data.pagamentos ?? []).some(
            (p: { gateway?: string; status: string }) =>
              p.gateway === "Mercado Pago Point" && p.status === "confirmado"
          );
          if (data.situacao === "concluido" || data.situacao === "aprovado" || temMpConfirmado) {
            setPago(true);
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setTimeout(() => onPagamentoConfirmado(idParaMonitorar), 2500);
            return;
          }
        }
      } catch { /* ignora */ }

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

  // ─── Countdown 3 min ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!intentAtiva || pago) return;
    setCountdown(180);
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [intentAtiva, pago]);

  async function ensureVendaId(): Promise<number> {
    if (vendaIdEfetivo != null) return vendaIdEfetivo;
    if (!obterVendaId) throw new Error("Venda ainda não foi salva");
    const v = await obterVendaId();
    setVendaIdEfetivo(v.id);
    setNumeroVenda(v.numero_venda);
    return v.id;
  }

  async function enviarMaquininha() {
    if (!deviceSelected) { setError("Selecione uma maquininha"); return; }
    setLoading(true);
    setError(null);
    try {
      const id = await ensureVendaId();
      const res = await fetch(`/api/vendas/${id}/mercado-pago/criar-intent-point`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceSelected, payment_type: "pix", valor }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Erro ao enviar para maquininha");
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
    if (!intentAtiva || vendaIdEfetivo == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/vendas/${vendaIdEfetivo}/mercado-pago/criar-intent-point?pagamento_id=${intentAtiva.pagamento_id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = body.error ?? "Erro ao cancelar";
        const isGone = msg.includes("404") || msg.toLowerCase().includes("not found");
        if (!isGone) throw new Error(msg);
      }
      setIntentAtiva(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  // ─── Render: pago ────────────────────────────────────────────────────────
  if (pago) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium"
        style={{ backgroundColor: "#ECFDF5", color: "#065F46" }}>
        <CheckCircle size={18} /> Pagamento confirmado! Atualizando venda...
      </div>
    );
  }

  // ─── Render: intent ativa (aguardando cliente escanear) ──────────────────
  if (intentAtiva) {
    const mm = String(Math.floor(countdown / 60)).padStart(2, "0");
    const ss = String(countdown % 60).padStart(2, "0");
    return (
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.esmeralda }}>
          <Smartphone size={16} /> PIX enviado para {intentAtiva.device_nome}
        </div>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          O QR Code PIX apareceu na maquininha. Peça ao cliente para escanear.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs tabular-nums" style={{ color: "#9CA3AF" }}>
            Expira em {mm}:{ss}
          </span>
          <button
            onClick={cancelarIntent}
            disabled={loading}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border hover:bg-red-50 transition-colors"
            style={{ borderColor: "#FCA5A5", color: "#DC2626" }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // ─── Render: seleção de device ───────────────────────────────────────────
  const deviceList = adminOuGerente
    ? devices
    : [minhaDevice, ...reservas].filter(Boolean) as PointDevice[];

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.esmeralda }}>
        <Smartphone size={16} /> PIX na Maquininha
      </div>
      <p className="text-xs" style={{ color: "#6B7280" }}>
        O QR Code PIX aparecerá na maquininha para o cliente escanear. Taxa zero.
      </p>

      {deviceList.length === 0 && (
        <p className="text-xs" style={{ color: "#9CA3AF" }}>Carregando maquininhas...</p>
      )}

      {deviceList.length > 1 && (
        <select
          value={deviceSelected}
          onChange={e => setDeviceSelected(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
          style={{ borderColor: C.cremeBorder }}
        >
          <option value="">Selecione a maquininha</option>
          {deviceList.map(d => (
            <option key={d.device_id} value={d.device_id}>{d.nome_legivel}</option>
          ))}
        </select>
      )}

      {deviceList.length === 1 && (
        <p className="text-sm font-medium" style={{ color: "#374151" }}>
          {deviceList[0].nome_legivel}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={enviarMaquininha}
        disabled={loading || !deviceSelected}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40 transition-opacity"
        style={{ backgroundColor: C.esmeralda, color: C.creme }}
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
          : <><Smartphone size={15} /> Cobrar {fmt(valor)} na maquininha</>
        }
      </button>
    </div>
  );
}
