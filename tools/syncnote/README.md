# 文本中转站 / Text Relay

## 功能 | Features

**中文**

文本中转站是一个临时中转工具，方便你在不同终端之间传递文本或链接。

在终端 A 把目标内容放进输入框，终端 B 用**同一账号**登录后即可复制粘贴，无需改格式、不用重新选中或处理换行。最多提供 **3 个独立输入框**，可同时进行多段内容的中转。每个输入框都有**复制、粘贴、删除**三个按钮。用完点**删除**，该框内容即被清空，可继续下一段中转。

**English**

Text Relay is a temporary relay for moving text or links between your devices.

On device A, put the content in a field. On device B, sign in with the **same account** and copy or paste—no reformatting or re-selection needed. There are **3 independent fields** for parallel relays. Each field has **Copy**, **Paste**, and **Delete**. Tap **Delete** when done to clear that field for the next relay.

---

## 保存原理 | How it works

**中文**

- 仅**已登录账号**可使用；数据按账号隔离，他人无法读取。
- 每个输入框单独保存；**不删除则一直保持**框内最后一次内容。
- 点**删除**后，该框在服务端清空，其他框不受影响。
- 传输走 **HTTPS**，浏览器与服务器之间的通信加密。

**English**

- **Signed-in accounts only**; data is scoped per account.
- Each field is saved separately; content **persists until you delete** that field.
- **Delete** clears only that field on the server; other fields are unchanged.
- Traffic uses **HTTPS** (encrypted in transit).

---

## 本地运行 | Local

```bash
git clone https://github.com/moser10/syncNote.git
cd syncNote
npm run dev
```

浏览器访问 http://localhost:8787 · open http://localhost:8787

本地默认 `BYPASS_AUTH=true`，可不登录试用。门户版：https://1024201.com/tools/syncnote/

## License

MIT
