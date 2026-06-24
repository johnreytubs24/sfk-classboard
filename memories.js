const MEMORIES_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";
const MEMORY_CACHE_KEY = "sfkMemoriesCacheV1";
const HEARTED_MEMORY_KEY = "sfkHeartedMemoriesV1";
const MEMORY_AUTH_SESSION_KEY = "sfkMemoriesAuthSessionV1";
const MEMORIES_SEEN_IDS_KEY = "sfkMemoriesSeenPostIdsV1";
const MEMORY_POSTED_BY_KEY = "sfkMemoryPostedByV1";
const MAX_MEDIA_FILES = 6;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 22 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 420 * 1024;
const MUSIC_LINK_TEST_TIMEOUT_MS = 8000;

const memoryState = {
  posts: [],
  filter: "all",
  carousel: new Map(),
  auth: null,
  selectedFiles: [],
  coverIndex: 0,
  viewerMedia: [],
  viewerIndex: 0,
  requestedPostHandled: false,
  suppressClickUntil: 0
};

let touchGesture = null;
let feedVideoObserver = null;
let postMusicObserver = null;

document.addEventListener("DOMContentLoaded", () => {
  setDefaultMemoryDate();
  restoreMemoryAuth();
  bindMemoryEvents();
  renderCachedMemories();
  loadMemories();
});

function bindMemoryEvents() {
  ["topPostButton", "sidePostButton", "floatingPostButton"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", openComposeModal);
  });

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", () => closeModal(element.dataset.closeModal));
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => setMemoryFilter(button.dataset.filter));
  });

  document.getElementById("unlockPostingButton")?.addEventListener("click", unlockMemoryPosting);
  document.getElementById("changeRoleButton")?.addEventListener("click", resetMemoryAuth);
  document.getElementById("memoryFiles")?.addEventListener("change", handleMemoryFiles);
  document.getElementById("mediaPreview")?.addEventListener("click", handleMediaPreviewAction);
  document.getElementById("testMusicLinkButton")?.addEventListener("click", testMusicLink);
  document.getElementById("memoryForm")?.addEventListener("submit", submitMemoryPost);
  ["memoryTitle", "memoryDate", "memoryPostedBy", "memoryCaption", "memoryVideoUrl", "memoryMusicUrl"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderComposePreview);
  });
  const feed = document.getElementById("memoryFeed");
  feed?.addEventListener("click", handleFeedClick);
  feed?.addEventListener("touchstart", startFeedSwipe, { passive: true });
  feed?.addEventListener("touchmove", moveFeedSwipe, { passive: false });
  feed?.addEventListener("touchend", endFeedSwipe, { passive: true });
  feed?.addEventListener("error", handleFeedVideoError, true);
  feed?.addEventListener("load", handleEmbeddedMediaLoad, true);
  document.getElementById("closeViewerButton")?.addEventListener("click", closeViewer);
  document.getElementById("viewerPrevious")?.addEventListener("click", () => moveViewer(-1));
  document.getElementById("viewerNext")?.addEventListener("click", () => moveViewer(1));
  document.getElementById("viewerModal")?.addEventListener("touchstart", startViewerSwipe, { passive: true });
  document.getElementById("viewerModal")?.addEventListener("touchend", endViewerSwipe, { passive: true });
  document.getElementById("viewerModal")?.addEventListener("click", handleViewerClick);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeViewer();
      closeModal("composeModal");
    }

    if (!document.getElementById("viewerModal")?.hidden) {
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    }
  });

  document.addEventListener("visibilitychange", handlePageVisibilityChange);
  window.addEventListener("pagehide", pauseAllPageMedia);
  window.addEventListener("blur", pauseAllPageMedia);
  document.addEventListener("freeze", pauseAllPageMedia);
}

async function loadMemories() {
  setFeedStatus("Loading memories...");

  try {
    const response = await fetch(`${MEMORIES_API_URL}?type=memories`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    if (result.status !== "success" || !Array.isArray(result.memories)) {
      throw new Error(result.message || "Invalid memories response.");
    }

    memoryState.posts = result.memories.map(normalizeMemoryPost);
    localStorage.setItem(MEMORY_CACHE_KEY, JSON.stringify(memoryState.posts));
    markLoadedMemoriesSeen(memoryState.posts);
    renderMemories();
  } catch (error) {
    console.error("Memories load failed:", error);
    if (memoryState.posts.length === 0) {
      setFeedStatus("Memories will appear after the updated Apps Script is deployed.");
    }
  }
}

function markLoadedMemoriesSeen(posts) {
  const ids = (posts || [])
    .map(post => String(post.id || "").trim())
    .filter(Boolean);

  localStorage.setItem(MEMORIES_SEEN_IDS_KEY, JSON.stringify(Array.from(new Set(ids)).slice(0, 500)));
}

function renderCachedMemories() {
  try {
    const cached = JSON.parse(localStorage.getItem(MEMORY_CACHE_KEY) || "[]");
    if (!Array.isArray(cached) || cached.length === 0) return;
    memoryState.posts = cached.map(normalizeMemoryPost);
    renderMemories();
  } catch (error) {
    localStorage.removeItem(MEMORY_CACHE_KEY);
  }
}

function normalizeMemoryPost(raw) {
  let uploadedMedia = Array.isArray(raw.media) ? raw.media : [];

  if (uploadedMedia.length === 0) {
    try {
      const parsed = JSON.parse(raw.MediaJSON || raw.mediaJSON || "[]");
      uploadedMedia = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      uploadedMedia = [];
    }
  }

  const media = uploadedMedia
    .map(normalizeStoredMedia)
    .filter(Boolean);
  const linkedVideo = normalizeExternalMedia(
    raw.VideoURL || raw.videoUrl || "",
    raw.VideoDownloadURL || raw.videoDownloadUrl || ""
  );
  if (linkedVideo) media.push(linkedVideo);
  const music = normalizePostMusic(raw);

  return {
    id: String(raw.ID || raw.Id || raw.id || "").trim(),
    date: String(raw.Date || "").trim(),
    title: String(raw.Title || "Untitled Memory").trim(),
    caption: String(raw.Caption || "").trim(),
    postedBy: String(raw.PostedBy || "SFK").trim(),
    role: String(raw.Role || "Officer").trim(),
    heartCount: Math.max(0, Number(raw.HeartCount || 0)),
    createdAt: String(raw.CreatedAt || "").trim(),
    videoUrl: String(raw.VideoURL || raw.videoUrl || "").trim(),
    media,
    music
  };
}

function normalizePostMusic(raw) {
  if (raw.music && typeof raw.music === "object") {
    if (raw.music.kind === "youtube-audio") return null;
    const fileId = String(raw.music.fileId || getDriveFileId(raw.music.url) || getDriveFileId(raw.music.previewUrl) || "").trim();
    const isDriveAudio = raw.music.kind === "drive-audio" || Boolean(fileId);
    return {
      ...raw.music,
      kind: isDriveAudio ? "drive-audio" : raw.music.kind,
      fileId,
      url: isDriveAudio
        ? (getDriveStreamUrl(fileId) || safeHttpUrl(raw.music.url) || safeHttpUrl(raw.music.downloadUrl) || getDriveAudioStreamUrl(fileId))
        : safeHttpUrl(raw.music.url),
      fallbackUrl: isDriveAudio
        ? (getDriveAudioStreamUrl(fileId) || safeHttpUrl(raw.music.fallbackUrl))
        : safeHttpUrl(raw.music.fallbackUrl),
      previewUrl: safeHttpUrl(raw.music.previewUrl),
      name: getMusicDisplayName(raw.music),
      muted: true,
      started: false
    };
  }

  let uploaded = null;
  try {
    uploaded = JSON.parse(raw.MusicJSON || raw.musicJSON || "null");
  } catch (error) {
    uploaded = null;
  }

  if (uploaded && uploaded.fileId) {
    return {
      kind: "drive-audio",
      name: String(uploaded.name || "Background music"),
      fileId: String(uploaded.fileId),
      url: getDriveStreamUrl(uploaded.fileId) || safeHttpUrl(uploaded.downloadUrl) || getDriveAudioStreamUrl(uploaded.fileId),
      fallbackUrl: getDriveAudioStreamUrl(uploaded.fileId),
      previewUrl: safeHttpUrl(uploaded.previewUrl),
      muted: true,
      started: false
    };
  }

  const url = safeHttpUrl(raw.MusicURL || raw.musicUrl || "");
  if (!url) return null;
  if (getYouTubeId(url)) return null;

  const driveId = getDriveFileId(url);
  if (driveId) {
    return {
      kind: "drive-audio",
      name: deriveMusicNameFromUrl(url) || "Google Drive music",
      fileId: driveId,
      url: getDriveStreamUrl(driveId) || safeHttpUrl(raw.MusicDownloadURL || raw.musicDownloadUrl) || getDriveAudioStreamUrl(driveId),
      fallbackUrl: getDriveAudioStreamUrl(driveId),
      previewUrl: url,
      muted: true,
      started: false
    };
  }

  return { kind: "direct-audio", name: deriveMusicNameFromUrl(url) || "Background music", url, muted: true, started: false };
}

function getMusicDisplayName(music) {
  const explicitName = String(music?.name || music?.title || "").trim();
  if (explicitName && !/^background music$/i.test(explicitName)) return explicitName;

  return deriveMusicNameFromUrl(
    music?.previewUrl ||
    music?.fullUrl ||
    music?.url ||
    music?.downloadUrl ||
    music?.fallbackUrl
  ) || explicitName || "Background music";
}

function deriveMusicNameFromUrl(value) {
  try {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const url = new URL(raw, window.location.href);
    const id = getDriveFileId(url.href);
    if (id) return "Google Drive music";

    const pathPart = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    const clean = pathPart
      .replace(/\.(mp3|m4a|aac|ogg|wav|webm)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return clean ? clean.replace(/\b\w/g, letter => letter.toUpperCase()) : "";
  } catch (error) {
    return "";
  }
}

function normalizeStoredMedia(item) {
  if (!item || !safeHttpUrl(item.url)) return null;

  const allowedKinds = ["image", "drive-video", "direct-video", "embed-video"];
  const kind = allowedKinds.includes(item.kind) ? item.kind : "image";

  const fileId = String(item.fileId || getDriveFileId(item.url) || getDriveFileId(item.fullUrl) || "").trim();
  const derivedViewerUrl = kind === "image" && fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w4000`
    : "";

  return {
    kind,
    url: safeHttpUrl(item.url),
    viewerUrl: safeHttpUrl(item.viewerUrl) || derivedViewerUrl || safeHttpUrl(item.url),
    fullUrl: safeHttpUrl(item.fullUrl) || safeHttpUrl(item.url),
    name: String(item.name || "SFK memory"),
    mimeType: String(item.mimeType || ""),
    fileId,
    ratio: Number(item.ratio) > 0 ? Number(item.ratio) : 0,
    streamUrl: kind === "drive-video"
      ? (safeHttpUrl(item.downloadUrl) || safeHttpUrl(item.streamUrl) || getDriveStreamUrl(fileId))
      : safeHttpUrl(item.streamUrl),
    muted: true
  };
}

function normalizeExternalMedia(value, downloadUrl) {
  const url = safeHttpUrl(value);
  if (!url) return null;

  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return {
      kind: "embed-video",
      url: `https://www.youtube.com/embed/${youtubeId}`,
      fullUrl: url,
      name: "YouTube video",
      muted: true
    };
  }

  const driveId = getDriveFileId(url);
  if (driveId) {
    return {
      kind: "drive-video",
      url: `https://drive.google.com/file/d/${driveId}/preview`,
      streamUrl: safeHttpUrl(downloadUrl) || getDriveStreamUrl(driveId),
      fullUrl: url,
      fileId: driveId,
      name: "Google Drive video",
      muted: true
    };
  }

  if (/\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url)) {
    return { kind: "direct-video", url, fullUrl: url, name: "Video", muted: true };
  }

  return { kind: "embed-video", url, fullUrl: url, name: "Linked video", muted: true };
}

