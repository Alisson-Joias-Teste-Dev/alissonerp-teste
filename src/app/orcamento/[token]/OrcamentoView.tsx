"use client";

import { useState, useEffect } from "react";
import { Loader2, Download, User, Phone, Mail, MapPin, Package, CreditCard, Calendar } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ItemVenda {
  nome_produto: string; sku: string | null; quantidade: number;
  preco_lista: number; pct_desconto: number; preco_unitario: number;
  total_item: number;
  peso_estimado: number | null; observacao: string | null;
}
interface Pagamento {
  forma: string; gateway: string | null; valor: number;
  parcelas: number; status: string;
}
interface Venda {
  id: number; numero_venda: string; situacao: string;
  cliente_nome: string | null; cliente_email: string | null;
  cliente_telefone: string | null; cliente_celular: string | null;
  cliente_cpf_cnpj: string | null;
  cliente_endereco: string | null; cliente_numero: string | null;
  cliente_complemento: string | null; cliente_bairro: string | null;
  cliente_municipio: string | null; cliente_cep: string | null; cliente_uf: string | null;
  vendedor_nome: string | null;
  data_venda: string; data_entrega: string | null; created_at: string;
  total_produtos: number; total_desconto: number; total_frete: number;
  total_venda: number;
  forma_envio: string | null; forma_frete: string | null;
  observacoes: string | null;
  foto_3d: string | null;
  endereco_entrega: string | null; endereco_entrega_numero: string | null;
  endereco_entrega_complemento: string | null; endereco_entrega_bairro: string | null;
  endereco_entrega_cidade: string | null; endereco_entrega_cep: string | null;
  endereco_entrega_uf: string | null;
  itens: ItemVenda[];
  pagamentos: Pagamento[];
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function fmtDateTime(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Separator() {
  return <div className="my-6 border-t" style={{ borderColor: "#E5E7EB" }} />;
}

export default function OrcamentoView({ token }: { token: string }) {
  const [venda, setVenda] = useState<Venda | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Bug #25: aborta fetch + ignora setState quando o componente desmontou
    // (token muda ou usuário sai da página antes da resposta). Sem isso o
    // React reclamava de setState em componente desmontado.
    const ctrl = new AbortController();
    let alive = true;
    fetch(`/api/orcamento/compartilhado?token=${token}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Venda>;
      })
      .then(v => { if (alive) setVenda(v); })
      .catch(e => {
        if (!alive || (e instanceof Error && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; ctrl.abort(); };
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={28} className="animate-spin text-emerald-700" />
    </div>
  );

  if (error || !venda) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
      <p className="text-lg font-semibold text-gray-800">Pedido não encontrado</p>
      <p className="text-sm text-gray-500">{error}</p>
    </div>
  );

  const totalQtde = venda.itens.reduce((s, i) => s + i.quantidade, 0);

  const endEntrega = venda.endereco_entrega
    ? [venda.endereco_entrega, venda.endereco_entrega_numero ? `nº ${venda.endereco_entrega_numero}` : null, venda.endereco_entrega_complemento, venda.endereco_entrega_bairro, venda.endereco_entrega_cidade, venda.endereco_entrega_uf, venda.endereco_entrega_cep ? `CEP: ${venda.endereco_entrega_cep}` : null].filter(Boolean).join(", ")
    : [venda.cliente_endereco, venda.cliente_numero ? `nº ${venda.cliente_numero}` : null, venda.cliente_complemento, venda.cliente_bairro, venda.cliente_municipio, venda.cliente_uf, venda.cliente_cep ? `CEP: ${venda.cliente_cep}` : null].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-4xl px-4 print:max-w-none print:px-8">

        {/* ── Header: Logo + Baixar PDF ── */}
        <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row print:hidden">
          <p className="text-3xl font-bold tracking-wider" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            ALISSON<sup className="text-xs">®</sup>
          </p>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#059669" }}>
            <Download size={16} /> Baixar PDF
          </button>
        </div>

        {/* ── Card Pedido (header verde claro) ── */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 py-6 shadow-sm mb-6 text-center print:border-0 print:bg-transparent">
          <h1 className="text-2xl font-bold text-emerald-800">Pedido #{venda.numero_venda}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Calendar size={14} /> Venda: {fmtDate(venda.data_venda)}</span>
            {venda.data_entrega && (
              <span className="flex items-center gap-1.5"><Calendar size={14} /> Entrega: {fmtDate(venda.data_entrega)}</span>
            )}
          </div>
        </div>

        {/* ── Dados do Cliente + Vendedor ── */}
        <div className="rounded-xl border bg-white p-6 shadow-sm mb-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Cliente */}
            <div className="space-y-3 rounded-lg border bg-gray-50/50 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-gray-800">
                <User size={16} className="text-emerald-600" /> Dados do Cliente
              </h3>
              <p className="text-sm font-medium text-gray-900">{venda.cliente_nome ?? "—"}</p>
              {venda.cliente_cpf_cnpj && (
                <p className="text-sm text-gray-600">CPF/CNPJ: {venda.cliente_cpf_cnpj}</p>
              )}
              {(venda.cliente_celular || venda.cliente_telefone) && (
                <p className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Phone size={13} className="text-emerald-600" /> {venda.cliente_celular || venda.cliente_telefone}
                </p>
              )}
              {venda.cliente_email && (
                <p className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Mail size={13} className="text-emerald-600" /> {venda.cliente_email}
                </p>
              )}
            </div>

            {/* Vendedor */}
            <div className="space-y-3 rounded-lg border bg-gray-50/50 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-gray-800">
                <User size={16} className="text-emerald-600" /> Vendedor Responsável
              </h3>
              <p className="text-sm font-medium text-gray-900">{venda.vendedor_nome ?? "—"}</p>
            </div>
          </div>

          {/* Endereço de entrega */}
          {endEntrega && (
            <>
              <Separator />
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-2">
                  <MapPin size={16} className="text-emerald-600" /> Endereço de Entrega
                </h3>
                <p className="text-sm text-gray-600">{endEntrega}</p>
              </div>
            </>
          )}

          {/* Itens do pedido */}
          <Separator />
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-4">
              <Package size={16} className="text-emerald-600" /> Itens do Pedido
            </h3>
            <div className="space-y-3">
              {venda.itens.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 rounded-lg border bg-white p-3 shadow-sm">
                  {/* Foto: usa foto_3d do orçamento de origem quando existir.
                      Bug #40: antes era hardcoded "Sem foto". */}
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 overflow-hidden">
                    {idx === 0 && venda.foto_3d ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={venda.foto_3d} alt={item.nome_produto} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400">Sem foto</span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-semibold text-gray-900">{item.nome_produto}</p>
                    <p className="text-xs text-gray-500">SKU: {item.sku ?? "—"}</p>
                  </div>
                  {/* Preço */}
                  <div className="flex-shrink-0 text-right text-sm">
                    <p className="text-gray-600">{item.quantidade} UN x {fmt(item.preco_unitario)}</p>
                    <p className="font-bold text-emerald-700">{fmt(item.total_item)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo do pedido */}
          <Separator />
          <div className="rounded-lg border bg-emerald-50/30 p-4">
            <h3 className="mb-3 font-semibold text-gray-800">Resumo do Pedido</h3>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-gray-500">Nº de itens</p>
                <p className="font-bold text-gray-900">{venda.itens.length}</p>
              </div>
              <div>
                <p className="text-gray-500">Soma das qtdes</p>
                <p className="font-bold text-gray-900">{totalQtde}</p>
              </div>
              <div>
                <p className="text-gray-500">Total produtos</p>
                <p className="font-bold text-gray-900">{fmt(venda.total_produtos)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total do pedido</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(venda.total_venda)}</p>
              </div>
            </div>
            {(venda.total_desconto > 0 || venda.total_frete > 0) && (
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4 mt-3 pt-3 border-t" style={{ borderColor: "#D1FAE5" }}>
                {venda.total_desconto > 0 && (
                  <div>
                    <p className="text-gray-500">Desconto</p>
                    <p className="font-bold text-amber-600">−{fmt(venda.total_desconto)}</p>
                  </div>
                )}
                {venda.total_frete > 0 && (
                  <div>
                    <p className="text-gray-500">Frete</p>
                    <p className="font-bold text-gray-900">{fmt(venda.total_frete)}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pagamento */}
          {venda.pagamentos.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-3">
                  <CreditCard size={16} className="text-emerald-600" /> Pagamento
                </h3>
                {venda.pagamentos.map((pag, i) => (
                  <div key={i} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-gray-500">Forma de pagamento</p>
                      <p className="font-medium text-gray-900">{pag.forma}</p>
                    </div>
                    {pag.gateway && (
                      <div>
                        <p className="text-sm text-gray-500">Gateway</p>
                        <p className="font-medium text-gray-900">{pag.gateway}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500">Parcelas</p>
                      <p className="font-medium text-gray-900">{pag.parcelas}x</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Observações */}
          {venda.observacoes && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Observações</h3>
                <p className="text-sm text-gray-600">{venda.observacoes}</p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="mt-6 text-center print:mt-4">
          <p className="text-xs text-gray-400">
            Este documento foi gerado automaticamente pelo sistema Alisson Joias. Gerado em {fmtDateTime(venda.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
