import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPublicUrl } from "@/lib/storage-url";
import ConversaoReversaTreino from "./ConversaoReversaTreino";

export const dynamic = "force-dynamic";

const TREINAMENTO_KEY = "conversao-reversa";

export default async function Page() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let isDev = false;
  let videoUrl: string | null = null;

  if (user) {
    const [usuario] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    isDev = usuario?.role === "desenvolvedor";

    const [video] = await sql`SELECT video_path FROM alissonerp.treinamento_videos WHERE treinamento_key = ${TREINAMENTO_KEY} LIMIT 1`;
    if (video?.video_path) videoUrl = getPublicUrl("treinamento-videos", video.video_path);
  }

  return <ConversaoReversaTreino videoUrl={videoUrl} isDev={isDev} treinamentoKey={TREINAMENTO_KEY} />;
}
