/** 各游戏在大厅 / 房间内展示的元信息 */
export const GAMES = {
  osn: {
    id: "osn",
    nameEn: "One Sentence Novel",
    nameZh: "一人一句写小说",
    lobbyTitle: "大厅之：一人一句写小说",
  },
};

export function getGame(gameId) {
  return GAMES[gameId] || {
    id: gameId || "game",
    nameEn: gameId?.toUpperCase() || "Game",
    nameZh: gameId || "游戏",
    lobbyTitle: `大厅之：${gameId || "游戏"}`,
  };
}
