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
    descricao: "Aprova crédito quando o valor está dentro do saldo disponível do gerente",
    usuariosKey: "gerentes",
    icone: "💰",
  },
  {
    chave: "aprovador_credito_diretor",
    titulo: "Crédito A Receber (acima do saldo)",
    descricao: "Aprova crédito quando o valor excede o saldo — a comissão da consultora é zerada",
    usuariosKey: "diretores_admins",
    icone: "🔴",
  },
  {
    chave: "aprovador_desconto_padrao",
    titulo: "Desconto acima do limite",
    descricao: "Aprova descontos que ultrapassam o percentual permitido da vendedora",
    usuariosKey: "admins_devs",
    icone: "🏷️",
  },
  {
    chave: "aprovador_cartao_desconto_padrao",
    titulo: "Cartão de crédito com desconto >20%",
    descricao: "Aprova pagamento no cartão de crédito quando há itens com desconto acima de 20%",
    usuariosKey: "admins_devs",
    icone: "💳",
  },
  {
    chave: "aprovador_compra_comercial",
    titulo: "Compra Comercial",
    descricao: "Aprova ordens de compra comercial antes de gerar estoque e contas a pagar",
    usuariosKey: "admins_devs",
    icone: "🧾",
  },
  {
    chave: "metal_aprovador_id",
    titulo: "Compra de Metal acima do teto",
    descricao: "Aprova compras de metal quando o valor por grama ultrapassa o teto configurado",
    usuariosKey: "metal_aprovadores",
    icone: "⚖️",
  },
  {
    chave: "aprovador_limpeza",
    titulo: "Limpeza de Metal (Sangria)",
    descricao: "Aprova a limpeza do metal vindo da sangria antes de entrar no estoque do destino",
    usuariosKey: "aprovadores_limpeza",
    icone: "🧪",
  },
  {
    chave: "aprovador_entrega_sem_pagamento",
    titulo: "Entrega sem pagamento total",
    descricao: "Aprova marcar pedido como entregue mesmo com saldo financeiro em aberto",
    usuariosKey: "aprovadores_entrega_sem_pagamento",
    icone: "📦",
  },
  {
    chave: "aprovador_devolucao",
    titulo: "Devolução — etapa 1 (aprovação da compensação)",
    descricao: "Aprova a devolução (crédito/vale) — mesmo aprovador dentro ou fora do prazo de 7 dias úteis",
    usuariosKey: "devolucao_aprovadores",
    icone: "↩️",
  },
  {
    chave: "aprovador_devolucao_estoque",
    titulo: "Devolução — etapa 2 (aprovação do estoque)",
    descricao: "Confere o estoque da devolução antes de gerar o vale-troca/reembolso (conclui a devolução ao aprovar)",
    usuariosKey: "todos_usuarios",
    icone: "📦",
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
    descricao: "Libera aplicar o vale quando não dá pra confirmar pelo WhatsApp do dono (sem celular / serviço fora)",
    usuariosKey: "todos_usuarios",
    icone: "🔓",
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
    descricao: "Aprova conversão de estoque em peso (Caixa de Ouro) e conversão de SKU — mesmo aprovador pros dois",
    usuariosKey: "conversao_aprovadores",
    icone: "🔄",
  },
  {
    chave: "aprovador_precificacao",
    titulo: "Precificação (markup)",
    descricao: "Aprova alteração de markup de ouro ou pedras — aplica o novo preço imediatamente",
    usuariosKey: "precificacao_aprovadores",
    icone: "🏷️",
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

      <p className="text-[10px] mt-2" style={{ color: "#9ca3af" }}>
        {podeEditar ? "As alterações são aplicadas imediatamente." : "Só administradores podem alterar essas configurações."}
      </p>
    </div>
  );
}
