/**
 * Estado da gateway: último evento de cada tipo (snapshot para quem conecta),
 * histórico de peças (G4) e ordens de expedição mock (G5).
 */
import type { PieceScanned, Smart40Event, Smart40EventType } from "@smart40/contracts";

export interface ExpeditionOrder {
  orderId: string;
  product: string;
  quantity: number;
  status: "QUEUED" | "IN_PROGRESS" | "DISPATCHED";
  dispatchedAt: string | null;
  isMock: true;
}

export class GatewayStore {
  private last = new Map<Smart40EventType, Smart40Event>();
  private history: (PieceScanned & { eventId: string; source: string })[] = [];
  private seenPieces = new Set<string>();
  readonly orders: ExpeditionOrder[] = [
    { orderId: "OP-2026-0101", product: "Kit Montagem A", quantity: 40, status: "IN_PROGRESS", dispatchedAt: null, isMock: true },
    { orderId: "OP-2026-0102", product: "Kit Montagem B", quantity: 25, status: "QUEUED", dispatchedAt: null, isMock: true },
    { orderId: "OP-2026-0103", product: "Kit Montagem A", quantity: 60, status: "QUEUED", dispatchedAt: null, isMock: true },
  ];

  constructor(private historyMax = 500) {}

  /** Retorna false quando o evento é duplicado e não deve ser repassado. */
  put(ev: Smart40Event): boolean {
    if (ev.type === "traceability.piece-scanned") {
      const d = (ev as Smart40Event<"traceability.piece-scanned">).data;
      if (this.seenPieces.has(d.pieceId)) return false; // idempotência por peça
      this.seenPieces.add(d.pieceId);
      this.history.unshift({ ...d, eventId: ev.eventId, source: ev.source });
      if (this.history.length > this.historyMax) {
        const removed = this.history.pop()!;
        this.seenPieces.delete(removed.pieceId);
      }
    }
    this.last.set(ev.type, ev);
    return true;
  }

  getLast<T extends Smart40EventType>(type: T): Smart40Event<T> | undefined {
    return this.last.get(type) as Smart40Event<T> | undefined;
  }

  /** Eventos de telemetria/estado para enviar a um cliente que acabou de conectar. */
  snapshot(): Smart40Event[] {
    const types: Smart40EventType[] = ["machine.telemetry", "robot.telemetry", "traceability.piece-scanned", "expedition.metrics"];
    return types.map((t) => this.last.get(t)).filter((e): e is Smart40Event => Boolean(e));
  }

  getHistory(limit = 50) {
    return this.history.slice(0, Math.max(1, Math.min(limit, this.historyMax)));
  }

  dispatchOrder(orderId?: string): ExpeditionOrder | null {
    const order = orderId
      ? this.orders.find((o) => o.orderId === orderId && o.status !== "DISPATCHED")
      : this.orders.find((o) => o.status !== "DISPATCHED");
    if (!order) return null;
    order.status = "DISPATCHED";
    order.dispatchedAt = new Date().toISOString();
    return order;
  }
}
