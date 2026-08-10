export type Role =
  | "desenvolvedor"
  | "admin"
  | "gerente_fabrica"
  | "gerente_loja"
  | "ourives"
  | "motoboy"
  | "entregador"
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
  { label: "PCP",                href: "/pcp",                icon: "Factory"         },
  { label: "Rotas Padrão",       href: "/rotas-padrao",       icon: "Route"           },
  { label: "Setores",            href: "/setores",            icon: "Layers"          },
  { label: "Distribuição",       href: "/distribuicao",       icon: "Layers"          },
  { label: "Purificação",        href: "/purificacao",        icon: "Flame"           },
  { label: "Estoque",            href: "/estoque",            icon: "Package"         },
  { label: "Quebra",             href: "/quebra",             icon: "Scale"           },
  { label: "Compras",            href: "/compras",            icon: "ShoppingCart"    },
  { label: "Compras Comercial",  href: "/compras-comercial",  icon: "Store"           },
  { label: "Insumos",            href: "/insumos",            icon: "FlaskConical"    },
  { label: "Cadastrar Tag RFID", href: "/rfid/cadastro",      icon: "Tag"             },
  { label: "Protocolo",          href: "/protocolo",          icon: "FileText"        },
  { label: "Conferência",        href: "/conferencia",        icon: "ClipboardCheck"  },
  { label: "Entrega",            href: "/entrega",            icon: "PackageCheck"    },
  { label: "Entregas",           href: "/entregas-venda",    icon: "Truck"           },
  { label: "Financeiro",         href: "/financeiro",         icon: "DollarSign"      },
  { label: "A Pagar",            href: "/financeiro/a-pagar",   icon: "ArrowUpCircle"   },
  { label: "A Receber",          href: "/financeiro/a-receber", icon: "ArrowDownCircle" },
  { label: "Caixa",              href: "/financeiro/caixa",     icon: "Banknote"        },
  { label: "Comissões",          href: "/financeiro/comissoes", icon: "DollarSign"     },
  { label: "Conciliação MP",     href: "/financeiro/conciliacao", icon: "ShieldCheck"   },
  { label: "Crediário",         href: "/crediario",              icon: "CreditCard"     },
  { label: "Dashboard Comercial",href: "/dashboard-comercial",icon: "BarChart3"       },
  { label: "Vendas",             href: "/vendas",             icon: "ShoppingBag"     },
  { label: "Solic. Alteração",   href: "/vendas/solicitacoes-alteracao", icon: "FileCheck2" },
  { label: "Est. Comercial",     href: "/estoque-comercial",  icon: "Store"           },
  { label: "Conversões",         href: "/conversoes",         icon: "Repeat2"         },
  { label: "Devoluções",         href: "/devolucoes",         icon: "RotateCcw"       },
  { label: "Vales-Troca",        href: "/vale-troca",         icon: "Ticket"          },
  { label: "Produtos",           href: "/produtos",           icon: "Tag"             },
  { label: "Promocoes",          href: "/comercial/promocoes", icon: "Tag"            },
  { label: "Precificação",       href: "/precificacao",       icon: "TrendingUp"      },
  { label: "Auditoria",          href: "/auditoria",          icon: "ClipboardCheck"  },
  { label: "Tarefas",            href: "/tarefas",            icon: "ListTodo"        },
  { label: "Relatórios",         href: "/relatorios",         icon: "FileBarChart"    },
  { label: "Configurações",      href: "/configuracoes",      icon: "Settings"        },
  { label: "Service",            href: "/service",            icon: "Smartphone"      },
  { label: "Painel Service",     href: "/service-painel",     icon: "Wrench"          },
  { label: "Orcamento",          href: "/orcamento",          icon: "FileSpreadsheet" },
  { label: "Gestão de Estoque",  href: "/gestao-estoque",     icon: "Layers"          },
  { label: "Site",               href: "/site",               icon: "Globe"           },
  { label: "Metal",              href: "/metal",              icon: "Scale"           },
  { label: "Editor IA",          href: "/editor-ia",          icon: "Sparkles"        },
];

