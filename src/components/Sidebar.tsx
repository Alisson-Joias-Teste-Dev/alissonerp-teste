"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, ClipboardList, ClipboardCheck, Kanban, Layers, Package, Scale,
  FileText, ShoppingCart, ShoppingBag, DollarSign, TrendingUp, Settings, LogOut,
  FlaskConical, Factory, Truck, ShieldCheck, Briefcase, ChevronDown, Route, Tag,
  BarChart2, BarChart3, Bell, Flame, Smartphone, Wrench, ListTodo, PackageCheck,
  Store, FileBarChart, FileSpreadsheet, Percent, Target, RotateCcw, Ticket, Receipt,
  Building2, FileCheck2, Globe, Sparkles, ArrowUpCircle, ArrowDownCircle,
  Banknote, Landmark, CreditCard, Webhook,
} from "lucide-react";
import { NotificacoesDrawer } from "./NotificacoesDrawer";
import PerfilDrawer from "./PerfilDrawer";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { getMenuGroupsForRole, getMenuGroupsForModulos, type MenuGroup, type MenuEntry, type MenuItem } from "@/lib/auth/permissions";
import { ROLES_SERVICE_PANEL, ROLES_METAL } from "@/lib/roles";
import UserAvatar from "@/components/UserAvatar";
import { useSidebar } from "@/contexts/SidebarContext";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  LayoutDashboard, ClipboardList, ClipboardCheck, Kanban, Layers, Package, Scale,
  FileText, ShoppingCart, ShoppingBag, DollarSign, TrendingUp, Settings,
  FlaskConical, Factory, Truck, ShieldCheck, Briefcase, Route, Tag, BarChart2,
  BarChart3, Bell, Flame, Smartphone, Wrench, ListTodo, PackageCheck, Store,
  FileBarChart, FileSpreadsheet, Percent, Target, RotateCcw, Ticket, Receipt,
  Building2, FileCheck2, Globe, Sparkles, ArrowUpCircle, ArrowDownCircle,
  Banknote, Landmark, CreditCard, LogOut,
};

