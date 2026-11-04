/**
 * Grupo 4 — Rastreabilidade, Visão & QR Code
 *
 * ⚠️ MÓDULO PROVISÓRIO (criado pelo G1). Quando o Grupo 4 entregar a tela real,
 * substitua este arquivo mantendo os 3 exports do ciclo de vida Single-SPA:
 *   export async function bootstrap() {}
 *   export async function mount(props)   { ... monte em props.domElement ... }
 *   export async function unmount()      { ... off() nos listeners e desmonte ... }
 * Dados: onSmart40("<evento>", ...) · Comandos: requestCommand(...) · REST: window.smart40.api
 */
import { createProvisionalModule } from "@smart40/ui";

const lifecycles = createProvisionalModule({
  group: 4,
  title: "Rastreabilidade, Visão & QR Code",
  moduleId: "traceability",
  consumes: ["traceability.piece-scanned"],
  commands: [{ target: "TRACEABILITY", action: "MANUAL_SCAN", label: "LEITURA MANUAL" }],
  restPreview: "/api/traceability/history?limit=10",
});

export const { bootstrap, mount, unmount } = lifecycles;
