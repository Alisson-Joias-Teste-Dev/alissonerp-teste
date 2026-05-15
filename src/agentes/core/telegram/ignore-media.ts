import { sendMessage } from './send';

export async function handleMedia(
  skillSlug: string,
  chatId: number,
  messageId: number,
  _mediaType: string,
): Promise<void> {
  await sendMessage(skillSlug, chatId, 'Ainda só entendo texto. Pode digitar?', {
    replyToMessageId: messageId,
  });
}
