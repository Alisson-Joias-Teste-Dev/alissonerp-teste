"use client";

import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import {
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Loader2,
  Wallet,
  User,
  Calendar,
  X,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { createClient } from "@/lib/supabase/client";
import { getPublicUrl } from "@/lib/storage-url";
import ValeCodigoInline from "@/components/vendas/ValeCodigoInline";

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  vermelho:    "#DC2626",
  vermelhoLt:  "#FEE2E2",
  ambar:       "#D97706",
  ambarLt:     "#FEF3C7",
  verde:       "#059669",
  verdeLt:     "#D1FAE5",
  cinza:       "#6B7280",
  cinzaBorder: "#E5E7EB",
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CrediarioItem {
  conta_receber_id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_recebimento: string | null;
  situacao: string;
  status_aging: string;
  dias_atraso: number;
  obs: string | null;
  created_at: string;
  venda_id: number | null;
  numero_venda: string | null;
  total_venda: number | null;
  venda_situacao: string | null;
  venda_bloqueada: boolean | null;
  credito_gerente_usado: number | null;
  venda_created_at: string | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  vendedor_id: number | null;
  vendedor_nome: string | null;
  consultora_uuid: string | null;
  consultora_nome: string | null;
}

interface Comunicacao {
  id: number;
  tipo: string;
  mensagem: string;
  created_at: string;
  usuario_nome: string | null;
}

interface ContaDetalhe extends CrediarioItem {
  cliente_email: string | null;
  comunicacoes: Comunicacao[];
  ouro_peso?: number | null;
  ouro_valor_grama?: number | null;
  ouro_foto_path?: string | null;
  fotos?: { path: string; conta_id: number; nome: string }[];
}

interface Contagens {
  total: number;
  pendente: number;
  pago: number;
  vencido: number;
  valor_pendente: number;
  valor_vencido: number;
}

interface Props {
  items: CrediarioItem[];
  contagens: Contagens;
  saldo: { atual: number; limite: number } | null;
  userRole: string;
  vendedorId: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0];
}

// Presets do filtro de período (padrão da casa: Hoje/Ontem/7d/30d/Mês/Personalizado).
const PERIODOS = [
  { key: "hoje",  label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d",    label: "7 dias" },
  { key: "30d",   label: "30 dias" },
  { key: "mes",   label: "Mês" },
  { key: "custom", label: "Personalizado" },
];

function isoDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Converte o preset em { from, to } (YYYY-MM-DD). "Mês" = do dia 1 até hoje.
function rangeDoPeriodo(preset: string, custom: { from: string; to: string }): { from: string; to: string } {
  const hoje = new Date();
  const menos = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d; };
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  switch (preset) {
    case "hoje":   return { from: isoDia(hoje), to: isoDia(hoje) };
    case "ontem":  { const o = menos(1); return { from: isoDia(o), to: isoDia(o) }; }
    case "7d":     return { from: isoDia(menos(6)), to: isoDia(hoje) };
    case "30d":    return { from: isoDia(menos(29)), to: isoDia(hoje) };
    case "custom": return custom.from && custom.to ? custom : { from: "", to: "" };
    case "mes":
    default:       return { from: isoDia(inicioMes), to: isoDia(hoje) };
  }
}

