# SMART 4.0 · Planta N2 — Front-End (Sprint 2: SPA única + API Gateway)

Monorepo da turma. **Grupo 1** é custodiante de `apps/shell`, `packages/contracts`, `packages/ui`, `packages/gateway` e `mock/`.

> ⚠️ Continua sendo **simulação**. Nenhum comando chega a CLP, robô ou esteira. O E-Stop da tela é informativo e **não substitui o E-Stop físico**.

## Rodar (Codespaces ou local, Node 20)

```bash
npm install
npm run dev:all   # sobe tudo num terminal: mock :8080 → API Gateway :8090 → SPA :9000
```

Ou em terminais separados: `npm run mock`, `npm run gateway`, `npm run dev`.

| Comando | O que faz |
|---|---|
| `npm run dev:all` | mock + gateway + Shell juntos (Ctrl+C encerra tudo) |
| `npm run gateway` | API Gateway em http://localhost:8090 |
| `npm run lint` | typecheck de todos os pacotes |
| `npm test` | testes (contrato, GatewayClient, API Gateway) |
| `npm run build` | build único da SPA → `apps/shell/dist` |
| `npm run check:secrets` | procura IP privado/segredo no bundle |
| `npm run stubs` | módulos FAKE dos G2–G5 em :8081–8084 (só teste do G1 do carregamento remoto) |

Em `npm run dev` o Shell faz login na gateway com o token de sala de aula `aluno-token-grupo1` e recebe um JWT.
Para voltar ao modo da Sprint 1 (Shell direto no mock), use `VITE_SMART40_MODE=mock` em `apps/shell/.env.local`.

## Arquitetura (Sprint 2)

```text
┌──────────── SPA única: App Shell + módulos (1 build, 1 deploy) ────────────┐
│ /operacao → apps/ihm   /robo → apps/robot   /rastreabilidade → apps/traceability │
│ /expedicao → apps/expedition        barramento window "smart40:*"            │
│ window.smart40.api.get/post  (REST com JWT, o token fica só no Shell)        │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ ws://…:8090/ws?access_token=JWT     http://…:8090/api/* (Bearer)
┌───────────────▼──────────────── API GATEWAY (packages/gateway) ────────────┐
│ login → JWT · Origin/CORS · allowlist de comandos · limite de taxa · auditoria │
│ tudo sai no contrato Smart40Event · adaptadores por fonte (src/adapters/)     │
└───────────────┬────────────────────────────────────────────────────────────┘
          mock_server_smart40.js (hoje)  →  APIs reais dos G2–G5 (quando entregarem)
```

Decisão registrada em [`docs/ADR-002-spa-unica-api-gateway.md`](docs/ADR-002-spa-unica-api-gateway.md).

## Estrutura

```text
apps/shell/            [G1] Host Single-SPA, navegação, GatewayClient, cliente da API Gateway
apps/ihm/              [G2] @smart40/ihm-siemens            (provisório até o G2 entregar)
apps/robot/            [G3] @smart40/robo-ur                (provisório até o G3 entregar)
apps/traceability/     [G4] @smart40/rastreabilidade-qrcode (provisório até o G4 entregar)
apps/expedition/       [G5] @smart40/expedicao-oee          (provisório até o G5 entregar)
packages/contracts/    [G1] Tipos, envelope Smart40Event, helpers do barramento, adaptador do mock
packages/ui/           [G1] theme.css + IndustrialButton, StatusLed, DataTable, AlertBanner, ProvisionalModule
packages/gateway/      [G1] API Gateway (Node + ws), modo MOCK; adaptadores reais em src/adapters/
mock/                  [G1] mock_server_smart40.js (professor, sem alteração)
stubs/                 [G1] módulos FAKE só para testar carregamento remoto (não são entregas dos grupos)
.devcontainer/         Node 20, portas 8080/8090/9000/8081–8084
```

## API Gateway — rotas

