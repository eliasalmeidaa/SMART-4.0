/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** "gateway" (padrão, Sprint 2) | "mock" (conexão direta da Sprint 1) */
  readonly VITE_SMART40_MODE?: string;
  /** URL HTTP da API Gateway. Padrão: http://localhost:8090 */
  readonly VITE_SMART40_API_URL?: string;
  readonly VITE_SMART40_WS_URL?: string;
  readonly VITE_SMART40_WS_TOKEN?: string;
  /** "local" (padrão: módulos do monorepo) | "remote" (só importmap.json) */
  readonly VITE_SMART40_MFE_SOURCE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
