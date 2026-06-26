import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import { isFullAccess } from "@/lib/roles";
import {
  VISIBILIDADE_DEFAULT,
  TODOS_VISIVEIS,
  getCamposVisiveis,
  type ProdutoVisibilidadeConfig,
} from "@/lib/produto-visibilidade";
import sql from "@/lib/db";
import ProdutosClient from "./ProdutosClient";

export const metadata = { title: "Produtos" };

export default async function ProdutosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;

  if (!(await temAcessoModulo(role ?? "", "produtos", "ler"))) redirect("/");

  const podeEditar = await temAcessoModulo(role ?? "", "produtos", "escrever");

  // Admins veem tudo — não precisa buscar config
  if (isFullAccess(role ?? "")) {
    return <ProdutosClient podeEditar={podeEditar} role={role ?? ""} camposVisiveis={TODOS_VISIVEIS} />;
  }

  // Busca config do banco (fallback para defaults se não encontrar)
  let config: ProdutoVisibilidadeConfig = VISIBILIDADE_DEFAULT;
  try {
    const rows = await sql<{ valor: string }[]>`
      SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'produto_visibilidade'
    `;
    if (rows.length > 0) {
      config = { ...VISIBILIDADE_DEFAULT, ...JSON.parse(rows[0].valor) };
    }
  } catch {
    // fallback para defaults
  }

  const camposVisiveis = getCamposVisiveis(role ?? "", config);

  return <ProdutosClient podeEditar={podeEditar} role={role ?? ""} camposVisiveis={camposVisiveis} />;
}
