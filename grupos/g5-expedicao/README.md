# g5-expedicao

Módulo do Grupo 5 do projeto SMART 4.0: processamento de Expedição e OEE e integração com o App Shell do Grupo 1.

A entrega da Sprint 2 é uma biblioteca TypeScript **sem tela própria**. Recebe eventos, valida e deduplica peças, acompanha a expedição e fornece indicadores ao App Shell do Grupo 1. O React existente permanece como demonstração local e não integra o pacote de entrega.

O escopo segue a orientação mais recente do professor, reproduzida na conversa fornecida pelo usuário. A pasta `FrontEnd/docs` não foi usada como requisito desta implementação.

Os PDFs adicionais esclareceram o barramento `smart40:telemetria`, o broker WSS do Caminho A e a API MES. A [API MES opcional](integration/api-mes/README.md) já implementa os cinco eventos, sem alterar a biblioteca sem tela.

Uma inspeção anterior registrou Node-RED 3.0.2, leitura S7 online e API de ordens acessível na bancada. O estado atual depende da conexão à rede industrial. O comando `npm run plant:inspect` compila a biblioteca e executa a inspeção; o mapa registrado está em `integration/plant/n2-expedition-tags.json`. O adaptador resolve o número de OP do CLP pelo código/trackingCode, sem confundi-lo com o id da API.

## Executar e verificar

Pré-requisitos: Node.js 22.18+ e npm. PostgreSQL é necessário apenas para a API MES; Docker Compose é opcional para executar Mosquitto e Node-RED.

Partindo da raiz do monorepo `SMART-4.0`, entre na pasta do grupo. Execute os demais comandos deste README dentro de `grupos/g5-expedicao`:

```sh
cd grupos/g5-expedicao
npm ci
npm --prefix FrontEnd ci
npm test
npm run test:e2e
npm run build:release
```

No PowerShell com scripts bloqueados, use `npm.cmd`. O teste integrado cria brokers locais, executa o **Node-RED real**, valida TLS/autenticação em uma nuvem simulada, entrega eventos ao Shell e verifica persistência após reinício. Não acessa a bancada ou brokers públicos.

`release/` contém o módulo ESM `processing/index.js`, suas declarações TypeScript, `manifest.json` e os fluxos `flows.local.json` e `flows.cloud.json`. Não há HTML ou React nesse pacote.

Os fluxos exportados usam `functionGlobalContext.expedition`, configurado por `integration/node-red/start.mjs`. Para importá-los em outra instalação Node-RED, é necessário instalar a biblioteca e portar esse contexto de execução.

### Demonstração React

Para abrir o painel demonstrativo com dados simulados:

```sh
npm --prefix FrontEnd run dev
```

Acesse `http://localhost:8084`. Essa demonstração é separada da biblioteca de processamento e não representa leitura contínua da bancada.

## Consumir no Grupo 1

Importe `FrontEnd/src/processing/index.ts` no monorepo, instale `release/` como pacote local ou hospede seus arquivos ESM. A importação não abre sockets nem registra listeners.

```ts
import {
  createExpeditionProcessor, attachExpeditionToShell,
  dispatchSmart40Telemetry, EXPEDITION_CONNECTION_EVENT,
  EXPEDITION_METRICS_EVENT,
} from '@smart40/expedition-processing';

const processor = createExpeditionProcessor({
  unitId: 'UNIDADE-SP', assetId: 'N2-EXPEDICAO', origin: 'medido',
  productionMode: 'pieces',
  // O Shell fornece armazenamento durável por ativo e origem:
  // storage: { load: () => checkpoint, save: serialized => persist(serialized) },
});
window.addEventListener(EXPEDITION_METRICS_EVENT, event => {
  const snapshot = (event as CustomEvent).detail;
  console.log(snapshot.totalProduced, snapshot.oee, snapshot.ppm);
});
const binding = attachExpeditionToShell({ target: window, processor });

// Nos callbacks da conexão central JÁ pertencente ao Shell:
// onmessage: dispatchSmart40Telemetry(window, data);
// onopen: window.dispatchEvent(new CustomEvent(EXPEDITION_CONNECTION_EVENT,
//   { detail: 'CONNECTED' }));
// onclose/onerror: idem com 'DISCONNECTED'.
// Ao desmontar: binding.dispose();
```

