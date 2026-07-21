"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { isFullAccess } from "@/lib/roles";
import ListaAprovadores from "./aprovadores/ListaAprovadores";

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
  aprovadores_devolver_peca?: string; // MULTI: UUIDs separados por vírgula
  aprovador_conversao?: string; // Fase 3b: conversão de estoque + SKU (mesmo aprovador)
  aprovador_precificacao?: string; // Fase 3c: alteração de markup
  aprovador_devolucao?: string; // Fase 3e: devolução etapa 1 (1 aprovador, sem distinção de prazo)
  aprovador_alteracao_venda?: string; // Fase 3g.1: alteração de venda (era ROLES_FINANCEIRO fixo)
  aprovadores_conversao_reversa?: string; // MULTI: UUIDs separados por vírgula
  aprovadores_garantia_fora_prazo?: string; // MULTI: garantia depois dos 7 dias úteis (17/07)
  desconto_fallback_sem_cadastro_pct?: string; // Fase 5: teto (%) sem cadastro de mx_desconto_permitido
  limite_desconto_cartao_pct?: string; // Fase 5: acima disso, cartão de crédito exige aprovação
  aprovadores_frete_avulso?: string; // MULTI: UUIDs separados por vírgula (pool frete avulso — migration 353)
  aprovadores_frete_avulso_loja?: string; // MULTI: custo do frete avulso quando pagante='loja' (migration 354)
  gerente_frete_gratis?: string; // SINGLE: gerente do saldo de frete grátis (BLOCO 1, 21/07) — vazio = fallback antigo
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
  conversao_aprovadores: Usuario[];
  precificacao_aprovadores: Usuario[];
  devolucao_aprovadores: Usuario[];
}

const P = {
  card: "#ffffff",
  border: "#e5e7eb",
  texto: "#111827",
  secundario: "#6b7280",
  dourado: "#d97706",
  verde: "#16a34a",
};

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
    aprovadores_devolver_peca: "",
    aprovador_conversao: "",
    aprovador_precificacao: "",
    aprovador_devolucao: "",
    aprovador_alteracao_venda: "",
    aprovadores_conversao_reversa: "",
    aprovadores_garantia_fora_prazo: "",
    desconto_fallback_sem_cadastro_pct: "0",
    limite_desconto_cartao_pct: "20",
    aprovadores_frete_avulso: "",
    aprovadores_frete_avulso_loja: "",
    gerente_frete_gratis: "",
  });
  const [usuarios, setUsuarios] = useState<UsuariosPorRole>({
    gerentes: [],
    diretores_admins: [],
    admins_devs: [],
    metal_aprovadores: [],
    aprovadores_limpeza: [],
    aprovadores_entrega_sem_pagamento: [],
    todos_usuarios: [],
    conversao_aprovadores: [],
    precificacao_aprovadores: [],
    devolucao_aprovadores: [],
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
          aprovadores_devolver_peca: d.aprovadores_devolver_peca ?? "",
          aprovador_conversao: d.aprovador_conversao ?? "",
          aprovador_precificacao: d.aprovador_precificacao ?? "",
          aprovador_devolucao: d.aprovador_devolucao ?? "",
          aprovador_alteracao_venda: d.aprovador_alteracao_venda ?? "",
          aprovadores_conversao_reversa: d.aprovadores_conversao_reversa ?? "",
          aprovadores_garantia_fora_prazo: d.aprovadores_garantia_fora_prazo ?? "",
          desconto_fallback_sem_cadastro_pct: d.desconto_fallback_sem_cadastro_pct ?? "0",
          limite_desconto_cartao_pct: d.limite_desconto_cartao_pct ?? "20",
          aprovadores_frete_avulso: d.aprovadores_frete_avulso ?? "",
          aprovadores_frete_avulso_loja: d.aprovadores_frete_avulso_loja ?? "",
          gerente_frete_gratis: d.gerente_frete_gratis ?? "",
        });
        setUsuarios(d.usuarios ?? { gerentes: [], diretores_admins: [], admins_devs: [], metal_aprovadores: [], aprovadores_limpeza: [], aprovadores_entrega_sem_pagamento: [], todos_usuarios: [], conversao_aprovadores: [], precificacao_aprovadores: [], devolucao_aprovadores: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  function onChange(chave: string, valor: string) {
    setConfig((prev) => ({ ...prev, [chave]: valor }));
    setSaved(false);
  }

  // MULTI: marca/desmarca um usuário na lista (UUIDs separados por vírgula).
  function toggleMulti(chave: string, userId: string) {
    setConfig((prev) => {
      const atual = String((prev as any)[chave] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const novo = atual.includes(userId) ? atual.filter((x) => x !== userId) : [...atual, userId];
      return { ...prev, [chave]: novo.join(",") };
    });
    setSaved(false);
  }

  // MULTI: nomes (separados por vírgula) dos usuários selecionados — pra exibição.
  function getMultiNames(chave: string): string {
    const ids = new Set(String((config as any)[chave] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    if (ids.size === 0) return "";
    const all = [...usuarios.todos_usuarios];
    return all.filter((u) => ids.has(u.id)).map((u) => u.nome).join(", ");
  }

  function getUserName(chave: string): string {
    const id = (config as any)[chave];
    if (!id) return "";
    const all = [...usuarios.gerentes, ...usuarios.diretores_admins, ...usuarios.admins_devs, ...usuarios.metal_aprovadores, ...usuarios.aprovadores_limpeza, ...usuarios.aprovadores_entrega_sem_pagamento, ...usuarios.todos_usuarios, ...usuarios.conversao_aprovadores, ...usuarios.precificacao_aprovadores, ...usuarios.devolucao_aprovadores];
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
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <ListaAprovadores
      config={config as unknown as Record<string, string>}
      usuarios={usuarios}
      podeEditar={podeEditar}
      saving={saving}
      saved={saved}
      onSave={salvar}
      onChange={onChange}
      toggleMulti={toggleMulti}
      getMultiNames={getMultiNames}
      getUserName={getUserName}
    />
  );
}
