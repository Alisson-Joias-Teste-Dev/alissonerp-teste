"use client";

/**
 * AbrirOrdemAliancaModal — confirmação do ARO antes de a ordem ir para a fábrica.
 *
 * O QUE: lista uma aliança por vez (anel 1 e, no par, anel 2), mostrando o que
 * identifica CADA UMA na vida real — a gravação, o perfil e as medidas — e exige
 * uma escolha explícita de aro para cada uma: manter o do orçamento ou trocar.
 * Só com todas confirmadas o botão "Abrir ordem" chama
 * POST /api/vendas/[id]/abrir-ordem.
 *
 * POR QUE: a numeração do aro é obrigatória no orçamento, mas o cliente muitas
 * vezes ainda não sabe o tamanho quando a venda é fechada — a consultora
 * digitava qualquer número para conseguir passar a venda e a ordem nascia
 * automática com esse chute (relato do Jonathan, 27/07/2026). O desenho da tela
 * é deliberado: nada vem pré-confirmado, e as duas alianças NUNCA aparecem como
 * dois campos soltos "aro 1 / aro 2" — cada uma tem seu cartão com a gravação em
 * destaque, porque é pela gravação (o nome de quem vai usar) que a consultora
 * sabe qual é qual. O objetivo é fazer acertar, não deixar errar.
 *
 * IMPACTO SE ALTERADO: pré-selecionar o aro do orçamento como "já confirmado" ou
 * juntar as duas alianças num formulário só reabre exatamente o erro que esta
 * tela existe para impedir — peça produzida no tamanho errado.
 */

import { useCallback, useEffect, useState } from "react";
import {
  X, Loader2, CheckCircle, AlertTriangle, Scale, Send, Diamond, Type, Ruler,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";

const C = {
  esmeralda: "#184036",
  champanhe: "#8A6E3B",
  creme: "#F3EADA",
  cremeBg: "#FAFAF7",
  cremeBorder: "#E8DCC8",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  ambar: "#D97706",
  ambarLt: "#FEF3C7",
  azul: "#1D4ED8",
  azulLt: "#DBEAFE",
  cinza: "#6B7280",
  cinzaBorder: "#E5E7EB",
};

type PesoAro = { aro: number; diametro: number; peso: number | null; delta: number };

type Alianca = {
  ficha_id: number;
  anel: number;
  perfil: string;
  largura: number | null;
  espessura: number | null;
  cor_metal: string | null;
  qtd_pedras: number;
  tipo_pedra: string | null;
  gravacao: string[];
  aro_atual: number | null;
  peso_atual: number | null;
  pesos: PesoAro[];
};

type Dados = {
  venda: { id: number; numero_venda: string; situacao: string };
  orcamento: { id: number; numero_orcamento: string | null; nome_modelo: string | null; quantidade: number };
  ordem: { id: number; numero_ordem: string } | null;
  pode_abrir: boolean;
  aliancas: Alianca[];
};

type Props = {
  vendaId: number;
  onClose: () => void;
  /** Chamado após a ordem ser criada — a tela da venda recarrega. */
  onSucesso: (numeroOrdem: string) => void;
};

const g = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(1).replace(".", ",")} g`);
const mm = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(1).replace(".", ",")} mm`);

