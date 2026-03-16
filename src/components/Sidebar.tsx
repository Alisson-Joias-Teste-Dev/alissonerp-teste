"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getMenuGroupsForRole, type MenuGroup, type MenuEntry } from "@/lib/auth/permissions";
import { isFullAccess } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/UserAvatar";

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
  const { role, nome, fotoUrl, loading, user } = useAuth();

  const allEntries  = getMenuGroupsForRole(role);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configEntry = allEntries.find(e => !isGroup(e) && (e as any).href === "/configuracoes") as (MenuEntry & { href: string; icon: string }) | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries     = allEntries.filter(e => isGroup(e) || (e as any).href !== "/configuracoes");

  // Grupos abertos: inicia com o grupo que contém a rota ativa
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    return initial;
  });

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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-56 flex flex-col z-40"
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

      {/* Footer — configurações + usuário + logout */}
      <div className="border-t" style={{ borderColor: "#0F2922" }}>
        {configEntry && (() => {
          const Icon = ICON_MAP[configEntry.icon];
          const active = pathname === "/configuracoes" || pathname.startsWith("/configuracoes/");
          return (
            <div className="px-3 py-2">
              <Link
                href="/configuracoes"
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
        <div className="flex items-center gap-2.5 mb-3">
          <UserAvatar
            nome={nome}
            fotoUrl={fotoUrl}
            size={30}
            userId={user?.id}
            clickable={isFullAccess(role)}
          />
          <div className="flex-1 min-w-0">
            {nome && (
              <p className="text-[11px] font-medium truncate" style={{ color: "#F3EADA" }}>
                {nome}
              </p>
            )}
            {role && (
              <p className="text-[9px] uppercase tracking-wider" style={{ color: "#4A7568" }}>
                {role.replace("_", " ")}
              </p>
            )}
          </div>
        </div>
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
  );
}
