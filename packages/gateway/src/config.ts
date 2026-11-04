/**
 * Configuração da API Gateway. TUDO que é sensível ou muda por unidade vem do
 * ambiente (.env do servidor) — nunca do bundle da SPA.
 */
import { randomBytes } from "node:crypto";

const env = process.env;
const list = (v: string | undefined, def: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : def;

const jwtSecretFromEnv = env.SMART40_JWT_SECRET;

export const config = {
  port: Number(env.PORT ?? 8090),

  /** Unidade física (Sprint 2, seção 3.IV: isolar por unidade). */
  unitId: env.UNIT_ID ?? "UNIDADE-SP",

  jwt: {
    /** Sem SMART40_JWT_SECRET: segredo aleatório por execução (ok para aula, tokens morrem ao reiniciar). */
    secret: jwtSecretFromEnv ?? randomBytes(32).toString("hex"),
    secretFromEnv: Boolean(jwtSecretFromEnv),
    ttlSeconds: Number(env.SMART40_JWT_TTL_S ?? 8 * 3600),
  },

  /**
   * Tokens de sala de aula aceitos no login (POST /api/auth/login) e trocados por JWT.
   * São os mesmos do mock_server_smart40.js — não são credenciais reais.
   */
  classroomTokens: list(env.SMART40_CLASSROOM_TOKENS, [
    "smart40-token-2026",
    "aluno-token-grupo1",
    "aluno-token-grupo2",
    "aluno-token-grupo3",
    "aluno-token-grupo4",
    "aluno-token-grupo5",
  ]),

  /** Origens permitidas (CORS + handshake WS). localhost/127.0.0.1 sempre liberados em dev. */
  allowedOrigins: list(env.SMART40_ALLOWED_ORIGINS, ["http://localhost:9000", "https://smart40-shell.vercel.app"]),

  /** Fonte de dados. "mock" = mock_server_smart40.js do professor. Adaptadores reais: ver src/adapters/README.md */
  source: (env.SMART40_SOURCE ?? "mock") as "mock",

  mock: {
    url: env.MOCK_WS_URL ?? "ws://localhost:8080",
    /** Token do gateway no mock: fica SÓ no servidor. */
    token: env.MOCK_WS_TOKEN ?? "smart40-token-2026",
    reconnectMs: 1000,
  },

  /** Limite de comandos por conexão/cliente (runbook seção 3: limitação de taxa). */
  commandRateLimit: { perSecond: Number(env.SMART40_CMD_RATE ?? 5) },

  /** Histórico de rastreabilidade mantido em memória (G4). */
  historyMax: Number(env.SMART40_HISTORY_MAX ?? 500),
};

export type GatewayConfig = typeof config;
