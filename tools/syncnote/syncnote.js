import { getPortalLang, mountLangTabs } from "/js/langTabs.js";
import { getUser } from "/game/js/store.js";
import { currentUserId, loginHref } from "../js/quotaClient.js";

const MAX_LINES = 3;
const FLASH_MS = 2200;

const UI = {
  en: {
    title: "Text Relay",
    sub: "Three relay fields across devices. Saved until you delete each one.",
    back: "Toolbox",
    loginDesc: "Sign in to use Text Relay.",
    loginBtn: "Sign in / Register",
    slot: (n) => `Relay ${n}`,
    copy: "Copy",
    paste: "Paste",
    clear: "Delete",
    saved: "Saved",
    saving: "Saving…",
    loaded: "Loaded",
    cleared: "Cleared",
    copied: "Copied to clipboard",
    pasted: "Pasted from clipboard",
    user: (n) => `@${n}`,
    errLoad: "Failed to load",
    errSave: "Failed to save",
    errClip: "Clipboard unavailable",
  },
  zh: {
    title: "文本中转站",
    sub: "三个中转框，跨设备同步；不点删除则一直保留各框内容。",
    back: "返回工具箱",
    loginDesc: "请登录后使用文本中转站。",
    loginBtn: "登录 / 注册",
    slot: (n) => `中转 ${n}`,
    copy: "复制",
    paste: "粘贴",
    clear: "删除",
    saved: "已保存",
    saving: "保存中…",
    loaded: "已加载",
    cleared: "已清空",
    copied: "已复制到剪贴板",
    pasted: "已从剪贴板粘贴",
    user: (n) => `@${n}`,
    errLoad: "加载失败",
    errSave: "保存失败",
    errClip: "无法访问剪贴板",
  },
  ja: {
    title: "テキスト中継",
    sub: "3つの中継欄で端末間同期。削除するまで各欄を保持。",
    back: "ツールボックス",
    loginDesc: "テキスト中継を使うにはログインしてください。",
    loginBtn: "ログイン / 登録",
    slot: (n) => `中継 ${n}`,
    copy: "コピー",
    paste: "貼り付け",
    clear: "削除",
    saved: "保存済み",
    saving: "保存中…",
    loaded: "読み込み済み",
    cleared: "削除しました",
    copied: "クリップボードにコピー",
    pasted: "クリップボードから貼り付け",
    user: (n) => `@${n}`,
    errLoad: "読み込みに失敗",
    errSave: "保存に失敗",
    errClip: "クリップボードを使用できません",
  },
};

let lang = getPortalLang();
let t = UI[lang] || UI.en;
const saveTimers = new Map();
const dirtySlots = new Set();
const baselineStatus = new Map();
const flashTimers = new Map();
const flashing = new Set();

const errBox = document.getElementById("errBox");
const loginPanel = document.getElementById("loginPanel");
const editorWrap = document.getElementById("editorWrap");
const slotEls = [...document.querySelectorAll(".sync-slot")];

function slotNum(el) {
  return parseInt(el.dataset.slot, 10);
}

function slotInput(el) {
  return el.querySelector(".sync-input");
}

function slotStatusEl(el) {
  return el.querySelector(".sync-status");
}

function lineMetrics(ta) {
  const style = getComputedStyle(ta);
  const lh = parseFloat(style.lineHeight) || 21;
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  return { lh, padY };
}

function fitInput(ta, { tail = false } = {}) {
  const { lh, padY } = lineMetrics(ta);
  ta.style.height = "0";
  const contentLines = Math.max(1, Math.ceil((ta.scrollHeight - padY) / lh));
  const visibleLines = Math.min(MAX_LINES, contentLines);
  ta.style.height = `${visibleLines * lh + padY}px`;
  if (tail || (contentLines > MAX_LINES && document.activeElement !== ta)) {
    ta.scrollTop = ta.scrollHeight;
  }
}

function fitAllInputs(opts) {
  slotEls.forEach((el) => fitInput(slotInput(el), opts));
}

function applyI18n() {
  document.getElementById("pageTitle").textContent = t.title;
  document.getElementById("pageSub").textContent = t.sub;
  document.getElementById("backLink").textContent = t.back;
  document.getElementById("loginDesc").textContent = t.loginDesc;
  document.getElementById("loginBtn").textContent = t.loginBtn;
  document.getElementById("loginBtn").href = loginHref("/tools/syncnote/");
  slotEls.forEach((el) => {
    const n = slotNum(el) + 1;
    el.querySelector("[data-slot-label]").textContent = t.slot(n);
    el.querySelector(".sync-copy").textContent = t.copy;
    el.querySelector(".sync-paste").textContent = t.paste;
    el.querySelector(".sync-clear").textContent = t.clear;
  });
}

function renderBaseline(slot) {
  if (flashing.has(slot)) return;
  const el = slotEls.find((s) => slotNum(s) === slot);
  if (!el) return;
  slotStatusEl(el).textContent = baselineStatus.get(slot) || "";
}

function setBaseline(el, msg) {
  const slot = slotNum(el);
  baselineStatus.set(slot, msg);
  renderBaseline(slot);
}

function flashStatus(el, msg) {
  const slot = slotNum(el);
  clearTimeout(flashTimers.get(slot));
  flashing.add(slot);
  slotStatusEl(el).textContent = msg;
  flashTimers.set(
    slot,
    setTimeout(() => {
      flashing.delete(slot);
      renderBaseline(slot);
    }, FLASH_MS)
  );
}

