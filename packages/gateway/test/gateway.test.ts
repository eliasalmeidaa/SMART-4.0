// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { makeEvent, type CommandRequested, type Smart40Event } from "@smart40/contracts";
import { config } from "../src/config";
import { checkCommand, RateLimiter } from "../src/commands";
import { signJwt, verifyJwt } from "../src/jwt";
import { GatewayStore } from "../src/store";
import { createGateway, type GatewayInstance } from "../src/server";
import type { UpstreamAdapter, UpstreamStatus } from "../src/adapters/types";

class FakeAdapter implements UpstreamAdapter {
  readonly name = "fake";
  status: UpstreamStatus = "CONNECTED";
  sent: CommandRequested[] = [];
  emit: (ev: Smart40Event) => void = () => {};
  start(onEvent: (ev: Smart40Event) => void) {
    this.emit = onEvent;
  }
  stop() {}
  sendCommand(cmd: CommandRequested) {
    if (cmd.target !== "MACHINE") return false;
    this.sent.push(cmd);
    return true;
  }
}

const cmd = (over: Partial<CommandRequested> = {}) => ({
  commandId: "c1",
  target: "MACHINE",
  action: "START",
  originModule: "ihm",
  simulation: true,
  ...over,
});

const scan = (pieceId: string) =>
  makeEvent(
    "traceability.piece-scanned",
    { pieceId, qrCode: pieceId, lot: null, scannedAt: new Date().toISOString(), result: "APPROVED", surfaceQualityPercent: 99, reason: null },
    "mock",
  );

describe("JWT", () => {
  it("assina, valida e recusa adulterado/expirado", () => {
    const t = signJwt({ sub: "grupo1", group: 1, role: "operator" }, "s", 60);
    expect(verifyJwt(t, "s")?.sub).toBe("grupo1");
    expect(verifyJwt(t, "outro")).toBeNull();
    expect(verifyJwt(t.slice(0, -2) + "xx", "s")).toBeNull();
    expect(verifyJwt(t, "s", Date.now() + 61_000)).toBeNull();
  });
});

describe("política de comandos", () => {
  it("aceita só o que está na allowlist e com simulation:true", () => {
    expect(checkCommand(cmd()).ok).toBe(true);
    expect(checkCommand(cmd({ action: "JOG" as never })).ok).toBe(false);
    expect(checkCommand(cmd({ target: "PLC" as never })).ok).toBe(false);
    expect(checkCommand({ ...cmd(), simulation: false }).ok).toBe(false);
    expect(checkCommand(cmd({ originModule: "hacker" as never })).ok).toBe(false);
  });
  it("limita a taxa por cliente", () => {
    const rl = new RateLimiter(2);
    expect([rl.allow("a", 0), rl.allow("a", 0), rl.allow("a", 0)]).toEqual([true, true, false]);
    expect(rl.allow("a", 1000)).toBe(true);
    expect(rl.allow("b", 0)).toBe(true);
  });
});

describe("store", () => {
  it("não duplica peça e guarda histórico newest-first", () => {
    const s = new GatewayStore(10);
    expect(s.put(scan("P1"))).toBe(true);
    expect(s.put(scan("P1"))).toBe(false);
    s.put(scan("P2"));
    expect(s.getHistory().map((h) => h.pieceId)).toEqual(["P2", "P1"]);
  });
});

describe("API Gateway (HTTP + WS)", () => {
  let gw: GatewayInstance;
  let adapter: FakeAdapter;
  let base: string;
  let port: number;
  const cfg = { ...config, jwt: { ...config.jwt, secret: "test-secret" } };

  const login = async (token = "aluno-token-grupo1") => {
    const r = await fetch(`${base}/api/auth/login`, { method: "POST", body: JSON.stringify({ token }) });
    return { status: r.status, body: (await r.json()) as { accessToken: string } };
  };

  beforeEach(async () => {
    adapter = new FakeAdapter();
    gw = createGateway(cfg, adapter);
    port = await gw.listen(0);
    base = `http://127.0.0.1:${port}`;
  });
  afterEach(() => gw.close());

  it("login troca token de sala de aula por JWT e protege as rotas", async () => {
    expect((await login("token-errado")).status).toBe(401);
    expect((await fetch(`${base}/api/traceability/history`)).status).toBe(401);
    const { body } = await login();
    const r = await fetch(`${base}/api/traceability/history`, { headers: { Authorization: `Bearer ${body.accessToken}` } });
    expect(r.status).toBe(200);
  });

  it("recusa origem não autorizada", async () => {
    const r = await fetch(`${base}/api/health`, { headers: { Origin: "https://site-malicioso.com" } });
    expect(r.status).toBe(403);
  });

  it("WS: exige JWT, envia snapshot, repassa telemetria e responde command.ack", async () => {
    adapter.emit(scan("P9"));
    const bad = new WebSocket(`ws://127.0.0.1:${port}/ws?access_token=x`);
    await new Promise((res) => bad.on("error", res));

    const { body } = await login();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?access_token=${body.accessToken}`);
    const msgs: Smart40Event[] = [];
    ws.on("message", (b) => msgs.push(JSON.parse(b.toString())));
    await new Promise((res) => ws.on("open", res));
    await new Promise((res) => setTimeout(res, 50));
    expect(msgs.some((m) => m.type === "traceability.piece-scanned")).toBe(true); // snapshot

    adapter.emit(scan("P10"));
    ws.send(JSON.stringify(makeEvent("command.requested", cmd({ commandId: "abc", action: "STOP" }) as CommandRequested, "ui")));
    ws.send(JSON.stringify(cmd({ commandId: "bad", action: "JOG" as never })));
    ws.send(JSON.stringify(cmd({ commandId: "scan", target: "TRACEABILITY", action: "MANUAL_SCAN", originModule: "traceability" })));
    await new Promise((res) => setTimeout(res, 100));
    ws.close();

    const acks = msgs.filter((m): m is Smart40Event<"command.ack"> => m.type === "command.ack");
    expect(acks.find((a) => a.data.commandId === "abc")?.data.status).toBe("SIMULATED");
    expect(acks.find((a) => a.data.commandId === "bad")?.data.status).toBe("REJECTED");
    expect(adapter.sent.map((c) => c.action)).toEqual(["STOP"]);
    expect(msgs.some((m) => m.type === "traceability.piece-scanned" && (m as Smart40Event<"traceability.piece-scanned">).data.pieceId === "P10")).toBe(true);
    expect(gw.store.getHistory()[0].pieceId).toBe("MANUAL-001");
  });

  it("REST: POST /api/commands e despacho de ordem", async () => {
    const { body } = await login();
    const auth = { Authorization: `Bearer ${body.accessToken}`, "Content-Type": "application/json" };
    const r = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(cmd({ commandId: "d1", target: "EXPEDITION", action: "DISPATCH_ORDER", originModule: "expedition" })),
    });
    const a = (await r.json()) as Smart40Event<"command.ack">;
    expect(a.data.status).toBe("SIMULATED");
    const orders = (await (await fetch(`${base}/api/expedition/orders`, { headers: auth })).json()) as { orders: { status: string }[] };
    expect(orders.orders[0].status).toBe("DISPATCHED");
  });
});