| Método | Rota | Uso | Auth |
|---|---|---|---|
| GET | `/api/health` | status da gateway e da fonte | — |
| POST | `/api/auth/login` | `{ "token": "aluno-token-grupoN" }` → `{ accessToken }` (JWT) | — |
| GET | `/api/app-shell/routes` | rotas do Shell | — |
| WS | `/ws?access_token=JWT` | eventos `Smart40Event` (snapshot ao conectar) + envio de `command.requested` | JWT |
| POST | `/api/commands` | comando pelo REST → `command.ack` | JWT |
| GET | `/api/machine/status` | último `machine.telemetry` (G2) | JWT |
| GET | `/api/robot/kinematics` | último `robot.telemetry` (G3) | JWT |
| GET | `/api/traceability/history?limit=50` | histórico de peças, sem duplicata (G4) | JWT |
| POST | `/api/traceability/scan` | leitura manual simulada (G4) | JWT |
| GET | `/api/expedition/metrics` | último `expedition.metrics` (G5) | JWT |
| GET | `/api/expedition/orders` | ordens de expedição MOCK (G5) | JWT |

Comandos permitidos (o resto é `REJECTED`): MACHINE `START/STOP/RESET/EMERGENCY_STOP/SET_MODE` ·
CONVEYOR `START/STOP` · ROBOT `START/STOP/JOG/GRIPPER_OPEN/GRIPPER_CLOSE` · TRACEABILITY `MANUAL_SCAN` · EXPEDITION `DISPATCH_ORDER`.

Configuração do servidor (variáveis de ambiente, **nunca** no bundle): `PORT`, `SMART40_JWT_SECRET`, `SMART40_ALLOWED_ORIGINS`,
`MOCK_WS_URL`, `MOCK_WS_TOKEN`, `SMART40_SOURCE`, `UNIT_ID`. Deploy: Render/Railway (processo persistente), não na Vercel.

## Como cada grupo encaixa a sua parte

1. **Tela:** substituir `apps/<grupo>/src/index.ts` pela tela real, mantendo `export bootstrap, mount, unmount` (monte em `props.domElement`). Pode ser React ou Vue.
2. **Dados:** `onSmart40("<evento>", cb)` (tempo real) e `window.smart40.api.get("/api/...")` (REST). Nada de WebSocket próprio nem token no módulo.
3. **Comandos:** `requestCommand({ target, action, originModule })`. A gateway valida e responde `command.ack`.
4. **API do grupo (backend):** vira um adaptador em `packages/gateway/src/adapters/` (ver o README de lá). A SPA não muda.
5. Quem ainda entrega por URL: apague a linha do grupo em `apps/shell/src/mfe/localModules.ts` e o Shell volta a usar o `importmap.json`.

## Rotas e módulos

Carregamento: **local** (monorepo, padrão) → override do import-map-overrides ou `VITE_SMART40_MFE_SOURCE=remote` → **remoto** (`importmap.json`) → tela "em produção".

| Rota | Módulo | Grupo | URL remota (alternativa) |
|---|---|---|---|
| `/` | Visão geral (do Shell) | G1 | — |
| `/operacao` | `@smart40/ihm-siemens` | G2 | http://localhost:8081/smart40-ihm-siemens.js |
| `/robo` | `@smart40/robo-ur` | G3 | http://localhost:8082/smart40-robo-ur.js |
| `/rastreabilidade` | `@smart40/rastreabilidade-qrcode` | G4 | http://localhost:8083/smart40-rastreabilidade.js |
| `/expedicao` | `@smart40/expedicao-oee` | G5 | http://localhost:8084/smart40-expedicao-oee.js |

Endpoints do Shell: `/importmap.json` e `/api/app-shell/routes`.

**Enquanto o módulo de um grupo não responde na URL, o Shell mostra a tela "ATENÇÃO — ESTA TELA ESTÁ EM PRODUÇÃO".** Quando o bundle aparece, ele é montado no lugar automaticamente. Nunca fica `SKIP_BECAUSE_BROKEN`.

