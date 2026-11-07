// Validação do token do Cloudflare Access. Chaves e e-mails gerados só para o teste.
import test from "node:test";
import assert from "node:assert/strict";
import {
  accessCookie,
  clearAccessKeys,
  teamOrigin,
  verifyAccessToken,
} from "../app/lib/access-token.ts";

const TEAM = "equipe-ficticia";
const ISS = `https://${TEAM}.cloudflareaccess.com`;
const AUD = "aud-ficticio";
const EMAIL = "pessoa@exemplo.test";
const config = {
  teamDomain: `${TEAM}.cloudflareaccess.com`,
  audience: AUD,
  allowedEmails: `outra@exemplo.test, ${EMAIL.toUpperCase()}`,
};
const NOW = Date.parse("2026-11-07T12:00:00Z");
const seconds = NOW / 1000;
const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

const generate = async (kid) => {
  const pair = await crypto.subtle.generateKey(
    {
      ...RSA,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  return {
    privateKey: pair.privateKey,
    jwk: { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid },
  };
};
const main = await generate("chave-1");
const other = await generate("chave-2");

const b64 = (value) =>
  Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
  ).toString("base64url");
const sign = async (claims = {}, options = {}) => {
  const header = b64({ alg: "RS256", kid: "chave-1", ...options.header });
  const payload = b64({
    iss: ISS,
    aud: [AUD],
    email: EMAIL,
    exp: seconds + 3600,
    nbf: seconds - 60,
    iat: seconds - 60,
    type: "app",
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    RSA,
    (options.key ?? main).privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${Buffer.from(signature).toString("base64url")}`;
};
const deps = (keys = [main.jwk]) => {
  clearAccessKeys();
  const calls = [];
  return {
    now: NOW,
    calls,
    fetchKeys: async (url) => {
      calls.push(url);
      return keys;
    },
  };
};
const verify = (token, overrides = {}, d = deps()) =>
  verifyAccessToken(token, { ...config, ...overrides }, d);

test("token válido identifica a pessoa, em minúsculas", async () => {
  const d = deps();
  const identity = await verify(await sign(), {}, d);
  assert.deepEqual(identity, { email: EMAIL });
  assert.deepEqual(d.calls, [`${ISS}/cdn-cgi/access/certs`]);
});

test("e-mail fora da lista não entra, mesmo com token válido", async () => {
  assert.equal(
    await verify(await sign({ email: "intruso@exemplo.test" })),
    null,
  );
});

test("sem configuração completa, ninguém entra", async () => {
  const token = await sign();
  assert.equal(await verify(token, { allowedEmails: "" }), null);
  assert.equal(await verify(token, { allowedEmails: undefined }), null);
  assert.equal(await verify(token, { audience: "" }), null);
  assert.equal(await verify(token, { teamDomain: undefined }), null);
  assert.equal(await verify(null), null);
  assert.equal(await verify(""), null);
});

test("token de outra aplicação ou de outro time é recusado", async () => {
  assert.equal(await verify(await sign({ aud: ["outro-aud"] })), null);
  assert.equal(
    await verify(await sign({ iss: "https://outro.cloudflareaccess.com" })),
    null,
  );
});

test("aud como texto simples também é aceito", async () => {
  assert.deepEqual(await verify(await sign({ aud: AUD })), { email: EMAIL });
});

test("token vencido ou ainda não válido é recusado, com folga de um minuto", async () => {
  assert.equal(await verify(await sign({ exp: seconds - 120 })), null);
  assert.ok(await verify(await sign({ exp: seconds - 30 })));
  assert.equal(await verify(await sign({ nbf: seconds + 120 })), null);
  assert.equal(await verify(await sign({ exp: undefined })), null);
});

test("assinatura de outra chave com o mesmo identificador é recusada", async () => {
  assert.equal(await verify(await sign({}, { key: other })), null);
});

test("conteúdo alterado depois de assinar é recusado", async () => {
  const [header, , signature] = (await sign()).split(".");
  const forged = b64({
    iss: ISS,
    aud: [AUD],
    email: EMAIL,
    exp: seconds + 9999,
  });
  assert.equal(await verify(`${header}.${forged}.${signature}`), null);
});

test("o token não escolhe o algoritmo", async () => {
  const payload = b64({
    iss: ISS,
    aud: [AUD],
    email: EMAIL,
    exp: seconds + 3600,
  });
  assert.equal(await verify(`${b64({ alg: "none" })}.${payload}.`), null);
  assert.equal(
    await verify(`${b64({ alg: "HS256", kid: "chave-1" })}.${payload}.AAAA`),
    null,
  );
  assert.equal(
    await verify(await sign({}, { header: { kid: undefined } })),
    null,
  );
});

test("token de serviço, sem e-mail, é recusado", async () => {
  assert.equal(await verify(await sign({ email: undefined })), null);
});

test("lixo no lugar do token não derruba o site", async () => {
  for (const junk of ["a", "a.b", "a.b.c", "%%%.%%%.%%%", "..", "e30.e30.e30"])
    assert.equal(await verify(junk), null, junk);
});

test("sem acesso às chaves, ninguém entra", async () => {
  clearAccessKeys();
  const identity = await verifyAccessToken(await sign(), config, {
    now: NOW,
    fetchKeys: async () => {
      throw new Error("fora do ar");
    },
  });
  assert.equal(identity, null);
});

test("chaves ficam em memória, e uma chave nova força outra busca", async () => {
  const d = deps([main.jwk]);
  await verify(await sign(), {}, d);
  await verify(await sign(), {}, d);
  assert.equal(d.calls.length, 1, "reaproveita");
  d.fetchKeys = async (url) => {
    d.calls.push(url);
    return [main.jwk, other.jwk];
  };
  const rotated = await sign({}, { key: other, header: { kid: "chave-2" } });
  assert.deepEqual(await verify(rotated, {}, d), { email: EMAIL });
  assert.equal(d.calls.length, 2, "rotação");
});

test("as chaves só vêm do domínio do Access", () => {
  assert.equal(teamOrigin("time"), "https://time.cloudflareaccess.com");
  assert.equal(
    teamOrigin("https://Time.cloudflareaccess.com/"),
    "https://time.cloudflareaccess.com",
  );
  assert.equal(teamOrigin("evil.example.com"), null);
  assert.equal(teamOrigin("https://evil.example.com/x"), null);
  assert.equal(teamOrigin("time.cloudflareaccess.com.evil.test"), null);
  assert.equal(teamOrigin(""), null);
  assert.equal(teamOrigin(undefined), null);
});

test("cookie do Access", () => {
  assert.equal(accessCookie("a=1; CF_Authorization=abc.def=; b=2"), "abc.def=");
  assert.equal(accessCookie("a=1"), null);
  assert.equal(accessCookie(null), null);
});
