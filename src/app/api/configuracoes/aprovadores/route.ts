// ═══════════════════════════════════════════════════════════════════════════
// API de Configuração de Aprovadores
//
// REGRA DE NEGÓCIO: cada tipo de aprovação tem um responsável configurável
// via tabela configuracoes_sistema. Só admin/desenvolvedor pode alterar.
// GET  → retorna config atual + lista de usuários elegíveis por role
// PUT  → atualiza os responsáveis
//
// Se alterar: sincronizar com as chaves usadas em:
//   - vendas-credito-aprovar.ts (aprovador_credito_diretor)
//   - aprovacao-regras.ts (aprovador_desconto, aprovador_cartao_desconto)
//   - solicitar-aprovacao/route.ts
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// Chaves de configuração dos aprovadores
// REGRA DE NEGÓCIO: aprovadora_credito_gerente já existia antes da refatoração.
// As outras 3 foram criadas junto com a separação dos campos de aprovação.
const CHAVES = [
  "aprovador_credito_diretor",
  "aprovador_desconto_padrao",
  "aprovador_cartao_desconto_padrao",
  "aprovadora_credito_gerente",
  "aprovador_compra_comercial",
  "metal_aprovador_id",
  "aprovador_limpeza",
] as const;

// GET /api/configuracoes/aprovadores
// Retorna a config atual + lista de usuários elegíveis por role
export async function GET() {
  try {
    // Ler valores atuais — busca TODAS as chaves, incluindo a já existente
    const configs = await sql`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave = ANY(${CHAVES})
    `;
    const configMap = new Map(configs.map((r: any) => [r.chave, r.valor]));

    // Listar usuários elegíveis
    const gerentes = await sql`
      SELECT id, nome FROM alissonerp.usuarios
      WHERE role = 'gerente_loja' AND ativo = true ORDER BY nome
    `;
    const diretoresAdmins = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('diretor', 'admin', 'desenvolvedor') AND ativo = true
      ORDER BY CASE role WHEN 'diretor' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, nome
    `;
    const adminsDevs = await sql`
      SELECT id, nome FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor') AND ativo = true ORDER BY nome
    `;
    const aprovadoresMetal = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor', 'gerente_fabrica', 'gerente_loja')
        AND ativo = true
      ORDER BY
        CASE role
          WHEN 'admin' THEN 1
          WHEN 'desenvolvedor' THEN 2
          WHEN 'gerente_fabrica' THEN 3
          WHEN 'gerente_loja' THEN 4
          ELSE 9
        END,
        nome
    `;
    const aprovadoresLimpeza = await sql`
      SELECT id, nome, role FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor', 'gerente_fabrica', 'gerente_loja')
        AND ativo = true
      ORDER BY nome
    `;

    return NextResponse.json({
      aprovador_credito_diretor: configMap.get("aprovador_credito_diretor") ?? "",
      aprovador_desconto_padrao: configMap.get("aprovador_desconto_padrao") ?? "",
      aprovador_cartao_desconto_padrao: configMap.get("aprovador_cartao_desconto_padrao") ?? "",
      aprovadora_credito_gerente: configMap.get("aprovadora_credito_gerente") ?? "",
      aprovador_compra_comercial: configMap.get("aprovador_compra_comercial") ?? "",
      metal_aprovador_id: configMap.get("metal_aprovador_id") ?? "",
      aprovador_limpeza: configMap.get("aprovador_limpeza") ?? "",
      usuarios: {
        gerentes,
        diretores_admins: diretoresAdmins,
        admins_devs: adminsDevs,
        metal_aprovadores: aprovadoresMetal,
        aprovadores_limpeza: aprovadoresLimpeza,
      },
    });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT /api/configuracoes/aprovadores
// Atualiza a configuração dos aprovadores (só admin/dev)
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!isFullAccess(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    const body = await req.json() as Record<string, string>;

    const updates: { chave: string; valor: string }[] = [];
    if (body.aprovador_credito_diretor !== undefined) {
      updates.push({ chave: "aprovador_credito_diretor", valor: body.aprovador_credito_diretor });
    }
    if (body.aprovador_desconto_padrao !== undefined) {
      updates.push({ chave: "aprovador_desconto_padrao", valor: body.aprovador_desconto_padrao });
    }
    if (body.aprovador_cartao_desconto_padrao !== undefined) {
      updates.push({ chave: "aprovador_cartao_desconto_padrao", valor: body.aprovador_cartao_desconto_padrao });
    }
    if (body.aprovadora_credito_gerente !== undefined) {
      updates.push({ chave: "aprovadora_credito_gerente", valor: body.aprovadora_credito_gerente });
    }
    if (body.aprovador_compra_comercial !== undefined) {
      updates.push({ chave: "aprovador_compra_comercial", valor: body.aprovador_compra_comercial });
    }
    if (body.metal_aprovador_id !== undefined) {
      updates.push({ chave: "metal_aprovador_id", valor: body.metal_aprovador_id });
    }
    /**
     * REGRA DE NEGÓCIO: aprovador da limpeza de metal (sangria) precisa ser
     * persistido em configuracoes_sistema para liberar o fluxo
     * recebido -> em_limpeza -> aguardando_aprovacao -> concluido.
     *
     * O QUE: grava a chave `aprovador_limpeza` quando enviada pelo front.
     * POR QUE: as APIs de limpeza/aprovação validam essa chave antes de
     * permitir iniciar/concluir/aprovar.
     * IMPACTO SE REMOVIDO: UI aparenta salvar, mas backend continua acusando
     * "Aprovador de limpeza não configurado" (erro 409).
     */
    if (body.aprovador_limpeza !== undefined) {
      updates.push({ chave: "aprovador_limpeza", valor: body.aprovador_limpeza });
    }

    for (const u of updates) {
      await sql`
        INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
        VALUES (${u.chave}, ${u.valor})
        ON CONFLICT (chave) DO UPDATE SET valor = ${u.valor}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