export default function AbrirOrdemAliancaModal({ vendaId, onClose, onSucesso }: Props) {
  const pushErro = useErrorStore((s) => s.push);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  /** ficha_id → aro escolhido. Ausente = ainda NÃO confirmada (de propósito). */
  const [escolhas, setEscolhas] = useState<Record<number, number>>({});
  /** ficha_id → cartão em modo "trocar" (mostra o seletor). */
  const [trocando, setTrocando] = useState<Record<number, boolean>>({});
  const [conferido, setConferido] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await apiFetch<Dados>(`/api/vendas/${vendaId}/abrir-ordem`);
        if (vivo) setDados(d);
      } catch (e) {
        pushErro(e instanceof Error ? e.message : "Falha ao carregar as alianças");
        onClose();
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [vendaId, pushErro, onClose]);

  const pesoDoAro = useCallback((a: Alianca, aro: number | null) => {
    if (aro == null) return null;
    return a.pesos.find((p) => p.aro === aro) ?? null;
  }, []);

  const confirmar = async () => {
    if (!dados) return;
    setEnviando(true);
    try {
      const resp = await apiFetch<{ ok: true; ordem: { numero_ordem: string } }>(
        `/api/vendas/${vendaId}/abrir-ordem`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aros: dados.aliancas.map((a) => ({ ficha_id: a.ficha_id, aro: escolhas[a.ficha_id] })),
          }),
        },
      );
      onSucesso(resp.ordem.numero_ordem);
    } catch (e) {
      pushErro(e instanceof Error ? e.message : "Falha ao abrir a ordem");
      setEnviando(false);
    }
  };

  const todasConfirmadas = !!dados && dados.aliancas.every((a) => escolhas[a.ficha_id] != null);
  const podeEnviar = todasConfirmadas && conferido && !enviando && !!dados?.pode_abrir;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70 }}
      />
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "min(680px, 94vw)", maxHeight: "92vh", overflowY: "auto",
          background: "#fff", borderRadius: 14, zIndex: 71,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${C.cinzaBorder}`,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: C.esmeralda }}>
              Abrir ordem para a fábrica
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.cinza }}>
              {dados
                ? `Venda ${dados.venda.numero_venda}${dados.orcamento.numero_orcamento ? ` · Orçamento ${dados.orcamento.numero_orcamento}` : ""}`
                : "Carregando…"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: C.cinza }}>
            <X size={20} />
          </button>
        </div>

        {carregando && (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.cinza }}>
            <Loader2 size={22} className="animate-spin" style={{ margin: "0 auto 8px" }} />
            <p style={{ margin: 0, fontSize: 13 }}>Carregando as alianças do orçamento…</p>
          </div>
        )}

        {!carregando && dados && (
          <>
            {/* Aviso: por que esta tela existe */}
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              padding: "10px 20px", background: C.ambarLt,
            }}>
              <AlertTriangle size={16} color={C.ambar} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#92400E" }}>
                Confirme o aro de cada aliança com o cliente. Depois de abrir, a ordem vai para o
                PCP com esta numeração — e é ela que o ourives usa para fazer a peça.
              </p>
            </div>

            {!dados.pode_abrir && (
              <div style={{ padding: "10px 20px", background: C.verdeLt, fontSize: 12.5, color: "#065F46" }}>
                {dados.ordem
                  ? `Ordem ${dados.ordem.numero_ordem} já foi aberta para esta venda.`
                  : "Esta venda ainda não está aprovada — aprove antes de abrir a ordem."}
              </div>
            )}

            {/* Um cartão por aliança */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {dados.aliancas.map((a) => {
                const escolhido = escolhas[a.ficha_id] ?? null;
                const confirmada = escolhido != null;
                const pesoEsc = pesoDoAro(a, escolhido);
                const mudou = confirmada && a.aro_atual != null && escolhido !== a.aro_atual;
                const corAnel = a.anel === 1 ? C.esmeralda : C.champanhe;
                const emTroca = !!trocando[a.ficha_id];
                const ehPar = dados.aliancas.length === 2;

                return (
                  <div
                    key={a.ficha_id}
                    style={{
                      border: confirmada ? `1px solid ${C.verde}` : `2px solid ${C.creme}`,
                      borderRadius: 12, padding: "14px 16px", background: C.cremeBg,
                    }}
                  >
                    {/* Identificação da aliança */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      <span style={{
                        background: corAnel, color: "#fff", fontSize: 11, fontWeight: 600,
                        padding: "3px 10px", borderRadius: 20,
                      }}>
                        {ehPar ? `Aliança ${a.anel}` : "Aliança"}
                      </span>
                      <span style={{ fontSize: 12.5, color: C.cinza }}>
                        {a.perfil} · {mm(a.largura)} × {mm(a.espessura)}
                        {a.cor_metal ? ` · ${a.cor_metal}` : ""}
                      </span>
                      {confirmada && (
                        <CheckCircle size={18} color={C.verde} style={{ marginLeft: "auto" }} />
                      )}
                    </div>

                    {/* A GRAVAÇÃO é o que diferencia uma aliança da outra na prática */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
                      padding: "8px 10px", background: "#fff",
                      border: `1px solid ${C.cremeBorder}`, borderRadius: 8,
                    }}>
                      <Type size={15} color={C.cinza} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: C.cinza }}>Gravado por dentro</span>
                      <span style={{
                        marginLeft: "auto", fontSize: 14, fontWeight: 500,
                        color: a.gravacao.length ? C.esmeralda : C.cinza, textAlign: "right",
                      }}>
                        {a.gravacao.length ? a.gravacao.join(" · ") : "sem gravação"}
                      </span>
                    </div>

                    {a.qtd_pedras > 0 && (
                      <p style={{ margin: "0 0 10px", fontSize: 12, color: C.cinza, display: "flex", alignItems: "center", gap: 6 }}>
                        <Diamond size={13} /> {a.qtd_pedras} {a.qtd_pedras === 1 ? "pedra" : "pedras"}
                        {a.tipo_pedra ? ` de ${a.tipo_pedra}` : ""}
                      </p>
                    )}

                    {/* Escolha do aro */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, color: C.cinza, display: "flex", alignItems: "center", gap: 5 }}>
                        <Ruler size={13} />
                        Aro do orçamento:{" "}
                        <strong style={{ color: C.esmeralda }}>{a.aro_atual ?? "não informado"}</strong>
                      </span>

                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        {confirmada && !emTroca ? (
                          <>
                            <span style={{ fontSize: 12.5, color: C.verde, fontWeight: 500 }}>
                              {mudou ? `trocado para aro ${escolhido}` : `mantido: aro ${escolhido}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setTrocando((t) => ({ ...t, [a.ficha_id]: true }))}
                              style={{
                                fontSize: 12, padding: "4px 10px", borderRadius: 6,
                                border: `1px solid ${C.cinzaBorder}`, background: "#fff",
                                cursor: "pointer", color: C.cinza,
                              }}
                            >
                              Trocar
                            </button>
                          </>
                        ) : (
                          <>
                            <select
                              value={escolhido ?? ""}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!v) return;
                                setEscolhas((x) => ({ ...x, [a.ficha_id]: v }));
                                setTrocando((t) => ({ ...t, [a.ficha_id]: false }));
                              }}
                              style={{
                                fontSize: 12.5, padding: "6px 8px", borderRadius: 6,
                                border: `1px solid ${C.cinzaBorder}`, background: "#fff", minWidth: 170,
                              }}
                            >
                              <option value="">Escolher o aro…</option>
                              {a.pesos.map((p) => (
                                <option key={p.aro} value={p.aro}>
                                  Aro {p.aro} (Ø {p.diametro.toFixed(2).replace(".", ",")} mm)
                                  {a.aro_atual === p.aro ? " — do orçamento" : ""}
                                </option>
                              ))}
                            </select>
                            {a.aro_atual != null && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEscolhas((x) => ({ ...x, [a.ficha_id]: a.aro_atual! }));
                                  setTrocando((t) => ({ ...t, [a.ficha_id]: false }));
                                }}
                                style={{
                                  fontSize: 12, padding: "5px 10px", borderRadius: 6,
                                  border: `1px solid ${C.esmeralda}`, background: "#fff",
                                  cursor: "pointer", color: C.esmeralda, fontWeight: 500,
                                }}
                              >
                                Manter {a.aro_atual}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Efeito no peso — só aparece quando o aro realmente mudou */}
                    {mudou && pesoEsc?.peso != null && (
                      <div style={{
                        display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10,
                        padding: "8px 10px", background: C.azulLt, borderRadius: 8,
                      }}>
                        <Scale size={15} color={C.azul} style={{ flexShrink: 0, marginTop: 1 }} />
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "#1E3A8A" }}>
                          Aro {a.aro_atual} → {escolhido} muda o peso estimado de {g(a.peso_atual)} para{" "}
                          {g(pesoEsc.peso)}. O valor negociado com o cliente não muda; a ordem sai com o
                          peso do aro confirmado.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rodapé */}
            <div style={{
              padding: "14px 20px", borderTop: `1px solid ${C.cinzaBorder}`,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.cinza, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={conferido}
                  onChange={(e) => setConferido(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                Conferi {dados.aliancas.length === 2 ? "os dois aros" : "o aro"} com o cliente
              </label>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    fontSize: 13, padding: "8px 14px", borderRadius: 8,
                    border: `1px solid ${C.cinzaBorder}`, background: "#fff", cursor: "pointer", color: C.cinza,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={!podeEnviar}
                  title={
                    !todasConfirmadas ? "Confirme o aro de cada aliança"
                      : !conferido ? "Marque que conferiu com o cliente"
                        : undefined
                  }
                  style={{
                    fontSize: 13, fontWeight: 500, padding: "8px 16px", borderRadius: 8,
                    border: "none", display: "flex", alignItems: "center", gap: 7,
                    background: podeEnviar ? C.esmeralda : "#D1D5DB", color: "#fff",
                    cursor: podeEnviar ? "pointer" : "not-allowed",
                  }}
                >
                  {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {enviando ? "Abrindo…" : "Abrir ordem"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
