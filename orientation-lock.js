(function lockSfkPhoneToPortrait() {
  const orientation = window.screen?.orientation;
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isPhone = () => {
    const userAgentDataMobile = window.navigator.userAgentData?.mobile;
    const phoneUserAgent = /iPhone|iPod|Android.+Mobile|Windows Phone|webOS|BlackBerry/i
      .test(window.navigator.userAgent || "");
    return userAgentDataMobile === true || phoneUserAgent;
  };

  let locking = false;
  let portraitLocked = false;

  async function lockPortrait(allowFullscreen) {
    if (locking || portraitLocked || !isPhone() || !orientation?.lock) return;
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
      portraitLocked = true;
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
  window.addEventListener("orientationchange", () => {
    portraitLocked = false;
    retryLock();
  });
  orientation?.addEventListener?.("change", () => {
    if (!String(orientation.type || "").startsWith("portrait")) portraitLocked = false;
    retryLock();
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) portraitLocked = false;
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) retryLock();
  });
  document.addEventListener("pointerup", () => lockPortrait(true), {
    capture: true,
    passive: true
  });
})();
