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

  // ── Estrangulamento pela tela ────────────────────────────────────────────
  // Com PRODUTOS_NO_V2=1, esta pagina passa a mostrar a TELA do V2 dentro de um
  // iframe, mantendo o menu e o cabecalho do V1 em volta. Sem a variavel nada
  // muda e a tela antiga continua — e esse o caminho de volta, sem mexer em
  // codigo.
  //
  // 🔴 A permissao ja foi conferida acima (produtos.ler / .escrever). O iframe
  // NAO herda sessao: quem autentica do outro lado e a ponte do Supabase no
  // back do V2. Sem SUPABASE_JWT_SECRET la, esta tela pede login de novo.
  //
  // O ?embutido=1 faz o V2 esconder o menu dele (src/layout/embutido.ts no
  // erp_front) — sem isso aparecem dois menus, um dentro do outro.
  if (process.env.PRODUTOS_NO_V2 === "1") {
    const urlV2 = process.env.URL_FRONT_V2 ?? "https://homolog.alisson.api.br";
    return (
      <iframe
        src={`${urlV2}/produtos?embutido=1`}
        title="Produtos (V2)"
        style={{ width: "100%", height: "calc(100vh - 120px)", border: 0 }}
      />
    );
  }

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
