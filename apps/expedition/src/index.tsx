/**
 * Grupo 5 — Posto de Expedição & OEE: a TELA DO GRUPO 5 dentro da SPA única.
 *
 * Este arquivo é só o "adaptador Single-SPA" (bootstrap/mount/unmount). O front é o do G5,
 * importado sem alterações de grupos/g5-expedicao/FrontEnd/src/App.tsx.
 *
 * Isolamento: o CSS do G5 tem regras globais (html, body, :root, button…). Ele é carregado como
 * string (ver isolateGroupCss em apps/shell/vite.config.ts) e aplicado dentro de um Shadow DOM,
 * então não altera o cabeçalho nem os outros módulos do Shell.
 */
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import G5App from "../../../grupos/g5-expedicao/FrontEnd/src/App.tsx";
import themeCss from "../../../grupos/g5-expedicao/FrontEnd/src/styles/theme.css?inline";
import indexCss from "../../../grupos/g5-expedicao/FrontEnd/src/index.css?inline";
import appCss from "../../../grupos/g5-expedicao/FrontEnd/src/App.css?inline";
import logisticsCss from "../../../grupos/g5-expedicao/FrontEnd/src/components/LogisticsPanel.css?inline";

/** :root / html / body do G5 passam a valer só para a "página" dele (o host do Shadow DOM). */
export function scopeGroupCss(css: string): string {
  return css
    .replace(/(^|[\s,}])(:root|html|body)(?=[\s,{:.[])/g, "$1:host")
    .replace(/:host\s+:host/g, ":host");
}

let root: Root | null = null;
let host: HTMLElement | null = null;
let offAnchors: (() => void) | null = null;

export async function bootstrap(): Promise<void> {}

export async function mount(props: { domElement?: HTMLElement | null }): Promise<void> {
  host = document.createElement("div");
  host.dataset.smart40Module = "expedition";
  host.dataset.smart40Group = "g5";
  (props.domElement ?? document.body).appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = [themeCss, indexCss, appCss, logisticsCss].map(scopeGroupCss).join("\n");
  shadow.appendChild(style);
  const container = document.createElement("div");
  container.style.display = "block";
  shadow.appendChild(container);

  // Links internos do G5 (#ordens, #saidas…) rolam dentro da tela, sem mexer na rota do Shell.
  const onClick = (e: Event) => {
    const link = (e.target as HTMLElement | null)?.closest?.("a[href^='#']");
    if (!link) return;
    const id = link.getAttribute("href")!.slice(1);
    const target = id ? shadow.getElementById(id) : null;
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  shadow.addEventListener("click", onClick);
  offAnchors = () => shadow.removeEventListener("click", onClick);

  root = createRoot(container);
  root.render(
    <StrictMode>
      <G5App />
    </StrictMode>,
  );
}

export async function unmount(): Promise<void> {
  root?.unmount();
  offAnchors?.();
  host?.remove();
  root = null;
  host = null;
  offAnchors = null;
}
