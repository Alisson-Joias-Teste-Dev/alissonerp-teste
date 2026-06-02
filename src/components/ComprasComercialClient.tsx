"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Plus, Search, ShoppingCart } from "lucide-react";
import { formatMoeda } from "@/lib/formatters";
import { calcularCustoPorCtPedra, calcularQtdPecasPedra } from "@/lib/compras-pedras";

// REGRA DE NEGOCIO:
// - O que faz: orquestra o fluxo de compra comercial (criar, receber, concluir, itens).
// - Por que: conclusao da compra dispara automacoes criticas de estoque comercial e contas a pagar.
// - Impacto se alterado/removido: operacao pode perder automacao e voltar para processos manuais com risco financeiro.

const C = {
  verde: "#1A3C34",
  dourado: "#C59B6D",
  creme: "#F2E8D5",
  borda: "#E8DCC8",
};

type Situacao = "rascunho" | "recebida" | "concluido" | "pendente";

interface CompraComercial {
  id: number;
  situacao: Situacao | "aguardando_aprovacao" | "aprovado" | "rejeitado";
  total: number;
  bloqueado: boolean;
  local_estoque_id: number;
  numero_nf?: string;
  data_compra?: string;
  data_recebimento?: string;
  created_at: string;
  fornecedor_id?: number;
  fornecedor_nome?: string;
  local_nome?: string;
  total_itens: number;
  qtd_parcelas: number;
  primeiro_vencimento: string;
}

interface ItemCompraComercial {
  id: number;
  produto_id: number;
  produto_nome: string;
  produto_sku?: string;
  qtd: number;
  cotacao_referencial?: number;
  fator_ouro?: number;
  valor_grama: number;
  peso_total: number;
  valor_unitario: number;
  valor_total: number;
  qtd_exata?: number | null;
  produto_categoria?: string;
  tem_pedra_preciosa?: boolean;
}

interface Local { id: number; nome: string }
interface Fornecedor { id_contato: number; nome: string }
interface ProdutoBusca {
  id_produto: number;
  nome: string;
  sku?: string;
  fator?: number;
  peso_precificado?: number;
  categoria?: string;
  categoria_precificacao?: string;
  tem_pedra_preciosa?: boolean;
  peso_pedra_ct?: number;
}

interface ProdutoSelecionadoMeta {
  id_produto: number;
  nome: string;
  sku?: string;
  categoria?: string;
  categoria_precificacao?: string;
  tem_pedra_preciosa?: boolean;
  peso_pedra_ct?: number;
}

function fmtDate(d?: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
}

function SituacaoTag({ s }: { s: string }) {
  const style =
    s === "aprovado" || s === "concluido"
      ? "bg-emerald-100 text-emerald-700"
      : s === "aguardando_aprovacao"
      ? "bg-violet-100 text-violet-700"
      : s === "rejeitado"
      ? "bg-red-100 text-red-700"
      : s === "recebida"
      ? "bg-blue-100 text-blue-700"
      : "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>{s}</span>;
}

function NovaCompraModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [buscaFornecedor, setBuscaFornecedor] = useState("");
  const [showSugestoesFornecedor, setShowSugestoesFornecedor] = useState(false);
  const [locais, setLocais] = useState<Local[]>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [localId, setLocalId] = useState("");
  const [numeroNf, setNumeroNf] = useState("");
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10));
  const [qtdParcelas, setQtdParcelas] = useState("1");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // REGRA DE NEGOCIO:
  // - O que faz: estado do subformulario de cadastro rapido de fornecedor dentro do modal de nova compra.
  // - Por que: o operador precisa cadastrar fornecedor novo sem sair do fluxo da compra, usando a tabela public.contatos
  //           como fonte unica (AGENTS.md #2 do modulo Crediario — tabela de contatos e a referencia correta para compras comercial).
  // - Impacto se removido: operador precisa abrir outra tela para cadastrar contato, quebrando o fluxo da compra.
  const [showCadastroFornecedor, setShowCadastroFornecedor] = useState(false);
  const [formFornecedor, setFormFornecedor] = useState({
    nome: "",
    cpf_cnpj: "",
    telefone: "",
    celular: "",
    email: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    municipio: "",
    uf: "",
  });
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);
  const [erroFornecedor, setErroFornecedor] = useState("");

  // REGRA DE NEGOCIO:
  // - O que faz: busca CEP na API ViaCEP e preenche endereco automaticamente.
  // - Por que: reduz digitacao e erro de preenchimento manual de endereco.
  // - Impacto se removido: operador precisa preencher endereco manualmente, aumentando chance de erro.
  async function buscarCepFornecedor(cep: string) {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data.erro) return;
      setFormFornecedor((prev) => ({
        ...prev,
        endereco: data.logradouro ?? prev.endereco,
        bairro: data.bairro ?? prev.bairro,
        municipio: data.localidade ?? prev.municipio,
        uf: data.uf ?? prev.uf,
      }));
    } catch { /* silencioso */ }
  }

  // REGRA DE NEGOCIO:
  // - O que faz: cadastra novo contato via POST /api/contatos e seleciona automaticamente como fornecedor da compra.
  // - Por que: mantem fluxo unico — o operador nao precisa sair da tela de compra e voltar para selecionar o contato.
  // - Impacto se removido: o fornecedor nao fica selecionado apos cadastro, obrigando nova busca manual.
  async function cadastrarFornecedor() {
    setErroFornecedor("");
    if (!formFornecedor.nome.trim()) {
      setErroFornecedor("Nome e obrigatorio.");
      return;
    }
    setSalvandoFornecedor(true);
    try {
      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formFornecedor.nome.trim(),
          cpf_cnpj: formFornecedor.cpf_cnpj.trim() || undefined,
          telefone: formFornecedor.telefone.trim() || undefined,
          celular: formFornecedor.celular.trim() || undefined,
          email: formFornecedor.email.trim() || undefined,
          cep: formFornecedor.cep.replace(/\D/g, "") || undefined,
          endereco: formFornecedor.endereco.trim() || undefined,
          numero: formFornecedor.numero.trim() || undefined,
          complemento: formFornecedor.complemento.trim() || undefined,
          bairro: formFornecedor.bairro.trim() || undefined,
          municipio: formFornecedor.municipio.trim() || undefined,
          uf: formFornecedor.uf.trim().toUpperCase() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 409 = CPF/CNPJ ja cadastrado — exibe nome do contato existente
        if (res.status === 409 && data.contato?.nome) {
          setErroFornecedor(`CPF/CNPJ ja cadastrado para: ${data.contato.nome}`);
          // Sugere selecionar o contato existente em vez de cadastrar duplicado
          setFornecedorId(String(data.contato.id_contato));
          setBuscaFornecedor(data.contato.nome);
          setShowSugestoesFornecedor(false);
        } else {
          setErroFornecedor(data.error ?? "Erro ao cadastrar fornecedor");
        }
        return;
      }
      // REGRA DE NEGOCIO:
      // - O que faz: seleciona automaticamente o fornecedor recem-cadastrado na compra.
      // - Por que: evita que o operador precise buscar novamente o contato que acabou de criar.
      setFornecedorId(String(data.id));
      setBuscaFornecedor(data.nome);
      setShowSugestoesFornecedor(false);
      setShowCadastroFornecedor(false);
      // Limpa formulario para proximo uso
      setFormFornecedor({
        nome: "", cpf_cnpj: "", telefone: "", celular: "", email: "",
        cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "",
      });
    } catch {
      setErroFornecedor("Erro de rede ao cadastrar fornecedor.");
    } finally {
      setSalvandoFornecedor(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetch("/api/locais-estoque").then((r) => r.json()).then((d: Local[]) => {
      setLocais(d ?? []);
      if (d?.[0]) setLocalId(String(d[0].id));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // REGRA DE NEGOCIO:
    // - O que faz: busca fornecedor na tabela de contatos conforme digitacao do usuario.
    // - Por que: acelera cadastro e evita erro de selecao em listas longas.
    // - Impacto se alterado/removido: operador volta a depender de lista extensa, aumentando chance de erro.
    const handle = setTimeout(() => {
      fetch(`/api/compras-comercial/fornecedores?q=${encodeURIComponent(buscaFornecedor.trim())}`)
        .then((r) => r.json())
        .then((d) => setFornecedores(d ?? []));
    }, 180);
    return () => clearTimeout(handle);
  }, [open, buscaFornecedor]);

  async function submit() {
    setErr("");
    if (!localId) {
      setErr("Selecione o local de estoque.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/compras-comercial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fornecedor_id: fornecedorId ? Number(fornecedorId) : null,
        local_estoque_id: Number(localId),
        numero_nf: numeroNf || null,
        data_compra: dataCompra,
        qtd_parcelas: Number(qtdParcelas),
        primeiro_vencimento: primeiroVencimento,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "Erro ao criar compra comercial");
      return;
    }
    onCreated();
    onClose();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden" style={{ border: `2px solid ${C.borda}` }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b" style={{ background: `linear-gradient(90deg, ${C.creme} 0%, #ffffff 100%)`, borderColor: C.borda }}>
          <h3 className="font-semibold text-lg" style={{ color: C.verde }}>Nova Compra Comercial</h3>
          <p className="text-xs mt-0.5" style={{ color: "#5B6B67" }}>Preencha os dados da compra e defina o plano financeiro.</p>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="space-y-1">
          <p className="text-[11px] font-bold" style={{ color: "#7D8A86" }}>Fornecedor</p>
          <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5B6B67" }}>Fornecedor</label>
          <div className="relative">
            <input
              className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              style={{ borderColor: C.borda, color: C.verde }}
              placeholder="Buscar fornecedor..."
              value={buscaFornecedor}
              onFocus={() => setShowSugestoesFornecedor(true)}
              onChange={(e) => {
                setBuscaFornecedor(e.target.value);
                setFornecedorId("");
                setShowSugestoesFornecedor(true);
              }}
            />
            {showSugestoesFornecedor && buscaFornecedor.trim().length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-56 overflow-y-auto" style={{ borderColor: C.borda }}>
                {fornecedores.length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-500">Nenhum fornecedor encontrado.</p>
                )}
                {fornecedores.map((f) => (
                  <button
                    key={f.id_contato}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm transition-colors"
                    style={{ color: C.verde }}
                    onClick={() => {
                      setFornecedorId(String(f.id_contato));
                      setBuscaFornecedor(f.nome);
                      setShowSugestoesFornecedor(false);
                    }}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!!fornecedorId && <p className="text-xs" style={{ color: C.verde }}>Fornecedor selecionado.</p>}

          {/* REGRA DE NEGOCIO:
              - O que faz: botao para abrir/fechar subformulario de cadastro rapido de fornecedor dentro do modal.
              - Por que: permite cadastrar fornecedor novo sem sair do fluxo da compra comercial.
              - Impacto se removido: operador precisa acessar outra tela para cadastrar contato, quebrando o fluxo. */}
          <button
            type="button"
            className="text-xs mt-1 underline underline-offset-2"
            style={{ color: C.verde }}
            onClick={() => { setShowCadastroFornecedor((v) => !v); setErroFornecedor(""); }}
          >
            {showCadastroFornecedor ? "Fechar cadastro" : "+ Cadastrar fornecedor"}
          </button>

          {showCadastroFornecedor && (
            <div className="mt-2 border rounded-xl p-4 space-y-3" style={{ borderColor: C.borda, backgroundColor: `${C.creme}40` }}>
              <p className="text-xs font-semibold" style={{ color: C.verde }}>Novo fornecedor</p>

              {/* Nome + CPF/CNPJ */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Nome *</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="Nome do fornecedor"
                    value={formFornecedor.nome}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, nome: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>CPF/CNPJ</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="CPF ou CNPJ"
                    value={formFornecedor.cpf_cnpj}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, cpf_cnpj: e.target.value }))}
                  />
                </div>
              </div>

              {/* Telefone + Celular + Email */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Telefone</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="(99) 9999-9999"
                    value={formFornecedor.telefone}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, telefone: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Celular</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="(99) 99999-9999"
                    value={formFornecedor.celular}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, celular: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Email</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="email@exemplo.com"
                    value={formFornecedor.email}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>

              {/* CEP + Endereco */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>CEP</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="00000-000"
                    value={formFornecedor.cep}
                    maxLength={9}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormFornecedor((p) => ({ ...p, cep: v }));
                      if (v.replace(/\D/g, "").length === 8) buscarCepFornecedor(v);
                    }}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Endereco</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="Rua, Av."
                    value={formFornecedor.endereco}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, endereco: e.target.value }))}
                  />
                </div>
              </div>

              {/* Numero + Complemento + Bairro */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Numero</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="S/N"
                    value={formFornecedor.numero}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, numero: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Complemento</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="Apto, Sala"
                    value={formFornecedor.complemento}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, complemento: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Bairro</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="Bairro"
                    value={formFornecedor.bairro}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, bairro: e.target.value }))}
                  />
                </div>
              </div>

              {/* Municipio + UF */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>Municipio</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="Municipio"
                    value={formFornecedor.municipio}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, municipio: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: "#7D8A86" }}>UF</p>
                  <input
                    className="w-full border rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                    style={{ borderColor: C.borda, color: C.verde }}
                    placeholder="UF"
                    maxLength={2}
                    value={formFornecedor.uf}
                    onChange={(e) => setFormFornecedor((p) => ({ ...p, uf: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>

              {erroFornecedor && <p className="text-xs text-red-600">{erroFornecedor}</p>}

              <button
                type="button"
                className="px-3 py-2 rounded-lg text-xs font-semibold w-full"
                style={{ backgroundColor: C.verde, color: C.dourado }}
                onClick={cadastrarFornecedor}
                disabled={salvandoFornecedor}
              >
                {salvandoFornecedor ? "Salvando..." : "Salvar fornecedor"}
              </button>
            </div>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-bold" style={{ color: "#7D8A86" }}>Local de estoque</p>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5B6B67" }}>Local de estoque</label>
            <select className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none" style={{ borderColor: C.borda, color: C.verde }} value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Selecione local de estoque</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold" style={{ color: "#7D8A86" }}>Numero da NF</p>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5B6B67" }}>Numero da NF</label>
            <input className="border rounded-lg px-3 py-2.5 w-full text-sm focus:outline-none" style={{ borderColor: C.borda, color: C.verde }} placeholder="Ex: 001234" value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-bold" style={{ color: "#7D8A86" }}>Data da compra</p>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5B6B67" }}>Data da compra</label>
            <input type="date" className="border rounded-lg px-3 py-2.5 w-full text-sm focus:outline-none" style={{ borderColor: C.borda, color: C.verde }} value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold" style={{ color: "#7D8A86" }}>Quantidade de parcelas</p>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5B6B67" }}>Quantidade de parcelas</label>
            <input type="number" min={1} className="border rounded-lg px-3 py-2.5 w-full text-sm focus:outline-none" style={{ borderColor: C.borda, color: C.verde }} value={qtdParcelas} onChange={(e) => setQtdParcelas(e.target.value)} placeholder="Ex: 1" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-bold" style={{ color: "#7D8A86" }}>Primeiro vencimento</p>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5B6B67" }}>Primeiro vencimento</label>
            <input type="date" className="border rounded-lg px-3 py-2.5 w-full text-sm focus:outline-none" style={{ borderColor: C.borda, color: C.verde }} value={primeiroVencimento} onChange={(e) => setPrimeiroVencimento(e.target.value)} />
          </div>
          <div className="rounded-2xl px-4 py-3 self-end shadow-sm" style={{ backgroundColor: C.verde, color: C.creme }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.dourado }}>Resumo financeiro</p>
            <p className="text-xs mt-1">Serao geradas <strong>{Number(qtdParcelas || 1)}</strong> parcela(s) mensal(is) a partir de <strong>{fmtDate(primeiroVencimento)}</strong>.</p>
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2" style={{ borderColor: C.borda }}>
          <button className="px-3 py-2 border rounded-lg text-sm" style={{ borderColor: `${C.verde}40`, color: C.verde }} onClick={onClose}>Cancelar</button>
          <button className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: C.verde, color: C.dourado }} onClick={submit} disabled={loading}>
            {loading ? "Salvando..." : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompraDetalhe({ compra, onUpdated }: { compra: CompraComercial; onUpdated: () => void }) {
  const [itens, setItens] = useState<ItemCompraComercial[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [produtos, setProdutos] = useState<ProdutoBusca[]>([]);
  const [showSugestoesProduto, setShowSugestoesProduto] = useState(false);
  const [produtoId, setProdutoId] = useState("");
  const [produtoSelecionadoMeta, setProdutoSelecionadoMeta] = useState<ProdutoSelecionadoMeta | null>(null);
  const [qtd, setQtd] = useState("");
  const [cotacaoReferencial, setCotacaoReferencial] = useState("");
  const [fatorOuro, setFatorOuro] = useState("1");
  const [valorGrama, setValorGrama] = useState("");
  const [custoTotalPedra, setCustoTotalPedra] = useState("");
  const [pesoTotal, setPesoTotal] = useState("");
  const [msg, setMsg] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);

  const bloqueada = compra.bloqueado || compra.situacao === "concluido";
  const ehProdutoPedra = useMemo(() => {
    const categoria = String(produtoSelecionadoMeta?.categoria ?? "").toLowerCase();
    const categoriaPrecificacao = String(produtoSelecionadoMeta?.categoria_precificacao ?? "").toLowerCase();
    const nome = String(produtoSelecionadoMeta?.nome ?? "").toLowerCase();
    const pesoCt = Number(produtoSelecionadoMeta?.peso_pedra_ct ?? 0);
    return (
      categoria.startsWith("pedras") ||
      categoriaPrecificacao.startsWith("pedras") ||
      Boolean(produtoSelecionadoMeta?.tem_pedra_preciosa) ||
      pesoCt > 0 ||
      nome.includes("diamante") ||
      nome.includes("zirc") ||
      nome.includes("rubi") ||
      nome.includes("esmeralda") ||
      nome.includes("safira")
    );
  }, [produtoSelecionadoMeta]);

  const loadItens = useCallback(async () => {
    const data = await fetch(`/api/compras-comercial/${compra.id}/itens`).then((r) => r.json());
    setItens(data ?? []);
  }, [compra.id]);

  useEffect(() => { loadItens(); }, [loadItens]);

  useEffect(() => {
    const id = setTimeout(() => {
      fetch(`/api/compras-comercial/produtos?q=${encodeURIComponent(buscaProduto)}`)
        .then((r) => r.json())
        .then((d) => setProdutos(d ?? []));
    }, 200);
    return () => clearTimeout(id);
  }, [buscaProduto]);

  useEffect(() => {
    if (cotacaoReferencial && fatorOuro) {
      const c = Number(cotacaoReferencial);
      const f = Number(fatorOuro);
      if (!Number.isNaN(c) && !Number.isNaN(f) && c > 0 && f > 0) {
        setValorGrama((c * f).toFixed(2));
      }
    }
  }, [cotacaoReferencial, fatorOuro]);

  const custoPorCtPedraCalc = useMemo(
    () => calcularCustoPorCtPedra(Number(pesoTotal || 0), Number(custoTotalPedra || 0)),
    [pesoTotal, custoTotalPedra]
  );

  const qtdPecasPedraCalc = useMemo(
    () => calcularQtdPecasPedra(Number(pesoTotal || 0), Number(produtoSelecionadoMeta?.peso_pedra_ct ?? 0)),
    [pesoTotal, produtoSelecionadoMeta?.peso_pedra_ct]
  );

  async function addItem() {
    setMsg("");
    // REGRA DE NEGOCIO:
    // - O que faz: pedras usam ct total + custo total com quantidade estimada automatica; joias mantem quantidade manual.
    // - Por que: evita contagem manual imprecisa em pedras pequenas e preserva fluxo atual para os demais produtos.
    // - Impacto se alterado/removido: pode quebrar compras atuais ou voltar erro operacional de contagem.
    const qtdNum = Number(qtd);
    if (!ehProdutoPedra && (!Number.isFinite(qtdNum) || qtdNum < 1 || !Number.isInteger(qtdNum))) {
      setMsg("Quantidade deve ser um numero inteiro positivo.");
      return;
    }
    if (ehProdutoPedra && (!custoTotalPedra || Number(custoTotalPedra) <= 0)) {
      setMsg("Para pedras, informe o custo total.");
      return;
    }
    if (!ehProdutoPedra && (!valorGrama || Number(valorGrama) <= 0)) {
      setMsg("Para joia, informe o valor por grama.");
      return;
    }
    if (!pesoTotal || Number(pesoTotal) <= 0) {
      setMsg(ehProdutoPedra ? "Para pedras, informe o ct total." : "Informe o peso total.");
      return;
    }
    const res = await fetch(`/api/compras-comercial/${compra.id}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        produto_id: Number(produtoId),
        qtd: ehProdutoPedra ? undefined : qtdNum,
        cotacao_referencial: cotacaoReferencial ? Number(cotacaoReferencial) : undefined,
        fator_ouro: fatorOuro ? Number(fatorOuro) : undefined,
        custo_total: ehProdutoPedra ? Number(custoTotalPedra) : undefined,
        valor_grama: ehProdutoPedra ? undefined : Number(valorGrama),
        peso_total: Number(pesoTotal),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Erro ao adicionar item");
      return;
    }
    setProdutoId("");
    setProdutoSelecionadoMeta(null);
    setQtd("");
    setCotacaoReferencial("");
    setFatorOuro("1");
    setValorGrama("");
    setCustoTotalPedra("");
    setPesoTotal("");
    setMsg("Item adicionado.");
    loadItens();
    onUpdated();
  }

  async function removerItem(itemId: number) {
    await fetch(`/api/compras-comercial/${compra.id}/itens/${itemId}`, { method: "DELETE" });
    loadItens();
    onUpdated();
  }

  async function acao(path: "receber" | "concluir" | "reverter-rascunho") {
    setLoadingAction(true);
    setMsg("");
    const res = await fetch(`/api/compras-comercial/${compra.id}/${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: path === "receber" ? JSON.stringify({}) : undefined,
    });
    const data = await res.json();
    setLoadingAction(false);
    if (!res.ok) {
      setMsg(data.error ?? "Falha na operação");
      return;
    }
    setMsg(path === "concluir" ? "Compra concluída: estoque e contas a pagar gerados." : "Operação realizada.");
    onUpdated();
  }

  async function solicitarAprovacao() {
    setMsg("");
    setLoadingAction(true);
    // REGRA DE NEGOCIO:
    // - O que faz: dispara solicitacao sem permitir escolha manual de aprovador no front.
    // - Por que: o aprovador oficial vem da configuracao central e deve ser aplicado no backend.
    // - Impacto se alterado/removido: operador pode direcionar aprovacao para usuario indevido.
    const res = await fetch(`/api/compras-comercial/${compra.id}/solicitar-aprovacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setLoadingAction(false);
    if (!res.ok) {
      if (res.status === 409 && String(data?.error ?? "").includes("Nenhum aprovador configurado")) {
        setMsg("Aprovador de compra comercial não configurado em Configurações > Aprovadores.");
        return;
      }
      setMsg(data.error ?? "Erro ao solicitar aprovação");
      return;
    }
    setMsg("Aprovação solicitada. A ordem foi bloqueada para edição.");
    onUpdated();
  }

  return (
    <div className="border rounded-2xl p-4 md:p-5 space-y-4 bg-white shadow-sm" style={{ borderColor: C.borda }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Compra #{compra.id} {compra.fornecedor_nome ? `- ${compra.fornecedor_nome}` : ""}</h3>
        <SituacaoTag s={compra.situacao} />
      </div>
      <div className="text-sm grid md:grid-cols-3 gap-2 border rounded-xl p-3" style={{ backgroundColor: `${C.creme}55`, borderColor: C.borda, color: "#5B6B67" }}>
        <p>Local: {compra.local_nome ?? "-"}</p>
        <p>Parcelas: {compra.qtd_parcelas}x</p>
        <p>1o venc.: {fmtDate(compra.primeiro_vencimento)}</p>
      </div>

        <div className="border rounded-xl overflow-hidden" style={{ borderColor: C.borda }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: `${C.creme}80` }}>
            <tr>
              <th className="p-2 text-left">Produto</th>
              <th className="p-2 text-left">SKU</th>
                <th className="p-2 text-right">Qtd</th>
                <th className="p-2 text-right">Peso Total (g)</th>
                <th className="p-2 text-right">Peso Unitário (g)</th>
                <th className="p-2 text-right">Valor/g</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2" />
              </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-2">{i.produto_nome}</td>
                <td className="p-2">{i.produto_sku ?? "-"}</td>
                <td className="p-2 text-right">
                  {(() => {
                    const categoria = String(i.produto_categoria ?? "").toLowerCase();
                    const ehPedra = categoria.startsWith("pedras") || Boolean(i.tem_pedra_preciosa);
                    if (!ehPedra) return Number(i.qtd).toFixed(2);
                    const qtdEst = Number(i.qtd ?? 0);
                    const qtdExata = Number(i.qtd_exata ?? 0);
                    return `${Number.isFinite(qtdEst) ? qtdEst.toFixed(0) : "0"} est.${Number.isFinite(qtdExata) && qtdExata > 0 ? ` (${qtdExata.toFixed(4)} exata)` : ""}`;
                  })()}
                </td>
                <td className="p-2 text-right">
                  {(() => {
                    const valorGrama = Number(i.valor_grama ?? i.valor_unitario ?? 0);
                    const pesoTotalRaw = Number(i.peso_total ?? 0);
                    const pesoTotal = pesoTotalRaw > 0
                      ? pesoTotalRaw
                      : (valorGrama > 0 ? Number(i.valor_total ?? 0) / valorGrama : 0);
                    return pesoTotal > 0 ? pesoTotal.toFixed(3) : "0.000";
                  })()}
                </td>
                <td className="p-2 text-right">
                  {(() => {
                    const valorGrama = Number(i.valor_grama ?? i.valor_unitario ?? 0);
                    const pesoTotalRaw = Number(i.peso_total ?? 0);
                    const pesoTotal = pesoTotalRaw > 0
                      ? pesoTotalRaw
                      : (valorGrama > 0 ? Number(i.valor_total ?? 0) / valorGrama : 0);
                    return Number(i.qtd) > 0 ? (pesoTotal / Number(i.qtd)).toFixed(3) : "-";
                  })()}
                </td>
                <td className="p-2 text-right">{formatMoeda(i.valor_grama ?? i.valor_unitario)}</td>
                <td className="p-2 text-right font-semibold">{formatMoeda(i.valor_total)}</td>
                <td className="p-2 text-right">
                  {!bloqueada && <button className="text-red-600 text-xs" onClick={() => removerItem(i.id)}>Remover</button>}
                </td>
              </tr>
            ))}
            {itens.length === 0 && <tr><td className="p-4 text-center text-gray-500" colSpan={8}>Sem itens</td></tr>}
          </tbody>
        </table>
      </div>

      {!bloqueada && (
        <div className="border rounded-xl p-3 space-y-2" style={{ borderColor: C.borda, backgroundColor: `${C.creme}50` }}>
          <p className="text-sm font-medium">Adicionar item</p>
          <div className="grid md:grid-cols-3 gap-2">
            <div className="md:col-span-2">
              <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Produto</p>
              <div className="relative">
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  style={{ borderColor: C.borda }}
                  placeholder="Buscar produto por nome/sku"
                  value={buscaProduto}
                  onFocus={() => setShowSugestoesProduto(true)}
                  onChange={(e) => {
                    setBuscaProduto(e.target.value);
                    setProdutoId("");
                    setProdutoSelecionadoMeta(null);
                    setShowSugestoesProduto(true);
                  }}
                />
                {showSugestoesProduto && buscaProduto.trim().length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-56 overflow-y-auto" style={{ borderColor: C.borda }}>
                    {produtos.length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-500">Nenhum produto encontrado.</p>
                    )}
                    {produtos.map((p) => (
                      <button
                        key={p.id_produto}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-amber-50"
                        style={{ color: C.verde }}
                        onClick={() => {
                          setProdutoId(String(p.id_produto));
                          // REGRA DE NEGOCIO:
                          // - O que faz: fixa metadados do produto selecionado para renderizar o formulario correto (pedra x joia).
                          // - Por que: o operador precisa ver campos coerentes com o tipo do item sem perder contexto ao alterar busca.
                          // - Impacto se alterado/removido: formulario pode alternar campos errados e gerar cadastro inconsistente.
                          setProdutoSelecionadoMeta({
                            id_produto: p.id_produto,
                            nome: p.nome,
                            sku: p.sku,
                            categoria: p.categoria,
                            categoria_precificacao: p.categoria_precificacao,
                            tem_pedra_preciosa: p.tem_pedra_preciosa,
                            peso_pedra_ct: p.peso_pedra_ct,
                          });
                          setBuscaProduto(`${p.nome}${p.sku ? ` (${p.sku})` : ""}`);
                          // REGRA DE NEGOCIO:
                          // - O que faz: usa dados do cadastro como base (fator/peso) e deixa operador ajustar conforme compra real.
                          // - Por que: compra por lote pode ter variacao e exige ajuste manual no fechamento.
                          // - Impacto se alterado/removido: operador perde agilidade e risco de erro de digitacao aumenta.
                          if (p.fator != null) {
                            setFatorOuro(String(p.fator));
                          }
                          setCustoTotalPedra("");
                          setPesoTotal("");
                          setQtd("");
                          setCotacaoReferencial("");
                          setValorGrama("");
                          setShowSugestoesProduto(false);
                        }}
                      >
                        {p.nome} {p.sku ? `(${p.sku})` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!!produtoId && <p className="text-xs mt-1" style={{ color: C.verde }}>Produto selecionado.</p>}
            </div>
            <div>
              <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Quantidade</p>
              {/* REGRA DE NEGOCIO: apenas inteiros — estoque comercial usa pecas inteiras */}
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full"
                style={{ borderColor: C.borda }}
                type="number"
                step="1"
                min="1"
                placeholder={ehProdutoPedra ? "Calculada automaticamente" : "Quantidade"}
                value={ehProdutoPedra ? (qtdPecasPedraCalc?.qtdEstimada ?? "") : qtd}
                onChange={(e) => setQtd(e.target.value)}
                disabled={ehProdutoPedra}
              />
            </div>
            <div>
              <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>{ehProdutoPedra ? "Ct total" : "Peso total"}</p>
              <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: C.borda }} type="number" step="0.001" placeholder={ehProdutoPedra ? "Ct total" : "Peso total (g)"} value={pesoTotal} onChange={(e) => setPesoTotal(e.target.value)} />
            </div>
            {ehProdutoPedra ? (
              <>
                <div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Custo total</p>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: C.borda }} type="number" step="0.01" placeholder="Custo total (R$)" value={custoTotalPedra} onChange={(e) => setCustoTotalPedra(e.target.value)} />
                </div>
                <div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Custo/ct</p>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full bg-gray-50" style={{ borderColor: C.borda }} type="text" value={custoPorCtPedraCalc != null ? custoPorCtPedraCalc.toFixed(4) : ""} placeholder="Calculado automaticamente" readOnly />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Cotação</p>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: C.borda }} type="number" step="0.01" placeholder="Cotação referencial" value={cotacaoReferencial} onChange={(e) => setCotacaoReferencial(e.target.value)} />
                </div>
                <div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Fator</p>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: C.borda }} type="number" step="0.0001" placeholder="Fator" value={fatorOuro} onChange={(e) => setFatorOuro(e.target.value)} />
                  <p className="text-[11px] mt-1" style={{ color: "#7D8A86" }}>Ex.: 0,750</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: "#7D8A86" }}>Valor da grama</p>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" style={{ borderColor: C.borda }} type="number" step="0.01" placeholder="Valor da grama" value={valorGrama} onChange={(e) => setValorGrama(e.target.value)} />
                </div>
              </>
            )}
            <button className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: C.verde, color: C.dourado }} onClick={addItem}>Adicionar</button>
          </div>
          <div className="text-xs" style={{ color: "#5B6B67" }}>
            {ehProdutoPedra ? (
              <>
                <strong>Qtd exata (referência):</strong> {qtdPecasPedraCalc ? `${qtdPecasPedraCalc.qtdExata.toFixed(4)} pç` : "-"}
                {custoPorCtPedraCalc != null && Number(pesoTotal) > 0 ? ` • Total estimado: ${formatMoeda(Number(pesoTotal) * custoPorCtPedraCalc)}` : ""}
              </>
            ) : (
              <>
                <strong>Peso unitario:</strong> {Number(qtd) > 0 && Number(pesoTotal) > 0 ? `${(Number(pesoTotal) / Number(qtd)).toFixed(3)} g` : "-"}
                {Number(pesoTotal) > 0 && Number(valorGrama) > 0 ? ` • Total estimado: ${formatMoeda(Number(pesoTotal) * Number(valorGrama))}` : ""}
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {!bloqueada && (compra.situacao === "rascunho" || compra.situacao === "pendente" || compra.situacao === "rejeitado") && (
          <button
            className="px-3 py-2 rounded"
            style={{ backgroundColor: C.verde, color: C.dourado }}
            onClick={solicitarAprovacao}
            disabled={loadingAction || itens.length === 0}
          >
            {loadingAction ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="inline mr-1" />} Solicitar Aprovação
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: "#6b7280" }}>
        O aprovador da compra comercial é definido em Configurações &gt; Aprovadores.
      </p>

      {msg && <p className="text-sm text-gray-700">{msg}</p>}
    </div>
  );
}

export default function ComprasComercialClient({ compras: initialCompras }: { compras: CompraComercial[] }) {
  const [compras, setCompras] = useState<CompraComercial[]>(initialCompras);
  const [selectedId, setSelectedId] = useState<number | null>(initialCompras[0]?.id ?? null);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("");
  const [showNova, setShowNova] = useState(false);

  const reload = useCallback(async () => {
    const params = new URLSearchParams();
    if (situacao) params.set("situacao", situacao);
    const data = await fetch(`/api/compras-comercial${params.toString() ? `?${params.toString()}` : ""}`).then((r) => r.json());
    setCompras(data ?? []);
  }, [situacao]);

  useEffect(() => {
    // REGRA DE NEGOCIO:
    // - O que faz: abre automaticamente a ordem quando a tela recebe `?id={compra}` via link de aprovacao.
    // - Por que: reduz friccao na auditoria e acelera a decisao do aprovador.
    // - Impacto se alterado/removido: aprovador cai na lista geral sem foco da ordem referenciada.
    const params = new URLSearchParams(window.location.search);
    const idParam = Number(params.get("id") ?? "");
    if (Number.isFinite(idParam) && idParam > 0) {
      setSelectedId(idParam);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtradas = useMemo(() => {
    if (!busca.trim()) return compras;
    const b = busca.toLowerCase();
    return compras.filter((c) => `${c.id}`.includes(b) || (c.fornecedor_nome ?? "").toLowerCase().includes(b));
  }, [busca, compras]);

  const selected = selectedId != null ? compras.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-[calc(100vh-64px)] animate-[fadeIn_0.3s_ease-out]" style={{ background: `linear-gradient(180deg, ${C.creme}55 0%, #ffffff 35%)` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg" style={{ backgroundColor: C.verde }}><ShoppingCart size={16} color={C.dourado} /></div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: C.verde }}>Compras Comercial</h1>
            <p className="text-xs" style={{ color: "#5B6B67" }}>Entrada automatica no estoque comercial e contas a pagar parceladas.</p>
          </div>
        </div>
        <button className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ backgroundColor: C.verde, color: C.dourado }} onClick={() => setShowNova(true)}><Plus size={14} className="inline mr-1" />Nova Compra</button>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        <div className="relative md:col-span-2">
          <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
          <input className="w-full border rounded-lg pl-7 pr-3 py-2" style={{ borderColor: C.borda }} placeholder="Buscar por fornecedor ou id" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="border rounded-lg px-3 py-2" style={{ borderColor: C.borda }} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas situações</option>
          <option value="rascunho">Rascunho</option>
          <option value="recebida">Recebida</option>
          <option value="aguardando_aprovacao">Aguardando Aprovação</option>
          <option value="aprovado">Aprovada</option>
          <option value="rejeitado">Rejeitada</option>
        </select>
      </div>

      <div className="grid md:grid-cols-5 gap-4 items-start">
        <div className="md:col-span-2 border rounded-2xl overflow-hidden bg-white shadow-sm" style={{ borderColor: C.borda }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: `${C.creme}80` }}>
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Fornecedor</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.id} className="border-t cursor-pointer" style={{ backgroundColor: selectedId === c.id ? `${C.creme}` : "transparent" }} onClick={() => setSelectedId(c.id)}>
                  <td className="p-2">#{c.id}</td>
                  <td className="p-2">{c.fornecedor_nome ?? "-"}</td>
                  <td className="p-2"><SituacaoTag s={c.situacao} /></td>
                  <td className="p-2 text-right">{c.total ? formatMoeda(c.total) : "-"}</td>
                </tr>
              ))}
              {filtradas.length === 0 && <tr><td className="p-4 text-center text-gray-500" colSpan={4}>Sem compras</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="md:col-span-3">
          {selected ? <CompraDetalhe compra={selected} onUpdated={reload} /> : <div className="border rounded-xl p-6 text-gray-500">Selecione uma compra</div>}
        </div>
      </div>

      <NovaCompraModal open={showNova} onClose={() => setShowNova(false)} onCreated={reload} />
    </div>
  );
}
