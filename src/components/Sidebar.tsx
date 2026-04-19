"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
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
  Tag,
  BarChart2,
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
} from "lucide-react";
import { NotificacoesDrawer } from "./NotificacoesDrawer";
import PerfilDrawer from "./PerfilDrawer";
import { useAuth } from "@/hooks/useAuth";
import { getMenuGroupsForRole, getMenuGroupsForModulos, type MenuGroup, type MenuEntry, type MenuItem } from "@/lib/auth/permissions";
import { ROLES_SERVICE_PANEL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
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
  Tag,
  BarChart2,
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
  const router = useRouter();
  const { role, nome, fotoUrl, loading, user, modulos_leitura, isOperadorService } = useAuth();
  const { aberta, setAberta } = useSidebar();

  // Injetar módulos que a role permite mas ainda não estão no banco (role_permissoes)
  const hasServicePanel = role && ROLES_SERVICE_PANEL.includes(role as typeof ROLES_SERVICE_PANEL[number]);
  const ROLES_ORCAMENTO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];
  const ROLES_FISCAL_SIDEBAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const hasOrcamento = role && ROLES_ORCAMENTO.includes(role);
  const hasFiscal = role && ROLES_FISCAL_SIDEBAR.includes(role);
  let modulosEfetivos = [...modulos_leitura];
  if (modulosEfetivos.length > 0) {
    if (hasServicePanel && !modulosEfetivos.includes("service_painel")) modulosEfetivos.push("service_painel");
    if (hasOrcamento && !modulosEfetivos.includes("orcamento")) modulosEfetivos.push("orcamento");
    if (hasFiscal && !modulosEfetivos.includes("fiscal")) modulosEfetivos.push("fiscal");
  }

  // Usar permissões do banco quando disponíveis; fallback para hardcode (permissions.ts)
  const allEntries = modulosEfetivos.length > 0
    ? getMenuGroupsForModulos(modulosEfetivos)
    : getMenuGroupsForRole(role);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configEntry = allEntries.find(e => !isGroup(e) && (e as any).href === "/configuracoes") as (MenuEntry & { href: string; icon: string }) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries     = allEntries.filter(e => isGroup(e) || (e as any).href !== "/configuracoes");

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
  const [naoLidas, setNaoLidas] = useState(0);
  const [drawerAberto, setDrawerAberto] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [carregandoNotifs, setCarregandoNotifs] = useState(false);

  // Busca contagem de notificações não lidas
  const fetchContagem = useCallback(async () => {
    try {
      const res = await fetch("/api/notificacoes/contagem");
      if (!res.ok) return;
      const data = await res.json();
      setNaoLidas(data.nao_lidas || 0);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    fetchContagem();
  }, [fetchContagem]);

  useEffect(() => {
    const interval = setInterval(fetchContagem, 60000);
    return () => clearInterval(interval);
  }, [fetchContagem]);

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

  async function abrirDrawer() {
    setDrawerAberto(true);
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
  }

  async function marcarLida(id: string, link: string | null) {
    try {
      await fetch(`/api/notificacoes/${id}/ler`, { method: "PATCH" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotificacoes((prev: any[]) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
      setNaoLidas((prev) => Math.max(0, prev - 1));
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
      setNaoLidas(0);
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
            {/* Itens Service (flag isOperadorService) e Painel Service (role) */}
            {serviceExtras.map((item) => {
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

      {/* Footer — configurações + usuário + logout */}
      <div className="border-t" style={{ borderColor: "#0F2922" }}>
        {configEntry && (() => {
          const Icon = ICON_MAP[configEntry.icon];
          const active = pathname === "/configuracoes" || pathname.startsWith("/configuracoes/");
          return (
            <div className="px-3 py-2">
              <Link
                href="/configuracoes"
                onClick={() => setAberta(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: active ? "#0F2922" : "transparent",
                  color: active ? "#F3EADA" : "#80A795",
                }}
              >
                {Icon && <Icon size={15} strokeWidth={1.75} />}
                <span className="tracking-wide">{configEntry.label}</span>
              </Link>
            </div>
          );
        })()}
      </div>
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
    />
    {perfilAberto && <PerfilDrawer onClose={() => setPerfilAberto(false)} />}
    </>
  );
}
