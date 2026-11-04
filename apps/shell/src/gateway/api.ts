/**
 * Cliente da API Gateway (Sprint 2): login (token de sala de aula → JWT) e REST.
 * O JWT fica SÓ em memória no Shell — nunca em localStorage (runbook seção 8).
 * Os módulos usam window.smart40.api.get/post e não veem o token.
 */
import type { Smart40RestApi } from "@smart40/contracts";

export interface GatewayApi extends Smart40RestApi {
  getAccessToken(): Promise<string>;
  /** Descarta o JWT em cache (próxima chamada faz login de novo). */
  invalidate(): void;
}

export function createGatewayApi(baseUrl: string, classroomToken: string | undefined, fetchImpl: typeof fetch = fetch): GatewayApi {
  const base = baseUrl.replace(/\/$/, "");
  let jwt: string | null = null;
  let expiresAt = 0;
  let pending: Promise<string> | null = null;

  async function login(): Promise<string> {
    if (!classroomToken) throw new Error("VITE_SMART40_WS_TOKEN não definido");
    const res = await fetchImpl(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: classroomToken }),
    });
    if (!res.ok) throw new Error(`login ${res.status}`);
    const body = (await res.json()) as { accessToken: string; expiresIn: number };
    jwt = body.accessToken;
    expiresAt = Date.now() + (body.expiresIn - 60) * 1000; // renova 1 min antes
    return jwt;
  }

  async function getAccessToken(): Promise<string> {
    if (jwt && Date.now() < expiresAt) return jwt;
    pending ??= login().finally(() => (pending = null));
    return pending;
  }

  async function request<T>(method: "GET" | "POST", path: string, body?: unknown, retry = true): Promise<T> {
    const token = await getAccessToken();
    const res = await fetchImpl(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry) {
      jwt = null; // gateway reiniciou ou token expirou: faz login de novo uma vez
      return request<T>(method, path, body, false);
    }
    const data = (await res.json().catch(() => null)) as T;
    if (!res.ok && res.status !== 422) throw new Error(`${method} ${path} → ${res.status}`);
    return data;
  }

  return {
    getAccessToken,
    invalidate: () => {
      jwt = null;
    },
    get: <T = unknown>(path: string) => request<T>("GET", path),
    post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  };
}
