import { corsHeaders, json, requireDb, generateUniqueName, ensureAppSchema } from "./_shared.js";
import { hashPassword, verifyPassword, randomPassword } from "./_crypto.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) {
    throw new Error("邮件服务未配置（RESEND_API_KEY）");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "game@1024201.com", to, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`邮件发送失败 (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    must_change_password: !!row.must_change_password,
    email_verified: row.email_verified !== 0,
  };
}

function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

function siteOrigin(request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  return "https://www.1024201.com";
}

async function findUserByEmail(db, email) {
  return db
    .prepare(
      `SELECT id, email, username, password_hash, password_plain, temp_password, temp_password_expires,
              must_change_password, email_verified
       FROM users WHERE email = ?`
    )
    .bind(email)
    .first();
}

async function verifyUserPassword(user, password) {
  if (user.password_hash && (await verifyPassword(password, user.password_hash))) return true;
  if (user.password_plain && password === user.password_plain) return true;
  if (user.temp_password && password === user.temp_password) {
    if (user.temp_password_expires && new Date(user.temp_password_expires) < new Date()) return false;
    return true;
  }
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = requireDb(env);
    await ensureAppSchema(db);

    if (request.method === "GET" && action === "verify") {
      const token = url.searchParams.get("token")?.trim();
      if (!token) {
        return Response.redirect(`${siteOrigin(request)}/game/register/?verify=invalid`, 302);
      }
      const user = await db
        .prepare(
          `SELECT id FROM users
           WHERE email_verify_token = ?
             AND email_verified = 0
             AND (email_verify_expires IS NULL OR email_verify_expires > datetime('now'))`
        )
        .bind(token)
        .first();
      if (!user) {
        return Response.redirect(`${siteOrigin(request)}/game/register/?verify=invalid`, 302);
      }
      await db
        .prepare(
          `UPDATE users SET email_verified = 1, email_verify_token = NULL, email_verify_expires = NULL WHERE id = ?`
        )
        .bind(user.id)
        .run();
      return Response.redirect(`${siteOrigin(request)}/game/register/?verify=ok`, 302);
    }

    if (request.method === "POST" && action === "check") {
      const { username } = await request.json();
      const name = username?.trim();
      if (!name) return json({ error: "昵称不能为空" }, 400);
      const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(name).first();
      if (existing) {
        const recommend = await generateUniqueName(db, name, "users", "username");
        return json({ available: false, recommend });
      }
      return json({ available: true });
    }

    if (request.method === "POST" && action === "check_email") {
      const { email } = await request.json();
      const mail = email?.trim();
      if (!mail) return json({ error: "邮箱不能为空" }, 400);
      if (!isValidEmail(mail)) return json({ available: false, error: "邮箱格式不正确" });
      const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(mail).first();
      return json({ available: !existing });
    }

    if (request.method === "POST" && action === "register") {
      const { email, username, password } = await request.json();
      const mail = email?.trim();
      const name = username?.trim();
      const pass = password?.trim();
      if (!mail || !name || !pass) return json({ error: "邮箱、昵称和密码不能为空" }, 400);
      if (!isValidEmail(mail)) return json({ error: "邮箱格式不正确" }, 400);
      if (pass.length < 6) return json({ error: "密码至少 6 位" }, 400);

      if (await db.prepare("SELECT id FROM users WHERE email = ?").bind(mail).first()) {
        return json({ error: "该邮箱已被注册" }, 400);
      }
      if (await db.prepare("SELECT id FROM users WHERE username = ?").bind(name).first()) {
        return json({ error: "该昵称已被占用" }, 400);
      }

      const passHash = await hashPassword(pass);
      const verifyToken = crypto.randomUUID();
      const result = await db
        .prepare(
          `INSERT INTO users (email, username, password_hash, password_plain, email_verified, email_verify_token, email_verify_expires)
           VALUES (?, ?, ?, ?, 0, ?, datetime('now', '+48 hours'))`
        )
        .bind(mail, name, passHash, pass, verifyToken)
        .run();

      const today = new Date().toLocaleDateString("zh-CN");
      const verifyUrl = `${siteOrigin(request)}/api/auth?action=verify&token=${verifyToken}`;
      await sendMail(
        env,
        mail,
        "1024201 游戏中心 · 请验证邮箱",
        `<p>欢迎 <strong>${name}</strong> 来到1024201的游戏中心，首先验证邮件地址：</p>
         <p><a href="${verifyUrl}">点击此处验证邮箱</a></p>
         <p>祝玩儿的开心。</p>
         <br><p>落款 1024201<br>${today}</p>`
      );

      return json({
        success: true,
        verify_sent: true,
        message: `验证邮件已发送至 ${mail}，请点击邮件中的链接完成验证后再登录。`,
        user: { id: result.meta.last_row_id, email: mail, username: name, email_verified: false },
      });
    }

    if (request.method === "POST" && action === "login") {
      const { email, password } = await request.json();
      const mail = email?.trim();
      const pass = password?.trim();
      if (!mail || !pass) return json({ error: "邮箱和密码不能为空" }, 400);

      const user = await findUserByEmail(db, mail);
      if (!user) return json({ error: "该邮箱尚未注册" }, 404);
      if (!(await verifyUserPassword(user, pass))) return json({ error: "密码错误" }, 401);
      if (!user.email_verified) {
        return json({ error: "邮箱尚未验证，请查收注册邮件并点击验证链接" }, 403);
      }

      if (user.temp_password && pass === user.temp_password) {
        await db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").bind(user.id).run();
        user.must_change_password = 1;
      }
      if (user.password_plain && pass === user.password_plain) {
        const h = await hashPassword(pass);
        await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(h, user.id).run();
      }

      return json({ user: publicUser(user) });
    }

    if (request.method === "POST" && action === "forgot") {
      const { email } = await request.json();
      const mail = email?.trim();
      if (!mail) return json({ error: "请输入注册邮箱" }, 400);
      const user = await findUserByEmail(db, mail);
      if (!user) return json({ error: "该邮箱尚未注册" }, 404);

      const temp = randomPassword(8);
      await db
        .prepare(
          "UPDATE users SET temp_password = ?, temp_password_expires = datetime('now', '+24 hours'), must_change_password = 1 WHERE id = ?"
        )
        .bind(temp, user.id)
        .run();

      await sendMail(
        env,
        mail,
        "1024201 游戏中心 · 临时密码",
        `<p>你的临时密码是：<strong>${temp}</strong></p><p>请在 24 小时内使用临时密码登录，并按提示修改新密码。</p>`
      );
      return json({ success: true, message: "临时密码已发送至邮箱" });
    }

    if (request.method === "POST" && action === "change_password") {
      const { user_id, password, password2 } = await request.json();
      if (!password || password !== password2) return json({ error: "两次密码不一致" }, 400);
      if (password.length < 6) return json({ error: "密码至少 6 位" }, 400);

      const passHash = await hashPassword(password);
      await db
        .prepare(
          `UPDATE users SET password_hash = ?, password_plain = ?, temp_password = NULL,
           temp_password_expires = NULL, must_change_password = 0 WHERE id = ?`
        )
        .bind(passHash, password, user_id)
        .run();
      return json({
        success: true,
        message: "密码已更新。下次登录请使用新密码；本次无需退出，可继续游戏。",
      });
    }

    if (request.method === "GET" && action === "search") {
      const q = url.searchParams.get("q")?.trim();
      if (!q) return json({ users: [] });
      const { results } = await db
        .prepare("SELECT id, username, email FROM users WHERE username LIKE ? LIMIT 20")
        .bind(`%${q}%`)
        .all();
      return json({ users: results });
    }

    return json({ error: "未知操作" }, 404);
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("no such column") && msg.includes("password")) {
      return json(
        { error: "数据库未升级：请在 D1 Console 执行 schema-migrate-v4.sql 中的 ALTER TABLE users 语句" },
        503
      );
    }
    return json({ error: err.message }, 500);
  }
}