function getDriveStreamUrl(fileId) {
  return fileId
    ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`
    : "";
}

function getDriveAudioStreamUrl(fileId) {
  return fileId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
    : "";
}

function getMemoryAudioProxyUrl(fileId) {
  return fileId
    ? `${MEMORIES_API_URL}?type=memoryAudio&fileId=${encodeURIComponent(fileId)}`
    : "";
}

function getMusicDirectSources(music) {
  const sources = [];
  const add = (url) => {
    const safe = safeHttpUrl(url);
    if (safe && !sources.includes(safe)) sources.push(safe);
  };

  if (music?.fileId) {
    add(getDriveStreamUrl(music.fileId));
    add(getDriveAudioStreamUrl(music.fileId));
  }

  add(music?.url);
  add(music?.downloadUrl);
  add(music?.fallbackUrl);

  return sources;
}

function getManualMusicSources(url) {
  const sources = [];
  const add = (value) => {
    const safe = safeHttpUrl(value);
    if (safe && !sources.includes(safe)) sources.push(safe);
  };
  const driveId = getDriveFileId(url);

  if (driveId) {
    add(getDriveStreamUrl(driveId));
    add(getDriveAudioStreamUrl(driveId));
  } else {
    add(url);
  }

  return sources;
}

async function fetchDriveAudioObjectUrl(fileId) {
  const url = getMemoryAudioProxyUrl(fileId);
  if (!url) throw new Error("Music file is not available.");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Music file request failed (${response.status}).`);

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || "Music file is not available.");
  }

  const blob = base64ToBlob(result.data, result.mimeType || "audio/mpeg");
  return {
    objectUrl: URL.createObjectURL(blob),
    name: String(result.name || "").trim()
  };
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(String(base64 || ""));
  const chunks = [];
  const chunkSize = 8192;

  for (let index = 0; index < binary.length; index += chunkSize) {
    const slice = binary.slice(index, index + chunkSize);
    const bytes = new Uint8Array(slice.length);
    for (let byteIndex = 0; byteIndex < slice.length; byteIndex++) {
      bytes[byteIndex] = slice.charCodeAt(byteIndex);
    }
    chunks.push(bytes);
  }

  return new Blob(chunks, { type: mimeType || "audio/mpeg" });
}

function testAudioSource(url, timeoutMs = MUSIC_LINK_TEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    const timer = window.setTimeout(() => {
      finish(false, new Error("Music link took too long to respond."));
    }, timeoutMs);

    function finish(ok, error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (ok) resolve(true);
      else reject(error || new Error("This link is not playable audio."));
    }

    audio.preload = "metadata";
    audio.muted = true;
    audio.addEventListener("loadedmetadata", () => finish(true), { once: true });
    audio.addEventListener("canplay", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(false, new Error("This link is not a direct playable audio file.")), { once: true });
    audio.src = url;
    audio.load();
  });
}

function getYouTubeId(url) {
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})/i);
  return match ? match[1] : "";
}

function getDriveFileId(url) {
  const pathMatch = String(url).match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = String(url).match(/[?&]id=([^&]+)/i);
  return queryMatch ? queryMatch[1] : "";
}

