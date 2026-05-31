// ═══════════════════════════════════════════════════════════════════════════
// Aba "Aprovadores" na página de Configurações
//
// REGRA DE NEGÓCIO: permite que admin/desenvolvedor escolha quem aprova
// cada tipo de solicitação (crédito, desconto, cartão, compra comercial,
// compra de metal acima do teto).
// Só exibe dropdowns editáveis para admin/desenvolvedor.
// Os demais usuários só visualizam o nome do aprovador configurado.
//
// Se alterar: manter a sincronia com as chaves em configuracoes_sistema.
// Os valores salvos aqui são lidos por:
//   - vendas-credito-aprovar.ts
//   - aprovacao-regras.ts
//   - solicitar-aprovacao/route.ts
// ═══════════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";

interface AprovadorConfig {
  aprovador_credito_diretor: string;
  aprovador_desconto_padrao: string;
  aprovador_cartao_desconto_padrao: string;
  aprovadora_credito_gerente?: string;
  aprovador_compra_comercial?: string;
  metal_aprovador_id?: string;
  aprovador_limpeza?: string;
}

interface Usuario {
  id: string;
  nome: string;
  role?: string;
}

interface UsuariosPorRole {
  gerentes: Usuario[];
  diretores_admins: Usuario[];
  admins_devs: Usuario[];
  metal_aprovadores: Usuario[];
  aprovadores_limpeza: Usuario[];
}

const P = {
  card: "#ffffff",
  border: "#e5e7eb",
  texto: "#111827",
  secundario: "#6b7280",
  dourado: "#d97706",
  verde: "#16a34a",
};

const CONFIG_ITENS = [
  {
    chave: "aprovadora_credito_gerente" as const,
    titulo: "Crédito A Receber (dentro do saldo)",
    descricao: "Aprova crédito quando o valor está dentro do saldo disponível do gerente",
    usuariosKey: "gerentes" as const,
    icone: "💰",
  },
  {
    chave: "aprovador_credito_diretor" as const,
    titulo: "Crédito A Receber (acima do saldo)",
    descricao: "Aprova crédito quando o valor excede o saldo — a comissão da consultora é zerada",
    usuariosKey: "diretores_admins" as const,
    icone: "🔴",
  },
  {
    chave: "aprovador_desconto_padrao" as const,
    titulo: "Desconto acima do limite",
    descricao: "Aprova descontos que ultrapassam o percentual permitido da vendedora",
    usuariosKey: "admins_devs" as const,
    icone: "🏷️",
  },
  {
    chave: "aprovador_cartao_desconto_padrao" as const,
    titulo: "Cartão de crédito com desconto >20%",
    descricao: "Aprova pagamento no cartão de crédito quando há itens com desconto acima de 20%",
    usuariosKey: "admins_devs" as const,
    icone: "💳",
  },
  {
    chave: "aprovador_compra_comercial" as const,
    titulo: "Compra Comercial",
    descricao: "Aprova ordens de compra comercial antes de gerar estoque e contas a pagar",
    usuariosKey: "admins_devs" as const,
    icone: "🧾",
  },
  {
    chave: "metal_aprovador_id" as const,
    titulo: "Compra de Metal acima do teto",
    descricao: "Aprova compras de metal quando o valor por grama ultrapassa o teto configurado",
    usuariosKey: "metal_aprovadores" as const,
    icone: "⚖️",
  },
  /**
   * REGRA DE NEGÓCIO: aprovador da limpeza de metal (sangria).
   * O QUE: define quem pode aprovar/reprovar limpezas concluídas
   *   antes do metal entrar no estoque do destino.
   * POR QUE: separa a responsabilidade operacional (limpeza) da decisão
   *   final de qualidade (aprovação).
   * IMPACTO SE REMOVIDO: sem aprovador configurado, o metal limpo nunca
   *   entra no estoque do destino.
   */
  {
    chave: "aprovador_limpeza" as const,
    titulo: "Limpeza de Metal (Sangria)",
    descricao: "Aprova a limpeza do metal vindo da sangria antes de entrar no estoque do destino",
    usuariosKey: "aprovadores_limpeza" as const,
    icone: "🧪",
  },
];

