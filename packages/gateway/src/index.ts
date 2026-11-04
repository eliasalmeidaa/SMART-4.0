/**
 * Entrada da API Gateway.  npm run gateway  →  http://localhost:8090
 *
 * Fonte padrão: mock_server_smart40.js (rode antes: npm run mock).
 * Quando os grupos entregarem as APIs reais, cada uma vira um adaptador em src/adapters/.
 */
import { config } from "./config";
import { createGateway } from "./server";
import { MockAdapter } from "./adapters/mock";
import type { UpstreamAdapter } from "./adapters/types";

const adapters: Record<string, () => UpstreamAdapter> = {
  mock: () => new MockAdapter(config.mock),
  // ihm: () => new IhmAdapter(...),            ← G2 (aguardando entrega)
  // robot: () => new RobotAdapter(...),        ← G3
  // traceability: () => new QrAdapter(...),    ← G4
  // expedition: () => new ExpeditionAdapter(...) ← G5
};

const make = adapters[config.source];
if (!make) {
  console.error(`[gateway] SMART40_SOURCE="${config.source}" não existe. Opções: ${Object.keys(adapters).join(", ")}`);
  process.exit(1);
}

const gw = createGateway(config, make());
const port = await gw.listen();

if (!config.jwt.secretFromEnv) {
  console.warn("[gateway] SMART40_JWT_SECRET não definido: usando segredo aleatório (tokens expiram ao reiniciar).");
}
console.log(`
================================================================
🛡  API GATEWAY SMART 4.0 — ${config.unitId}
================================================================
HTTP  http://localhost:${port}/api/health
WS    ws://localhost:${port}/ws?access_token=<JWT>
Login POST /api/auth/login  { "token": "aluno-token-grupo1" }
Fonte: ${config.source} (${config.source === "mock" ? config.mock.url : "real"})
================================================================
`);

const shutdown = () => void gw.close().then(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
