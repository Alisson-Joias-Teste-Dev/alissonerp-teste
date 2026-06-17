// ═══════════════════════════════════════════════════════════════════════════
// Aba "Aprovadores" na página de Configurações
//
// REGRA DE NEGÓCIO: permite que admin/desenvolvedor escolha quem aprova
// cada tipo de solicitação (crédito, desconto, cartão, compra comercial,
// compra de metal acima do teto e entrega sem pagamento total).
// Só exibe dropdowns editáveis para admin/desenvolvedor.
// Os demais usuários só visualizam o nome do aprovador configurado.
//
// Se alterar: manter a sincronia com as chaves em configuracoes_sistema.
// Os valores salvos aqui são lidos por:
//   - vendas-credito-aprovar.ts
//   - aprovacao-regras.ts
//   - solicitar-aprovacao/route.ts
//   - entrega-sem-pagamento.ts
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
  aprovador_entrega_sem_pagamento?: string;
  aprovador_devolucao_fora_prazo?: string;
  aprovador_devolucao_estoque?: string;
  aprovador_vale_troca_excecao?: string;
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
  aprovadores_entrega_sem_pagamento: Usuario[];
  todos_usuarios: Usuario[];
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
  /**
   * REGRA DE NEGOCIO: Automacao de Estoque 2.0.
   * O QUE: define quem pode aprovar entrega quando a venda ainda nao esta
   * 100% paga, antes da baixa real do estoque comercial.
   * POR QUE: estoque baixa somente em `entregue`; liberar entrega sem pagamento
   * total exige responsavel rastreavel e alçada equivalente a baixa financeira.
   * IMPACTO SE REMOVIDO: o backend fica sem aprovador configurado e bloqueia a
   * excecao, ou a empresa perde controle sobre saida de estoque sem quitacao.
   */
  {
    chave: "aprovador_entrega_sem_pagamento" as const,
    titulo: "Entrega sem pagamento total",
    descricao: "Aprova marcar pedido como entregue mesmo com saldo financeiro em aberto",
    usuariosKey: "aprovadores_entrega_sem_pagamento" as const,
    icone: "📦",
  },
  /**
   * REGRA DE NEGÓCIO: aprovador de devolução FORA DO PRAZO (7 dias úteis).
   * O QUE: quando a venda passou de 7 dias úteis desde a entrega real, a consultora
   *   não cria o vale direto — pede aprovação, que cai pra esta pessoa.
   * POR QUE: controla exceções de prazo de troca com responsável rastreável.
   * IMPACTO SE REMOVIDO: pedido fora do prazo cai no fallback (gerente/diretor/admin).
   * Lista ABERTA: qualquer usuário ativo pode ser escolhido (decisão Jonathan 15/06).
   */
  {
    chave: "aprovador_devolucao_fora_prazo" as const,
    titulo: "Devolução fora do prazo (7 dias úteis)",
    descricao: "Aprova gerar vale-troca de devolução quando a venda passou de 7 dias úteis desde a entrega ao cliente",
    usuariosKey: "todos_usuarios" as const,
    icone: "↩️",
  },
  /**
   * REGRA DE NEGÓCIO: aprovador do ESTOQUE na devolução.
   * O QUE: quem confere o estoque da devolução ANTES de gerar o vale/reembolso.
   * POR QUE: toda devolução passa pela conferência do estoque antes de virar crédito.
   * IMPACTO SE REMOVIDO: cai no fallback por cargo de fábrica/estoque.
   */
  {
    chave: "aprovador_devolucao_estoque" as const,
    titulo: "Devolução — aprovação do estoque",
    descricao: "Confere o estoque da devolução antes de gerar o vale-troca/reembolso (conclui a devolução ao aprovar)",
    usuariosKey: "todos_usuarios" as const,
    icone: "📦",
  },
  /**
   * REGRA DE NEGÓCIO: aprovador de EXCEÇÃO do vale-troca.
   * O QUE: libera aplicar o vale quando a confirmação por WhatsApp do dono falha
   *   (cliente sem celular / WhatsApp fora).
   * POR QUE: não travar o caixa, mantendo um responsável rastreável pela exceção.
   * IMPACTO SE REMOVIDO: exceção cai no fallback (gerente_loja/diretor/admin).
   */
  {
    chave: "aprovador_vale_troca_excecao" as const,
    titulo: "Vale-troca — exceção (WhatsApp indisponível)",
    descricao: "Libera aplicar o vale quando não dá pra confirmar pelo WhatsApp do dono (sem celular / serviço fora)",
    usuariosKey: "todos_usuarios" as const,
    icone: "🔓",
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
    aprovador_entrega_sem_pagamento: "",
    aprovador_devolucao_fora_prazo: "",
    aprovador_devolucao_estoque: "",
    aprovador_vale_troca_excecao: "",
  });
  const [usuarios, setUsuarios] = useState<UsuariosPorRole>({
    gerentes: [],
    diretores_admins: [],
    admins_devs: [],
    metal_aprovadores: [],
    aprovadores_limpeza: [],
    aprovadores_entrega_sem_pagamento: [],
    todos_usuarios: [],
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
          aprovador_entrega_sem_pagamento: d.aprovador_entrega_sem_pagamento ?? "",
          aprovador_devolucao_fora_prazo: d.aprovador_devolucao_fora_prazo ?? "",
          aprovador_devolucao_estoque: d.aprovador_devolucao_estoque ?? "",
          aprovador_vale_troca_excecao: d.aprovador_vale_troca_excecao ?? "",
        });
        setUsuarios(d.usuarios ?? { gerentes: [], diretores_admins: [], admins_devs: [], metal_aprovadores: [], aprovadores_limpeza: [], aprovadores_entrega_sem_pagamento: [], todos_usuarios: [] });
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
    const all = [...usuarios.gerentes, ...usuarios.diretores_admins, ...usuarios.admins_devs, ...usuarios.metal_aprovadores, ...usuarios.aprovadores_limpeza, ...usuarios.aprovadores_entrega_sem_pagamento, ...usuarios.todos_usuarios];
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
