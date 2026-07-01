import { corsHeaders, json, requireDb, generateUniqueName, ensureAppSchema } from "./_shared.js";
import { hashPassword, verifyPassword, randomPassword, randomVerifyCode } from "./_crypto.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function codeCaseLabel(code) {
  const hasUpper = /[A-Z]/.test(code);
  const hasLower = /[a-z]/.test(code);
  if (hasUpper && hasLower) {
    return { zh: "（其中包含大小写）", en: "(case-sensitive)" };
  }
  return { zh: "（其中不包含大小写）", en: "(not case-sensitive)" };
}

function welcomeEmailHtml(name, verifyCode, today) {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(verifyCode);
  const caseNote = codeCaseLabel(verifyCode);
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.8;color:#1c1c1e;">
<p style="margin:0 0 12px;">欢迎 ${safeName}，</p>
<p style="margin:0 0 12px;">Welcome ${safeName},</p>
<p style="margin:0 0 8px;padding-left:1em;">注册码：<strong style="font-size:18px;letter-spacing:2px;">${safeCode}</strong>${caseNote.zh}</p>
<p style="margin:0 0 8px;padding-left:1em;">Registration code: <strong style="font-size:18px;letter-spacing:2px;">${safeCode}</strong> ${caseNote.en}</p>
<p style="margin:0 0 8px;padding-left:1em;">请在注册页面输入此验证码完成注册。</p>
<p style="margin:0 0 16px;padding-left:1em;">Enter this code on the registration page to complete sign-up.</p>
<p style="margin:0;"><strong>1024201</strong></p>
<p style="margin:0;">${today}</p>
</div>`;
}

async function completePendingRegistration(db, pending) {
  if (await db.prepare("SELECT id FROM users WHERE email = ?").bind(pending.email).first()) {
    await db.prepare("DELETE FROM pending_registrations WHERE id = ?").bind(pending.id).run();
    return { ok: true, user: null, already: true };
  }
  if (await db.prepare("SELECT id FROM users WHERE username = ?").bind(pending.username).first()) {
    await db.prepare("DELETE FROM pending_registrations WHERE id = ?").bind(pending.id).run();
    return { ok: false, error: "昵称已被他人占用，请重新注册并更换昵称" };
  }
  const result = await db
    .prepare(
      `INSERT INTO users (email, username, password_hash, email_verified)
       VALUES (?, ?, ?, 1)`
    )
    .bind(pending.email, pending.username, pending.password_hash)
    .run();
  await db.prepare("DELETE FROM pending_registrations WHERE id = ?").bind(pending.id).run();
  const user = await db
    .prepare(
      `SELECT id, email, username, must_change_password, email_verified
       FROM users WHERE id = ?`
    )
    .bind(result.meta.last_row_id)
    .first();
  return { ok: true, user };
}

async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) {
    throw new Error("邮件服务未配置（RESEND_API_KEY）。请在 Cloudflare → Workers → 1024201-portal → Settings → Variables 添加 Secret。");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "admin@1024201.com", to, subject, html }),
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
    email_verified: true,
  };
}

function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

function siteOrigin(request) {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  return "https://1024201.com";
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

async function emailTaken(db, email) {
  return !!(await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first());
}

async function usernameTaken(db, username) {
  return !!(await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first());
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
      return Response.redirect(`${siteOrigin(request)}/game/register/?verify=deprecated`, 302);
    }

    if (request.method === "POST" && action === "verify_code") {
      const { email, code } = await request.json();
      const mail = email?.trim();
      const inputCode = code?.trim();
      if (!mail || !inputCode) return json({ error: "邮箱和验证码不能为空" }, 400);

      const pending = await db
        .prepare(
          `SELECT * FROM pending_registrations
           WHERE email = ? AND expires_at > datetime('now')`
        )
        .bind(mail)
        .first();

      if (!pending) return json({ error: "验证码已过期，请重新发送注册邮件" }, 400);

      if ((pending.verify_attempts || 0) >= 5) {
        return json({ error: "验证码错误次数过多，请重新发送注册邮件", locked: true }, 403);
      }

      if (pending.verify_token !== inputCode) {
        const attempts = (pending.verify_attempts || 0) + 1;
        await db
          .prepare("UPDATE pending_registrations SET verify_attempts = ? WHERE id = ?")
          .bind(attempts, pending.id)
          .run();
        if (attempts >= 5) {
          return json({ error: "验证码错误次数过多，请重新发送注册邮件", locked: true }, 403);
        }
        return json({ error: "验证码错误", attempts_left: 5 - attempts, verify_attempts: attempts }, 400);
      }

      const done = await completePendingRegistration(db, pending);
      if (!done.ok) return json({ error: done.error }, 409);
      if (done.already) {
        const user = await findUserByEmail(db, mail);
        return json({ success: true, user: publicUser(user) });
      }
      return json({ success: true, user: publicUser(done.user) });
    }

    if (request.method === "POST" && action === "check") {
      const { username } = await request.json();
      const name = username?.trim();
      if (!name) return json({ error: "昵称不能为空" }, 400);
      if (await usernameTaken(db, name)) {
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
      return json({ available: !(await emailTaken(db, mail)) });
    }

    if (request.method === "POST" && action === "register") {
      const { email, username, password } = await request.json();
      const mail = email?.trim();
      const name = username?.trim();
      const pass = password?.trim();
      if (!mail || !name || !pass) return json({ error: "邮箱、昵称和密码不能为空" }, 400);
      if (!isValidEmail(mail)) return json({ error: "邮箱格式不正确" }, 400);
      if (pass.length < 6) return json({ error: "密码至少 6 位" }, 400);

      const inUsers = await db.prepare("SELECT id FROM users WHERE email = ?").bind(mail).first();

      if (inUsers) {
        return json({ error: "该邮箱已被注册" }, 400);
      }
      if (await db.prepare("SELECT id FROM users WHERE username = ?").bind(name).first()) {
        return json({ error: "该昵称已被占用" }, 400);
      }

      const passHash = await hashPassword(pass);
      const verifyCode = randomVerifyCode(4);

      await db.prepare("DELETE FROM pending_registrations WHERE email = ?").bind(mail).run();
      await db
        .prepare(
          `INSERT INTO pending_registrations (email, username, password_hash, verify_token, verify_attempts, expires_at)
           VALUES (?, ?, ?, ?, 0, datetime('now', '+48 hours'))`
        )
        .bind(mail, name, passHash, verifyCode)
        .run();

      const today = new Date().toLocaleDateString("zh-CN");
      try {
        await sendMail(
          env,
          mail,
          "1024201 · 注册验证码 / Registration Code",
          welcomeEmailHtml(name, verifyCode, today)
        );
      } catch (err) {
        await db.prepare("DELETE FROM pending_registrations WHERE email = ?").bind(mail).run();
        throw err;
      }

      return json({
        success: true,
        verify_sent: true,
        sent_at: new Date().toISOString(),
        verify_attempts: 0,
        message: `注册邮件已发送至 ${mail}，请查收验证码并在页面输入完成注册。`,
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
        "1024201 · 临时密码 / Temporary Password",
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.8;color:#1c1c1e;">
<p style="margin:0 0 8px;">你的临时密码是：<strong>${temp}</strong></p>
<p style="margin:0 0 8px;">Your temporary password: <strong>${temp}</strong></p>
<p style="margin:0 0 8px;">请在 24 小时内使用临时密码登录，并按提示修改新密码。</p>
<p style="margin:0 0 16px;">Sign in within 24 hours using this password, then set a new one when prompted.</p>
<p style="margin:0;"><strong>1024201</strong></p>
</div>`
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
        { error: "数据库未升级：请在 D1 Console 执行 schema-migrate.sql，或重试请求以触发自动迁移" },
        503
      );
    }
    return json({ error: err.message }, 500);
  }
}
