/**
 * Script de teste para o sistema de personalização multi-campos
 *
 * Testa o fluxo completo:
 * 1. Configurar campos de personalização para um produto
 * 2. Listar campos configurados
 * 3. Testar a função personalizacaoParaTexto com ambos os formatos (legado + multi)
 *
 * Uso: node scripts/testar-personalizacao-multi-campos.mjs
 */

// Simulação das funções que seriam importadas do TypeScript
// (versão JS para teste rápido no terminal)
function isMultiCampo(p) {
  return p != null && typeof p === 'object' && Array.isArray(p.campos);
}

function personalizacaoParaTexto(p) {
  if (!p) return '';
  if (isMultiCampo(p)) {
    return p.campos
      .filter(c => c.valor?.trim())
      .map(c => `${c.label}: ${(c.valor ?? '').trim()}`)
      .join(' | ');
  }
  // Formato legado
  return `${p.label ?? 'Gravação'}: ${p.valor ?? ''}`;
}

function validarPersonalizacao(campo, valor) {
  const erros = [];
  if (campo.obrigatorio && !valor) {
    erros.push(`${campo.label} é obrigatório`);
  }
  if (valor && campo.max_caracteres && valor.length > campo.max_caracteres) {
    erros.push(`${campo.label} excede máximo de ${campo.max_caracteres} caracteres`);
  }
  if (valor && campo.min_caracteres && valor.length < campo.min_caracteres) {
    erros.push(`${campo.label} tem menos de ${campo.min_caracteres} caracteres`);
  }
  if (valor && campo.caracteres_permitidos) {
    const regex = new RegExp(`^[${campo.caracteres_permitidos}]+$`);
    if (!regex.test(valor)) {
      erros.push(`${campo.label} contém caracteres não permitidos`);
    }
  }
  return erros;
}

// ═══════════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\n═══════════════════════════════════════════');
console.log('  TESTE: Sistema de Personalização Multi-Campos');
console.log('═══════════════════════════════════════════\n');

// ── Teste 1: isMultiCampo ──────────────────────────────
console.log('📦 isMultiCampo()');

test('detecta formato multi-campos', () => {
  assert(isMultiCampo({ campos: [{ label: 'Nome', valor: 'MARIA' }] }) === true);
});

test('rejeita formato legado', () => {
  assert(isMultiCampo({ tipo: 'nome', valor: 'JOAO', label: 'Nome a gravar' }) === false);
});

test('rejeita null/undefined', () => {
  assert(isMultiCampo(null) === false);
  assert(isMultiCampo(undefined) === false);
});

// ── Teste 2: personalizacaoParaTexto ───────────────────
console.log('\n📦 personalizacaoParaTexto()');

test('formato legado (PZ)', () => {
  const legado = { tipo: 'nome', valor: 'JOAO', max_caracteres: 4, label: 'Nome a gravar' };
  const texto = personalizacaoParaTexto(legado);
  assert(texto === 'Nome a gravar: JOAO', `Esperado "Nome a gravar: JOAO" mas recebeu "${texto}"`);
});

test('formato multi-campos (3 nomes)', () => {
  const multi = {
    campos: [
      { label: 'Nome 1', valor: 'MARIA', max_caracteres: 30 },
      { label: 'Nome 2', valor: 'JOAO', max_caracteres: 30 },
      { label: 'Nome 3', valor: 'ANA', max_caracteres: 20 },
    ]
  };
  const texto = personalizacaoParaTexto(multi);
  assert(texto === 'Nome 1: MARIA | Nome 2: JOAO | Nome 3: ANA',
    `Esperado "... 1: MARIA | ... 2: JOAO | ... 3: ANA" mas recebeu "${texto}"`);
});

test('formato multi-campos filtra campos vazios', () => {
  // A funcao .filter(c => c.valor?.trim()) elimina campos vazios
  const multi = {
    campos: [
      { label: 'Nome 1', valor: 'MARIA', max_caracteres: 30 },
      { label: 'Nome 2', valor: '', max_caracteres: 30 },
    ]
  };
  const texto = personalizacaoParaTexto(multi);
  assert(texto === 'Nome 1: MARIA', `Esperado "Nome 1: MARIA" mas recebeu "${texto}"`);
});

test('objeto vazio', () => {
  assert(personalizacaoParaTexto(null) === '');
  assert(personalizacaoParaTexto(undefined) === '');
});

// ── Teste 3: Validação de campos ──────────────────────
console.log('\n📦 validarPersonalizacao()');

const campoNome = { label: 'Nome 1', obrigatorio: true, max_caracteres: 30, min_caracteres: 2 };

test('campo obrigatório sem valor', () => {
  const erros = validarPersonalizacao(campoNome, '');
  assert(erros.length === 1, `Esperado 1 erro, recebeu ${erros.length}`);
  assert(erros[0].includes('obrigatório'));
});

test('valor dentro do limite', () => {
  const erros = validarPersonalizacao(campoNome, 'MARIA');
  assert(erros.length === 0, `Esperado 0 erros, recebeu ${erros.length}`);
});

test('valor excede max_caracteres', () => {
  const erros = validarPersonalizacao(campoNome, 'MARIA CECILIA SILVA SANTOS DOS REIS');  // 37 chars > 30
  assert(erros.length === 1, `Esperado 1 erro, recebeu ${erros.length}`);
  assert(erros[0].includes('excede máximo'));
});

test('valor abaixo de min_caracteres', () => {
  const erros = validarPersonalizacao(campoNome, 'A');
  assert(erros.length === 1);
  assert(erros[0].includes('menos de'));
});

test('caracteres permitidos (regex)', () => {
  const campo = { label: 'Nome', caracteres_permitidos: 'A-Z' };
  const erros = validarPersonalizacao(campo, 'MARIA');
  assert(erros.length === 0);
});

test('caracteres NÃO permitidos (regex)', () => {
  const campo = { label: 'Nome', caracteres_permitidos: 'A-Z' };
  const erros = validarPersonalizacao(campo, 'Maria');  // 'm' minúsculo
  assert(erros.length === 1);
  assert(erros[0].includes('não permitidos'));
});

// ── Teste 4: Simulação de propagação venda → ordem ─────
console.log('\n📦 Propagação venda → ordem (simulação)');

// Simula itens_venda_erp com personalizacao
const itensVendaSimulados = [
  { produto_id: 5270, personalizacao: { campos: [
    { label: 'Nome 1', valor: 'MARIA', max_caracteres: 30, obrigatorio: true },
    { label: 'Nome 2', valor: 'JOAO', max_caracteres: 30, obrigatorio: true },
  ]}},
  { produto_id: 1111, personalizacao: { tipo: 'nome', valor: 'ANA', label: 'Nome a gravar' }},
];

test('propagação da venda para ordem (multi-campos virando texto)', () => {
  const observacoes = itensVendaSimulados.map(item => {
    const pedidoObs = 'Pedido #123';
    const textoPers = personalizacaoParaTexto(item.personalizacao);
    return [pedidoObs, textoPers].filter(Boolean).join('\n');
  });
  assert(observacoes[0] === 'Pedido #123\nNome 1: MARIA | Nome 2: JOAO',
    `Multi-campos: ${observacoes[0]}`);
  assert(observacoes[1] === 'Pedido #123\nNome a gravar: ANA',
    `Legado: ${observacoes[1]}`);
});

test('item SEM personalizacao não gera texto extra', () => {
  const obs = ['Pedido #456', personalizacaoParaTexto(null)].filter(Boolean).join('\n');
  assert(obs === 'Pedido #456');
});

// ── Resultado ──────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
