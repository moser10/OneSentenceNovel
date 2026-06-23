import { setUser } from "../js/store.js";
import { bindNameCheck } from "../onesentence/js/nameCheck.js";

const API = "";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options.headers?.["Content-Type"] === undefined && options.body
    ? { ...options, headers: { "Content-Type": "application/json", ...options.headers } }
    : options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

const authApi = {
  checkName: (username) =>
    api("/api/auth?action=check", { method: "POST", body: JSON.stringify({ username }) }),
  register: (email, username, password) =>
    api("/api/auth?action=register", { method: "POST", body: JSON.stringify({ email, username, password }) }),
  login: (email, password) =>
    api("/api/auth?action=login", { method: "POST", body: JSON.stringify({ email, password }) }),
  forgot: (email) =>
    api("/api/auth?action=forgot", { method: "POST", body: JSON.stringify({ email }) }),
};

const params = new URLSearchParams(location.search);
const returnTo = params.get("return") || "/game/";

const app = document.getElementById("app");
app.innerHTML = `
  <div class="card">
    <a href="/game/" class="back">← 返回游戏中心</a>
    <h1>注册游戏账户 · 一票通</h1>
    <p class="sub">一个账号，畅玩所有游戏</p>
    <div class="tabs">
      <div class="tab active" data-tab="register">注册</div>
      <div class="tab" data-tab="login">登录</div>
    </div>
    <div id="panelRegister" class="panel active">
      <label>邮箱</label>
      <input type="email" id="regEmail" maxlength="80">
      <label>昵称（唯一）</label>
      <div class="row">
        <input type="text" id="regName" maxlength="20">
        <button type="button" id="regSuggest" class="btn-secondary" disabled>推荐</button>
      </div>
      <p id="regHint" class="hint"></p>
      <label>密码</label>
      <input type="password" id="regPass" minlength="6">
      <label>确认密码</label>
      <input type="password" id="regPass2" minlength="6">
      <p id="regPassHint" class="hint"></p>
      <button id="regBtn" class="btn-primary" disabled>注册</button>
    </div>
    <div id="panelLogin" class="panel">
      <label>邮箱</label>
      <input type="email" id="loginEmail">
      <label>密码</label>
      <input type="password" id="loginPass">
      <button id="loginBtn" class="btn-primary">登录</button>
      <button id="forgotBtn" class="btn-link">忘记密码？获取临时密码</button>
    </div>
  </div>`;

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("panelRegister").classList.toggle("active", name === "register");
  document.getElementById("panelLogin").classList.toggle("active", name === "login");
}

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => switchTab(t.dataset.tab);
});

bindNameCheck({
  input: document.getElementById("regName"),
  btn: document.getElementById("regSuggest"),
  hint: document.getElementById("regHint"),
  checkFn: authApi.checkName,
});

function validateRegPass() {
  const p1 = document.getElementById("regPass").value;
  const p2 = document.getElementById("regPass2").value;
  const hint = document.getElementById("regPassHint");
  const btn = document.getElementById("regBtn");
  if (!p1 || !p2) {
    hint.textContent = "";
    btn.disabled = true;
    return;
  }
  if (p1 !== p2) {
    hint.textContent = "两次密码不一致";
    hint.className = "hint err";
    btn.disabled = true;
  } else if (p1.length < 6) {
    hint.textContent = "密码至少 6 位";
    hint.className = "hint err";
    btn.disabled = true;
  } else {
    hint.textContent = "✓ 密码一致";
    hint.className = "hint ok";
    btn.disabled = false;
  }
}

document.getElementById("regPass").oninput = validateRegPass;
document.getElementById("regPass2").oninput = validateRegPass;

function goNext(user) {
  setUser(user);
  window.location.href = returnTo.startsWith("/") ? returnTo : `/game/${returnTo}`;
}

document.getElementById("regBtn").onclick = async () => {
  try {
    const data = await authApi.register(
      document.getElementById("regEmail").value.trim(),
      document.getElementById("regName").value.trim(),
      document.getElementById("regPass").value
    );
    goNext(data.user);
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById("loginBtn").onclick = async () => {
  try {
    const data = await authApi.login(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPass").value
    );
    goNext(data.user);
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById("forgotBtn").onclick = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  if (!email) return alert("请先填写注册邮箱");
  try {
    const data = await authApi.forgot(email);
    alert(data.message);
  } catch (e) {
    alert(e.message);
  }
};
