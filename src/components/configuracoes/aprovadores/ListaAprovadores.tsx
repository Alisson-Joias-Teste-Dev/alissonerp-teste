"use client";

import { Save, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui";
import FormularioAprovador from "./FormularioAprovador";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const P = {
  card: "#ffffff",
  border: "#e5e7eb",
  texto: "#111827",
  secundario: "#6b7280",
  dourado: "#d97706",
  verde: "#16a34a",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
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
  conversao_aprovadores: Usuario[];
  precificacao_aprovadores: Usuario[];
  devolucao_aprovadores: Usuario[];
}

interface ConfigItem {
  chave: string;
  titulo: string;
  descricao: string;
  usuariosKey: keyof UsuariosPorRole;
  icone: string;
  multi?: boolean;
}

interface ListaAprovadoresProps {
  config: Record<string, string>;
  usuarios: UsuariosPorRole;
  podeEditar: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onChange: (chave: string, valor: string) => void;
  toggleMulti: (chave: string, userId: string) => void;
  getMultiNames: (chave: string) => string;
  getUserName: (chave: string) => string;
}

// ─── Config items ─────────────────────────────────────────────────────────────
const CONFIG_ITENS: ConfigItem[] = [
  {
    chave: "aprovadora_credito_gerente",
    titulo: "Crédito A Receber (dentro do saldo)",
    descricao: "Aprova crédito quando o valor está dentro do saldo disponível do gerente. Pode marcar vários.",
    usuariosKey: "gerentes",
    icone: "💰",
    multi: true,
  },
  {
    chave: "aprovador_credito_diretor",
    titulo: "Crédito A Receber (acima do saldo)",
    descricao: "Aprova crédito quando o valor excede o saldo — a comissão da consultora é zerada. Pode marcar vários.",
    usuariosKey: "diretores_admins",
    icone: "🔴",
    multi: true,
  },
  {
    chave: "aprovador_desconto_padrao",
    titulo: "Desconto acima do limite",
    descricao: "Aprova descontos que ultrapassam o percentual permitido da vendedora. Pode marcar vários.",
    usuariosKey: "admins_devs",
    icone: "🏷️",
    multi: true,
  },
  {
    chave: "aprovador_cartao_desconto_padrao",
    titulo: "Cartão de crédito com desconto",
    descricao: "Aprova pagamento no cartão de crédito quando há itens com desconto acima do limite configurado acima (\"Limite de desconto no cartão\"). Pode marcar vários.",
    usuariosKey: "admins_devs",
    icone: "💳",
    multi: true,
  },
  {
    chave: "aprovador_compra_comercial",
    titulo: "Compra Comercial",
    descricao: "Aprova ordens de compra comercial antes de gerar estoque e contas a pagar. Pode marcar vários.",
    usuariosKey: "admins_devs",
    icone: "🧾",
    multi: true,
  },
  {
    chave: "metal_aprovador_id",
    titulo: "Compra de Metal acima do teto",
    descricao: "Aprova compras de metal quando o valor por grama ultrapassa o teto configurado. Pode marcar vários.",
    usuariosKey: "metal_aprovadores",
    icone: "⚖️",
    multi: true,
  },
  {
    chave: "aprovador_limpeza",
    titulo: "Limpeza de Metal (Sangria)",
    descricao: "Aprova a limpeza do metal vindo da sangria antes de entrar no estoque do destino. Pode marcar vários.",
    usuariosKey: "aprovadores_limpeza",
    icone: "🧪",
    multi: true,
  },
  {
    chave: "aprovador_entrega_sem_pagamento",
    titulo: "Entrega sem pagamento total",
    descricao: "Aprova marcar pedido como entregue mesmo com saldo financeiro em aberto. Pode marcar vários.",
    usuariosKey: "aprovadores_entrega_sem_pagamento",
    icone: "📦",
    multi: true,
  },
  {
    chave: "aprovador_devolucao",
    titulo: "Devolução — etapa 1 (aprovação da compensação)",
    descricao: "Aprova a devolução (crédito/vale) — mesmo aprovador dentro ou fora do prazo de 7 dias úteis. Pode marcar vários.",
    usuariosKey: "devolucao_aprovadores",
    icone: "↩️",
    multi: true,
  },
  {
    chave: "aprovador_devolucao_estoque",
    titulo: "Devolução — etapa 2 (aprovação do estoque)",
    descricao: "Confere o estoque da devolução antes de gerar o vale-troca/reembolso (conclui a devolução ao aprovar). Pode marcar vários.",
    usuariosKey: "todos_usuarios",
    icone: "📦",
    multi: true,
  },
  {
    chave: "aprovador_devolucao_fora_prazo",
    titulo: "Devolução fora do prazo (legado — não usado mais)",
    descricao: "Fase 3e (12/07): a devolução passou a ter 1 aprovador só (ver \"Devolução — etapa 1\" acima), independente do prazo. Esta chave não é mais lida por nenhum fluxo — mantida só por histórico.",
    usuariosKey: "todos_usuarios",
    icone: "🗄️",
  },
  {
    chave: "aprovador_vale_troca_excecao",
    titulo: "Vale-troca — exceção (WhatsApp indisponível)",
    descricao: "Libera aplicar o vale quando não dá pra confirmar pelo WhatsApp do dono (sem celular / serviço fora). Pode marcar vários.",
    usuariosKey: "todos_usuarios",
    icone: "🔓",
    multi: true,
  },
  {
    chave: "aprovadores_devolver_peca",
    titulo: "Devolução de peça — venda virou crédito",
    descricao: "Quem confirma a recolocação da peça no estoque quando uma reserva vira vale-crédito. Pode marcar vários.",
    usuariosKey: "todos_usuarios",
    icone: "📦",
    multi: true,
  },
  {
    chave: "aprovador_conversao",
    titulo: "Conversão (estoque + SKU)",
    descricao: "Aprova conversão de estoque em peso (Caixa de Ouro) e conversão de SKU — mesmo aprovador pros dois. Pode marcar vários.",
    usuariosKey: "conversao_aprovadores",
    icone: "🔄",
    multi: true,
  },
  {
    chave: "aprovador_precificacao",
    titulo: "Precificação (markup)",
    descricao: "Aprova alteração de markup de ouro ou pedras — aplica o novo preço imediatamente. Pode marcar vários.",
    usuariosKey: "precificacao_aprovadores",
    icone: "🏷️",
    multi: true,
  },
  {
    chave: "aprovador_alteracao_venda",
    titulo: "Alteração de venda",
    descricao: "Aprova solicitação de alteração de campo restrito ou pagamento em venda já fechada. Pode marcar vários.",
    usuariosKey: "diretores_admins",
    icone: "✏️",
    multi: true,
  },
  {
    chave: "aprovadores_conversao_reversa",
    titulo: "Conversão Reversa (ouro do cofre virou joia)",
    descricao: "Quem aprova quando um ouro pendente no cofre é convertido em peça de estoque. Só quem estiver marcado aqui aprova. Pode marcar vários.",
    usuariosKey: "metal_aprovadores",
    icone: "💎",
    multi: true,
  },
  {
    chave: "aprovadores_garantia_fora_prazo",
    titulo: "Garantia fora do prazo (7 dias úteis)",
    descricao: "Quem aprova abrir garantia depois dos 7 dias úteis da entrega, para serviços que não são vitalícios. Acabamento e polimento é vitalício e não passa por aqui; venda não entregue é bloqueio sem aprovação. Só quem estiver marcado aqui aprova. Pode marcar vários.",
    usuariosKey: "diretores_admins",
    icone: "🛡️",
    multi: true,
  },
  {
    chave: "aprovadores_frete_avulso",
    titulo: "Frete avulso solicitado — pago pelo cliente",
    descricao: "Quem pode liberar ou recusar a solicitação de frete avulso quando o CLIENTE paga (com comprovante anexado) — serve para acompanhar a entrega. Qualquer um da lista decide a mesma tarefa — pode marcar vários.",
    usuariosKey: "todos_usuarios",
    icone: "🛵",
    multi: true,
  },
  {
    chave: "aprovadores_frete_avulso_loja",
    titulo: "Frete avulso solicitado — custo da loja",
    descricao: "Quem autoriza o CUSTO quando a LOJA paga o frete avulso (sem comprovante). Lista separada da acima — qualquer um da lista decide a mesma tarefa — pode marcar vários.",
    usuariosKey: "todos_usuarios",
    icone: "🏪",
    multi: true,
  },
  {
    chave: "gerente_frete_gratis",
    titulo: "Gerente do saldo de frete grátis",
    descricao: "Dona da verba mensal de frete grátis (0,1% do faturamento do mês anterior) — 1 pessoa só. Vazio = usa o gerente_loja mais antigo cadastrado (comportamento antigo, mantido por compatibilidade).",
    usuariosKey: "gerentes",
    icone: "🚚",
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ListaAprovadores({
  config,
  usuarios,
  podeEditar,
  saving,
  saved,
  onSave,
  onChange,
  toggleMulti,
  getMultiNames,
  getUserName,
}: ListaAprovadoresProps) {
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
          <Button variant="primary" size="sm" loading={saving} onClick={onSave}>
            {saved ? <><CheckCircle size={14} /> Salvo</> : <><Save size={14} /> Salvar</>}
          </Button>
        )}
      </div>

      {/* REGRA DE NEGÓCIO (Fase 5, 15/07 — tela adicionada 16/07 a pedido do
          Jonathan): limites em % que decidem SE precisa de aprovação — não são
          UUID de aprovador, então ficam fora da grade de cards acima. Antes
          hardcoded no código (30/50/15 por cargo, 20% do cartão); agora vêm
          do banco (configuracoes_sistema) com fallback seguro se a chave não
          existir. Ver docs/regras-negocio/aprovacoes-refatoracao/17-FASE-5-limites.md */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border p-2.5 space-y-2" style={{ backgroundColor: P.card, borderColor: P.border }}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm shrink-0">🎚️</span>
            <p className="text-xs font-semibold flex-1 min-w-0" style={{ color: P.texto }}>
              Teto sem cadastro de desconto
            </p>
            <span
              title="Vendedora sem % de desconto cadastrado no perfil dela cai neste teto. 0 = qualquer desconto pede aprovação."
              style={{ color: P.secundario, cursor: "help", flexShrink: 0, fontSize: 13, lineHeight: 1 }}
            >
              ⓘ
            </span>
          </div>
          {podeEditar ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={config.desconto_fallback_sem_cadastro_pct ?? "0"}
                onChange={(e) => onChange("desconto_fallback_sem_cadastro_pct", e.target.value)}
                className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                style={{ borderColor: P.border, color: P.texto, backgroundColor: "#fff" }}
              />
              <span className="text-xs shrink-0" style={{ color: P.secundario }}>%</span>
            </div>
          ) : (
            <div className="w-full rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}>
              {config.desconto_fallback_sem_cadastro_pct ?? "0"}%
            </div>
          )}
        </div>

        <div className="rounded-lg border p-2.5 space-y-2" style={{ backgroundColor: P.card, borderColor: P.border }}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm shrink-0">💳</span>
            <p className="text-xs font-semibold flex-1 min-w-0" style={{ color: P.texto }}>
              Limite de desconto no cartão
            </p>
            <span
              title="Acima deste %, pagar no Cartão de Crédito exige aprovação (card 'Cartão de crédito com desconto' abaixo)."
              style={{ color: P.secundario, cursor: "help", flexShrink: 0, fontSize: 13, lineHeight: 1 }}
            >
              ⓘ
            </span>
          </div>
          {podeEditar ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={config.limite_desconto_cartao_pct ?? "20"}
                onChange={(e) => onChange("limite_desconto_cartao_pct", e.target.value)}
                className="w-full rounded-lg border px-2.5 py-1.5 text-xs"
                style={{ borderColor: P.border, color: P.texto, backgroundColor: "#fff" }}
              />
              <span className="text-xs shrink-0" style={{ color: P.secundario }}>%</span>
            </div>
          ) : (
            <div className="w-full rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: P.border, backgroundColor: "#f9fafb", color: P.texto }}>
              {config.limite_desconto_cartao_pct ?? "20"}%
            </div>
          )}
        </div>
      </div>

      {/* REGRA DE NEGÓCIO (16/07 — pedido do Jonathan): grade de 2 colunas em vez
          de 1 card por linha — com 16 tipos de aprovação, a tela empilhada
          exigia rolar ~8 telas. Card compacto (FormularioAprovador) + descrição
          virou tooltip no ícone de info — cabe em ~3 telas. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONFIG_ITENS.map((item) => (
          <FormularioAprovador
            key={item.chave}
            item={item}
            config={config}
            usuarios={usuarios}
            podeEditar={podeEditar}
            onChange={onChange}
            toggleMulti={toggleMulti}
            getMultiNames={getMultiNames}
            getUserName={getUserName}
          />
        ))}
      </div>

      <p className="text-[10px] mt-2" style={{ color: "#9ca3af" }}>
        {podeEditar ? "As alterações são aplicadas imediatamente." : "Só administradores podem alterar essas configurações."}
      </p>
    </div>
  );
}
