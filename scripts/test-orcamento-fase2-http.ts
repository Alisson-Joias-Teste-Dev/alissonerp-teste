/**
 * Teste end-to-end FASE 2 (HTTP contra dev server local apontando pra staging DB).
 *
 * Pre-requisitos:
 *   - Dev server rodando em http://localhost:3000
 *   - .env.local com NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
 *   - Usuarios de teste em alissonerp.usuarios (admin@alisson.com etc)
 *
 * Roda: npx tsx scripts/test-orcamento-fase2-http.ts
 *
 * Limpa apos: DELETE de orcamentos criados com numero contendo "TST-".
 */
import postgres from "postgres";
import { readFileSync } from "fs";

try {
  const env = readFileSync(".env.local", "utf-8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, "").replace(/^["']|["']$/g, "");
  }
} catch { /* ignora */ }

const BASE = "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DB = process.env.DATABASE_URL!;
if (!SUPABASE_URL || !SUPABASE_ANON || !DB) {
  console.error("Env vars faltando");
  process.exit(1);
}

// Extrai project ref do URL (ex: https://api.alisson.api.br -> "api")
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const sql = postgres(DB, { max: 1, idle_timeout: 5 });

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: { id: string; email?: string };
}

async function login(email: string, password: string): Promise<{ session: Session; cookie: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login ${email} falhou: ${res.status} ${txt}`);
  }
  const session = await res.json() as Session;
  // Formato cookie do @supabase/ssr: base64-{base64(JSON.stringify(session))}
  // O session storage atual usa array [access_token, refresh_token, provider_token,
  // provider_refresh_token, user] ou objeto. Vou usar objeto que é o mais comum.
  const jsonStr = JSON.stringify(session);
  const cookieValue = "base64-" + Buffer.from(jsonStr).toString("base64");
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(cookieValue)}`;
  return { session, cookie };
}

interface HttpResult { status: number; json: Record<string, unknown> | unknown[] | null; text: string; }
async function api(method: string, path: string, cookie: string, body?: unknown): Promise<HttpResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: HttpResult["json"] = null;
  try { json = JSON.parse(text); } catch { /* texto nao-json */ }
  return { status: res.status, json, text };
}

const RESULTADOS: { nome: string; passou: boolean; detalhe: string }[] = [];
function teste(nome: string, passou: boolean, detalhe = "") {
  RESULTADOS.push({ nome, passou, detalhe });
  console.log(`${passou ? "✓" : "✗"} ${nome}${detalhe ? " — " + detalhe : ""}`);
}

async function cleanup() {
  const fichas = await sql`
    SELECT ficha_tecnica_id AS id FROM alissonerp.orcamentos
    WHERE nome_cliente LIKE 'HTTP-TEST%' AND ficha_tecnica_id IS NOT NULL
    UNION
    SELECT ficha_tecnica_2_id FROM alissonerp.orcamentos
    WHERE nome_cliente LIKE 'HTTP-TEST%' AND ficha_tecnica_2_id IS NOT NULL
  `;
  const ids = fichas.map(f => Number(f.id)).filter(Boolean);
  // Captura vendas geradas + libera as FKs reversas (orcamentos.venda_gerada_id
  // aponta pra venda; precisa anular antes de deletar a venda).
  const vendasGeradas = await sql`
    SELECT venda_gerada_id AS id FROM alissonerp.orcamentos
    WHERE nome_cliente LIKE 'HTTP-TEST%' AND venda_gerada_id IS NOT NULL
  `;
  const vendaIds = vendasGeradas.map(v => Number(v.id));
  await sql`UPDATE alissonerp.orcamentos SET venda_gerada_id = NULL WHERE nome_cliente LIKE 'HTTP-TEST%'`;
  if (vendaIds.length > 0) {
    await sql`DELETE FROM alissonerp.itens_venda_erp WHERE venda_id IN ${sql(vendaIds)}`;
    await sql`DELETE FROM alissonerp.vendas_erp WHERE id IN ${sql(vendaIds)}`;
  }
  await sql`DELETE FROM alissonerp.orcamentos WHERE nome_cliente LIKE 'HTTP-TEST%'`;
  if (ids.length > 0) {
    await sql`DELETE FROM alissonerp.orcamento_fichas_tecnicas WHERE id IN ${sql(ids)}`;
  }
}

