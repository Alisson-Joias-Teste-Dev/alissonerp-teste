"use client";

/**
 * FreteAvulsoModal — Modal para criar (ou solicitar) uma corrida avulsa de motoboy.
 *
 * REGRA DE NEGÓCIO: frete avulso não tem venda vinculada (exceto no modo
 * solicitação, ver abaixo). O motoboy realiza a corrida (buscar peça, levar
 * material, etc.) e confirma no app com um botão. Sem código de verificação,
 * sem WhatsApp.
 *
 * REGRA DE NEGÓCIO (solicitação da consultora — migration 353, modelo POOL):
 * quando quem abre o modal é a consultora, ela não cria o avulso já liberado
 * — apenas SOLICITA a partir de uma venda própria, informando o endereço de
 * entrega (editável aqui, NÃO altera o cadastro do cliente/venda) e o valor
 * cobrado do cliente. Não escolhe motoboy nem responsável: a solicitação cai
 * no pool de aprovadores da chave de config `aprovadores_frete_avulso`
 * (Config › Aprovadores; qualquer um decide via módulo Tarefas).
 *
 * REGRA DE NEGÓCIO (V3 — solicitar DE DENTRO da venda): quando a prop
 * `vendaId` é informada (aberto pelo botão "Solicitar frete avulso" da própria
 * tela da venda — ver VendaDetalheClient), a venda já é conhecida e o modal
 * NÃO mostra o buscador de venda — só o endereço (pré-preenchido via
 * `enderecoInicial`, ainda editável) e o valor cobrado.
 *
 * REGRA DE NEGÓCIO (decisão do Jonathan, 21/07): o módulo Tarefas é o lugar
 * ÚNICO das solicitações — abre este modal SEM `vendaId` (ver TarefasClient),
 * então cai no modo de busca de venda abaixo (ehConsultora sem vendaId). O
 * mesmo modo de busca também continua servindo quem abre o modal pela tela
 * de Entregas.
 *
 * IMPACTO SE ALTERADO: delegar a criação para POST /api/entregas-venda/frete-avulso.
 * Não fazer INSERT direto.
 */

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, CheckCircle, Bike, MapPin, AlignLeft, User, Search, DollarSign } from "lucide-react";
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

/** Resultado da busca de venda (consultora) — subconjunto de /api/vendas?q= */
interface VendaBusca {
  id: number;
  numero_venda: string;
  cliente_nome: string | null;
  total_venda: number;
}

/** Campos de endereço de entrega retornados por GET /api/vendas/[id] */
interface VendaEnderecoResp {
  endereco_entrega: string | null;
  endereco_entrega_numero: string | null;
  endereco_entrega_complemento: string | null;
  endereco_entrega_bairro: string | null;
  endereco_entrega_cidade: string | null;
  endereco_entrega_cep: string | null;
  endereco_entrega_uf: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCriado: () => void;
  /** Role do usuário logado — decide se o modal é de CRIAÇÃO (loja) ou SOLICITAÇÃO (consultora) */
  userRole: string;
  /**
   * REGRA DE NEGÓCIO (V3): quando informado, o modal já nasce vinculado a
   * esta venda (aberto de dentro da tela da venda) — esconde o buscador de
   * venda e usa este id direto no submit. Só faz sentido combinado com
   * userRole="consultora".
   */
  vendaId?: number;
  /** Endereço de entrega sugerido (concatenado pelo caller) para pré-preencher
   *  o textarea editável quando `vendaId` é informado. Ignorado sem vendaId. */
  enderecoInicial?: string;
}

const REGIOES = [
  { value: "fortaleza", label: "Fortaleza", frete: 20 },
  { value: "fora_fortaleza", label: "Fora de Fortaleza", frete: 50 },
  { value: "longe", label: "Longe (negociar)", frete: 0 },
  { value: "correios", label: "Correios", frete: 0 },
] as const;

type Regiao = "fortaleza" | "fora_fortaleza" | "longe" | "correios";

