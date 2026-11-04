# Adaptadores da API Gateway

Cada fonte de dados vira **um adaptador** que implementa `UpstreamAdapter` (`types.ts`)
e converte o formato da fonte para `Smart40Event` (`@smart40/contracts`).
A SPA e os módulos G2–G5 **não mudam** quando um adaptador é trocado.

| Adaptador | Status | Fonte (Guia Checklist) | Auth no servidor |
|---|---|---|---|
| `mock.ts` | ✅ pronto | `mock_server_smart40.js` (ws://localhost:8080) | token do mock (env `MOCK_WS_TOKEN`) |
| `ihm.ts` (G2) | ⏳ aguardando G2 | `ws://<IHM>:8081/telemetry`, `GET /api/status` | HMAC |
| `robot.ts` (G3) | ⏳ aguardando G3 | `ws://<UR>:8082/realtime`, `GET /api/kinematics` | Bearer |
| `traceability.ts` (G4) | ⏳ aguardando G4 | `POST /api/scan`, `ws://<QR>:8083/events` | `X-Scanner-Token` |
| `expedition.ts` (G5) | ⏳ aguardando G5 | `GET /api/metrics`, `ws://<EXP>:8084/oee-stream` | OAuth2 |

## Como encaixar o adaptador de um grupo

1. Criar `src/adapters/<grupo>.ts` implementando `UpstreamAdapter`.
2. Mapear o payload do grupo → evento do contrato (`makeEvent("robot.telemetry", {...}, "gateway")`).
3. Endereços e credenciais **só** por variável de ambiente do servidor (nunca no código, nunca no bundle).
4. Registrar em `src/index.ts` (lista `adapters`) e escolher via `SMART40_SOURCE`.
5. `sendCommand` continua retornando `false` (só simulação) até autorização OT (runbook seção 8).
