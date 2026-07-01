/** Mobile / touch-narrow client hint from UA (primary) plus viewport. */
export function isMobileClient() {
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  if (/Mobile/i.test(ua)) return true;
  if (navigator.maxTouchPoints > 1 && window.matchMedia("(max-width: 820px)").matches) return true;
  return false;
}

export function prefersStackedChrome(width) {
  return isMobileClient() || width < 360;
}
