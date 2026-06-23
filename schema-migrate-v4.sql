-- D1 Console：请逐条执行

-- 1. 用户密码字段
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_plain TEXT;
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN temp_password TEXT;
ALTER TABLE users ADD COLUMN temp_password_expires TEXT;

-- 2. 游戏房间标识
ALTER TABLE stories ADD COLUMN game_id TEXT NOT NULL DEFAULT 'osn';

-- 3. 管理后台账号（在 D1 里把 password_plain 设为 1qaz2wsx，首次登录后自动转 hash）
CREATE TABLE IF NOT EXISTS admin_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL DEFAULT 'sa',
  password_hash TEXT,
  password_plain TEXT,
  temp_password TEXT,
  temp_password_used_at TEXT
);

INSERT OR IGNORE INTO admin_auth (id, username, password_plain) VALUES (1, 'sa', '1qaz2wsx');

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
