import { authApi, roomApi } from "./api.js";
import { bindNameCheck } from "./nameCheck.js";
import { getUser, setUser, setRoom, clearRoom, clearUser } from "../../js/store.js";

export function renderLobby(app, onEnterRoom, game) {
  const user = getUser();
  let todoTimer = null;

  app.innerHTML = `
    <div class="card">
      <div class="header-row">
        <div>
          <p class="game-brand">${game.nameEn}</p>
          <h1>${game.lobbyTitle}</h1>
        </div>
        <div class="row" style="margin:0;flex-wrap:wrap;justify-content:flex-end;">
          <div class="user-menu-wrap">
            <button type="button" id="userMenuBtn" class="badge user-menu-btn">@${user.username}</button>
            <div id="userMenu" class="user-menu" hidden>
              <button type="button" id="logoutBtn">退出登录</button>
            </div>
          </div>
          <button type="button" id="leaveLobbyBtn" class="btn-secondary btn-small">返回游戏中心</button>
        </div>
      </div>

      <section class="section todo-section">
        <h2>待办事项</h2>
        <div id="todoBox"><p class="sub">加载中...</p></div>
      </section>

      <section class="section">
        <h2>创建房间</h2>
        <p class="sub">房间名 = 书名（唯一）</p>
        <div class="row">
          <input type="text" id="createTitle" placeholder="书名..." maxlength="30">
          <button type="button" id="titleSuggest" class="btn-secondary disabled" disabled>推荐可用名</button>
        </div>
        <p id="titleHint" class="hint"></p>
        <button id="createBtn" class="btn-primary">创建房间</button>
      </section>

      <section class="section">
        <h2>加入房间</h2>
        <label>邀请码（有码直接进）</label>
        <div class="row">
          <input type="text" id="inviteCode" placeholder="6位邀请码" maxlength="8">
          <button id="joinCodeBtn" class="btn-secondary">进入</button>
        </div>
        <label>或搜索书名</label>
        <div class="row">
          <input type="text" id="searchTitle" placeholder="输入书名关键词">
          <button id="searchBtn" class="btn-secondary">搜索</button>
        </div>
        <div id="searchResults"></div>
      </section>

      <section class="section" id="ownerPanel" hidden>
        <h2>房主管理 · 拉人进群</h2>
        <div class="row">
          <input type="text" id="pullSearch" placeholder="搜索用户昵称">
          <button id="pullSearchBtn" class="btn-secondary">搜索</button>
        </div>
        <div id="pullResults"></div>
      </section>

      <section class="section">
        <h2>我的房间</h2>
        <div id="myRooms"></div>
      </section>
    </div>`;

  const userMenuBtn = document.getElementById("userMenuBtn");
  const userMenu = document.getElementById("userMenu");
  userMenuBtn.onclick = (e) => {
    e.stopPropagation();
    userMenu.hidden = !userMenu.hidden;
  };
  document.addEventListener("click", (e) => {
    if (!userMenu.contains(e.target) && e.target !== userMenuBtn) {
      userMenu.hidden = true;
    }
  });
  document.getElementById("logoutBtn").onclick = () => {
    clearInterval(todoTimer);
    clearRoom();
    clearUser();
    window.location.href = "/game/register/";
  };

  document.getElementById("leaveLobbyBtn").onclick = () => {
    clearInterval(todoTimer);
    clearRoom();
    window.location.href = "/game/";
  };

  bindNameCheck({
    input: document.getElementById("createTitle"),
    btn: document.getElementById("titleSuggest"),
    hint: document.getElementById("titleHint"),
    checkFn: roomApi.checkTitle,
  });

  document.getElementById("createBtn").onclick = async () => {
    const title = document.getElementById("createTitle").value.trim();
    if (!title) return alert("请输入书名");
    try {
      const data = await roomApi.create(title, user.id);
      enterRoom({
        id: data.story_id,
        title: data.title,
        invite_code: data.invite_code,
        role: "owner",
      });
    } catch (e) {
      if (e.data?.recommend) {
        document.getElementById("titleHint").textContent = `已被占用，可点推荐名`;
        const btn = document.getElementById("titleSuggest");
        btn.textContent = `推荐: ${e.data.recommend}`;
        btn.dataset.v = e.data.recommend;
        btn.disabled = false;
        btn.classList.remove("disabled");
      }
      alert(e.message);
    }
  };

  document.getElementById("joinCodeBtn").onclick = async () => {
    const code = document.getElementById("inviteCode").value.trim();
    if (!code) return alert("请输入邀请码");
    try {
      const data = await roomApi.joinByCode(code, user.id);
      enterRoom({
        id: data.story.id,
        title: data.story.title,
        invite_code: code.toUpperCase(),
        role: "member",
      });
    } catch (e) {
      alert(e.message);
    }
  };

  function joinStatusLabel(r) {
    if (r.my_status === "active") return '<em class="hint ok">已加入</em>';
    if (r.my_status === "pending") return '<em class="hint warn">已提交申请</em>';
    return "";
  }

  function joinActionHtml(r) {
    if (r.my_status === "active") return `<span class="hint ok">已加入</span>`;
    if (r.my_status === "pending") return `<span class="hint warn">待通过</span>`;
    return `<button data-id="${r.id}" class="btn-small apply-btn">申请加入</button>`;
  }

  document.getElementById("searchBtn").onclick = async () => {
    const q = document.getElementById("searchTitle").value.trim();
    const box = document.getElementById("searchResults");
    if (!q) return (box.innerHTML = "");
    try {
      const data = await roomApi.search(q, user.id);
      box.innerHTML = data.rooms.length
        ? data.rooms
            .map(
              (r) => `
          <div class="list-item">
            <div>
              <strong>${r.title}</strong><br>
              <span class="sub">房主 ${r.owner_name} · 分享码 <code class="share-code">${r.invite_code}</code></span>
              ${joinStatusLabel(r)}
            </div>
            ${joinActionHtml(r)}
          </div>`
            )
            .join("")
        : `<p class="sub">未找到房间</p>`;
      box.querySelectorAll(".apply-btn").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await roomApi.requestJoin(Number(btn.dataset.id), user.id);
            btn.replaceWith(Object.assign(document.createElement("span"), { className: "hint warn", textContent: "已提交申请" }));
            loadTodos();
          } catch (e) {
            alert(e.message);
          }
        };
      });
    } catch (e) {
      box.innerHTML = `<p class="hint err">${e.message}</p>`;
    }
  };

  document.getElementById("pullSearchBtn").onclick = async () => {
    const q = document.getElementById("pullSearch").value.trim();
    const box = document.getElementById("pullResults");
    if (!ownerRoom) return alert("你暂无房主房间");
    if (!q) return (box.innerHTML = "");
    try {
      const data = await authApi.searchUsers(q);
      const members = (await roomApi.members(ownerRoom.id)).members;
      const memberIds = new Set(members.map((m) => m.user_id));
      box.innerHTML = data.users
        .filter((u) => u.id !== user.id)
        .map((u) => {
          const inGroup = memberIds.has(u.id);
          return `
        <div class="list-item">
          <span>@${u.username}${inGroup ? ' <em class="hint ok">已在群</em>' : ""}</span>
          ${inGroup ? "" : `<button data-uid="${u.id}" class="btn-small pull-btn">拉进群</button>`}
        </div>`;
        })
        .join("");
      box.querySelectorAll(".pull-btn").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await roomApi.pullUser(ownerRoom.id, user.id, Number(btn.dataset.uid));
            alert("已拉入群组");
            loadTodos();
          } catch (e) {
            alert(e.message);
          }
        };
      });
    } catch (e) {
      box.innerHTML = `<p class="hint err">${e.message}</p>`;
    }
  };

  function enterRoom(room) {
    clearInterval(todoTimer);
    setRoom(room);
    onEnterRoom(room);
  }

  let ownerRoom = null;

  async function loadTodos() {
    const box = document.getElementById("todoBox");
    const currentUser = getUser();
    try {
      const data = await roomApi.todos(user.id);
      const approveHtml = data.to_approve.length
        ? `<h3>待审批</h3>${data.to_approve
            .map(
              (g) => `
          <div class="todo-group">
            <strong>《${g.title}》</strong>
            ${g.requests
              .map(
                (r) => `
              <div class="list-item">
                <span>@${r.username}</span>
                <button class="btn-small approve-btn" data-sid="${g.story_id}" data-uid="${r.user_id}">同意</button>
              </div>`
              )
              .join("")}
          </div>`
            )
            .join("")}`
        : `<p class="sub">暂无待审批</p>`;

      const waitingHtml = data.waiting.length
        ? `<h3>待通过</h3>${data.waiting
            .map((w) => `<div class="list-item"><span>《${w.title}》</span><em class="hint warn">等待房主同意</em></div>`)
            .join("")}`
        : `<p class="sub">暂无待通过申请</p>`;

      const pwdHtml = currentUser.must_change_password
        ? `<h3>账户安全</h3>
           <div class="todo-group">
             <p class="sub">你正在使用临时密码，请尽快修改</p>
             <input type="password" id="newPass1" placeholder="新密码">
             <input type="password" id="newPass2" placeholder="确认新密码">
             <p id="pwdHint" class="hint"></p>
             <button id="changePwdBtn" class="btn-primary" disabled>修改密码</button>
           </div>`
        : "";

      box.innerHTML = pwdHtml + approveHtml + waitingHtml;

      box.querySelectorAll(".approve-btn").forEach((btn) => {
        btn.onclick = async () => {
          await roomApi.approve(Number(btn.dataset.sid), user.id, Number(btn.dataset.uid));
          loadTodos();
          loadMyRooms();
        };
      });

      const pwdBtn = document.getElementById("changePwdBtn");
      if (pwdBtn) {
        const p1 = document.getElementById("newPass1");
        const p2 = document.getElementById("newPass2");
        const hint = document.getElementById("pwdHint");
        const sync = () => {
          if (!p1.value || !p2.value) {
            pwdBtn.disabled = true;
            hint.textContent = "";
            return;
          }
          if (p1.value !== p2.value) {
            pwdBtn.disabled = true;
            hint.textContent = "两次密码不一致";
            hint.className = "hint err";
          } else if (p1.value.length < 6) {
            pwdBtn.disabled = true;
            hint.textContent = "密码至少 6 位";
            hint.className = "hint err";
          } else {
            pwdBtn.disabled = false;
            hint.textContent = "✓ 可以提交";
            hint.className = "hint ok";
          }
        };
        p1.oninput = sync;
        p2.oninput = sync;
        pwdBtn.onclick = async () => {
          try {
            const res = await authApi.changePassword(currentUser.id, p1.value, p2.value);
            currentUser.must_change_password = false;
            setUser(currentUser);
            alert(res.message);
            loadTodos();
          } catch (e) {
            alert(e.message);
          }
        };
      }
    } catch (e) {
      box.innerHTML = `<p class="hint err">${e.message}</p>`;
    }
  }

  async function loadMyRooms() {
    const box = document.getElementById("myRooms");
    try {
      const data = await roomApi.myRooms(user.id);
      ownerRoom = data.rooms.find((r) => r.role === "owner") || null;
      document.getElementById("ownerPanel").hidden = !ownerRoom;

      if (!data.rooms.length) {
        box.innerHTML = `<p class="sub">暂无房间，请创建或加入</p>`;
        return;
      }

      box.innerHTML = data.rooms
        .map(
          (r) => `
        <div class="list-item">
          <div>
            <strong>${r.title}</strong> ${r.role === "owner" ? "（房主）" : ""}
            ${r.role === "owner" && r.invite_code ? `<br><span class="sub">分享码 <code class="share-code">${r.invite_code}</code></span>` : ""}
          </div>
          <button data-id="${r.id}" data-title="${r.title}" data-role="${r.role}" data-code="${r.invite_code || ""}" class="btn-small enter-btn">进入房间</button>
        </div>`
        )
        .join("");
      box.querySelectorAll(".enter-btn").forEach((btn) => {
        btn.onclick = () =>
          enterRoom({
            id: Number(btn.dataset.id),
            title: btn.dataset.title,
            role: btn.dataset.role,
            invite_code: btn.dataset.code || undefined,
          });
      });
    } catch (e) {
      box.innerHTML = `<p class="hint err">${e.message}</p>`;
    }
  }

  loadTodos();
  loadMyRooms();
  todoTimer = setInterval(() => {
    loadTodos();
    loadMyRooms();
  }, 10000);
}