function isGroup(entry: MenuEntry): entry is MenuGroup { return (entry as MenuGroup).type === "group"; }
function isActive(entry: MenuItem, pathname: string) { return pathname === entry.href || (entry.href !== "/" && pathname.startsWith(entry.href)); }
function isActiveInGroup(group: MenuGroup, pathname: string) { return group.items.some(item => isActive(item, pathname)); }

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, nome, fotoUrl, loading: authLoading, user, modulos_leitura, isOperadorService } = useAuth();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, aberta, setAberta } = useSidebar();

  const hasServicePanel = role && ROLES_SERVICE_PANEL.includes(role as typeof ROLES_SERVICE_PANEL[number]);
  const ROLES_ORCAMENTO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];
  const ROLES_FISCAL_SIDEBAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const ROLES_GESTAO_ESTOQUE = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const ROLES_SITE = ["desenvolvedor", "admin", "gerente_loja"];
  const ROLES_CREDIARIO_SIDEBAR = ["desenvolvedor", "admin", "gerente_loja", "consultora"];
  const ROLES_ENTREGAS_VENDA = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica"];
  const hasMetal = role ? ROLES_METAL.includes(role) : false;
  const hasOrcamento = role && ROLES_ORCAMENTO.includes(role);
  const hasFiscal = role && ROLES_FISCAL_SIDEBAR.includes(role);
  const hasGestaoEstoque = role && ROLES_GESTAO_ESTOQUE.includes(role);
  const hasSite = role && ROLES_SITE.includes(role);
  const hasCrediario = role && ROLES_CREDIARIO_SIDEBAR.includes(role);
  const hasEntregasVenda = role && ROLES_ENTREGAS_VENDA.includes(role);

  const modulosEfetivos = [...modulos_leitura];
  if (modulosEfetivos.length > 0) {
    if (hasServicePanel && !modulosEfetivos.includes("service_painel")) modulosEfetivos.push("service_painel");
    if (hasOrcamento && !modulosEfetivos.includes("orcamento")) modulosEfetivos.push("orcamento");
    if (hasFiscal && !modulosEfetivos.includes("fiscal")) modulosEfetivos.push("fiscal");
    if (hasGestaoEstoque && !modulosEfetivos.includes("gestao_estoque")) modulosEfetivos.push("gestao_estoque");
    if (hasSite && !modulosEfetivos.includes("site")) modulosEfetivos.push("site");
    if (hasCrediario && !modulosEfetivos.includes("crediario")) modulosEfetivos.push("crediario");
    if (hasMetal && !modulosEfetivos.includes("metal")) modulosEfetivos.push("metal");
    if (hasEntregasVenda && !modulosEfetivos.includes("entregas_venda")) modulosEfetivos.push("entregas_venda");
  }

  const configSubItems: MenuItem[] = [
    { label: "Cotações de Mercado", href: "/configuracoes?tab=parametros", icon: "none" },
    { label: "Integrações",   href: "/configuracoes?tab=integracoes",   icon: "none" },
    { label: "Webhooks",      href: "/configuracoes?tab=webhooks",      icon: "none" },
    { label: "Usuários",      href: "/configuracoes?tab=usuarios",      icon: "none" },
    { label: "IA",            href: "/configuracoes?tab=ia",            icon: "none" },
    { label: "Depósitos e Setores", href: "/configuracoes?tab=depositos", icon: "none" },
    { label: "Teores e Ligas", href: "/configuracoes?tab=teores",       icon: "none" },
    { label: "Locais",        href: "/configuracoes?tab=locais",        icon: "none" },
    { label: "Tipos de Serviço", href: "/configuracoes?tab=tipos_servico", icon: "none" },
    { label: "Comissões",     href: "/configuracoes?tab=comissoes",     icon: "none" },
    { label: "Crédito Loja",  href: "/configuracoes?tab=credito_loja",  icon: "none" },
    { label: "Fretes",        href: "/configuracoes?tab=fretes",        icon: "none" },
    { label: "Gateways de Pagamento", href: "/configuracoes?tab=gateways", icon: "none" },
    { label: "Metal",         href: "/configuracoes?tab=metal",         icon: "none" },
    { label: "Aprovadores",   href: "/configuracoes?tab=aprovadores",   icon: "none" },
  ];

  const allEntries = modulosEfetivos.length > 0 ? getMenuGroupsForModulos(modulosEfetivos) : getMenuGroupsForRole(role);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = allEntries.filter(e => isGroup(e) || (e as any).href !== "/configuracoes");

  const serviceExtras: MenuItem[] = [];
  if (isOperadorService) serviceExtras.push({ label: "Service", href: "/service", icon: "Smartphone" });

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (pathname.startsWith("/configuracoes")) initial.add("Configurações");
    return initial;
  });
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [drawerAberto, setDrawerAberto] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [carregandoNotifs, setCarregandoNotifs] = useState(false);

  const queryClient = useQueryClient();
  const { data: contagem } = useQuery({ queryKey: ["notificacoes", "contagem"], queryFn: async () => { const res = await fetch("/api/notificacoes/contagem"); if (!res.ok) return { nao_lidas: 0 }; return res.json() as Promise<{ nao_lidas: number }>; }, refetchInterval: 60_000, staleTime: 30_000 });
  const naoLidas = (contagem?.nao_lidas as number | undefined) ?? 0;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("notificacoes-badge")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "INSERT", schema: "alissonerp", table: "notificacoes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notificacoes", "contagem"] });
        setDrawerAberto(prev => prev);
        setTimeout(() => abrirDrawer(), 0);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    if (!entries.length) return;
    setOpenGroups(prev => {
      const next = new Set(prev);
      for (const entry of entries) { if (isGroup(entry) && isActiveInGroup(entry, pathname)) next.add(entry.label); }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, authLoading]);

  function toggleGroup(label: string) { setOpenGroups(prev => { const next = new Set(prev); if (next.has(label)) next.delete(label); else next.add(label); return next; }); }

  async function recarregarNotifs() {
    setCarregandoNotifs(true);
    try { const res = await fetch("/api/notificacoes"); if (res.ok) { const data = await res.json(); setNotificacoes(Array.isArray(data) ? data : []); } else setNotificacoes([]); } catch { setNotificacoes([]); } finally { setCarregandoNotifs(false); }
    queryClient.invalidateQueries({ queryKey: ["notificacoes", "contagem"] });
  }

  async function abrirDrawer() { setDrawerAberto(true); await recarregarNotifs(); }

  async function marcarLida(id: string, link: string | null) {
    try {
      await fetch(`/api/notificacoes/${id}/ler`, { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) => prev.map(n => (n.id === id ? { ...n, lida: true } : n)));
      queryClient.setQueryData(["notificacoes", "contagem"], (prev: { nao_lidas: number } | undefined) => ({ nao_lidas: prev ? Math.max(0, prev.nao_lidas - 1) : 0 }));
      if (link) { router.push(link); setDrawerAberto(false); }
    } catch { /* silencioso */ }
  }

  async function marcarTodas() {
    try {
      await fetch("/api/notificacoes/ler-todas", { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) => prev.map(n => ({ ...n, lida: true })));
      queryClient.setQueryData(["notificacoes", "contagem"], { nao_lidas: 0 });
    } catch { /* silencioso */ }
  }

  async function handleLogout() { const supabase = createClient(); await supabase.auth.signOut(); router.push("/login"); router.refresh(); }

  const showText = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
        className={`fixed top-0 left-0 h-full flex flex-col z-50 transition-all duration-300 ease-in-out bg-esmeralda-700 border-r border-esmeralda-800
          ${isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"}
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0`}
        onMouseEnter={() => !isExpanded && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Logo */}
        <Link href="/" className={`block shrink-0 px-5 py-5 border-b border-esmeralda-800 ${!showText ? "lg:flex lg:justify-center" : ""}`}>
          {showText ? (
            <>
              <h1 className="text-lg tracking-[0.2em] font-semibold text-creme-100" style={{ fontFamily: "var(--font-playfair)" }}>ALISSON</h1>
              <p className="text-[9px] tracking-widest uppercase mt-0.5 text-esmeralda-300">Gestão de Fábrica</p>
            </>
          ) : (
            <h1 className="text-lg tracking-[0.2em] font-semibold text-creme-100" style={{ fontFamily: "var(--font-playfair)" }}>A</h1>
          )}
        </Link>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto no-scrollbar">
          {authLoading ? (
            <div className="px-3 py-2 text-[11px] text-esmeralda-400">Carregando...</div>
          ) : (
            <div className="space-y-0.5">
              {serviceExtras.map(item => {
                const active = isActive(item, pathname);
                const Icon = ICON_MAP[item.icon];
                return (
                  <Link key={item.href} href={item.href} onClick={() => setAberta(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? "bg-esmeralda-600 text-creme-100" : "text-esmeralda-300 hover:bg-esmeralda-600/50 hover:text-creme-100"} ${!showText ? "lg:justify-center lg:px-2" : ""}`}>
                    {Icon && <Icon size={18} strokeWidth={active ? 2 : 1.5} />}
                    {showText && <span className="tracking-wide truncate">{item.label}</span>}
                  </Link>
                );
              })}

              {entries.map(entry => {
                if (!isGroup(entry)) {
                  const active = isActive(entry, pathname);
                  const Icon = ICON_MAP[entry.icon];
                  return (
                    <Link key={entry.href} href={entry.href} onClick={() => setAberta(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? "bg-esmeralda-600 text-creme-100" : "text-esmeralda-300 hover:bg-esmeralda-600/50 hover:text-creme-100"} ${!showText ? "lg:justify-center lg:px-2" : ""}`}>
                      {Icon && <Icon size={18} strokeWidth={active ? 2 : 1.5} />}
                      {showText && <span className="tracking-wide truncate">{entry.label}</span>}
                    </Link>
                  );
                }

                const open = openGroups.has(entry.label);
                const hasActive = isActiveInGroup(entry, pathname);
                const GroupIcon = ICON_MAP[entry.icon];

                return (
                  <div key={entry.label}>
                    <button onClick={() => toggleGroup(entry.label)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${hasActive ? "text-esmeralda-100" : "text-esmeralda-400"} ${!showText ? "lg:justify-center lg:px-2" : ""}`}>
                      {GroupIcon && <GroupIcon size={14} strokeWidth={1.75} />}
                      {showText && <><span className="flex-1 text-left">{entry.label}</span>
                        <ChevronDown size={14} strokeWidth={2} className={`transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`} /></>}
                    </button>
                    {open && showText && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-esmeralda-600 pl-3">
                        {entry.items.map(item => {
                          const active = isActive(item, pathname);
                          const ItemIcon = ICON_MAP[item.icon];
                          return (
                            <Link key={item.href} href={item.href} onClick={() => setAberta(false)}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-esmeralda-600 text-creme-100" : "text-esmeralda-300 hover:bg-esmeralda-600/50 hover:text-creme-100"}`}>
                              {ItemIcon && <ItemIcon size={16} strokeWidth={active ? 2 : 1.5} />}
                              <span className="tracking-wide truncate">{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Configurações — grupo expansível integrado */}
              <div>
                <button onClick={() => toggleGroup("Configurações")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${pathname.startsWith("/configuracoes") ? "text-esmeralda-100" : "text-esmeralda-400"} ${!showText ? "lg:justify-center lg:px-2" : ""}`}>
                  <Settings size={14} strokeWidth={1.75} />
                  {showText && <><span className="flex-1 text-left">Configurações</span>
                    <ChevronDown size={14} strokeWidth={2} className={`transition-transform duration-200 ${openGroups.has("Configurações") ? "rotate-0" : "-rotate-90"}`} /></>}
                </button>
                {openGroups.has("Configurações") && showText && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-esmeralda-600 pl-3">
                    {configSubItems.map(item => {
                      const tabParam = new URLSearchParams(item.href.split("?")[1] || "").get("tab");
                      const active = pathname === "/configuracoes" && searchParams.get("tab") === tabParam;
                      const ItemIcon = ICON_MAP[item.icon];
                      return (
                        <Link key={item.href} href={item.href} onClick={() => setAberta(false)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-esmeralda-600 text-creme-100" : "text-esmeralda-300 hover:bg-esmeralda-600/50 hover:text-creme-100"}`}>
                          {ItemIcon && <ItemIcon size={16} strokeWidth={active ? 2 : 1.5} />}
                          <span className="tracking-wide truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>
      </aside>
  );
}
