export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requireDb(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    const keys = Object.keys(env || {}).filter((k) => !/TOKEN|KEY|SECRET/i.test(k));
    throw new Error(
      `D1 未生效。请确认：① wrangler.toml 中 database_id 已填写；② Worker 名称与 wrangler.toml 的 name 一致；③ 重新部署。当前 env 键：${keys.join(", ") || "无"}`
    );
  }
  return env.DB;
}

async function hasColumn(db, table, column) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
  return results.some((row) => row.name === column);
}

async function ensureColumn(db, table, column, alterSql) {
  if (await hasColumn(db, table, column)) return;
  await db.prepare(alterSql).run();
}

export async function ensureAppSchema(db) {
  await ensureColumn(db, "stories", "game_id", "ALTER TABLE stories ADD COLUMN game_id TEXT NOT NULL DEFAULT 'osn'");
  await ensureColumn(db, "stories", "chapters_json", "ALTER TABLE stories ADD COLUMN chapters_json TEXT");
  await ensureColumn(db, "users", "password_hash", "ALTER TABLE users ADD COLUMN password_hash TEXT");
  await ensureColumn(db, "users", "password_plain", "ALTER TABLE users ADD COLUMN password_plain TEXT");
  await ensureColumn(
    db,
    "users",
    "must_change_password",
    "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"
  );
  await ensureColumn(db, "users", "temp_password", "ALTER TABLE users ADD COLUMN temp_password TEXT");
  await ensureColumn(db, "users", "temp_password_expires", "ALTER TABLE users ADD COLUMN temp_password_expires TEXT");
  await ensureColumn(
    db,
    "users",
    "email_verified",
    "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1"
  );
  await ensureColumn(db, "users", "email_verify_token", "ALTER TABLE users ADD COLUMN email_verify_token TEXT");
  await ensureColumn(db, "users", "email_verify_expires", "ALTER TABLE users ADD COLUMN email_verify_expires TEXT");
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS room_presence (
        story_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        last_seen TEXT NOT NULL,
        PRIMARY KEY (story_id, user_id)
      )`
    )
    .run();
}

export async function generateUniqueName(db, baseName, table, column) {
  let finalName = "";
  for (let i = 0; i < 20; i++) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    finalName = `${baseName}_${randomNum}`;
    const existing = await db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).bind(finalName).first();
    if (!existing) return finalName;
  }
  return `${baseName}_${Date.now()}`;
}

export async function isMember(db, storyId, userId) {
  return db
    .prepare("SELECT status, role FROM story_members WHERE story_id = ? AND user_id = ?")
    .bind(storyId, userId)
    .first();
}

export async function hasActiveOwner(db, storyId, ownerId) {
  return db
    .prepare(
      "SELECT 1 AS ok FROM story_members WHERE story_id = ? AND user_id = ? AND role = 'owner' AND status = 'active'"
    )
    .bind(storyId, ownerId)
    .first();
}

export async function touchPresence(db, storyId, userId) {
  await db
    .prepare(
      `INSERT INTO room_presence (story_id, user_id, last_seen) VALUES (?, ?, datetime('now'))
       ON CONFLICT(story_id, user_id) DO UPDATE SET last_seen = datetime('now')`
    )
    .bind(storyId, userId)
    .run();
}

export async function leavePresence(db, storyId, userId) {
  await db.prepare("DELETE FROM room_presence WHERE story_id = ? AND user_id = ?").bind(storyId, userId).run();
}

export async function cleanupInactiveChat(db, storyId) {
  const active = await db
    .prepare(
      `SELECT 1 AS ok FROM room_presence
       WHERE story_id = ? AND last_seen > datetime('now', '-2 minutes')`
    )
    .bind(storyId)
    .first();
  if (!active) {
    await db.prepare("DELETE FROM content_stream WHERE story_id = ? AND type = 'chat'").bind(storyId).run();
    await db.prepare("DELETE FROM room_presence WHERE story_id = ?").bind(storyId).run();
  }
}

const MAX_CHAPTER_CHARS = 3000;
export const MIN_CHAPTER_CHARS = 200;
export const MIN_CHAPTERS_COUNT = 2;

export function bookCharCount(bookItems) {
  return bookItems.reduce((sum, item) => sum + (item.text?.length || 0), 0);
}

export function canGenerateChapters(bookItems) {
  return Math.floor(bookCharCount(bookItems) / MIN_CHAPTER_CHARS) >= MIN_CHAPTERS_COUNT;
}

export function buildChaptersFromBook(bookItems) {
  const total = bookCharCount(bookItems);
  if (!canGenerateChapters(bookItems)) return [];

  const chapterCount = Math.floor(total / MIN_CHAPTER_CHARS);
  const targetSize = total / chapterCount;
  const chapters = [];
  let bucket = [];
  let chars = 0;

  const flush = () => {
    if (!bucket.length) return;
    const no = chapters.length + 1;
    const snippet = bucket[0].text.slice(0, 10);
    chapters.push({
      no,
      title: `第${no}章 ${snippet}${bucket[0].text.length > 10 ? "…" : ""}`,
      content_ids: bucket.map((b) => b.id),
      text: bucket.map((b) => b.text).join(""),
    });
    bucket = [];
    chars = 0;
  };

  for (const item of bookItems) {
    bucket.push(item);
    chars += item.text.length;

    if (chars > MAX_CHAPTER_CHARS && bucket.length > 1) {
      const last = bucket.pop();
      chars -= last.text.length;
      flush();
      bucket.push(last);
      chars += last.text.length;
    }

    const chaptersLeft = chapterCount - chapters.length;
    if (chaptersLeft > 1 && chars >= targetSize && chars >= MIN_CHAPTER_CHARS) {
      flush();
    }
  }
  flush();

  return chapters.length >= MIN_CHAPTERS_COUNT ? chapters : [];
}
