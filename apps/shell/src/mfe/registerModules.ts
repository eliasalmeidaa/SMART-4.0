/**
 * Orquestração Single-SPA.
 * Sprint 2 (SPA única): cada módulo vem primeiro do monorepo (apps/*, ver localModules.ts).
 * Alternativas, nesta ordem:
 *   1. override no import-map-overrides (dev testando o localhost do grupo) → remoto
 *   2. VITE_SMART40_MFE_SOURCE=remote → só importmap.json
 *   3. módulo local não existe/falhou → importmap.json
 * Se nada carregar, o Shell monta a tela "ATENÇÃO — EM PRODUÇÃO" (nunca SKIP_BECAUSE_BROKEN).
 */
import { getAppNames, getAppStatus, registerApplication, start, type LifeCycles } from "single-spa";
import { MODULE_ROOT_ID, MODULE_ROUTES, type ModuleRoute } from "../config/routes";
import { createPlaceholderApp } from "./placeholder";
import { LOCAL_MODULES } from "./localModules";

declare global {
  interface Window {
    System?: { import(id: string): Promise<unknown>; resolve(id: string): string };
    importMapOverrides?: { getOverrideMap(): { imports: Record<string, string> } };
  }
}

const LOAD_TIMEOUT_MS = 4000;

function resolveUrl(name: string): string | null {
  try {
    return window.System?.resolve(name) ?? null;
  } catch {
    return null;
  }
}

function isLifecycles(m: unknown): m is LifeCycles {
  return typeof m === "object" && m !== null && "mount" in m && "unmount" in m;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout de ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function loadRemote(route: ModuleRoute): Promise<LifeCycles> {
  const url = resolveUrl(route.app);
  if (!url) return createPlaceholderApp(route, null, "módulo não consta no importmap.json") as LifeCycles;

  // 1) formato SystemJS (padrão single-spa / create-single-spa)
  try {
    const m = await withTimeout(window.System!.import(route.app), LOAD_TIMEOUT_MS);
    if (isLifecycles(m)) return m;
  } catch {
    /* tenta ESM abaixo */
  }
  // 2) formato ES Module (ex.: Vite + vite-plugin-single-spa)
  try {
    const m = await withTimeout(import(/* @vite-ignore */ url), LOAD_TIMEOUT_MS);
    if (isLifecycles(m)) return m;
    return createPlaceholderApp(route, url, "bundle carregou mas não exporta bootstrap/mount/unmount") as LifeCycles;
  } catch (err) {
    console.info(`[smart40/shell] ${route.app} indisponível em ${url} → tela "em produção"`, err);
    return createPlaceholderApp(route, url, `bundle não encontrado em ${url}`) as LifeCycles;
  }
}

function hasRemoteOverride(name: string): boolean {
  try {
    return Boolean(window.importMapOverrides?.getOverrideMap().imports[name]);
  } catch {
    return false;
  }
}

async function loadModule(route: ModuleRoute): Promise<LifeCycles> {
  const local = LOCAL_MODULES[route.app];
  const preferRemote = import.meta.env.VITE_SMART40_MFE_SOURCE === "remote" || hasRemoteOverride(route.app);
  if (local && !preferRemote) {
    try {
      const m = await local();
      if (isLifecycles(m)) return m;
      console.warn(`[smart40/shell] ${route.app} local não exporta bootstrap/mount/unmount → tentando remoto`);
    } catch (err) {
      console.warn(`[smart40/shell] ${route.app} local falhou → tentando remoto`, err);
    }
  }
  return loadRemote(route);
}

let started = false;

export function startMicroFrontends(): void {
  if (started) return;
  started = true;
  for (const route of MODULE_ROUTES) {
    registerApplication({
      name: route.app,
      app: () => loadModule(route),
      activeWhen: (loc) => loc.pathname === route.path || loc.pathname.startsWith(`${route.path}/`),
      customProps: () => ({
        domElement: document.getElementById(MODULE_ROOT_ID),
        route: route.path,
        group: route.group,
      }),
    });
  }
  start({ urlRerouteOnly: true });

  // Auditoria no console (dev): smart40Apps() → nenhum status pode ser SKIP_BECAUSE_BROKEN
  if (import.meta.env.DEV) {
    (window as unknown as { smart40Apps: () => Record<string, string> }).smart40Apps = () =>
      Object.fromEntries(getAppNames().map((n) => [n, getAppStatus(n) ?? "?"]));
  }
}
