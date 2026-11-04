/**
 * Adaptador MOCK: conecta no mock_server_smart40.js do professor (ws://localhost:8080)
 * e converte o payload cru em eventos do contrato. O token do mock fica no servidor.
 */
import WebSocket from "ws";
import { adaptMockPayload, isMockTelemetryPayload, MOCK_ACTIONS, type CommandRequested, type Smart40Event } from "@smart40/contracts";
import type { UpstreamAdapter, UpstreamStatus } from "./types";

export interface MockAdapterOptions {
  url: string;
  token: string;
  reconnectMs: number;
}

export class MockAdapter implements UpstreamAdapter {
  readonly name = "mock";
  status: UpstreamStatus = "DISCONNECTED";
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private onEvent: (ev: Smart40Event) => void = () => {};

  constructor(private opts: MockAdapterOptions) {}

  start(onEvent: (ev: Smart40Event) => void): void {
    this.onEvent = onEvent;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.removeAllListeners();
    this.ws?.close();
    this.ws = null;
    this.status = "DISCONNECTED";
  }

  sendCommand(cmd: CommandRequested): boolean {
    if (!MOCK_ACTIONS.has(cmd.action) || cmd.target === "ROBOT") return false; // mock só entende máquina
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ acao: cmd.action, origem: cmd.originModule, commandId: cmd.commandId, simulation: true }));
    return true;
  }

  private connect(): void {
    if (!this.running) return;
    this.status = "CONNECTING";
    const sep = this.opts.url.includes("?") ? "&" : "?";
    const ws = new WebSocket(`${this.opts.url}${sep}token=${encodeURIComponent(this.opts.token)}`);
    this.ws = ws;
    ws.on("open", () => {
      this.status = "CONNECTED";
      console.log(`[gateway/mock] conectado em ${this.opts.url}`);
    });
    ws.on("message", (buf) => {
      let data: unknown;
      try {
        data = JSON.parse(buf.toString());
      } catch {
        return;
      }
      if (!isMockTelemetryPayload(data)) return;
      for (const ev of adaptMockPayload(data)) this.onEvent(ev);
    });
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.status = "DISCONNECTED";
      this.ws = null;
      if (this.running) this.timer = setTimeout(() => this.connect(), this.opts.reconnectMs);
    });
    ws.on("error", (err) => {
      console.warn(`[gateway/mock] ${err.message}`);
    });
  }
}
