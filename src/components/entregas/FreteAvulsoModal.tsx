"use client";

/**
 * FreteAvulsoModal — Modal para criar uma corrida avulsa de motoboy.
 *
 * REGRA DE NEGÓCIO: frete avulso não tem venda vinculada. O motoboy realiza
 * a corrida (buscar peça, levar material, etc.) e confirma no app com um botão.
 * Sem código de verificação, sem WhatsApp.
 *
 * IMPACTO SE ALTERADO: delegar a criação para POST /api/entregas-venda/frete-avulso.
 * Não fazer INSERT direto.
 */

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, CheckCircle, Bike, MapPin, AlignLeft, User } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";

const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  vermelho: "#DC2626",
  vermelhoLt: "#FEE2E2",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
  cinzaBorder: "#E5E7EB",
};

interface Motoboy {
  id: number;
  user_id: string | null;
  nome: string;
  telefone: string | null;
  veiculo: string | null;
}

interface Contato {
  id_contato: number;
  nome: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCriado: () => void;
}

const REGIOES = [
  { value: "fortaleza", label: "Fortaleza", frete: 20 },
  { value: "fora_fortaleza", label: "Fora de Fortaleza", frete: 50 },
  { value: "longe", label: "Longe (negociar)", frete: 0 },
  { value: "correios", label: "Correios", frete: 0 },
] as const;

type Regiao = "fortaleza" | "fora_fortaleza" | "longe" | "correios";