function safeHttpUrl(value) {
  try {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const url = new URL(raw, window.location.href);
    if (["http:", "https:"].includes(url.protocol)) return url.href;
    if (url.protocol === "data:" && /^data:(image|video|audio)\//i.test(url.href)) return url.href;
    return "";
  } catch (error) {
    return "";
  }
}

function renderMemories() {
  const feed = document.getElementById("memoryFeed");
  const empty = document.getElementById("emptyMemories");
  if (!feed || !empty) return;

  const playbackState = captureFeedPlaybackState();
  updateMemoryStats();
  const filtered = getFilteredPosts();
  setFeedStatus("");
  empty.hidden = filtered.length !== 0;
  feed.innerHTML = filtered.map(renderMemoryPost).join("");
  window.requestAnimationFrame(() => {
    restoreFeedPlaybackState(playbackState);
    updateMusicTitleMarquees();
    observeFeedVideos();
    observePostMusic();
    scrollToRequestedMemory();
  });
}

function captureFeedPlaybackState() {
  const states = new Map();

  document.querySelectorAll(".memoryPost").forEach((article) => {
    const postId = article.dataset.postId;
    if (!postId) return;

    article.querySelectorAll(".feedVideo").forEach((video, index) => {
      states.set(`video:${postId}:${video.dataset.mediaIndex || index}`, captureMediaElementState(video));
    });

    const music = article.querySelector(".postMusicPlayer");
    if (music) {
      states.set(`music:${postId}`, captureMediaElementState(music));
    }
  });

  return states;
}

function captureMediaElementState(element) {
  return {
    currentTime: Number.isFinite(element.currentTime) ? element.currentTime : 0,
    muted: Boolean(element.muted),
    paused: Boolean(element.paused),
    ended: Boolean(element.ended),
    src: element.currentSrc || element.src || "",
    volume: Number.isFinite(element.volume) ? element.volume : 1
  };
}

function restoreFeedPlaybackState(states) {
  if (!states || states.size === 0) return;

  document.querySelectorAll(".memoryPost").forEach((article) => {
    const postId = article.dataset.postId;
    if (!postId) return;

    article.querySelectorAll(".feedVideo").forEach((video, index) => {
      restoreMediaElementState(video, states.get(`video:${postId}:${video.dataset.mediaIndex || index}`));
    });

    const music = article.querySelector(".postMusicPlayer");
    restoreMediaElementState(music, states.get(`music:${postId}`), true);
  });
}

function restoreMediaElementState(element, state, restoreSource = false) {
  if (!element || !state) return;

  if (restoreSource && state.src && element.src !== state.src) {
    element.src = state.src;
    element.load();
  }

  element.muted = state.muted;
  element.volume = state.volume;

  const restore = () => {
    if (state.currentTime > 0) {
      try {
        element.currentTime = state.currentTime;
      } catch (error) {
        // Some browsers block seeking until more metadata is ready.
      }
    }

    if (!document.hidden && !state.paused && !state.ended) {
      element.play().catch(() => {});
    }
  };

  if (element.readyState >= 1) {
    restore();
  } else {
    element.addEventListener("loadedmetadata", restore, { once: true });
  }
}

function getFilteredPosts() {
  if (memoryState.filter === "photos") {
    return memoryState.posts.filter((post) => post.media.some((item) => item.kind === "image"));
  }

  if (memoryState.filter === "videos") {
    return memoryState.posts.filter((post) => post.media.some((item) => item.kind !== "image"));
  }

  return memoryState.posts;
}

function renderMemoryPost(post) {
  const currentIndex = Math.min(memoryState.carousel.get(post.id) || 0, Math.max(0, post.media.length - 1));
  const hearted = getHeartedMemoryIds().includes(post.id);
  const avatar = escapeHtml(getInitials(post.postedBy));
  const menu = memoryState.auth
    ? `<button class="postMenuButton" type="button" data-action="manage" data-id="${escapeAttr(post.id)}" aria-label="Manage memory">&#8943;</button>`
    : "";

  return `
    <article class="memoryPost" data-post-id="${escapeAttr(post.id)}" ${post.music ? 'data-has-music="true"' : ""}>
      <header class="postHeader">
        <div class="postAvatar">${avatar}</div>
        <div class="postIdentity">
          <strong>${escapeHtml(post.postedBy)}</strong>
          <small><span class="postRole">${escapeHtml(post.role)}</span></small>
        </div>
        ${menu}
      </header>

      ${renderPostMedia(post, currentIndex)}

      <div class="postActions">
        <button class="heartButton ${hearted ? "hearted" : ""}" type="button" data-action="heart" data-id="${escapeAttr(post.id)}" aria-label="Heart this memory">${hearted ? "&#9829;" : "&#9825;"}</button>
        <button class="shareButton" type="button" data-action="share" data-id="${escapeAttr(post.id)}" aria-label="Share this memory">&#8599;</button>
      </div>

      <div class="postDetails">
        <strong class="heartCount">${formatHeartCount(post.heartCount)}</strong>
        <p class="postCaption"><strong>${escapeHtml(post.title)}</strong>${post.caption ? ` ${escapeHtml(post.caption)}` : ""}</p>
        <time class="postDate">${escapeHtml(post.date || post.createdAt || "SFK Memory")}</time>
      </div>
    </article>
  `;
}

function renderPostMedia(post, currentIndex) {
  if (post.media.length === 0) {
    return `
      <div class="postMedia textOnlyPostMedia">
        <div class="mediaSlide textOnlySlide">
          <span class="textOnlyBadge">SFK Memory</span>
          <strong>${escapeHtml(post.title || "Text Memory")}</strong>
          ${post.caption ? `<p>${escapeHtml(post.caption)}</p>` : ""}
        </div>
        ${renderPostMusic(post)}
      </div>
    `;
  }

  const slides = post.media.map((media, index) => renderMediaSlide(media, post.id, index)).join("");
  const controls = post.media.length > 1
    ? `
      <button class="mediaArrow mediaPrevious" type="button" data-action="previous" data-id="${escapeAttr(post.id)}" aria-label="Previous" ${currentIndex === 0 ? "hidden" : ""}>&#8249;</button>
      <button class="mediaArrow mediaNext" type="button" data-action="next" data-id="${escapeAttr(post.id)}" aria-label="Next" ${currentIndex === post.media.length - 1 ? "hidden" : ""}>&#8250;</button>
      <span class="mediaCounter">${currentIndex + 1}/${post.media.length}</span>
      <div class="mediaDots">${post.media.map((_, index) => `<span class="mediaDot ${index === currentIndex ? "active" : ""}"></span>`).join("")}</div>
    `
    : "";

  return `
    <div class="postMedia">
      <div class="mediaTrack" style="transform:translateX(-${currentIndex * 100}%)">${slides}</div>
      ${controls}
      ${renderPostMusic(post)}
    </div>
  `;
}

function renderPostMusic(post) {
  const music = post.music;
  if (!music) return "";

  const audible = music.muted === false;
  const musicName = getMusicDisplayName(music);
  let player = "";

  player = music.kind === "drive-audio"
    ? `<audio class="postMusicPlayer" ${audible ? "" : "muted"} loop preload="metadata" data-drive-audio="true"></audio>`
    : `
      <audio class="postMusicPlayer" ${audible ? "" : "muted"} loop preload="metadata">
        <source src="${escapeAttr(music.url)}" />
        ${music.fallbackUrl ? `<source src="${escapeAttr(music.fallbackUrl)}" />` : ""}
      </audio>
    `;

  return `
    <div class="postMusic" data-music-post="${escapeAttr(post.id)}">
      ${player}
      <button class="musicToggleButton ${audible ? "audible" : ""}" type="button" data-action="music" data-id="${escapeAttr(post.id)}" title="${escapeAttr(musicName)}" aria-label="${audible ? `Mute ${musicName}` : `Play ${musicName}`}">
        <span class="musicNote">&#9835;</span><span class="musicLabelViewport"><span class="musicLabel">${escapeHtml(musicName)}</span></span><span class="musicSound">${audible ? "&#128266;" : "&#128263;"}</span>
      </button>
    </div>
  `;
}

function renderMediaSlide(media, postId, index) {
  const common = `data-action="view" data-id="${escapeAttr(postId)}" data-index="${index}"`;

  if (media.kind === "image") {
    return `
      <div class="mediaSlide">
        <img class="mediaBackdrop" src="${escapeAttr(media.url)}" alt="" aria-hidden="true" loading="lazy" />
        <img class="mediaMain" src="${escapeAttr(media.url)}" alt="${escapeAttr(media.name)}" loading="lazy" ${common} />
      </div>
    `;
  }

  if (media.kind === "direct-video" || media.kind === "drive-video") {
    const source = media.kind === "drive-video" ? (media.streamUrl || media.url) : media.url;
    return `
      <div class="mediaSlide videoSlide">
        <video class="feedVideo" src="${escapeAttr(source)}" autoplay ${media.muted === false ? "" : "muted"} loop playsinline preload="metadata" data-post-id="${escapeAttr(postId)}" data-media-index="${index}" ${media.kind === "drive-video" ? `data-drive-preview="${escapeAttr(media.url)}"` : ""}></video>
        ${renderVolumeButton(media, postId, index)}
      </div>
    `;
  }

  const youtubeId = getYouTubeId(media.fullUrl || media.url);
  const iframeUrl = youtubeId
    ? getYouTubeEmbedUrl(youtubeId, media.muted !== false)
    : media.url;

  return `
    <div class="mediaSlide videoSlide ${youtubeId ? "youtubeSlide" : ""}">
      <iframe class="feedVideoFrame" src="${escapeAttr(iframeUrl)}" title="${escapeAttr(media.name)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen data-post-id="${escapeAttr(postId)}" data-media-index="${index}" data-youtube="${youtubeId ? "true" : "false"}"></iframe>
      ${youtubeId ? `
        <div class="youtubeInteractionBar">
          <button type="button" data-action="youtube-controls" data-id="${escapeAttr(postId)}" data-index="${index}">
            <span aria-hidden="true">&#9654;</span><span class="youtubeModeText">Enable YouTube Controls</span>
          </button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderVolumeButton(media, postId, index) {
  const audible = media.muted === false;
  return `<button class="mediaVolumeButton ${audible ? "audible" : ""}" type="button" data-action="volume" data-id="${escapeAttr(postId)}" data-index="${index}" aria-label="${audible ? "Mute video" : "Turn on video sound"}">${audible ? "&#128266;" : "&#128263;"}</button>`;
}

function getYouTubeEmbedUrl(videoId, muted) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    loop: "1",
    playlist: videoId,
    playsinline: "1",
    controls: "1",
    rel: "0",
    enablejsapi: "1"
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function handleFeedClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === "view" && Date.now() < memoryState.suppressClickUntil) return;

  if (action === "previous") return moveCarousel(id, -1);
  if (action === "next") return moveCarousel(id, 1);
  if (action === "heart") {
    event.preventDefault();
    event.stopPropagation();
    return heartMemory(id);
  }
  if (action === "share") return shareMemory(id);
  if (action === "manage") return openManageActions(id);
  if (action === "view") return openPostViewer(id, Number(target.dataset.index) || 0);
  if (action === "volume") return toggleMediaVolume(id, Number(target.dataset.index) || 0, target);
  if (action === "music") return togglePostMusic(id, target);
  if (action === "youtube-controls") return toggleYouTubeControls(target);
}

function toggleYouTubeControls(button) {
  const slide = button.closest(".youtubeSlide");
  if (!slide) return;

  const enabled = slide.classList.toggle("youtubeControlsEnabled");
  const text = button.querySelector(".youtubeModeText");
  if (text) text.textContent = enabled ? "Return to Scroll Mode" : "Enable YouTube Controls";
  button.classList.toggle("active", enabled);

  window.clearTimeout(slide.youtubeControlTimer);
  if (enabled) {
    slide.youtubeControlTimer = window.setTimeout(() => {
      slide.classList.remove("youtubeControlsEnabled");
      button.classList.remove("active");
      if (text) text.textContent = "Enable YouTube Controls";
    }, 20000);
  }
}

