/**
 * Módulo PROVISÓRIO para a SPA única (Sprint 2).
 * Cada pasta apps/<grupo> usa isto até o grupo entregar a tela real; quando entregar,
 * o grupo troca o conteúdo de apps/<grupo>/src/index.ts mantendo bootstrap/mount/unmount.
 *
 * NÃO é a entrega dos Grupos 2–5: serve para o G1 validar barramento, comandos e API Gateway.
 */
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  onSmart40,
  requestCommand,
  type CommandAction,
  type CommandTarget,
  type ModuleId,
  type Smart40Event,
  type Smart40EventType,
} from "@smart40/contracts";
import { IndustrialButton } from "./IndustrialButton";
import { StatusLed } from "./StatusLed";

export interface ProvisionalModuleConfig {
  group: number;
  title: string;
  moduleId: Exclude<ModuleId, "shell">;
  consumes: Smart40EventType[];
  commands: { target: CommandTarget; action: CommandAction; label?: string; params?: Record<string, string | number | boolean> }[];
  /** Rota REST da API Gateway para mostrar (ex.: "/api/traceability/history"). */
  restPreview?: string;
}

export interface Smart40Lifecycles {
  bootstrap(): Promise<void>;
  mount(props: { domElement?: HTMLElement | null }): Promise<void>;
  unmount(): Promise<void>;
}

function useEvents(types: Smart40EventType[]) {
  const [events, setEvents] = useState<Partial<Record<Smart40EventType, Smart40Event>>>(() =>
    Object.fromEntries(types.map((t) => [t, window.smart40?.getLast(t)]).filter(([, e]) => e)),
  );
  useEffect(() => {
    const offs = types.map((t) => onSmart40(t, (ev) => setEvents((prev) => ({ ...prev, [t]: ev }))));
    return () => offs.forEach((off) => off()); // limpeza obrigatória
  }, [types]);
  return events;
}

const pre: React.CSSProperties = {
  margin: 0,
  padding: "var(--smart-space-sm)",
  background: "var(--smart-bg-input)",
  borderRadius: "var(--smart-radius-sm)",
  fontFamily: "var(--smart-font-mono)",
  fontSize: 12,
  maxHeight: 240,
  overflow: "auto",
  whiteSpace: "pre-wrap",
};

function Provisional({ cfg }: { cfg: ProvisionalModuleConfig }) {
  const watch: Smart40EventType[] = [...cfg.consumes, "connection.state", "command.ack"];
  const events = useEvents(watch);
  const conn = (events["connection.state"] as Smart40Event<"connection.state"> | undefined)?.data.status ?? "CONNECTING";
  const ack = events["command.ack"] as Smart40Event<"command.ack"> | undefined;
  const [rest, setRest] = useState<string>("—");

  const loadRest = async () => {
    if (!cfg.restPreview) return;
    if (!window.smart40?.api) return setRest("API Gateway indisponível (Shell em modo mock).");
    try {
      setRest(JSON.stringify(await window.smart40.api.get(cfg.restPreview), null, 2));
    } catch (err) {
      setRest(`Erro: ${(err as Error).message}`);
    }
  };
  useEffect(() => {
    void loadRest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connected = conn === "CONNECTED";
  return (
    <section className="smart-card" style={{ margin: "var(--smart-space-lg)", borderStyle: "dashed" }}>
      <div className="smart-card-header">
        <span className="smart-card-title">
          Grupo {cfg.group} · {cfg.title}
        </span>
        <span className="mock-tag">MÓDULO PROVISÓRIO</span>
      </div>
      <p style={{ marginTop: 0, color: "var(--smart-text-secondary)" }}>
        Placeholder do monorepo carregado localmente pelo Shell. O Grupo {cfg.group} substitui este conteúdo pela tela real em{" "}
        <code>apps/…/src/index.ts</code>.
      </p>
      <p>
        <StatusLed color={connected ? "green" : conn === "STALE" ? "yellow" : "red"} label={`Conexão: ${conn}`} />
      </p>

      <div style={{ display: "flex", gap: "var(--smart-space-sm)", flexWrap: "wrap", marginBottom: "var(--smart-space-md)" }}>
        {cfg.commands.map((c) => (
          <IndustrialButton
            key={`${c.target}-${c.action}`}
            variant={c.action === "EMERGENCY_STOP" ? "emergency" : c.action === "RESET" ? "reset" : c.action === "START" ? "start" : "primary"}
            locked={!connected}
            lockedReason="Sem conexão: comandos bloqueados"
            onClick={() => requestCommand({ target: c.target, action: c.action, originModule: cfg.moduleId, params: c.params })}
          >
            {c.label ?? c.action}
          </IndustrialButton>
        ))}
      </div>

      <p style={{ margin: "0 0 4px" }}>
        <code>command.ack</code>
      </p>
      <pre style={pre} data-ack>
        {ack ? `${ack.data.status} — ${ack.data.message}` : "—"}
      </pre>

      {cfg.consumes.map((t) => (
        <div key={t} style={{ marginTop: "var(--smart-space-md)" }}>
          <p style={{ margin: "0 0 4px" }}>
            <code>smart40:{t}</code>
          </p>
          <pre style={pre} data-type={t}>
            {events[t] ? JSON.stringify(events[t]!.data, null, 2) : "aguardando…"}
          </pre>
        </div>
      ))}

      {cfg.restPreview && (
        <div style={{ marginTop: "var(--smart-space-md)" }}>
          <p style={{ margin: "0 0 4px", display: "flex", gap: 8, alignItems: "center" }}>
            <code>GET {cfg.restPreview}</code> (API Gateway)
            <IndustrialButton variant="ghost" onClick={() => void loadRest()}>
              Atualizar
            </IndustrialButton>
          </p>
          <pre style={pre} data-rest>
            {rest}
          </pre>
        </div>
      )}
    </section>
  );
}

/** Gera bootstrap/mount/unmount (Single-SPA) para um módulo provisório. */
export function createProvisionalModule(cfg: ProvisionalModuleConfig): Smart40Lifecycles {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  return {
    bootstrap: async () => {},
    mount: async (props) => {
      host = document.createElement("div");
      host.dataset.smart40Module = cfg.moduleId;
      (props.domElement ?? document.body).appendChild(host);
      root = createRoot(host);
      root.render(<Provisional cfg={cfg} />);
    },
    unmount: async () => {
      root?.unmount();
      host?.remove();
      root = null;
      host = null;
    },
  };
}