`storage.save` é síncrono e deve concluir antes da confirmação. Sem armazenamento fornecido pelo hospedeiro, o estado é apenas de memória. O runtime Node-RED usa arquivo com escrita atômica. Checkpoint inválido gera erro e é preservado, sem retorno silencioso a mocks.

O contrato está em [contracts.ts](FrontEnd/src/processing/contracts.ts), as regras em [processor.ts](FrontEnd/src/processing/processor.ts) e os eventos em [appShell.ts](FrontEnd/src/processing/appShell.ts). O JSON v1 e os nomes de eventos são uma **proposta implementada e testada**, ainda sujeita à confirmação do Grupo 1 e da automação.

O nome global `smart40:telemetria` está documentado nos PDFs; a extensão v1 de eventos continua sujeita a acordo. Para snapshots legados, `attachExpeditionToShell` aceita `projectTelemetry: { unitId, assetId, origin, quality, counterEpoch? }`. A qualidade da fonte precisa ser declarada explicitamente, e contadores exigem `productionMode: 'counters'` e época conhecida. Snapshots de magazine/estado não geram produção fictícia. `snapshot.oeeSimplified` entrega a fórmula de FFE p.9 (qualidade); `snapshot.oee` entrega D×P×Q quando houver insumos.

## Node-RED, MQTT e nuvem

```mermaid
flowchart LR
  PLC[CLP · leitura pela automação] --> N[Node-RED · normalização JSON v1]
  N --> M[MQTT local · QoS 1]
  M --> G[Fluxo de referência · processamento]
  G --> C[MQTT nuvem · TLS e autenticação]
  G --> W[WebSocket · eventos ou resultados]
  W --> S[App Shell · Grupo 1]
  S --> P[Biblioteca Grupo 5 · sem tela]
  P --> R[Indicadores para Grupo 1]
```

O fluxo inclui um processador no gateway para execução independente e validação. Na turma, o Grupo 1 pode executar a biblioteca com os eventos ou consumir os resultados prontos do gateway. Não deve somar os dois. Cada instância é exclusiva para uma unidade, ativo e origem.

Copie `integration/node-red/.env.example` para `.env` **na mesma pasta** e configure localmente. Com um broker MQTT disponível:

```sh
npm run build
npm run node-red
```

Com Docker, após criar o `.env`, execute `docker compose up --build -d`. O Compose inclui Mosquitto e Node-RED, volumes persistentes e portas publicadas somente em localhost. A configuração anônima do Mosquitto serve à demonstração local; o broker da turma deve usar autenticação e ACL próprias.

| Recurso | Endereço padrão |
| --- | --- |
| Diagnóstico | `http://127.0.0.1:1880/health` |
| Editor, se habilitado | `http://127.0.0.1:1880/red` |
| Eventos para a conexão central do Shell | `ws://127.0.0.1:1880/ws/telemetry` |
| Resultados `{type: "expedition.metrics", data: snapshot}` | `ws://127.0.0.1:1880/ws/expedition` |
| MQTT de entrada | `smart40/UNIDADE-SP/N2-EXPEDICAO/telemetry` |
| MQTT de resultados | `smart40/UNIDADE-SP/N2-EXPEDICAO/metrics` |

Resultados MQTT usam retained; eventos de peças não. O Shell verifica `computedAt`, observa desconexões e mantém checkpoint. O WebSocket de eventos é ao vivo e não reproduz histórico para clientes novos. Para retomada completa, consuma snapshots do processador persistido do gateway ou combine replay com o Grupo 1.

Para demonstração, use `DATA_ORIGIN=simulado` no `.env`, inicie o runtime e execute `npm run demo:mqtt` em outro terminal. Serão enviadas duas peças, uma duplicata intencional e as etapas de uma saída. A origem `medido` recusa eventos simulados; não misture simulação e produção no mesmo checkpoint.