async function togglePostMusic(postId, button) {
  const post = memoryState.posts.find((item) => item.id === postId);
  const music = post?.music;
  const article = button.closest(".memoryPost");
  if (!music || !article) return;

  const audio = article.querySelector(".postMusicPlayer");
  if (!audio) return;

  const willPlay = music.muted !== false;
  if (!willPlay) {
    music.muted = true;
    audio.muted = true;
    audio.pause();
    updateMusicButton(button, false);
    return;
  }

  muteAllOtherMedia("", -1);
  button.disabled = true;
  button.classList.add("loading");
  const label = button.querySelector(".musicLabel");
  if (label) label.textContent = "Loading...";

  try {
    await preparePostMusic(post, article);
    music.muted = false;
    music.started = true;
    audio.muted = false;
    audio.volume = 1;
    try {
      await audio.play();
    } catch (playError) {
      const triedNextSource = music.kind === "drive-audio"
        ? prepareNextPostMusicSource(post, article)
        : false;

      if (!triedNextSource) {
        throw playError;
      }

      if (label) label.textContent = "Retrying...";
      audio.muted = false;
      audio.volume = 1;
      await audio.play();
    }
    updateMusicButton(button, true);
  } catch (error) {
    music.muted = true;
    music.started = false;
    updateMusicButton(button, false);
    showMemoryToast(error.message || "Unable to play this music file.");
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
    if (label) label.textContent = getMusicDisplayName(music);
  }
}

function updateMusicButton(button, audible) {
  button.classList.toggle("audible", audible);
  const sound = button.querySelector(".musicSound");
  if (sound) sound.innerHTML = audible ? "&#128266;" : "&#128263;";
  const post = memoryState.posts.find((item) => item.id === button.dataset.id);
  const musicName = getMusicDisplayName(post?.music);
  const label = button.querySelector(".musicLabel");
  if (label) label.textContent = musicName;
  button.title = musicName;
  button.setAttribute("aria-label", audible ? `Mute ${musicName}` : `Play ${musicName}`);
  updateMusicTitleMarquees();
}

function updateMusicTitleMarquees() {
  document.querySelectorAll(".musicToggleButton").forEach((button) => {
    const viewport = button.querySelector(".musicLabelViewport");
    const label = button.querySelector(".musicLabel");
    if (!viewport || !label) return;
    const distance = Math.max(0, label.scrollWidth - viewport.clientWidth + 14);
    button.style.setProperty("--music-marquee-distance", `${distance}px`);
    button.classList.toggle("isMarquee", distance > 14);
  });
}

async function preparePostMusic(post, article) {
  const music = post?.music;
  const audio = article?.querySelector(".postMusicPlayer");
  if (!music || !audio) throw new Error("Music player is unavailable.");

  if (music.kind !== "drive-audio") return;

  const directSources = getMusicDirectSources(music);

  if (music.objectUrl) {
    if (audio.src !== music.objectUrl) {
      audio.src = music.objectUrl;
      audio.load();
    }
    return;
  }

  if (music.fileId && !music.proxyFailed) {
    try {
      const proxyAudio = await fetchDriveAudioObjectUrl(music.fileId);
      music.objectUrl = proxyAudio.objectUrl;
      if (proxyAudio.name) music.name = proxyAudio.name;
      audio.preload = "auto";
      audio.src = music.objectUrl;
      audio.load();
      music.directPrepared = true;
      return;
    } catch (error) {
      music.proxyFailed = true;
    }
  }

  if (!directSources.length) {
    throw new Error("Music file is not available.");
  }

  if (music.directPrepared && audio.src) {
    return;
  }

  music.directSources = directSources;
  music.sourceIndex = 0;
  audio.preload = "auto";
  audio.src = directSources[0];
  audio.load();
  music.directPrepared = true;
}

function prepareNextPostMusicSource(post, article) {
  const music = post?.music;
  const audio = article?.querySelector(".postMusicPlayer");
  if (!music || !audio || music.kind !== "drive-audio") return false;

  const directSources = getMusicDirectSources(music);
  const currentIndex = Number.isFinite(music.sourceIndex) ? music.sourceIndex : 0;
  const nextIndex = currentIndex + 1;

  if (!directSources[nextIndex]) return false;

  music.directSources = directSources;
  music.sourceIndex = nextIndex;
  music.directPrepared = true;
  audio.preload = "auto";
  audio.src = directSources[nextIndex];
  audio.load();
  return true;
}

function toggleMediaVolume(postId, mediaIndex, button) {
  const post = memoryState.posts.find((item) => item.id === postId);
  const media = post?.media?.[mediaIndex];
  const article = button.closest(".memoryPost");
  if (!media || !article) return;

  const willUnmute = media.muted !== false;
  if (willUnmute) muteAllOtherMedia(postId, mediaIndex);
  media.muted = !willUnmute;

  const video = article.querySelector(`video[data-media-index="${mediaIndex}"]`);
  const iframe = article.querySelector(`iframe[data-media-index="${mediaIndex}"]`);

  if (video) {
    video.muted = media.muted;
    video.volume = 1;
    video.play().catch(() => {});
  }

  if (iframe?.dataset.youtube === "true") {
    sendYouTubeCommand(iframe, media.muted ? "mute" : "unMute");
    sendYouTubeCommand(iframe, "playVideo");
  }

  updateVolumeButton(button, media.muted);
}

function muteAllOtherMedia(activePostId, activeIndex) {
  memoryState.posts.forEach((post) => {
    post.media.forEach((media, index) => {
      if (post.id === activePostId && index === activeIndex) return;
      media.muted = true;
    });
    if (post.music) post.music.muted = true;
  });

  document.querySelectorAll(".feedVideo").forEach((video) => {
    video.muted = true;
  });

  document.querySelectorAll('.feedVideoFrame[data-youtube="true"]').forEach((iframe) => {
    sendYouTubeCommand(iframe, "mute");
  });

  document.querySelectorAll(".mediaVolumeButton").forEach((button) => {
    updateVolumeButton(button, true);
  });

  document.querySelectorAll(".postMusicPlayer").forEach((audio) => {
    audio.muted = true;
    audio.pause();
  });

  document.querySelectorAll('[data-music-youtube="true"]').forEach((iframe) => {
    sendYouTubeCommand(iframe, "mute");
    sendYouTubeCommand(iframe, "pauseVideo");
  });

  document.querySelectorAll(".musicToggleButton").forEach((button) => {
    updateMusicButton(button, false);
  });
}

function handlePageVisibilityChange() {
  if (document.hidden) pauseAllPageMedia();
}

function pauseAllPageMedia() {
  memoryState.posts.forEach((post) => {
    post.media.forEach((media) => {
      media.muted = true;
    });
    if (post.music) {
      post.music.muted = true;
      post.music.started = false;
    }
  });

  document.querySelectorAll(".feedVideo, .viewerVideo").forEach((video) => {
    video.muted = true;
    video.pause();
  });

  document.querySelectorAll(".postMusicPlayer").forEach((audio) => {
    audio.muted = true;
    audio.pause();
  });

  document.querySelectorAll('.feedVideoFrame[data-youtube="true"], .viewerVideoFrame[data-youtube="true"]').forEach((iframe) => {
    sendYouTubeCommand(iframe, "mute");
    sendYouTubeCommand(iframe, "pauseVideo");
  });

  document.querySelectorAll(".mediaVolumeButton").forEach((button) => {
    updateVolumeButton(button, true);
  });

  document.querySelectorAll(".musicToggleButton").forEach((button) => {
    updateMusicButton(button, false);
  });
}

function updateVolumeButton(button, muted) {
  button.classList.toggle("audible", !muted);
  button.innerHTML = muted ? "&#128263;" : "&#128266;";
  button.setAttribute("aria-label", muted ? "Turn on video sound" : "Mute video");
}

function sendYouTubeCommand(iframe, command) {
  iframe?.contentWindow?.postMessage(JSON.stringify({
    event: "command",
    func: command,
    args: []
  }), "*");
}

function observeFeedVideos() {
  feedVideoObserver?.disconnect();
  feedVideoObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const element = entry.target;
      const visible = entry.isIntersecting && entry.intersectionRatio >= .55;

      if (document.hidden) {
        if (element instanceof HTMLVideoElement) element.pause();
        else if (element.dataset.youtube === "true") sendYouTubeCommand(element, "pauseVideo");
        return;
      }

      if (element instanceof HTMLVideoElement) {
        if (visible) element.play().catch(() => {});
        else element.pause();
      } else if (element.dataset.youtube === "true") {
        sendYouTubeCommand(element, visible ? "playVideo" : "pauseVideo");
      }
    });
  }, { threshold: [0, .55, 1] });

  document.querySelectorAll(".feedVideo, .feedVideoFrame").forEach((element) => {
    feedVideoObserver.observe(element);
  });
}

