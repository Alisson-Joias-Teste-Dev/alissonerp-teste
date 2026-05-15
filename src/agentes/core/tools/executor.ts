import { getTool } from './registry';

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  _usuarioSkillId: number,
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const tool = getTool(toolName);
  if (!tool) {
    return { success: false, result: null, error: `Tool "${toolName}" desconhecida` };
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tool timeout após 8s')), 8000)
    );

    const result = await Promise.race([
      tool.execute(args),
      timeoutPromise,
    ]);

    return { success: true, result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, result: null, error: errorMsg };
  }
}
