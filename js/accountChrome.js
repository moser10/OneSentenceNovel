import { mountLangTabs } from "./langTabs.js";
import { prefersStackedChrome } from "./device.js";
import { getUser } from "/game/js/store.js";
import { mountUserBar } from "/game/js/userBar.js";

const roMap = new WeakMap();

function applyLayout(container) {
  const w = container.getBoundingClientRect().width || container.offsetWidth || 0;
  const stack = prefersStackedChrome(w);
  container.classList.toggle("account-chrome--stack", stack);
  container.classList.toggle("account-chrome--inline", !stack);
  const tabs = container.querySelector(".lang-tabs");
  if (tabs) tabs.classList.toggle("lang-tabs--row", !stack);
}

function watchLayout(container) {
  if (roMap.has(container)) {
    roMap.get(container).disconnect();
  }
  const ro = new ResizeObserver(() => applyLayout(container));
  ro.observe(container);
  roMap.set(container, ro);
  applyLayout(container);
}

function buildLoginUrl(returnPath) {
  const ret = returnPath || location.pathname.replace(/^\//, "") + location.search;
  return `/game/register/?return=${encodeURIComponent(ret)}`;
}

const PERSON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

/**
 * Unified language tabs + user control.
 * Guest: EN/JA/ZH + user icon in one group. Signed: @username + lang tabs.
 */
export function mountAccountChrome(container, options = {}) {
  if (!container) return;
  const { variant = "game", returnPath, onLogout, onLangChange, active, layout } = options;
  const user = getUser();

  const signedIn = !!user;
  container.className = `account-chrome account-chrome--${variant} ${
    signedIn ? "account-chrome--signed" : "account-chrome--guest"
  }`;
  container.replaceChildren();

  if (!signedIn) {
    const group = document.createElement("div");
    group.className = "account-chrome-guest-group";
    const langSlot = document.createElement("div");
    langSlot.id = `accountChromeLang-${Math.random().toString(36).slice(2, 8)}`;
    const guestBtn = document.createElement("a");
    guestBtn.className = "account-chrome-guest-btn";
    guestBtn.href = buildLoginUrl(returnPath);
    guestBtn.title = "登录 / Sign in";
    guestBtn.setAttribute("aria-label", "Sign in");
    guestBtn.innerHTML = PERSON_SVG;
    group.append(langSlot, guestBtn);
    container.appendChild(group);

    const stackDefault = layout === "vertical" || (layout !== "horizontal" && prefersStackedChrome(9999));
    mountLangTabs(langSlot, {
      active,
      layout: stackDefault ? "vertical" : "horizontal",
      onChange: onLangChange,
    });
  } else {
    const row = document.createElement("div");
    row.className = "account-chrome-signed";
    const userWrap = document.createElement("div");
    userWrap.className = "account-chrome-user-wrap";
    const langWrap = document.createElement("div");
    langWrap.className = "account-chrome-lang-wrap";
    row.append(userWrap, langWrap);
    container.appendChild(row);

    mountUserBar(userWrap, { variant, returnPath, onLogout });
    mountLangTabs(langWrap, {
      active,
      layout: "horizontal",
      onChange: onLangChange,
    });
  }

  watchLayout(container);
}
