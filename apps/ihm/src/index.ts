/**
 * Grupo 2 — IHM Siemens & Botoeira
 *
 * ⚠️ MÓDULO PROVISÓRIO (criado pelo G1). Quando o Grupo 2 entregar a tela real,
 * substitua este arquivo mantendo os 3 exports do ciclo de vida Single-SPA:
 *   export async function bootstrap() {}
 *   export async function mount(props)   { ... monte em props.domElement ... }
 *   export async function unmount()      { ... off() nos listeners e desmonte ... }
 * Dados: onSmart40("<evento>", ...) · Comandos: requestCommand(...) · REST: window.smart40.api
 */
import { createProvisionalModule } from "@smart40/ui";

const lifecycles = createProvisionalModule({
  group: 2,
  title: "IHM Siemens & Botoeira",
  moduleId: "ihm",
  consumes: ["machine.telemetry", "machine.emergency"],
  commands: [
    { target: "MACHINE", action: "START" },
    { target: "MACHINE", action: "STOP" },
    { target: "MACHINE", action: "RESET" },
    { target: "MACHINE", action: "EMERGENCY_STOP", label: "EMERGÊNCIA" },
  ],
  restPreview: "/api/machine/status",
});

export const { bootstrap, mount, unmount } = lifecycles;
