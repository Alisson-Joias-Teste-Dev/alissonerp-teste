import { redirect } from "next/navigation";

export default function Page() {
  redirect("/configuracoes?tab=tipos_servico");
}
