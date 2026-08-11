"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Kanban,
  Layers,
  Package,
  Scale,
  FileText,
  ShoppingCart,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Settings,
  LogOut,
  FlaskConical,
  Factory,
  Truck,
  ShieldCheck,
  Briefcase,
  ChevronDown,
  Route,
  Tag,
  BarChart2,
  BarChart3,
  Bell,
  Flame,
  Smartphone,
  Wrench,
  ListTodo,
  PackageCheck,
  Store,
  FileBarChart,
  FileSpreadsheet,
  Percent,
  Target,
  RotateCcw,
  Ticket,
  Receipt,
  Building2,
  FileCheck2,
  Globe,
  Sparkles,
  ArrowUpCircle,
  ArrowDownCircle,
  Banknote,
  Landmark,
  CreditCard,
  Webhook,
  GraduationCap,
  HelpCircle,
} from "lucide-react";
import { NotificacoesDrawer } from "./NotificacoesDrawer";
import PerfilDrawer from "./PerfilDrawer";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { getMenuGroupsForRole, getMenuGroupsForModulos, type MenuGroup, type MenuEntry, type MenuItem } from "@/lib/auth/permissions";
import { ROLES_SERVICE_PANEL, ROLES_METAL, ROLES_DEVOLUCAO_ABRIR, hasRole } from "@/lib/roles";
import UserAvatar from "@/components/UserAvatar";
import { useSidebar } from "@/contexts/SidebarContext";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Kanban,
  Layers,
  Package,
  Scale,
  FileText,
  ShoppingCart,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Settings,
  FlaskConical,
  Factory,
  Truck,
  ShieldCheck,
  Briefcase,
  Route,
  Tag,
  BarChart2,
  BarChart3,
  Flame,
  Smartphone,
  Wrench,
  ListTodo,
  PackageCheck,
  Store,
  FileBarChart,
  FileSpreadsheet,
  Percent,
  Target,
  RotateCcw,
  Ticket,
  Receipt,
  Building2,
  FileCheck2,
  Globe,
  Sparkles,
  ArrowUpCircle,
  ArrowDownCircle,
  Banknote,
  Landmark,
  CreditCard,
  Webhook,
  GraduationCap,
  HelpCircle,
};

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return (entry as MenuGroup).type === "group";
}

