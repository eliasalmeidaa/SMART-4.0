/**
 * API Gateway SMART 4.0 — ponto ÚNICO entre a SPA e as fontes de dados.
 *
 *   SPA (Shell G1) ──wss /ws?access_token=JWT──► gateway ──► adaptador (mock | real por grupo)
 *                 ──https /api/* (Bearer JWT)──►
 *
 * - Autenticação: token de sala de aula → JWT (POST /api/auth/login).
 * - Origin/CORS restrito, allowlist de comandos, limite de taxa, log de auditoria.
 * - Tudo que sai daqui segue o contrato Smart40Event (@smart40/contracts).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import {
  isSmart40Event,
  makeEvent,
  newEventId,
  SCHEMA_VERSION,
  type CommandAckStatus,
  type CommandRequested,
  type Smart40Event,
} from "@smart40/contracts";
import type { GatewayConfig } from "./config";
import { checkCommand, RateLimiter } from "./commands";
import { groupFromClassroomToken, signJwt, verifyJwt, type JwtClaims } from "./jwt";
import { GatewayStore } from "./store";
import type { UpstreamAdapter } from "./adapters/types";

const ROUTES_FILE = fileURLToPath(new URL("../../../apps/shell/public/api/app-shell/routes.json", import.meta.url));

export interface GatewayInstance {
  server: ReturnType<typeof createServer>;
  store: GatewayStore;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createGateway(cfg: GatewayConfig, adapter: UpstreamAdapter): GatewayInstance {
  const store = new GatewayStore(cfg.historyMax);
  const limiter = new RateLimiter(cfg.commandRateLimit.perSecond);
  const clients = new Map<WebSocket, { claims: JwtClaims; key: string }>();

  const originOk = (origin: string | undefined) =>
    !origin ||
    cfg.allowedOrigins.includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  const audit = (msg: string) => console.log(`[gateway/audit] ${new Date().toISOString()} ${msg}`);

  // ------------------------------------------------------------ difusão
  const broadcast = (ev: Smart40Event) => {
    const msg = JSON.stringify(ev);
    for (const ws of clients.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  };

  adapter.start((ev) => {
    if (store.put(ev)) broadcast(ev);
  });

  // ------------------------------------------------------------ comandos
  const ack = (commandId: string, status: CommandAckStatus, message: string) =>
    makeEvent("command.ack", { commandId, status, message }, "gateway");

  function handleCommand(payload: unknown, clientKey: string, who: string): Smart40Event<"command.ack"> {
    const check = checkCommand(payload);
    if (!check.ok) {
      audit(`REJECTED ${check.commandId} (${who}): ${check.reason}`);
      return ack(check.commandId, "REJECTED", check.reason);
    }
    const cmd: CommandRequested = check.cmd;
    if (!limiter.allow(clientKey)) {
      audit(`REJECTED ${cmd.commandId} (${who}): limite de taxa`);
      return ack(cmd.commandId, "REJECTED", "Limite de comandos por segundo excedido");
    }

    let message: string;
    if (cmd.target === "TRACEABILITY" && cmd.action === "MANUAL_SCAN") {
      const scan = manualScan(cmd.params);
      message = `Leitura manual ${scan.data.pieceId} registrada (simulada).`;
    } else if (cmd.target === "EXPEDITION" && cmd.action === "DISPATCH_ORDER") {
      const order = store.dispatchOrder(typeof cmd.params?.orderId === "string" ? cmd.params.orderId : undefined);
      message = order ? `Ordem ${order.orderId} despachada (simulada).` : "Nenhuma ordem pendente para despachar.";
    } else if (adapter.sendCommand(cmd)) {
      message = `${cmd.action} enviado à fonte "${adapter.name}". Nenhum hardware acionado.`;
    } else if (adapter.status !== "CONNECTED") {
      audit(`REJECTED ${cmd.commandId} (${who}): fonte ${adapter.status}`);
      return ack(cmd.commandId, "REJECTED", `Fonte de dados indisponível (${adapter.status})`);
    } else {
      message = `${cmd.action} registrado apenas na interface (fonte "${adapter.name}" não implementa).`;
    }
    audit(`SIMULATED ${cmd.action} → ${cmd.target} (${cmd.originModule}, ${who})`);
    return ack(cmd.commandId, "SIMULATED", message);
  }

  let manualSeq = 0;
  function manualScan(params?: Record<string, string | number | boolean>): Smart40Event<"traceability.piece-scanned"> {
    manualSeq += 1;
    const pieceId = typeof params?.pieceId === "string" && params.pieceId ? params.pieceId : `MANUAL-${String(manualSeq).padStart(3, "0")}`;
    const result = params?.result === "REJECTED" ? "REJECTED" : params?.result === "PENDING" ? "PENDING" : "APPROVED";
    const ev = makeEvent(
      "traceability.piece-scanned",
      {
        pieceId,
        qrCode: typeof params?.qrCode === "string" ? params.qrCode : `${pieceId}|MANUAL`,
        lot: typeof params?.lot === "string" ? params.lot : null,
        scannedAt: new Date().toISOString(),
        result,
        surfaceQualityPercent: typeof params?.surfaceQualityPercent === "number" ? params.surfaceQualityPercent : null,
        reason: result === "REJECTED" ? "Leitura manual marcada como rejeitada" : null,
      },
      "gateway",
      `manual-scan-${pieceId}`,
    );
    if (store.put(ev)) broadcast(ev);
    return ev;
  }

  // ------------------------------------------------------------ HTTP
  function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  async function readJson(req: IncomingMessage): Promise<unknown> {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64_000) throw new Error("payload muito grande");
    }
    return raw ? JSON.parse(raw) : {};
  }

  const bearer = (req: IncomingMessage) => {
    const h = req.headers.authorization;
    return h?.startsWith("Bearer ") ? h.slice(7) : null;
  };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!originOk(origin)) return send(res, 403, { error: "Origem não autorizada" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const url = new URL(req.url ?? "/", "http://gateway");
    const path = url.pathname;

    try {
      // ---------- rotas públicas
      if (req.method === "GET" && path === "/api/health") {
        return send(res, 200, {
          ok: true,
          schemaVersion: SCHEMA_VERSION,
          unitId: cfg.unitId,
          source: adapter.name,
          upstream: adapter.status,
          clients: clients.size,
        });
      }
      if (req.method === "POST" && path === "/api/auth/login") {
        const body = (await readJson(req)) as { token?: unknown };
        const token = typeof body.token === "string" ? body.token : "";
        if (!cfg.classroomTokens.includes(token)) {
          audit("LOGIN recusado: token inválido");
          return send(res, 401, { error: "Token inválido" });
        }
        const group = groupFromClassroomToken(token);
        const jwt = signJwt({ sub: group ? `grupo${group}` : "smart40", group, role: "operator" }, cfg.jwt.secret, cfg.jwt.ttlSeconds);
        audit(`LOGIN ok: ${group ? `grupo${group}` : "smart40"}`);
        return send(res, 200, { accessToken: jwt, tokenType: "Bearer", expiresIn: cfg.jwt.ttlSeconds });
      }
      if (req.method === "GET" && path === "/api/app-shell/routes") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(readFileSync(ROUTES_FILE, "utf8"));
      }

      // ---------- rotas protegidas (JWT)
      const claims = verifyJwt(bearer(req), cfg.jwt.secret);
      if (!claims) return send(res, 401, { error: "JWT ausente, inválido ou expirado" });
      const who = claims.sub;

      if (req.method === "GET") {
        switch (path) {
          case "/api/machine/status":
            return send(res, 200, store.getLast("machine.telemetry") ?? null);
          case "/api/robot/kinematics":
            return send(res, 200, store.getLast("robot.telemetry") ?? null);
          case "/api/expedition/metrics":
            return send(res, 200, store.getLast("expedition.metrics") ?? null);
          case "/api/expedition/orders":
            return send(res, 200, { orders: store.orders, isMock: true });
          case "/api/traceability/history":
            return send(res, 200, { items: store.getHistory(Number(url.searchParams.get("limit") ?? 50)) });
        }
      }
      if (req.method === "POST" && path === "/api/commands") {
        const body = await readJson(req);
        const payload = isSmart40Event(body) ? body.data : body;
        const a = handleCommand(payload, `rest:${who}`, who);
        broadcast(a);
        return send(res, a.data.status === "REJECTED" ? 422 : 200, a);
      }
      if (req.method === "POST" && path === "/api/traceability/scan") {
        const body = (await readJson(req)) as Record<string, string | number | boolean>;
        const a = handleCommand(
          { commandId: newEventId("cmd"), target: "TRACEABILITY", action: "MANUAL_SCAN", originModule: "traceability", params: body, simulation: true },
          `rest:${who}`,
          who,
        );
        broadcast(a);
        return send(res, a.data.status === "REJECTED" ? 422 : 200, { ack: a, last: store.getLast("traceability.piece-scanned") });
      }
      return send(res, 404, { error: `Rota não encontrada: ${req.method} ${path}` });
    } catch (err) {
      return send(res, 400, { error: (err as Error).message });
    }
  });

  // ------------------------------------------------------------ WebSocket
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://gateway");
    if (url.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      return socket.destroy();
    }
    if (!originOk(req.headers.origin)) {
      audit(`WS recusado: origem ${req.headers.origin}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      return socket.destroy();
    }
    // navegador não manda header no WS: JWT vai na query
    const claims = verifyJwt(url.searchParams.get("access_token"), cfg.jwt.secret);
    if (!claims) {
      audit("WS recusado: JWT inválido");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const key = `ws:${claims.sub}:${newEventId("c")}`;
      clients.set(ws, { claims, key });
      audit(`WS conectado: ${claims.sub} (clientes: ${clients.size})`);
      for (const ev of store.snapshot()) ws.send(JSON.stringify(ev)); // não começa vazio

      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
      ws.on("pong", () => ((ws as WebSocket & { isAlive?: boolean }).isAlive = true));
      ws.on("message", (buf) => {
        let msg: unknown;
        try {
          msg = JSON.parse(buf.toString());
        } catch {
          return;
        }
        // aceita o envelope Smart40Event de "command.requested" (preferido) ou o payload direto
        const payload = isSmart40Event(msg) ? (msg.type === "command.requested" ? msg.data : null) : msg;
        if (!payload) return;
        ws.send(JSON.stringify(handleCommand(payload, key, claims.sub)));
      });
      ws.on("close", () => {
        clients.delete(ws);
        limiter.forget(key);
      });
    });
  });

  const ping = setInterval(() => {
    for (const ws of clients.keys()) {
      const w = ws as WebSocket & { isAlive?: boolean };
      if (w.isAlive === false) {
        w.terminate();
        continue;
      }
      w.isAlive = false;
      w.ping();
    }
  }, 30_000);

  return {
    server,
    store,
    listen: (port = cfg.port) =>
      new Promise((resolve) => server.listen(port, () => resolve((server.address() as { port: number }).port))),
    close: () =>
      new Promise((resolve) => {
        clearInterval(ping);
        adapter.stop();
        for (const ws of clients.keys()) ws.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
