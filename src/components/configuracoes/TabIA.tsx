"use client";

import { useState } from "react";
import ConfigIAForm from "./ia/ConfigIAForm";
import GerenciarChavesIA from "./ia/GerenciarChavesIA";
import TestarIA from "./ia/TestarIA";
import LimparCacheFotos from "./ia/LimparCacheFotos";

export default function TabIA() {
  const [refreshKeys, setRefreshKeys] = useState(0);

  return (
    <div className="space-y-7 max-w-2xl">
      <ConfigIAForm />
      <GerenciarChavesIA onKeysUpdated={() => setRefreshKeys((n) => n + 1)} />
      <TestarIA key={refreshKeys} />
      <LimparCacheFotos />
    </div>
  );
}
