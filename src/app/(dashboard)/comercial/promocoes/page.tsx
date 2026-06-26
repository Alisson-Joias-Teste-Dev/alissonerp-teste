import { redirect } from "next/navigation";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import PromocoesClient from "./PromocoesClient";

export const metadata = { title: "Promocoes" };

export default async function PromocoesPage() {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    /**
     * REGRA DE NEGOCIO: a permissao de Promocoes deve usar a role real em
     * alissonerp.usuarios, nao o user_metadata do token Supabase.
     * O QUE: requireAuth centraliza sessao, usuario ativo e role do banco.
     * POR QUE: user_metadata pode ficar desatualizado e bloquear admin/diretor
     * mesmo com permissao correta no ERP.
     * IMPACTO SE ALTERADO: o menu pode aparecer pela permissao do banco, mas a
     * pagina SSR redirecionar indevidamente ao abrir o modulo.
     */
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    throw e;
  }

  const role = user.role;
  if (!(await temAcessoModulo(role, "promocoes", "ler"))) redirect("/");

  const podeEditar = await temAcessoModulo(role, "promocoes", "escrever");
  return <PromocoesClient podeEditar={podeEditar} />;
}
