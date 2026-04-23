"use client";

import OrcamentoClient from "../OrcamentoClient";
import type { CurvaConfig, CurvaCategoriaInput } from "@/lib/curva-precificacao";
import type { ConfigOrcamento } from "@/app/(dashboard)/orcamento/types";

interface Props {
  orcamento: Record<string, any>;
  cotacaoOuro: number;
  cotacaoDolar: number;
  config: ConfigOrcamento | null;
  canManageConfig: boolean;
  userName: string;
  userId: string;
  vendedorId: number | null;
  maxDesconto: number;
  curvaConfig: CurvaConfig | null;
  curvaCategorias: CurvaCategoriaInput[];
}

export default function OrcamentoDetalheClient({
  orcamento,
  cotacaoOuro,
  cotacaoDolar,
  config,
  canManageConfig,
  userName,
  userId,
  vendedorId,
  maxDesconto,
  curvaConfig,
  curvaCategorias,
}: Props) {
  const isRascunho = orcamento.status === "rascunho";

  if (isRascunho) {
    return (
      <OrcamentoClient
        cotacaoOuro={cotacaoOuro}
        cotacaoDolar={cotacaoDolar}
        config={config}
        canManageConfig={canManageConfig}
        userName={userName}
        userId={userId}
        vendedorId={vendedorId}
        maxDesconto={maxDesconto}
        curvaConfig={curvaConfig}
        curvaCategorias={curvaCategorias}
        initialOrcamento={orcamento}
      />
    );
  }

  // Read-only view
  const token = orcamento.token_compartilhamento as string | null;
  const shareUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/orcamento/compartilhado/${token}` : null;

  const handleShare = () => {
    if (!shareUrl) return;
    if (navigator.share) {
      navigator.share({ title: `Orçamento ${orcamento.numero_orcamento}`, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert("Link copiado!");
    }
  };

  return (
    <OrcamentoClient
      cotacaoOuro={cotacaoOuro}
      cotacaoDolar={cotacaoDolar}
      config={config}
      canManageConfig={canManageConfig}
      userName={userName}
      userId={userId}
      vendedorId={vendedorId}
      maxDesconto={maxDesconto}
      curvaConfig={curvaConfig}
      curvaCategorias={curvaCategorias}
      initialOrcamento={orcamento}
      readOnly
      onShare={token ? handleShare : undefined}
    />
  );
}
