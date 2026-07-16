/**
 * POST /api/entregas-venda/frete-avulso
 *
 * Cria um frete avulso — corrida de motoboy sem venda vinculada.
 *
 * REGRA DE NEGÓCIO: avulso não tem itens, não tem código de verificação
 * e não dispara WhatsApp. Motoboy e frete_cobrado são obrigatórios.
 * O motoboy confirma a corrida pelo app com um botão simples.
 * O valor do frete entra normalmente no acerto financeiro do motoboy.
 *
 * IMPACTO SE ALTERADO: não contornar com INSERT direto — usar criarFreteAvulso()
 * para garantir geração do codigo_entrega e auditoria.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { criarFreteAvulso, calcularValorMotoboy } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { AuthError, ForbiddenError, type AuthUser } from "@/lib/auth-server";

// REGRA DE NEGÓCIO (migration 346): "estoquista" cria avulso já liberado,
// igual admin/gerente — não passa pelo fluxo de solicitação/liberação.
const ROLES_LOJA = ["desenvolvedor", "admin", "gerente_loja", "consultora", "estoquista"];

const FreteAvulsoSchema = z.object({
  // REGRA DE NEGÓCIO (pool de motoboy — patch A2): motoboyId é OPCIONAL na
  // criação pela loja. Consultora solicita SEM escolher motoboy (cai no pool,
  // ver enderecoEntrega/vendaId abaixo); admin/gerente/estoquista também
  // podem criar direto sem motoboy (nasce 'pendente' sem dono, pool). Quando
  // informado, a corrida já nasce com dono.
  motoboyId: z.string().uuid("motoboyId deve ser um UUID válido").optional(),
  regiao: z.enum(["fortaleza", "fora_fortaleza", "longe", "correios"]),
  freteCobrado: z.number().nonnegative("freteCobrado não pode ser negativo"),
  freteMotoboyOverride: z.number().positive().optional(),
  descricaoAvulso: z.string().min(1, "Descrição da corrida é obrigatória").max(500),
  contatoId: z.number().int().positive().optional(),
  observacoes: z.string().max(2000).optional(),
  // REGRA DE NEGÓCIO (solicitação da consultora — migration 346, modelo POOL):
  // campos só usados quando quem cria é a consultora (vira modoSolicitacao=true
  // na lib). Não existe mais escolha de responsável — a solicitação cai no
  // pool de liberadores (ver listarAprovadoresFreteAvulso em @/lib/entrega-venda).
  vendaId: z.number().int().positive().optional(),
  enderecoEntrega: z.string().max(1000).optional(),
});

// REGRA DE NEGÓCIO: o entregador registra a PRÓPRIA corrida pelo app.
// Só escolhe descrição + região; o valor é FIXO pela tabela (não digita),
// motoboy_id é forçado como ele mesmo e a corrida nasce PENDENTE de
// confirmação da loja. Regiões com valor 0 (longe/correios) não são
// oferecidas ao motoboy — só as com valor fixo na tabela.
const FreteAvulsoMotoboySchema = z.object({
  regiao: z.enum(["fortaleza", "fora_fortaleza"]),
  descricaoAvulso: z.string().min(1, "Descrição da corrida é obrigatória").max(500),
  observacoes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const role = usuario?.role as string | undefined;
  const ehEntregador = role === "entregador";
  if (!role || (!ehEntregador && !ROLES_LOJA.includes(role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  // Entregador registra a própria corrida: valor fixo pela tabela, sem cobrança
  // de cliente (frete_cobrado = frete_motoboy → não mexe no saldo da gerente),
  // motoboy_id forçado como ele mesmo, nasce pendente.
  if (ehEntregador) {
    const parsed = FreteAvulsoMotoboySchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const { regiao, descricaoAvulso, observacoes } = parsed.data;
    const valor = calcularValorMotoboy(regiao);
    try {
      const avulso = await criarFreteAvulso(
        { motoboyId: user.id, regiao, freteCobrado: valor, descricaoAvulso, observacoes },
        user.id,
      );
      return NextResponse.json({ avulso });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao registrar corrida";
      console.error("[frete-avulso/motoboy] Erro:", err);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const parsed = FreteAvulsoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  // REGRA DE NEGÓCIO (migration 346, modelo POOL): consultora não libera
  // custo de frete sozinha — ela apenas SOLICITA, a partir de uma venda
  // própria, com o endereço de entrega. NÃO escolhe mais um responsável: o
  // avulso nasce 'solicitada' (criarFreteAvulso com modoSolicitacao=true) e
  // cai no pool de liberadores (qualquer um decide); só entra no saldo da
  // gerente quando liberado.
  // IMPACTO SE REMOVIDO: consultora criaria avulso já 'pendente' (liberado),
  // assumindo custo de frete sem controle de nenhum liberador.
  const ehConsultora = role === "consultora";
  if (ehConsultora) {
    if (!parsed.data.vendaId || !parsed.data.enderecoEntrega) {
      return NextResponse.json(
        { error: "Venda e endereço de entrega são obrigatórios para solicitar frete avulso" },
        { status: 400 },
      );
    }
    // REGRA DE NEGÓCIO: consultora só solicita frete das PRÓPRIAS vendas —
    // reusa requireVendaOwnership (mesma checagem usada em /api/vendas) para
    // não duplicar a regra de ownership por vendedor_id.
    // IMPACTO SE REMOVIDO: reabre IDOR — consultora solicitaria frete em
    // nome de venda de colega, gerando custo de frete indevido para a loja.
    const authUser: AuthUser = { id: user.id, role, email: user.email ?? "" };
    try {
      await requireVendaOwnership(authUser, parsed.data.vendaId);
    } catch (e) {
      if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
      throw e;
    }
  }

  try {
    const avulso = await criarFreteAvulso(
      { ...parsed.data, modoSolicitacao: ehConsultora },
      user.id,
    );
    return NextResponse.json({ avulso });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    const message = err instanceof Error ? err.message : "Erro ao criar frete avulso";
    console.error("[frete-avulso] Erro:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
