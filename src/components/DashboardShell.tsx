"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import ServiceLayout from "@/components/layout/ServiceLayout";
import ServiceApp from "@/components/service/ServiceApp";
import GlobalErrorToast from "@/components/ui/GlobalErrorToast";
import MencaoAlarme from "@/components/MencaoAlarme";
import ReservaAlarme from "@/components/ReservaAlarme";
import VencidosAlarme from "@/components/VencidosAlarme";
import InstallPrompt from "@/components/InstallPrompt";
import EnvironmentBadge from "@/components/EnvironmentBadge";
import UserDropdown from "@/components/header/UserDropdown";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import { Toaster } from "sonner";
import { useState, useEffect, useRef } from "react";

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

const SearchIcon = () => (
  <svg className="fill-gray-500" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z" fill="" />
  </svg>
);

const MenuIcon = () => (
  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill="currentColor" />
  </svg>
);

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { loading, isOperadorService } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { isExpanded, isHovered, isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? ALL_PAGES.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        p.group.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const navigate = (href: string) => {
    router.push(href);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && filtered[selectedIndex]) { navigate(filtered[selectedIndex].href); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  const handleToggle = () => {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  };

  const sidebarWidth = isExpanded || isHovered ? "md:ml-[290px]" : "md:ml-[90px]";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAFAF7" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#184036] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (pathname === "/service" && isOperadorService) {
    return (
      <ServiceLayout>
        <ServiceApp />
        <GlobalErrorToast />
        <EnvironmentBadge />
        <Toaster position="top-right" richColors closeButton />
      </ServiceLayout>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${sidebarWidth}`}>
        <header className="sticky top-0 flex w-full bg-white border-b border-gray-200 z-40">
          <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
            <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
              <button
                className="items-center justify-center w-10 h-10 text-gray-500 border-gray-200 rounded-lg z-40 lg:flex lg:h-11 lg:w-11 lg:border outline-none focus:outline-none focus-visible:outline-none"
                onClick={handleToggle}
                aria-label="Toggle Sidebar"
              >
                {isMobileOpen ? <CloseIcon /> : <MenuIcon />}
              </button>

              <h1 className="text-sm font-semibold tracking-widest uppercase text-esmeralda-700 lg:hidden" style={{ fontFamily: "var(--font-playfair)" }}>
                Alisson ERP
              </h1>

              <div className="hidden lg:block relative" ref={searchRef}>
                <div className="relative">
                  <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
                    <SearchIcon />
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => query && setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Buscar páginas..."
                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 placeholder:text-gray-400 xl:w-[430px] outline-none focus:outline-none focus-visible:outline-none"
                  />
                  <button
                    onClick={() => inputRef.current?.focus()}
                    className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 outline-none focus:outline-none focus-visible:outline-none"
                  >
                    <span>⌘</span>
                    <span>K</span>
                  </button>
                </div>

                {open && filtered.length > 0 && (
                  <div className="absolute top-full mt-2 left-0 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50">
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      {filtered.map((page, i) => (
                        <button
                          key={page.href + page.label}
                          onClick={() => navigate(page.href)}
                          onMouseEnter={() => setSelectedIndex(i)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                            i === selectedIndex ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="block truncate font-medium">{page.label}</span>
                            <span className="block text-[11px] text-gray-400 truncate">{page.group}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                className="flex items-center justify-center w-10 h-10 text-gray-700 rounded-lg z-40 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z" fill="currentColor" />
                </svg>
              </button>
            </div>

            <div className="hidden items-center justify-between w-full gap-4 px-5 py-4 lg:flex lg:justify-end lg:px-0">
              <div className="flex items-center gap-2 2xsm:gap-3">
                <NotificationDropdown />
              </div>
              <UserDropdown />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden" style={{ backgroundColor: "#FAFAF7" }}>
          {children}
        </main>
      </div>
      <MencaoAlarme />
      <ReservaAlarme />
      <VencidosAlarme />
      <GlobalErrorToast />
      <InstallPrompt />
      <EnvironmentBadge />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <MobileHeader />
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}
