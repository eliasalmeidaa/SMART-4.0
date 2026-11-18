import { describe, expect, it } from "vitest";
import { makeEvent, publishSmart40 } from "@smart40/contracts";
import { startG5Bridge, type ExpeditionSnapshot } from "./g5Bridge";

describe("integração G1 -> G5 (expedição)", () => {
  it("calcula produção (delta após a linha de base) e qualidade com a biblioteca do G5 a partir do barramento do Shell", () => {
    const snaps: ExpeditionSnapshot[] = [];
    const diags: string[] = [];
    const stop = startG5Bridge({ onSnapshot: (s) => snaps.push(s), onDiagnostic: (d) => diags.push(d), refreshMs: 0 });

    publishSmart40(makeEvent("connection.state", { status: "CONNECTED", lastTelemetryAt: null, latencyMs: null, reconnectAttempt: 0 }, "shell"));
    publishSmart40(
      makeEvent("machine.telemetry", {
        status: "RUNNING", mode: "AUTO", emergencyActive: false, safetyInterlockOk: true,
        conveyorSpeedPercent: null, pneumaticPressureBar: null, cycleTimeS: null, alarms: [],
      }, "mock"),
    );
    publishSmart40(
      makeEvent("expedition.metrics", {
        totalProduced: 10, totalApproved: 8, totalRejected: 2, piecesPerMinute: null,
        outputQueueSize: null, activeOrders: null, oeePercentMock: null, isMock: true,
      }, "mock"),
    );

    // 1ª leitura dos contadores = linha de base (regra do G5: nada de produção fictícia).
    const second = makeEvent("expedition.metrics", {
      totalProduced: 12, totalApproved: 9, totalRejected: 3, piecesPerMinute: null,
      outputQueueSize: null, activeOrders: null, oeePercentMock: null, isMock: true,
    }, "mock");
    second.timestamp = new Date(Date.now() + 1000).toISOString();
    publishSmart40(second);
    const last = snaps.at(-1)!;
    expect(last.connection).toBe("CONNECTED");
    expect(last.station).toBe("RUNNING");
    expect(last.totalProduced).toBe(2);
    expect(last.approved).toBe(1);
    expect(last.rejected).toBe(1);
    expect(last.quality).toBeCloseTo(50);
    expect(diags.some((d) => d.startsWith("Falha"))).toBe(false);

    stop();
    const before = snaps.length;
    publishSmart40(makeEvent("connection.state", { status: "DISCONNECTED", lastTelemetryAt: null, latencyMs: null, reconnectAttempt: 0 }, "shell"));
    expect(snaps.length).toBe(before); // unmount remove todos os listeners
  });
});
