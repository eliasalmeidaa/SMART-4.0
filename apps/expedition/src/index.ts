/**
 * Grupo 5 — Posto de Expedição & Métricas
 *
 * ⚠️ MÓDULO PROVISÓRIO (criado pelo G1). Quando o Grupo 5 entregar a tela real,
 * substitua este arquivo mantendo os 3 exports do ciclo de vida Single-SPA:
 *   export async function bootstrap() {}
 *   export async function mount(props)   { ... monte em props.domElement ... }
 *   export async function unmount()      { ... off() nos listeners e desmonte ... }
 * Dados: onSmart40("<evento>", ...) · Comandos: requestCommand(...) · REST: window.smart40.api
 */
import { createProvisionalModule } from "@smart40/ui";

const lifecycles = createProvisionalModule({
  group: 5,
  title: "Posto de Expedição & Métricas",
  moduleId: "expedition",
  consumes: ["expedition.metrics"],
  commands: [{ target: "EXPEDITION", action: "DISPATCH_ORDER", label: "DESPACHAR ORDEM" }],
  restPreview: "/api/expedition/orders",
});

export const { bootstrap, mount, unmount } = lifecycles;
