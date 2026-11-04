/** JWT HS256 mínimo (node:crypto), sem dependência externa. */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface JwtClaims {
  sub: string;
  /** Grupo do token de sala de aula (1–5) ou 0 para o token padrão. */
  group: number;
  role: "operator" | "viewer";
  iat: number;
  exp: number;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function signJwt(claims: Omit<JwtClaims, "iat" | "exp">, secret: string, ttlSeconds: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

export function verifyJwt(token: string | null | undefined, secret: string, now = Date.now()): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = Buffer.from(sign(`${h}.${p}`, secret));
  const got = Buffer.from(s);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    if (header.alg !== "HS256") return null;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as JwtClaims;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

/** "aluno-token-grupo3" → 3; demais → 0 */
export function groupFromClassroomToken(token: string): number {
  const m = /grupo(\d)$/.exec(token);
  return m ? Number(m[1]) : 0;
}
