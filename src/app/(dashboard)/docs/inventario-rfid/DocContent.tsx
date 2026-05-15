"use client";

import QrCodeApk from "./QrCodeApk";

interface Props {
  apkExists?: boolean;
  apkSize?: number;
}

const APK_URL = "/apk/alisson-rfid.apk";
const APK_VERSION = "1.0.0";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full"
      style={{ backgroundColor: color + "22", color }}
    >
      {children}
    </span>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {title && (
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function Passo({ num, children }: { num: number; children: React.ReactNode }) {
  const titulos: Record<number, string> = {
    1: "Criar inventario no ERP web",
    2: "Abrir o app e sincronizar",
    3: "Iniciar contagem",
    4: "Realizar a leitura das etiquetas",
    5: "Conferir resultados",
    6: "Enviar para o sistema",
  };

  return (
    <div className="flex gap-4 mb-6">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
        style={{ backgroundColor: "#1565C0" }}
      >
        {num}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-base mb-1">{titulos[num] || `Passo ${num}`}</h4>
        <div className="text-gray-600 dark:text-gray-300 space-y-2">{children}</div>
      </div>
    </div>
  );
}

function TabelaCores() {
  const cores = [
    { cor: "#4CAF50", nome: "Verde", significado: "OK", descricao: "Quantidade lida igual ao esperado. Nenhuma acao necessaria." },
    { cor: "#F44336", nome: "Vermelho", significado: "Faltando", descricao: "Quantidade lida menor que o esperado. Provavelmente faltam etiquetas para ler." },
    { cor: "#2196F3", nome: "Azul", significado: "Excesso", descricao: "Quantidade lida maior que o esperado. Ha mais etiquetas no local que o registrado no sistema." },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-2 px-3 font-semibold">Cor</th>
            <th className="text-left py-2 px-3 font-semibold">Significado</th>
            <th className="text-left py-2 px-3 font-semibold">O que fazer</th>
          </tr>
        </thead>
        <tbody>
          {cores.map((c) => (
            <tr key={c.nome} className="border-b border-gray-100 dark:border-gray-700">
              <td className="py-2 px-3">
                <span
                  className="inline-block w-6 h-6 rounded-full align-middle mr-2"
                  style={{ backgroundColor: c.cor }}
                />
                <span className="font-medium">{c.nome}</span>
              </td>
              <td className="py-2 px-3">
                <Badge color={c.cor}>{c.significado}</Badge>
              </td>
              <td className="py-2 px-3 text-gray-600 dark:text-gray-300">{c.descricao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocContent({ apkExists, apkSize }: Props = {}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Cabecalho */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold">App Alisson RFID</h1>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Inventario de estoque com leitor TSL 1128 via Bluetooth
        </p>
        <div className="flex justify-center gap-3">
          <Badge color="#1565C0">v{APK_VERSION}</Badge>
          <Badge color="#4CAF50">Android 8.0+</Badge>
          <Badge color="#FF9800">Bluetooth</Badge>
        </div>
      </div>

      {/* Download */}
      <Card title="Download do APK">
        {apkExists ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-center text-gray-600 dark:text-gray-300 max-w-lg">
              Escaneie o QR Code com a camera do seu celular para baixar o aplicativo,
              ou clique em &ldquo;Baixar APK&rdquo; para fazer o download diretamente.
            </p>
            <QrCodeApk url={APK_URL} />
            <p className="text-xs text-gray-400">
              APK assinado &mdash; versao {APK_VERSION} &mdash;{" "}
              {formatBytes(apkSize || 0)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-3xl">
              ⏳
            </div>
            <p className="text-center text-gray-600 dark:text-gray-300 max-w-lg">
              O APK ainda nao foi gerado. Solicite ao desenvolvedor que realize o
              build do aplicativo seguindo as instrucoes abaixo.
            </p>
            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 text-sm w-full max-w-md">
              <p className="font-mono text-xs">
                <strong>1.</strong> Abra <code>android-rfid-app/</code> no Android Studio
              </p>
              <p className="font-mono text-xs mt-1">
                <strong>2.</strong> Build &rarr; Generate Signed Bundle/APK &rarr; APK
              </p>
              <p className="font-mono text-xs mt-1">
                <strong>3.</strong> Copie o APK para <code>public/apk/alisson-rfid.apk</code>
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* O que e */}
      <Card title="O que e o App Alisson RFID?">
        <p className="text-gray-600 dark:text-gray-300 mb-3">
          O <strong>App Alisson RFID</strong> e um aplicativo Android que substitui o
          bridge Windows para realizar inventarios de estoque usando o leitor
          <strong> TSL 1128</strong> via Bluetooth.
        </p>
        <p className="text-gray-600 dark:text-gray-300 mb-3">
          Com ele, voce pode conectar diretamente o leitor TSL ao seu celular ou tablet
          Android, realizar a leitura das etiquetas RFID e enviar os resultados para o
          sistema ERP — tudo sem precisar de um notebook com Windows rodando o bridge.
        </p>
        <p className="text-gray-600 dark:text-gray-300">
          O app funciona <strong>offline durante a leitura</strong>: voce baixa os dados
          do inventario, realiza a contagem sem internet, e envia os resultados quando
          estiver conectado novamente.
        </p>
      </Card>

      {/* Requisitos */}
      <Card title="Requisitos">
        <ul className="space-y-2 text-gray-600 dark:text-gray-300 list-disc list-inside">
          <li>Dispositivo Android com versao <strong>8.0 (API 26)</strong> ou superior</li>
          <li>Bluetooth integrado e funcionando</li>
          <li>Leitor <strong>TSL 1128</strong> pareado via Bluetooth</li>
          <li>Credencial de acesso ao ERP (email e senha usados no sistema web)</li>
          <li>Conexao com internet para sincronizar e enviar os resultados</li>
        </ul>
      </Card>

      {/* Como instalar */}
      <Card title="Como instalar">
        <ol className="space-y-3 text-gray-600 dark:text-gray-300 list-decimal list-inside">
          <li>
            <strong>Baixe o APK</strong> — use o QR Code acima ou clique em &ldquo;Baixar APK&rdquo;.
            O download comecara automaticamente.
          </li>
          <li>
            <strong>Habilite &ldquo;Fontes desconhecidas&rdquo;</strong> — va em
            Configuracoes &rarr; Seguranca &rarr; Fontes desconhecidas e ative a opcao
            para o navegador ou gerenciador de arquivos.
          </li>
          <li>
            <strong>Instale o APK</strong> — localize o arquivo baixado (geralmente na
            pasta &ldquo;Downloads&rdquo;) e toque nele. Confirme a instalacao.
          </li>
          <li>
            <strong>Pareie o leitor TSL 1128</strong> — va em Configuracoes &rarr;
            Bluetooth do Android, ligue o leitor e selecione &ldquo;TSL 1128&rdquo; na
            lista de dispositivos para parear.
          </li>
        </ol>
      </Card>

      {/* Primeiro acesso */}
      <Card title="Primeiro acesso">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-1">Login</h4>
            <p className="text-gray-600 dark:text-gray-300">
              Ao abrir o app, informe o mesmo <strong>email</strong> e{" "}
              <strong>senha</strong> que voce usa para acessar o sistema ERP web
              (erp.alisson.api.br).
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Conexao com o leitor</h4>
            <p className="text-gray-600 dark:text-gray-300">
              Apos o login, va ate a aba <strong>Ajustes</strong> (icone de engrenagem)
              e verifique se o leitor TSL aparece como &ldquo;Conectado&rdquo;. Caso
                contrario, toque em &ldquo;Reconectar&rdquo;.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Ajuste de potencia</h4>
            <p className="text-gray-600 dark:text-gray-300">
              Na aba Ajustes, use o slider de <strong>Potencia de leitura</strong> para
              controlar o alcance do leitor. Valores mais altos (ate 30 dBm) leem
              etiquetas a maior distancia, mas consomem mais bateria.
            </p>
          </div>
        </div>
      </Card>

      {/* Telas */}
      <Card title="Telas do aplicativo">
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold text-lg flex items-center gap-2 mb-2">
              <span className="text-xl">📋</span> Inventario
            </h4>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Tela principal para realizar inventarios de estoque.
            </p>
            <ul className="text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
              <li><strong>Sincronizar</strong>: puxa do ERP todos os inventarios abertos/disponiveis</li>
              <li><strong>Iniciar contagem</strong>: comeca a leitura de etiquetas pelo leitor TSL</li>
              <li><strong>Parar</strong>: interrompe a leitura</li>
              <li><strong>Resultado</strong>: mostra a comparacao entre o esperado e o lido</li>
              <li><strong>Enviar</strong>: envia o inventario concluido para o sistema</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-lg flex items-center gap-2 mb-2">
              <span className="text-xl">📡</span> Procurar
            </h4>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Localiza uma etiqueta especifica pelo EPC ou SKU.
            </p>
            <ul className="text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
              <li>Digite o EPC ou SKU da etiqueta desejada</li>
              <li>Toque em &ldquo;Procurar&rdquo; — o leitor ativa o modo Geiger</li>
              <li>O indicador visual mostra a intensidade do sinal (RSSI)</li>
              <li>Quanto mais forte o sinal, mais perto voce esta da etiqueta</li>
              <li>O beep do leitor fica mais rapido conforme voce se aproxima</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-lg flex items-center gap-2 mb-2">
              <span className="text-xl">⚙</span> Ajustes
            </h4>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Configuracoes do leitor e do aplicativo.
            </p>
            <ul className="text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
              <li><strong>Conexao</strong>: status do leitor, reconectar/desconectar</li>
              <li><strong>Potencia</strong>: controle de alcance (0 a 30 dBm)</li>
              <li><strong>Beeper</strong>: liga/desliga o som do leitor ao ler etiquetas</li>
              <li><strong>Servidor</strong>: URL da API (padrao: erp.alisson.api.br)</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Fluxo completo */}
      <Card title="Fluxo completo: como fazer um inventario">
        <div className="space-y-2">
          <Passo num={1}>
            <p>
              No sistema ERP web (<strong>Estoque Comercial</strong> &rarr;{" "}
              <strong>Inventarios</strong>), clique em &ldquo;Novo inventario&rdquo;,
              selecione o <strong>local</strong> (Fabrica, Loja, etc.) e a{" "}
              <strong>categoria</strong> (Anel, Brinco, etc.).
            </p>
            <p>
              O sistema vai gerar uma lista com todos os produtos e suas quantidades
              atuais em estoque.
            </p>
          </Passo>

          <Passo num={2}>
            <p>
              No app, va ate a aba <strong>Inventario</strong> e toque em{" "}
              <strong>&ldquo;Sincronizar&rdquo;</strong> (ou puxe a lista para baixo).
            </p>
            <p>
              O inventario que voce criou no passo anterior vai aparecer na lista.
              Toque nele para iniciar a contagem.
            </p>
          </Passo>

          <Passo num={3}>
            <p>
              Na tela de contagem, toque em <strong>&ldquo;Iniciar&rdquo;</strong>.
              O leitor TSL comecara a emitir ondas de radio e ler as etiquetas RFID
              ao redor.
            </p>
            <p>
              Aponte o leitor para as etiquetas que deseja contar. As etiquetas lidas
              aparecem em tempo real na lista.
            </p>
            <p>
              O progresso mostra quantas etiquetas ja foram lidas em relacao ao
              total esperado.
            </p>
          </Passo>

          <Passo num={4}>
            <p>
              Passe o leitor por <strong>todas</strong> as etiquetas do local que
              esta sendo inventariado.
            </p>
            <p>
              O app filtra leituras duplicadas automaticamente (mesmo EPC lido varias
              vezes e contado apenas uma vez).
            </p>
          </Passo>

          <Passo num={5}>
            <p>
              Quando terminar a leitura, toque em <strong>&ldquo;Parar&rdquo;</strong>{" "}
              e depois em <strong>&ldquo;Conferir e ver resultado&rdquo;</strong>.
            </p>
            <p>
              A tela de resultado mostra:
            </p>
            <TabelaCores />
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Voce pode tocar em <strong>&ldquo;Refazer contagem&rdquo;</strong> se
              precisar ler novamente.
            </p>
          </Passo>

          <Passo num={6}>
            <p>
              Se o resultado estiver correto, toque em{" "}
              <strong>&ldquo;Enviar para o sistema&rdquo;</strong>.
            </p>
            <p>
              O app vai registrar todas as leituras e as contagens no sistema ERP.
              O inventario sera marcado como <strong>concluido</strong> e os ajustes
              de estoque serao gerados automaticamente.
            </p>
            <p className="font-semibold text-green-600 dark:text-green-400">
              Pronto! O inventario foi finalizado e o estoque foi atualizado.
            </p>
          </Passo>
        </div>
      </Card>

      {/* Dicas */}
      <Card title="Dicas e boas praticas">
        <ul className="space-y-2 text-gray-600 dark:text-gray-300">
          <li>
            <strong>Potencia:</strong> Comece com 25 dBm. Se nao estiver lendo todas
            as etiquetas, aumente. Se estiver lendo etiquetas de areas vizinhas, diminua.
          </li>
          <li>
            <strong>Bateria:</strong> O leitor consome mais bateria em potencia maxima.
            Use a potencia adequada para o ambiente.
          </li>
          <li>
            <strong>Distancia:</strong> Mantenha o leitor a uma distancia de 30cm a
            1 metro das etiquetas para melhor leitura.
          </li>
          <li>
            <strong>Movimento:</strong> Nao agite o leitor muito rapidamente. Movimentos
            lentos e constantes garantem melhor cobertura.
          </li>
          <li>
            <strong>Metal:</strong> Etiquetas proximas a metal podem ter leitura
            prejudicada. Aproxime o leitor nessas situacoes.
          </li>
          <li>
            <strong>Offline:</strong> Voce pode realizar a contagem sem internet.
            Os EPCs e resultados ficam salvos no dispositivo ate que voce envie.
          </li>
          <li>
            <strong>Multiplos usuarios:</strong> Cada usuario pode usar seu proprio
            celular e leitor TSL simultaneamente.
          </li>
        </ul>
      </Card>

      {/* Solucao de problemas */}
      <Card title="Solucao de problemas">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-1">Leitor nao conecta</h4>
            <ul className="text-gray-600 dark:text-gray-300 list-disc list-inside text-sm space-y-1">
              <li>Verifique se o leitor esta ligado (LED verde aceso)</li>
              <li>Verifique se o leitor esta pareado no Bluetooth do Android</li>
              <li>Va em Ajustes &rarr; &ldquo;Reconectar&rdquo; para tentar novamente</li>
              <li>Desligue e ligue o Bluetooth do celular</li>
              <li>Reinicie o leitor (desligue e ligue)</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-1">Erro de login</h4>
            <ul className="text-gray-600 dark:text-gray-300 list-disc list-inside text-sm space-y-1">
              <li>Confirme se voce esta usando o mesmo email e senha do sistema ERP web</li>
              <li>Verifique se a senha nao contem espacos extras</li>
              <li>Se esqueceu a senha, redefina pelo ERP web</li>
              <li>Verifique se o dispositivo tem conexao com internet</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-1">EPCs nao aparecem durante a leitura</h4>
            <ul className="text-gray-600 dark:text-gray-300 list-disc list-inside text-sm space-y-1">
              <li>Aumente a potencia do leitor na aba Ajustes</li>
              <li>Verifique se as etiquetas estao dentro do alcance</li>
              <li>Verifique se o leitor esta realmente conectado (status verde)</li>
              <li>Toque em &ldquo;Parar&rdquo; e depois em &ldquo;Iniciar&rdquo; novamente</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-1">Erro ao enviar inventario</h4>
            <ul className="text-gray-600 dark:text-gray-300 list-disc list-inside text-sm space-y-1">
              <li>Verifique se o dispositivo esta conectado a internet</li>
              <li>Verifique se o inventario ainda esta aberto no sistema (nao foi concluido por outro usuario)</li>
              <li>Tente sincronizar novamente e enviar</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-1">O app fecha sozinho (crash)</h4>
            <ul className="text-gray-600 dark:text-gray-300 list-disc list-inside text-sm space-y-1">
              <li>Certifique-se de que esta usando a versao mais recente do APK</li>
              <li>Reinicie o dispositivo</li>
              <li>Limpe o cache do app em Configuracoes &rarr; Aplicativos &rarr; Alisson RFID</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Suporte */}
      <Card title="Suporte">
        <p className="text-gray-600 dark:text-gray-300">
          Em caso de duvidas ou problemas nao listados aqui, entre em contato com o
          suporte tecnico pelo sistema ERP ou diretamente com o desenvolvedor
          responsavel.
        </p>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pb-8">
        App Alisson RFID v{APK_VERSION} &mdash; Documentacao gerada em 14/05/2026
      </div>
    </div>
  );
}
