-- D1 Console：请一条一条执行（不要复制带 ... 的缩写）
-- 若某条报 duplicate column，说明已存在，跳过即可

-- 第 1 条
CREATE TABLE IF NOT EXISTS room_presence (
  story_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (story_id, user_id)
);

-- 第 2 条（若 chapters_json 已存在会报错，可忽略）
ALTER TABLE stories ADD COLUMN chapters_json TEXT;
