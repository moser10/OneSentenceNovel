export function bindNameCheck({ input, btn, hint, checkFn, onStatus }) {
  let timer = null;

  const grayBtn = () => {
    btn.disabled = true;
    btn.classList.add("disabled");
    btn.textContent = "推荐可用名";
    delete btn.dataset.v;
    if (hint) hint.textContent = "";
    onStatus?.(false);
  };

  grayBtn();

  input.addEventListener("input", () => {
    grayBtn();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const value = input.value.trim();
      if (!value) return;
      try {
        const data = await checkFn(value);
        if (data.available) {
          if (hint) hint.textContent = "✓ 可以使用";
          if (hint) hint.className = "hint ok";
          onStatus?.(true);
        } else {
          if (hint) {
            hint.textContent = "已被占用";
            hint.className = "hint warn";
          }
          btn.textContent = `推荐: ${data.recommend}`;
          btn.dataset.v = data.recommend;
          btn.disabled = false;
          btn.classList.remove("disabled");
          onStatus?.(false);
        }
      } catch (e) {
        if (hint) {
          hint.textContent = e.message;
          hint.className = "hint err";
        }
        onStatus?.(false);
      }
    }, 500);
  });

  btn.addEventListener("click", () => {
    if (!btn.dataset.v) return;
    input.value = btn.dataset.v;
    grayBtn();
    input.dispatchEvent(new Event("input"));
  });
}