export default function FreteAvulsoModal({ isOpen, onClose, onCriado }: Props) {
  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [motoboyId, setMotoboyId] = useState("");
  const [regiao, setRegiao] = useState<Regiao>("fortaleza");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Busca de contato (opcional)
  const [buscaContato, setBuscaContato] = useState("");
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoSelecionado, setContatoSelecionado] = useState<Contato | null>(null);
  const [buscandoContato, setBuscandoContato] = useState(false);

  const [freteNegociado, setFreteNegociado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const freteCalculado = REGIOES.find(r => r.value === regiao)?.frete ?? 0;

  // Carregar motoboys ao abrir
  useEffect(() => {
    if (!isOpen) return;
    apiFetch<Motoboy[]>("/api/entregas-venda/motoboys")
      .then(d => setMotoboys(Array.isArray(d) ? d : []))
      // Pitfall §3: sem a lista de motoboys o frete avulso não pode ser criado
      .catch(() => useErrorStore.getState().push("Erro ao carregar lista de motoboys", { level: "warning" }));
  }, [isOpen]);

  // Busca de contato com debounce
  const buscarContatos = useCallback(async (q: string) => {
    if (q.length < 2) { setContatos([]); return; }
    setBuscandoContato(true);
    try {
      const data = await apiFetch<Contato[]>(`/api/contatos/busca?q=${encodeURIComponent(q)}&limit=8`);
      setContatos(Array.isArray(data) ? data : []);
    } catch {
      setContatos([]);
    } finally {
      setBuscandoContato(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarContatos(buscaContato), 300);
    return () => clearTimeout(t);
  }, [buscaContato, buscarContatos]);

  function resetar() {
    setMotoboyId("");
    setRegiao("fortaleza");
    setDescricao("");
    setObservacoes("");
    setFreteNegociado("");
    setBuscaContato("");
    setContatos([]);
    setContatoSelecionado(null);
    setErro("");
    setSucesso(false);
  }

  function handleClose() {
    resetar();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);

    try {
      const freteNegociadoNum = freteNegociado ? parseFloat(freteNegociado.replace(",", ".")) : undefined;
      await apiFetch("/api/entregas-venda/frete-avulso", {
        method: "POST",
        body: JSON.stringify({
          motoboyId,
          regiao,
          freteCobrado: 0,
          freteMotoboyOverride: freteNegociadoNum && freteNegociadoNum > 0 ? freteNegociadoNum : undefined,
          descricaoAvulso: descricao.trim(),
          contatoId: contatoSelecionado?.id_contato,
          observacoes: observacoes.trim() || undefined,
        }),
      });
      setSucesso(true);
      setTimeout(() => {
        resetar();
        onCriado();
        onClose();
      }, 1500);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar frete avulso");
    } finally {
      setEnviando(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: C.esmeralda, color: "#fff",
          padding: "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bike size={20} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Frete Avulso</span>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Sucesso */}
        {sucesso ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <CheckCircle size={48} color={C.verde} style={{ marginBottom: 12 }} />
            <p style={{ fontWeight: 700, color: C.esmeralda, fontSize: 16 }}>Corrida registrada!</p>
            <p style={{ color: C.cinza, fontSize: 13 }}>O motoboy verá no app e confirmará ao concluir.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: "20px" }}>

            {/* Erro */}
            {erro && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: C.vermelhoLt, color: C.vermelho,
                fontSize: 13, marginBottom: 16,
              }}>
                {erro}
              </div>
            )}

            {/* Descrição */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                <AlignLeft size={13} /> Descrição da corrida *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Buscar colar na casa da cliente, Levar material à loja..."
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Motoboy */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                <Bike size={13} /> Motoboy *
              </label>
              <select
                required
                value={motoboyId}
                onChange={e => setMotoboyId(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                  boxSizing: "border-box", background: "#fff",
                }}
              >
                <option value="">Selecionar motoboy...</option>
                {motoboys.map(m => (
                  <option key={m.id} value={m.user_id ?? String(m.id)}>{m.nome}</option>
                ))}
              </select>
            </div>

            {/* Região */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                <MapPin size={13} /> Região *
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {REGIOES.map(r => (
                  <button
                    type="button"
                    key={r.value}
                    onClick={() => setRegiao(r.value)}
                    style={{
                      padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${regiao === r.value ? C.esmeralda : C.cremeBorder}`,
                      background: regiao === r.value ? C.esmeralda : "#fff",
                      color: regiao === r.value ? "#fff" : C.cinza,
                      cursor: "pointer",
                    }}
                  >
                    {r.label} {r.frete > 0 ? `(R$${r.frete})` : ""}
                  </button>
                ))}
              </div>
              {freteCalculado > 0 && (
                <p style={{ fontSize: 11, color: C.cinza, marginTop: 6 }}>
                  Motoboy recebe: R${freteCalculado.toFixed(2)} — descontado do saldo de frete grátis
                </p>
              )}
              {freteCalculado === 0 && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.cinza, display: "block", marginBottom: 4 }}>
                    Valor negociado com o motoboy (R$) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Ex: 35,00"
                    value={freteNegociado}
                    onChange={e => setFreteNegociado(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8,
                      border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                  {freteNegociado && parseFloat(freteNegociado.replace(",", ".")) > 0 && (
                    <p style={{ fontSize: 11, color: C.cinza, marginTop: 4 }}>
                      Motoboy recebe: R${parseFloat(freteNegociado.replace(",", ".")).toFixed(2)} — descontado do saldo de frete grátis
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Cliente (opcional) */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                <User size={13} /> Cliente (opcional)
              </label>
              {contatoSelecionado ? (
                <div style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: `1px solid ${C.esmeralda}`,
                  background: C.esmeraldaLt,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.esmeralda }}>
                    {contatoSelecionado.nome}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setContatoSelecionado(null); setBuscaContato(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.cinza }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Buscar por nome..."
                    value={buscaContato}
                    onChange={e => setBuscaContato(e.target.value)}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                  {buscandoContato && (
                    <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                      <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
                    </div>
                  )}
                  {contatos.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0,
                      background: "#fff", border: `1px solid ${C.cremeBorder}`,
                      borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      zIndex: 100, maxHeight: 200, overflowY: "auto",
                    }}>
                      {contatos.map(c => (
                        <button
                          key={c.id_contato}
                          type="button"
                          onClick={() => { setContatoSelecionado(c); setBuscaContato(""); setContatos([]); }}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "8px 12px", border: "none",
                            background: "none", cursor: "pointer", fontSize: 13,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = C.cremeBg}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          {c.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Observações */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                <AlignLeft size={13} /> Observações (opcional)
              </label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Informações adicionais..."
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                  resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={enviando || !motoboyId || !descricao.trim() || !regiao || (freteCalculado === 0 && !(freteNegociado && parseFloat(freteNegociado.replace(",", ".")) > 0))}
              style={{
                width: "100%", padding: "12px 0",
                background: C.esmeralda, color: "#fff",
                border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: (enviando || !motoboyId || !descricao.trim() || (freteCalculado === 0 && !(freteNegociado && parseFloat(freteNegociado.replace(",", ".")) > 0))) ? 0.6 : 1,
              }}
            >
              {enviando ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Bike size={16} />}
              {enviando ? "Registrando..." : "Registrar Corrida"}
            </button>
          </form>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
