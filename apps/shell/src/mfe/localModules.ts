/**
 * SPA única (Sprint 2): módulos dos grupos que vivem no monorepo (apps/*).
 * Entram no MESMO build do Shell (code-splitting por rota).
 *
 * Para um grupo que ainda entrega por URL, basta remover a linha dele daqui:
 * o Shell volta a usar o importmap.json (carregamento remoto).
 * O formato é validado em registerModules.ts (precisa exportar bootstrap/mount/unmount).
 */
export const LOCAL_MODULES: Record<string, () => Promise<unknown>> = {
  "@smart40/ihm-siemens": () => import("@smart40/ihm-siemens"),
  "@smart40/robo-ur": () => import("@smart40/robo-ur"),
  "@smart40/rastreabilidade-qrcode": () => import("@smart40/rastreabilidade-qrcode"),
  "@smart40/expedicao-oee": () => import("@smart40/expedicao-oee"),
};
