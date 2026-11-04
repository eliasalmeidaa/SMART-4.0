/**
 * Contrato de um adaptador de fonte de dados (upstream).
 * Cada grupo/fonte real (IHM Siemens, Robô UR, QR, Expedição) vira UM adaptador
 * que converte o formato dele para Smart40Event. A SPA não percebe a troca.
 */
import type { CommandRequested, Smart40Event } from "@smart40/contracts";

export type UpstreamStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

export interface UpstreamAdapter {
  /** Nome para logs/health (ex.: "mock", "ihm-siemens"). */
  readonly name: string;
  readonly status: UpstreamStatus;
  start(onEvent: (ev: Smart40Event) => void): void;
  stop(): void;
  /**
   * Repassa um comando JÁ VALIDADO pela gateway.
   * Retorna true se a fonte entende o comando; false = só registrado na interface.
   * Sprint 2: nenhum adaptador escreve em CLP/robô real.
   */
  sendCommand(cmd: CommandRequested): boolean;
}