function showError(msg) {
  errBox.textContent = msg;
  errBox.hidden = !msg;
}

function apiBody(extra = {}) {
  return JSON.stringify({ user_id: currentUserId(), ...extra });
}

function loadedLabel(updatedAt) {
  return updatedAt ? `${t.loaded} · ${updatedAt}` : t.loaded;
}

function savedLabel(updatedAt) {
  return updatedAt ? `${t.saved} · ${updatedAt}` : t.saved;
}

async function loadNotes() {
  const uid = currentUserId();
  if (!uid) return;
  showError("");
  try {
    const res = await fetch(`/api/portal?action=syncnote_get&user_id=${encodeURIComponent(uid)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t.errLoad);
    const bySlot = new Map((data.slots || []).map((s) => [s.slot, s]));
    slotEls.forEach((el) => {
      const slot = slotNum(el);
      const row = bySlot.get(slot) || { content: "", updatedAt: null };
      const ta = slotInput(el);
      ta.value = row.content || "";
      dirtySlots.delete(slot);
      setBaseline(el, loadedLabel(row.updatedAt));
      fitInput(ta, { tail: true });
    });
    const userLine = document.getElementById("userLine");
    userLine.hidden = false;
    userLine.textContent = t.user(data.username || getUser()?.username || "");
  } catch (e) {
    showError(e.message || t.errLoad);
  }
}

async function saveSlot(el, { quiet = false } = {}) {
  const uid = currentUserId();
  if (!uid) return;
  const slot = slotNum(el);
  if (!quiet && !flashing.has(slot)) setBaseline(el, t.saving);
  try {
    const res = await fetch("/api/portal?action=syncnote_save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: apiBody({ slot, content: slotInput(el).value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t.errSave);
    dirtySlots.delete(slot);
    if (!flashing.has(slot)) setBaseline(el, savedLabel(data.updatedAt));
  } catch (e) {
    showError(e.message || t.errSave);
    if (!flashing.has(slot)) renderBaseline(slot);
  }
}

function scheduleSave(el) {
  const slot = slotNum(el);
  dirtySlots.add(slot);
  clearTimeout(saveTimers.get(slot));
  saveTimers.set(slot, setTimeout(() => saveSlot(el, { quiet: flashing.has(slot) }), 600));
}

async function clearSlot(el) {
  const uid = currentUserId();
  if (!uid) return;
  const slot = slotNum(el);
  showError("");
  try {
    const res = await fetch("/api/portal?action=syncnote_clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: apiBody({ slot }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t.errSave);
    const ta = slotInput(el);
    ta.value = "";
    dirtySlots.delete(slot);
    fitInput(ta);
    flashStatus(el, t.cleared);
    setBaseline(el, "");
  } catch (e) {
    showError(e.message || t.errSave);
  }
}

async function copySlot(el, e) {
  e.preventDefault();
  e.stopPropagation();
  showError("");
  try {
    await navigator.clipboard.writeText(slotInput(el).value);
    flashStatus(el, t.copied);
  } catch {
    showError(t.errClip);
  }
}

async function pasteSlot(el, e) {
  e.preventDefault();
  e.stopPropagation();
  showError("");
  try {
    const text = await navigator.clipboard.readText();
    const ta = slotInput(el);
    ta.value = text;
    fitInput(ta, { tail: true });
    flashStatus(el, t.pasted);
    scheduleSave(el);
  } catch {
    showError(t.errClip);
  }
}

function boot() {
  applyI18n();
  const user = getUser();
  if (!user?.id) {
    loginPanel.hidden = false;
    editorWrap.hidden = true;
    return;
  }
  loginPanel.hidden = true;
  editorWrap.hidden = false;
  loadNotes();
}

mountLangTabs(document.getElementById("langSlot"), {
  layout: "horizontal",
  onChange: (next) => {
    lang = next;
    t = UI[lang] || UI.en;
    applyI18n();
    baselineStatus.forEach((msg, slot) => {
      if (!flashing.has(slot)) {
        const el = slotEls.find((s) => slotNum(s) === slot);
        if (el) slotStatusEl(el).textContent = msg;
      }
    });
  },
});

slotEls.forEach((el) => {
  const ta = slotInput(el);
  ta.addEventListener("input", () => {
    fitInput(ta);
    scheduleSave(el);
  });
  ta.addEventListener("focus", () => fitInput(ta));
  ta.addEventListener("blur", () => fitInput(ta, { tail: true }));
  el.querySelector(".sync-copy").addEventListener("click", (e) => copySlot(el, e));
  el.querySelector(".sync-paste").addEventListener("click", (e) => pasteSlot(el, e));
  el.querySelector(".sync-clear").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearSlot(el);
  });
});

window.addEventListener("beforeunload", () => {
  if (!dirtySlots.size) return;
  const uid = currentUserId();
  if (!uid || !navigator.sendBeacon) return;
  dirtySlots.forEach((slot) => {
    const el = slotEls.find((s) => slotNum(s) === slot);
    if (!el) return;
    navigator.sendBeacon(
      "/api/portal?action=syncnote_save",
      new Blob([apiBody({ slot, content: slotInput(el).value })], { type: "application/json" })
    );
  });
});

boot();
