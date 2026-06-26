// Smoke test do helper auth-vendas (onda 1D) — sem dependencia de vitest.
// Roda com: node scripts/test-onda-1d.mjs
//
// Cobre a logica de gate (full vs scoped), sem tocar DB. As funcoes async
// que rodam SQL sao reimplementadas como mocks aqui para isolar o teste.

import test from "node:test";
import assert from "node:assert/strict";

// Reimplementa isVendasFullAccess inline (mantem sincronizado com src/lib/auth-vendas.ts).
const ROLES_VENDAS_FULL = ["admin", "desenvolvedor", "diretor", "gerente_loja", "gerente_fabrica"];
function isVendasFullAccess(role) {
  return ROLES_VENDAS_FULL.includes(role);
}

// Simulacao da logica de check de ownership (sem hit em DB).
// Reflete o que requireVendaOwnership / requireOrcamentoOwnership fazem.
function checkVendaOwnership({ userRole, userVendedorId, vendaVendedorId }) {
  if (isVendasFullAccess(userRole)) return "OK";
  if (vendaVendedorId == null || Number(vendaVendedorId) !== userVendedorId) {
    return "FORBIDDEN";
  }
  return "OK";
}

function checkOrcamentoOwnership({ userRole, userId, orcUsuarioId }) {
  if (isVendasFullAccess(userRole)) return "OK";
  if (orcUsuarioId == null || orcUsuarioId !== userId) {
    return "FORBIDDEN";
  }
  return "OK";
}

test("isVendasFullAccess: full roles passam", () => {
  for (const r of ROLES_VENDAS_FULL) assert.equal(isVendasFullAccess(r), true);
});

test("isVendasFullAccess: scoped roles nao passam", () => {
  for (const r of ["consultora", "ourives", "motoboy", "pcp", "", null, undefined]) {
    assert.equal(isVendasFullAccess(r), false);
  }
});

test("vendas: admin ve venda alheia (OK)", () => {
  const r = checkVendaOwnership({ userRole: "admin", userVendedorId: 1, vendaVendedorId: 999 });
  assert.equal(r, "OK");
});

test("vendas: gerente_loja ve venda alheia (OK)", () => {
  const r = checkVendaOwnership({ userRole: "gerente_loja", userVendedorId: 1, vendaVendedorId: 999 });
  assert.equal(r, "OK");
});

test("vendas: consultora bloqueada em venda de outra consultora (FORBIDDEN)", () => {
  const r = checkVendaOwnership({ userRole: "consultora", userVendedorId: 42, vendaVendedorId: 99 });
  assert.equal(r, "FORBIDDEN");
});

test("vendas: consultora passa em venda propria (OK)", () => {
  const r = checkVendaOwnership({ userRole: "consultora", userVendedorId: 42, vendaVendedorId: 42 });
  assert.equal(r, "OK");
});

test("vendas: venda sem vendedor_id eh inacessivel para consultora", () => {
  const r = checkVendaOwnership({ userRole: "consultora", userVendedorId: 42, vendaVendedorId: null });
  assert.equal(r, "FORBIDDEN");
});

test("vendas: tipo numerico vs string nao engana check (Number coerce)", () => {
  // simula caso onde DB devolve vendedor_id como string (bigint serializa)
  const r = checkVendaOwnership({ userRole: "consultora", userVendedorId: 42, vendaVendedorId: "42" });
  assert.equal(r, "OK");
});

test("orcamento: comparacao por usuario_id (UUID), nao vendedor_id", () => {
  const myUuid = "684b3b30-6a7e-476e-ad3b-529127393183";
  const otherUuid = "00000000-0000-0000-0000-000000000000";

  // mesma uuid
  assert.equal(
    checkOrcamentoOwnership({ userRole: "consultora", userId: myUuid, orcUsuarioId: myUuid }),
    "OK",
  );
  // uuid diferente
  assert.equal(
    checkOrcamentoOwnership({ userRole: "consultora", userId: myUuid, orcUsuarioId: otherUuid }),
    "FORBIDDEN",
  );
  // null
  assert.equal(
    checkOrcamentoOwnership({ userRole: "consultora", userId: myUuid, orcUsuarioId: null }),
    "FORBIDDEN",
  );
  // admin ve qualquer
  assert.equal(
    checkOrcamentoOwnership({ userRole: "admin", userId: myUuid, orcUsuarioId: otherUuid }),
    "OK",
  );
});
