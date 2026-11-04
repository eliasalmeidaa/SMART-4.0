/**
 * O adaptador do mock passou para @smart40/contracts (mock-adapter.ts), para que
 * a API Gateway (packages/gateway) e o Shell usem exatamente o mesmo mapeamento.
 * Este arquivo só reexporta, para não quebrar imports antigos.
 */
export { adaptMockPayload, isMockTelemetryPayload, MOCK_ACTIONS } from "@smart40/contracts";
