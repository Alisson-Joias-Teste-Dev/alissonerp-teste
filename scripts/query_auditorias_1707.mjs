// Auditorias e tipo_ordem da C-1707
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. tipo_ordem real
  console.log('=== tipo_ordem da C-1707 ===');
  const [o] = await sql`SELECT id, numero_ordem, tipo_ordem::text AS tipo, rota::text AS rota, status::text AS st FROM alissonerp.ordens WHERE id = 1707`;
  console.log(' ', JSON.stringify(o));

  // 2. Auditorias
  console.log('\n=== alissonerp.auditorias (ordem 1707) ===');
  const auds = await sql`
    SELECT id, tipo_auditoria::text AS tipo, situacao::text AS situacao, created_at, updated_at
    FROM alissonerp.auditorias WHERE ordem_id = 1707 ORDER BY id
  `;
  if (auds.length === 0) console.log('  ❌ SEM auditoria');
  else auds.forEach(a => console.log(' ', JSON.stringify(a)));

  // 3. Status atuais do PCP
  console.log('\n=== alissonerp.pcp (ordem 1707) ===');
  const pcps = await sql`
    SELECT id, etapas::text AS etapas, deposito_id, created_at
    FROM alissonerp.pcp WHERE ordem_id = 1707 ORDER BY id
  `;
  pcps.forEach(p => console.log(' ', JSON.stringify(p)));

  // 4. Service associados
  console.log('\n=== alissonerp.servicos (ordem 1707) ===');
  const servs = await sql`
    SELECT id, pcp_id, status, recebido_em, concluido_em, transferencia_service_id
    FROM alissonerp.servicos WHERE ordem_id = 1707 ORDER BY id
  `;
  servs.forEach(s => console.log(' ', JSON.stringify(s)));

  // 5. Simular se ela apareceria na view_volta caso PCP fosse concluído + tivesse auditoria fabrica
  console.log('\n=== Verificação de requisitos pra aparecer em vw_ordens_prontas_volta ===');
  console.log(`  1. Existe PCP etapas='concluido'? ${pcps.some(p => p.etapas === 'concluido') ? 'SIM' : 'NÃO'}`);
  console.log(`  2. Existe auditoria tipo='fabrica' situacao='aprovado'? ${auds.some(a => a.tipo === 'fabrica' && a.situacao === 'aprovado') ? 'SIM' : 'NÃO'}`);
  console.log(`  3. Status NÃO está em [cancelado, entregue]? ${!['cancelado','entregue'].includes(o.st) ? 'SIM' : 'NÃO'}`);
  console.log(`  4. Não tem protocolo_ordens com direcao=volta? (verificar)`);
  const temVolta = await sql`
    SELECT COUNT(*)::int AS cnt FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE po.ordem_id = 1707 AND p.direcao::text = 'volta'
  `;
  console.log(`     → ${temVolta[0].cnt === 0 ? 'SIM (nenhum de volta)' : 'NÃO (já tem volta)'}`);

} finally {
  await sql.end();
}
