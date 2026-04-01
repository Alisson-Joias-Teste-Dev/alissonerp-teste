import OrcamentoView from "./OrcamentoView";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function OrcamentoPage({ params }: Props) {
  const { token } = await params;
  return <OrcamentoView token={token} />;
}
