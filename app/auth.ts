/// <reference types="vite/client" />
import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { accessCookie, verifyAccessToken } from "./lib/access-token";

export type User = { userId: string; displayName: string; email: string };

/** Só existe no servidor de desenvolvimento: o build de produção não contém este caminho. */
const DEV_COOKIE = "atlas_dev_user";

const userOf = (email: string): User => ({
  userId: email,
  displayName: email,
  email,
});

export async function getUser(): Promise<User | null> {
  if (import.meta.env?.DEV) {
    const email = (await cookies()).get(DEV_COOKIE)?.value;
    return email ? userOf(email) : null;
  }
  const requestHeaders = await headers();
  const identity = await verifyAccessToken(
    requestHeaders.get("cf-access-jwt-assertion") ??
      accessCookie(requestHeaders.get("cookie")),
    {
      teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
      audience: env.CF_ACCESS_AUD,
      allowedEmails: env.ATLAS_ALLOWED_EMAILS,
    },
  );
  return identity ? userOf(identity.email) : null;
}
