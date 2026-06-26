/**
 * PUT /api/entregas-venda/motoboys/[id]
 *
 * REGRA DE NEGÓCIO: permite editar dados do motoboy (nome, telefone, veículo,
 * placa, ativo/inativo). Restrito a admin, gerente_loja e desenvolvedor.
 * O e-mail NÃO é editável por aqui — pertence ao auth.user e exigiria
 * confirmação de e-mail. Se precisar trocar, deleta e recria o motoboy.
 *
 * O QUE: atualiza campos no registro alissonerp.motoboys. Se ativo=false,
 * o motoboy some do select de novas entregas mas histórico permanece.
 *
 * IMPACTO SE ALTERADO: desativar motoboy com entregas em andamento não
 * bloqueia as entregas já atribuídas — apenas impede novas atribuições.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const AtualizarMotoboySchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  telefone: z.string().max(30).optional(),
  cpf: z.string().max(14).optional(),
  rua: z.string().max(300).optional(),
  numero: z.string().max(20).optional(),
  bairro: z.string().max(200).optional(),
  cidade: z.string().max(200).optional(),
  uf: z.string().length(2).optional(),
  cep: z.string().max(10).optional(),
  complemento: z.string().max(200).optional(),
  placa: z.string().max(20).optional(),
  ativo: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const motoboyId = Number(id);
  if (isNaN(motoboyId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (
    !usuario ||
    !["desenvolvedor", "admin", "gerente_loja"].includes(usuario.role as string)
  ) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = AtualizarMotoboySchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const updates = parsed.data;

  // Verifica se o motoboy existe
  const [existente] = await sql`
    SELECT id FROM alissonerp.motoboys WHERE id = ${motoboyId} LIMIT 1
  `;
  if (!existente) {
    return NextResponse.json({ error: "Motoboy não encontrado" }, { status: 404 });
  }

  // Monta SET dinâmico apenas com campos enviados
  const sets: string[] = [];
  const vals: (string | boolean | number)[] = [];

  if (updates.nome !== undefined) {
    sets.push("nome = $");
    vals.push(updates.nome);
  }
  if (updates.telefone !== undefined) {
    sets.push("telefone = $");
    vals.push(updates.telefone);
  }
  if (updates.cpf !== undefined) {
    sets.push("cpf = $");
    vals.push(updates.cpf);
  }
  if (updates.rua !== undefined) {
    sets.push("rua = $");
    vals.push(updates.rua);
  }
  if (updates.numero !== undefined) {
    sets.push("numero = $");
    vals.push(updates.numero);
  }
  if (updates.bairro !== undefined) {
    sets.push("bairro = $");
    vals.push(updates.bairro);
  }
  if (updates.cidade !== undefined) {
    sets.push("cidade = $");
    vals.push(updates.cidade);
  }
  if (updates.uf !== undefined) {
    sets.push("uf = $");
    vals.push(updates.uf);
  }
  if (updates.cep !== undefined) {
    sets.push("cep = $");
    vals.push(updates.cep);
  }
  if (updates.complemento !== undefined) {
    sets.push("complemento = $");
    vals.push(updates.complemento);
  }
  if (updates.placa !== undefined) {
    sets.push("placa = $");
    vals.push(updates.placa);
  }
  if (updates.ativo !== undefined) {
    sets.push("ativo = $");
    vals.push(updates.ativo);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  vals.push(motoboyId);
  const query = `UPDATE alissonerp.motoboys SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`;

  try {
    const [atualizado] = await sql.unsafe(query, vals);

    return NextResponse.json({
      id: Number(atualizado.id),
      user_id: atualizado.user_id ? String(atualizado.user_id) : null,
      nome: atualizado.nome,
      telefone: atualizado.telefone ?? null,
      cpf: atualizado.cpf ?? null,
      rua: atualizado.rua ?? null,
      numero: atualizado.numero ?? null,
      bairro: atualizado.bairro ?? null,
      cidade: atualizado.cidade ?? null,
      uf: atualizado.uf ?? null,
      cep: atualizado.cep ?? null,
      complemento: atualizado.complemento ?? null,
      placa: atualizado.placa ?? null,
      ativo: Boolean(atualizado.ativo),
      created_at: atualizado.created_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar motoboy";
    console.error("[entregas-venda/motoboys] Erro ao atualizar:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
