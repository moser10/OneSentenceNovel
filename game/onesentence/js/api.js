const API = "";

export async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

export const authApi = {
  checkName: (username) =>
    api("/api/auth?action=check", { method: "POST", body: JSON.stringify({ username }) }),
  register: (email, username, password) =>
    api("/api/auth?action=register", { method: "POST", body: JSON.stringify({ email, username, password }) }),
  login: (email, password) =>
    api("/api/auth?action=login", { method: "POST", body: JSON.stringify({ email, password }) }),
  forgot: (email) =>
    api("/api/auth?action=forgot", { method: "POST", body: JSON.stringify({ email }) }),
  changePassword: (user_id, password, password2) =>
    api("/api/auth?action=change_password", { method: "POST", body: JSON.stringify({ user_id, password, password2 }) }),
  searchUsers: (q) => api(`/api/auth?action=search&q=${encodeURIComponent(q)}`),
};

export const roomApi = {
  checkTitle: (title) =>
    api("/api/room?action=check_title", { method: "POST", body: JSON.stringify({ title }) }),
  create: (title, owner_id) =>
    api("/api/room?action=create_room", { method: "POST", body: JSON.stringify({ title, owner_id }) }),
  updateTitle: (story_id, user_id, title) =>
    api("/api/room?action=update_title", { method: "POST", body: JSON.stringify({ story_id, user_id, title }) }),
  search: (q, user_id) =>
    api(`/api/room?action=search&q=${encodeURIComponent(q)}&user_id=${user_id}`),
  todos: (user_id) => api(`/api/room?action=todos&user_id=${user_id}`),
  heartbeat: (story_id, user_id) =>
    api("/api/room?action=heartbeat", { method: "POST", body: JSON.stringify({ story_id, user_id }) }),
  leaveRoom: (story_id, user_id) =>
    api("/api/room?action=leave_room", { method: "POST", body: JSON.stringify({ story_id, user_id }) }),
  generateChapters: (story_id, user_id) =>
    api("/api/room?action=generate_chapters", { method: "POST", body: JSON.stringify({ story_id, user_id }) }),
  joinByCode: (invite_code, user_id) =>
    api("/api/room?action=join_by_code", { method: "POST", body: JSON.stringify({ invite_code, user_id }) }),
  requestJoin: (story_id, user_id) =>
    api("/api/room?action=request_join", { method: "POST", body: JSON.stringify({ story_id, user_id }) }),
  pending: (story_id, owner_id) =>
    api(`/api/room?action=pending&story_id=${story_id}&owner_id=${owner_id}`),
  approve: (story_id, owner_id, user_id) =>
    api("/api/room?action=approve_join", { method: "POST", body: JSON.stringify({ story_id, owner_id, user_id }) }),
  pullUser: (story_id, owner_id, user_id) =>
    api("/api/room?action=pull_user", { method: "POST", body: JSON.stringify({ story_id, owner_id, user_id }) }),
  members: (story_id) => api(`/api/room?action=members&story_id=${story_id}`),
  myRooms: (user_id) => api(`/api/room?action=my_rooms&user_id=${user_id}`),
  content: (story_id, user_id) =>
    api(`/api/room?action=content&story_id=${story_id}&user_id=${user_id}`),
  publish: (story_id, user_id, type, text) =>
    api("/api/room?action=publish", { method: "POST", body: JSON.stringify({ story_id, user_id, type, text }) }),
  recall: (content_id, user_id) =>
    api("/api/room?action=recall", { method: "POST", body: JSON.stringify({ content_id, user_id }) }),
};
