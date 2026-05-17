/**
 * Schemas Zod reutilizaveis para validacao de entrada em API routes.
 *
 * Centraliza tipos comuns (id, money, weight, date) para que rotas usem o
 * mesmo padrao e o ajuste seja feito em um lugar so.
 *
 * Padrao de uso em rota nova com defineRoute (preferido):
 *
 *   import { defineRoute } from "@/lib/api-handler";
 *   import { z } from "zod";
 *   import { IdSchema, MoneySchema } from "@/lib/schemas/common";
 *
 *   const Input = z.object({
 *     cliente_id: IdSchema,
 *     valor: MoneySchema,
 *   });
 *
 *   export const POST = defineRoute({
 *     requireRoles: ["admin"],
 *     inputSchema: Input,
 *     handler: async (_req, { user, body }) => { ... },
 *   });
 *
 * Padrao para rota legada (mais comum nesta onda — menos invasivo):
 *
 *   const schema = z.object({ ... });
 *   const raw = await req.json().catch(() => ({}));
 *   const parsed = schema.safeParse(raw);
 *   if (!parsed.success) {
 *     return NextResponse.json(
 *       { error: "Dados invalidos", issues: parsed.error.issues },
 *       { status: 400 },
 *     );
 *   }
 *   const body = parsed.data;
 *
 * REGRA: schemas devem aceitar TUDO que a rota ja aceita hoje. Em duvida,
 * usar .optional() / .nullable() — bloquear chamadas legitimas eh pior que
 * aceitar campos extras (z.object passa por strict = false por default).
 */
import { z } from "zod";

/** ID numerico positivo. Use para FKs (cliente_id, produto_id, etc). */
export const IdSchema = z.coerce.number().int().positive();

/** UUID v4 (ex: user.id do Supabase Auth). */
export const UuidSchema = z.string().uuid();

/**
 * Data ISO no formato YYYY-MM-DD (ou com timestamp).
 * Aceita "2026-01-15" e "2026-01-15T10:30:00Z".
 */
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

/** Valor monetario (>= 0, max 2 casas decimais). */
export const MoneySchema = z.number().nonnegative();

/** Peso em gramas (>= 0, 3 casas decimais para precisao de ourivesaria). */
export const WeightSchema = z.number().nonnegative();

/** Percentual entre 0 e 100. */
export const PercentSchema = z.number().min(0).max(100);

/** Quantidade inteira (>= 1). Use para itens de venda, ordens, etc. */
export const QuantitySchema = z.number().int().min(1);

/** Paginacao padrao via query params (coerce — vem como string). */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Faixa de datas para filtros de relatorio. */
export const DateRangeSchema = z.object({
  inicio: DateSchema,
  fim: DateSchema,
});

/**
 * Helper para responder 400 padronizado a partir de SafeParseError.
 * Use quando nao quiser depender do defineRoute.
 *
 *   const parsed = schema.safeParse(raw);
 *   if (!parsed.success) return zodError(parsed.error);
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function zodError(error: ZodError, status = 400): NextResponse {
  return NextResponse.json(
    {
      error: "Dados invalidos",
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    { status },
  );
}