function observePostMusic() {
  postMusicObserver?.disconnect();
  postMusicObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const article = entry.target;
      const post = memoryState.posts.find((item) => item.id === article.dataset.postId);
      const music = post?.music;
      const visible = entry.isIntersecting && entry.intersectionRatio >= .45;
      if (!music) return;

      if (document.hidden) {
        article.querySelector(".postMusicPlayer")?.pause();
        const iframe = article.querySelector('[data-music-youtube="true"]');
        if (iframe) sendYouTubeCommand(iframe, "pauseVideo");
        return;
      }

      if (visible && music.kind === "drive-audio" && !music.objectUrl) {
        preparePostMusic(post, article).catch(() => {});
      }

      if (!music.started || music.muted) return;

      const audio = article.querySelector(".postMusicPlayer");
      const iframe = article.querySelector('[data-music-youtube="true"]');

      if (audio) {
        if (visible) audio.play().catch(() => {});
        else audio.pause();
      }

      if (iframe) sendYouTubeCommand(iframe, visible ? "playVideo" : "pauseVideo");
    });
  }, { threshold: [0, .45, 1] });

  document.querySelectorAll('.memoryPost[data-has-music="true"]').forEach((article) => {
    postMusicObserver.observe(article);
  });
}

function handleFeedVideoError(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !video.dataset.drivePreview) return;

  const slide = video.closest(".videoSlide");
  if (!slide || slide.dataset.driveFallback === "true") return;
  slide.dataset.driveFallback = "true";

  const iframe = document.createElement("iframe");
  iframe.className = "feedVideoFrame";
  iframe.src = video.dataset.drivePreview;
  iframe.title = "Google Drive video";
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  video.replaceWith(iframe);

  const volumeButton = slide.querySelector(".mediaVolumeButton");
  if (volumeButton) volumeButton.hidden = true;
}

function handleEmbeddedMediaLoad(event) {
  const iframe = event.target;
  if (!(iframe instanceof HTMLIFrameElement) || iframe.dataset.musicYoutube !== "true") return;

  const post = memoryState.posts.find((item) => item.id === iframe.dataset.postId);
  if (document.hidden || !post?.music?.started || post.music.muted) return;
  sendYouTubeCommand(iframe, "unMute");
  sendYouTubeCommand(iframe, "playVideo");
}

function moveCarousel(id, direction) {
  const post = memoryState.posts.find((item) => item.id === id);
  if (!post || post.media.length < 2) return;

  const current = memoryState.carousel.get(id) || 0;
  const next = Math.max(0, Math.min(post.media.length - 1, current + direction));
  memoryState.carousel.set(id, next);
  updateCarouselElement(id, next, true);
}

function updateCarouselElement(id, index, animate) {
  const article = Array.from(document.querySelectorAll(".memoryPost"))
    .find((item) => item.dataset.postId === id);
  const post = memoryState.posts.find((item) => item.id === id);
  if (!article || !post) return;

  const track = article.querySelector(".mediaTrack");
  if (!track) return;

  track.style.transition = animate ? "transform .34s cubic-bezier(.22,.72,.2,1)" : "none";
  track.style.transform = `translateX(-${index * 100}%)`;

  const counter = article.querySelector(".mediaCounter");
  if (counter) counter.textContent = `${index + 1}/${post.media.length}`;

  article.querySelectorAll(".mediaDot").forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === index);
  });

  const previous = article.querySelector('[data-action="previous"]');
  const next = article.querySelector('[data-action="next"]');
  if (previous) previous.hidden = index === 0;
  if (next) next.hidden = index === post.media.length - 1;
  window.setTimeout(() => syncActiveCarouselPlayback(article, index), animate ? 180 : 0);
}

function syncActiveCarouselPlayback(article, activeIndex) {
  article.querySelectorAll(".mediaSlide").forEach((slide, index) => {
    const active = index === activeIndex;
    const video = slide.querySelector("video");
    const iframe = slide.querySelector('.feedVideoFrame[data-youtube="true"]');

    if (video) {
      if (active && !document.hidden) video.play().catch(() => {});
      else video.pause();
    }

    if (iframe) sendYouTubeCommand(iframe, active && !document.hidden ? "playVideo" : "pauseVideo");
  });
}

function startFeedSwipe(event) {
  const media = event.target.closest(".postMedia");
  const article = event.target.closest(".memoryPost");
  const touch = event.changedTouches?.[0];

  if (!media || !article || !touch || event.target.closest("iframe, button")) return;

  touchGesture = {
    scope: "feed",
    id: article.dataset.postId,
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now(),
    width: media.clientWidth,
    currentIndex: memoryState.carousel.get(article.dataset.postId) || 0,
    mediaCount: article.querySelectorAll(".mediaSlide").length,
    track: media.querySelector(".mediaTrack"),
    horizontal: false
  };
}

function moveFeedSwipe(event) {
  if (!touchGesture || touchGesture.scope !== "feed") return;
  const touch = event.changedTouches?.[0];
  if (!touch || !touchGesture.track) return;

  const deltaX = touch.clientX - touchGesture.x;
  const deltaY = touch.clientY - touchGesture.y;

  if (!touchGesture.horizontal) {
    if (Math.abs(deltaX) < 8) return;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    touchGesture.horizontal = true;
  }

  event.preventDefault();

  const atFirst = touchGesture.currentIndex === 0 && deltaX > 0;
  const atLast = touchGesture.currentIndex === touchGesture.mediaCount - 1 && deltaX < 0;
  const resistedX = atFirst || atLast ? deltaX * .22 : deltaX;

  touchGesture.track.style.transition = "none";
  touchGesture.track.style.transform = `translateX(calc(-${touchGesture.currentIndex * 100}% + ${resistedX}px))`;
}

function endFeedSwipe(event) {
  if (!touchGesture || touchGesture.scope !== "feed") return;
  const gesture = touchGesture;
  touchGesture = null;
  const touch = event.changedTouches?.[0];
  if (!touch) return;

  const deltaX = touch.clientX - gesture.x;
  const deltaY = touch.clientY - gesture.y;
  const elapsed = Math.max(1, Date.now() - gesture.time);
  const velocity = Math.abs(deltaX) / elapsed;
  const enoughDistance = Math.abs(deltaX) >= Math.min(85, gesture.width * .16);
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
  const direction = horizontal && (enoughDistance || (Math.abs(deltaX) > 28 && velocity > .38))
    ? (deltaX < 0 ? 1 : -1)
    : 0;
  const canMove = direction === 1
    ? gesture.currentIndex < gesture.mediaCount - 1
    : gesture.currentIndex > 0;

  if (gesture.horizontal) memoryState.suppressClickUntil = Date.now() + 450;

  if (direction && canMove) {
    moveCarousel(gesture.id, direction);
  } else {
    updateCarouselElement(gesture.id, gesture.currentIndex, true);
  }
}

function startViewerSwipe(event) {
  const touch = event.changedTouches?.[0];
  if (!touch || event.target.closest("video, iframe, button")) return;

  touchGesture = {
    scope: "viewer",
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now()
  };
}

function endViewerSwipe(event) {
  if (!touchGesture || touchGesture.scope !== "viewer") return;
  const gesture = touchGesture;
  touchGesture = null;
  const touch = event.changedTouches?.[0];
  if (!touch) return;

  const direction = getSwipeDirection(gesture, touch);
  if (direction) moveViewer(direction);
}

function getSwipeDirection(start, endTouch) {
  const deltaX = endTouch.clientX - start.x;
  const deltaY = endTouch.clientY - start.y;
  const elapsed = Date.now() - start.time;

  if (elapsed > 900 || Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
    return 0;
  }

  return deltaX < 0 ? 1 : -1;
}

async function heartMemory(id) {
  if (!id) return;

  const wasHearted = getHeartedMemoryIds().includes(id);
  const delta = wasHearted ? -1 : 1;
  if (wasHearted) {
    unsetHeartedMemory(id);
  } else {
    setHeartedMemory(id);
  }

  const post = memoryState.posts.find((item) => item.id === id);
  if (post) post.heartCount = Math.max(0, Number(post.heartCount || 0) + delta);
  updateMemoryHeartDisplay(id);

  try {
    const result = await postMemoryApi("memoryHeart", { MemoryID: id, delta });
    if (result.success && post) {
      post.heartCount = Math.max(0, Number(result.count) || 0);
      updateMemoryHeartDisplay(id);
    }
  } catch (error) {
    if (wasHearted) {
      setHeartedMemory(id);
    } else {
      unsetHeartedMemory(id);
    }
    if (post) post.heartCount = Math.max(0, Number(post.heartCount || 0) - delta);
    updateMemoryHeartDisplay(id);
    console.warn("Memory heart sync failed:", error);
    showMemoryToast("Heart update failed. Please try again.");
  }
}

function updateMemoryHeartDisplay(id) {
  const post = memoryState.posts.find((item) => item.id === id);
  const article = Array.from(document.querySelectorAll(".memoryPost"))
    .find((item) => item.dataset.postId === id);
  if (!post || !article) return;

  const hearted = getHeartedMemoryIds().includes(id);
  const button = article.querySelector('.heartButton[data-action="heart"]');
  const count = article.querySelector(".heartCount");

  if (button) {
    button.classList.toggle("hearted", hearted);
    button.innerHTML = hearted ? "&#9829;" : "&#9825;";
  }

  if (count) {
    count.textContent = formatHeartCount(post.heartCount);
  }

  updateMemoryStats();
}

function getHeartedMemoryIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(HEARTED_MEMORY_KEY) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch (error) {
    return [];
  }
}

