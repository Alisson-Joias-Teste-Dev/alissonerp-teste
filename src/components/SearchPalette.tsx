"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";

interface SearchEntry {
  label: string;
  href: string;
  group: string;
}

const ALL_PAGES: SearchEntry[] = [
  { label: "Dashboard", href: "/", group: "Principal" },
  { label: "Ordens de Produção", href: "/ordens", group: "Produção" },
  { label: "PCP", href: "/pcp", group: "Produção" },
  { label: "Distribuição", href: "/distribuicao", group: "Produção" },
  { label: "Protocolo", href: "/protocolo", group: "Produção" },
  { label: "Purificação", href: "/purificacao", group: "Produção" },
  { label: "Rota Fabricação", href: "/rota-fabricacao", group: "Produção" },
  { label: "Setores", href: "/setores", group: "Produção" },
  { label: "Vendas", href: "/vendas", group: "Comercial" },
  { label: "Orçamento", href: "/orcamento", group: "Comercial" },
  { label: "Crediário", href: "/crediario", group: "Comercial" },
  { label: "Entregas de Venda", href: "/entregas-venda", group: "Comercial" },
  { label: "Dashboard Comercial", href: "/dashboard-comercial", group: "Comercial" },
  { label: "Promoções", href: "/comercial/promocoes", group: "Comercial" },
  { label: "Financeiro", href: "/financeiro", group: "Financeiro" },
  { label: "Contas a Pagar", href: "/financeiro/a-pagar", group: "Financeiro" },
  { label: "Contas a Receber", href: "/financeiro/a-receber", group: "Financeiro" },
  { label: "Caixa", href: "/financeiro/caixa", group: "Financeiro" },
  { label: "Cofre Ouro", href: "/financeiro/cofre", group: "Financeiro" },
  { label: "Conciliação", href: "/financeiro/conciliacao", group: "Financeiro" },
  { label: "Comissões", href: "/financeiro/comissoes", group: "Financeiro" },
  { label: "Estoque Comercial", href: "/estoque-comercial", group: "Estoque" },
  { label: "Estoque Produtos", href: "/estoque-produtos", group: "Estoque" },
  { label: "Gestão de Estoque", href: "/gestao-estoque", group: "Estoque" },
  { label: "Insumos", href: "/insumos", group: "Estoque" },
  { label: "Compras", href: "/compras", group: "Estoque" },
  { label: "Compras Comercial", href: "/compras-comercial", group: "Estoque" },
  { label: "Metal", href: "/metal", group: "Estoque" },
  { label: "Produtos", href: "/produtos", group: "Cadastros" },
  { label: "Precificação", href: "/precificacao", group: "Cadastros" },
  { label: "Auditoria", href: "/auditoria", group: "Auditoria" },
  { label: "Relatórios", href: "/relatorios", group: "Relatórios" },
  { label: "Tarefas", href: "/tarefas", group: "Tarefas" },
  { label: "Configurações", href: "/configuracoes?tab=parametros", group: "Configurações" },
  { label: "Cotações de Mercado", href: "/configuracoes?tab=parametros", group: "Configurações" },
  { label: "Integrações", href: "/configuracoes?tab=integracoes", group: "Configurações" },
  { label: "Webhooks", href: "/configuracoes?tab=webhooks", group: "Configurações" },
  { label: "Usuários", href: "/configuracoes?tab=usuarios", group: "Configurações" },
  { label: "IA", href: "/configuracoes?tab=ia", group: "Configurações" },
  { label: "Depósitos e Setores", href: "/configuracoes?tab=depositos", group: "Configurações" },
  { label: "Teores e Ligas", href: "/configuracoes?tab=teores", group: "Configurações" },
  { label: "Locais", href: "/configuracoes?tab=locais", group: "Configurações" },
  { label: "Tipos de Serviço", href: "/configuracoes?tab=tipos_servico", group: "Configurações" },
  { label: "Comissões", href: "/configuracoes?tab=comissoes", group: "Configurações" },
  { label: "Crédito Loja", href: "/configuracoes?tab=credito_loja", group: "Configurações" },
  { label: "Fretes", href: "/configuracoes?tab=fretes", group: "Configurações" },
  { label: "Gateways de Pagamento", href: "/configuracoes?tab=gateways", group: "Configurações" },
  { label: "Metal", href: "/configuracoes?tab=metal", group: "Configurações" },
  { label: "Aprovadores", href: "/configuracoes?tab=aprovadores", group: "Configurações" },
  { label: "Permissões", href: "/configuracoes?tab=permissoes", group: "Configurações" },
  { label: "Visibilidade Produtos", href: "/configuracoes?tab=produto_visibilidade", group: "Configurações" },
  { label: "Maquininhas", href: "/configuracoes?tab=maquininhas", group: "Configurações" },
  { label: "Perfil", href: "/perfil", group: "Conta" },
];

export default function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = query.trim()
    ? ALL_PAGES.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        p.group.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_PAGES;

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      navigate(filtered[selectedIndex].href);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar páginas..."
            className="w-full py-4 text-sm bg-transparent border-none outline-none text-gray-800 placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-gray-400 bg-gray-100 rounded border border-gray-200 shrink-0">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          )}

          {filtered.length > 0 && query && (
            filtered.map((page, i) => (
              <button
                key={page.href + page.label}
                onClick={() => navigate(page.href)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                  i === selectedIndex ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <ArrowRight size={14} className="shrink-0 text-gray-300" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{page.label}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{page.group}</span>
                </div>
              </button>
            ))
          )}

          {!query && (
            <div>
              {["Principal", "Produção", "Comercial", "Financeiro", "Estoque", "Cadastros", "Configurações", "Conta"].map(group => {
                const items = filtered.filter(p => p.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {group}
                    </div>
                    {items.map((page, i) => {
                      const globalIndex = filtered.indexOf(page);
                      return (
                        <button
                          key={page.href + page.label}
                          onClick={() => navigate(page.href)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                            globalIndex === selectedIndex ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <ArrowRight size={14} className="shrink-0 text-gray-300" />
                          <span className="truncate">{page.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