export default function TabAprovadores() {
  const { user, role } = useAuth();
  // REGRA DE NEGÓCIO: só admin/desenvolvedor/diretor pode editar aprovadores
  const podeEditar = !!(user && isFullAccess(role));
  const [config, setConfig] = useState<AprovadorConfig>({
    aprovador_credito_diretor: "",
    aprovador_desconto_padrao: "",
    aprovador_cartao_desconto_padrao: "",
    aprovadora_credito_gerente: "",
    aprovador_compra_comercial: "",
    metal_aprovador_id: "",
    aprovador_limpeza: "",
  });
  const [usuarios, setUsuarios] = useState<UsuariosPorRole>({
    gerentes: [],
    diretores_admins: [],
    admins_devs: [],
    metal_aprovadores: [],
    aprovadores_limpeza: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/aprovadores")
      .then((r) => r.json())
      .then((d) => {
        setConfig({
          aprovador_credito_diretor: d.aprovador_credito_diretor ?? "",
          aprovador_desconto_padrao: d.aprovador_desconto_padrao ?? "",
          aprovador_cartao_desconto_padrao: d.aprovador_cartao_desconto_padrao ?? "",
          aprovadora_credito_gerente: d.aprovadora_credito_gerente ?? "",
          aprovador_compra_comercial: d.aprovador_compra_comercial ?? "",
          metal_aprovador_id: d.metal_aprovador_id ?? "",
          aprovador_limpeza: d.aprovador_limpeza ?? "",
        });
        setUsuarios(d.usuarios ?? { gerentes: [], diretores_admins: [], admins_devs: [], metal_aprovadores: [], aprovadores_limpeza: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  function onChange(chave: string, valor: string) {
    setConfig((prev) => ({ ...prev, [chave]: valor }));
    setSaved(false);
  }

  function getUserName(chave: string): string {
    const id = (config as any)[chave];
    if (!id) return "";
    const all = [...usuarios.gerentes, ...usuarios.diretores_admins, ...usuarios.admins_devs, ...usuarios.metal_aprovadores, ...usuarios.aprovadores_limpeza];
    const u = all.find((x) => x.id === id);
    return u?.nome ?? "";
  }

  async function salvar() {
    setSaving(true);
    try {
      await fetch("/api/configuracoes/aprovadores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin" style={{ color: P.secundario }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: P.texto }}>
            Responsáveis por aprovações
          </p>
          <p className="text-xs mt-0.5" style={{ color: P.secundario }}>
            {podeEditar ? "Selecione quem aprova cada tipo de solicitação" : "Visualização dos aprovadores configurados"}
          </p>
        </div>
        {podeEditar && (
          <button
            onClick={salvar}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ backgroundColor: P.dourado, color: "#fff" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saved ? "Salvo" : "Salvar"}
          </button>
        )}
      </div>

      {CONFIG_ITENS.map((item) => {
        const valorAtual = (config as any)[item.chave] ?? "";
        const lista = usuarios[item.usuariosKey] ?? [];
        return (
          <div
            key={item.chave}
            className="rounded-xl border p-4 space-y-3"
            style={{ backgroundColor: P.card, borderColor: P.border }}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg mt-0.5">{item.icone}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: P.texto }}>
                  {item.titulo}
                </p>
                <p className="text-xs mt-0.5" style={{ color: P.secundario }}>
                  {item.descricao}
                </p>
              </div>
            </div>

            {podeEditar ? (
              <select
                value={valorAtual}
                onChange={(e) => onChange(item.chave, e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: P.border, color: P.texto, backgroundColor: "#fff" }}
              >
                <option value="">— Selecione um aprovador —</option>
                {lista.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}{u.role ? ` (${u.role})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}
              >
                {getUserName(item.chave) || "— Nenhum aprovador configurado —"}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] mt-2" style={{ color: "#9ca3af" }}>
        {podeEditar ? "As alterações são aplicadas imediatamente." : "Só administradores podem alterar essas configurações."}
      </p>
    </div>
  );
}
