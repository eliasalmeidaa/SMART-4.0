import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SCHEMA_VERSION } from "@smart40/contracts";
import "@smart40/ui/theme.css";
import "@smart40/ui/components.css";
import "./shell.css";
import { App } from "./App";
import { GatewayClient, type GatewayMode } from "./gateway/GatewayClient";
import { createGatewayApi } from "./gateway/api";

const t0 = performance.now();

// Sprint 2: padrão "gateway" (API Gateway em :8090). "mock" = conexão direta da Sprint 1.
const mode: GatewayMode = import.meta.env.VITE_SMART40_MODE === "mock" ? "mock" : "gateway";

// Token de sala de aula (mock). Em `npm run dev` usa o do Grupo 1 se não houver .env.local;
// no build de produção só entra se for definido explicitamente. Nunca usar credencial real aqui.
const classroomToken = import.meta.env.VITE_SMART40_WS_TOKEN ?? (import.meta.env.DEV ? "aluno-token-grupo1" : undefined);

const apiUrl = import.meta.env.VITE_SMART40_API_URL ?? "http://localhost:8090";
const api = mode === "gateway" ? createGatewayApi(apiUrl, classroomToken) : undefined;

// Conexão ÚNICA da aplicação. Módulos G2–G5 só escutam window "smart40:*".
const gateway = new GatewayClient(
  mode === "gateway"
    ? {
        mode,
        url: import.meta.env.VITE_SMART40_WS_URL ?? `${apiUrl.replace(/^http/, "ws")}/ws`,
        getAccessToken: api!.getAccessToken,
        invalidateAccessToken: api!.invalidate,
      }
    : {
        mode,
        url: import.meta.env.VITE_SMART40_WS_URL ?? "ws://localhost:8080",
        token: classroomToken,
      },
);

window.smart40 = {
  schemaVersion: SCHEMA_VERSION,
  getLast: (type) => gateway.getLast(type),
  api: api ? { get: api.get, post: api.post } : undefined,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

gateway.start();

// Promise rejeitada sem tratamento = bug (DoD: zero unhandled rejections)
window.addEventListener("unhandledrejection", (e) => console.error("[smart40/shell] unhandledrejection", e.reason));

requestAnimationFrame(() =>
  console.info(`[smart40/shell] montado em ${(performance.now() - t0).toFixed(1)} ms · contrato v${SCHEMA_VERSION} · modo ${mode}`),
);

if (import.meta.hot) import.meta.hot.dispose(() => gateway.stop());