function setHeartedMemory(id) {
  const ids = getHeartedMemoryIds();
  if (!ids.includes(id)) ids.push(id);
  localStorage.setItem(HEARTED_MEMORY_KEY, JSON.stringify(ids.slice(-500)));
}

function unsetHeartedMemory(id) {
  const ids = getHeartedMemoryIds().filter((item) => item !== id);
  localStorage.setItem(HEARTED_MEMORY_KEY, JSON.stringify(ids.slice(-500)));
}

async function shareMemory(id) {
  const post = memoryState.posts.find((item) => item.id === id);
  if (!post) return;

  const shareUrl = new URL("memories.html", window.location.href);
  shareUrl.searchParams.set("memory", id);
  const shareData = {
    title: `${post.title} | SFK Memories`,
    text: `${post.title} - ${post.caption}`.trim(),
    url: shareUrl.href
  };

  try {
    const mobileLike = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (navigator.share && mobileLike) {
      await navigator.share(shareData);
    } else {
      await copyMemoryLink(shareData.url);
      showMemoryToast("Memory link copied.");
    }
  } catch (error) {
    if (error.name !== "AbortError") showMemoryToast("Unable to share this memory.");
  }
}

async function copyMemoryLink(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy failed");
}

function scrollToRequestedMemory() {
  if (memoryState.requestedPostHandled) return;
  const requestedId = new URLSearchParams(window.location.search).get("memory");
  if (!requestedId) {
    memoryState.requestedPostHandled = true;
    return;
  }

  const article = Array.from(document.querySelectorAll(".memoryPost"))
    .find((item) => item.dataset.postId === requestedId);
  if (!article) return;

  memoryState.requestedPostHandled = true;
  article.classList.add("sharedMemoryFocus");
  article.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => article.classList.remove("sharedMemoryFocus"), 2200);
}

function openComposeModal() {
  document.getElementById("composeModal").hidden = false;
  document.body.style.overflow = "hidden";

  if (memoryState.auth) showMemoryForm();
  else showMemoryAuthStep();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

function showMemoryAuthStep() {
  document.getElementById("memoryAuthStep").hidden = false;
  document.getElementById("memoryForm").hidden = true;
  document.getElementById("authMessage").textContent = "";
  window.setTimeout(() => document.getElementById("memoryPin")?.focus(), 80);
}

function showMemoryForm() {
  document.getElementById("memoryAuthStep").hidden = true;
  document.getElementById("memoryForm").hidden = false;
  document.getElementById("postingRole").textContent = memoryState.auth?.role || "Officer";
  restoreRememberedPostedBy();
  renderComposePreview();
  window.setTimeout(() => document.getElementById("memoryTitle")?.focus(), 80);
}

async function testMusicLink() {
  const input = document.getElementById("memoryMusicUrl");
  const button = document.getElementById("testMusicLinkButton");
  const message = document.getElementById("musicTestMessage");
  const rawUrl = input?.value.trim() || "";

  if (!message || !button) return;

  message.className = "musicTestMessage";

  if (!rawUrl) {
    message.classList.add("bad");
    message.textContent = "Paste or choose a music link first.";
    return;
  }

  if (getYouTubeId(rawUrl)) {
    message.classList.add("bad");
    message.textContent = "YouTube is not a direct audio link. Use MP3/M4A or a release asset.";
    return;
  }

  const sources = getManualMusicSources(rawUrl);
  if (!sources.length) {
    message.classList.add("bad");
    message.textContent = "This is not a valid music URL.";
    return;
  }

  button.disabled = true;
  button.textContent = "Testing...";
  message.textContent = "Checking if this link can load as audio...";

  const driveId = getDriveFileId(rawUrl);
  if (driveId) {
    let objectUrl = "";
    try {
      message.textContent = "Checking Google Drive audio through the app...";
      const proxyAudio = await fetchDriveAudioObjectUrl(driveId);
      objectUrl = proxyAudio.objectUrl;
      await testAudioSource(objectUrl);
      message.className = "musicTestMessage ok";
      message.textContent = "Playable through app audio proxy. This Drive music should work.";
      renderComposePreview();
      button.disabled = false;
      button.textContent = "Test Music Link";
      return;
    } catch (error) {
      // Continue to the direct Drive URLs below.
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  for (let index = 0; index < sources.length; index++) {
    try {
      await testAudioSource(sources[index]);
      input.value = sources[index];
      message.className = "musicTestMessage ok";
      message.textContent = "Playable. This music link should work.";
      renderComposePreview();
      button.disabled = false;
      button.textContent = "Test Music Link";
      return;
    } catch (error) {
      if (index === sources.length - 1) {
        message.className = "musicTestMessage bad";
        message.textContent = error.message || "This music link is not playable.";
      }
    }
  }

  button.disabled = false;
  button.textContent = "Test Music Link";
}

async function unlockMemoryPosting() {
  const role = document.getElementById("memoryRole").value;
  const pin = document.getElementById("memoryPin").value.trim();
  const message = document.getElementById("authMessage");
  const button = document.getElementById("unlockPostingButton");

  if (!pin) {
    message.textContent = "Enter your PIN.";
    return;
  }

  button.disabled = true;
  message.textContent = "Checking access...";

  try {
    const result = await postMemoryApi("memoryAuth", { Role: role, Pin: pin });
    if (!result.success) {
      message.textContent = result.message || "Incorrect PIN.";
      return;
    }

    memoryState.auth = { role: result.role || role, pin };
    sessionStorage.setItem(MEMORY_AUTH_SESSION_KEY, JSON.stringify(memoryState.auth));
    document.getElementById("memoryPin").value = "";
    showMemoryForm();
    renderMemories();
  } catch (error) {
    message.textContent = "Could not verify access. Please try again.";
  } finally {
    button.disabled = false;
  }
}

function resetMemoryAuth() {
  memoryState.auth = null;
  sessionStorage.removeItem(MEMORY_AUTH_SESSION_KEY);
  showMemoryAuthStep();
  renderMemories();
}

function restoreMemoryAuth() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(MEMORY_AUTH_SESSION_KEY) || "null");
    if (!saved || !saved.role || !saved.pin) return;
    memoryState.auth = {
      role: saved.role === "Admin" ? "Admin" : "Officer",
      pin: String(saved.pin)
    };
  } catch (error) {
    sessionStorage.removeItem(MEMORY_AUTH_SESSION_KEY);
  }
}

function handleMemoryFiles(event) {
  const files = Array.from(event.target.files || []).slice(0, MAX_MEDIA_FILES);
  memoryState.selectedFiles = files;
  memoryState.coverIndex = 0;
  renderSelectedMediaPreview();
  renderComposePreview();

  if ((event.target.files || []).length > MAX_MEDIA_FILES) {
    showMemoryToast(`Only the first ${MAX_MEDIA_FILES} files will be uploaded.`);
  }
}

function renderSelectedMediaPreview() {
  const container = document.getElementById("mediaPreview");
  if (!container) return;

  if (memoryState.selectedFiles.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = memoryState.selectedFiles.map((file, index) => {
    const url = URL.createObjectURL(file);
    const preview = file.type.startsWith("video/")
      ? `<video src="${escapeAttr(url)}" muted></video>`
      : `<img src="${escapeAttr(url)}" alt="" />`;

    return `
      <div class="previewItem ${index === memoryState.coverIndex ? "isCover" : ""}" data-preview-index="${index}">
        ${preview}
        <span>${escapeHtml(file.name)}</span>
        <div class="previewControls">
          <button type="button" data-preview-action="cover" ${index === memoryState.coverIndex ? "disabled" : ""}>Cover</button>
          <button type="button" data-preview-action="left" ${index === 0 ? "disabled" : ""}>&#8592;</button>
          <button type="button" data-preview-action="right" ${index === memoryState.selectedFiles.length - 1 ? "disabled" : ""}>&#8594;</button>
          <button type="button" data-preview-action="remove">Remove</button>
        </div>
      </div>
    `;
  }).join("");
}

function handleMediaPreviewAction(event) {
  const button = event.target.closest("[data-preview-action]");
  const item = event.target.closest("[data-preview-index]");
  if (!button || !item) return;

  const index = Number(item.dataset.previewIndex);
  if (!Number.isInteger(index) || !memoryState.selectedFiles[index]) return;

  const action = button.dataset.previewAction;
  if (action === "cover") {
    moveSelectedFile(index, 0);
    memoryState.coverIndex = 0;
  } else if (action === "left") {
    moveSelectedFile(index, index - 1);
  } else if (action === "right") {
    moveSelectedFile(index, index + 1);
  } else if (action === "remove") {
    memoryState.selectedFiles.splice(index, 1);
    memoryState.coverIndex = Math.min(memoryState.coverIndex, Math.max(0, memoryState.selectedFiles.length - 1));
  }

  syncMemoryFileInput();
  renderSelectedMediaPreview();
  renderComposePreview();
}

function moveSelectedFile(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= memoryState.selectedFiles.length || fromIndex === toIndex) return;

  const [file] = memoryState.selectedFiles.splice(fromIndex, 1);
  memoryState.selectedFiles.splice(toIndex, 0, file);

  if (memoryState.coverIndex === fromIndex) {
    memoryState.coverIndex = toIndex;
  } else if (fromIndex < memoryState.coverIndex && toIndex >= memoryState.coverIndex) {
    memoryState.coverIndex -= 1;
  } else if (fromIndex > memoryState.coverIndex && toIndex <= memoryState.coverIndex) {
    memoryState.coverIndex += 1;
  }
}