/**
 * Concatena os campos de endereço de entrega da venda num texto único editável.
 * O QUE: monta "Rua X, nº 123, Complemento, Bairro, Cidade, UF, CEP".
 * POR QUE: o endereço confirmado da ENTREGA pode divergir do cadastro (ex: o
 * cliente pediu para entregar em outro lugar) — por isso o campo é editável.
 * IMPACTO SE ALTERADO: mudar a ordem/formato aqui não afeta o banco — é só
 * o valor inicial sugerido no textarea.
 */
function montarEndereco(v: VendaEnderecoResp): string {
  const partes = [
    v.endereco_entrega,
    v.endereco_entrega_numero ? `nº ${v.endereco_entrega_numero}` : null,
    v.endereco_entrega_complemento,
    v.endereco_entrega_bairro,
    v.endereco_entrega_cidade,
    v.endereco_entrega_uf,
    v.endereco_entrega_cep,
  ].filter((p): p is string => !!p && p.trim() !== "");
  return partes.join(", ");
}

export default function FreteAvulsoModal({ isOpen, onClose, onCriado, userRole, vendaId, enderecoInicial }: Props) {
  // REGRA DE NEGÓCIO (modelo POOL): consultora só SOLICITA — não cria o
  // avulso já liberado e não escolhe motoboy/responsável.
  const ehConsultora = userRole === "consultora";
  // REGRA DE NEGÓCIO (V3): quando aberto de dentro da venda, a venda já é
  // conhecida — não precisa buscar. IMPACTO SE REMOVIDO: reaparece o
  // buscador de venda mesmo quando o caller já sabe qual é.
  const vendaFixada = ehConsultora && vendaId != null;

  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [motoboyId, setMotoboyId] = useState("");
  const [regiao, setRegiao] = useState<Regiao>("fortaleza");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Busca de contato (opcional) — só usada fora do modo consultora
  const [buscaContato, setBuscaContato] = useState("");
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoSelecionado, setContatoSelecionado] = useState<Contato | null>(null);
  const [buscandoContato, setBuscandoContato] = useState(false);

  // Busca de venda + endereço editável (só modo consultora)
  const [vendaBusca, setVendaBusca] = useState("");
  const [vendasResultado, setVendasResultado] = useState<VendaBusca[]>([]);
  const [buscandoVenda, setBuscandoVenda] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaBusca | null>(null);
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [carregandoEndereco, setCarregandoEndereco] = useState(false);
  const [freteCobradoConsultora, setFreteCobradoConsultora] = useState("");

  const [freteNegociado, setFreteNegociado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const freteCalculado = REGIOES.find(r => r.value === regiao)?.frete ?? 0;

  // Carregar motoboys ao abrir — só necessário no modo criação direta (loja).
  // Consultora não escolhe motoboy (a corrida cai no pool de liberadores).
  useEffect(() => {
    if (!isOpen || ehConsultora) return;
    apiFetch<Motoboy[]>("/api/entregas-venda/motoboys")
      .then(d => setMotoboys(Array.isArray(d) ? d : []))
      // Pitfall §3: sem a lista de motoboys o frete avulso não pode ser criado
      .catch(() => useErrorStore.getState().push("Erro ao carregar lista de motoboys", { level: "warning" }));
  }, [isOpen, ehConsultora]);

  // Busca de contato com debounce (não-consultora)
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
    if (ehConsultora) return;
    const t = setTimeout(() => buscarContatos(buscaContato), 300);
    return () => clearTimeout(t);
  }, [buscaContato, buscarContatos, ehConsultora]);

  // ── Busca de venda com debounce (consultora) ──────────────────────────────
  // REGRA DE NEGÓCIO: reusa GET /api/vendas?q= (mesma listagem paginada usada
  // na tela de vendas). Esse endpoint exige inicio/fim — usamos uma janela
  // ampla (3 anos) só para viabilizar a busca por texto. O filtro de
  // vendedor_id já embutido nessa rota (não-full-access) garante que a
  // consultora só encontra vendas PRÓPRIAS, sem precisar duplicar a regra de
  // ownership aqui no front.
  const buscarVendas = useCallback(async (q: string) => {
    if (q.length < 2) { setVendasResultado([]); return; }
    setBuscandoVenda(true);
    try {
      const hoje = new Date();
      const inicio = new Date(hoje);
      inicio.setFullYear(inicio.getFullYear() - 3);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const params = new URLSearchParams({
        q,
        inicio: fmt(inicio),
        fim: fmt(hoje),
        page_size: "8",
      });
      const data = await apiFetch<{ items: VendaBusca[] }>(`/api/vendas?${params.toString()}`);
      setVendasResultado(Array.isArray(data.items) ? data.items : []);
    } catch {
      setVendasResultado([]);
    } finally {
      setBuscandoVenda(false);
    }
  }, []);

  useEffect(() => {
    if (!ehConsultora || vendaFixada) return;
    const t = setTimeout(() => buscarVendas(vendaBusca), 300);
    return () => clearTimeout(t);
  }, [vendaBusca, buscarVendas, ehConsultora, vendaFixada]);

  // REGRA DE NEGÓCIO (V3): venda fixada (aberto de dentro da tela da venda) —
  // pré-preenche o endereço editável com o que o caller já calculou (cadastro
  // de entrega da venda), sem precisar de uma 2ª chamada a /api/vendas/[id].
  // Roda a cada abertura do modal (resetar() limpa ao fechar).
  useEffect(() => {
    if (isOpen && vendaFixada) {
      setEnderecoEntrega(enderecoInicial ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, vendaFixada, enderecoInicial]);

  /** Seleciona a venda e busca o endereço de entrega para pré-preencher o textarea editável */
  async function selecionarVenda(v: VendaBusca) {
    setVendaSelecionada(v);
    setVendaBusca("");
    setVendasResultado([]);
    setCarregandoEndereco(true);
    try {
      const detalhe = await apiFetch<VendaEnderecoResp>(`/api/vendas/${v.id}`);
      setEnderecoEntrega(montarEndereco(detalhe));
    } catch {
      useErrorStore.getState().push("Erro ao carregar endereço da venda", { level: "warning" });
    } finally {
      setCarregandoEndereco(false);
    }
  }

  function resetar() {
    setMotoboyId("");
    setRegiao("fortaleza");
    setDescricao("");
    setObservacoes("");
    setFreteNegociado("");
    setBuscaContato("");
    setContatos([]);
    setContatoSelecionado(null);
    setVendaBusca("");
    setVendasResultado([]);
    setVendaSelecionada(null);
    setEnderecoEntrega("");
    setFreteCobradoConsultora("");
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

      if (ehConsultora) {
        // REGRA DE NEGÓCIO (modelo POOL): body da solicitação NÃO inclui
        // motoboyId/contatoId/liberacaoResponsavelId — a consultora só informa
        // a venda, o endereço confirmado e o valor cobrado do cliente.
        // Com venda fixada (V3), o id vem da prop; sem ela, do buscador.
        const vendaIdEfetivo = vendaId ?? vendaSelecionada?.id;
        if (!vendaIdEfetivo || !enderecoEntrega.trim() || freteCobradoConsultora === "") {
          throw new Error("Preencha a venda, o endereço de entrega e o valor cobrado.");
        }
        await apiFetch("/api/entregas-venda/frete-avulso", {
          method: "POST",
          body: JSON.stringify({
            vendaId: vendaIdEfetivo,
            enderecoEntrega: enderecoEntrega.trim(),
            freteCobrado: parseFloat(freteCobradoConsultora.replace(",", ".")) || 0,
            regiao,
            freteMotoboyOverride: freteNegociadoNum && freteNegociadoNum > 0 ? freteNegociadoNum : undefined,
            descricaoAvulso: descricao.trim(),
            observacoes: observacoes.trim() || undefined,
          }),
        });
      } else {
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
      }
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

  // Validação de submit — cada modo tem seus próprios campos obrigatórios
  const disabledConsultora =
    enviando || !(vendaId ?? vendaSelecionada) || !enderecoEntrega.trim() || freteCobradoConsultora === "" || !descricao.trim();
  const disabledPadrao =
    enviando || !motoboyId || !descricao.trim() ||
    (freteCalculado === 0 && !(freteNegociado && parseFloat(freteNegociado.replace(",", ".")) > 0));
  const disabledSubmit = ehConsultora ? disabledConsultora : disabledPadrao;

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
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {ehConsultora ? "Solicitar Frete Avulso" : "Frete Avulso"}
            </span>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Sucesso */}
        {sucesso ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <CheckCircle size={48} color={C.verde} style={{ marginBottom: 12 }} />
            <p style={{ fontWeight: 700, color: C.esmeralda, fontSize: 16 }}>
              {ehConsultora ? "Solicitação enviada — aguardando liberação" : "Corrida registrada!"}
            </p>
            {!ehConsultora && (
              <p style={{ color: C.cinza, fontSize: 13 }}>O motoboy verá no app e confirmará ao concluir.</p>
            )}
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

            {ehConsultora ? (
              <>
                {/* Venda (consultora) — escondido quando a venda já vem fixada (V3, aberto de dentro da venda) */}
                {!vendaFixada && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                    <Search size={13} /> Venda *
                  </label>
                  {vendaSelecionada ? (
                    <div style={{
                      padding: "8px 12px", borderRadius: 8,
                      border: `1px solid ${C.esmeralda}`,
                      background: C.esmeraldaLt,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.esmeralda }}>
                        {vendaSelecionada.numero_venda} — {vendaSelecionada.cliente_nome ?? "Cliente não identificado"}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setVendaSelecionada(null); setEnderecoEntrega(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.cinza }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        placeholder="Buscar por número da venda ou cliente..."
                        value={vendaBusca}
                        onChange={e => setVendaBusca(e.target.value)}
                        style={{
                          width: "100%", padding: "9px 12px", borderRadius: 8,
                          border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                      {buscandoVenda && (
                        <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                          <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
                        </div>
                      )}
                      {vendasResultado.length > 0 && (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, right: 0,
                          background: "#fff", border: `1px solid ${C.cremeBorder}`,
                          borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          zIndex: 100, maxHeight: 200, overflowY: "auto",
                        }}>
                          {vendasResultado.map(v => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => selecionarVenda(v)}
                              style={{
                                display: "block", width: "100%", textAlign: "left",
                                padding: "8px 12px", border: "none",
                                background: "none", cursor: "pointer", fontSize: 13,
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = C.cremeBg}
                              onMouseLeave={e => e.currentTarget.style.background = "none"}
                            >
                              <strong>{v.numero_venda}</strong> — {v.cliente_nome ?? "—"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}

                {/* Endereço de entrega (editável — não altera o cadastro do cliente) */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                    <MapPin size={13} /> Endereço de entrega *
                  </label>
                  <textarea
                    rows={3}
                    value={enderecoEntrega}
                    onChange={e => setEnderecoEntrega(e.target.value)}
                    placeholder={carregandoEndereco ? "Carregando endereço da venda..." : "Endereço completo de entrega..."}
                    disabled={carregandoEndereco}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                      resize: "vertical", boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Valor cobrado do cliente */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                    <DollarSign size={13} /> Valor cobrado do cliente (R$) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 20,00"
                    value={freteCobradoConsultora}
                    onChange={e => setFreteCobradoConsultora(e.target.value)}
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </>
            ) : (
              /* Motoboy (criação direta — loja/admin/estoquista) */
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
            )}

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
                    Valor negociado com o motoboy (R$) {ehConsultora ? "" : "*"}
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

            {/* Cliente (opcional) — só no modo criação direta; no modo consultora o cliente vem da venda */}
            {!ehConsultora && (
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
            )}

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
              disabled={disabledSubmit}
              style={{
                width: "100%", padding: "12px 0",
                background: C.esmeralda, color: "#fff",
                border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: disabledSubmit ? 0.6 : 1,
              }}
            >
              {enviando ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Bike size={16} />}
              {enviando
                ? (ehConsultora ? "Enviando..." : "Registrando...")
                : (ehConsultora ? "Solicitar frete avulso" : "Registrar Corrida")}
            </button>
          </form>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
