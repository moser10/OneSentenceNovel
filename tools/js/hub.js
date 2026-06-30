import { getPortalLang, mountLangTabs } from "/js/langTabs.js";

const MUSIC_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>`;

const LYRICS_ICON = `
  <div class="tool-icon-lyrics-text">
    <span>歌詞</span>
    <span class="en">Lyrics</span>
  </div>`;

const TOOLS = [
  {
    id: "syncnote",
    title: { zh: "文本中转站", en: "Text Relay", ja: "テキスト中継" },
    sub: { zh: "跨设备复制粘贴", en: "Cross-device paste", ja: "端末間コピー" },
    href: "syncnote/",
    gradient: "linear-gradient(135deg, #30d158 0%, #34c759 100%)",
    icon: `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" aria-hidden="true"><path fill="#fff" d="M4 7.5h10v1.6H4V7.5zm0 4.2h7.5v1.6H4v-1.6zm0 4.2h9v1.6H4v-1.6z"/><path stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M15.8 8.2c1.9.4 3.2 2 3.2 3.9s-1.3 3.5-3.2 3.9"/><path stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M18.8 7.2l1.4 1.8-2.2.6"/><path stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M18.8 16.8l1.4-1.8-2.2-.6"/></svg>`,
  },
  {
    id: "music",
    title: { zh: "音乐", en: "Music", ja: "音楽" },
    sub: { zh: "Deezer 试听", en: "Deezer previews", ja: "Deezerプレビュー" },
    href: "music/",
    gradient: "linear-gradient(135deg, #bf5af2 0%, #5856d6 100%)",
    icon: `<div class="tool-icon-inner">${MUSIC_SVG}</div>`,
  },
  {
    id: "pdf",
    title: { zh: "PDF 转换", en: "PDF Convert", ja: "PDF変換" },
    sub: { zh: "Word/TXT/MD", en: "Word/TXT/MD", ja: "Word/TXT/MD" },
    href: "pdf/",
    gradient: "linear-gradient(135deg, #ff9f0a 0%, #ff375f 100%)",
    icon: `<span class="game-code">PDF</span>`,
  },
  {
    id: "lyrics",
    title: { zh: "找歌词", en: "Find Lyrics", ja: "歌詞検索" },
    sub: { zh: "LRCLIB", en: "LRCLIB", ja: "LRCLIB" },
    href: "lyrics/",
    gradient: "linear-gradient(135deg, #5ac8fa 0%, #007aff 100%)",
    icon: LYRICS_ICON,
  },
];

const HUB_I18N = {
  zh: { title: "工具箱", sub: "实用小工具 · 选一个开始", back: "返回门户" },
  en: { title: "Toolbox", sub: "Handy tools · pick one", back: "Back to portal" },
  ja: { title: "ツールボックス", sub: "便利ツール · 選んで開始", back: "ポータルへ" },
};

const app = document.getElementById("app");
let lang = getPortalLang();
let t = HUB_I18N[lang] || HUB_I18N.en;

function render() {
  t = HUB_I18N[lang] || HUB_I18N.en;
  app.innerHTML = `
    <div class="hub">
      <div class="hub-top">
        <a href="/" class="feature-back">${t.back}</a>
        <div class="hub-top-right">
          <div id="hubLangSlot"></div>
        </div>
      </div>
      <h1>${t.title}</h1>
      <p class="sub">${t.sub}</p>
      <div class="grid" id="toolGrid"></div>
    </div>`;

  mountLangTabs(document.getElementById("hubLangSlot"), {
    active: lang,
    layout: "horizontal",
    onChange: (next) => {
      lang = next;
      render();
    },
  });

  const grid = document.getElementById("toolGrid");
  grid.innerHTML = TOOLS.map((tool) => {
    const label = tool.title[lang] || tool.title.en;
    const sub = tool.sub[lang] || tool.sub.en;
    return `
      <a class="game-card" href="${tool.href}">
        <div class="game-icon" style="background:${tool.gradient}">
          ${tool.icon}
        </div>
        <div class="game-label">${label}</div>
        <div class="game-full">${sub}</div>
      </a>`;
  }).join("");
}

render();
