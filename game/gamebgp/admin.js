const TOKEN_KEY = "gamebgp_token";

async function api(action, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`/api/admin?action=${action}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

const app = document.getElementById("app");

function renderLogin() {
  app.innerHTML = `
    <div class="wrap">
      <div class="card" style="max-width:360px;margin:40px auto;">
        <h1>gamebgp</h1>
        <p class="sub">管理后台 · 请在 D1 配置 admin_auth</p>
        <input id="user" placeholder="用户名" value="sa">
        <input id="pass" type="password" placeholder="密码">
        <button id="loginBtn" style="width:100%">登录</button>
      </div>
    </div>`;
  document.getElementById("loginBtn").onclick = async () => {
    try {
      const data = await api("login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("user").value.trim(),
          password: document.getElementById("pass").value,
        }),
      });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      renderDashboard();
    } catch (e) {
      alert(e.message);
    }
  };
}

async function renderDashboard() {
  app.innerHTML = `<div class="wrap"><p>加载中...</p></div>`;
  try {
    const [users, rooms] = await Promise.all([api("users"), api("rooms")]);
    app.innerHTML = `
      <div class="wrap">
        <h1>gamebgp 数据管理</h1>
        <p class="sub">临时密码请在 D1 → admin_auth 表更新 temp_password 列，使用后 24 小时内有效</p>
        <div class="card">
          <h2>一票通用户</h2>
          <table>
            <thead><tr><th>#</th><th>用户名</th><th>邮箱</th><th>注册时间</th><th>密码</th><th></th></tr></thead>
            <tbody>
              ${users.users
                .map(
                  (u, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${u.username}</td>
                  <td>${u.email}</td>
                  <td>${u.created_at || "-"}</td>
                  <td><span class="pw-mask" data-pw="${u.password_plain || ""}">******</span><span class="eye">👁</span></td>
                  <td><button class="btn-danger btn-small del-user" data-id="${u.id}">删除</button></td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h2>游戏房间 / 书名</h2>
          <table>
            <thead><tr><th>#</th><th>显示名</th><th>全称</th><th>房主</th><th>邀请码</th><th>创建时间</th><th></th></tr></thead>
            <tbody>
              ${rooms.rooms
                .map(
                  (r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${r.display_name}</td>
                  <td>${r.full_name}</td>
                  <td>${r.owner_name}</td>
                  <td>${r.invite_code}</td>
                  <td>${r.created_at || "-"}</td>
                  <td><button class="btn-danger btn-small del-room" data-id="${r.id}">删除</button></td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;

    document.querySelectorAll(".eye").forEach((eye) => {
      eye.onclick = () => {
        const mask = eye.previousElementSibling;
        const pw = mask.dataset.pw;
        mask.textContent = mask.textContent === "******" ? pw || "（未记录）" : "******";
      };
    });

    document.querySelectorAll(".del-user").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("确定删除该用户？")) return;
        await api("delete_user", { method: "POST", body: JSON.stringify({ user_id: Number(btn.dataset.id) }) });
        renderDashboard();
      };
    });

    document.querySelectorAll(".del-room").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("确定删除该房间及写书内容？")) return;
        await api("delete_room", { method: "POST", body: JSON.stringify({ story_id: Number(btn.dataset.id) }) });
        renderDashboard();
      };
    });
  } catch (e) {
    sessionStorage.removeItem(TOKEN_KEY);
    alert(e.message);
    renderLogin();
  }
}

if (sessionStorage.getItem(TOKEN_KEY)) renderDashboard();
else renderLogin();
