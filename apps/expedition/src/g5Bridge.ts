/**
 * Ponte G1 -> G5 (teste de integração).
 *
 * O Shell (G1) mantém a ÚNICA conexão e publica eventos do contrato v0.1 (`smart40:*`).
 * A biblioteca do G5 espera o snapshot legado `smart40:telemetria`. Esta ponte:
 *   1. escuta `machine.telemetry`, `expedition.metrics` e `connection.state` no barramento;
 *   2. remonta o snapshot legado (estadoGlobal + metricasExpedicao) e entrega ao processador do G5
 *      por um EventTarget PRIVADO (não polui o window dos outros módulos);
 *   3. devolve os snapshots calculados pelo G5 (OEE, PPM, estação, conexão).
 * Não abre socket, não guarda token e não envia comando à máquina.
 */
import { onSmart40, type MachineStatus, type ConnectionStatus } from "@smart40/contracts";
import {
  attachExpeditionToShell,
  createExpeditionProcessor,
  dispatchSmart40Telemetry,
  EXPEDITION_CONNECTION_EVENT,
  EXPEDITION_DIAGNOSTIC_EVENT,
  type ExpeditionSnapshot,
} from "../../../grupos/g5-expedicao/FrontEnd/src/processing/index.ts";

export type { ExpeditionSnapshot };

/** Contrato v0.1 (G1) -> vocabulário do simulador que o adaptador do G5 entende. */
const STATUS_TO_LEGACY: Partial<Record<MachineStatus, string>> = {
  RUNNING: "EM_EXECUCAO",
  READY: "PRONTA",
  STOPPED: "PRONTA",
  EMERGENCY: "PARADA_EMERGENCIA",
};

export interface G5BridgeOptions {
  onSnapshot: (snapshot: ExpeditionSnapshot) => void;
  onDiagnostic?: (reason: string) => void;
  target?: Window;
  /** Época dos contadores: uma por sessão do simulador. */
  counterEpoch?: string;
  refreshMs?: number;
}

export function startG5Bridge(opts: G5BridgeOptions): () => void {
  const bus = opts.target ?? window;
  const local = new EventTarget();
  const processor = createExpeditionProcessor({
    unitId: "UNIDADE-SP",
    assetId: "N2-EXPEDICAO",
    origin: "simulado",
    productionMode: "counters",
    // Começa um pouco no passado para aceitar o snapshot inicial do Shell.
    startedAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const binding = attachExpeditionToShell({
    target: local,
    processor,
    refreshMs: opts.refreshMs ?? 1000,
    onMetrics: opts.onSnapshot,
    projectTelemetry: {
      unitId: "UNIDADE-SP",
      assetId: "N2-EXPEDICAO",
      origin: "simulado",
      quality: "GOOD",
      counterEpoch: opts.counterEpoch ?? `sessao-${new Date().toISOString().slice(0, 10)}`,
    },
  });
  const onDiag = (e: Event) => {
    const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
    if (reason) opts.onDiagnostic?.(reason);
  };
  local.addEventListener(EXPEDITION_DIAGNOSTIC_EVENT, onDiag);

  let estadoGlobal: string | undefined;
  let metricas: { pecasAprovadasCount: number; pecasRejeitadasCount: number; pecasProcessadasTotal: number } | undefined;

  const forward = (timestamp: string) => {
    const snapshot: Record<string, unknown> = { timestamp };
    if (estadoGlobal) snapshot.estadoGlobal = estadoGlobal;
    if (metricas) snapshot.metricasExpedicao = metricas;
    if (!estadoGlobal && !metricas) return;
    try {
      dispatchSmart40Telemetry(local, snapshot);
    } catch (err) {
      opts.onDiagnostic?.((err as Error).message);
    }
  };

  const offMachine = onSmart40(
    "machine.telemetry",
    (ev) => {
      estadoGlobal = STATUS_TO_LEGACY[ev.data.status];
      forward(ev.timestamp);
    },
    bus,
  );
  const offMetrics = onSmart40(
    "expedition.metrics",
    (ev) => {
      metricas = {
        pecasAprovadasCount: ev.data.totalApproved,
        pecasRejeitadasCount: ev.data.totalRejected,
        pecasProcessadasTotal: ev.data.totalProduced,
      };
      forward(ev.timestamp);
    },
    bus,
  );
  const sendConnection = (status: ConnectionStatus) => {
    const g5 = status === "CONNECTED" ? "CONNECTED" : status === "CONNECTING" ? null : "DISCONNECTED";
    if (g5) local.dispatchEvent(new CustomEvent(EXPEDITION_CONNECTION_EVENT, { detail: g5 }));
  };
  const offConn = onSmart40("connection.state", (ev) => sendConnection(ev.data.status), bus);

  // Estado atual do Shell (quem montou a tela depois da primeira mensagem não espera o próximo ciclo).
  const last = bus.smart40;
  const conn = last?.getLast("connection.state");
  if (conn) sendConnection(conn.data.status);
  const m = last?.getLast("machine.telemetry");
  if (m) estadoGlobal = STATUS_TO_LEGACY[m.data.status];
  const x = last?.getLast("expedition.metrics");
  if (x) {
    metricas = { pecasAprovadasCount: x.data.totalApproved, pecasRejeitadasCount: x.data.totalRejected, pecasProcessadasTotal: x.data.totalProduced };
    forward(x.timestamp);
  }

  return () => {
    offMachine();
    offMetrics();
    offConn();
    local.removeEventListener(EXPEDITION_DIAGNOSTIC_EVENT, onDiag);
    binding.dispose();
  };
}
