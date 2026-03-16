export type Role =
  | "desenvolvedor"
  | "admin"
  | "gerente_fabrica"
  | "gerente_loja"
  | "ourives"
  | "motoboy"
  | "consultora"
  | "estoquista_fabrica"
  | "estoquista_loja"
  | "pcp";

export interface MenuItem {
  label: string;
  href: string;
  icon: string;
}

export interface MenuGroup {
  type: "group";
  label: string;
  icon: string;
  items: MenuItem[];
}

export type MenuEntry = MenuItem | MenuGroup;

const ALL_MENUS: MenuItem[] = [
  { label: "Dashboard",          href: "/",                   icon: "LayoutDashboard" },
  { label: "Dashboard Fábrica",  href: "/dashboard-fabrica",  icon: "BarChart2"       },
  { label: "Ordens",             href: "/ordens",             icon: "ClipboardList"   },
  { label: "PCP",                href: "/pcp",                icon: "Kanban"          },
  { label: "Distribuição",       href: "/distribuicao",       icon: "Layers"          },
  { label: "Estoque",            href: "/estoque",            icon: "Package"         },
  { label: "Quebra",             href: "/quebra",             icon: "Scale"           },
  { label: "Compras",            href: "/compras",            icon: "ShoppingCart"    },
  { label: "Insumos",            href: "/insumos",            icon: "FlaskConical"    },
  { label: "Protocolo",          href: "/protocolo",          icon: "FileText"        },
  { label: "Conferência",        href: "/conferencia",        icon: "ClipboardCheck"  },
  { label: "Entrega",            href: "/entrega",            icon: "PackageCheck"    },
  { label: "Financeiro",         href: "/financeiro",         icon: "DollarSign"      },
  { label: "Vendas",             href: "/vendas",             icon: "ShoppingBag"     },
  { label: "Produtos",           href: "/produtos",           icon: "Tag"             },
  { label: "Precificação",       href: "/precificacao",       icon: "TrendingUp"      },
  { label: "Auditoria",          href: "/auditoria",          icon: "ClipboardCheck"  },
  { label: "Configurações",      href: "/configuracoes",      icon: "Settings"        },
];

const ROLE_MENUS: Record<Role, string[]> = {
  desenvolvedor:      ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/vendas", "/financeiro", "/produtos", "/precificacao", "/configuracoes"],
  admin:              ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/vendas", "/financeiro", "/produtos", "/precificacao", "/configuracoes"],
  gerente_fabrica:    ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/estoque", "/quebra", "/protocolo", "/auditoria", "/compras", "/insumos", "/vendas", "/financeiro"],
  gerente_loja:       ["/ordens", "/estoque", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/vendas", "/produtos", "/precificacao"],
  ourives:            ["/ordens", "/pcp"],
  motoboy:            ["/protocolo"],
  consultora:         ["/ordens", "/estoque", "/conferencia"],
  estoquista_fabrica: ["/estoque", "/quebra", "/compras", "/insumos"],
  estoquista_loja:    ["/estoque"],
  pcp:                ["/ordens", "/pcp", "/distribuicao", "/quebra"],
};

// Agrupamento do menu lateral
const MENU_GROUPS: MenuGroup[] = [
  { type: "group", label: "Produção",    icon: "Factory",     items: ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Suprimentos", icon: "Package",     items: ["/estoque", "/quebra", "/insumos", "/compras"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Logística",   icon: "Truck",       items: ["/protocolo", "/conferencia", "/entrega"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Qualidade",   icon: "ShieldCheck", items: ["/auditoria"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Comercial",   icon: "Briefcase",   items: ["/vendas", "/financeiro", "/produtos", "/precificacao"].map(h => ALL_MENUS.find(m => m.href === h)!) },
];

export function getMenusForRole(role: Role | null | undefined): MenuItem[] {
  if (!role) return [];
  const allowed = ROLE_MENUS[role] ?? [];
  return ALL_MENUS.filter((m) => allowed.includes(m.href));
}

export function getMenuGroupsForRole(role: Role | null | undefined): MenuEntry[] {
  if (!role) return [];
  const allowed = new Set(ROLE_MENUS[role] ?? []);
  const result: MenuEntry[] = [];

  // Grupos filtrados (sempre como grupo, mesmo com 1 item)
  for (const group of MENU_GROUPS) {
    const visibleItems = group.items.filter(item => item && allowed.has(item.href));
    if (visibleItems.length === 0) continue;
    result.push({ ...group, items: visibleItems });
  }

  // Configurações standalone ao final
  if (allowed.has("/configuracoes")) result.push(ALL_MENUS.find(m => m.href === "/configuracoes")!);

  return result;
}

// Mapa href → nome do módulo em role_permissoes
const HREF_TO_MODULO: Record<string, string> = {
  "/dashboard-fabrica": "dashboard_fabrica",
  "/ordens":            "ordens",
  "/pcp":               "pcp",
  "/distribuicao":      "distribuicao",
  "/estoque":           "estoque",
  "/quebra":            "quebra",
  "/insumos":           "insumos",
  "/compras":           "compras",
  "/protocolo":         "protocolo",
  "/conferencia":       "conferencia",
  "/entrega":           "entrega",
  "/auditoria":         "auditoria",
  "/vendas":            "vendas",
  "/financeiro":        "financeiro",
  "/produtos":          "produtos",
  "/precificacao":      "precificacao",
  "/configuracoes":     "configuracoes",
};

// Constrói o menu lateral a partir da lista de módulos do banco (role_permissoes)
export function getMenuGroupsForModulos(modulos: string[]): MenuEntry[] {
  const allowed = new Set(modulos);
  const result: MenuEntry[] = [];

  for (const group of MENU_GROUPS) {
    const visibleItems = group.items.filter(item => {
      if (!item) return false;
      const modulo = HREF_TO_MODULO[item.href];
      return modulo ? allowed.has(modulo) : false;
    });
    if (visibleItems.length === 0) continue;
    result.push({ ...group, items: visibleItems });
  }

  if (allowed.has("configuracoes")) {
    result.push(ALL_MENUS.find(m => m.href === "/configuracoes")!);
  }

  return result;
}

export function canAccess(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  if (role === "admin" || role === "desenvolvedor") return true;
  const allowed = ROLE_MENUS[role] ?? [];
  return allowed.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
