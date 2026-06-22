const MEMORIES_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";
const MEMORY_CACHE_KEY = "sfkMemoriesCacheV1";
const HEARTED_MEMORY_KEY = "sfkHeartedMemoriesV1";
const MAX_MEDIA_FILES = 6;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_PAYLOAD_BYTES = 20 * 1024 * 1024;

const memoryState = {
  posts: [],
  filter: "all",
  carousel: new Map(),
  auth: null,
  selectedFiles: [],
  viewerMedia: [],
  viewerIndex: 0,
  requestedPostHandled: false,
  suppressClickUntil: 0
};

let touchGesture = null;

document.addEventListener("DOMContentLoaded", () => {
  setDefaultMemoryDate();
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
  document.getElementById("memoryForm")?.addEventListener("submit", submitMemoryPost);
  const feed = document.getElementById("memoryFeed");
  feed?.addEventListener("click", handleFeedClick);
  feed?.addEventListener("touchstart", startFeedSwipe, { passive: true });
  feed?.addEventListener("touchmove", moveFeedSwipe, { passive: false });
  feed?.addEventListener("touchend", endFeedSwipe, { passive: true });
  document.getElementById("closeViewerButton")?.addEventListener("click", closeViewer);
  document.getElementById("viewerPrevious")?.addEventListener("click", () => moveViewer(-1));
  document.getElementById("viewerNext")?.addEventListener("click", () => moveViewer(1));
  document.getElementById("viewerModal")?.addEventListener("touchstart", startViewerSwipe, { passive: true });
  document.getElementById("viewerModal")?.addEventListener("touchend", endViewerSwipe, { passive: true });

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
    renderMemories();
  } catch (error) {
    console.error("Memories load failed:", error);
    if (memoryState.posts.length === 0) {
      setFeedStatus("Memories will appear after the updated Apps Script is deployed.");
    }
  }
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
  const linkedVideo = normalizeExternalMedia(raw.VideoURL || raw.videoUrl || "");
  if (linkedVideo) media.push(linkedVideo);

  return {
    id: String(raw.ID || raw.Id || raw.id || "").trim(),
    date: String(raw.Date || "").trim(),
    title: String(raw.Title || "Untitled Memory").trim(),
    caption: String(raw.Caption || "").trim(),
    postedBy: String(raw.PostedBy || "SFK").trim(),
    role: String(raw.Role || "Officer").trim(),
    heartCount: Math.max(0, Number(raw.HeartCount || 0)),
    createdAt: String(raw.CreatedAt || "").trim(),
    media
  };
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
    ratio: Number(item.ratio) > 0 ? Number(item.ratio) : 0
  };
}

function normalizeExternalMedia(value) {
  const url = safeHttpUrl(value);
  if (!url) return null;

  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return {
      kind: "embed-video",
      url: `https://www.youtube.com/embed/${youtubeId}`,
      fullUrl: url,
      name: "YouTube video"
    };
  }

  const driveId = getDriveFileId(url);
  if (driveId) {
    return {
      kind: "drive-video",
      url: `https://drive.google.com/file/d/${driveId}/preview`,
      fullUrl: url,
      name: "Google Drive video"
    };
  }

  if (/\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url)) {
    return { kind: "direct-video", url, fullUrl: url, name: "Video" };
  }

  return { kind: "embed-video", url, fullUrl: url, name: "Linked video" };
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
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (error) {
    return "";
  }
}

