import { redirect } from "next/navigation";

// /rota-fabricacao foi fundido com /pcp — manter o redirect pra não quebrar
// bookmarks ou links antigos. O componente RotaFabricacaoClient continua
// existindo (renderizado por /pcp).
export default function RotaFabricacaoRedirect() {
  redirect("/pcp");
}
