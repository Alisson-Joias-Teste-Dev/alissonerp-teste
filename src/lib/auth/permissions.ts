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
  { label: "Rota de Fabricação", href: "/rota-fabricacao",    icon: "Factory"         },
  { label: "Setores",            href: "/setores",            icon: "Layers"          },
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
  { label: "A Pagar",            href: "/financeiro/a-pagar",   icon: "ArrowUpCircle"   },
  { label: "A Receber",          href: "/financeiro/a-receber", icon: "ArrowDownCircle" },
  { label: "Caixa",              href: "/financeiro/caixa",     icon: "Banknote"        },
  { label: "Bancário", href: "/financeiro/bancario", icon: "Landmark" },
  { label: "Conciliação MP",     href: "/financeiro/conciliacao", icon: "ShieldCheck"   },
  { label: "Crediário",         href: "/crediario",              icon: "CreditCard"     },
  { label: "Dashboard Comercial",href: "/dashboard-comercial",icon: "BarChart3"       },
  { label: "Vendas",             href: "/vendas",             icon: "ShoppingBag"     },
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
  desenvolvedor:      ["/dashboard-fabrica", "/dashboard-comercial", "/ordens", "/pcp", "/rota-fabricacao", "/setores", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/rfid/cadastro", "/vendas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/financeiro", "/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/conciliacao", "/crediario", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/configuracoes", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/site", "/editor-ia"],
  admin:              ["/dashboard-fabrica", "/dashboard-comercial", "/ordens", "/pcp", "/rota-fabricacao", "/setores", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/rfid/cadastro", "/vendas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/financeiro", "/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/conciliacao", "/crediario", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/configuracoes", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/site", "/editor-ia"],
  gerente_fabrica:    ["/dashboard-fabrica", "/ordens", "/pcp", "/rota-fabricacao", "/setores", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/auditoria", "/compras", "/insumos", "/rfid/cadastro", "/vendas", "/estoque-comercial", "/financeiro", "/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/conciliacao", "/tarefas", "/relatorios", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/editor-ia"],
  gerente_loja:       ["/dashboard-comercial", "/ordens", "/estoque", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/vendas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/service-painel", "/orcamento", "/gestao-estoque", "/fiscal/emitentes", "/fiscal/regras", "/editor-ia", "/crediario"],
<<<<<<< HEAD
  ourives:            ["/ordens", "/pcp", "/tarefas", "/editor-ia"],
  motoboy:            ["/protocolo", "/tarefas", "/editor-ia"],
  consultora:         ["/dashboard-comercial", "/ordens", "/estoque", "/conferencia", "/orcamento", "/tarefas", "/editor-ia", "/crediario"],
  estoquista_fabrica: ["/estoque", "/quebra", "/compras", "/insumos", "/rfid/cadastro", "/tarefas", "/editor-ia"],
  estoquista_loja:    ["/estoque", "/tarefas", "/editor-ia"],
  pcp:                ["/ordens", "/pcp", "/distribuicao", "/purificacao", "/quebra", "/tarefas", "/editor-ia"],
=======
  ourives:            ["/ordens", "/pcp", "/editor-ia"],
  motoboy:            ["/protocolo", "/editor-ia"],
  consultora:         ["/dashboard-comercial", "/ordens", "/estoque", "/conferencia", "/orcamento", "/editor-ia", "/crediario"],
  estoquista_fabrica: ["/estoque", "/quebra", "/compras", "/insumos", "/rfid/cadastro", "/editor-ia"],
  estoquista_loja:    ["/estoque", "/editor-ia"],
  pcp:                ["/ordens", "/pcp", "/rota-fabricacao", "/setores", "/distribuicao", "/purificacao", "/quebra", "/editor-ia"],
>>>>>>> main
};

// Agrupamento do menu lateral
const MENU_GROUPS: MenuGroup[] = [
  { type: "group", label: "Produção",    icon: "Factory",     items: ["/dashboard-fabrica", "/ordens", "/pcp", "/rota-fabricacao", "/setores", "/distribuicao", "/purificacao", "/service-painel"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Suprimentos", icon: "Package",     items: ["/estoque", "/quebra", "/insumos", "/compras", "/rfid/cadastro"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Logística",   icon: "Truck",       items: ["/protocolo", "/conferencia", "/entrega"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Qualidade",   icon: "ShieldCheck", items: ["/auditoria"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Gestão",     icon: "ListTodo",    items: ["/tarefas", "/relatorios", "/gestao-estoque"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Comercial",   icon: "Briefcase",   items: ["/dashboard-comercial", "/vendas", "/estoque-comercial", "/devolucoes", "/vale-troca", "/produtos", "/orcamento"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Finanças",    icon: "DollarSign",  items: ["/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/conciliacao", "/crediario", "/precificacao"].map(h => ALL_MENUS.find(m => m.href === h)!) },
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
  "/dashboard-comercial": "dashboard_comercial",
  "/ordens":            "ordens",
  "/pcp":               "pcp",
  "/rota-fabricacao":   "pcp",
  "/setores":           "pcp",
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
  "/estoque-comercial":           "estoque_comercial",
  "/devolucoes":                  "devolucoes",
  "/vale-troca":                  "vale_troca",
  "/financeiro":                   "financeiro",
  "/financeiro/a-pagar":           "financeiro",
  "/financeiro/a-receber":         "financeiro",
  "/financeiro/caixa":             "financeiro",
  "/financeiro/bancario":          "financeiro",
  "/financeiro/conciliacao":       "financeiro",
  "/crediario":                    "crediario",
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