O armazenamento padrão separa unidade, ativo, origem e modo em subpastas de `integration/node-red/data/`. Se definir `NODE_RED_DATA_DIR`, use um diretório exclusivo para cada instância.

Quando houver broker de nuvem, preencha `MQTT_CLOUD_HOST`, `MQTT_CLOUD_USERNAME`, `MQTT_CLOUD_PASSWORD` no **ambiente do Node-RED** e use `MQTT_CLOUD_ENABLED=true`. A porta padrão é 8883, com verificação de certificado e hostname. A ponte envia telemetria/resultados local → nuvem, sem assinar de volta os próprios tópicos. Credenciais não entram no frontend ou nos arquivos versionados. `/health` informa o estado da nuvem. Clientes do Grupo 1 precisam de credenciais próprias de leitura; no navegador, MQTT exige o endpoint WSS do broker.

A automação conecta sua leitura ao Link In **“Entrada da automação: JSON v1 normalizado”**. Os novos PDFs propõem S7 e trazem endereços DB1 ilustrativos; o mapa do programa real e a configuração de acesso ao CLP ainda precisam ser homologados. Os exemplos não foram usados para acessar a bancada.

Para o broker **WebSocket** do Caminho A, configure `BROKER_URL` e `TOKEN_AGENTE` no ambiente do Node-RED. Isso é diferente de `MQTT_CLOUD_HOST`. A ponte de saída usa WSS com token, reconexão, heartbeat e fila pendente em disco; não executa comandos recebidos. O Shell continua com uma única conexão e usa `dispatchSmart40Telemetry` para separar eventos G5 dos snapshots dos demais módulos. Não mantenha o agente do Grupo 1 e esta ponte com o mesmo token de agente; a escolha do publicador pertence à integração da turma. O teste usa uma instância local autenticada, não a URL ilustrativa dos PDFs.

## API MES: execução, rotas e autenticação

A API MES é opcional e roda separada do Node-RED e da demonstração React. O endereço padrão é `http://127.0.0.1:4321`.

### Como executar

Com as dependências instaladas, tenha um banco PostgreSQL criado e acessível. No PowerShell, copie o arquivo de configuração:

```powershell
Copy-Item integration/api-mes/.env.example integration/api-mes/.env
```

Se o `.env` já existir, edite a configuração existente. Configure em `integration/api-mes/.env`:

| Variável | Configuração |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL: `postgresql://USUARIO:SENHA@HOST:5432/BANCO`, substituindo os campos pelos dados do seu banco |
| `PG_SSL_MODE` | `disable` apenas para banco local de teste sem TLS; `verify-full` para verificar o certificado do banco remoto |
| `PG_CA_FILE` | Caminho da autoridade certificadora, se necessário para o banco |
| `MES_HOST` | `127.0.0.1` por padrão |
| `PORT` | `4321` por padrão |
| `MES_TOKENS_JSON` | Lista de tokens por unidade e papel, conforme o exemplo abaixo |
| `MES_ALLOWED_ORIGINS` | Origens autorizadas, separadas por vírgula; por exemplo, `http://localhost:8084` para a demonstração local ou a origem real do Shell |

Prepare as tabelas e inicie o serviço:

```sh
npm run mes:migrate
npm run mes:start
```

A migração cria o schema `smart40_mes` e suas tabelas; não cria o servidor PostgreSQL nem o banco. O usuário configurado precisa ter permissão para criar esse schema. O serviço carrega automaticamente o `.env` da pasta `integration/api-mes`.

### Autenticação

As rotas `/api/Events` exigem o cabeçalho:

```http
Authorization: Bearer <TOKEN_CONFIGURADO>
```

Em `MES_TOKENS_JSON`, configure um array JSON em uma única linha:

```dotenv
MES_TOKENS_JSON=[{"token":"<TOKEN_UNICO_DE_LEITURA>","unitId":"UNIDADE-SP","role":"read"},{"token":"<TOKEN_UNICO_DE_ESCRITA>","unitId":"UNIDADE-SP","role":"write"}]
```

