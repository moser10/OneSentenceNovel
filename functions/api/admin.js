import { corsHeaders, json, requireDb, ensureAppSchema } from "./_shared.js";
import { hashPassword, verifyPassword } from "./_crypto.js";

const SESSION_HOURS = 12;

async function ensureAdminSchema(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS admin_auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL DEFAULT 'sa',
        password_hash TEXT,
        password_plain TEXT,
        temp_password TEXT,
        temp_password_used_at TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL
      )`
    )
    .run();
  const row = await db.prepare("SELECT id FROM admin_auth WHERE id = 1").first();
  if (!row) {
    await db
      .prepare("INSERT INTO admin_auth (id, username, password_plain) VALUES (1, 'sa', '1qaz2wsx')")
      .run();
  }
}

async function getAdminRow(db) {
  return db.prepare("SELECT * FROM admin_auth WHERE id = 1").first();
}

async function verifyAdminLogin(db, username, password) {
  const row = await getAdminRow(db);
  if (!row || row.username !== username) return false;

  if (row.password_hash && (await verifyPassword(password, row.password_hash))) return true;
  if (row.password_plain && password === row.password_plain) {
    const h = await hashPassword(password);
    await db.prepare("UPDATE admin_auth SET password_hash = ?, password_plain = NULL WHERE id = 1").bind(h).run();
    return true;
  }
  if (row.temp_password && password === row.temp_password) {
    const used = row.temp_password_used_at ? new Date(row.temp_password_used_at).getTime() : 0;
    if (used && Date.now() - used > 24 * 3600 * 1000) return false;
    if (!row.temp_password_used_at) {
      await db.prepare("UPDATE admin_auth SET temp_password_used_at = datetime('now') WHERE id = 1").run();
    }
    return true;
  }
  return false;
}

async function requireAdmin(request, db) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("未登录管理后台");
  const session = await db
    .prepare("SELECT * FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first();
  if (!session) throw new Error("管理会话已过期，请重新登录");
  return token;
}

function gameLabel(gameId, title) {
  const map = { osn: "OSN" };
  const prefix = map[gameId] || gameId?.toUpperCase() || "GAME";
  return `${prefix}-${title}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = requireDb(env);
    await ensureAdminSchema(db);
    await ensureAppSchema(db);

    if (request.method === "POST" && action === "login") {
      const { username, password } = await request.json();
      const ok = await verifyAdminLogin(db, username?.trim(), password);
      if (!ok) return json({ error: "用户名或密码错误" }, 401);

      const token = crypto.randomUUID();
      await db
        .prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, datetime('now', '+12 hours'))")
        .bind(token)
        .run();
      return json({ success: true, token });
    }

    await requireAdmin(request, db);

    if (request.method === "GET" && action === "users") {
      const { results } = await db
        .prepare(
          `SELECT id, username, email, datetime(created_at, 'localtime') AS created_at,
                  password_plain, must_change_password
           FROM users ORDER BY id DESC`
        )
        .all();
      return json({ users: results });
    }

    if (request.method === "GET" && action === "rooms") {
      const { results } = await db
        .prepare(
          `SELECT s.id, s.game_id, s.title, s.invite_code,
                  datetime(s.created_at, 'localtime') AS created_at,
                  u.username AS owner_name
           FROM stories s JOIN users u ON s.owner_id = u.id
           ORDER BY s.id DESC`
        )
        .all();
      return json({
        rooms: results.map((r) => ({
          ...r,
          display_name: gameLabel(r.game_id, r.title),
          full_name: r.game_id === "osn" ? "One Sentence Novel" : r.title,
        })),
      });
    }

    if (request.method === "POST" && action === "delete_user") {
      const { user_id } = await request.json();
      await db.prepare("DELETE FROM story_members WHERE user_id = ?").bind(user_id).run();
      await db.prepare("DELETE FROM users WHERE id = ?").bind(user_id).run();
      return json({ success: true });
    }

    if (request.method === "POST" && action === "delete_room") {
      const { story_id } = await request.json();
      await db.prepare("DELETE FROM content_stream WHERE story_id = ?").bind(story_id).run();
      await db.prepare("DELETE FROM story_members WHERE story_id = ?").bind(story_id).run();
      await db.prepare("DELETE FROM room_presence WHERE story_id = ?").bind(story_id).run();
      await db.prepare("DELETE FROM stories WHERE id = ?").bind(story_id).run();
      return json({ success: true });
    }

    return json({ error: "未知操作" }, 404);
  } catch (err) {
    return json({ error: err.message }, err.message.includes("未登录") ? 401 : 500);
  }
}
