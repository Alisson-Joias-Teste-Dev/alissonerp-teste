import { redirect } from "next/navigation";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import PromocaoDetalheClient from "./PromocaoDetalheClient";

export const metadata = { title: "Promocao" };

export default async function PromocaoDetalhePage({
  params,
}: { params: Promise<{ id: string }> }) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    /**
     * REGRA DE NEGOCIO: detalhe de Promocoes deve respeitar a mesma fonte de
     * verdade da listagem e APIs, que e alissonerp.usuarios.
     * O QUE: requireAuth valida sessao e retorna a role atual do banco.
     * POR QUE: user_metadata do Supabase pode ficar antigo apos mudanca de role.
     * IMPACTO SE ALTERADO: usuarios autorizados podem ser jogados para o inicio
     * ao abrir uma campanha, mesmo tendo permissao no modulo.
     */
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) redirect("/login");
    throw e;
  }

  const role = user.role;
  if (!(await temAcessoModulo(role, "promocoes", "ler"))) redirect("/");

  const podeEditar = await temAcessoModulo(role, "promocoes", "escrever");
  const { id } = await params;
  return <PromocaoDetalheClient id={Number(id)} podeEditar={podeEditar} />;
}