async function pegarClienteValido(): Promise<number> {
  const [c] = await sql`SELECT id_contato FROM public.contatos LIMIT 1`;
  return Number(c.id_contato);
}

async function ficha(): Promise<Record<string, unknown>> {
  return {
    modelo: "Aliança HTTP",
    aro_numeracao: "Aro 14",
    largura: 5.0, espessura: 2.0, peso_estimado: 4.5,
    perfil: "Anatomica", diametro: 18.0,
    cor_metal: "Ouro Amarelo", densidade_ouro: 14.69,
    tipo_fonte: "Forma", texto: null,
    qtd_pedras: 0, tamanho_pedra: 0, tipo_pedra: null, tipo_aplicacao_pedra: null,
    has_friso: false, friso_kind: "friso",
    pedra_drill: false, pedra_meia_lua: false, pedra_volta_completa: false,
    pedras_detalhadas: [],
  };
}

async function rodarTestes() {
  console.log("=".repeat(70));
  console.log("FASE 2: TESTES HTTP (dev server + staging DB)");
  console.log("=".repeat(70));
  console.log(`BASE: ${BASE}`);
  console.log(`SUPABASE: ${SUPABASE_URL}`);
  console.log(`COOKIE NAME: ${COOKIE_NAME}`);
  console.log();

  await cleanup();
  const clienteId = await pegarClienteValido();

  // ────────────────────────────────────────────────────────────────────────
  // SETUP: login admin (+ consultora se disponivel)
  // ────────────────────────────────────────────────────────────────────────
  console.log("[SETUP] Login admin");
  const adminEmail = process.env.E2E_ADMIN_EMAIL || "alisson@alissonjoias.com.br";
  const adminPass = process.env.E2E_ADMIN_PASS || "";
  if (!adminPass) {
    console.error("Defina E2E_ADMIN_PASS (senha admin) antes de rodar");
    process.exit(1);
  }
  let admin: { session: Session; cookie: string };
  try {
    admin = await login(adminEmail, adminPass);
    console.log(`  admin: ${admin.session.user.email} (${admin.session.user.id})`);
  } catch (e) {
    console.error("Login admin falhou:", e);
    await sql.end();
    process.exit(1);
  }

  // Consultora — opcional. Sem ela, pula testes de role gating.
  let consultora: { session: Session; cookie: string } | null = null;
  if (process.env.E2E_CONSULTORA_EMAIL && process.env.E2E_CONSULTORA_PASS) {
    try {
      consultora = await login(process.env.E2E_CONSULTORA_EMAIL, process.env.E2E_CONSULTORA_PASS);
      console.log(`  consultora: ${consultora.session.user.email}`);
    } catch (e) {
      console.error("Login consultora falhou (testes de role gating serao pulados):", e);
    }
  } else {
    console.log("  consultora: NAO fornecida (E2E_CONSULTORA_EMAIL/PASS) — testes de role gating serao pulados");
  }

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO A: Health check + auth funcionando
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[A] Auth básico");

  const semAuth = await api("GET", "/api/orcamento", "");
  teste("A.1 GET /api/orcamento sem cookie -> 401", semAuth.status === 401, `status=${semAuth.status}`);

  const listAdmin = await api("GET", "/api/orcamento?limit=5", admin.cookie);
  teste("A.2 GET /api/orcamento como admin -> 200", listAdmin.status === 200, `status=${listAdmin.status}`);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO B: Validações backend (bugs #9, #10, #8 ondas anteriores)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[B] Validações backend");

  const semCliente = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "", cliente_id: null, tipo: "alianca",
  });
  teste("B.1 POST sem nome_cliente nem cliente_id -> 400",
    semCliente.status === 400, `status=${semCliente.status}`);

  const clienteFantasma = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-FK", cliente_id: 999999999, tipo: "alianca",
  });
  teste("B.2 POST com cliente_id inexistente -> 422",
    clienteFantasma.status === 422, `status=${clienteFantasma.status}`);

  const pesoAbsurdo = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-RANGE", cliente_id: clienteId, tipo: "alianca",
    peso: -50,
  });
  teste("B.3 POST com peso negativo -> 400",
    pesoAbsurdo.status === 400, `status=${pesoAbsurdo.status}`);

  const cotacaoNaN = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-NAN", cliente_id: clienteId, tipo: "alianca",
    cotacao_ouro: "abc",
  });
  teste("B.4 POST com cotacao_ouro='abc' -> 400",
    cotacaoNaN.status === 400, `status=${cotacaoNaN.status}`);

  const parSemFicha2 = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-PAR-INC", cliente_id: clienteId, tipo: "alianca",
    quantidade: 2, ficha: await ficha(),
    // ficha2 ausente
  });
  teste("B.5 POST par sem ficha2 -> 422",
    parSemFicha2.status === 422, `status=${parSemFicha2.status}`);

  // Bug #8: quantidade STRING "2" deve dar mesmo erro que number 2
  const parStringSemFicha2 = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-STR2", cliente_id: clienteId, tipo: "alianca",
    quantidade: "2", ficha: await ficha(),
  });
  teste("B.6 POST par com quantidade=\"2\" (string) sem ficha2 -> 422",
    parStringSemFicha2.status === 422, `status=${parStringSemFicha2.status}`);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO C: Role gating (bugs #1 e B7)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[C] Role gating");

  if (!consultora) {
    console.log("  (consultora não fornecida — pulando C.0-C.3)");
    teste("C.0-C.3 role gating", true, "PULADO sem consultora");
  } else {
    // Criar 1 orçamento como consultora pra usar nos testes
    const orcConsult = await api("POST", "/api/orcamento", consultora.cookie, {
      nome_cliente: "HTTP-TEST-CONSULT", cliente_id: clienteId, tipo: "alianca",
      valor: 5000, peso: 5, markup: 3.5, desconto_pct: 0,
      cotacao_ouro: 380, cotacao_dolar: 5.8, valor_ouro: 4000, valor_pedras: 0,
      quantidade: 1, ficha: await ficha(), valor_negociado_locked: true,
      snapshot: { valor: 5000, peso: 5, valor_ouro: 4000, valor_pedras: 0, markup: 3.5, desconto_pct: 0, cotacao_ouro: 380, cotacao_dolar: 5.8 },
    });
    teste("C.0 consultora cria seu orçamento -> 200",
      orcConsult.status === 200, `status=${orcConsult.status}`);
    const orcConsultId = (orcConsult.json as { orcamento?: { id: number } })?.orcamento?.id;

    // Consultora tenta APROVAR via PATCH (deve 403 — bug #1)
    if (orcConsultId) {
      const consultAprova = await api("PATCH", `/api/orcamento/${orcConsultId}`, consultora.cookie, {
        status: "aprovado",
      });
      teste("C.1 consultora aprovando próprio orçamento -> 403",
        consultAprova.status === 403, `status=${consultAprova.status}`);
    }

    // B7: consultora tenta passar desconto_pct alem do mx_desconto_permitido.
    const [consultRow] = await sql`SELECT mx_desconto_permitido FROM alissonerp.usuarios WHERE id = ${consultora.session.user.id}::uuid`;
    const maxDescConsult = Number(consultRow?.mx_desconto_permitido ?? 0);
    console.log(`  (mx_desconto_permitido consultora=${maxDescConsult}%)`);
    const descontoAbusivo = maxDescConsult + 30;
    const consultDescAbuso = await api("POST", "/api/orcamento", consultora.cookie, {
      nome_cliente: "HTTP-TEST-DESC-ABUSO", cliente_id: clienteId, tipo: "alianca",
      valor: 5000, peso: 5, markup: 3.5, desconto_pct: descontoAbusivo,
      cotacao_ouro: 380, cotacao_dolar: 5.8,
      quantidade: 1, ficha: await ficha(),
    });
    teste(`C.2 consultora com desconto_pct=${descontoAbusivo}% (limite=${maxDescConsult}%) -> 403`,
      consultDescAbuso.status === 403, `status=${consultDescAbuso.status}`);
  }

  // Admin SEMPRE pode passar do limite (esse não depende de consultora)
  const adminDescAlto = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-ADMIN-DESC", cliente_id: clienteId, tipo: "alianca",
    valor: 5000, peso: 5, markup: 3.5, desconto_pct: 99,
    cotacao_ouro: 380, cotacao_dolar: 5.8,
    quantidade: 1, ficha: await ficha(),
  });
  teste("C.3 admin com desconto_pct=99% -> 200 (admin não tem trava)",
    adminDescAlto.status === 200, `status=${adminDescAlto.status}`);

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO D: Snapshot lock + client_updated_at (bugs #5, B2, B4)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[D] Snapshot lock + optimistic lock");

  const criarLock = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-LOCK", cliente_id: clienteId, tipo: "alianca",
    valor: 7500, peso: 6, markup: 3.5, desconto_pct: 0,
    cotacao_ouro: 380, cotacao_dolar: 5.8, valor_ouro: 6000, valor_pedras: 1500,
    quantidade: 1, ficha: await ficha(), valor_negociado_locked: true,
    snapshot: { valor: 7500, peso: 6, valor_ouro: 6000, valor_pedras: 1500, markup: 3.5, desconto_pct: 0, cotacao_ouro: 380, cotacao_dolar: 5.8 },
  });
  teste("D.0 POST com snapshot+lock -> 200",
    criarLock.status === 200, `status=${criarLock.status}`);
  const orcLockId = (criarLock.json as { orcamento?: { id: number } })?.orcamento?.id;

  // Tenta destravar como ADMIN (deve permitir)
  if (orcLockId) {
    const adminDestrava = await api("PUT", `/api/orcamento/${orcLockId}`, admin.cookie, {
      valor_negociado_locked: false,
    });
    teste("D.1 admin destrava (lock=false) -> 200",
      adminDestrava.status === 200, `status=${adminDestrava.status}`);
    const [rowApos] = await sql`SELECT valor_negociado_locked FROM alissonerp.orcamentos WHERE id = ${orcLockId}`;
    teste("D.1b lock=false persistido",
      rowApos?.valor_negociado_locked === false,
      `lock=${rowApos?.valor_negociado_locked}`);

    // Re-travar
    await api("PUT", `/api/orcamento/${orcLockId}`, admin.cookie, { valor_negociado_locked: true });

    // Consultora tenta destravar (deve ignorar — preserva lock=true)
    if (consultora) {
      const consultDestrava = await api("PUT", `/api/orcamento/${orcLockId}`, consultora.cookie, {
        valor_negociado_locked: false,
      });
      const [rowAposConsult] = await sql`SELECT valor_negociado_locked FROM alissonerp.orcamentos WHERE id = ${orcLockId}`;
      teste("D.2 consultora tentando destravar -> lock permanece true",
        rowAposConsult?.valor_negociado_locked === true,
        `status=${consultDestrava.status}, lock=${rowAposConsult?.valor_negociado_locked}`);
    } else {
      teste("D.2 consultora tentando destravar", true, "PULADO sem consultora");
    }

    // Optimistic lock: client_updated_at desatualizado -> 409
    const rowAtual = await api("GET", `/api/orcamento/${orcLockId}`, admin.cookie);
    const updatedAtAtual = (rowAtual.json as { orcamento?: { updated_at?: string } })?.orcamento?.updated_at;
    // Força um update intermediário pra avançar updated_at
    await api("PUT", `/api/orcamento/${orcLockId}`, admin.cookie, { nome_cliente: "HTTP-TEST-LOCK-V2" });
    // Agora envia o updated_at velho
    const conflito = await api("PUT", `/api/orcamento/${orcLockId}`, admin.cookie, {
      nome_cliente: "HTTP-TEST-LOCK-V3",
      client_updated_at: updatedAtAtual,
    });
    teste("D.3 client_updated_at desatualizado -> 409",
      conflito.status === 409, `status=${conflito.status}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO E: Aprovação de par (bug #12)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[E] Aprovação de par");

  const f1 = await ficha();
  const f2 = { ...await ficha(), aro_numeracao: "Aro 12", peso_estimado: 3.8 };
  const criarPar = await api("POST", "/api/orcamento", admin.cookie, {
    nome_cliente: "HTTP-TEST-PAR", cliente_id: clienteId, tipo: "alianca",
    valor: 12000, peso: 8.3, markup: 3.5, desconto_pct: 0,
    cotacao_ouro: 380, cotacao_dolar: 5.8, valor_ouro: 10000, valor_pedras: 2000,
    quantidade: 2, ficha: f1, ficha2: f2,
    valor_negociado_locked: true,
    snapshot: { valor: 12000, peso: 8.3, valor_ouro: 10000, valor_pedras: 2000, markup: 3.5, desconto_pct: 0, cotacao_ouro: 380, cotacao_dolar: 5.8 },
  });
  teste("E.0 POST par com ficha1+ficha2 -> 200",
    criarPar.status === 200, `status=${criarPar.status}`);
  const orcParId = (criarPar.json as { orcamento?: { id: number } })?.orcamento?.id;

  if (orcParId) {
    const aprovar = await api("PATCH", `/api/orcamento/${orcParId}`, admin.cookie, {
      status: "aprovado",
    });
    teste("E.1 admin aprova par -> 200",
      aprovar.status === 200, `status=${aprovar.status}`);
    const vendaId = (aprovar.json as { venda_id?: number })?.venda_id;
    if (vendaId) {
      const [item] = await sql`
        SELECT quantidade, total_item, peso_estimado FROM alissonerp.itens_venda_erp
        WHERE venda_id = ${vendaId} LIMIT 1
      `;
      teste("E.2 item da venda criada tem quantidade=2 (não regride bug #12)",
        Number(item?.quantidade) === 2, `qty=${item?.quantidade}`);
      teste("E.3 item tem valor TOTAL do par (12000) e peso TOTAL (8.3)",
        Number(item?.total_item) === 12000 && Math.abs(Number(item?.peso_estimado) - 8.3) < 0.01,
        `total=${item?.total_item}, peso=${item?.peso_estimado}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // GRUPO F: Rota pública compartilhada — não vaza dados sensíveis (bug #7)
  // ────────────────────────────────────────────────────────────────────────
  console.log("\n[F] Rota pública não vaza dados sensíveis");
  // Pega uma venda existente (qualquer) com token
  const [vendaCompartilhada] = await sql`
    SELECT token_compartilhamento FROM alissonerp.vendas_erp
    WHERE token_compartilhamento IS NOT NULL AND situacao != 'cancelado'
    LIMIT 1
  `;
  if (vendaCompartilhada?.token_compartilhamento) {
    const pub = await api("GET", `/api/orcamento/compartilhado?token=${vendaCompartilhada.token_compartilhamento}`, "");
    if (pub.status === 200 && pub.json && typeof pub.json === "object") {
      const obj = pub.json as Record<string, unknown>;
      teste("F.1 rota pública NÃO retorna observacoes_internas",
        !("observacoes_internas" in obj));
      teste("F.2 rota pública NÃO retorna total_comissao",
        !("total_comissao" in obj));
      const itens = (obj.itens ?? []) as Record<string, unknown>[];
      const algumItemComComissao = itens.some(i => "pct_comissao" in i || "valor_comissao" in i);
      teste("F.3 itens NÃO têm pct_comissao nem valor_comissao",
        !algumItemComComissao);
    } else if (pub.status === 410) {
      console.log("  (venda compartilhada de teste expirada — pulando F.1-3)");
      teste("F.1 rota pública NÃO retorna observacoes_internas", true, "venda expirada, asserts puladas");
      teste("F.2 rota pública NÃO retorna total_comissao", true, "venda expirada, asserts puladas");
      teste("F.3 itens NÃO têm pct_comissao", true, "venda expirada, asserts puladas");
    } else {
      teste("F.1 rota pública responde 200", false, `status=${pub.status}`);
    }
  } else {
    console.log("  (sem venda com token_compartilhamento — pulando grupo F)");
  }

  // ────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────────────────────────────────────
  await cleanup();
  console.log("\n[CLEANUP] OK");

  // ────────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  const total = RESULTADOS.length;
  const passou = RESULTADOS.filter(r => r.passou).length;
  const falhou = total - passou;
  console.log(`RESUMO: ${passou}/${total} testes HTTP passaram (${falhou} falhas)`);
  if (falhou > 0) {
    console.log("\nFALHAS:");
    RESULTADOS.filter(r => !r.passou).forEach(r => console.log(`  ✗ ${r.nome} ${r.detalhe}`));
  }
  console.log("=".repeat(70));

  await sql.end();
  process.exit(falhou > 0 ? 1 : 0);
}

rodarTestes().catch(async e => {
  console.error("ERRO:", e);
  try { await cleanup(); } catch { /* */ }
  await sql.end().catch(() => null);
  process.exit(1);
});
