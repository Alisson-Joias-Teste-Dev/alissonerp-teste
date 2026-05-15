/**
 * Verifica o produto AJ5270 e o que a LIA configurou.
 * Uso: node --env-file=.env.local scripts/check_aj5270.mjs
 */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, {
  ssl: false,
  connection: { search_path: "alissonerp,public" },
});

async function main() {
  const [produto] = await sql`
    SELECT id_produto, nome, sku, situacao
    FROM public.produtos
    WHERE sku = 'AJ5270'
  `;

  if (!produto) {
    console.log("❌ Produto AJ5270 não encontrado");
    await sql.end();
    return;
  }

  console.log("📦 PRODUTO ENCONTRADO:");
  console.log(`   ID: ${produto.id_produto}`);
  console.log(`   SKU: ${produto.sku}`);
  console.log(`   Nome: ${produto.nome}`);
  console.log(`   Situação: ${produto.situacao}\n`);

  const [config] = await sql`
    SELECT *
    FROM alissonerp.produto_personalizacao
    WHERE produto_id = ${produto.id_produto}
  `;

  if (!config) {
    console.log("❌ NENHUMA configuração de personalização encontrada para AJ5270.");
    console.log("   A LIA ainda não configurou regras para este produto.");
    await sql.end();
    return;
  }

  console.log("🎯 CONFIGURAÇÃO DE PERSONALIZAÇÃO (O QUE A LIA FEZ):");
  console.log(`   ID Config: ${config.id}`);
  console.log(`   Tipo: ${config.tipo}`);
  console.log(`   Label: "${config.label}"`);
  console.log(`   Obrigatório: ${config.obrigatorio ? "Sim" : "Não"}`);
  console.log(`   Min caracteres: ${config.min_caracteres}`);
  console.log(`   Max caracteres: ${config.max_caracteres}`);
  console.log(`   Caracteres permitidos: ${config.caracteres_permitidos}`);
  console.log(`   Campos grátis: ${config.campos_gratis}`);
  console.log(`   Preço campo adicional: ${config.preco_campo_adicional != null ? `R$ ${config.preco_campo_adicional}` : "Não configurado"}`);
  console.log(`   Preço por letra: ${config.preco_por_letra != null ? `R$ ${config.preco_por_letra}` : "Não configurado"}`);
  console.log(`   Peso por letra: ${config.peso_por_letra != null ? `${config.peso_por_letra}g` : "Não configurado"}`);
  console.log(`   Ativo: ${config.ativo ? "Sim" : "Não"}`);
  console.log(`   Criado em: ${config.created_at}`);
  console.log(`   Atualizado em: ${config.updated_at}`);

  const [regras] = await sql`
    SELECT *
    FROM alissonerp.produto_personalizacao_regras
    WHERE config_id = ${config.id}
  `;

  if (regras) {
    console.log("\n📋 REGRAS DE FORMATAÇÃO:");
    console.log(`   1ª letra maiúscula: ${regras.primeira_letra_maiuscula ? "✅ Sim" : "❌ Não"}`);
    console.log(`   Sem espaços: ${regras.sem_espacos ? "✅ Sim" : "❌ Não"}`);
    console.log(`   Sem números: ${regras.sem_numeros ? "✅ Sim" : "❌ Não"}`);
    console.log(`   Sem símbolos: ${regras.sem_simbolos ? "✅ Sim" : "❌ Não"}`);
    console.log(`   Sem acentos: ${regras.sem_acentos ? "✅ Sim" : "❌ Não"}`);
  } else {
    console.log("\n📋 Nenhuma regra de formatação cadastrada.");
  }

  // Resumo em português claro
  console.log("\n📝 RESUMO:");
  const tipoLabel = { nome:"Nome", iniciais:"Iniciais", data:"Data", numero:"Número", simbolo:"Símbolo", livre:"Livre" }[config.tipo] ?? config.tipo;
  const caracteresDesc = {
    alfa:"apenas letras A-Z (sem acentos, números ou espaços)",
    alfa_acento:"letras com acentos (sem números ou espaços)",
    alfa_acento_espaco:"letras com acentos e espaços (sem números)",
    alfanum:"letras e números",
    alfanum_acento_espaco:"letras, números, acentos e espaços",
    numero:"apenas números",
    qualquer:"qualquer caractere",
  }[config.caracteres_permitidos] ?? config.caracteres_permitidos;

  const regrasTexto = [];
  if (regras) {
    if (regras.primeira_letra_maiuscula) regrasTexto.push("primeira letra maiúscula automática");
    if (regras.sem_espacos) regrasTexto.push("sem espaços");
    if (regras.sem_numeros) regrasTexto.push("sem números");
    if (regras.sem_simbolos) regrasTexto.push("sem símbolos");
    if (regras.sem_acentos) regrasTexto.push("sem acentos");
  }

  console.log(`📌 Tipo: ${tipoLabel}`);
  console.log(`🏷️  Label: "${config.label}"`);
  console.log(`🔢 ${config.min_caracteres} a ${config.max_caracteres} caracteres`);
  console.log(`📝 Permite: ${caracteresDesc}`);
  console.log(`✅ Obrigatório: ${config.obrigatorio ? "Sim" : "Não"}`);
  console.log(`🎁 ${config.campos_gratis} campo(s) grátis incluso(s) no preço`);
  if (config.preco_campo_adicional != null) console.log(`💰 Campo extra: R$ ${config.preco_campo_adicional}`);
  if (regrasTexto.length > 0) console.log(`🎯 Formatação: ${regrasTexto.join(", ")}`);

  await sql.end();
}

main().catch(console.error);
