import {
  corsHeaders,
  json,
  requireDb,
  generateUniqueName,
  isMember,
  hasActiveOwner,
  touchPresence,
  leavePresence,
  cleanupInactiveChat,
  buildChaptersFromBook,
  ensureAppSchema,
  canGenerateChapters,
  bookCharCount,
  MIN_CHAPTER_CHARS,
  MIN_CHAPTERS_COUNT,
} from "./_shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = requireDb(env);
    await ensureAppSchema(db);

    if (request.method === "POST" && action === "check_title") {
      const { title } = await request.json();
      const name = title?.trim();
      if (!name) return json({ error: "书名不能为空" }, 400);

      const existing = await db.prepare("SELECT id FROM stories WHERE title = ?").bind(name).first();
      if (existing) {
        const recommend = await generateUniqueName(db, name, "stories", "title");
        return json({ available: false, recommend });
      }
      return json({ available: true });
    }

    if (request.method === "POST" && action === "create_room") {
      const { title, owner_id } = await request.json();
      const name = title?.trim();
      if (!name || !owner_id) return json({ error: "书名和房主不能为空" }, 400);

      const exist = await db.prepare("SELECT id, owner_id, invite_code, title FROM stories WHERE title = ?").bind(name).first();
      if (exist) {
        const owned = await hasActiveOwner(db, exist.id, exist.owner_id);
        if (!owned && exist.owner_id === owner_id) {
          await db
            .prepare(
              "INSERT INTO story_members (story_id, user_id, role, status) VALUES (?, ?, 'owner', 'active') ON CONFLICT(story_id, user_id) DO UPDATE SET role = 'owner', status = 'active'"
            )
            .bind(exist.id, owner_id)
            .run();
          return json({
            success: true,
            story_id: exist.id,
            invite_code: exist.invite_code,
            title: exist.title,
            repaired: true,
          });
        }
        if (!owned) {
          await db.prepare("DELETE FROM stories WHERE id = ?").bind(exist.id).run();
        } else {
          const recommend = await generateUniqueName(db, name, "stories", "title");
          return json({ error: "书名已被占用", recommend }, 400);
        }
      }

      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      let storyId;
      try {
        const result = await db
          .prepare("INSERT INTO stories (title, owner_id, invite_code, game_id) VALUES (?, ?, ?, 'osn')")
          .bind(name, owner_id, inviteCode)
          .run();
        storyId = result.meta.last_row_id;

        await db
          .prepare(
            "INSERT INTO story_members (story_id, user_id, role, status) VALUES (?, ?, 'owner', 'active')"
          )
          .bind(storyId, owner_id)
          .run();
      } catch (err) {
        if (storyId) await db.prepare("DELETE FROM stories WHERE id = ?").bind(storyId).run();
        throw err;
      }

      return json({ success: true, story_id: storyId, invite_code: inviteCode, title: name });
    }

    if (request.method === "POST" && action === "update_title") {
      const { story_id, user_id, title } = await request.json();
      const name = title?.trim();
      const story = await db.prepare("SELECT owner_id FROM stories WHERE id = ?").bind(story_id).first();
      if (!story || story.owner_id !== user_id) return json({ error: "仅房主可修改书名" }, 403);

      const dup = await db.prepare("SELECT id FROM stories WHERE title = ? AND id != ?").bind(name, story_id).first();
      if (dup) {
        const recommend = await generateUniqueName(db, name, "stories", "title");
        return json({ error: "书名已被占用", recommend }, 400);
      }

      await db.prepare("UPDATE stories SET title = ? WHERE id = ?").bind(name, story_id).run();
      return json({ success: true, title: name });
    }

    if (request.method === "GET" && action === "todos") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return json({ error: "缺少 user_id" }, 400);

      const { results: waiting } = await db
        .prepare(
          `SELECT s.id AS story_id, s.title
           FROM story_members sm JOIN stories s ON sm.story_id = s.id
           WHERE sm.user_id = ? AND sm.status = 'pending'`
        )
        .bind(userId)
        .all();

      const { results: approveRows } = await db
        .prepare(
          `SELECT s.id AS story_id, s.title, sm.user_id, u.username
           FROM stories s
           JOIN story_members sm ON sm.story_id = s.id AND sm.status = 'pending'
           JOIN users u ON sm.user_id = u.id
           WHERE s.owner_id = ?`
        )
        .bind(userId)
        .all();

      const approveMap = {};
      for (const row of approveRows) {
        if (!approveMap[row.story_id]) {
          approveMap[row.story_id] = { story_id: row.story_id, title: row.title, requests: [] };
        }
        approveMap[row.story_id].requests.push({ user_id: row.user_id, username: row.username });
      }

      return json({
        waiting,
        to_approve: Object.values(approveMap),
      });
    }

    if (request.method === "GET" && action === "search") {
      const q = url.searchParams.get("q")?.trim();
      const userId = url.searchParams.get("user_id");
      if (!q) return json({ rooms: [] });

      const { results } = await db
        .prepare(
          `SELECT s.id, s.title, s.invite_code, u.username AS owner_name,
                  sm.status AS my_status, sm.role AS my_role
           FROM stories s
           JOIN users u ON s.owner_id = u.id
           LEFT JOIN story_members sm ON sm.story_id = s.id AND sm.user_id = ?
           WHERE s.title LIKE ? LIMIT 20`
        )
        .bind(userId || null, `%${q}%`)
        .all();
      return json({ rooms: results });
    }

    if (request.method === "POST" && action === "join_by_code") {
      const { invite_code, user_id } = await request.json();
      const code = invite_code?.trim().toUpperCase();
      const story = await db.prepare("SELECT id, title FROM stories WHERE invite_code = ?").bind(code).first();
      if (!story) return json({ error: "邀请码无效" }, 404);

      const member = await isMember(db, story.id, user_id);
      if (member?.status === "active") return json({ error: "你已在该房间中", already_in: true, story });
      if (member?.status === "pending") return json({ error: "你的申请正在等待房主同意", pending: true, story });

      await db
        .prepare(
          "INSERT INTO story_members (story_id, user_id, role, status) VALUES (?, ?, 'member', 'active') ON CONFLICT(story_id, user_id) DO UPDATE SET status = 'active'"
        )
        .bind(story.id, user_id)
        .run();

      return json({ success: true, story });
    }

    if (request.method === "POST" && action === "request_join") {
      const { story_id, user_id } = await request.json();
      const story = await db.prepare("SELECT id, title FROM stories WHERE id = ?").bind(story_id).first();
      if (!story) return json({ error: "房间不存在" }, 404);

      const member = await isMember(db, story_id, user_id);
      if (member?.status === "active") return json({ error: "你已在该房间中", already_in: true });
      if (member?.status === "pending") return json({ error: "已提交申请，请等待房主同意", pending: true });

      await db
        .prepare(
          "INSERT INTO story_members (story_id, user_id, role, status) VALUES (?, ?, 'member', 'pending') ON CONFLICT(story_id, user_id) DO UPDATE SET status = 'pending'"
        )
        .bind(story_id, user_id)
        .run();

      return json({ success: true, message: "已提交申请，等待房主同意" });
    }

    if (request.method === "GET" && action === "pending") {
      const storyId = url.searchParams.get("story_id");
      const ownerId = url.searchParams.get("owner_id");
      const story = await db.prepare("SELECT owner_id FROM stories WHERE id = ?").bind(storyId).first();
      if (!story || story.owner_id !== Number(ownerId)) return json({ error: "无权查看" }, 403);

      const { results } = await db
        .prepare(
          `SELECT sm.user_id, u.username, u.email, sm.status
           FROM story_members sm JOIN users u ON sm.user_id = u.id
           WHERE sm.story_id = ? AND sm.status = 'pending'`
        )
        .bind(storyId)
        .all();
      return json({ pending: results });
    }

    if (request.method === "POST" && action === "approve_join") {
      const { story_id, owner_id, user_id } = await request.json();
      const story = await db.prepare("SELECT owner_id FROM stories WHERE id = ?").bind(story_id).first();
      if (!story || story.owner_id !== owner_id) return json({ error: "仅房主可审批" }, 403);

      await db
        .prepare("UPDATE story_members SET status = 'active' WHERE story_id = ? AND user_id = ?")
        .bind(story_id, user_id)
        .run();
      return json({ success: true });
    }

    if (request.method === "POST" && action === "pull_user") {
      const { story_id, owner_id, user_id } = await request.json();
      const story = await db.prepare("SELECT owner_id FROM stories WHERE id = ?").bind(story_id).first();
      if (!story || story.owner_id !== owner_id) return json({ error: "仅房主可拉人" }, 403);

      const member = await isMember(db, story_id, user_id);
      if (member?.status === "active") return json({ error: "该用户已在群中", already_in: true });

      await db
        .prepare(
          "INSERT INTO story_members (story_id, user_id, role, status) VALUES (?, ?, 'member', 'active') ON CONFLICT(story_id, user_id) DO UPDATE SET status = 'active'"
        )
        .bind(story_id, user_id)
        .run();
      return json({ success: true });
    }

    if (request.method === "POST" && action === "heartbeat") {
      const { story_id, user_id } = await request.json();
      const member = await isMember(db, story_id, user_id);
      if (!member || member.status !== "active") return json({ error: "你不在该房间中" }, 403);
      await touchPresence(db, story_id, user_id);
      return json({ success: true });
    }

    if (request.method === "POST" && action === "leave_room") {
      const { story_id, user_id } = await request.json();
      await leavePresence(db, story_id, user_id);
      await cleanupInactiveChat(db, story_id);
      return json({ success: true });
    }

    if (request.method === "POST" && action === "generate_chapters") {
      const { story_id, user_id } = await request.json();
      const member = await isMember(db, story_id, user_id);
      if (!member || member.status !== "active") return json({ error: "你不在该房间中" }, 403);

      const { results } = await db
        .prepare(
          `SELECT c.id, c.text FROM content_stream c
           WHERE c.story_id = ? AND c.type = 'book' AND c.status = 'active'
           ORDER BY c.id ASC`
        )
        .bind(story_id)
        .all();

      const chapters = buildChaptersFromBook(results);
      if (!chapters.length) {
        const total = bookCharCount(results);
        const need = MIN_CHAPTER_CHARS * MIN_CHAPTERS_COUNT;
        return json(
          {
            error: `内容不足，无法分章。至少需要 ${need} 字（每章不少于 ${MIN_CHAPTER_CHARS} 字，且至少 ${MIN_CHAPTERS_COUNT} 章）。当前共 ${total} 字。`,
          },
          400
        );
      }
      await db
        .prepare("UPDATE stories SET chapters_json = ? WHERE id = ?")
        .bind(JSON.stringify(chapters), story_id)
        .run();

      return json({ success: true, chapters });
    }

    if (request.method === "GET" && action === "members") {
      const storyId = url.searchParams.get("story_id");
      const { results } = await db
        .prepare(
          `SELECT sm.user_id, u.username, sm.role, sm.status
           FROM story_members sm JOIN users u ON sm.user_id = u.id
           WHERE sm.story_id = ? AND sm.status = 'active'`
        )
        .bind(storyId)
        .all();
      return json({ members: results });
    }

    if (request.method === "GET" && action === "my_rooms") {
      const userId = url.searchParams.get("user_id");
      const { results } = await db
        .prepare(
          `SELECT s.id, s.title, s.invite_code, sm.role, sm.status
           FROM story_members sm JOIN stories s ON sm.story_id = s.id
           WHERE sm.user_id = ? AND sm.status = 'active'`
        )
        .bind(userId)
        .all();
      return json({ rooms: results });
    }

    if (request.method === "GET" && action === "content") {
      const storyId = url.searchParams.get("story_id");
      const userId = url.searchParams.get("user_id");
      const member = await isMember(db, storyId, userId);
      if (!member || member.status !== "active") return json({ error: "你不在该房间中" }, 403);

      await touchPresence(db, storyId, userId);
      await cleanupInactiveChat(db, storyId);

      const story = await db
        .prepare("SELECT title, chapters_json, invite_code, owner_id FROM stories WHERE id = ?")
        .bind(storyId)
        .first();

      const { results } = await db
        .prepare(
          `SELECT c.id, c.type, c.text, c.status, c.user_id,
                  u.username AS author,
                  datetime(c.created_at, 'localtime') AS time
           FROM content_stream c JOIN users u ON c.user_id = u.id
           WHERE c.story_id = ? AND c.status = 'active'
           ORDER BY c.id ASC`
        )
        .bind(storyId)
        .all();

      const book = results.filter((r) => r.type === "book");
      const chat = results.filter((r) => r.type === "chat");
      let chapters = [];
      try {
        chapters = story?.chapters_json ? JSON.parse(story.chapters_json) : [];
      } catch (_) {}

      return json({
        title: story?.title,
        invite_code: story?.invite_code,
        owner_id: story?.owner_id,
        book,
        chat,
        chapters,
        total_chars: bookCharCount(book),
        can_chapter: canGenerateChapters(book),
      });
    }

    if (request.method === "POST" && action === "publish") {
      const { story_id, user_id, type, text } = await request.json();
      const content = text?.trim();
      if (!content) return json({ error: "内容不能为空" }, 400);
      if (!["book", "chat"].includes(type)) return json({ error: "类型无效" }, 400);

      const member = await isMember(db, story_id, user_id);
      if (!member || member.status !== "active") return json({ error: "你不在该房间中" }, 403);

      if (type === "book") {
        const penalty = await db
          .prepare(
            `SELECT COUNT(*) AS count FROM recall_logs
             WHERE user_id = ? AND recalled_at > datetime('now', '-30 minutes')`
          )
          .bind(user_id)
          .first();
        if (penalty?.count >= 10) {
          return json({ error: "因半小时内撤回超过10次，写书功能已被冻结30分钟，但你仍可以聊天。" }, 403);
        }

        const last = await db
          .prepare(
            `SELECT user_id FROM content_stream
             WHERE story_id = ? AND type = 'book' AND status = 'active'
             ORDER BY id DESC LIMIT 1`
          )
          .bind(story_id)
          .first();
        if (last && last.user_id === user_id) {
          return json({ error: "不能连续写书，等其他人写一句吧！" }, 400);
        }
      }

      const result = await db
        .prepare("INSERT INTO content_stream (story_id, user_id, type, text) VALUES (?, ?, ?, ?)")
        .bind(story_id, user_id, type, content)
        .run();

      return json({ success: true, id: result.meta.last_row_id });
    }

    if (request.method === "POST" && action === "recall") {
      const { content_id, user_id } = await request.json();
      const msg = await db
        .prepare("SELECT created_at, user_id FROM content_stream WHERE id = ? AND user_id = ?")
        .bind(content_id, user_id)
        .first();

      if (!msg) return json({ error: "未找到该条记录" }, 404);

      const timeDiff = (Date.now() - new Date(msg.created_at).getTime()) / 60000;
      if (timeDiff > 30) return json({ error: "已超过30分钟，无法撤回" }, 400);

      await db.prepare("UPDATE content_stream SET status = 'recalled' WHERE id = ?").bind(content_id).run();
      await db.prepare("INSERT INTO recall_logs (user_id) VALUES (?)").bind(user_id).run();

      return json({ success: true });
    }

    return json({ error: "未知操作" }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