const ROLE_MENUS: Record<Role, string[]> = {
  desenvolvedor:      ["/dashboard-fabrica", "/dashboard-comercial", "/ordens", "/pcp", "/rotas-padrao", "/setores", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/entregas-venda", "/auditoria", "/compras", "/compras-comercial", "/insumos", "/rfid/cadastro", "/vendas", "/vendas/solicitacoes-alteracao", "/estoque-comercial", "/conversoes", "/devolucoes", "/vale-troca", "/financeiro", "/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/comissoes", "/financeiro/conciliacao", "/crediario", "/produtos", "/comercial/promocoes", "/precificacao", "/tarefas", "/relatorios", "/configuracoes", "/service-painel", "/orcamento", "/gestao-estoque", "/site", "/metal", "/editor-ia"],
  admin:              ["/dashboard-fabrica", "/dashboard-comercial", "/ordens", "/pcp", "/rotas-padrao", "/setores", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/entregas-venda", "/auditoria", "/compras", "/compras-comercial", "/insumos", "/rfid/cadastro", "/vendas", "/vendas/solicitacoes-alteracao", "/estoque-comercial", "/conversoes", "/devolucoes", "/vale-troca", "/financeiro", "/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/comissoes", "/financeiro/conciliacao", "/crediario", "/produtos", "/comercial/promocoes", "/precificacao", "/tarefas", "/relatorios", "/configuracoes", "/service-painel", "/orcamento", "/gestao-estoque", "/site", "/metal", "/editor-ia"],
  gerente_fabrica:    ["/dashboard-fabrica", "/ordens", "/pcp", "/rotas-padrao", "/setores", "/distribuicao", "/purificacao", "/estoque", "/quebra", "/protocolo", "/auditoria", "/compras", "/compras-comercial", "/insumos", "/rfid/cadastro", "/vendas", "/estoque-comercial", "/conversoes", "/financeiro", "/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/caixa", "/financeiro/comissoes", "/financeiro/conciliacao", "/tarefas", "/relatorios", "/service-painel", "/orcamento", "/gestao-estoque", "/metal", "/editor-ia"],
  gerente_loja:       ["/dashboard-comercial", "/ordens", "/estoque", "/protocolo", "/conferencia", "/entregas-venda", "/auditoria", "/vendas", "/estoque-comercial", "/compras-comercial", "/conversoes", "/devolucoes", "/vale-troca", "/produtos", "/precificacao", "/tarefas", "/relatorios", "/service-painel", "/orcamento", "/gestao-estoque", "/metal", "/editor-ia", "/crediario", "/financeiro/comissoes"],
  ourives:            ["/ordens", "/pcp", "/editor-ia"],
  motoboy:            ["/protocolo", "/editor-ia"],
  // REGRA DE NEGOCIO: role especifica para entregadores de app.
  // Diferente de 'motoboy' (protocolistas). Entregador so ve suas entregas.
  entregador:          ["/entregas-venda"],
  // REGRA DE NEGOCIO:
  // - O que faz: libera o módulo Metal para TODAS as consultoras.
  // - Por que: a operação comercial precisa registrar compra/recebimento de metal sem depender de gerente.
  // - Impacto se removido: consultora perde acesso ao menu/rotas de metal e bloqueia o fluxo no dia a dia.
  consultora:         ["/dashboard-comercial", "/ordens", "/estoque", "/conferencia", "/orcamento", "/editor-ia", "/crediario", "/metal"],
  estoquista_fabrica: ["/estoque", "/quebra", "/compras", "/compras-comercial", "/insumos", "/rfid/cadastro", "/editor-ia"],
  // REGRA DE NEGOCIO:
  // - O que faz: estoquista de loja pode operar compra comercial para entrada de produto acabado.
  // - Por que: essa funcao pertence ao fluxo operacional de loja/estoque comercial.
  // - Impacto se removido: loja nao consegue registrar compras comerciais no modulo dedicado.
  estoquista_loja:    ["/estoque", "/estoque-comercial", "/compras-comercial", "/editor-ia"],
  pcp:                ["/ordens", "/pcp", "/rotas-padrao", "/setores", "/distribuicao", "/purificacao", "/quebra", "/editor-ia"],
};

// Agrupamento do menu lateral
const MENU_GROUPS: MenuGroup[] = [
  { type: "group", label: "Produção",    icon: "Factory",     items: ["/dashboard-fabrica", "/ordens", "/pcp", "/rotas-padrao", "/setores", "/distribuicao", "/purificacao", "/service-painel"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Suprimentos", icon: "Package",     items: ["/estoque", "/quebra", "/insumos", "/compras", "/compras-comercial", "/rfid/cadastro", "/metal"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Logística",   icon: "Truck",       items: ["/protocolo", "/conferencia", "/entregas-venda"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Qualidade",   icon: "ShieldCheck", items: ["/auditoria"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Gestão",     icon: "ListTodo",    items: ["/tarefas", "/relatorios", "/gestao-estoque"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Comercial",   icon: "Briefcase",   items: ["/dashboard-comercial", "/vendas", "/vendas/solicitacoes-alteracao", "/estoque-comercial", "/conversoes", "/devolucoes", "/vale-troca", "/produtos", "/comercial/promocoes", "/orcamento"].map(h => ALL_MENUS.find(m => m.href === h)!) },
  { type: "group", label: "Finanças",    icon: "DollarSign",  items: ["/financeiro/a-pagar", "/financeiro/a-receber", "/financeiro/comissoes", "/financeiro/caixa", "/financeiro/conciliacao", "/crediario", "/precificacao"].map(h => ALL_MENUS.find(m => m.href === h)!) },
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
  "/rotas-padrao":      "pcp",
  "/setores":           "pcp",
  "/distribuicao":      "distribuicao",
  "/purificacao":       "purificacao",
  "/estoque":           "estoque",
  "/quebra":            "quebra",
  "/insumos":           "insumos",
  "/compras":           "compras",
  "/compras-comercial": "compras",
  "/rfid/cadastro":     "rfid_cadastro",
  "/protocolo":         "protocolo",
  "/conferencia":       "conferencia",
  "/entrega":           "entrega",
  "/entregas-venda":    "entregas_venda",
  "/auditoria":         "auditoria",
  "/vendas":                      "vendas",
  "/vendas/solicitacoes-alteracao": "vendas",
  "/estoque-comercial":           "estoque_comercial",
  "/conversoes":                  "estoque_comercial",
  "/devolucoes":                  "devolucoes",
  "/vale-troca":                  "vale_troca",
  "/financeiro":                   "financeiro",
  "/financeiro/a-pagar":           "financeiro",
  "/financeiro/a-receber":         "financeiro",
  "/financeiro/caixa":             "financeiro",
  "/financeiro/comissoes":         "financeiro",
  "/financeiro/conciliacao":       "financeiro",
  "/crediario":                    "crediario",
  "/produtos":          "produtos",
  "/comercial/promocoes": "promocoes",
  "/precificacao":      "precificacao",
  "/configuracoes":     "configuracoes",
  "/tarefas":           "tarefas",
  "/relatorios":        "relatorios",
  "/service":           "service",
  "/service-painel":    "service_painel",
  "/orcamento":         "orcamento",
  "/gestao-estoque":    "gestao_estoque",
  "/site":              "site",
  "/metal":             "metal",
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
