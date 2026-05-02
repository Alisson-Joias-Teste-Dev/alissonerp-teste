export function buildInlineKeyboard(buttons: Array<{
  text: string;
  callbackData: string;
}>): {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
} {
  return {
    inline_keyboard: buttons.map((b) => [
      { text: b.text, callback_data: b.callbackData },
    ]),
  };
}
