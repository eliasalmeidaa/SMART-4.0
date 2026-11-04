/**
 * Política de comandos da gateway (runbook seção 8): validar payload, allowlist por
 * alvo, limitar taxa e REJEITAR por padrão. Sprint 2 continua só simulação.
 */
import { validateCommand, type CommandAction, type CommandRequested, type CommandTarget } from "@smart40/contracts";

export const COMMAND_ALLOWLIST: Record<CommandTarget, readonly CommandAction[]> = {
  MACHINE: ["START", "STOP", "RESET", "EMERGENCY_STOP", "SET_MODE"],
  CONVEYOR: ["START", "STOP"],
  ROBOT: ["START", "STOP", "JOG", "GRIPPER_OPEN", "GRIPPER_CLOSE"],
  TRACEABILITY: ["MANUAL_SCAN"],
  EXPEDITION: ["DISPATCH_ORDER"],
};

const MODULES = new Set(["shell", "ihm", "robot", "traceability", "expedition"]);

export type CommandCheck = { ok: true; cmd: CommandRequested } | { ok: false; commandId: string; reason: string };

export function checkCommand(payload: unknown): CommandCheck {
  const commandId =
    typeof (payload as { commandId?: unknown })?.commandId === "string" ? (payload as { commandId: string }).commandId : "desconhecido";
  const v = validateCommand(payload);
  if (!v.ok) return { ok: false, commandId, reason: v.reason };
  const { cmd } = v;
  const allowed = COMMAND_ALLOWLIST[cmd.target as CommandTarget];
  if (!allowed) return { ok: false, commandId, reason: `Alvo não permitido: ${cmd.target}` };
  if (!allowed.includes(cmd.action)) return { ok: false, commandId, reason: `Ação ${cmd.action} não permitida para ${cmd.target}` };
  if (!MODULES.has(cmd.originModule)) return { ok: false, commandId, reason: `originModule inválido: ${cmd.originModule}` };
  return { ok: true, cmd };
}

/** Token bucket simples por cliente. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private perSecond: number) {}

  allow(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.perSecond, at: now };
    b.tokens = Math.min(this.perSecond, b.tokens + ((now - b.at) / 1000) * this.perSecond);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }
}
