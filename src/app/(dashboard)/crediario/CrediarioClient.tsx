"use client";

import { useState, useMemo, useCallback } from "react";
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
  X,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { createClient } from "@/lib/supabase/client";
import { getPublicUrl } from "@/lib/storage-url";

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
function fmtData(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}
function fmtDtHr(s: string) {
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function agingLabel(status: string, dias: number) {
  if (status === "pago") return { text: "Pago", color: C.verde, bg: C.verdeLt };
  if (status === "vencido") return { text: `Vencido ${dias}d`, color: C.vermelho, bg: C.vermelhoLt };
  if (status === "vence_em_breve") return { text: "Vence em breve", color: C.ambar, bg: C.ambarLt };
  return { text: "Em dia", color: C.esmeralda, bg: C.esmeraldaLt };
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
  isGerente,
  onClose,
  onBaixa,
}: {
  contaId: number;
  isGerente: boolean;
  onClose: () => void;
  onBaixa: (id: number) => void;
}) {
  const [detalhe, setDetalhe] = useState<ContaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [mpPaymentId, setMpPaymentId] = useState("");
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

  async function handleVerificarMp() {
    if (!mpPaymentId.trim()) {
      setErr("Informe o ID do pagamento do Mercado Pago");
      return;
    }
    setBaixando(true);
    setErr("");
    try {
      await apiFetch(`/api/crediario/${contaId}/verificar-mp`, {
        method: "POST",
        body: JSON.stringify({
          payment_id: mpPaymentId.trim(),
          obs: obs.trim() || undefined,
        }),
      });
      onBaixa(contaId);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao verificar pagamento");
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
  const podeRegistrarBaixa = isGerente && detalhe?.situacao === "pendente";

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
                <div style={{ fontSize: 12, color: C.cinza }}>{detalhe.cliente_telefone}</div>
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
                border: `1px solid ${formaRecebimento === "Manual (MP)" ? "#0070E040" : C.verde}40`,
                background: formaRecebimento === "Manual (MP)" ? "#EBF5FB" : C.cremeBg,
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
                      {(["Dinheiro", "Cartão de Crédito", "Pix", "Ouro", "Vale-Troca", "Manual (MP)"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => {
                            setFormaRecebimento(f);
                            setErr("");
                            if (f !== "Manual (MP)") {
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
                {formaRecebimento === "Manual (MP)" && (
                  <>
                    <div style={{ fontSize: 11, color: "#4A6FA5", marginBottom: 10, lineHeight: 1.5 }}>
                      Informe o ID do pagamento MP recebido do cliente. O sistema consulta a API do Mercado Pago e só confirma se o status for <b>approved</b>.
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

                {/* Demais formas → valor + (Ouro: peso/grama/foto) */}
                {formaRecebimento && formaRecebimento !== "Manual (MP)" && (
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
  parcelas,
  isGerente,
  onSelectParcela,
}: {
  vendaId?: number | null;
  numeroVenda: string | null;
  clienteNome: string | null;
  vendedorNome: string | null;
  parcelas: CrediarioItem[];
  isGerente: boolean;
  onSelectParcela: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalPendente = parcelas.filter(p => p.situacao === "pendente").reduce((s, p) => s + p.valor, 0);
  const totalVencido  = parcelas.filter(p => p.status_aging === "vencido" && p.situacao === "pendente").reduce((s, p) => s + p.valor, 0);
  const hasVencido    = totalVencido > 0;
  const qtdPendentes  = parcelas.filter(p => p.situacao === "pendente").length;

  return (
    <div style={{
      border: `1px solid ${hasVencido ? C.vermelho + "40" : C.cremeBorder}`,
      borderRadius: 10,
      background: hasVencido ? C.vermelhoLt + "40" : "#fff",
      marginBottom: 10,
    }}>
      {/* Header da venda */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
          borderRadius: expanded ? "10px 10px 0 0" : 10,
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
              {qtdPendentes > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
                  background: hasVencido ? C.vermelhoLt : C.esmeraldaLt,
                  color: hasVencido ? C.vermelho : C.esmeralda,
                }}>
                  {qtdPendentes} pendente{qtdPendentes > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.cinza, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span><User size={11} style={{ display: "inline", marginRight: 3 }} />{clienteNome ?? "—"}</span>
              {isGerente && vendedorNome && (
                <span style={{ color: C.esmeralda }}>• {vendedorNome}</span>
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
  const [loadedItems, setLoadedItems] = useState<CrediarioItem[]>(items);
  const [loading, setLoading] = useState(false);
  const [selectedContaId, setSelectedContaId] = useState<number | null>(null);

  const isGerente = ["desenvolvedor", "admin", "gerente_loja"].includes(userRole);

  const reload = useCallback(async (situacao: string, aging: string) => {
    setLoading(true);
    try {
      // Pagos: busca mais itens pois pode acumular histórico longo
      const params = new URLSearchParams({ limit: situacao === "pago" ? "500" : "200" });
      if (situacao) params.set("situacao", situacao);
      if (aging)    params.set("status_aging", aging);
      if (!isGerente && vendedorId) params.set("vendedor_id", String(vendedorId));
      const data = await apiFetch<{ items: CrediarioItem[] }>(`/api/crediario?${params}`);
      setLoadedItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [isGerente, vendedorId]);

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

  // Agrupa por venda
  const vendaGroups = useMemo(() => {
    const filtered = busca.trim()
      ? loadedItems.filter(i =>
          (i.cliente_nome ?? "").toLowerCase().includes(busca.toLowerCase()) ||
          (i.numero_venda ?? "").toLowerCase().includes(busca.toLowerCase()) ||
          (i.vendedor_nome ?? "").toLowerCase().includes(busca.toLowerCase())
        )
      : loadedItems;

    const map = new Map<string, CrediarioItem[]>();
    for (const item of filtered) {
      const key = item.venda_id ? String(item.venda_id) : `sem-venda-${item.conta_receber_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([key, parcelas]) => ({ key, parcelas }));
  }, [loadedItems, busca]);

  const saldoUsado = saldo ? saldo.limite - saldo.atual : 0;
  const saldoPct = saldo ? Math.min(100, (saldoUsado / saldo.limite) * 100) : 0;

  const tabs = [
    { key: "pendente", label: "Pendentes", count: contagens.pendente },
    { key: "pago",     label: "Pagos",     count: contagens.pago },
    { key: "",         label: "Todos",     count: contagens.total },
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

        {/* ── Cards de resumo ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
              <Clock size={12} /> Pendente
            </div>
            <div style={{ fontWeight: 700, fontSize: 20, color: C.esmeralda }}>{fmtBRL(contagens.valor_pendente)}</div>
            <div style={{ fontSize: 11, color: C.cinza }}>{contagens.pendente} conta{contagens.pendente !== 1 ? "s" : ""}</div>
          </div>

          {contagens.vencido > 0 && (
            <div style={{ background: C.vermelhoLt, border: `1px solid ${C.vermelho}30`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: C.vermelho, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={12} /> Vencido
              </div>
              <div style={{ fontWeight: 700, fontSize: 20, color: C.vermelho }}>{fmtBRL(contagens.valor_vencido)}</div>
              <div style={{ fontSize: 11, color: C.vermelho }}>{contagens.vencido} conta{contagens.vencido !== 1 ? "s" : ""}</div>
            </div>
          )}

          <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: C.cinza, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
              <CheckCircle size={12} /> Recebidos
            </div>
            <div style={{ fontWeight: 700, fontSize: 20, color: C.verde }}>{contagens.pago}</div>
            <div style={{ fontSize: 11, color: C.cinza }}>contas pagas</div>
          </div>

          {/* Saldo da gerente — só visível para gerente/admin */}
          {saldo && (
            <div style={{ background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 10, padding: "14px 16px" }}>
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

        {/* ── Filtros ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleFiltroSituacao(t.key)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: filtroSituacao === t.key ? C.esmeralda : "#fff",
                color:      filtroSituacao === t.key ? "#fff" : C.cinza,
                boxShadow:  filtroSituacao === t.key ? "none" : `0 0 0 1px ${C.cremeBorder}`,
              }}
            >
              {t.label} {t.count > 0 && <span style={{ opacity: 0.7 }}>({t.count})</span>}
            </button>
          ))}

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

        {/* ── Busca ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#fff", border: `1px solid ${C.cremeBorder}`, borderRadius: 8,
          padding: "8px 12px", marginBottom: 16,
        }}>
          <Search size={15} color={C.cinza} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por cliente, venda ou consultora..."
            style={{ border: "none", outline: "none", flex: 1, fontSize: 13, background: "transparent", color: "#1f2937" }}
          />
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
          vendaGroups.map(({ key, parcelas }) => {
            const first = parcelas[0];
            return (
              <VendaCard
                key={key}
                vendaId={first.venda_id}
                numeroVenda={first.numero_venda}
                clienteNome={first.cliente_nome}
                vendedorNome={first.vendedor_nome}
                parcelas={parcelas}
                isGerente={isGerente}
                onSelectParcela={setSelectedContaId}
              />
            );
          })
        )}

        {vendaGroups.length > 0 && (
          <p style={{ textAlign: "center", fontSize: 12, color: C.cinza, marginTop: 16 }}>
            {vendaGroups.length} venda{vendaGroups.length !== 1 ? "s" : ""} — {loadedItems.length} conta{loadedItems.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Drawer de detalhe ─────────────────────────────────────────────── */}
      {selectedContaId !== null && (
        <DetalheDrawer
          contaId={selectedContaId}
          isGerente={isGerente}
          onClose={() => setSelectedContaId(null)}
          onBaixa={handleBaixaConfirmada}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