// Chip que marca um card como "da consultora X" quando o filtro está ativo.
const chipConsultora: CSSProperties = {
  background: C.esmeraldaLt, color: C.esmeralda,
  borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 600,
};
function fmtData(s: string | null) {
  if (!s) return "—";
  // Datas DATE (vencimento/recebimento) vem sem hora; new Date(s) as interpreta
  // como meia-noite UTC e, no fuso BR (-3h), exibia o dia anterior. Monta a data
  // local a partir de YYYY-MM-DD pra nao deslocar.
  const [y, m, dd] = String(s).slice(0, 10).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, dd || 1);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR");
}
function fmtDtHr(s: string) {
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
// Formata telefone BR pra exibicao: (XX) XXXXX-XXXX. O numero vem do celular
// (vw_crediario), as vezes sem mascara. Para o link do WhatsApp os digitos sao
// extraidos a parte em montarWhatsappCobranca.
function fmtTelefone(s: string | null): string {
  if (!s) return "";
  const dig = s.replace(/\D/g, "");
  const n = dig.startsWith("55") && dig.length > 11 ? dig.slice(2) : dig;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return s;
}

function agingLabel(status: string, dias: number) {
  if (status === "pago") return { text: "Pago", color: C.verde, bg: C.verdeLt };
  if (status === "vencido") return { text: `Vencido ${dias}d`, color: C.vermelho, bg: C.vermelhoLt };
  if (status === "vence_em_breve") return { text: "Vence em breve", color: C.ambar, bg: C.ambarLt };
  return { text: "Em dia", color: C.esmeralda, bg: C.esmeraldaLt };
}

// Monta o link de cobrança no WhatsApp com a mensagem pronta (Fase 4 crediário).
// A consultora revisa e envia — abre o WhatsApp já com o texto preenchido (1 clique).
function montarWhatsappCobranca(d: ContaDetalhe): string {
  const tel = (d.cliente_telefone ?? "").replace(/\D/g, "");
  const num = tel.startsWith("55") ? tel : `55${tel}`;
  const nome = (d.cliente_nome ?? "").trim().split(" ")[0] || "tudo bem";
  const msg = `Olá ${nome}! Passando para lembrar do seu pagamento de ${fmtBRL(d.valor)}${d.data_vencimento ? ` com vencimento em ${fmtData(d.data_vencimento)}` : ""} na Alisson Joias. Qualquer dúvida, estou à disposição!`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

// ── Drawer de detalhe ─────────────────────────────────────────────────────────
/**
 * DetalheDrawer — Painel lateral que abre ao clicar em uma conta do crediário.
 *
 * Mostra:
 *  - Status (aging), valor, datas, cliente, venda vinculada
 *  - Seletor de forma de recebimento com 6 opções (REGRA DE OURO #3)
 *  - Para Ouro: campos de peso, valor/grama e upload de foto da balança
 *  - Para MP: campo ID + verificação na API do Mercado Pago
 *  - Timeline de comunicações (histórico)
 *
 * A baixa chama registrar-pagamento/route.ts (formas não-MP) ou
 * verificar-mp/route.ts (Mercado Pago). Ver AGENTS.md para o fluxo completo.
 */
function DetalheDrawer({
  contaId,
  podeBaixar,
  isDev,
  onClose,
  onBaixa,
}: {
  contaId: number;
  podeBaixar: boolean;
  isDev: boolean;
  onClose: () => void;
  onBaixa: (id: number) => void;
}) {
  const [detalhe, setDetalhe] = useState<ContaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [mpPaymentId, setMpPaymentId] = useState("");
  const [mpParcial, setMpParcial] = useState<{ valor_pago: number; valor_restante: number } | null>(null);
  const [pbPaymentId, setPbPaymentId] = useState("");
  const [formaRecebimento, setFormaRecebimento] = useState<string | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [obs, setObs] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [err, setErr] = useState("");
  const [novaMsg, setNovaMsg] = useState("");
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  // Ouro
  const [ouroPeso, setOuroPeso] = useState("");
  const [ouroValorGrama, setOuroValorGrama] = useState("");
  const [ouroFotoFile, setOuroFotoFile] = useState<File | null>(null);
  const [ouroFotoPreview, setOuroFotoPreview] = useState<string | null>(null);
  const [ouroUploading, setOuroUploading] = useState(false);
  // Vale-Troca (mesma regra da venda: número + token do dono)
  const [valeNumero, setValeNumero] = useState("");
  const [valeValidando, setValeValidando] = useState(false);
  const [valeValidacao, setValeValidacao] = useState<
    { ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null } | null
  >(null);
  // Pix validado (QR Mercado Pago) — gera o QR, mostra e faz polling até a
  // conta fechar (o webhook fecha quando o cliente paga).
  const [pixQr, setPixQr] = useState<{ qr_code: string; qr_code_base64: string; valor: number } | null>(null);
  const [pixGerando, setPixGerando] = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Modo manual (só dev) dentro de Pix/Cartão — exige comprovante.
  const [modoManual, setModoManual] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  // Cartão validado (maquininha / Point)
  const [devices, setDevices] = useState<{ device_id: string; nome_legivel: string }[]>([]);
  const [deviceSel, setDeviceSel] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [cartaoEnviando, setCartaoEnviando] = useState(false);
  const [cartaoAguardando, setCartaoAguardando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<ContaDetalhe>(`/api/crediario/${contaId}`);
      setDetalhe(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [contaId]);

  // Carregar na montagem
  useState(() => { void carregar(); });

  // Para o polling do Pix ao fechar/desmontar o drawer.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Carrega as maquininhas quando entra no fluxo de Cartão.
  useEffect(() => {
    if (formaRecebimento === "Cartão de Crédito" && !modoManual && devices.length === 0) void carregarDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaRecebimento, modoManual]);

  // ── Pix validado: gera o QR amarrado ao "A Receber" e faz polling ──────────
  // Não marca nada como pago aqui — quem fecha a conta é o webhook do MP
  // (crediario-baixa-automatica.ts). O polling só observa a conta virar 'pago'.
  // Polling compartilhado (Pix e Cartão): observa a conta fechar pelo webhook.
  function iniciarPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const d = await apiFetch<ContaDetalhe>(`/api/crediario/${contaId}`);
        if (d.situacao === "pago") {
          if (pollRef.current) clearInterval(pollRef.current);
          onBaixa(contaId);
          onClose();
        }
      } catch { /* transitório — segue tentando */ }
    }, 4000);
  }

  async function gerarPixQr() {
    setPixGerando(true); setErr("");
    try {
      const r = await apiFetch<{ qr_code: string; qr_code_base64: string; valor: number }>(
        `/api/crediario/${contaId}/cobrar-pix`,
        { method: "POST", body: "{}" },
      );
      setPixQr({ qr_code: r.qr_code, qr_code_base64: r.qr_code_base64, valor: r.valor });
      iniciarPolling();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar o Pix");
    } finally {
      setPixGerando(false);
    }
  }

  // ── Cartão validado: maquininha (Point) ────────────────────────────────────
  async function carregarDevices() {
    try {
      const list = await apiFetch<{ device_id: string; nome_legivel: string }[]>(`/api/mercado-pago/devices`);
      const ativos = (list ?? []).filter(d => d.device_id);
      setDevices(ativos);
      if (ativos.length === 1) setDeviceSel(ativos[0].device_id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar maquininhas");
    }
  }

  async function cobrarNaMaquininha() {
    if (!deviceSel) { setErr("Escolha a maquininha"); return; }
    setCartaoEnviando(true); setErr("");
    try {
      await apiFetch(`/api/crediario/${contaId}/cobrar-cartao`, {
        method: "POST",
        body: JSON.stringify({ device_id: deviceSel, installments: parcelas }),
      });
      setCartaoAguardando(true);
      iniciarPolling();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar para a maquininha");
    } finally {
      setCartaoEnviando(false);
    }
  }

  async function cancelarMaquininha() {
    if (pollRef.current) clearInterval(pollRef.current);
    setCartaoAguardando(false);
    try { await apiFetch(`/api/crediario/${contaId}/cobrar-cartao`, { method: "DELETE" }); } catch { /* ok */ }
  }

  async function uploadComprovante(file: File): Promise<string | null> {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `crediario/${contaId}/comprovante-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("pagamento-fotos").upload(path, file, { contentType: file.type });
    if (error) { setErr("Erro ao enviar comprovante: " + error.message); return null; }
    return path;
  }

  // Baixa MANUAL de Pix/Cartão — exceção só do dev. O back exige comprovante
  // + role 'desenvolvedor' (registrar-pagamento), aqui apenas montamos o envio.
  async function confirmarManualComComprovante() {
    if (!comprovanteFile) { setErr("Comprovante obrigatório para baixa manual."); return; }
    const valor = valorPago.trim()
      ? parseFloat(valorPago.replace(",", "."))
      : (detalhe?.valor ?? 0);
    if (!valor || valor <= 0) { setErr("Informe o valor pago."); return; }
    if (detalhe && valor > detalhe.valor) { setErr("Valor pago maior que o valor da conta."); return; }
    setBaixando(true); setErr("");
    try {
      const path = await uploadComprovante(comprovanteFile);
      if (!path) { setBaixando(false); return; }
      await apiFetch(`/api/crediario/${contaId}/registrar-pagamento`, {
        method: "POST",
        body: JSON.stringify({
          forma_recebimento: formaRecebimento,
          valor_pago: valor,
          comprovante_path: path,
          obs: obs.trim() || undefined,
        }),
      });
      onBaixa(contaId);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao registrar baixa manual");
    } finally {
      setBaixando(false);
    }
  }

  async function handleVerificarMp() {
    if (!mpPaymentId.trim()) {
      setErr("Informe o ID do pagamento do Mercado Pago");
      return;
    }
    setBaixando(true);
    setErr("");
    try {
      const r = await apiFetch<{ pagamento_parcial?: boolean; valor_pago?: number; valor_restante?: number }>(
        `/api/crediario/${contaId}/verificar-mp`,
        {
          method: "POST",
          body: JSON.stringify({
            payment_id: mpPaymentId.trim(),
            obs: obs.trim() || undefined,
          }),
        },
      );
      // Atualiza a lista nos dois casos. No parcial, mantém o drawer aberto
      // mostrando o resultado (quanto entrou e quanto virou nova conta).
      onBaixa(contaId);
      if (r?.pagamento_parcial && r.valor_restante != null) {
        setMpParcial({ valor_pago: r.valor_pago ?? 0, valor_restante: r.valor_restante });
      } else {
        onClose();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao verificar pagamento");
    } finally {
      setBaixando(false);
    }
  }

  async function handleVerificarPagBank() {
    if (!pbPaymentId.trim()) {
      setErr("Informe o ID do pedido ou cobrança do PagBank");
      return;
    }
    setBaixando(true);
    setErr("");
    try {
      await apiFetch(`/api/crediario/${contaId}/verificar-pagbank`, {
        method: "POST",
        body: JSON.stringify({
          payment_id: pbPaymentId.trim(),
          obs: obs.trim() || undefined,
        }),
      });
      onBaixa(contaId);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao verificar pagamento PagBank");
    } finally {
      setBaixando(false);
    }
  }

  async function uploadOuroFoto(file: File): Promise<string | null> {
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `crediario/${contaId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("pagamento-fotos").upload(path, file, { contentType: file.type });
    if (error) { setErr("Erro ao enviar foto: " + error.message); return null; }
    return path;
  }

  async function handleConfirmar() {
    if (!formaRecebimento) return;
    const valor = parseFloat(valorPago.replace(",", "."));
    if (!valor || valor <= 0) { setErr("Informe o valor pago"); return; }
    if (detalhe && valor > detalhe.valor) { setErr("Valor pago maior que o valor da conta"); return; }

    if (formaRecebimento === "Ouro") {
      const peso = parseFloat(ouroPeso.replace(",", "."));
      const grama = parseFloat(ouroValorGrama.replace(",", "."));
      if (!peso || peso <= 0) { setErr("Informe o peso do ouro"); return; }
      if (!grama || grama <= 0) { setErr("Informe o valor da grama"); return; }
      if (!ouroFotoFile) { setErr("Foto da balança obrigatória"); return; }

      setOuroUploading(true);
      setErr("");
      try {
        const fotoPath = await uploadOuroFoto(ouroFotoFile);
        if (!fotoPath) { setOuroUploading(false); return; }
        setBaixando(true);
        await apiFetch(`/api/crediario/${contaId}/registrar-pagamento`, {
          method: "POST",
          body: JSON.stringify({
            forma_recebimento: formaRecebimento,
            valor_pago: peso * grama,
            ouro_peso: peso,
            ouro_valor_grama: grama,
            ouro_foto_path: fotoPath,
            obs: obs.trim() || undefined,
          }),
        });
        onBaixa(contaId);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erro ao registrar recebimento");
      } finally {
        setBaixando(false);
        setOuroUploading(false);
      }
      return;
    }

    setBaixando(true);
    setErr("");
    try {
      await apiFetch(`/api/crediario/${contaId}/registrar-pagamento`, {
        method: "POST",
        body: JSON.stringify({
          forma_recebimento: formaRecebimento,
          valor_pago: valor,
          obs: obs.trim() || undefined,
        }),
      });
      onBaixa(contaId);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao registrar recebimento");
    } finally {
      setBaixando(false);
    }
  }

  async function validarVale() {
    if (!valeNumero.trim()) return;
    setValeValidando(true);
    setErr("");
    try {
      const r = await apiFetch<{ ok: boolean; erro?: string; valor_disponivel?: number; cliente_id?: number | null }>(
        `/api/vale-troca/validar`,
        { method: "POST", body: JSON.stringify({ numero: valeNumero.trim() }) },
      );
      setValeValidacao(r);
    } catch (e) {
      setValeValidacao({ ok: false, erro: e instanceof Error ? e.message : "Erro ao validar o vale" });
    } finally {
      setValeValidando(false);
    }
  }

  // Registra a baixa com vale. O valor vem do vale (server-side). LANÇA em caso
  // de erro — o ValeCodigoInline exibe a mensagem inline (ex.: "código incorreto").
  async function registrarVale(vale_codigo?: string) {
    await apiFetch(`/api/crediario/${contaId}/registrar-pagamento`, {
      method: "POST",
      body: JSON.stringify({
        forma_recebimento: "Vale-Troca",
        vale_numero: valeNumero.trim(),
        ...(vale_codigo ? { vale_codigo } : {}),
        obs: obs.trim() || undefined,
      }),
    });
    onBaixa(contaId);
    onClose();
  }

  async function handleEnviarMensagem() {
    if (!novaMsg.trim()) return;
    setEnviandoMsg(true);
    try {
      await apiFetch(`/api/crediario/${contaId}/comunicacao`, {
        method: "POST",
        body: JSON.stringify({ tipo: "observacao", mensagem: novaMsg.trim() }),
      });
      setNovaMsg("");
      await carregar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao enviar mensagem");
    } finally {
      setEnviandoMsg(false);
    }
  }

  const aging = detalhe ? agingLabel(detalhe.status_aging, detalhe.dias_atraso) : null;
  const podeRegistrarBaixa = podeBaixar && detalhe?.situacao === "pendente";

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)",
        background: "#fff", zIndex: 50, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${C.cremeBorder}`,
          background: C.cremeBg,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CreditCard size={18} color={C.esmeralda} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.esmeralda }}>
              Detalhe do Crediário
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} color={C.cinza} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
            <Loader2 size={24} color={C.esmeralda} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : !detalhe ? (
          <div style={{ padding: 24, color: C.vermelho }}>Erro ao carregar dados.</div>
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {/* Status badge */}
            {aging && (
              <span style={{
                display: "inline-block", fontSize: 12, fontWeight: 700,
                padding: "3px 10px", borderRadius: 20, marginBottom: 14,
                background: aging.bg, color: aging.color,
              }}>
                {aging.text}
              </span>
            )}

            {/* Valor */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.esmeralda }}>
                {fmtBRL(detalhe.valor)}
              </div>
              <div style={{ fontSize: 13, color: C.cinza }}>{detalhe.descricao}</div>
            </div>

            {/* Datas */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16,
              background: C.cremeBg, borderRadius: 8, padding: "12px 14px",
            }}>
              <div>
                <div style={{ fontSize: 10, color: C.cinza, textTransform: "uppercase", letterSpacing: 1 }}>Vencimento</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", marginTop: 2 }}>
                  {fmtData(detalhe.data_vencimento)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.cinza, textTransform: "uppercase", letterSpacing: 1 }}>Recebimento</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: detalhe.data_recebimento ? C.verde : C.cinza, marginTop: 2 }}>
                  {fmtData(detalhe.data_recebimento)}
                </div>
              </div>
            </div>

            {/* Cliente */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Cliente</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>{detalhe.cliente_nome ?? "—"}</div>
              {detalhe.cliente_telefone && (
                <div style={{ fontSize: 12, color: C.cinza }}>{fmtTelefone(detalhe.cliente_telefone)}</div>
              )}
              {detalhe.cliente_telefone && detalhe.situacao === "pendente" && (
                <a
                  href={montarWhatsappCobranca(detalhe)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 8, padding: "6px 12px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                >
                  Cobrar no WhatsApp
                </a>
              )}
            </div>

            {/* Ouro — foto da balança */}
            {/* REGRA DE OURO #4: foto do ouro visível no drawer, usa proxy /api/storage/pagamento-fotos/...
               com getPublicUrl(). A foto é obrigatória no upload e fica acessível para qualquer autenticado. */}
            {detalhe.ouro_foto_path && (
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                <div style={{ fontSize: 11, color: C.cinza, marginBottom: 6 }}>Pagamento em Ouro</div>
                <a
                  href={getPublicUrl("pagamento-fotos", detalhe.ouro_foto_path)}
                  target="_blank" rel="noreferrer"
                >
                  <img
                    src={getPublicUrl("pagamento-fotos", detalhe.ouro_foto_path)}
                    alt="Balança ouro"
                    style={{ width: "100%", maxHeight: 160, borderRadius: 6, objectFit: "cover", border: `1px solid ${C.cremeBorder}` }}
                  />
                </a>
                {(detalhe.ouro_peso != null || detalhe.ouro_valor_grama != null) && (
                  <div style={{ fontSize: 12, color: C.cinza, marginTop: 4 }}>
                    {detalhe.ouro_peso != null && <span>{Number(detalhe.ouro_peso).toFixed(3)}g</span>}
                    {detalhe.ouro_valor_grama != null && <span> × R$ {Number(detalhe.ouro_valor_grama).toFixed(2)}/g</span>}
                  </div>
                )}
              </div>
            )}

            {/* Venda */}
            {detalhe.venda_id && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Venda</div>
                <a
                  href={`/vendas/${detalhe.venda_id}`}
                  style={{ fontSize: 13, color: C.esmeralda, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                  {detalhe.numero_venda ?? `#${detalhe.venda_id}`}
                  <ExternalLink size={11} />
                </a>
                {detalhe.vendedor_nome && (
                  <div style={{ fontSize: 12, color: C.cinza, marginTop: 2 }}>Consultora: {detalhe.vendedor_nome}</div>
                )}
              </div>
            )}

            {/* Observação */}
            {detalhe.obs && (
              <div style={{
                marginBottom: 12, padding: "10px 12px", borderRadius: 8,
                background: C.ambarLt, fontSize: 12, color: "#92400e",
              }}>
                {detalhe.obs}
              </div>
            )}

            {/* Registrar Recebimento */}
            {podeRegistrarBaixa && (
              <div style={{
                marginBottom: 16, padding: "14px", borderRadius: 10,
                border: `1px solid ${formaRecebimento === "Manual (MP)" ? "#0070E040" : formaRecebimento === "PagBank" ? "#00D97240" : C.verde}40`,
                background: formaRecebimento === "Manual (MP)" ? "#EBF5FB" : formaRecebimento === "PagBank" ? "#F0FDF6" : C.cremeBg,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.esmeralda, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <CreditCard size={14} />
                  {formaRecebimento ? `Receber via ${formaRecebimento}` : "Registrar Recebimento"}
                </div>

                {/* Seletor de forma */}
                {!formaRecebimento && (
                  <>
                    <div style={{ fontSize: 11, color: C.cinza, marginBottom: 8 }}>Como o cliente pagou?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {(["Dinheiro", "Cartão de Crédito", "Pix", "Ouro", "Vale-Troca", "Manual (MP)", "PagBank"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => {
                            setFormaRecebimento(f);
                            setErr("");
                            if (f !== "Manual (MP)" && f !== "PagBank") {
                              setValorPago(detalhe ? detalhe.valor.toFixed(2).replace(".", ",") : "");
                            }
                          }}
                          style={{
                            padding: "8px 6px", fontSize: 11, fontWeight: 600,
                            border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                            background: "#fff", cursor: "pointer", textAlign: "center",
                            color: C.esmeralda,
                          }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Manual (MP) → campo ID + verificação */}
                {formaRecebimento === "Manual (MP)" && mpParcial && (
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#1D9E75", fontWeight: 700, marginBottom: 8 }}>
                      <CheckCircle size={16} /> Baixa parcial registrada
                    </div>
                    <div style={{ background: "#EBF5FB", borderRadius: 8, padding: "10px 12px", color: "#185FA5" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Pago agora (MP)</span>
                        <b>R$ {mpParcial.valor_pago.toFixed(2).replace(".", ",")}</b>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #0070E040", marginTop: 6, paddingTop: 6 }}>
                        <span>Nova conta pendente</span>
                        <b>R$ {mpParcial.valor_restante.toFixed(2).replace(".", ",")}</b>
                      </div>
                    </div>
                    <div style={{ color: C.cinza, marginTop: 8 }}>
                      O restante virou uma nova conta "Saldo restante", que continua cobrável no crediário.
                    </div>
                    <button
                      onClick={onClose}
                      style={{
                        marginTop: 10, width: "100%", padding: "10px",
                        background: "#0070E0", color: "#fff", border: "none",
                        borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}>
                      Fechar
                    </button>
                  </div>
                )}

                {formaRecebimento === "Manual (MP)" && !mpParcial && (
                  <>
                    <div style={{ fontSize: 11, color: "#4A6FA5", marginBottom: 10, lineHeight: 1.5 }}>
                      Informe o ID do pagamento MP recebido do cliente. O sistema consulta a API do Mercado Pago e só confirma se o status for <b>approved</b>. Se o valor pago for <b>menor que a conta</b>, registra baixa parcial e abre uma nova conta com o restante.
                    </div>
                    <input
                      value={mpPaymentId}
                      onChange={e => setMpPaymentId(e.target.value.replace(/\D/g, ""))}
                      placeholder="ID do pagamento MP (ex: 123456789)"
                      type="text"
                      inputMode="numeric"
                      style={{
                        width: "100%", fontSize: 13, padding: "8px 10px",
                        border: `1px solid #0070E040`, borderRadius: 6,
                        outline: "none", background: "#fff", boxSizing: "border-box",
                        fontFamily: "monospace",
                      }}
                    />
                    <textarea
                      value={obs}
                      onChange={e => setObs(e.target.value)}
                      placeholder="Observação adicional (opcional)..."
                      rows={2}
                      style={{
                        marginTop: 6, width: "100%", fontSize: 12, padding: "7px 10px",
                        border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                        resize: "none", outline: "none", background: "#fff",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => { setFormaRecebimento(null); setMpPaymentId(""); setErr(""); }}
                        style={{
                          padding: "10px 14px", background: "none", border: `1px solid ${C.cremeBorder}`,
                          borderRadius: 8, fontSize: 12, color: C.cinza, cursor: "pointer",
                        }}>
                        Voltar
                      </button>
                      <button
                        onClick={handleVerificarMp}
                        disabled={baixando || !mpPaymentId.trim()}
                        style={{
                          flex: 1, padding: "10px",
                          background: mpPaymentId.trim() ? "#0070E0" : "#B0C4DE",
                          color: "#fff", border: "none",
                          borderRadius: 8, fontSize: 13, fontWeight: 700,
                          cursor: baixando || !mpPaymentId.trim() ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        {baixando
                          ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Verificando no MP...</>
                          : <><CheckCircle size={14} /> Verificar e Confirmar</>
                        }
                      </button>
                    </div>
                  </>
                )}

                {/* PagBank → campo ID + verificação */}
                {formaRecebimento === "PagBank" && (
                  <>
                    <div style={{ fontSize: 11, color: "#4A6FA5", marginBottom: 10, lineHeight: 1.5 }}>
                      Informe o ID do pedido (ORDE_...) ou cobrança (CHAR_...) do PagBank. O sistema consulta a API do PagBank e só confirma se o status for <b>PAID</b>.
                    </div>
                    <input
                      value={pbPaymentId}
                      onChange={e => setPbPaymentId(e.target.value)}
                      placeholder="ID PagBank (ex: ORDE_123456789)"
                      type="text"
                      style={{
                        width: "100%", fontSize: 13, padding: "8px 10px",
                        border: `1px solid #00D97240`, borderRadius: 6,
                        outline: "none", background: "#fff", boxSizing: "border-box",
                        fontFamily: "monospace",
                      }}
                    />
                    <textarea
                      value={obs}
                      onChange={e => setObs(e.target.value)}
                      placeholder="Observação adicional (opcional)..."
                      rows={2}
                      style={{
                        marginTop: 6, width: "100%", fontSize: 12, padding: "7px 10px",
                        border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                        resize: "none", outline: "none", background: "#fff",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => { setFormaRecebimento(null); setPbPaymentId(""); setErr(""); }}
                        style={{
                          padding: "10px 14px", background: "none", border: `1px solid ${C.cremeBorder}`,
                          borderRadius: 8, fontSize: 12, color: C.cinza, cursor: "pointer",
                        }}>
                        Voltar
                      </button>
                      <button
                        onClick={handleVerificarPagBank}
                        disabled={baixando || !pbPaymentId.trim()}
                        style={{
                          flex: 1, padding: "10px",
                          background: pbPaymentId.trim() ? "#00D972" : "#A0E8C0",
                          color: "#fff", border: "none",
                          borderRadius: 8, fontSize: 13, fontWeight: 700,
                          cursor: baixando || !pbPaymentId.trim() ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        {baixando
                          ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Verificando no PagBank...</>
                          : <><CheckCircle size={14} /> Verificar e Confirmar</>
                        }
                      </button>
                    </div>
                  </>
                )}

                {/* Vale-Troca → número do vale + token do dono (mesma regra da venda) */}
                {formaRecebimento === "Vale-Troca" && (
                  <>
                    <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Número do vale</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <input
                        value={valeNumero}
                        onChange={e => { setValeNumero(e.target.value); setValeValidacao(null); setErr(""); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void validarVale(); } }}
                        placeholder="VT-00000"
                        style={{
                          flex: 1, fontSize: 13, padding: "8px 10px",
                          border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                          outline: "none", background: "#fff", boxSizing: "border-box", fontFamily: "monospace",
                        }}
                      />
                      <button
                        onClick={() => void validarVale()}
                        disabled={!valeNumero.trim() || valeValidando}
                        style={{
                          padding: "8px 14px", border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                          background: "#fff", color: C.esmeralda, fontSize: 12, fontWeight: 600,
                          cursor: !valeNumero.trim() || valeValidando ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                        {valeValidando ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={13} />}
                        Validar
                      </button>
                    </div>

                    {valeValidacao && (
                      <div style={{
                        padding: "8px 10px", borderRadius: 6, marginBottom: 8, fontSize: 12, lineHeight: 1.5,
                        border: `1px solid ${valeValidacao.ok ? "#A7F3D0" : "#FECACA"}`,
                        background: valeValidacao.ok ? "#ECFDF5" : "#FEF2F2",
                        color: valeValidacao.ok ? "#065F46" : "#991B1B",
                      }}>
                        {valeValidacao.ok ? (
                          <>
                            <div style={{ fontWeight: 700 }}>Vale válido</div>
                            {valeValidacao.valor_disponivel !== undefined && (
                              <div>Saldo: <strong>{fmtBRL(valeValidacao.valor_disponivel)}</strong>
                                {valeValidacao.cliente_id == null ? " · promocional (sem dono)" : ""}</div>
                            )}
                            {detalhe && valeValidacao.valor_disponivel !== undefined && valeValidacao.valor_disponivel < detalhe.valor && (
                              <div style={{ color: C.ambar, fontWeight: 600 }}>
                                Vale menor que a conta — restante {fmtBRL(detalhe.valor - valeValidacao.valor_disponivel)} fica pendente
                              </div>
                            )}
                          </>
                        ) : (valeValidacao.erro ?? "Vale inválido")}
                      </div>
                    )}

                    {/* Vale COM dono → exige o código enviado ao WhatsApp do cliente */}
                    {valeValidacao?.ok && valeValidacao.cliente_id != null && (
                      <ValeCodigoInline
                        valeNumero={valeNumero.trim()}
                        botaoLabel="Registrar pagamento"
                        disabled={baixando}
                        onAplicar={async ({ vale_codigo }) => { await registrarVale(vale_codigo); }}
                      />
                    )}

                    {/* Vale promocional (sem dono) → aplica direto */}
                    {valeValidacao?.ok && valeValidacao.cliente_id == null && (
                      <button
                        onClick={async () => {
                          setBaixando(true); setErr("");
                          try { await registrarVale(); }
                          catch (e) { setErr(e instanceof Error ? e.message : "Erro ao registrar pagamento"); }
                          finally { setBaixando(false); }
                        }}
                        disabled={baixando}
                        style={{
                          width: "100%", padding: "10px", background: C.esmeralda, color: C.creme,
                          border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, marginTop: 4,
                          cursor: baixando ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}>
                        {baixando ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={14} />}
                        Registrar pagamento
                      </button>
                    )}

                    <button
                      onClick={() => { setFormaRecebimento(null); setValeNumero(""); setValeValidacao(null); setErr(""); }}
                      style={{
                        marginTop: 8, padding: "8px 14px", background: "none",
                        border: `1px solid ${C.cremeBorder}`, borderRadius: 8, fontSize: 12, color: C.cinza, cursor: "pointer",
                      }}>
                      Voltar
                    </button>
                  </>
                )}

                {/* Pix / Cartão → fluxo VALIDADO (igual ao pedido). Pix = QR do
                    Mercado Pago, confirma sozinho pelo webhook. Manual (sem MP)
                    = exceção só do dev, com comprovante obrigatório. */}
                {(formaRecebimento === "Pix" || formaRecebimento === "Cartão de Crédito") && (
                  <>
                    {!modoManual && formaRecebimento === "Pix" && (
                      <>
                        {!pixQr ? (
                          <button
                            onClick={gerarPixQr}
                            disabled={pixGerando}
                            style={{
                              width: "100%", padding: "10px", background: C.esmeralda, color: C.creme,
                              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                              cursor: pixGerando ? "not-allowed" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}>
                            {pixGerando
                              ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Gerando QR...</>
                              : <><CreditCard size={14} /> Gerar QR Pix</>}
                          </button>
                        ) : (
                          <div style={{ textAlign: "center" }}>
                            <img
                              src={`data:image/png;base64,${pixQr.qr_code_base64}`}
                              alt="QR Code Pix"
                              style={{ width: 200, height: 200, margin: "0 auto", display: "block", border: `1px solid ${C.cremeBorder}`, borderRadius: 8 }}
                            />
                            <button
                              onClick={async () => {
                                try { await navigator.clipboard.writeText(pixQr.qr_code); setPixCopiado(true); setTimeout(() => setPixCopiado(false), 2000); } catch { /* noop */ }
                              }}
                              style={{
                                marginTop: 8, padding: "7px 12px", background: "none",
                                border: `1px solid ${C.cremeBorder}`, borderRadius: 8, fontSize: 12,
                                color: C.esmeralda, cursor: "pointer", fontWeight: 600,
                              }}>
                              {pixCopiado ? "✓ Copiado!" : "Copiar código Pix"}
                            </button>
                            <div style={{ marginTop: 10, fontSize: 12, color: C.cinza, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                              Aguardando o pagamento… a conta baixa sozinha.
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!modoManual && formaRecebimento === "Cartão de Crédito" && (
                      !cartaoAguardando ? (
                        <>
                          <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Maquininha</div>
                          <select
                            value={deviceSel}
                            onChange={e => setDeviceSel(e.target.value)}
                            style={{
                              width: "100%", fontSize: 13, padding: "8px 10px", marginBottom: 8,
                              border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff",
                              outline: "none", boxSizing: "border-box",
                            }}>
                            <option value="">Escolha a maquininha…</option>
                            {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.nome_legivel}</option>)}
                          </select>
                          <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Parcelas</div>
                          <select
                            value={parcelas}
                            onChange={e => setParcelas(Number(e.target.value))}
                            style={{
                              width: "100%", fontSize: 13, padding: "8px 10px", marginBottom: 8,
                              border: `1px solid ${C.cremeBorder}`, borderRadius: 6, background: "#fff",
                              outline: "none", boxSizing: "border-box",
                            }}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                          </select>
                          <button
                            onClick={cobrarNaMaquininha}
                            disabled={cartaoEnviando || !deviceSel}
                            style={{
                              width: "100%", padding: "10px", background: C.esmeralda, color: C.creme,
                              border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                              cursor: cartaoEnviando || !deviceSel ? "not-allowed" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                            }}>
                            {cartaoEnviando
                              ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Enviando...</>
                              : <><CreditCard size={14} /> Cobrar na maquininha</>}
                          </button>
                        </>
                      ) : (
                        <div style={{ textAlign: "center", padding: "8px 0" }}>
                          <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: C.esmeralda }} />
                          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: C.esmeralda }}>Passe o cartão na maquininha</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: C.cinza }}>A conta baixa sozinha quando aprovar.</div>
                          <button
                            onClick={cancelarMaquininha}
                            style={{
                              marginTop: 10, padding: "7px 12px", background: "none",
                              border: `1px solid ${C.cremeBorder}`, borderRadius: 8, fontSize: 12, color: C.cinza, cursor: "pointer",
                            }}>
                            Cancelar cobrança
                          </button>
                        </div>
                      )
                    )}

                    {/* Manual sem MP — EXCEÇÃO só do desenvolvedor */}
                    {modoManual && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Valor pago</div>
                        <input
                          type="text" inputMode="decimal"
                          value={valorPago}
                          onChange={e => setValorPago(e.target.value)}
                          placeholder={detalhe ? detalhe.valor.toFixed(2).replace(".", ",") : "0,00"}
                          style={{
                            width: "100%", fontSize: 15, fontWeight: 700, padding: "8px 10px",
                            border: `1px solid ${C.cremeBorder}`, borderRadius: 6, outline: "none",
                            background: "#fff", boxSizing: "border-box", fontFamily: "monospace", color: C.esmeralda,
                          }}
                        />
                        <div style={{ fontSize: 11, color: C.cinza, margin: "8px 0 3px" }}>Comprovante (obrigatório)</div>
                        <input
                          type="file" accept="image/*" capture="environment"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setComprovanteFile(file);
                            setComprovantePreview(URL.createObjectURL(file));
                          }}
                          style={{ width: "100%", fontSize: 12 }}
                        />
                        {comprovantePreview && (
                          <img src={comprovantePreview} alt="Comprovante"
                            style={{ marginTop: 6, height: 80, borderRadius: 6, objectFit: "cover" }} />
                        )}
                        <textarea
                          value={obs}
                          onChange={e => setObs(e.target.value)}
                          placeholder="Observação (ex: ID do Pix, motivo da exceção)..."
                          rows={2}
                          style={{
                            marginTop: 6, width: "100%", fontSize: 12, padding: "7px 10px",
                            border: `1px solid ${C.cremeBorder}`, borderRadius: 6, resize: "none",
                            outline: "none", background: "#fff", boxSizing: "border-box",
                          }}
                        />
                        <button
                          onClick={confirmarManualComComprovante}
                          disabled={baixando}
                          style={{
                            marginTop: 8, width: "100%", padding: "10px", background: C.ambar, color: "#fff",
                            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700,
                            cursor: baixando ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          }}>
                          {baixando
                            ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Confirmando...</>
                            : <><CheckCircle size={14} /> Confirmar baixa manual</>}
                        </button>
                      </div>
                    )}

                    {/* Atalho da exceção manual — visível só para o dev */}
                    {isDev && !pixQr && !cartaoAguardando && (
                      <button
                        onClick={() => { setModoManual(m => !m); setErr(""); }}
                        style={{
                          marginTop: 8, width: "100%", padding: "7px", background: "none",
                          border: `1px dashed ${C.cremeBorder}`, borderRadius: 8, fontSize: 11,
                          color: C.cinza, cursor: "pointer",
                        }}>
                        {modoManual ? "← Voltar ao fluxo validado" : "Lançar manual (comprovante) — só dev"}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setFormaRecebimento(null); setModoManual(false);
                        setPixQr(null); setComprovanteFile(null); setComprovantePreview(null);
                        setValorPago(""); setErr("");
                        setCartaoAguardando(false); setDeviceSel(""); setDevices([]);
                        if (pollRef.current) clearInterval(pollRef.current);
                      }}
                      style={{
                        marginTop: 8, padding: "8px 14px", background: "none", width: "100%",
                        border: `1px solid ${C.cremeBorder}`, borderRadius: 8, fontSize: 12, color: C.cinza, cursor: "pointer",
                      }}>
                      Voltar
                    </button>
                  </>
                )}

                {/* Demais formas → valor + (Ouro: peso/grama/foto) */}
                {formaRecebimento && formaRecebimento !== "Manual (MP)" && formaRecebimento !== "PagBank" && formaRecebimento !== "Vale-Troca" && formaRecebimento !== "Pix" && formaRecebimento !== "Cartão de Crédito" && (
                  <>
                    {/* Valor pago */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>
                        Valor pago{formaRecebimento === "Ouro" ? " (calculado do ouro)" : ""}
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formaRecebimento === "Ouro"
                          ? ((() => {
                              const p = parseFloat(ouroPeso.replace(",", "."));
                              const g = parseFloat(ouroValorGrama.replace(",", "."));
                              return p > 0 && g > 0 ? (p * g).toFixed(2).replace(".", ",") : "";
                            })())
                          : valorPago}
                        onChange={e => setValorPago(e.target.value)}
                        placeholder={detalhe ? detalhe.valor.toFixed(2).replace(".", ",") : "0,00"}
                        readOnly={formaRecebimento === "Ouro"}
                        style={{
                          width: "100%", fontSize: 15, fontWeight: 700, padding: "8px 10px",
                          border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                          outline: "none", background: formaRecebimento === "Ouro" ? "#f5f5f5" : "#fff",
                          boxSizing: "border-box", fontFamily: "monospace",
                          color: C.esmeralda,
                        }}
                      />
                      {detalhe && formaRecebimento !== "Ouro" && (
                        <div style={{ fontSize: 10, color: C.cinza, marginTop: 2 }}>
                          Valor total da conta: {fmtBRL(detalhe.valor)}
                          {parseFloat(valorPago.replace(",", ".")) > 0 && parseFloat(valorPago.replace(",", ".")) < detalhe.valor && (
                            <span style={{ color: C.ambar, fontWeight: 600 }}>
                              {" "}— restante: {fmtBRL(detalhe.valor - parseFloat(valorPago.replace(",", ".")))} será novo crédito
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ouro: peso + grama + foto */}
                    {formaRecebimento === "Ouro" && (
                      <div style={{ marginBottom: 8, padding: "10px", borderRadius: 6, border: `1px solid ${C.cremeBorder}`, background: "#fff" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, color: C.cinza, marginBottom: 2 }}>Peso (g)</div>
                            <input
                              type="number" step="0.001"
                              value={ouroPeso}
                              onChange={e => setOuroPeso(e.target.value)}
                              placeholder="0.000"
                              style={{
                                width: "100%", fontSize: 13, padding: "7px 8px",
                                border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                                outline: "none", boxSizing: "border-box",
                              }}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: C.cinza, marginBottom: 2 }}>Valor grama (R$)</div>
                            <input
                              type="number" step="0.01"
                              value={ouroValorGrama}
                              onChange={e => setOuroValorGrama(e.target.value)}
                              placeholder="0.00"
                              style={{
                                width: "100%", fontSize: 13, padding: "7px 8px",
                                border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                                outline: "none", boxSizing: "border-box",
                              }}
                            />
                          </div>
                        </div>
                        {(() => {
                          const p = parseFloat(ouroPeso.replace(",", "."));
                          const g = parseFloat(ouroValorGrama.replace(",", "."));
                          if (p > 0 && g > 0) return (
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.esmeralda, marginBottom: 8 }}>
                              Total: {fmtBRL(p * g)}
                            </div>
                          );
                          return null;
                        })()}
                        <div>
                          <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>Foto da balança (obrigatória)</div>
                          <input
                            type="file" accept="image/*" capture="environment"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setOuroFotoFile(file);
                              setOuroFotoPreview(URL.createObjectURL(file));
                            }}
                            style={{ width: "100%", fontSize: 12 }}
                          />
                          {ouroFotoPreview && (
                            <img src={ouroFotoPreview} alt="Balança"
                              style={{ marginTop: 6, height: 80, borderRadius: 6, objectFit: "cover" }} />
                          )}
                        </div>
                      </div>
                    )}

                    <textarea
                      value={obs}
                      onChange={e => setObs(e.target.value)}
                      placeholder="Observação adicional (opcional)..."
                      rows={2}
                      style={{
                        marginTop: 6, width: "100%", fontSize: 12, padding: "7px 10px",
                        border: `1px solid ${C.cremeBorder}`, borderRadius: 6,
                        resize: "none", outline: "none", background: "#fff",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => { setFormaRecebimento(null); setValorPago(""); setOuroPeso(""); setOuroValorGrama(""); setOuroFotoFile(null); setOuroFotoPreview(null); setErr(""); }}
                        style={{
                          padding: "10px 14px", background: "none", border: `1px solid ${C.cremeBorder}`,
                          borderRadius: 8, fontSize: 12, color: C.cinza, cursor: "pointer",
                        }}>
                        Voltar
                      </button>
                      <button
                        onClick={handleConfirmar}
                        disabled={baixando || ouroUploading}
                        style={{
                          flex: 1, padding: "10px",
                          background: C.esmeralda, color: C.creme, border: "none",
                          borderRadius: 8, fontSize: 13, fontWeight: 700,
                          cursor: baixando || ouroUploading ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        {ouroUploading
                          ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Enviando foto...</>
                          : baixando
                          ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Confirmando...</>
                          : <><CheckCircle size={14} /> Confirmar Recebimento</>
                        }
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {err && (
              <div style={{ padding: "8px 12px", borderRadius: 6, background: C.vermelhoLt, color: C.vermelho, fontSize: 12, marginBottom: 12 }}>
                {err}
              </div>
            )}

            {/* Timeline de comunicações */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <MessageSquare size={13} /> Histórico ({detalhe.comunicacoes.length})
              </div>

              {/* Comprovantes/fotos anexados nas baixas desta venda (bucket) */}
              {detalhe.fotos && detalhe.fotos.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.cinza, marginBottom: 6 }}>
                    Comprovantes anexados ({detalhe.fotos.length})
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {detalhe.fotos.map(f => (
                      <a
                        key={f.path}
                        href={getPublicUrl("pagamento-fotos", f.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir comprovante"
                        style={{ display: "block", width: 64, height: 64, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.cremeBorder}`, flexShrink: 0 }}
                      >
                        <img
                          src={getPublicUrl("pagamento-fotos", f.path)}
                          alt="Comprovante anexado"
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {detalhe.comunicacoes.length === 0 && (
                <div style={{ fontSize: 12, color: C.cinza, fontStyle: "italic" }}>Sem registros ainda.</div>
              )}
              {detalhe.comunicacoes.map(cc => (
                <div key={cc.id} style={{
                  marginBottom: 8, padding: "8px 10px", borderRadius: 6,
                  background: cc.tipo === "aviso_recebimento" ? C.verdeLt : C.cremeBg,
                  border: `1px solid ${C.cremeBorder}`,
                }}>
                  <div style={{ fontSize: 11, color: C.cinza, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: cc.tipo === "aviso_recebimento" ? C.verde : C.esmeralda }}>
                      {cc.tipo === "aviso_recebimento" ? "✓ Recebimento" : cc.tipo === "cobranca" ? "⚠ Cobrança" : "Obs."}
                    </span>
                    {" · "}{cc.usuario_nome ?? "Sistema"} · {fmtDtHr(cc.created_at)}
                  </div>
                  <div style={{ fontSize: 12, color: "#1f2937" }}>{cc.mensagem}</div>
                </div>
              ))}

              {/* Nova observação */}
              <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                <input
                  value={novaMsg}
                  onChange={e => setNovaMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleEnviarMensagem(); } }}
                  placeholder="Adicionar observação..."
                  style={{
                    flex: 1, fontSize: 12, padding: "7px 10px",
                    border: `1px solid ${C.cremeBorder}`, borderRadius: 6, outline: "none",
                  }}
                />
                <button
                  onClick={handleEnviarMensagem}
                  disabled={!novaMsg.trim() || enviandoMsg}
                  style={{
                    padding: "7px 12px", background: C.esmeralda, color: "#fff",
                    border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    opacity: !novaMsg.trim() || enviandoMsg ? 0.5 : 1,
                  }}
                >
                  {enviandoMsg ? "..." : "OK"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Componente: Card de venda (agrupa parcelas da mesma venda) ────────────────
function VendaCard({
  numeroVenda,
  clienteNome,
  vendedorNome,
  dataVenda,
  parcelas,
  isGerente,
  onSelectParcela,
}: {
  vendaId?: number | null;
  numeroVenda: string | null;
  clienteNome: string | null;
  vendedorNome: string | null;
  dataVenda: string | null;
  parcelas: CrediarioItem[];
  isGerente: boolean;
  onSelectParcela: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalPendente = parcelas.filter(p => p.situacao === "pendente").reduce((s, p) => s + p.valor, 0);
  const totalVencido  = parcelas.filter(p => p.status_aging === "vencido" && p.situacao === "pendente").reduce((s, p) => s + p.valor, 0);
  const hasVencido    = totalVencido > 0;
  const hasBreve      = !hasVencido && parcelas.some(p => p.status_aging === "vence_em_breve" && p.situacao === "pendente");
  const qtdPendentes  = parcelas.filter(p => p.situacao === "pendente").length;
  const temPendente   = qtdPendentes > 0;

  // Status do card (faixa lateral + badge): vencido > vence em breve > em dia.
  const statusCor   = hasVencido ? C.vermelho : hasBreve ? C.ambar : C.esmeralda;
  const statusBg    = hasVencido ? C.vermelhoLt : hasBreve ? C.ambarLt : C.esmeraldaLt;
  const statusLabel = hasVencido ? "vencido" : hasBreve ? "vence em breve" : "em dia";

  return (
    <div style={{
      border: `1px solid ${C.cremeBorder}`,
      borderLeft: `3px solid ${temPendente ? statusCor : C.cremeBorder}`,
      borderRadius: 12,
      background: "#fff",
      marginBottom: 10,
    }}>
      {/* Header da venda */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
          borderRadius: expanded ? "0 12px 0 0" : "0 12px 12px 0",
          borderBottom: expanded ? `1px solid ${C.cremeBorder}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {expanded ? <ChevronDown size={16} color={C.cinza} /> : <ChevronRight size={16} color={C.cinza} />}
          <div style={{ textAlign: "left", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: C.esmeralda }}>
                {numeroVenda ? `Venda ${numeroVenda}` : "Sem venda"}
              </span>
              {temPendente && (
                <>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: statusBg, color: statusCor,
                  }}>
                    {statusLabel}
                  </span>
                  <span style={{ fontSize: 11, color: C.cinza }}>
                    {qtdPendentes} pendente{qtdPendentes > 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.cinza, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span><User size={11} style={{ display: "inline", marginRight: 3 }} />{clienteNome ?? "—"}</span>
              {isGerente && vendedorNome && (
                <span style={{ color: C.esmeralda }}>• {vendedorNome}</span>
              )}
              {dataVenda && (
                <span style={{ color: C.cinza }}>
                  <Calendar size={11} style={{ display: "inline", marginRight: 3 }} />
                  Venda {fmtData(dataVenda)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          {totalPendente > 0 && (
            <div style={{ fontWeight: 700, fontSize: 15, color: hasVencido ? C.vermelho : C.esmeralda }}>
              {fmtBRL(totalPendente)}
            </div>
          )}
          {hasVencido && (
            <div style={{ fontSize: 11, color: C.vermelho }}>
              {fmtBRL(totalVencido)} vencido
            </div>
          )}
        </div>
      </button>

      {/* Lista de parcelas */}
      {expanded && (
        <div style={{ padding: "8px 16px 12px" }}>
          {parcelas.map((p) => {
            const aging = agingLabel(p.status_aging, p.dias_atraso);
            return (
              <div
                key={p.conta_receber_id}
                onClick={() => onSelectParcela(p.conta_receber_id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: `1px solid ${C.cremeBorder}`,
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1f2937" }}>{p.descricao}</div>
                  <div style={{ fontSize: 11, color: C.cinza, marginTop: 2 }}>
                    Vence: {fmtData(p.data_vencimento)}
                    {p.data_recebimento && ` · Recebido: ${fmtData(p.data_recebimento)}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 12, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: aging.bg, color: aging.color,
                  }}>
                    {aging.text}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937", minWidth: 70, textAlign: "right" }}>
                    {fmtBRL(p.valor)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CrediarioClient({ items, contagens, saldo, userRole, vendedorId }: Props) {
  const [filtroSituacao, setFiltroSituacao] = useState<string>("pendente");
  const [filtroAging, setFiltroAging] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [filtroConsultora, setFiltroConsultora] = useState<string>("");
  const [contagensConsultora, setContagensConsultora] = useState<Contagens | null>(null);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(15);
  const [periodoPreset, setPeriodoPreset] = useState("mes");
  const [periodoCustom, setPeriodoCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [periodoMetrics, setPeriodoMetrics] = useState<{ vendido: number; recebido: number } | null>(null);
  const [loadedItems, setLoadedItems] = useState<CrediarioItem[]>(items);
  const [loading, setLoading] = useState(false);
  const [selectedContaId, setSelectedContaId] = useState<number | null>(null);

  // Faixa de alerta de vencidos NA TELA (Fase 4 crediário): aparece se há contas
  // vencidas e some com "ok"; reaparece no dia seguinte. Regra do Jonathan:
  // "todas as notificações na tela, senão elas não olham". Começa escondida no
  // SSR (sem localStorage) e o effect a mostra se ainda não deu "ok" hoje.
  const [faixaOk, setFaixaOk] = useState(true);
  useEffect(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    setFaixaOk(localStorage.getItem("crediario_faixa_ok") === hoje);
  }, []);
  const dispensarFaixa = () => {
    localStorage.setItem("crediario_faixa_ok", new Date().toISOString().slice(0, 10));
    setFaixaOk(true);
  };

  const isGerente = ["desenvolvedor", "admin", "gerente_loja"].includes(userRole);
  // Quem pode registrar baixa: gerente + consultora (no back, a consultora
  // só baixa conta de venda DELA — ownership em requireCrediarioOwnership).
  const podeBaixar = isGerente || userRole === "consultora";

  // Deep-link "Receber no Crediario" (vindo da tela da venda):
  // /crediario?venda=<id> abre direto o drawer da conta pendente daquela venda,
  // economizando cliques do colaborador. O SSR traz so as primeiras 50 contas
  // (vencidas no topo); se a conta da venda nao estiver carregada, busca na API
  // antes de abrir. Roda uma vez (guard) pra nao reabrir o drawer ao fechar.
  const deeplinkFeito = useRef(false);
  useEffect(() => {
    if (deeplinkFeito.current) return;
    const vid = Number(new URLSearchParams(window.location.search).get("venda"));
    if (!vid) return;
    deeplinkFeito.current = true;
    const abrir = (lista: CrediarioItem[]) => {
      const c = lista
        .filter(i => i.venda_id === vid && i.situacao === "pendente")
        .sort((a, b) => (a.data_vencimento ?? "9999").localeCompare(b.data_vencimento ?? "9999"))[0];
      if (c) { setSelectedContaId(c.conta_receber_id); return true; }
      return false;
    };
    if (abrir(loadedItems)) return;
    const params = new URLSearchParams({ situacao: "pendente", limit: "500" });
    if (!isGerente && vendedorId) params.set("vendedor_id", String(vendedorId));
    void apiFetch<{ items: CrediarioItem[] }>(`/api/crediario?${params}`)
      .then(d => abrir(d.items))
      .catch(() => {});
  }, [loadedItems, isGerente, vendedorId]);

  const reload = useCallback(async (situacao: string, aging: string) => {
    setLoading(true);
    try {
      // Pagos: busca mais itens pois pode acumular histórico longo
      // Carrega tudo (a loja é pequena) e a paginação é client-side por venda —
      // assim o agrupamento não quebra entre páginas e funciona com os filtros.
      const params = new URLSearchParams({ limit: "1500" });
      if (situacao) params.set("situacao", situacao);
      if (aging)    params.set("status_aging", aging);
      if (!isGerente && vendedorId) params.set("vendedor_id", String(vendedorId));
      const data = await apiFetch<{ items: CrediarioItem[] }>(`/api/crediario?${params}`);
      setLoadedItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [isGerente, vendedorId]);

  // Resumo (cards/abas/alerta) por consultora: ao escolher uma, busca os números
  // DELA no servidor; em "Todas", volta ao global (prop). O Saldo Crédito NÃO
  // entra aqui — é da loja (sempre global).
  useEffect(() => {
    if (!filtroConsultora || !isGerente) { setContagensConsultora(null); return; }
    let cancelado = false;
    void apiFetch<{ contagens?: Contagens }>(`/api/crediario?vendedor_id=${filtroConsultora}&counts=1&limit=1`)
      .then(d => { if (!cancelado) setContagensConsultora(d.contagens ?? null); })
      .catch(() => { if (!cancelado) setContagensConsultora(null); });
    return () => { cancelado = true; };
  }, [filtroConsultora, isGerente]);

  // Volta pra 1ª página sempre que o conjunto exibido muda (filtro/busca/tamanho).
  useEffect(() => { setPagina(1); }, [filtroSituacao, filtroAging, busca, filtroConsultora, porPagina]);

  // Período (Vendeu/Recebeu): busca os valores do período escolhido, respeitando
  // a consultora selecionada (gerente). Consultora logada já vê só os dela.
  useEffect(() => {
    const { from, to } = rangeDoPeriodo(periodoPreset, periodoCustom);
    if (!from || !to) { setPeriodoMetrics(null); return; }
    const params = new URLSearchParams({ limit: "1", from, to });
    if (filtroConsultora && isGerente) params.set("vendedor_id", filtroConsultora);
    let cancelado = false;
    void apiFetch<{ periodo?: { vendido: number; recebido: number } }>(`/api/crediario?${params}`)
      .then(d => { if (!cancelado) setPeriodoMetrics(d.periodo ?? null); })
      .catch(() => { if (!cancelado) setPeriodoMetrics(null); });
    return () => { cancelado = true; };
  }, [periodoPreset, periodoCustom, filtroConsultora, isGerente]);

  const handleFiltroSituacao = (s: string) => {
    setFiltroSituacao(s);
    setFiltroAging("");
    void reload(s, "");
  };

  const handleFiltroAging = (a: string) => {
    const next = filtroAging === a ? "" : a;
    setFiltroAging(next);
    void reload(filtroSituacao, next);
  };

  const handleBaixaConfirmada = useCallback((contaId: number) => {
    // Remove o item da lista e recarrega
    setLoadedItems(prev => prev.filter(i => i.conta_receber_id !== contaId));
    void reload(filtroSituacao, filtroAging);
  }, [filtroSituacao, filtroAging, reload]);

  // Lista de consultoras presentes (para o filtro — só faz sentido p/ gerente,
  // que enxerga várias; a consultora já recebe só as vendas dela).
  const consultoras = useMemo(() => {
    const map = new Map<number, string>();
    for (const i of loadedItems) {
      if (i.vendedor_id != null && i.vendedor_nome) map.set(i.vendedor_id, i.vendedor_nome);
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [loadedItems]);

  // Agrupa por venda
  const vendaGroups = useMemo(() => {
    const buscaLc = busca.trim().toLowerCase();
    const filtered = loadedItems.filter(i => {
      if (filtroConsultora && String(i.vendedor_id) !== filtroConsultora) return false;
      if (!buscaLc) return true;
      return (
        (i.cliente_nome ?? "").toLowerCase().includes(buscaLc) ||
        (i.numero_venda ?? "").toLowerCase().includes(buscaLc) ||
        (i.vendedor_nome ?? "").toLowerCase().includes(buscaLc)
      );
    });

    const map = new Map<string, CrediarioItem[]>();
    for (const item of filtered) {
      const key = item.venda_id ? String(item.venda_id) : `sem-venda-${item.conta_receber_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([key, parcelas]) => ({ key, parcelas }));
  }, [loadedItems, busca, filtroConsultora]);

  const saldoUsado = saldo ? saldo.limite - saldo.atual : 0;
  const saldoPct = saldo ? Math.min(100, (saldoUsado / saldo.limite) * 100) : 0;

  // Resumo exibido: o da consultora escolhida, ou o global (prop). O Saldo
  // Crédito é à parte (sempre global — da loja).
  const contagensView = contagensConsultora ?? contagens;
  const consultoraSelNome = filtroConsultora
    ? consultoras.find(c => String(c.id) === filtroConsultora)?.nome ?? null
    : null;
  const contasFiltradas = vendaGroups.reduce((s, g) => s + g.parcelas.length, 0);

  // Paginação (client-side, por venda): fatia os grupos já filtrados.
  const totalPaginas = Math.max(1, Math.ceil(vendaGroups.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const vendaGroupsPagina = vendaGroups.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const tabs = [
    { key: "pendente", label: "Pendentes", count: contagensView.pendente },
    { key: "pago",     label: "Pagos",     count: contagensView.pago },
    { key: "",         label: "Todos",     count: contagensView.total },
  ];

  return (
    <div style={{ background: C.cremeBg, minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: C.esmeraldaLt, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CreditCard size={20} color={C.esmeralda} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.esmeralda }}>Crediário</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.cinza }}>A Receber — vendas a prazo</p>
          </div>
          <button
            onClick={() => void reload(filtroSituacao, filtroAging)}
            disabled={loading}
            style={{
              marginLeft: "auto", background: "none", border: `1px solid ${C.cremeBorder}`,
              borderRadius: 8, padding: "6px 10px", cursor: "pointer",
            }}
          >
            <RefreshCw size={14} color={C.cinza} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
          </button>
        </div>

        {/* ── Faixa de alerta de vencidos (some com "ok", volta no dia seguinte) ── */}
        {contagensView.vencido > 0 && !faixaOk && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.vermelho, color: "#fff", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
              {consultoraSelNome ? `${consultoraSelNome} tem` : "Você tem"} {contagensView.vencido} conta{contagensView.vencido !== 1 ? "s" : ""} vencida{contagensView.vencido !== 1 ? "s" : ""} ({fmtBRL(contagensView.valor_vencido)}). Cobre os clientes!
            </div>
            <button onClick={dispensarFaixa} style={{ background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              ok
            </button>
          </div>
        )}

        {/* ── Cards de resumo ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={12} /> Pendente
              {consultoraSelNome && <span style={chipConsultora}>{primeiroNome(consultoraSelNome)}</span>}
            </div>
            <div style={{ fontWeight: 700, fontSize: 20, color: C.esmeralda }}>{fmtBRL(contagensView.valor_pendente)}</div>
            <div style={{ fontSize: 11, color: C.cinza }}>{contagensView.pendente} conta{contagensView.pendente !== 1 ? "s" : ""}</div>
          </div>

          {contagensView.vencido > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${C.vermelho}40`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: C.vermelho, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={12} /> Vencido
                {consultoraSelNome && <span style={{ ...chipConsultora, background: C.vermelhoLt, color: C.vermelho }}>{primeiroNome(consultoraSelNome)}</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: C.vermelho }}>{fmtBRL(contagensView.valor_vencido)}</div>
              <div style={{ fontSize: 11, color: C.vermelho }}>{contagensView.vencido} conta{contagensView.vencido !== 1 ? "s" : ""}</div>
            </div>
          )}

          {/* Saldo da gerente — só visível para gerente/admin */}
          {saldo && (
            <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <Wallet size={12} /> Saldo Crédito
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: saldo.atual < saldo.limite * 0.2 ? C.vermelho : C.esmeralda }}>
                {fmtBRL(saldo.atual)}
              </div>
              <div style={{ fontSize: 11, color: C.cinza }}>de {fmtBRL(saldo.limite)}</div>
              <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: C.cremeBorder, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${saldoPct}%`, borderRadius: 2,
                  background: saldoPct > 80 ? C.vermelho : saldoPct > 50 ? C.ambar : C.verde,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Período: quanto vendeu em crediário x quanto recebeu ──────────────
            "Vendeu" = crediário gerado em vendas do período; "Recebeu" = baixado
            no período. Segue a consultora filtrada (ou global / a própria). */}
        <div style={{ marginBottom: 20, background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginRight: 2 }}>
              Período{consultoraSelNome ? ` — ${primeiroNome(consultoraSelNome)}` : ""}:
            </span>
            {PERIODOS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodoPreset(p.key)}
                style={{
                  padding: "4px 11px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  background: periodoPreset === p.key ? C.esmeralda : C.cremeBg,
                  color:      periodoPreset === p.key ? "#fff" : C.cinza,
                }}
              >
                {p.label}
              </button>
            ))}
            {periodoPreset === "custom" && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={periodoCustom.from} onChange={e => setPeriodoCustom(c => ({ ...c, from: e.target.value }))}
                  style={{ fontSize: 12, padding: "3px 6px", border: `1px solid ${C.cremeBorder}`, borderRadius: 6 }} />
                <span style={{ fontSize: 12, color: C.cinza }}>até</span>
                <input type="date" value={periodoCustom.to} onChange={e => setPeriodoCustom(c => ({ ...c, to: e.target.value }))}
                  style={{ fontSize: 12, padding: "3px 6px", border: `1px solid ${C.cremeBorder}`, borderRadius: 6 }} />
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div style={{ background: C.cremeBg, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <CreditCard size={12} /> Vendeu em crediário
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: C.esmeralda }}>{periodoMetrics ? fmtBRL(periodoMetrics.vendido) : "—"}</div>
            </div>
            <div style={{ background: C.cremeBg, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle size={12} /> Recebeu
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: C.verde }}>{periodoMetrics ? fmtBRL(periodoMetrics.recebido) : "—"}</div>
            </div>
          </div>
        </div>

        {/* ── Filtros ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: C.cremeBg, borderRadius: 10, padding: 3, gap: 2 }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => handleFiltroSituacao(t.key)}
                style={{
                  padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: filtroSituacao === t.key ? C.esmeralda : "transparent",
                  color:      filtroSituacao === t.key ? "#fff" : C.cinza,
                }}
              >
                {t.label} {t.count > 0 && <span style={{ opacity: 0.7 }}>({t.count})</span>}
              </button>
            ))}
          </div>

          {filtroSituacao === "pendente" && (
            <>
              <button
                onClick={() => handleFiltroAging("vencido")}
                style={{
                  padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12,
                  background: filtroAging === "vencido" ? C.vermelho : C.vermelhoLt,
                  color:      filtroAging === "vencido" ? "#fff" : C.vermelho,
                }}
              >
                <AlertTriangle size={11} style={{ display: "inline", marginRight: 4 }} />
                Vencidos
              </button>
              <button
                onClick={() => handleFiltroAging("vence_em_breve")}
                style={{
                  padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12,
                  background: filtroAging === "vence_em_breve" ? C.ambar : C.ambarLt,
                  color:      filtroAging === "vence_em_breve" ? "#fff" : C.ambar,
                }}
              >
                Vence em breve
              </button>
            </>
          )}
        </div>

        {/* ── Busca + filtro de consultora ──────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{
            flex: 1, minWidth: 200,
            display: "flex", alignItems: "center", gap: 8,
            background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 8,
            padding: "8px 12px",
          }}>
            <Search size={15} color={C.cinza} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por cliente, venda ou consultora..."
              style={{ border: "none", outline: "none", flex: 1, fontSize: 13, background: "transparent", color: "#1f2937" }}
            />
          </div>

          {/* Filtro por consultora — só gerente/admin (a consultora já vê só as dela) */}
          {isGerente && consultoras.length > 1 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, minWidth: 200,
              background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 8,
              padding: "8px 12px",
            }}>
              <User size={15} color={C.cinza} />
              <select
                value={filtroConsultora}
                onChange={e => setFiltroConsultora(e.target.value)}
                style={{ border: "none", outline: "none", flex: 1, fontSize: 13, background: "transparent", color: "#1f2937", cursor: "pointer" }}
              >
                <option value="">Todas as consultoras</option>
                {consultoras.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Lista de vendas agrupadas ─────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 size={24} color={C.esmeralda} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : vendaGroups.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: C.cinza }}>
            <CreditCard size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 14 }}>Nenhum registro encontrado</p>
          </div>
        ) : (
          vendaGroupsPagina.map(({ key, parcelas }) => {
            const first = parcelas[0];
            return (
              <VendaCard
                key={key}
                vendaId={first.venda_id}
                numeroVenda={first.numero_venda}
                clienteNome={first.cliente_nome}
                vendedorNome={first.vendedor_nome}
                dataVenda={first.venda_created_at}
                parcelas={parcelas}
                isGerente={isGerente}
                onSelectParcela={setSelectedContaId}
              />
            );
          })
        )}

        {vendaGroups.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {totalPaginas > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={paginaSegura <= 1}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.cremeBorder}`,
                    background: "#fff", fontSize: 13, color: C.cinza,
                    cursor: paginaSegura <= 1 ? "not-allowed" : "pointer", opacity: paginaSegura <= 1 ? 0.5 : 1,
                  }}
                >
                  ‹ Anterior
                </button>
                <span style={{ fontSize: 13, color: C.cinza, minWidth: 110, textAlign: "center" }}>
                  Página {paginaSegura} de {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={paginaSegura >= totalPaginas}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.cremeBorder}`,
                    background: "#fff", fontSize: 13, color: C.cinza,
                    cursor: paginaSegura >= totalPaginas ? "not-allowed" : "pointer", opacity: paginaSegura >= totalPaginas ? 0.5 : 1,
                  }}
                >
                  Próxima ›
                </button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.cinza, flexWrap: "wrap", justifyContent: "center" }}>
              <span>{vendaGroups.length} venda{vendaGroups.length !== 1 ? "s" : ""} — {contasFiltradas} conta{contasFiltradas !== 1 ? "s" : ""}</span>
              <span style={{ color: C.cremeBorder }}>|</span>
              <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                Por página:
                <select
                  value={porPagina}
                  onChange={e => setPorPagina(Number(e.target.value))}
                  style={{ border: `1px solid ${C.cremeBorder}`, borderRadius: 6, padding: "2px 6px", fontSize: 12, background: "#fff", cursor: "pointer" }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ── Drawer de detalhe ─────────────────────────────────────────────── */}
      {selectedContaId !== null && (
        <DetalheDrawer
          contaId={selectedContaId}
          podeBaixar={podeBaixar}
          isDev={userRole === "desenvolvedor"}
          onClose={() => setSelectedContaId(null)}
          onBaixa={handleBaixaConfirmada}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
