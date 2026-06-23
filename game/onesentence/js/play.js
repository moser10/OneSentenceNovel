import { roomApi } from "./api.js";
import { bindNameCheck } from "./nameCheck.js";
import { getUser, getRoom } from "../../js/store.js";

let pollTimer = null;
let heartbeatTimer = null;
let bookTitle = "";
let chapters = [];

export function renderPlay(app, onLeave) {
  const user = getUser();
  const room = getRoom();
  if (!room?.id) return onLeave();

  app.innerHTML = `
    <div class="card">
      <div class="header-row">
        <div>
          <p class="game-brand">One Sentence Novel</p>
          <h1 id="roomTitle">${room.title}</h1>
          <p class="sub" id="roomMeta"></p>
        </div>
        <button id="leaveBtn" class="btn-secondary btn-small">离开房间</button>
      </div>

      <section id="ownerRename" class="section" hidden>
        <h3>修改书名（仅房主）</h3>
        <div class="row">
          <input type="text" id="renameInput" maxlength="30">
          <button type="button" id="renameSuggest" class="btn-secondary disabled" disabled>推荐</button>
        </div>
        <p id="renameHint" class="hint"></p>
        <button id="renameBtn" class="btn-secondary btn-small">保存书名</button>
      </section>

      <section class="section book-section">
        <div class="section-head">
          <h2>📖 共享写书</h2>
          <div class="row" style="margin:0;">
            <button id="chapterBtn" class="btn-secondary btn-small">自动分章</button>
            <button id="pdfBtn" class="btn-secondary btn-small">下载 PDF</button>
          </div>
        </div>
        <div id="tocBox" class="toc-box" hidden></div>
        <div id="bookWindow" class="book-window">等待第一句...</div>
      </section>

      <section class="section">
        <h2>💬 聊天</h2>
        <p class="sub">聊天仅在线可见，全员离线后自动清除</p>
        <div id="chatWindow" class="chat-window"></div>
      </section>

      <section class="section compose">
        <textarea id="composeInput" placeholder="输入内容（共享写书限50字）" maxlength="200"></textarea>
        <div class="row">
          <button id="chatBtn" class="btn-secondary">聊天</button>
          <button id="bookBtn" class="btn-primary">共享写书</button>
        </div>
      </section>
    </div>`;

  if (room.role === "owner") {
    document.getElementById("ownerRename").hidden = false;
    bindNameCheck({
      input: document.getElementById("renameInput"),
      btn: document.getElementById("renameSuggest"),
      hint: document.getElementById("renameHint"),
      checkFn: roomApi.checkTitle,
    });
    document.getElementById("renameBtn").onclick = async () => {
      const title = document.getElementById("renameInput").value.trim();
      if (!title) return;
      try {
        await roomApi.updateTitle(room.id, user.id, title);
        room.title = title;
        bookTitle = title;
        document.getElementById("roomTitle").textContent = title;
        await refresh();
        alert("书名已更新");
      } catch (e) {
        alert(e.message);
      }
    };
  }

  async function doLeave() {
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    try {
      await roomApi.leaveRoom(room.id, user.id);
    } catch (_) {}
    onLeave();
  }

  document.getElementById("leaveBtn").onclick = doLeave;
  window.addEventListener("beforeunload", () => {
    navigator.sendBeacon?.(
      "/api/room?action=leave_room",
      new Blob([JSON.stringify({ story_id: room.id, user_id: user.id })], { type: "application/json" })
    );
  });

  document.getElementById("chatBtn").onclick = () => publish("chat");
  document.getElementById("bookBtn").onclick = () => publish("book");
  document.getElementById("chapterBtn").onclick = async () => {
    try {
      const data = await roomApi.generateChapters(room.id, user.id);
      chapters = data.chapters || [];
      renderToc();
      alert(`已生成 ${chapters.length} 个章节`);
    } catch (e) {
      alert(e.message);
    }
  };
  document.getElementById("pdfBtn").onclick = downloadPdf;

  heartbeatTimer = setInterval(() => roomApi.heartbeat(room.id, user.id).catch(() => {}), 30000);
  roomApi.heartbeat(room.id, user.id).catch(() => {});

  async function publish(type) {
    const text = document.getElementById("composeInput").value.trim();
    if (!text) return alert("写点什么吧");
    if (type === "book" && text.length > 50) return alert("共享写书限50字");
    try {
      await roomApi.publish(room.id, user.id, type, text);
      document.getElementById("composeInput").value = "";
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  function renderToc() {
    const box = document.getElementById("tocBox");
    if (!chapters.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `<h3>目录</h3><ol>${chapters.map((c) => `<li>${c.title}</li>`).join("")}</ol>`;
  }

  async function refresh() {
    try {
      const data = await roomApi.content(room.id, user.id);
      bookTitle = data.title || room.title;
      chapters = data.chapters || [];
      renderBook(data.book);
      renderChat(data.chat);
      renderToc();
      document.getElementById("roomMeta").textContent = `《${bookTitle}》· 共 ${data.book.length} 句 · @${user.username}`;
    } catch (e) {
      document.getElementById("bookWindow").innerHTML = `<p class="hint err">${e.message}</p>`;
    }
  }

  function renderBook(items) {
    const box = document.getElementById("bookWindow");
    const titleHtml = `<h3 class="book-title">《${bookTitle}》</h3>`;

    if (!items.length) {
      box.innerHTML = titleHtml + "<p>等待第一位作者开启世界线...</p>";
      return;
    }

    if (chapters.length) {
      box.innerHTML =
        titleHtml +
        chapters
          .map(
            (ch) => `
        <div class="chapter-block">
          <h4 class="chapter-title">${ch.title}</h4>
          <p class="chapter-text">${ch.text}</p>
        </div>`
          )
          .join("");
      return;
    }

    box.innerHTML =
      titleHtml +
      items
        .map((item) => {
          const info = `@${item.author} · ${item.time}`;
          return `<span class="book-line" data-id="${item.id}" data-info="${info}" title="${info}">${item.text}</span>`;
        })
        .join("");
    box.querySelectorAll(".book-line").forEach((el) => {
      el.onclick = () => tryRecall(Number(el.dataset.id));
    });
  }

  function renderChat(items) {
    const box = document.getElementById("chatWindow");
    if (!items.length) {
      box.innerHTML = `<p class="sub">暂无聊天</p>`;
      return;
    }
    box.innerHTML = items
      .map(
        (item) => `
      <div class="chat-item" data-id="${item.id}">
        <span class="chat-author">@${item.author}</span>
        <span class="chat-time">${item.time}</span>
        <p>${item.text}</p>
      </div>`
      )
      .join("");
    box.querySelectorAll(".chat-item").forEach((el) => {
      el.onclick = () => tryRecall(Number(el.dataset.id));
    });
  }

  async function tryRecall(contentId) {
    if (!confirm("撤回这条内容？（半小时内有效）")) return;
    try {
      await roomApi.recall(contentId, user.id);
      await refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  function downloadPdf() {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.onload = () => {
      const title = bookTitle || room.title;
      let body = `<h1 style="text-align:center">《${title}》</h1>`;
      if (chapters.length) {
        body += `<h2>目录</h2><ol>${chapters.map((c) => `<li>${c.title}</li>`).join("")}</ol>`;
        body += chapters.map((c) => `<h2>${c.title}</h2><p>${c.text}</p>`).join("");
      } else {
        body += document.getElementById("bookWindow").innerHTML;
      }
      const wrap = document.createElement("div");
      wrap.innerHTML = body;
      html2pdf()
        .set({
          margin: 1,
          filename: `${title}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .from(wrap)
        .save();
    };
    document.head.appendChild(script);
  }

  refresh();
  pollTimer = setInterval(refresh, 8000);
}
