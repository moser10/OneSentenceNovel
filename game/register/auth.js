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
  checkEmail: (email) =>
    api("/api/auth?action=check_email", { method: "POST", body: JSON.stringify({ email }) }),
  register: (email, username, password) =>
    api("/api/auth?action=register", { method: "POST", body: JSON.stringify({ email, username, password }) }),
  login: (email, password) =>
    api("/api/auth?action=login", { method: "POST", body: JSON.stringify({ email, password }) }),
  forgot: (email) =>
    api("/api/auth?action=forgot", { method: "POST", body: JSON.stringify({ email }) }),
};

const params = new URLSearchParams(location.search);
const returnTo = params.get("return") || "/game/";
const verifyStatus = params.get("verify");

// #region agent log
function clientLog(message, data, hypothesisId) {
  fetch("http://127.0.0.1:7725/ingest/bcf84f0a-61b7-4397-82c3-0d4511165217", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "484ab6" },
    body: JSON.stringify({ sessionId: "484ab6", location: "register/auth.js", message, data, hypothesisId, timestamp: Date.now(), runId: "register-debug" }),
  }).catch(() => {});
}
// #endregion

const app = document.getElementById("app");

function renderShell() {
  app.innerHTML = `
  <div class="card">
    <a href="/game/" class="back">← 返回游戏中心</a>
    <h1>注册游戏账户 · 一票通</h1>
    <p class="sub">一个账号，畅玩所有游戏</p>
    <div id="verifyBanner"></div>
    <div class="tabs">
      <div class="tab active" data-tab="register">注册</div>
      <div class="tab" data-tab="login">登录</div>
    </div>
    <div id="panelRegister" class="panel active">
      <label>邮箱</label>
      <input type="email" id="regEmail" maxlength="80" autocomplete="email">
      <p id="regEmailHint" class="hint"></p>
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
}

function showVerifyBanner() {
  const box = document.getElementById("verifyBanner");
  if (!box) return;
  if (verifyStatus === "ok") {
    box.innerHTML = `<p class="hint ok">邮箱验证成功，请登录。</p>`;
    switchTab("login");
  } else if (verifyStatus === "invalid") {
    box.innerHTML = `<p class="hint err">验证链接无效或已过期，请重新注册。</p>`;
  } else if (verifyStatus === "conflict") {
    box.innerHTML = `<p class="hint err">验证时昵称已被他人占用，请重新注册并换一个昵称。</p>`;
  }
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("panelRegister").classList.toggle("active", name === "register");
  document.getElementById("panelLogin").classList.toggle("active", name === "login");
}

let nameOk = false;
let emailOk = false;
let passOk = false;

function syncRegBtn() {
  document.getElementById("regBtn").disabled = !(nameOk && emailOk && passOk);
}

renderShell();
showVerifyBanner();

document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => switchTab(t.dataset.tab);
});

bindNameCheck({
  input: document.getElementById("regName"),
  btn: document.getElementById("regSuggest"),
  hint: document.getElementById("regHint"),
  checkFn: authApi.checkName,
  onStatus: (ok) => {
    nameOk = ok;
    syncRegBtn();
  },
});

const regEmail = document.getElementById("regEmail");
const regEmailHint = document.getElementById("regEmailHint");
let emailTimer = null;

regEmail.addEventListener("input", () => {
  emailOk = false;
  regEmailHint.textContent = "";
  regEmailHint.className = "hint";
  syncRegBtn();
  clearTimeout(emailTimer);
  emailTimer = setTimeout(checkEmailField, 400);
});

async function checkEmailField() {
  const mail = regEmail.value.trim();
  if (!mail) {
    emailOk = false;
    regEmailHint.textContent = "";
    syncRegBtn();
    return;
  }
  try {
    const data = await authApi.checkEmail(mail);
    if (data.available) {
      emailOk = true;
      regEmailHint.textContent = "✓ 邮箱可用";
      regEmailHint.className = "hint ok";
    } else {
      emailOk = false;
      regEmailHint.textContent = data.error || "该邮箱已被注册";
      regEmailHint.className = "hint err";
    }
  } catch (e) {
    emailOk = false;
    regEmailHint.textContent = e.message;
    regEmailHint.className = "hint err";
  }
  syncRegBtn();
}

function validateRegPass() {
  const p1 = document.getElementById("regPass").value;
  const p2 = document.getElementById("regPass2").value;
  const hint = document.getElementById("regPassHint");
  if (!p1 || !p2) {
    hint.textContent = "";
    passOk = false;
    syncRegBtn();
    return;
  }
  if (p1 !== p2) {
    hint.textContent = "两次密码不一致";
    hint.className = "hint err";
    passOk = false;
  } else if (p1.length < 6) {
    hint.textContent = "密码至少 6 位";
    hint.className = "hint err";
    passOk = false;
  } else {
    hint.textContent = "✓ 密码一致";
    hint.className = "hint ok";
    passOk = true;
  }
  syncRegBtn();
}

document.getElementById("regPass").oninput = validateRegPass;
document.getElementById("regPass2").oninput = validateRegPass;

function goNext(user) {
  setUser(user);
  window.location.href = returnTo.startsWith("/") ? returnTo : `/game/${returnTo}`;
}

document.getElementById("regBtn").onclick = async () => {
  if (!emailOk || !nameOk || !passOk) return;
  let health = {};
  try {
    health = await fetch("/api/health").then((r) => r.json());
    // #region agent log
    clientLog("health before register", { hasResendKey: health.hasResendKey, registerFlow: health.registerFlow, worker: health.worker }, "A");
    // #endregion
  } catch (_) {}
  try {
    const data = await authApi.register(
      regEmail.value.trim(),
      document.getElementById("regName").value.trim(),
      document.getElementById("regPass").value
    );
    // #region agent log
    clientLog("register success", { verify_sent: !!data.verify_sent }, "E");
    // #endregion
    document.getElementById("panelRegister").innerHTML = `
      <p class="hint ok">${data.message || "验证邮件已发送，请查收。"}</p>
      <p class="sub">验证完成后请切换到「登录」标签登录游戏。</p>
      <button type="button" class="btn-primary" id="gotoLoginBtn">去登录</button>`;
    document.getElementById("gotoLoginBtn").onclick = () => switchTab("login");
  } catch (e) {
    // #region agent log
    clientLog("register error", { error: e.message, healthHasResend: health.hasResendKey, healthFlow: health.registerFlow }, "B");
    // #endregion
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
