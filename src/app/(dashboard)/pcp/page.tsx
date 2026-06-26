import RotaFabricacaoClient from "@/app/(dashboard)/rota-fabricacao/RotaFabricacaoClient";

export const dynamic = "force-dynamic";

// /pcp fundido com /rota-fabricacao — agora é um Kanban único por SETORES.
// Ordens chegam em "Novas Ordens" (coluna inicial). Gerente clica em "Definir
// Rota" no card pra mapear os setores do produto, e o sistema distribui
// automaticamente. Cada setor tem colaboradores atrelados que executam.
//
// O componente lê do GET /api/rota-fabricacao que já filtra:
//   - OFs ativas (etapas_cod NOT IN concluido/cancelado)
//   - Exclui OFs que estão no service interno
//   - Exclui transferências do tipo service
//
// Filtros por role/depósito do PCP antigo serão portados pra API quando
// necessário (hoje todos os depósitos vêem tudo via /rota-fabricacao).
export default function PcpPage() {
  return <RotaFabricacaoClient />;
}
