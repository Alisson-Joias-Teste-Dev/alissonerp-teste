import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const sql = postgres(env.DATABASE_URL, {
  ssl: false,
  max: 1,
  idle_timeout: 30,
  connect_timeout: 15,
});

async function main() {
  // 1. Diagnóstico
  const rows = await sql`
    SELECT o.id, o.numero_ordem, o.rota, o.tipo_ordem,
           a.id AS audit_id, a.situacao AS audit_situacao
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.auditorias a
      ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja' AND a.situacao != 'reprovado'
    WHERE o.situacao = 'aguardando' AND o.eh_teste = FALSE
    ORDER BY o.id
  `;

  const pcp    = rows.filter(r => r.rota === 'pcp');
  const proto  = rows.filter(r => r.rota === 'protocolo');
  const outros = rows.filter(r => r.rota !== 'pcp' && r.rota !== 'protocolo');

  console.log(`\n=== AGUARDANDO ===`);
  console.log(`  rota=pcp:       ${pcp.length}`);
  console.log(`  rota=protocolo: ${proto.length}`);
  console.log(`  outros/null:    ${outros.length}`);

  console.log('\nPCP:');
  pcp.forEach(r => console.log(`  ${r.numero_ordem}  audit=${r.audit_situacao ?? 'NENHUMA'}`));
  console.log('\nProtocolo:');
  proto.forEach(r => console.log(`  ${r.numero_ordem}  audit=${r.audit_situacao ?? 'NENHUMA'}`));

  const args = process.argv.slice(2);
  if (!args.includes('--executar')) {
    console.log('\n[DRY RUN] Passe --executar para aplicar as correções.');
    await sql.end();
    return;
  }

  console.log('\n=== APLICANDO CORREÇÕES ===');
  let pcpOk = 0, protoOk = 0, erros = 0;

  // ─── PCP: criar auditoria aprovada → fn_processar_auditoria cria PCP + em_andamento
  for (const o of pcp) {
    try {
      if (o.audit_situacao === 'aprovado') {
        // Auditoria já aprovada mas ordem ficou em aguardando → reprocessar manualmente
        // Cria saida_ordem + pcp se não existir, e seta em_andamento
        const [pcp_row] = await sql`SELECT id FROM alissonerp.pcp WHERE ordem_id = ${o.id} LIMIT 1`;
        if (!pcp_row) {
          // Forçar reprocessamento: update dummy na auditoria para disparar trigger
          await sql`
            UPDATE alissonerp.auditorias SET parecer = COALESCE(parecer, '') || ' '
            WHERE id = ${o.audit_id}
          `;
        }
        // Garantir situação em_andamento
        await sql`UPDATE alissonerp.ordens SET situacao = 'em_andamento' WHERE id = ${o.id}`;
        console.log(`  [PCP reprocess] ${o.numero_ordem} → em_andamento`);
        pcpOk++;
      } else {
        // Sem auditoria aprovada: criar nova + aprovar (trigger fn_processar_auditoria cuidará do resto)
        const [audit] = await sql`
          INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, peso_negociado, dados_ordem)
          VALUES ('pendente', 'loja', 'entrada_ordem', ${o.id}, 0,
            jsonb_build_object('numero_ordem', ${o.numero_ordem}, 'tipo_ordem', ${o.tipo_ordem}, 'rota', 'pcp', 'origem', 'fix_aguardando'))
          RETURNING id
        `;
        await sql`
          UPDATE alissonerp.auditorias
          SET situacao = 'aprovado', data_conclusao = NOW(), parecer = 'Aprovação automática — fix_aguardando'
          WHERE id = ${audit.id}
        `;
        console.log(`  [PCP novo audit] ${o.numero_ordem} → em_andamento`);
        pcpOk++;
      }
    } catch (e) {
      console.error(`  [ERRO PCP] ${o.numero_ordem}: ${e.message}`);
      erros++;
    }
  }

  // ─── Protocolo: garantir que audit está aprovado (ordem fica em aguardando propositalmente,
  //     mas o status deve refletir que está liberado pro protocolo)
  for (const o of proto) {
    try {
      if (!o.audit_id || o.audit_situacao !== 'aprovado') {
        const [audit] = await sql`
          INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, peso_negociado, dados_ordem)
          VALUES ('pendente', 'loja', 'entrada_ordem', ${o.id}, 0,
            jsonb_build_object('numero_ordem', ${o.numero_ordem}, 'tipo_ordem', ${o.tipo_ordem}, 'rota', 'protocolo', 'origem', 'fix_aguardando'))
          RETURNING id
        `;
        await sql`
          UPDATE alissonerp.auditorias
          SET situacao = 'aprovado', data_conclusao = NOW(), parecer = 'Aprovação automática — fix_aguardando'
          WHERE id = ${audit.id}
        `;
        console.log(`  [Protocolo audit] ${o.numero_ordem} → aguardando protocolo ✓`);
      } else {
        console.log(`  [Protocolo ok]    ${o.numero_ordem} → já tem audit aprovado`);
      }
      protoOk++;
    } catch (e) {
      console.error(`  [ERRO Proto] ${o.numero_ordem}: ${e.message}`);
      erros++;
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`  PCP movidos p/ em_andamento: ${pcpOk}`);
  console.log(`  Protocolo liberados:          ${protoOk}`);
  console.log(`  Erros:                        ${erros}`);

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
