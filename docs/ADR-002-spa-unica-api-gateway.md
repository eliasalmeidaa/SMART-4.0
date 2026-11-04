# ADR-002 — SPA única + API Gateway (Sprint 2)

**Status:** proposto pelo G1 · **Data:** 04/11/2026 · Substitui parcialmente o ADR-001

## Contexto
- A especificação pede "Entrega Única" via micro-frontends **ou** monorepo; o ADR-001 já previa módulos locais como alternativa.
- O Guia de Checklist define um backend por grupo (IHM, Robô UR, QR, Expedição), cada um com IP privado,
  protocolo e autenticação diferentes (HMAC, Bearer, API Key, OAuth2). O runbook (seção 8) proíbe IP privado,
  credencial ou conexão S7 no navegador.

## Decisão
1. **SPA única:** os módulos dos G2–G5 vivem em `apps/*` como pacotes do monorepo e entram no mesmo build do Shell
   (Single-SPA continua gerenciando o ciclo de vida; cada rota vira um chunk). O carregamento remoto pelo
   `importmap.json` continua disponível como alternativa, por módulo.
2. **API Gateway (`packages/gateway`):** ponto único entre a SPA e as fontes de dados.
   - Token de sala de aula → JWT (`POST /api/auth/login`); WS e REST exigem JWT.
   - Origin/CORS restrito, allowlist de comandos, limite de taxa, log de auditoria.
   - Converte toda fonte para o contrato `Smart40Event` → o barramento e os módulos não mudam.
   - Um adaptador por fonte (`src/adapters/`). Hoje: `mock`. Os reais entram quando os grupos entregarem.
3. O Shell fala só com a gateway (modo `gateway`, padrão). O modo `mock` (Sprint 1) segue disponível.

## Compatibilidade com os outros grupos
- Nenhuma mudança obrigatória para os G2–G5: mesmos eventos `smart40:*`, mesmo `requestCommand`.
- `window.smart40.api` é uma adição opcional.
- O alinhamento com o contrato oficial v0.1 (nomes divergentes: READY×IDLE, AUTO×AUTOMATIC, originModule×sourceModule,
  ack status×result, connection.state status×state) fica para uma v0.2 aprovada pelos 5 grupos.

## Consequências
- Build e deploy únicos da SPA (Vercel). A gateway é um processo persistente separado (Render/Railway).
- Credenciais e endereços de cada fonte só existem no `.env` da gateway.
- Comandos continuam simulados até autorização OT (runbook seção 8).