function isActiveInGroup(group: MenuGroup, pathname: string) {
  return group.items.some(
    (item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, nome, fotoUrl, loading, user, modulos_leitura, isOperadorService, isVendedora } = useAuth();
  const { aberta, setAberta } = useSidebar();

  // Injetar módulos que a role permite mas ainda não estão no banco (role_permissoes)
  const hasServicePanel = role && ROLES_SERVICE_PANEL.includes(role as typeof ROLES_SERVICE_PANEL[number]);
  const ROLES_ORCAMENTO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];
  const ROLES_FISCAL_SIDEBAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const ROLES_GESTAO_ESTOQUE = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const ROLES_SITE = ["desenvolvedor", "admin", "gerente_loja"];
  const ROLES_CREDIARIO_SIDEBAR = ["desenvolvedor", "admin", "gerente_loja", "consultora"];
  // BLOCO 5 (jul/2026) — `estoquista_loja` entrou aqui pra fechar o menu junto
  // com o gate da página (`entregas-venda/page.tsx` ROLES_PERMITIDOS) e da API
  // (`api/entregas-venda/route.ts` ROLES_ENTREGAS). Pedido do Jonathan: "toda
  // entrega chegue pro estoque acompanhar". Isto só injeta o módulo no client
  // quando `modulos_leitura` do banco já tem ALGO pra esse papel (ver
  // `modulosEfetivos.length > 0` abaixo) — se `role_permissoes` não tiver
  // NENHUMA linha `entregas_venda`/estoquista_loja, quem decide é o fallback
  // hardcoded (`ROLE_MENUS.estoquista_loja` em src/lib/auth/permissions.ts,
  // também atualizado). Ver docs/regras-negocio/entregas.md §3.5.
  const ROLES_ENTREGAS_VENDA = ["desenvolvedor", "admin", "gerente_loja", "gerente_fabrica", "estoquista_loja"];
  // REGRA DE NEGÓCIO: Movimentação Interna (retirada/devolução de peça entre
  // estoquista e consultora) é aberta pra quem de fato lida com isso na loja —
  // sem checagem de role própria na API, só visibilidade de menu aqui.
  const ROLES_MOVIMENTACAO_INTERNA = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora", "estoquista_loja"];
  // REGRA DE NEGÓCIO: Acesso ao módulo Metal no menu lateral agora usa a
  // constante centralizada ROLES_METAL de @/lib/roles (fonte única da verdade).
  // Inclui estoquista_fabrica, que já tinha acesso à API mas não via o menu.
  const hasMetal = role ? ROLES_METAL.includes(role) : false;
  const hasOrcamento = role && ROLES_ORCAMENTO.includes(role);
  const hasFiscal = role && ROLES_FISCAL_SIDEBAR.includes(role);
  const hasGestaoEstoque = role && ROLES_GESTAO_ESTOQUE.includes(role);
  const hasSite = role && ROLES_SITE.includes(role);
  const hasCrediario = role && ROLES_CREDIARIO_SIDEBAR.includes(role);
  const hasEntregasVenda = role && ROLES_ENTREGAS_VENDA.includes(role);
  const hasMovimentacaoInterna = role && ROLES_MOVIMENTACAO_INTERNA.includes(role);
  // REGRA DE NEGÓCIO: consultora abre devolução da PRÓPRIA venda (ROLES_DEVOLUCAO_ABRIR).
  // O QUE: injeta o módulo `devolucoes` no menu da consultora (padrão do Metal),
  //   já que /devolucoes não é gateado pelo proxy nem consta em role_permissoes.
  // POR QUE: sem isso o menu Devoluções sumiria pra consultora apesar da API já liberar.
  // IMPACTO SE REMOVIDO: consultora não acha o menu Devoluções.
  // OBS: NÃO injeta vale_troca — consultora abre devolução mas não mexe em vale-troca.
  const hasDevolucao = hasRole(role, ROLES_DEVOLUCAO_ABRIR);
  const modulosEfetivos = [...modulos_leitura];
  if (modulosEfetivos.length > 0) {
    if (hasServicePanel && !modulosEfetivos.includes("service_painel")) modulosEfetivos.push("service_painel");
    if (hasOrcamento && !modulosEfetivos.includes("orcamento")) modulosEfetivos.push("orcamento");
    if (hasFiscal && !modulosEfetivos.includes("fiscal")) modulosEfetivos.push("fiscal");
    if (hasGestaoEstoque && !modulosEfetivos.includes("gestao_estoque")) modulosEfetivos.push("gestao_estoque");
    if (hasSite && !modulosEfetivos.includes("site")) modulosEfetivos.push("site");
    if (hasCrediario && !modulosEfetivos.includes("crediario")) modulosEfetivos.push("crediario");
    /**
     * REGRA DE NEGÓCIO: consultoras (vendedoras) devem sempre enxergar o módulo
     * de Metal no menu, mesmo quando role_permissoes ainda não refletiu a regra.
     *
     * O QUE: injeta módulo `metal` na malha efetiva do sidebar por role elegível.
     * POR QUE: evita sumiço do menu para quem já tem permissão operacional na API.
     * IMPACTO SE REMOVIDO: front pode ocultar Metal para consultora apesar de
     * backend já aceitar o acesso.
     */
    if (hasMetal && !modulosEfetivos.includes("metal")) modulosEfetivos.push("metal");
    if (hasEntregasVenda && !modulosEfetivos.includes("entregas_venda")) modulosEfetivos.push("entregas_venda");
    if (hasMovimentacaoInterna && !modulosEfetivos.includes("movimentacao_interna")) modulosEfetivos.push("movimentacao_interna");
    if (hasDevolucao && !modulosEfetivos.includes("devolucoes")) modulosEfetivos.push("devolucoes");
  }

  // Usar permissões do banco quando disponíveis; fallback para hardcode (permissions.ts)
  // Configurações — atalho direto pra cada aba (evita abrir a tela e caçar
  // a aba certa). Gate de permissão continua em `configEntry`, mais abaixo.
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

  const allEntries = modulosEfetivos.length > 0
    ? getMenuGroupsForModulos(modulosEfetivos)
    : getMenuGroupsForRole(role);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configEntry = allEntries.find(e => !isGroup(e) && (e as any).href === "/configuracoes") as (MenuEntry & { href: string; icon: string }) | undefined;
  // Grupo Ajuda › Treinamentos — sempre visível pra qualquer usuário logado
  // (a rota /treinamentos não é gateada por módulo no proxy).
  const AJUDA_GROUP: MenuGroup = {
    type: "group", label: "Ajuda", icon: "HelpCircle",
    items: [{ label: "Treinamentos", href: "/treinamentos", icon: "GraduationCap" }],
  };
  /**
   * "Minha comissão" — item solto, para QUALQUER usuário ligado a uma vendedora
   * ativa (03/08/2026).
   *
   * O QUÊ: atalho para /minha-comissao, o extrato que a própria vendedora
   * acompanha.
   * POR QUE fora do módulo Financeiro: a consultora não tem (nem deve ter)
   * acesso a ele — lá estão contas a pagar, caixa e a comissão das colegas.
   * POR QUE por `isVendedora` e não por papel: a Germana é `gerente_loja` e É
   * vendedora; a Geovana é `gerente_loja` e NÃO é. Filtrar por papel colocaria
   * no menu da Geovana um atalho que só a devolveria pra home.
   * IMPACTO SE REMOVIDO: a vendedora fica sem porta de entrada — a página
   * existe, mas ninguém acha (foi o que aconteceu ao subir a tela sem o menu).
   */
  const comissaoExtras: MenuItem[] = isVendedora
    ? [{ label: "Minha comissão", href: "/minha-comissao", icon: "Banknote" }]
    : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries     = [...allEntries.filter(e => isGroup(e) || (e as any).href !== "/configuracoes"), AJUDA_GROUP];

  // Item extra: Service (flag isOperadorService) — Painel Service é tratado pelo grupo Produção
  const serviceExtras: MenuItem[] = [];
  if (isOperadorService) {
    serviceExtras.push({ label: "Service", href: "/service", icon: "Smartphone" });
  }

  // Grupos abertos: inicia com o grupo que contém a rota ativa
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    return initial;
  });

  // Perfil
  const [perfilAberto, setPerfilAberto] = useState(false);

  // Notificações
  const [drawerAberto, setDrawerAberto] = useState(false);
  // Espelha o estado do drawer para uso dentro do listener realtime (evita
  // re-subscrever o canal a cada abrir/fechar).
  const drawerAbertoRef = useRef(false);
  useEffect(() => { drawerAbertoRef.current = drawerAberto; }, [drawerAberto]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [carregandoNotifs, setCarregandoNotifs] = useState(false);

  // Busca contagem de notificações não lidas (com React Query)
  const queryClient = useQueryClient();
  const { data: contagem } = useQuery({
    queryKey: ["notificacoes", "contagem"],
    queryFn: async () => {
      const res = await fetch("/api/notificacoes/contagem");
      if (!res.ok) return { nao_lidas: 0 };
      return res.json() as Promise<{ nao_lidas: number }>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const naoLidas = (contagem?.nao_lidas as number | undefined) ?? 0;

  // Realtime: atualiza badge imediatamente ao receber nova notificação
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notificacoes-badge")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "alissonerp",
        table: "notificacoes",
      }, () => {
        // Atualiza só o badge (contador). NÃO abre o drawer sozinho.
        queryClient.invalidateQueries({ queryKey: ["notificacoes", "contagem"] });
        // Se o drawer já estiver aberto, recarrega a lista sem reabrir.
        if (drawerAbertoRef.current) recarregarNotifs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Abre automaticamente o grupo da rota ativa ao carregar
  useEffect(() => {
    if (!entries.length) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const entry of entries) {
        if (isGroup(entry) && isActiveInGroup(entry, pathname)) {
          next.add(entry.label);
        }
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loading]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function recarregarNotifs() {
    setCarregandoNotifs(true);
    try {
      const res = await fetch("/api/notificacoes");
      if (res.ok) {
        const data = await res.json();
        setNotificacoes(Array.isArray(data) ? data : []);
      } else {
        setNotificacoes([]);
      }
    } catch {
      setNotificacoes([]);
    } finally {
      setCarregandoNotifs(false);
    }
    queryClient.invalidateQueries({ queryKey: ["notificacoes", "contagem"] });
  }

  async function abrirDrawer() {
    setDrawerAberto(true);
    await recarregarNotifs();
  }

  async function marcarLida(id: string, link: string | null) {
    try {
      await fetch(`/api/notificacoes/${id}/ler`, { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
      queryClient.setQueryData(["notificacoes", "contagem"], (prev: { nao_lidas: number } | undefined) => ({
        nao_lidas: prev ? Math.max(0, prev.nao_lidas - 1) : 0,
      }));
      if (link) {
        router.push(link);
        setDrawerAberto(false);
      }
    } catch {
      // silencioso
    }
  }

  async function marcarTodas() {
    try {
      await fetch("/api/notificacoes/ler-todas", { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) => prev.map((n) => ({ ...n, lida: true })));
      queryClient.setQueryData(["notificacoes", "contagem"], { nao_lidas: 0 });
    } catch {
      // silencioso
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
    <aside
      className={`fixed top-0 left-0 h-full flex flex-col z-50 transition-transform duration-300 ease-in-out md:translate-x-0 md:w-56 w-64 ${aberta ? 'translate-x-0' : '-translate-x-full'}`}
      style={{ backgroundColor: "#184036", borderRight: "1px solid #0F2922" }}
    >
      {/* Logo */}
      <Link href="/" className="block px-6 py-5 border-b" style={{ borderColor: "#0F2922" }}>
        <h1
          className="text-lg tracking-[0.2em] font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: "#F3EADA" }}
        >
          ALISSON
        </h1>
        <p className="text-[9px] tracking-widest uppercase mt-0.5" style={{ color: "#80A795" }}>
          Gestao de Fabrica
        </p>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          <div className="px-3 py-2 text-[11px]" style={{ color: "#4A7568" }}>
            Carregando...
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Itens soltos: Service (flag) e Minha comissão (vendedora vinculada) */}
            {[...serviceExtras, ...comissaoExtras].map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = ICON_MAP[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setAberta(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: active ? "#0F2922" : "transparent",
                    color: active ? "#F3EADA" : "#80A795",
                  }}
                >
                  {Icon && <Icon size={15} strokeWidth={1.75} />}
                  <span className="tracking-wide">{item.label}</span>
                </Link>
              );
            })}
            {entries.map((entry) => {
              if (!isGroup(entry)) {
                // Item standalone (ex: Dashboard)
                const active =
                  pathname === entry.href ||
                  (entry.href !== "/" && pathname.startsWith(entry.href));
                const Icon = ICON_MAP[entry.icon];
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={() => setAberta(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={{
                      backgroundColor: active ? "#0F2922" : "transparent",
                      color: active ? "#F3EADA" : "#80A795",
                    }}
                  >
                    {Icon && <Icon size={15} strokeWidth={1.75} />}
                    <span className="tracking-wide">{entry.label}</span>
                  </Link>
                );
              }

              // Grupo colapsável
              const open = openGroups.has(entry.label);
              const hasActive = isActiveInGroup(entry, pathname);
              const GroupIcon = ICON_MAP[entry.icon];

              return (
                <div key={entry.label} className="mt-1">
                  <button
                    onClick={() => toggleGroup(entry.label)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors"
                    style={{
                      color: hasActive ? "#A8C5B8" : "#4A7568",
                      backgroundColor: "transparent",
                    }}
                  >
                    {GroupIcon && <GroupIcon size={13} strokeWidth={1.75} />}
                    <span className="flex-1 text-left">{entry.label}</span>
                    <ChevronDown
                      size={12}
                      strokeWidth={2}
                      style={{
                        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.15s",
                      }}
                    />
                  </button>

                  {open && (
                    <div className="ml-2 mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: "#0F2922" }}>
                      {entry.items.map((item) => {
                        const active =
                          pathname === item.href ||
                          (item.href !== "/" && pathname.startsWith(item.href));
                        const ItemIcon = ICON_MAP[item.icon];
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setAberta(false)}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
                            style={{
                              backgroundColor: active ? "#0F2922" : "transparent",
                              color: active ? "#F3EADA" : "#80A795",
                            }}
                          >
                            {ItemIcon && <ItemIcon size={14} strokeWidth={1.75} />}
                            <span className="tracking-wide">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Sino de notificações */}
      <div className="px-3 pb-2">
        <button
          onClick={abrirDrawer}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors"
          style={{ color: "#80A795" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(15,41,34,0.4)";
            (e.currentTarget as HTMLButtonElement).style.color = "#F3EADA";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#80A795";
          }}
        >
          <div className="flex items-center gap-3">
            <Bell size={15} strokeWidth={1.75} />
            <span className="text-sm tracking-wide">Notificações</span>
          </div>
          {naoLidas > 0 && (
            <span
              className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
              style={{ backgroundColor: "#ef4444", color: "#fff" }}
            >
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )}
        </button>
      </div>

      {/* Footer — configurações + usuário + logout
          A condição está no PRÓPRIO div: antes ele existia sempre e só o
          conteúdo era condicional, então quem não tem Configurações (consultora,
          gerente_loja) via um bloco VAZIO com `border-t` — um risco solto colado
          na borda do rodapé do usuário.
          Grupo expansível com atalho direto pra cada aba (configSubItems) —
          mesmo gate de permissão (`configEntry`) de antes, só a apresentação
          mudou de link único pra submenu. */}
      {configEntry && (
      <div className="border-t px-3 py-2" style={{ borderColor: "#0F2922" }}>
        <button
          onClick={() => toggleGroup("Configurações")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{
            color: pathname.startsWith("/configuracoes") ? "#F3EADA" : "#80A795",
          }}
        >
          {(() => { const Icon = ICON_MAP[configEntry.icon]; return Icon ? <Icon size={15} strokeWidth={1.75} /> : null; })()}
          <span className="flex-1 text-left tracking-wide">{configEntry.label}</span>
          <ChevronDown size={14} strokeWidth={2} className={`transition-transform duration-200 ${openGroups.has("Configurações") ? "rotate-0" : "-rotate-90"}`} />
        </button>
        {openGroups.has("Configurações") && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-3" style={{ borderColor: "#0F2922" }}>
            {configSubItems.map(item => {
              const tabParam = new URLSearchParams(item.href.split("?")[1] || "").get("tab");
              const active = pathname === "/configuracoes" && searchParams.get("tab") === tabParam;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setAberta(false)}
                  className="flex items-center px-3 py-2 rounded-lg text-sm transition-colors truncate"
                  style={{
                    backgroundColor: active ? "#0F2922" : "transparent",
                    color: active ? "#F3EADA" : "#80A795",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      )}
      <div className="px-4 py-4 border-t" style={{ borderColor: "#0F2922" }}>
        <button
          onClick={() => setPerfilAberto(true)}
          className="flex items-center gap-2.5 mb-3 w-full rounded-lg px-1 py-1 transition-colors hover:bg-white/5 text-left"
          title="Editar perfil"
        >
          <UserAvatar
            nome={nome}
            fotoUrl={fotoUrl}
            size={30}
            userId={user?.id}
            clickable={false}
          />
          <div className="flex-1 min-w-0">
            {nome && (
              <p className="text-[11px] font-medium truncate" style={{ color: "#F3EADA" }}>
                {nome}
              </p>
            )}
            {role && (
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "#4A7568" }}>
                {role.replace(/_/g, " ")}
              </p>
            )}
          </div>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-[11px] transition-colors hover:opacity-80"
          style={{ color: "#80A795" }}
        >
          <LogOut size={13} strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </aside>

    {/* Overlay mobile — fecha a sidebar ao clicar fora */}
    {aberta && (
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setAberta(false)}
      />
    )}

    <NotificacoesDrawer
      aberto={drawerAberto}
      onFechar={() => setDrawerAberto(false)}
      notificacoes={notificacoes}
      onMarcarLida={marcarLida}
      onMarcarTodas={marcarTodas}
      carregando={carregandoNotifs}
      onRecarregar={recarregarNotifs}
    />
    {perfilAberto && <PerfilDrawer onClose={() => setPerfilAberto(false)} />}
    </>
  );
}