Substitua os placeholders por tokens diferentes, com pelo menos 16 caracteres cada. Não versione valores reais no repositório.

- `read`: permite consultar ordens, histórico e métricas.
- `write`: permite registrar eventos e também fazer consultas.
- `unitId`: limita os dados acessíveis à unidade associada ao token.
- `GET /health`: não exige token; verifica a disponibilidade do banco.
- Requisições de navegador devem usar uma origem cadastrada em `MES_ALLOWED_ORIGINS`. CORS não substitui o token.

Tokens de escrita pertencem ao agente/gateway, não ao frontend. Para acesso externo, use HTTPS. A API não oferece rota de login ou emissão de tokens: as credenciais são provisionadas por configuração.

### Rotas

Base padrão: `http://127.0.0.1:4321`.

| Método | Rota | Permissão | Descrição |
| --- | --- | --- | --- |
| GET | `/health` | Pública | Estado da API e conexão com o banco |
| POST | `/api/Events/order/movedin` | write | Registra a entrada da ordem na estação |
| POST | `/api/Events/process/started` | write | Registra início do processo; exige `processCode` |
| POST | `/api/Events/process/finished` | write | Registra fim do processo; exige `processCode` |
| POST | `/api/Events/order/movedout` | write | Registra a saída da ordem da estação |
| POST | `/api/Events/order/completed` | write | Conclui a ordem; aceita somente `componentId: 4` |
| GET | `/api/Events/order/current` | read/write | Ordem observada em produção mais recentemente, ou `null` |
| GET | `/api/Events/order/:trackingCode` | read/write | Ordem e histórico de eventos; substitua `:trackingCode` pelo código da ordem |
| GET | `/api/Events/metrics` | read/write | Contagens de ordens criadas, em produção e concluídas |

Os POSTs exigem `Content-Type: application/json`. Exemplo de corpo para entrada de uma ordem:

```json
{
  "eventId": "evento-estavel-001",
  "componentId": 4,
  "trackingCode": "OP1",
  "timeStamp": "2026-11-11T12:00:00Z"
}
```

`componentId` aceita as estações de 1 a 4. Para os eventos `started` e `finished`, acrescente `processCode` como texto. Preserve o mesmo `eventId` nas retransmissões da mesma ocorrência.

Uma gravação nova retorna `201`; uma repetição idêntica retorna `200` com `duplicate: true`. Reutilizar um ID com conteúdo diferente retorna `409`. Token ausente/inválido retorna `401`; papel, unidade ou origem não autorizados retornam `403`.

As métricas dessa API contam **ordens**, não peças aprovadas/rejeitadas, e não calculam OEE. Mais detalhes no [README da API MES](integration/api-mes/README.md).

### Autenticação do Node-RED e dos brokers

A autenticação MES é independente das integrações de telemetria:

- MQTT de nuvem: `MQTT_CLOUD_USERNAME` e `MQTT_CLOUD_PASSWORD`, com TLS e permissões próprias no broker.
- Ponte WSS: `BROKER_URL` e `TOKEN_AGENTE` no ambiente do Node-RED; o código envia o token na query da conexão.
- Editor Node-RED: `NODE_RED_ADMIN_USER` e `NODE_RED_ADMIN_HASH` para configurar autenticação. No Compose, o editor fica desabilitado.
- A demonstração local usa Mosquitto anônimo. Os endpoints locais do Node-RED não usam o Bearer da API MES; o Compose publica suas portas somente em localhost.

## Entrega e publicação

O workflow de CI executa testes, integração e builds. `vercel.json` prepara a hospedagem **estática da biblioteca**, com CORS para importação pelo Shell. Node-RED e MQTT são processos persistentes separados dessa hospedagem.

Ao publicar este módulo a partir do monorepo `SMART-4.0`, configure `grupos/g5-expedicao` como diretório raiz do projeto de hospedagem, para que os comandos e o `vercel.json` desta pasta sejam usados. A configuração prepara a publicação da biblioteca; a integração com o Shell e os serviços de telemetria depende dos destinos e contratos acordados com a turma.