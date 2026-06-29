"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";
import type { Tab, Props } from "@/components/configuracoes/types";

import TabParametros from "@/components/configuracoes/TabParametros";
import TabWebhooks from "@/components/configuracoes/TabWebhooks";
import TabUsuarios from "@/components/configuracoes/TabUsuarios";
import TabIA from "@/components/configuracoes/TabIA";
import TabDepositos from "@/components/configuracoes/TabDepositos";
import TabPermissoes from "@/components/configuracoes/TabPermissoes";
import TabTeores from "@/components/configuracoes/TabTeores";
import TabTiposServico from "@/components/configuracoes/TabTiposServico";
import TabIntegracoes from "@/components/configuracoes/TabIntegracoes";
import TabComissoes from "@/components/configuracoes/TabComissoes";
import TabMaquininhas from "@/components/configuracoes/TabMaquininhas";
import TabCreditoLoja from "@/components/configuracoes/TabCreditoLoja";
import TabFretes from "@/components/configuracoes/TabFretes";
import TabGateways from "@/components/configuracoes/TabGateways";
import TabMetal from "@/components/configuracoes/TabMetal";
import TabProdutoVisibilidade from "@/components/configuracoes/TabProdutoVisibilidade";
import TabAprovadores from "@/components/configuracoes/TabAprovadores";
import LocaisEstoqueTab from "@/components/LocaisEstoqueTab";

export default function ConfiguracoesClient({ parametros, webhooks, logs, usuarios, depositos, teores, ligaTipos }: Props) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("parametros");
  const [initialUserId, setInitialUserId] = useState<string | null>(null);
  const { role: currentRole } = useAuth();
  const isSuperAdmin = currentRole === "desenvolvedor" || currentRole === "admin";
  const canSeeMaquininhas = isFullAccess(currentRole);

  useEffect(() => {
    const t = searchParams.get("tab");
    const u = searchParams.get("user");
    if (t && ["parametros", "webhooks", "usuarios", "ia", "depositos", "permissoes", "teores", "locais", "tipos_servico", "integracoes", "comissoes", "credito_loja", "maquininhas", "fretes", "gateways", "metal", "produto_visibilidade", "aprovadores"].includes(t)) setTab(t as Tab);
    if (u) setInitialUserId(u);
  }, [searchParams]);

  const tabLabels: Record<string, string> = {
    parametros: "Cotações de Mercado", webhooks: "Webhooks", usuarios: "Usuários",
    ia: "IA", depositos: "Depósitos", permissoes: "Permissões", teores: "Teores Ouro",
    locais: "Locais", tipos_servico: "Tipos de Serviço", integracoes: "Integrações",
    comissoes: "Comissões", credito_loja: "Crédito Loja", maquininhas: "Maquininhas",
    fretes: "Fretes", gateways: "Gateways", metal: "Metal", aprovadores: "Aprovadores",
    produto_visibilidade: "Visibilidade",
  };
  const tabDescriptions: Record<string, string> = {
    parametros: "Cotações do ouro, dólar, euro e prata para cálculos do sistema",
    teores: "Teor de ouro puro por liga e mapeamento de ligas para fundição",
    webhooks: "Endpoints que recebem notificações de eventos do sistema",
    usuarios: "Gerencie os usuários e perfis de acesso ao sistema",
    ia: "Configurações de validação por inteligência artificial",
    depositos: "Gerencie os depósitos e setores de produção",
    permissoes: "Configure o acesso de cada role aos módulos do sistema",
    tipos_servico: "Tipos usados em ordens de serviço interno",
    integracoes: "Conecte o ERP com serviços externos",
    comissoes: "Comissão da vendedora por faixa de desconto",
    credito_loja: "Saldo rotativo do gerente de loja",
    fretes: "Configure o valor de frete para cada bairro",
    gateways: "Configure as contas e gateways de pagamento",
    metal: "Percentuais da cotação do ouro para compra e recebimento",
    aprovadores: "Defina quem aprova cada tipo de solicitação",
    produto_visibilidade: "Controle a visibilidade dos produtos por perfil",
    maquininhas: "Gerencie os devices Point por vendedor",
    locais: "Configure os locais de estoque do sistema",
  };
  const pageTitle = tabLabels[tab] || "Configurações";
  const pageDesc = tabDescriptions[tab] || "Configurações do sistema";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800">{pageTitle}</h3>
        <p className="mt-1 text-sm text-gray-500">{pageDesc}</p>
      </div>

      <div className="p-5 lg:p-6">
        {tab === "parametros"  && <TabParametros parametros={parametros} />}
        {tab === "webhooks"    && <TabWebhooks webhooks={webhooks} logs={logs} />}
        {tab === "usuarios"    && <TabUsuarios usuarios={usuarios} depositos={depositos} initialUserId={initialUserId} />}
        {tab === "ia"          && <TabIA />}
        {tab === "depositos"   && <TabDepositos />}
        {tab === "teores"      && <TabTeores teores={teores} ligaTipos={ligaTipos} />}
        {tab === "permissoes"    && isSuperAdmin && <TabPermissoes />}
        {tab === "locais"        && <LocaisEstoqueTab canEdit={isSuperAdmin} />}
        {tab === "tipos_servico" && <TabTiposServico />}
        {tab === "integracoes" && <TabIntegracoes />}
        {tab === "comissoes"  && <TabComissoes />}
        {tab === "credito_loja" && <TabCreditoLoja />}
        {tab === "maquininhas" && canSeeMaquininhas && <TabMaquininhas />}
        {tab === "fretes"     && (isSuperAdmin || currentRole === "gerente_loja") && <TabFretes />}
        {tab === "gateways"   && isSuperAdmin && <TabGateways />}
        {tab === "produto_visibilidade" && isSuperAdmin && <TabProdutoVisibilidade />}
        {tab === "aprovadores" && <TabAprovadores />}
        {tab === "metal"       && <TabMetal />}
      </div>
    </div>
  );
}
