/**
 * Grupo 3 — Cobot Universal Robots
 *
 * ⚠️ MÓDULO PROVISÓRIO (criado pelo G1). Quando o Grupo 3 entregar a tela real,
 * substitua este arquivo mantendo os 3 exports do ciclo de vida Single-SPA:
 *   export async function bootstrap() {}
 *   export async function mount(props)   { ... monte em props.domElement ... }
 *   export async function unmount()      { ... off() nos listeners e desmonte ... }
 * Dados: onSmart40("<evento>", ...) · Comandos: requestCommand(...) · REST: window.smart40.api
 */
import { createProvisionalModule } from "@smart40/ui";

const lifecycles = createProvisionalModule({
  group: 3,
  title: "Cobot Universal Robots",
  moduleId: "robot",
  consumes: ["robot.telemetry"],
  commands: [
    { target: "ROBOT", action: "GRIPPER_OPEN" },
    { target: "ROBOT", action: "GRIPPER_CLOSE" },
    { target: "ROBOT", action: "JOG", params: { joint: 1, deltaDeg: 5 } },
  ],
  restPreview: "/api/robot/kinematics",
});

export const { bootstrap, mount, unmount } = lifecycles;
