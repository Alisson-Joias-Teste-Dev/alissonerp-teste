/**
 * GET /api/entregas-venda/motoboys
 * POST /api/entregas-venda/motoboys
 *
 * Gerencia o cadastro de motoboys (entregadores próprios e terceirizados).
 *
 * GET — Lista motoboys: ativos (padrão) ou todos (?todos=true).
 *   Inclui e-mail do usuário vinculado (auth.users → usuarios).
 *   Usado pelo frontend para popular selects e tela de gestão.
 *
 * POST — Cadastra um novo motoboy com acesso ao app (auth.user + email/senha).
 *   Restrito a admin, gerente_loja e desenvolvedor.
 *
 * REGRA DE NEGÓCIO: cada motoboy vira um usuário do sistema com role='motoboy'
 * para acessar o futuro app de entregas. Email e senha são obrigatórios.
 * Motoboys inativos não aparecem por padrão.
 *
 * IMPACTO SE ALTERADO: a lista de motoboys alimenta o select de entregador
 * no formulário de criação de entrega. O app do motoboy depende do auth.user.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

// Schema para criação de motoboy
// REGRA DE NEGÓCIO: nome, email, senha, telefone e CPF são obrigatórios.
// Endereço em campos individuais (rua, número, bairro, cidade, UF) para
// roteirização no app de entregas. CEP, complemento e placa são opcionais.
const CriarMotoboySchema = z.object({
  nome: z.string().min(1, "Nome completo é obrigatório").max(200),
  email: z.string().email("Email inválido").min(1, "Email é obrigatório"),
  senha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  telefone: z.string().min(1, "Telefone é obrigatório").max(30),
  cpf: z.string().min(1, "CPF é obrigatório").max(14),
  rua: z.string().min(1, "Rua é obrigatória").max(300),
  numero: z.string().min(1, "Número é obrigatório").max(20),
  bairro: z.string().min(1, "Bairro é obrigatório").max(200),
  cidade: z.string().min(1, "Cidade é obrigatória").max(200),
  uf: z.string().length(2, "UF deve ter 2 caracteres (ex: CE)"),
  cep: z.string().max(10).optional(),
  complemento: z.string().max(200).optional(),
  placa: z.string().max(20).optional(),
});

// ─── GET /api/entregas-venda/motoboys ────────────────────────────────────────
// REGRA DE NEGÓCIO: retorna motoboys ativos por padrão. Com ?todos=true,
// retorna inclusive inativos para a tela de gestão. Inclui email do
// alissonerp.usuarios (preenchido automaticamente pelo trigger de auth).
// IMPACTO SE ALTERADO: se o filtro ativo=true padrão for removido, motoboys
// desligados aparecem no select de entrega e podem ser selecionados por erro.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Verifica se o usuário existe no ERP
  const [usuario] = await sql`
    SELECT id, role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = new URL(req.url);
  const mostrarTodos = url.searchParams.get("todos") === "true";

  // REGRA DE NEGÓCIO: admin/gerente/dev podem ver todos; consultora vê só ativos
  // para não poluir o select de entrega.
  const rolesGestao = ["desenvolvedor", "admin", "gerente_loja"];
  const podeVerTodos = mostrarTodos && rolesGestao.includes(usuario.role as string);

  const motoboys = await sql`
    SELECT
      m.id, m.user_id, m.nome, m.telefone, m.cpf,
      m.rua, m.numero, m.bairro, m.cidade, m.uf, m.cep, m.complemento,
      m.placa, m.ativo, m.created_at,
      u.email
    FROM alissonerp.motoboys m
    LEFT JOIN alissonerp.usuarios u ON u.id = m.user_id
    ${podeVerTodos ? sql`` : sql`WHERE m.ativo = true`}
    ORDER BY m.ativo DESC, m.nome ASC
  `;

  return NextResponse.json(
    motoboys.map((m) => ({
      id: Number(m.id),
      user_id: m.user_id ? String(m.user_id) : null,
      nome: m.nome,
      email: m.email ?? null,
      telefone: m.telefone ?? null,
      cpf: m.cpf ?? null,
      rua: m.rua ?? null,
      numero: m.numero ?? null,
      bairro: m.bairro ?? null,
      cidade: m.cidade ?? null,
      uf: m.uf ?? null,
      cep: m.cep ?? null,
      complemento: m.complemento ?? null,
      placa: m.placa ?? null,
      ativo: Boolean(m.ativo),
      created_at: m.created_at,
    })),
  );
}

// ─── POST /api/entregas-venda/motoboys ───────────────────────────────────────
// REGRA DE NEGÓCIO: apenas admin, gerente_loja e desenvolvedor podem cadastrar
// motoboys. Cria um auth.user com role='motoboy' (para acesso ao app) e um
// registro em motoboys (para logística). O trigger fn_handle_new_user()
// cria automaticamente o registro em usuarios.
// IMPACTO SE ALTERADO: remover a restrição de role permite criação indevida;
// remover a criação do auth.user quebra o app do motoboy.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Roles permitidas para cadastrar motoboy
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (
    !usuario ||
    !["desenvolvedor", "admin", "gerente_loja"].includes(usuario.role as string)
  ) {
    return NextResponse.json({ error: "Sem permissão para cadastrar motoboys" }, { status: 403 });
  }

  // Validação do body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = CriarMotoboySchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { nome, email, senha, telefone, cpf, rua, numero, bairro, cidade, uf, cep, complemento, placa } = parsed.data;

  // REGRA DE NEGÓCIO: cria o auth.user primeiro (o trigger auto-cria o
  // usuario). Se o e-mail já existir, o Supabase retorna erro.
  // A role='motoboy' vai no user_metadata para o trigger setar em usuarios.
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      { error: "Serviço de autenticação não configurado" },
      { status: 500 },
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let novoUserId: string;

  try {
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true, // Não precisa confirmar e-mail
        user_metadata: { nome, role: "entregador" },
      });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("duplicate") || msg.includes("exists")) {
        return NextResponse.json(
          { error: `E-mail "${email}" já está cadastrado no sistema.` },
          { status: 409 },
        );
      }
      console.error("[entregas-venda/motoboys] Erro ao criar auth.user:", authError);
      return NextResponse.json(
        { error: `Erro ao criar usuário: ${authError.message}` },
        { status: 500 },
      );
    }

    if (!authUser?.user?.id) {
      return NextResponse.json(
        { error: "Usuário criado mas ID não retornado pelo Supabase." },
        { status: 500 },
      );
    }

    novoUserId = authUser.user.id;
  } catch (err) {
    console.error("[entregas-venda/motoboys] Exceção ao criar auth.user:", err);
    return NextResponse.json(
      { error: "Erro ao conectar com serviço de autenticação." },
      { status: 500 },
    );
  }

  // REGRA DE NEGÓCIO: insere o motoboy vinculado ao auth.user recém-criado.
  // O trigger fn_handle_new_user já criou o registro em usuarios com role='motoboy'.
  try {
    const [novo] = await sql`
      INSERT INTO alissonerp.motoboys (
        user_id, nome, telefone, cpf,
        rua, numero, bairro, cidade, uf, cep, complemento,
        placa, ativo
      ) VALUES (
        ${novoUserId}::uuid,
        ${nome},
        ${telefone},
        ${cpf},
        ${rua},
        ${numero},
        ${bairro},
        ${cidade},
        ${uf.toUpperCase()},
        ${cep ?? null},
        ${complemento ?? null},
        ${placa ?? null},
        true
      )
      RETURNING *
    `;

    return NextResponse.json(
      {
        id: Number(novo.id),
        user_id: novo.user_id ? String(novo.user_id) : null,
        nome: novo.nome,
        email,
        telefone: novo.telefone ?? null,
        cpf: novo.cpf ?? null,
        rua: novo.rua ?? null,
        numero: novo.numero ?? null,
        bairro: novo.bairro ?? null,
        cidade: novo.cidade ?? null,
        uf: novo.uf ?? null,
        cep: novo.cep ?? null,
        complemento: novo.complemento ?? null,
        placa: novo.placa ?? null,
        ativo: Boolean(novo.ativo),
        created_at: novo.created_at,
      },
      { status: 201 },
    );
  } catch (err) {
    // REGRA DE NEGÓCIO: se a inserção no motoboys falhar, tenta
    // limpar o auth.user criado para não deixar órfão.
    const message = err instanceof Error ? err.message : "Erro ao cadastrar motoboy";
    console.error("[entregas-venda/motoboys] Erro ao criar motoboy, removendo auth.user:", err);
    try {
      await supabaseAdmin.auth.admin.deleteUser(novoUserId!);
    } catch {
      // best-effort cleanup
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
