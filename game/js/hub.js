import { getUser } from "../js/store.js";

const GAMES = [
  {
    id: "osn",
    code: "OSN",
    title: "一人一句，一句成书",
    fullName: "One Sentence Novel",
    href: "onesentence/",
    gradient: "linear-gradient(135deg, #ff5e62 0%, #ff9966 100%)",
  },
];

const app = document.getElementById("app");

app.innerHTML = `
  <div class="hub">
    <a href="/" class="back">← 返回门户</a>
    <h1>游戏中心</h1>
    <p class="sub">一票通账号 · 选一个游戏开始</p>
    <div class="grid" id="gameGrid"></div>
  </div>`;

const grid = document.getElementById("gameGrid");
grid.innerHTML = GAMES.map(
  (g) => `
  <a class="game-card" href="${g.href}" data-href="${g.href}" data-id="${g.id}">
    <div class="game-icon" style="background:${g.gradient}">
      <span class="game-code">${g.code}</span>
    </div>
    <div class="game-label">${g.title}</div>
    <div class="game-full">${g.fullName}</div>
  </a>`
).join("");

grid.querySelectorAll(".game-card").forEach((card) => {
  card.addEventListener("click", (e) => {
    e.preventDefault();
    const href = card.dataset.href;
    if (!getUser()) {
      window.location.href = `/game/register/?return=${encodeURIComponent(href)}`;
      return;
    }
    window.location.href = href;
  });
});
