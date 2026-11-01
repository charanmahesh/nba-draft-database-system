import "dotenv/config";
import { withUserTx, pool } from "../lib/db/pg";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("Set DEMO_PASSWORD to the documented local demo password");
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function call(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...options });
  const body = await response.json().catch(() => null);
  return { response, body };
}
async function login(role: string, suppliedPassword = password) {
  return call("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${role}@draftboard.local`, password: suppliedPassword }) });
}
async function main() {
  const anonymous = await call("/api/auth/me");
  assert(anonymous.response.status === 401, "Anonymous /me must return 401");
  const forged = await call("/api/auth/me", { headers: { cookie: "draftboard_session=not-a-jwt" } });
  assert(forged.response.status === 401, "Invalid JWT must return 401");
  const protectedPage = await fetch(`${base}/dashboard`, { redirect: "manual" });
  assert(protectedPage.status === 307 && protectedPage.headers.get("location")?.endsWith("/login"), "Anonymous dashboard must redirect to login");
  const health = await call("/api/health");
  assert(health.response.status === 200 && health.body.ok, "Health must be public");
  const invalid = await call("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "invalid", password: "x" }) });
  assert(invalid.response.status === 400, "Invalid login input must return 400");
  assert((await login("scout", "wrong-password")).response.status === 401, "Wrong password must return 401");
  const cookies: Record<string, string> = {};
  let managerTeam = "";
  for (const role of ["admin", "scout", "analyst", "manager"]) {
    const result = await login(role);
    assert(result.response.status === 200 && result.body.ok, `${role} login failed`);
    const header = result.response.headers.get("set-cookie") ?? "";
    assert(/httponly/i.test(header) && /samesite=lax/i.test(header) && /max-age=3600/i.test(header), `${role} cookie flags invalid`);
    if (process.env.TEST_EXPECT_SECURE === "1") assert(/(?:^|;\s*)secure(?:;|$)/i.test(header), "Production cookie must be secure");
    const cookie = header.split(";")[0];
    cookies[role] = cookie;
    const me = await call("/api/auth/me", { headers: { cookie } });
    assert(me.response.status === 200 && me.body.data.email === `${role}@draftboard.local`, `${role} /me failed`);
    if (role === "manager") managerTeam = me.body.data.team_id;
    console.log(`PASS ${role} login and /me`);
  }
  assert(managerTeam, "Manager has no team");
  const otherTeam = (await pool.query<{ team_id: string }>("SELECT team_id::text FROM team WHERE team_id <> $1 ORDER BY team_id LIMIT 1", [managerTeam])).rows[0]?.team_id;
  assert(otherTeam, "Another team is required for the check");
  for (const role of ["scout", "analyst", "manager"]) {
    const team = role === "manager" ? otherTeam : managerTeam;
    for (const [path, method] of [["needs", "POST"], ["roster", "POST"], ["matches", "GET"]]) {
      const response = await call(`/api/teams/${team}/${path}`, { method, headers: { cookie: cookies[role] } });
      assert(response.response.status === 403, `${role} ${path} must be forbidden`);
    }
    console.log(`PASS ${role} denied needs, roster, and matches`);
  }
  for (const role of ["admin", "manager"]) {
    const team = role === "admin" ? otherTeam : managerTeam;
    for (const [path, method] of [["needs", "POST"], ["roster", "POST"], ["matches", "GET"]]) {
      const response = await call(`/api/teams/${team}/${path}`, { method, headers: { cookie: cookies[role] } });
      assert(response.response.status === 501, `${role} authorized ${path} should reach stub`);
    }
  }
  const manager = await call("/api/auth/me", { headers: { cookie: cookies.manager } });
  await withUserTx(manager.body.data.person_id, async (client) => {
    const setting = await client.query<{ actor: string }>("SELECT current_setting('app.current_user_id', true) AS actor");
    assert(setting.rows[0].actor === manager.body.data.person_id, "Transaction actor not set");
  });
  try {
    await withUserTx(manager.body.data.person_id, async (client) => {
      await client.query("INSERT INTO team (team_name, city) VALUES ($1, $2)", ["Phase 5 rollback fixture", "Test"]);
      throw new Error("rollback test");
    });
    throw new Error("Transaction unexpectedly succeeded");
  } catch (error) {
    assert(error instanceof Error && error.message === "rollback test", "Transaction did not propagate the callback error");
  }
  const rollback = await pool.query("SELECT 1 FROM team WHERE team_name = $1", ["Phase 5 rollback fixture"]);
  assert(rollback.rowCount === 0, "Transaction did not roll back");
  const loggedOut = await call("/api/auth/logout", { method: "POST", headers: { cookie: cookies.scout } });
  assert(loggedOut.response.status === 200 && /max-age=0/i.test(loggedOut.response.headers.get("set-cookie") ?? ""), "Logout did not clear cookie");
  const noCookie = await call("/api/auth/me");
  assert(noCookie.response.status === 401, "After logout without cookie /me must return 401");
  console.log("PASS wrong password, validation, unauthorized access, admin/own-team access, transaction actor and rollback, and logout cookie clearing");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
