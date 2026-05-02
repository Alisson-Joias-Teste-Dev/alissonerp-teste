import { getTool } from './registry';
import { logToolCall } from './registry';

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  usuarioSkillId: number,
  conversaId?: bigint,
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const tool = getTool(toolName);
  if (!tool) {
    return { success: false, result: null, error: `Tool "${toolName}" desconhecida` };
  }

  const start = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tool timeout após 8s')), 8000)
    );

    const result = await Promise.race([
      tool.execute(args),
      timeoutPromise,
    ]);

    const duration = Date.now() - start;

    await logToolCall({
      usuarioSkillId,
      conversaId,
      toolName,
      args,
      isEscrita: tool.isEscrita,
      resultado: result,
      duracaoMs: duration,
    });

    return { success: true, result };
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);

    await logToolCall({
      usuarioSkillId,
      conversaId,
      toolName,
      args,
      isEscrita: tool.isEscrita,
      erro: errorMsg,
      duracaoMs: duration,
    });

    return { success: false, result: null, error: errorMsg };
  }
}
