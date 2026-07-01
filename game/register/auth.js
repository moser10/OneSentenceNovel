import { setUser } from "../js/store.js";
import { bindNameCheck } from "../onesentence/js/nameCheck.js";
import { mountAccountChrome } from "/js/accountChrome.js";

const API = "";
const CODE_WINDOW_MS = 60_000;
const MAX_VERIFY_ATTEMPTS = 5;
const GAME_CENTER = "/game/";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options.headers?.["Content-Type"] === undefined && options.body
    ? { ...options, headers: { "Content-Type": "application/json", ...options.headers } }
    : options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
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
  verifyCode: (email, code) =>
    api("/api/auth?action=verify_code", { method: "POST", body: JSON.stringify({ email, code }) }),
  login: (email, password) =>
    api("/api/auth?action=login", { method: "POST", body: JSON.stringify({ email, password }) }),
  forgot: (email) =>
    api("/api/auth?action=forgot", { method: "POST", body: JSON.stringify({ email }) }),
};

const params = new URLSearchParams(location.search);
const returnTo = params.get("return") || GAME_CENTER;

const app = document.getElementById("app");

let nameOk = false;
let emailOk = false;
let passOk = false;
let regLocked = false;
let mailSentAt = null;
let verifyAttempts = 0;
let awaitingCode = false;

function renderShell() {
  app.innerHTML = `
  <div class="auth-page">
    <div class="auth-top">
      <a href="/game/" class="btn-secondary btn-small">返回游戏中心</a>
      <div id="accountChrome"></div>
    </div>
  <div class="card">
    <h1>注册账户</h1>
    <p class="sub">一票通</p>
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
      <p id="regSpamHint" class="hint spam-hint" hidden>若未收到邮件，请检查垃圾邮件或促销邮件文件夹，并将 admin@1024201.com 加入联系人后重试。</p>
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
  </div>
  </div>
  <div id="verifyModal" class="verify-modal" hidden>
    <div class="verify-modal-card" role="dialog" aria-modal="true">
      <h2>输入注册码</h2>
      <p class="sub" id="verifyModalSub">验证码已发送至您的邮箱</p>
      <input type="text" id="verifyCodeInput" maxlength="4" autocomplete="one-time-code" inputmode="text" placeholder="4位注册码">
      <p id="verifyCodeErr" class="hint err verify-err" hidden></p>
      <button type="button" id="verifySubmitBtn" class="btn-primary">确认</button>
      <button type="button" id="verifyCancelBtn" class="btn-link">取消</button>
    </div>
  </div>`;
  mountAccountChrome(document.getElementById("accountChrome"), {
    variant: "game",
    returnPath: returnTo.replace(/^\//, ""),
  });
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("panelRegister").classList.toggle("active", name === "register");
  document.getElementById("panelLogin").classList.toggle("active", name === "login");
}

function canReopenCodePopup() {
  if (!mailSentAt || regLocked) return false;
  if (verifyAttempts >= MAX_VERIFY_ATTEMPTS) return false;
  return Date.now() - mailSentAt < CODE_WINDOW_MS;
}

function syncRegBtn() {
  const btn = document.getElementById("regBtn");
  const ready = nameOk && emailOk && passOk;
  if (regLocked) {
    btn.textContent = "再次发送注册邮件";
    btn.disabled = !ready;
    return;
  }
  if (awaitingCode && canReopenCodePopup()) {
    btn.textContent = "请输入注册码";
    btn.disabled = false;
    return;
  }
  if (awaitingCode && !canReopenCodePopup()) {
    awaitingCode = false;
  }
  btn.textContent = ready ? "发送注册邮件" : "注册";
  btn.disabled = !ready;
}

function showVerifyModal(email) {
  const modal = document.getElementById("verifyModal");
  document.getElementById("verifyModalSub").textContent = `注册码已发送至 ${email}`;
  document.getElementById("verifyCodeInput").value = "";
  hideVerifyError();
  modal.hidden = false;
  document.getElementById("verifyCodeInput").focus();
}

function hideVerifyModal() {
  document.getElementById("verifyModal").hidden = true;
}

function onVerifyCancel() {
  hideVerifyModal();
  if (canReopenCodePopup()) {
    awaitingCode = true;
  } else {
    awaitingCode = false;
  }
  syncRegBtn();
}

function showVerifyError(msg) {
  const el = document.getElementById("verifyCodeErr");
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove("fade-out");
  void el.offsetWidth;
  setTimeout(() => el.classList.add("fade-out"), 2200);
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove("fade-out");
  }, 2800);
}

function hideVerifyError() {
  const el = document.getElementById("verifyCodeErr");
  el.hidden = true;
  el.textContent = "";
}

function goAfterRegister(user) {
  setUser(user);
  window.location.href = GAME_CENTER;
}

function goAfterLogin(user) {
  setUser(user);
  const dest = returnTo.startsWith("/") ? returnTo : `/game/${returnTo}`;
  window.location.href = dest === "/game/register/" || dest.includes("/register") ? GAME_CENTER : dest;
}

async function handleRegBtnClick() {
  if (awaitingCode && canReopenCodePopup()) {
    showVerifyModal(document.getElementById("regEmail").value.trim());
    return;
  }
  await sendRegisterMail();
}

async function sendRegisterMail() {
  if (!emailOk || !nameOk || !passOk) return;
  const email = document.getElementById("regEmail").value.trim();
  const name = document.getElementById("regName").value.trim();
  const pass = document.getElementById("regPass").value;
  try {
    const data = await authApi.register(email, name, pass);
    regLocked = false;
    verifyAttempts = data.verify_attempts || 0;
    mailSentAt = data.sent_at ? Date.parse(data.sent_at) : Date.now();
    awaitingCode = true;
    document.getElementById("regSpamHint").hidden = true;
    syncRegBtn();
    showVerifyModal(email);
  } catch (e) {
    alert(e.message);
  }
}

async function submitVerifyCode() {
  const email = document.getElementById("regEmail").value.trim();
  const code = document.getElementById("verifyCodeInput").value.trim();
  if (!code) {
    showVerifyError("请输入注册码");
    return;
  }
  try {
    const data = await authApi.verifyCode(email, code);
    awaitingCode = false;
    mailSentAt = null;
    hideVerifyModal();
    goAfterRegister(data.user);
  } catch (e) {
    if (typeof e.data?.verify_attempts === "number") {
      verifyAttempts = e.data.verify_attempts;
    } else if (typeof e.data?.attempts_left === "number") {
      verifyAttempts = MAX_VERIFY_ATTEMPTS - e.data.attempts_left;
    }
    if (e.data?.locked) {
      hideVerifyModal();
      regLocked = true;
      awaitingCode = false;
      mailSentAt = null;
      document.getElementById("regSpamHint").hidden = false;
      syncRegBtn();
      alert("注册码错误次数过多，请重新发送注册邮件");
      return;
    }
    syncRegBtn();
    showVerifyError(e.message || "注册码错误");
  }
}

renderShell();
syncRegBtn();

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

document.getElementById("regBtn").onclick = handleRegBtnClick;
document.getElementById("verifySubmitBtn").onclick = submitVerifyCode;
document.getElementById("verifyCancelBtn").onclick = onVerifyCancel;
document.getElementById("verifyCodeInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitVerifyCode();
});
document.getElementById("verifyModal").addEventListener("click", (e) => {
  if (e.target.id === "verifyModal") e.preventDefault();
});

setInterval(syncRegBtn, 5000);

document.getElementById("loginBtn").onclick = async () => {
  try {
    const data = await authApi.login(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPass").value
    );
    goAfterLogin(data.user);
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
