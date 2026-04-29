import { type ZodType, type ZodIssue } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError, ForbiddenError, type AuthUser } from "@/lib/auth-server";

interface DefineRouteOpts<TInput> {
  requireRoles?: string[];
  inputSchema?: ZodType<TInput>;
  handler: (
    req: NextRequest,
    ctx: { user: AuthUser; body: TInput; params?: Record<string, string> },
  ) => Promise<NextResponse | Response>;
}

export function defineRoute<TInput = unknown>(opts: DefineRouteOpts<TInput>) {
  return async (
    req: NextRequest,
    ctx?: { params?: Promise<Record<string, string>> },
  ) => {
    try {
      const user = await requireAuth(req);

      if (opts.requireRoles && !opts.requireRoles.includes(user.role)) {
        throw new ForbiddenError();
      }

      let body = undefined as TInput;
      if (opts.inputSchema) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          raw = {};
        }
        const parsed = opts.inputSchema.safeParse(raw);
        if (!parsed.success) {
          return NextResponse.json(
            {
              error: "Dados inválidos",
              issues: parsed.error.issues as ZodIssue[],
            },
            { status: 400 },
          );
        }
        body = parsed.data;
      }

      const params = ctx?.params ? await ctx.params : undefined;
      return await opts.handler(req, { user, body, params });
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: 401 });
      }
      if (e instanceof ForbiddenError) {
        return NextResponse.json({ error: e.message }, { status: 403 });
      }
      console.error("[defineRoute] erro:", e);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
  };
}