O Shell aceita bundles **SystemJS** (`System.register`, padrão do create-single-spa) **ou ES Module** (Vite). O bundle precisa exportar `bootstrap`, `mount` e `unmount`. O Shell entrega `props.domElement`: monte nele.

Para apontar um módulo para outra URL sem mexer no repo: `localStorage.setItem('devtools', true)`, recarregar e usar o painel do import-map-overrides (canto inferior direito).

No console (dev): `smart40Apps()` mostra o status Single-SPA de cada módulo.

## Barramento — como os Grupos 2–5 consomem

**Proibido abrir WebSocket próprio.** O Shell mantém a única conexão e publica `window` events `smart40:<type>` com o envelope:

```ts
{ schemaVersion: "0.1.0", eventId, type, timestamp /* ISO UTC */, source: "mock" | "shell" | "ui", data }
```

| Evento | Quem consome | `data` |
|---|---|---|
| `smart40:machine.telemetry` | G2 | status, mode, emergencyActive, safetyInterlockOk, conveyorSpeedPercent, pneumaticPressureBar, alarms |
| `smart40:machine.emergency` | todos | `{ active, simulated: true }`, publicado na transição |
| `smart40:robot.telemetry` | G3 | jointsDeg[6] (°), tcp (mm/°), gripper, programName, programRunning, motorTemperatureC |
| `smart40:traceability.piece-scanned` | G4 | pieceId, qrCode, lot, scannedAt, result, surfaceQualityPercent, reason. **Uma vez por peça.** |
| `smart40:expedition.metrics` | G5 | totalProduced/Approved/Rejected, piecesPerMinute, outputQueueSize, oeePercentMock, `isMock: true` |
| `smart40:connection.state` | todos | CONNECTING / CONNECTED / DISCONNECTED / STALE, lastTelemetryAt, latencyMs (heartbeat 1 s) |
| `smart40:command.requested` | Shell | emitido pelos módulos (use `requestCommand`) |
| `smart40:command.ack` | quem enviou | `{ commandId, status: SIMULATED \| REJECTED, message }` |
| `smart40:telemetria` | legado | payload cru do mock (compatível com o Guia Completo) |

```ts
import { onSmart40, requestCommand } from "@smart40/contracts";

// mount
const off = onSmart40("robot.telemetry", (ev) => render(ev.data.jointsDeg));
const id = requestCommand({ target: "MACHINE", action: "START", originModule: "ihm" }); // simulation:true automático

// unmount (obrigatório)
off();
```

Regras do contrato: campo sem dado é `null` → exibir **N/D**, nunca 0. Com `connection.state` ≠ CONNECTED, mostrar STALE/UNKNOWN e bloquear botões de movimento. Fixtures prontas: `import { robotRunning, machineEmergency } from "@smart40/contracts/fixtures"`.

Mudança que quebra o contrato → PR no `packages/contracts`, versão nova e aprovação dos 5 grupos.

## Comandos (dry-run)

Módulo emite `command.requested` → Shell valida (`simulation: true` obrigatório; sem conexão = REJECTED) → encaminha `START/STOP/RESET/EMERGENCY_STOP` ao mock no formato `{ acao, origem }` → publica `command.ack` SIMULATED. Ações que o mock não conhece (JOG, MANUAL_SCAN…) recebem ACK SIMULATED só na interface.

## Medido no teste local

- Queda do simulador detectada em ~35 ms (SLA < 200 ms) · reconexão < 3 s (backoff máx. 2,5 s)
- Troca de rotas ×15: 0 `SKIP_BECAUSE_BROKEN`, 0 exceções
- Bundle sem IP privado/segredo (`npm run check:secrets`)

## Segurança (runbook, seção 8)

- Nada de `192.168.x.x`, senha, token real ou Basic auth em código, `.env` público ou localStorage.
- O token do mock é de sala de aula; o build de produção só o inclui se `VITE_SMART40_WS_TOKEN` for definido.
- Integração real só na Sprint 2+, via gateway no backend.