function renderMemories() {
  const feed = document.getElementById("memoryFeed");
  const empty = document.getElementById("emptyMemories");
  if (!feed || !empty) return;

  updateMemoryStats();
  const filtered = getFilteredPosts();
  setFeedStatus("");
  empty.hidden = filtered.length !== 0;
  feed.innerHTML = filtered.map(renderMemoryPost).join("");
  window.requestAnimationFrame(() => {
    scrollToRequestedMemory();
  });
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
    <article class="memoryPost" data-post-id="${escapeAttr(post.id)}">
      <header class="postHeader">
        <div class="postAvatar">${avatar}</div>
        <div class="postIdentity">
          <strong>${escapeHtml(post.postedBy)}</strong>
          <small><span class="postRole">${escapeHtml(post.role)}</span> &middot; ${escapeHtml(post.date || "SFK 2026-2027")}</small>
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
    return `<div class="postMedia"><div class="mediaSlide"><span style="color:#ffd700;font-weight:900">SFK Memory</span></div></div>`;
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

  if (media.kind === "direct-video") {
    return `<div class="mediaSlide"><video src="${escapeAttr(media.url)}" controls playsinline preload="metadata"></video></div>`;
  }

  return `<div class="mediaSlide"><iframe src="${escapeAttr(media.url)}" title="${escapeAttr(media.name)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
}

function handleFeedClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === "view" && Date.now() < memoryState.suppressClickUntil) return;

  if (action === "previous") moveCarousel(id, -1);
  if (action === "next") moveCarousel(id, 1);
  if (action === "heart") heartMemory(id);
  if (action === "share") shareMemory(id);
  if (action === "manage") openManageActions(id);
  if (action === "view") openPostViewer(id, Number(target.dataset.index) || 0);
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
}

function startFeedSwipe(event) {
  const media = event.target.closest(".postMedia");
  const article = event.target.closest(".memoryPost");
  const touch = event.changedTouches?.[0];

  if (!media || !article || !touch || event.target.closest("video, iframe, button")) return;

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
  if (!id || getHeartedMemoryIds().includes(id)) return;

  setHeartedMemory(id);
  const post = memoryState.posts.find((item) => item.id === id);
  if (post) post.heartCount += 1;
  renderMemories();

  try {
    const result = await postMemoryApi("memoryHeart", { MemoryID: id });
    if (result.success && post) {
      post.heartCount = Number(result.count) || post.heartCount;
      renderMemories();
    }
  } catch (error) {
    console.warn("Memory heart sync failed:", error);
  }
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
  window.setTimeout(() => document.getElementById("memoryTitle")?.focus(), 80);
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
  showMemoryAuthStep();
  renderMemories();
}

function handleMemoryFiles(event) {
  const files = Array.from(event.target.files || []).slice(0, MAX_MEDIA_FILES);
  memoryState.selectedFiles = files;
  renderSelectedMediaPreview();

  if ((event.target.files || []).length > MAX_MEDIA_FILES) {
    showMemoryToast(`Only the first ${MAX_MEDIA_FILES} files will be uploaded.`);
  }
}

function renderSelectedMediaPreview() {
  const container = document.getElementById("mediaPreview");
  if (!container) return;

  container.innerHTML = memoryState.selectedFiles.map((file) => {
    const url = URL.createObjectURL(file);
    const preview = file.type.startsWith("video/")
      ? `<video src="${escapeAttr(url)}" muted></video>`
      : `<img src="${escapeAttr(url)}" alt="" />`;

    return `<div class="previewItem">${preview}<span>${escapeHtml(file.name)}</span></div>`;
  }).join("");
}

async function submitMemoryPost(event) {
  event.preventDefault();
  if (!memoryState.auth) {
    showMemoryAuthStep();
    return;
  }

  const videoUrl = document.getElementById("memoryVideoUrl").value.trim();
  const message = document.getElementById("postMessage");
  const button = document.getElementById("publishMemoryButton");

  if (memoryState.selectedFiles.length === 0 && !videoUrl) {
    message.textContent = "Add at least one photo, short video, or video link.";
    return;
  }

  button.disabled = true;
  button.textContent = "Preparing...";
  message.textContent = "Optimizing and preparing your media...";

  try {
    const mediaFiles = [];
    let payloadBytes = 0;

    for (const file of memoryState.selectedFiles) {
      if (file.type.startsWith("video/") && file.size > MAX_VIDEO_BYTES) {
        throw new Error(`${file.name} is too large. Use a Drive or YouTube link for large videos.`);
      }

      const prepared = await prepareMediaFile(file);
      payloadBytes += Math.ceil(prepared.data.length * .75);
      if (payloadBytes > MAX_TOTAL_PAYLOAD_BYTES) {
        throw new Error("The selected media is too large for one post. Upload fewer files or use a video link.");
      }
      mediaFiles.push(prepared);
    }

    button.textContent = "Sharing...";
    message.textContent = "Sharing this memory with SFK...";

    const payload = {
      Role: memoryState.auth.role,
      Pin: memoryState.auth.pin,
      Title: document.getElementById("memoryTitle").value.trim(),
      Date: document.getElementById("memoryDate").value,
      PostedBy: document.getElementById("memoryPostedBy").value.trim(),
      Caption: document.getElementById("memoryCaption").value.trim(),
      VideoURL: videoUrl,
      MediaFiles: mediaFiles
    };

    const result = await postMemoryApi("memoryCreate", payload);
    if (!result.success) throw new Error(result.message || "Memory could not be posted.");

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
  const maxDimension = 1800;
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .84));
  if (!blob) return fileToPayload(file);

  const dataUrl = await readFileAsDataUrl(blob);
  return {
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    mimeType: "image/jpeg",
    data: dataUrl.split(",")[1]
  };
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
  document.getElementById("mediaPreview").innerHTML = "";
  document.getElementById("postMessage").textContent = "";
  setDefaultMemoryDate();
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
  } else if (media.kind === "direct-video") {
    content.innerHTML = `<video src="${escapeAttr(media.url)}" controls autoplay playsinline></video>`;
  } else {
    content.innerHTML = `<iframe src="${escapeAttr(media.url)}" title="${escapeAttr(media.name)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }

  const multiple = memoryState.viewerMedia.length > 1;
  document.getElementById("viewerPrevious").hidden = !multiple;
  document.getElementById("viewerNext").hidden = !multiple;
  document.getElementById("viewerCounter").textContent = `${memoryState.viewerIndex + 1} / ${memoryState.viewerMedia.length}`;
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
