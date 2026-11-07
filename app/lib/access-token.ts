// Valida o token que o Cloudflare Access entrega ao site depois do login.
//
// Em Workers com arquivos estáticos, a identidade pronta (`ctx.access`) não chega ao código,
// então a assinatura é conferida aqui. Qualquer dúvida resulta em nenhum usuário: sem
// configuração, com a chave indisponível ou com o token errado, ninguém entra.

export type AccessConfig = {
  /** Nome do time, como "minha-equipe" ou "minha-equipe.cloudflareaccess.com". */
  teamDomain?: string;
  /** Application Audience (AUD) Tag da aplicação no Access. */
  audience?: string;
  /** E-mails autorizados, separados por vírgula. Segunda trava além da política do Access. */
  allowedEmails?: string;
};
export type AccessIdentity = { email: string };
type Deps = { fetchKeys?: (url: string) => Promise<Jwk[]>; now?: number };
type Jwk = JsonWebKey & { kid?: string };

const LEEWAY_SECONDS = 60;
const KEYS_TTL_MS = 60 * 60 * 1000;
const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

/** Só aceita domínios do próprio Access: as chaves nunca vêm de outro endereço. */
export function teamOrigin(teamDomain: string | undefined): string | null {
  const name = (teamDomain ?? "")
    .trim()
    .replace(/^https:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/\.cloudflareaccess\.com$/, "");
  return /^[a-z0-9][a-z0-9-]*$/i.test(name)
    ? `https://${name.toLowerCase()}.cloudflareaccess.com`
    : null;
}

const allowedList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const decodeBase64Url = (part: string) => {
  const normal = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
const decodeJson = (part: string) =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));

async function downloadKeys(url: string): Promise<Jwk[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Chaves do Access indisponíveis");
  const body = (await response.json()) as { keys?: Jwk[] };
  return body.keys ?? [];
}

const cache = new Map<string, { keys: Jwk[]; at: number }>();
/** Limpa as chaves em memória. Usado pelos testes. */
export const clearAccessKeys = () => cache.clear();

async function keyFor(origin: string, kid: string, deps: Deps) {
  const url = `${origin}/cdn-cgi/access/certs`;
  const load = deps.fetchKeys ?? downloadKeys;
  const now = deps.now ?? Date.now();
  const hit = cache.get(url);
  let keys = hit && now - hit.at < KEYS_TTL_MS ? hit.keys : null;
  // Chave desconhecida pode ser rotação: busca de novo antes de recusar.
  if (!keys?.some((k) => k.kid === kid)) {
    keys = await load(url);
    cache.set(url, { keys, at: now });
  }
  return keys.find((k) => k.kid === kid) ?? null;
}

export async function verifyAccessToken(
  token: string | null | undefined,
  config: AccessConfig,
  deps: Deps = {},
): Promise<AccessIdentity | null> {
  const origin = teamOrigin(config.teamDomain),
    audience = config.audience?.trim(),
    allowed = allowedList(config.allowedEmails);
  if (!token || !origin || !audience || !allowed.length) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [rawHeader, rawPayload, rawSignature] = parts;
    const header = decodeJson(rawHeader);
    // O algoritmo é fixo: um token não escolhe como será conferido.
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const jwk = await keyFor(origin, header.kid, deps);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, RSA, false, [
      "verify",
    ]);
    const valid = await crypto.subtle.verify(
      RSA,
      key,
      decodeBase64Url(rawSignature),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
    if (!valid) return null;
    const claims = decodeJson(rawPayload);
    const seconds = (deps.now ?? Date.now()) / 1000;
    if (claims.iss !== origin) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) return null;
    if (typeof claims.exp !== "number" || claims.exp + LEEWAY_SECONDS < seconds)
      return null;
    if (typeof claims.nbf === "number" && claims.nbf - LEEWAY_SECONDS > seconds)
      return null;
    // Tokens de serviço não têm e-mail: aqui só entra pessoa autorizada.
    const email =
      typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!email || !allowed.includes(email)) return null;
    return { email };
  } catch {
    return null;
  }
}

/** Lê o cookie do Access, usado quando o cabeçalho não vem na requisição. */
export function accessCookie(cookieHeader: string | null | undefined) {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "CF_Authorization") return value.join("=") || null;
  }
  return null;
}
