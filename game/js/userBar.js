import { getUser, clearUser, clearRoom } from "./store.js";

const PERSON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

const TEXT = {
  zh: { hint: "点击退出", logout: "退出登录" },
  en: { hint: "Tap to sign out", logout: "Sign out" },
  ja: { hint: "タップでログアウト", logout: "ログアウト" },
  bo: { hint: "བརྡབས་ནས་ཕྱིར་འཐེན།", logout: "ཕྱིར་འཐེན།" },
};

export function getBarLang() {
  return localStorage.getItem("portal_lang") || "zh";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLoginUrl(returnPath) {
  const ret = returnPath || location.pathname.replace(/^\//, "") + location.search;
  return `/game/register/?return=${encodeURIComponent(ret)}`;
}

export function mountUserBar(container, options = {}) {
  if (!container) return;
  const { returnPath, variant = "game", onLogout } = options;
  const lang = getBarLang();
  const t = TEXT[lang] || TEXT.zh;
  const user = getUser();

  container.className = `user-bar user-bar--${variant}`;
  container.replaceChildren();

  if (!user) {
    const link = document.createElement("a");
    link.className = "user-bar-guest";
    link.href = buildLoginUrl(returnPath);
    link.title = "登录";
    link.innerHTML = PERSON_SVG;
    container.appendChild(link);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "user-bar-signed";

  const nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.className = "user-bar-name";
  nameBtn.innerHTML = `<span class="user-bar-handle"><span class="user-bar-at">@</span><span class="user-bar-name-text">${escapeHtml(user.username)}</span></span>`;

  const hint = document.createElement("div");
  hint.className = "user-bar-hint";
  hint.textContent = t.hint;

  const menu = document.createElement("div");
  menu.className = "user-bar-menu";
  menu.hidden = true;
  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.textContent = t.logout;
  menu.appendChild(logoutBtn);

  wrap.append(nameBtn, hint);
  container.append(wrap, menu);

  nameBtn.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };

  hint.onclick = () => {
    menu.hidden = false;
  };

  logoutBtn.onclick = () => {
    clearRoom();
    clearUser();
    menu.hidden = true;
    if (onLogout) onLogout();
    else location.reload();
  };

  const onDoc = (e) => {
    if (!container.contains(e.target)) menu.hidden = true;
  };
  document.addEventListener("click", onDoc);
}
