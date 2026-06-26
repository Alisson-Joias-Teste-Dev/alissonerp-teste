"use client";

import { Fragment } from "react";
import { Trash2, PenLine } from "lucide-react";
import NivelPermissao from "./NivelPermissao";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  dourado:  "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

// ─── Constantes ───────────────────────────────────────────────────────────────
const MODULO_LABEL: Record<string, string> = {
  dashboard:         "Dashboard",
  dashboard_fabrica: "Dashboard Fábrica",
  dashboard_comercial: "Dashboard Comercial",
  ordens:            "Ordens",
  pcp:               "PCP",
  distribuicao:      "Distribuição",
  purificacao:       "Purificação",
  estoque:           "Estoque",
  quebra:            "Quebra",
  insumos:           "Insumos",
  compras:           "Compras",
  protocolo:         "Protocolo",
  conferencia:       "Conferência",
  entrega:           "Entrega",
  auditoria:         "Auditoria",
  vendas:            "Vendas",
  financeiro:        "Financeiro",
  produtos:          "Produtos",
  precificacao:      "Precificação",
  configuracoes:     "Configurações",
};

const MODULO_GRUPOS = [
  { label: "📊 Geral",       modulos: ["dashboard", "dashboard_fabrica"] },
  { label: "🔧 Produção",    modulos: ["ordens", "pcp", "distribuicao", "purificacao"] },
  { label: "📦 Suprimentos", modulos: ["estoque", "quebra", "insumos", "compras"] },
  { label: "🚚 Logística",   modulos: ["protocolo", "conferencia", "entrega"] },
  { label: "✅ Qualidade",   modulos: ["auditoria"] },
  { label: "💼 Comercial",   modulos: ["vendas", "dashboard_comercial", "financeiro", "produtos", "precificacao"] },
  { label: "⚙️ Sistema",    modulos: ["configuracoes"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
type PermMap = Record<string, Record<string, { pode_ler: boolean; pode_escrever: boolean }>>;

function getLevel(pode_ler: boolean, pode_escrever: boolean): 0 | 1 | 2 {
  if (pode_escrever) return 2;
  if (pode_ler)      return 1;
  return 0;
}

type RoleItem = { key: string; label: string; ativo: boolean };

// ─── Props ────────────────────────────────────────────────────────────────────
interface TabelaPermissoesProps {
  rolesAtivas: RoleItem[];
  perms: PermMap;
  toggleLevel: (role: string, modulo: string) => void;
  isDirty: (role: string, modulo: string) => boolean;
  handleDesativarRole: (nome: string) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function TabelaPermissoes({
  rolesAtivas,
  perms,
  toggleLevel,
  isDirty,
  handleDesativarRole,
}: TabelaPermissoesProps) {
  return (
    <div
      className="rounded-xl overflow-auto"
      style={{ border: `1px solid ${P.border}` }}
    >
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
            <th
              className="px-4 py-3 text-left font-semibold sticky left-0 z-10 min-w-[140px]"
              style={{ color: P.sage, backgroundColor: P.bg }}
            >
              Módulo
            </th>
            {/* Super-admins — não editáveis */}
            {(["desenvolvedor", "admin"] as const).map(r => (
              <th
                key={r}
                className="px-3 py-3 text-center font-semibold min-w-[80px]"
                style={{ color: P.muted }}
                title="Super-admin — sempre acesso total"
              >
                {r === "desenvolvedor" ? "Dev" : "Admin"}
              </th>
            ))}
            {/* Roles editáveis (dinâmicas) */}
            {rolesAtivas.map(({ key, label }) => (
              <th
                key={key}
                className="px-3 py-3 text-center font-semibold min-w-[80px]"
                style={{ color: P.creme }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>{label}</span>
                  <button
                    onClick={() => handleDesativarRole(key)}
                    title={`Desativar role "${key}"`}
                    className="opacity-30 hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={10} style={{ color: P.vermelho }} />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULO_GRUPOS.map(({ label: grupoLabel, modulos }) => (
            <Fragment key={`grupo-${grupoLabel}`}>
              {/* Linha de grupo */}
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <td
                  colSpan={2 + rolesAtivas.length + 2}
                  className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: P.sage }}
                >
                  {grupoLabel}
                </td>
              </tr>
              {/* Linhas de módulo */}
              {modulos.map((modulo, idx) => (
                <tr
                  key={modulo}
                  style={{
                    backgroundColor: idx % 2 === 0 ? P.card : P.bg,
                    borderBottom: `1px solid ${P.border}`,
                  }}
                >
                  <td
                    className="px-4 py-2.5 font-medium sticky left-0 z-10"
                    style={{
                      color: P.creme,
                      backgroundColor: idx % 2 === 0 ? P.card : P.bg,
                    }}
                  >
                    {MODULO_LABEL[modulo]}
                  </td>
                  {/* Super-admins: sempre nível 2, disabled */}
                  {(["desenvolvedor", "admin"] as const).map(role => (
                    <td key={role} className="px-3 py-2.5 text-center">
                      <NivelPermissao
                        level={2}
                        dirty={false}
                        disabled
                        title="Super-admin — não editável"
                      />
                    </td>
                  ))}
                  {/* Roles editáveis (dinâmicas) */}
                  {rolesAtivas.map(({ key: role }) => {
                    const cur   = perms[role]?.[modulo] ?? { pode_ler: false, pode_escrever: false };
                    const level = getLevel(cur.pode_ler, cur.pode_escrever);
                    const dirty = isDirty(role, modulo);

                    const titleMap = {
                      0: "Sem acesso — clique para Leitura",
                      1: "Somente leitura — clique para Leitura+Escrita",
                      2: "Leitura+Escrita — clique para remover",
                    };

                    return (
                      <td key={role} className="px-3 py-2.5 text-center">
                        <NivelPermissao
                          level={level}
                          dirty={dirty}
                          onClick={() => toggleLevel(role, modulo)}
                          title={titleMap[level]}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
