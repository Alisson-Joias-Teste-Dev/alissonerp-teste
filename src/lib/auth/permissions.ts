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
  { label: "Purificação",        href: "/purificacao",        icon: "Flame"           },
  { label: "Estoque",            href: "/estoque",            icon: "Package"         },
  { label: "Quebra",             href: "/quebra",             icon: "Scale"           },
  { label: "Compras",            href: "/compras",            icon: "ShoppingCart"    },
  { label: "Insumos",            href: "/insumos",            icon: "FlaskConical"    },
  { label: "Cadastrar Tag RFID", href: "/rfid/cadastro",      icon: "Tag"             },
  { label: "Protocolo",          href: "/protocolo",          icon: "FileText"        },
  { label: "Conferência",        href: "/conferencia",        icon: "ClipboardCheck"  },
  { label: "Entrega",            href: "/entrega",            icon: "PackageCheck"    },
  { label: "Financeiro",         href: "/financeiro",         icon: "DollarSign"      },
  { label: "Vendas",             href: "/vendas",             icon: "ShoppingBag"     },
  { label: "Análise Resultado", href: "/vendas/analise-resultado", icon: "BarChart2"    },
  { label: "Análise Frete",     href: "/vendas/analise-frete",     icon: "Truck"        },
  { label: "Análise Comissões", href: "/vendas/analise-comissoes", icon: "Percent"      },
  { label: "Metas",             href: "/vendas/metas",             icon: "Target"       },
  { label: "Est. Comercial",     href: "/estoque-comercial",  icon: "Store"           },
  { label: "Devoluções",         href: "/devolucoes",         icon: "RotateCcw"       },
  { label: "Vales-Troca",        href: "/vale-troca",         icon: "Ticket"          },
  { label: "Produtos",           href: "/produtos",           icon: "Tag"             },
  { label: "Precificação",       href: "/precificacao",       icon: "TrendingUp"      },
  { label: "Auditoria",          href: "/auditoria",          icon: "ClipboardCheck"  },
  { label: "Tarefas",            href: "/tarefas",            icon: "ListTodo"        },
  { label: "Relatórios",         href: "/relatorios",         icon: "FileBarChart"    },
  { label: "Configurações",      href: "/configuracoes",      icon: "Settings"        },
  { label: "Service",            href: "/service",            icon: "Smartphone"      },
  { label: "Painel Service",     href: "/service-painel",     icon: "Wrench"          },
  { label: "Orcamento",          href: "/orcamento",          icon: "FileSpreadsheet" },
  { label: "Gestão de Estoque",  href: "/gestao-estoque",     icon: "Layers"          },
  { label: "Emitentes",          href: "/fiscal/emitentes",   icon: "Building2"       },
  { label: "Regras Fiscais",     href: "/fiscal/regras",      icon: "FileCheck2"      },
  { label: "Site",               href: "/site",               icon: "Globe"           },
  { label: "Editor IA",          href: "/editor-ia",          icon: "Sparkles"        },
];

const ROLE_MENUS: Record<Role, string[]> = {
  desenvolvedor:      ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/rfid/cadastro", "/vendas", "/vendas/analise-resultado", "/vendas/analise-frete", "/vendas/analise-comissoes", "/vendas/metas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/financeiro", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/configuracoes", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/site", "/editor-ia"],
  admin:              ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/rfid/cadastro", "/vendas", "/vendas/analise-resultado", "/vendas/analise-frete", "/vendas/analise-comissoes", "/vendas/metas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/financeiro", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/configuracoes", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/site", "/editor-ia"],
  gerente_fabrica:    ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/auditoria", "/compras", "/insumos", "/rfid/cadastro", "/vendas", "/vendas/analise-resultado", "/vendas/analise-frete", "/vendas/analise-comissoes", "/vendas/metas", "/estoque-comercial", "/financeiro", "/tarefas", "/relatorios", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/editor-ia"],
  gerente_loja:       ["/ordens", "/estoque", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/vendas", "/vendas/analise-resultado", "/vendas/analise-frete", "/vendas/analise-comissoes", "/vendas/metas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/editor-ia"],
  ourives:            ["/ordens", "/pcp", "/editor-ia"],
  motoboy:            ["/protocolo", "/editor-ia"],
  consultora:         ["/ordens", "/estoque", "/conferencia", "/orcamento", "/editor-ia"],
  estoquista_fabrica: ["/estoque", "/quebra", "/compras", "/insumos", "/rfid/cadastro", "/editor-ia"],
  estoquista_loja:    ["/estoque", "/editor-ia"],
  pcp:                ["/ordens", "/pcp", "/distribuicao", "/purificacao", "/quebra", "/editor-ia"],
};

// Agrupamento do menu lateral
const MENU_GROUPS: MenuGroup[] = [
  { type: "group", label: "Produção",    icon: "Factory",     items: ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/purificacao", "/service-painel"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Suprimentos", icon: "Package",     items: ["/estoque", "/quebra", "/insumos", "/compras", "/rfid/cadastro"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Logística",   icon: "Truck",       items: ["/protocolo", "/conferencia", "/entrega"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Qualidade",   icon: "ShieldCheck", items: ["/auditoria"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Gestão",     icon: "ListTodo",    items: ["/tarefas", "/relatorios", "/gestao-estoque"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Comercial",   icon: "Briefcase",   items: ["/vendas", "/vendas/analise-resultado", "/vendas/analise-frete", "/vendas/analise-comissoes", "/vendas/metas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/financeiro", "/produtos", "/precificacao", "/orcamento"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Fiscal",      icon: "Receipt",     items: ["/fiscal/emitentes", "/fiscal/regras"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "E-Commerce",  icon: "Globe",       items: ["/site"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Criativo",    icon: "Sparkles",    items: ["/editor-ia"].map(h => ALL_MENUS.find(m => m.href === h)!) },
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
  "/purificacao":       "purificacao",
  "/estoque":           "estoque",
  "/quebra":            "quebra",
  "/insumos":           "insumos",
  "/compras":           "compras",
  "/rfid/cadastro":     "rfid_cadastro",
  "/protocolo":         "protocolo",
  "/conferencia":       "conferencia",
  "/entrega":           "entrega",
  "/auditoria":         "auditoria",
  "/vendas":                      "vendas",
  "/vendas/analise-resultado":    "vendas",
  "/vendas/analise-frete":        "vendas",
  "/vendas/analise-comissoes":    "vendas",
  "/vendas/metas":                "vendas",
  "/estoque-comercial":           "estoque_comercial",
  "/devolucoes":                  "devolucoes",
  "/vale-troca":                  "vale_troca",
  "/financeiro":         "financeiro",
  "/produtos":          "produtos",
  "/precificacao":      "precificacao",
  "/configuracoes":     "configuracoes",
  "/tarefas":           "tarefas",
  "/relatorios":        "relatorios",
  "/service":           "service",
  "/service-painel":    "service_painel",
  "/orcamento":         "orcamento",
  "/gestao-estoque":    "gestao_estoque",
  "/fiscal/emitentes":  "fiscal",
  "/fiscal/regras":     "fiscal",
  "/site":              "site",
  "/editor-ia":         "editor_ia",
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
