// functions/api/auth.js

// 辅助函数：生成不重复的随机推荐用户名
async function generateUniqueRecommend(db, baseName) {
  let isUnique = false;
  let finalName = "";
  while (!isUnique) {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4位随机数
    finalName = `${baseName}_${randomNum}`;
    const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(finalName).first();
    if (!existing) isUnique = true;
  }
  return finalName;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 1. 实时查重与智能随机数接口 (POST /api/auth?action=check)
  if (request.method === "POST" && url.searchParams.get("action") === "check") {
    const { username } = await request.json();
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username.trim()).first();
    
    if (existing) {
      const recommendation = await generateUniqueRecommend(env.DB, username.trim());
      return new Response(JSON.stringify({ available: false, recommend: recommendation }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ available: true }), { headers: corsHeaders });
  }

  // 2. 核心注册与自动发信接口 (POST /api/auth?action=register)
  if (request.method === "POST" && url.searchParams.get("action") === "register") {
    const { email, username } = await request.json();
    
    try {
      // 最终防线查重
      const checkEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (checkEmail) return new Response(JSON.stringify({ error: "该邮箱已被注册" }), { status: 400, headers: corsHeaders });
      
      // 插入用户
      await env.DB.prepare("INSERT INTO users (email, username) VALUES (?, ?)")
        .bind(email.trim(), username.trim())
        .run();

      // 📧 触发发信引擎
      const today = new Date().toLocaleDateString('zh-CN');
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`, // 在CF Pages后台环境变量中配置
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "game@1024201.com",
          to: email,
          subject: "欢迎来到 1024201 游戏中心",
          html: `<p>欢迎 <strong>${username}</strong> 来到1024201的游戏中心，请开心。</p><br><p>落款 1024201<br>${today}</p>`
        })
      });

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
}
