"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";
import NavegacaoAbas, { type Aba } from "@/components/NavegacaoAbas";
import {
  Settings, DollarSign, Link2, Webhook, Users, Bot,
  Warehouse, Flame, MapPin, Wrench, PenLine, Wallet,
  Truck, CreditCard, Scale, Shield, Eye, Smartphone,
} from "lucide-react";
import TabParametros from "@/components/configuracoes/TabParametros";
import TabUsuarios from "@/components/configuracoes/TabUsuarios";
import TabWebhooks from "@/components/configuracoes/TabWebhooks";
import TabIA from "@/components/configuracoes/TabIA";
import TabDepositos from "@/components/configuracoes/TabDepositos";
import TabPermissoes from "@/components/configuracoes/TabPermissoes";
import TabTeores from "@/components/configuracoes/TabTeores";
import TabTiposServico from "@/components/configuracoes/TabTiposServico";
import TabCotacoes from "@/components/configuracoes/TabCotacoes";
import TabIntegracoes from "@/components/configuracoes/TabIntegracoes";
import TabComissoes from "@/components/configuracoes/TabComissoes";
import TabMaquininhas from "@/components/configuracoes/TabMaquininhas";
import TabCreditoLoja from "@/components/configuracoes/TabCreditoLoja";
import TabFretes from "@/components/configuracoes/TabFretes";
import TabGateways from "@/components/configuracoes/TabGateways";
import TabMetal from "@/components/configuracoes/TabMetal";
import TabAprovadores from "@/components/configuracoes/TabAprovadores";
import LocaisEstoqueTab from "@/components/LocaisEstoqueTab";
import TabProdutoVisibilidade from "@/components/configuracoes/TabProdutoVisibilidade";

import type { Parametros } from "./types";

interface Props {
  parametros: Parametros;
  webhooks: any[];
  logs: any[];
  usuarios: any[];
  depositos: any[];
  teores: any[];
  ligaTipos: any[];
}

const todasAbas: Aba[] = [
  { key: "parametros", label: "Parâmetros", href: "", icon: Settings },
  { key: "cotacoes", label: "Cotações", href: "", icon: DollarSign },
  { key: "integracoes", label: "Integrações", href: "", icon: Link2 },
  { key: "webhooks", label: "Webhooks", href: "", icon: Webhook },
  { key: "usuarios", label: "Usuários", href: "", icon: Users },
  { key: "ia", label: "IA", href: "", icon: Bot },
  { key: "depositos", label: "Depósitos", href: "", icon: Warehouse },
  { key: "teores", label: "Teores Ouro", href: "", icon: Flame },
  { key: "locais", label: "Locais", href: "", icon: MapPin },
  { key: "tipos_servico", label: "Tipos Serviço", href: "", icon: Wrench },
  { key: "comissoes", label: "Comissões", href: "", icon: PenLine },
  { key: "credito_loja", label: "Crédito Loja", href: "", icon: Wallet },
  { key: "fretes", label: "Fretes", href: "", icon: Truck },
  { key: "gateways", label: "Gateways", href: "", icon: CreditCard },
  { key: "metal", label: "Metal", href: "", icon: Scale },
  { key: "aprovadores", label: "Aprovadores", href: "", icon: Shield },
  { key: "permissoes", label: "Permissões", href: "", icon: Shield },
  { key: "produto_visibilidade", label: "Visib. Produtos", href: "", icon: Eye },
  { key: "maquininhas", label: "Maquininhas", href: "", icon: Smartphone },
];

export default function PaginaConfiguracoes({ parametros, webhooks, logs, usuarios, depositos, teores, ligaTipos }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role: currentRole } = useAuth();
  const [tab, setTab] = useState("parametros");

  const isSuperAdmin = currentRole === "desenvolvedor" || currentRole === "admin";
  const canSeeMaquininhas = isFullAccess(currentRole);

  const abas = useMemo(() => {
    const base = todasAbas.filter((a) => a.key !== "permissoes" && a.key !== "produto_visibilidade" && a.key !== "maquininhas");
    if (isSuperAdmin) base.push(...todasAbas.filter((a) => a.key === "permissoes" || a.key === "produto_visibilidade"));
    if (canSeeMaquininhas) base.push(todasAbas.find((a) => a.key === "maquininhas")!);
    return base;
  }, [isSuperAdmin, canSeeMaquininhas]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && abas.some((a) => a.key === t)) setTab(t);
  }, [searchParams, abas]);

  const aoMudarAba = useCallback((key: string) => {
    setTab(key);
    router.replace(`/configuracoes?tab=${key}`, { scroll: false });
  }, [router]);

  const initialUserId = searchParams.get("user");

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-wide text-gray-800"
          style={{ fontFamily: "var(--font-playfair)" }}>
          Configurações
        </h1>
        <p className="text-xs mt-0.5 text-gray-500">Somente administradores</p>
      </div>

      <NavegacaoAbas abas={abas} activeKey={tab} aoMudar={aoMudarAba} />

      {tab === "parametros" && <TabParametros parametros={parametros} />}
      {tab === "webhooks" && <TabWebhooks webhooks={webhooks} logs={logs} />}
      {tab === "usuarios" && <TabUsuarios usuarios={usuarios} depositos={depositos} initialUserId={initialUserId} />}
      {tab === "ia" && <TabIA />}
      {tab === "depositos" && <TabDepositos />}
      {tab === "permissoes" && <TabPermissoes />}
      {tab === "teores" && <TabTeores teores={teores} ligaTipos={ligaTipos} />}
      {tab === "tipos_servico" && <TabTiposServico />}
      {tab === "cotacoes" && <TabCotacoes />}
      {tab === "integracoes" && <TabIntegracoes />}
      {tab === "comissoes" && <TabComissoes />}
      {tab === "maquininhas" && <TabMaquininhas />}
      {tab === "credito_loja" && <TabCreditoLoja />}
      {tab === "fretes" && <TabFretes />}
      {tab === "gateways" && <TabGateways />}
      {tab === "metal" && <TabMetal />}
      {tab === "aprovadores" && <TabAprovadores />}
      {tab === "locais" && <LocaisEstoqueTab canEdit={isSuperAdmin} />}
      {tab === "produto_visibilidade" && <TabProdutoVisibilidade />}
    </div>
  );
}
