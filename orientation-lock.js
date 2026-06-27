(function lockSfkPhoneToPortrait() {
  const orientation = window.screen?.orientation;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isPhone = () =>
    window.matchMedia("(pointer: coarse)").matches &&
    Math.min(window.screen?.width || innerWidth, window.screen?.height || innerHeight) <= 600;

  let locking = false;

  async function lockPortrait(allowFullscreen) {
    if (locking || !isPhone() || !orientation?.lock) return;
    locking = true;

    try {
      if (
        allowFullscreen &&
        !isStandalone() &&
        !document.fullscreenElement &&
        document.fullscreenEnabled &&
        document.documentElement.requestFullscreen
      ) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }

      try {
        await orientation.lock("portrait-primary");
      } catch (error) {
        await orientation.lock("portrait");
      }
    } catch (error) {
      // Some browsers only honor the manifest lock in an installed PWA.
    } finally {
      locking = false;
    }
  }

  const retryLock = () => lockPortrait(false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", retryLock, { once: true });
  } else {
    retryLock();
  }

  window.addEventListener("pageshow", retryLock);
  window.addEventListener("orientationchange", retryLock);
  orientation?.addEventListener?.("change", retryLock);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) retryLock();
  });
  document.addEventListener("pointerup", () => lockPortrait(true), {
    once: true,
    capture: true,
    passive: true
  });
})();