function syncMemoryFileInput() {
  const input = document.getElementById("memoryFiles");
  if (!input || typeof DataTransfer === "undefined") return;

  const transfer = new DataTransfer();
  memoryState.selectedFiles.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
}

function renderComposePreview() {
  const container = document.getElementById("composePreview");
  if (!container) return;

  const title = document.getElementById("memoryTitle")?.value.trim() || "Untitled Memory";
  const caption = document.getElementById("memoryCaption")?.value.trim() || "";
  const postedBy = document.getElementById("memoryPostedBy")?.value.trim() || "SFK";
  const date = document.getElementById("memoryDate")?.value || "";
  const videoUrl = document.getElementById("memoryVideoUrl")?.value.trim() || "";
  const musicUrl = document.getElementById("memoryMusicUrl")?.value.trim() || "";
  const firstFile = memoryState.selectedFiles[0] || null;

  let mediaPreview = `<div class="composePreviewMedia textOnly"><span>SFK Memory</span></div>`;
  if (firstFile) {
    const url = URL.createObjectURL(firstFile);
    mediaPreview = firstFile.type.startsWith("video/")
      ? `<video class="composePreviewMedia" src="${escapeAttr(url)}" muted></video>`
      : `<img class="composePreviewMedia" src="${escapeAttr(url)}" alt="" />`;
  } else if (videoUrl) {
    mediaPreview = `<div class="composePreviewMedia linked"><span>Linked video</span></div>`;
  }

  const musicLabel = musicUrl ? "Linked background music" : "";

  container.innerHTML = `
    <div class="composePreviewTitle">
      <strong>Post preview</strong>
      <small>${memoryState.selectedFiles.length > 1 ? "Cover is the first item below." : "Preview before posting."}</small>
    </div>
    <article class="composePreviewCard">
      <header><span class="postAvatar">${escapeHtml(getInitials(postedBy))}</span><div><strong>${escapeHtml(postedBy)}</strong><small>${escapeHtml(memoryState.auth?.role || "Officer")}</small></div></header>
      ${mediaPreview}
      <div class="composePreviewDetails">
        <strong>${escapeHtml(title)}</strong>
        ${caption ? `<p>${escapeHtml(caption)}</p>` : ""}
        <time>${escapeHtml(formatPreviewDate(date))}</time>
        ${musicLabel ? `<span class="composePreviewMusic">&#9835; ${escapeHtml(musicLabel)}</span>` : ""}
      </div>
    </article>
  `;
}

function formatPreviewDate(value) {
  if (!value) return "SFK Memory";
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date)) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function restoreRememberedPostedBy() {
  const input = document.getElementById("memoryPostedBy");
  if (!input || input.value.trim()) return;

  const saved = localStorage.getItem(MEMORY_POSTED_BY_KEY);
  if (saved) input.value = saved;
}

function rememberPostedBy(value) {
  const cleanValue = String(value || "").trim();
  if (cleanValue) localStorage.setItem(MEMORY_POSTED_BY_KEY, cleanValue);
}

async function submitMemoryPost(event) {
  event.preventDefault();
  if (!memoryState.auth) {
    showMemoryAuthStep();
    return;
  }

  const videoUrl = document.getElementById("memoryVideoUrl").value.trim();
  const musicUrl = document.getElementById("memoryMusicUrl").value.trim();
  const title = document.getElementById("memoryTitle").value.trim();
  const caption = document.getElementById("memoryCaption").value.trim();
  const message = document.getElementById("postMessage");
  const button = document.getElementById("publishMemoryButton");
  const hasAttachment = memoryState.selectedFiles.length > 0 || Boolean(videoUrl) || Boolean(musicUrl);
  const hasText = Boolean(title || caption);

  if (!hasAttachment && !hasText) {
    message.textContent = "Write a title or caption, or add an attachment.";
    return;
  }

  button.disabled = true;
  button.textContent = "Preparing...";
  message.textContent = "Optimizing and preparing your media...";

  try {
    if (musicUrl && getYouTubeId(musicUrl)) {
      throw new Error("YouTube cannot be used as hidden background music. Use a direct/public Drive audio file link or Internet Archive direct file link.");
    }

    const mediaFiles = [];
    let uploadBytes = 0;

    for (const file of memoryState.selectedFiles) {
      if (file.type.startsWith("video/") && file.size > MAX_VIDEO_BYTES) {
        throw new Error(`${file.name} is too large for Firebase direct upload. Use a Drive or YouTube link for videos.`);
      }

      const prepared = await prepareMediaFile(file);
      uploadBytes += Math.ceil(prepared.data.length * .75);
      if (uploadBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new Error("The selected media is too large for one post. Use fewer files or use a Drive/YouTube link for videos.");
      }
      mediaFiles.push(prepared);
    }

    button.textContent = "Sharing...";
    message.textContent = "Sharing this memory with SFK...";

    const payload = {
      Role: memoryState.auth.role,
      Pin: memoryState.auth.pin,
      Title: title,
      Date: document.getElementById("memoryDate").value,
      PostedBy: document.getElementById("memoryPostedBy").value.trim(),
      Caption: caption,
      VideoURL: videoUrl,
      MediaFiles: mediaFiles,
      MusicURL: musicUrl
    };

    const result = await postMemoryApi("memoryCreate", payload);
    if (!result.success) throw new Error(result.message || "Memory could not be posted.");

    rememberPostedBy(payload.PostedBy);
    resetMemoryForm();
    closeModal("composeModal");
    showMemoryToast("Memory shared successfully.");
    await loadMemories();
  } catch (error) {
    message.textContent = error.message || "Unable to post this memory.";
  } finally {
    button.disabled = false;
    button.textContent = "Share Memory";
  }
}

async function prepareMediaFile(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return fileToPayload(file);
  }

  const imageUrl = await readFileAsDataUrl(file);
  const image = await loadImage(imageUrl);
  const blob = await compressImageForFirestore(image);
  if (!blob) return fileToPayload(file);

  const dataUrl = await readFileAsDataUrl(blob);
  return {
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    mimeType: "image/jpeg",
    data: dataUrl.split(",")[1]
  };
}

async function compressImageForFirestore(image) {
  const dimensions = [1100, 900, 760, 640];
  const qualities = [.7, .62, .54, .46, .38];
  let bestBlob = null;

  for (const maxDimension of dimensions) {
    const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) continue;

      bestBlob = blob;
      if (blob.size <= TARGET_IMAGE_BYTES) return blob;
    }
  }

  return bestBlob;
}

async function fileToPayload(file) {
  const dataUrl = await readFileAsDataUrl(file);
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: dataUrl.split(",")[1]
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read selected media."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to prepare one of the photos."));
    image.src = src;
  });
}

function resetMemoryForm() {
  document.getElementById("memoryForm")?.reset();
  memoryState.selectedFiles = [];
  memoryState.coverIndex = 0;
  document.getElementById("mediaPreview").innerHTML = "";
  document.getElementById("postMessage").textContent = "";
  setDefaultMemoryDate();
  restoreRememberedPostedBy();
  renderComposePreview();
}

function openManageActions(id) {
  if (!memoryState.auth) return;

  const post = memoryState.posts.find((item) => item.id === id);
  if (!post) return;

  const layer = document.createElement("div");
  layer.className = "modalLayer manageLayer";
  layer.innerHTML = `
    <div class="modalBackdrop" data-manage-close></div>
    <section class="manageSheet" role="dialog" aria-modal="true" aria-label="Manage memory">
      <div class="managePreview"><span class="miniBrandMark">SFK</span><div><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(post.date)}</small></div></div>
      <button type="button" data-manage-action="edit">Edit details</button>
      <button type="button" data-manage-action="hide">Hide from Memories</button>
      ${memoryState.auth.role === "Admin" ? `<button class="dangerAction" type="button" data-manage-action="delete">Delete permanently</button>` : ""}
      <button type="button" data-manage-close>Cancel</button>
    </section>
  `;

  layer.addEventListener("click", async (event) => {
    if (event.target.closest("[data-manage-close]")) {
      layer.remove();
      return;
    }

    const actionButton = event.target.closest("[data-manage-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.manageAction;
    if (action === "edit") {
      renderEditMemoryForm(layer, post);
      return;
    }

    if (action !== "hide" && action !== "delete") return;

    const label = action === "delete" ? "permanently delete" : "hide";
    if (!window.confirm(`Do you want to ${label} this memory?`)) return;

    actionButton.disabled = true;
    try {
      const result = await postMemoryApi(action === "delete" ? "memoryDelete" : "memoryHide", {
        MemoryID: id,
        Role: memoryState.auth.role,
        Pin: memoryState.auth.pin
      });
      if (!result.success) throw new Error(result.message || "Action failed.");
      layer.remove();
      showMemoryToast(result.message || "Memory updated.");
      await loadMemories();
    } catch (error) {
      showMemoryToast(error.message || "Unable to update memory.");
      actionButton.disabled = false;
    }
  });

  document.body.appendChild(layer);
}

function renderEditMemoryForm(layer, post) {
  const videoUrl = post.videoUrl || "";

  layer.innerHTML = `
    <div class="modalBackdrop" data-manage-close></div>
    <section class="manageSheet editMemorySheet" role="dialog" aria-modal="true" aria-label="Edit memory">
      <div class="managePreview"><span class="miniBrandMark">SFK</span><div><strong>Edit memory</strong><small>${escapeHtml(post.id)}</small></div></div>
      <label>Memory title
        <input id="editMemoryTitle" type="text" maxlength="80" value="${escapeAttr(post.title || "")}" />
      </label>
      <label>Event date
        <input id="editMemoryDate" type="date" value="${escapeAttr(toDateInputValue(post.date))}" />
      </label>
      <label>Posted by
        <input id="editMemoryPostedBy" type="text" maxlength="60" value="${escapeAttr(post.postedBy || "")}" />
      </label>
      <label>Caption and details
        <textarea id="editMemoryCaption" rows="4" maxlength="1200">${escapeHtml(post.caption || "")}</textarea>
      </label>
      <label>Video link
        <input id="editMemoryVideoUrl" type="url" value="${escapeAttr(videoUrl)}" />
        <small class="fieldHint">This edits the linked video only. Uploaded photos/videos stay as-is.</small>
      </label>
      <p id="editMemoryMessage" class="formMessage" aria-live="polite"></p>
      <div class="manageActionsRow">
        <button class="secondaryButton" type="button" data-manage-action="back">Back</button>
        <button class="primaryButton" type="button" data-manage-action="save-edit">Save changes</button>
      </div>
    </section>
  `;

  layer.onclick = async (event) => {
    if (event.target.closest("[data-manage-close]")) {
      layer.remove();
      return;
    }

    const actionButton = event.target.closest("[data-manage-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.manageAction;
    if (action === "back") {
      layer.remove();
      openManageActions(post.id);
      return;
    }

    if (action !== "save-edit") return;

    const title = document.getElementById("editMemoryTitle").value.trim();
    const caption = document.getElementById("editMemoryCaption").value.trim();
    const postedBy = document.getElementById("editMemoryPostedBy").value.trim();
    const date = document.getElementById("editMemoryDate").value;
    const videoUrlValue = document.getElementById("editMemoryVideoUrl").value.trim();
    const message = document.getElementById("editMemoryMessage");

    if (!postedBy) {
      message.textContent = "Posted by is required.";
      return;
    }

    if (!title && !caption && !videoUrlValue && post.media.length === 0 && !post.music) {
      message.textContent = "Write a title or caption, or keep an attachment.";
      return;
    }

    actionButton.disabled = true;
    message.textContent = "Saving changes...";

    try {
      const result = await postMemoryApi("memoryUpdate", {
        MemoryID: post.id,
        Role: memoryState.auth.role,
        Pin: memoryState.auth.pin,
        Title: title,
        Date: date,
        PostedBy: postedBy,
        Caption: caption,
        VideoURL: videoUrlValue
      });

      if (!result.success) throw new Error(result.message || "Memory could not be updated.");
      layer.remove();
      showMemoryToast(result.message || "Memory updated.");
      await loadMemories();
    } catch (error) {
      message.textContent = error.message || "Unable to update memory.";
      actionButton.disabled = false;
    }
  };
}

function openPostViewer(id, index) {
  const post = memoryState.posts.find((item) => item.id === id);
  if (!post || post.media.length === 0) return;
  memoryState.viewerMedia = post.media;
  memoryState.viewerIndex = Math.min(Math.max(0, index), post.media.length - 1);
  document.getElementById("viewerModal").hidden = false;
  document.body.style.overflow = "hidden";
  renderViewer();
}

function renderViewer() {
  const media = memoryState.viewerMedia[memoryState.viewerIndex];
  const content = document.getElementById("viewerContent");
  if (!media || !content) return;

  if (media.kind === "image") {
    content.innerHTML = `<img src="${escapeAttr(media.viewerUrl || media.url)}" alt="${escapeAttr(media.name)}" />`;
  } else if (media.kind === "direct-video" || media.kind === "drive-video") {
    const source = media.kind === "drive-video" ? (media.streamUrl || media.url) : media.url;
    content.innerHTML = `
      <video class="viewerVideo" src="${escapeAttr(source)}" autoplay ${media.muted === false ? "" : "muted"} loop playsinline ${media.kind === "drive-video" ? `data-viewer-drive-preview="${escapeAttr(media.url)}"` : ""}></video>
      ${renderViewerVolumeButton(media)}
    `;
  } else {
    const youtubeId = getYouTubeId(media.fullUrl || media.url);
    const source = youtubeId ? getYouTubeEmbedUrl(youtubeId, media.muted !== false) : media.url;
    content.innerHTML = `
      <iframe class="viewerVideoFrame" src="${escapeAttr(source)}" title="${escapeAttr(media.name)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen data-youtube="${youtubeId ? "true" : "false"}"></iframe>
    `;
  }

  const driveVideo = content.querySelector("video[data-viewer-drive-preview]");
  driveVideo?.addEventListener("error", () => {
    content.innerHTML = `<iframe class="viewerVideoFrame" src="${escapeAttr(driveVideo.dataset.viewerDrivePreview)}" title="Google Drive video" allow="fullscreen" allowfullscreen></iframe>`;
  }, { once: true });

  const multiple = memoryState.viewerMedia.length > 1;
  document.getElementById("viewerPrevious").hidden = !multiple;
  document.getElementById("viewerNext").hidden = !multiple;
  document.getElementById("viewerCounter").textContent = `${memoryState.viewerIndex + 1} / ${memoryState.viewerMedia.length}`;
}

function renderViewerVolumeButton(media) {
  const audible = media.muted === false;
  return `<button class="mediaVolumeButton viewerVolumeButton ${audible ? "audible" : ""}" type="button" data-viewer-volume aria-label="${audible ? "Mute video" : "Turn on video sound"}">${audible ? "&#128266;" : "&#128263;"}</button>`;
}

function handleViewerClick(event) {
  const button = event.target.closest("[data-viewer-volume]");
  if (!button) return;

  const media = memoryState.viewerMedia[memoryState.viewerIndex];
  if (!media) return;

  const willUnmute = media.muted !== false;
  if (willUnmute) muteAllOtherMedia("", -1);
  media.muted = !willUnmute;

  const content = document.getElementById("viewerContent");
  const video = content?.querySelector("video");
  const iframe = content?.querySelector('iframe[data-youtube="true"]');

  if (video) {
    video.muted = media.muted;
    video.volume = 1;
    video.play().catch(() => {});
  }

  if (iframe) {
    sendYouTubeCommand(iframe, media.muted ? "mute" : "unMute");
    sendYouTubeCommand(iframe, "playVideo");
  }

  updateVolumeButton(button, media.muted);
}

function moveViewer(direction) {
  if (memoryState.viewerMedia.length < 2) return;
  memoryState.viewerIndex = (memoryState.viewerIndex + direction + memoryState.viewerMedia.length) % memoryState.viewerMedia.length;
  renderViewer();

  const content = document.getElementById("viewerContent");
  if (!content) return;
  content.classList.remove("viewerEnterNext", "viewerEnterPrevious");
  void content.offsetWidth;
  content.classList.add(direction > 0 ? "viewerEnterNext" : "viewerEnterPrevious");
}

function closeViewer() {
  const viewer = document.getElementById("viewerModal");
  if (!viewer || viewer.hidden) return;
  viewer.hidden = true;
  document.getElementById("viewerContent").innerHTML = "";
  document.body.style.overflow = "";
}

function setMemoryFilter(filter) {
  memoryState.filter = ["photos", "videos"].includes(filter) ? filter : "all";
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === memoryState.filter);
  });
  renderMemories();
}

function updateMemoryStats() {
  const posts = memoryState.posts.length;
  const photos = memoryState.posts.reduce((total, post) => total + post.media.filter((item) => item.kind === "image").length, 0);
  const videos = memoryState.posts.reduce((total, post) => total + post.media.filter((item) => item.kind !== "image").length, 0);

  setText("postCount", posts);
  setText("mobilePostCount", posts);
  setText("photoCount", photos);
  setText("videoCount", videos);
}

function setDefaultMemoryDate() {
  const input = document.getElementById("memoryDate");
  if (!input || input.value) return;
  input.value = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function toDateInputValue(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!isNaN(parsed)) {
    return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  }

  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function setFeedStatus(message) {
  const status = document.getElementById("feedStatus");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function formatHeartCount(value) {
  const count = Math.max(0, Number(value) || 0);
  return count === 1 ? "1 heart" : `${count.toLocaleString()} hearts`;
}

function getInitials(value) {
  const parts = String(value || "SFK").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SFK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function postMemoryApi(type, payload) {
  const response = await fetch(MEMORIES_API_URL, {
    method: "POST",
    body: JSON.stringify({ type, payload })
  });
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(text.slice(0, 160) || "Invalid server response.");
  }
}

let toastTimer = null;
function showMemoryToast(message) {
  const toast = document.getElementById("memoryToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
