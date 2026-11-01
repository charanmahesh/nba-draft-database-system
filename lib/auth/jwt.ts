import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

export const SESSION_COOKIE = "draftboard_session";
export const SESSION_MAX_AGE = 60 * 60;

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || new TextEncoder().encode(value).length < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(personId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(personId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], requiredClaims: ["sub", "iat", "exp"] });
    return typeof payload.sub === "string" && /^[1-9]\d*$/.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}
