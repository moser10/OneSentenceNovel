import * as lines from "./functions/api/lines.js";
import * as auth from "./functions/api/auth.js";
import * as room from "./functions/api/room.js";

const API_ROUTES = {
  "/api/lines": lines,
  "/api/auth": auth,
  "/api/room": room,
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const handler = API_ROUTES[pathname];
    if (handler) {
      return handler.onRequest({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  },
};
