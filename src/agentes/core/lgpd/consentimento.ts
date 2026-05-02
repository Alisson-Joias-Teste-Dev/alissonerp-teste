import { sendMessage } from '../telegram/send';
import sql from '../../../lib/db';

export async function checkFirstConversation(
  skillSlug: string,
  chatId: number,
  usuarioSkillId: number,
): Promise<boolean> {
  const rows = await sql`
    SELECT consentimento_em FROM agentes.usuarios_skill
    WHERE id = ${usuarioSkillId}
  `;

  if (rows.length === 0 || rows[0].consentimento_em) {
    return false;
  }

  const msg = `Bem-vindo(a)! Sou o assistente virtual da fábrica.

Posso te ajudar a consultar ordens de produção, buscar produtos, registrar processos e tirar dúvidas sobre a produção.

⚠️ **Importante (LGPD):**
Suas conversas serão armazenadas por 90 dias para melhorar o assistente.
Você pode pedir para esquecer tudo a qualquer momento com o comando *esquecer.
Nenhum dado pessoal seu é enviado para a IA.

Digite **OK** para concordar ou *sair para cancelar.`;

  await sendMessage(skillSlug, chatId, msg);
  return true;
}

export async function giveConsent(usuarioSkillId: number): Promise<void> {
  await sql`
    UPDATE agentes.usuarios_skill
    SET consentimento_em = NOW(),
        consentimento_versao = '1.0'
    WHERE id = ${usuarioSkillId}
  `;
}

export async function esquecer(usuarioSkillId: number): Promise<void> {
  await sql`
    UPDATE agentes.usuarios_skill
    SET esquecido_em = NOW()
    WHERE id = ${usuarioSkillId}
  `;
}
