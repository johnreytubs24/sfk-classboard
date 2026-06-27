const API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const DATA_REFRESH_MS = 5000;
const ANNOUNCEMENT_ROTATE_MS = 10000;
const BIRTHDAY_ROTATE_MS = 30000;
const CACHE_KEY = "sfkClassBoardData";
const ANNOUNCEMENT_HEARTS_KEY = "sfkClassBoardHeartedAnnouncements";
const MEMORIES_SEEN_IDS_KEY = "sfkMemoriesSeenPostIdsV1";
const IS_PHONE_DEVICE =
  navigator.userAgentData?.mobile === true ||
  /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

if (IS_PHONE_DEVICE) {
  document.documentElement.classList.add("phone-device");
}

/* PRAYER AUDIO PLAYER SYSTEM
   No autoplay / no bell.
   Prayer popup appears at scheduled/test time with a manual audio player.
*/
const PRAYER_TEST_TRIGGER_ENABLED = true;
const PRAYER_TEST_HOUR = "00";
const PRAYER_TEST_MINUTE = "20";

let latestData = null;
let latestDataString = "";
let announcementIndex = 0;
let announcementRotateTimer = null;
let announcementRotationCount = 0;
let announcementRotationVersion = 0;
let announcementRotationPaused = false;
let announcementRemainingMs = ANNOUNCEMENT_ROTATE_MS;
let birthdayIndex = 0;
let isFetching = false;
let lastBirthdayDisplayKey = "";
let weeklyScheduleData = [];
let weeklyDailyInfoData = [];
let activeWeeklyDay = "Monday";
let lastPrayerTriggerKey = "";
let lastScheduleAutoScrollKey = "";
let isTodayScheduleOpen = false;

const subjectIcons = {
  english: "📘",
  math: "🧮",
  mathematics: "🧮",
  science: "🔬",
  ict: "💻",
  filipino: "📖",
  filipno: "📖",
  mapeh: "🎵",
  music: "🎵",
  arts: "🎨",
  pe: "⚽",
  health: "❤️",
  ap: "🌏",
  araling: "🌏",
  cled: "🙏",
  christian: "🙏",
  religion: "🙏",
  le: "🍳",
  homeroom: "🏠",
  assembly: "📣",
  mass: "⛪",
  break: "🍽️",
  recess: "🍽️",
  lunch: "🍱"
};

function initClassBoard() {
  ensureAnnouncementTimerControl();

  const audioOverlay = document.getElementById("audioStartOverlay");
  if (audioOverlay) {
    audioOverlay.classList.remove("hidden");
  }

  startLiveClock();
  renderCleanersToday();

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const cachedData = JSON.parse(cached);
      latestData = cachedData;
      latestDataString = cached;
      renderDashboard(cachedData);
    } catch (e) {
      console.warn("Cache error", e);
    }
  }

  loadClassBoard();
  loadMemoriesUnreadBadge();

  setInterval(loadClassBoard, DATA_REFRESH_MS);
  setInterval(loadMemoriesUnreadBadge, 60000);
  setInterval(rotateBirthdays, BIRTHDAY_ROTATE_MS);
  window.addEventListener("resize", fitAnnouncementTextToCard);
  setInterval(renderCleanersToday, 60000);

  setTimeout(() => {
    startAutoScroll("thingsList");
    startAutoScroll("reminderList");
  }, 1500);

  syncTodayScheduleToggle();
  window.addEventListener("resize", syncTodayScheduleToggle);
}

function ensureAnnouncementTimerControl() {
  const card = document.querySelector(".announcementsCard");
  const title = document.getElementById("announcementTitle");
  const list = document.getElementById("announcementList");
  if (!card || !title || !list) return;

  let heading = title.closest(".announcementHeading");
  if (!heading) {
    heading = document.createElement("div");
    heading.className = "announcementHeading";
    card.insertBefore(heading, title);
    heading.appendChild(title);
  }

  let button = document.getElementById("announcementTimerToggle");
  if (!button) {
    button = document.createElement("button");
    button.id = "announcementTimerToggle";
    button.className = "announcementTimerToggle";
    button.type = "button";
    button.innerHTML = "&#10074;&#10074;";
    button.addEventListener("click", toggleAnnouncementRotation);
    heading.appendChild(button);
  }

  if (!document.getElementById("announcementProgress")) {
    const progress = document.createElement("div");
    progress.id = "announcementProgress";
    progress.className = "announcementProgress";
    progress.setAttribute("aria-hidden", "true");
    progress.innerHTML = `<span id="announcementProgressFill"></span>`;
    card.insertBefore(progress, list);
  }

  updateAnnouncementTimerButton();
}

async function loadClassBoard() {
  if (isFetching) return;

  isFetching = true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(`${API_URL}?type=today`, {
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await response.json();
    const newDataString = JSON.stringify(data);

    localStorage.setItem(CACHE_KEY, newDataString);

    if (newDataString !== latestDataString) {
      latestDataString = newDataString;
      latestData = data;
      renderDashboard(data);
    } else {
		latestData = data;
		updateCountdownAndBell();
		renderCleanersToday();
     
    }

  } catch (error) {
    console.error("ClassBoard fetch failed:", error);

    if (!latestData) {
      document.getElementById("dashboardTitle").textContent =
        "Unable to load ClassBoard";
    }
  } finally {
    isFetching = false;
  }
}

async function loadMemoriesUnreadBadge() {
  const badge = document.getElementById("memoriesUnreadBadge");
  if (!badge) return;

  try {
    const response = await fetch(`${API_URL}?type=memories`, { cache: "no-store" });
    const result = await response.json();
    const posts = Array.isArray(result.memories) ? result.memories : [];
    const ids = posts.map(getMemoryPostId).filter(Boolean);
    const savedSeen = localStorage.getItem(MEMORIES_SEEN_IDS_KEY);

    if (!savedSeen) {
      saveSeenMemoryIds(ids);
      renderMemoriesUnreadBadge(0);
      return;
    }

    const seen = getSeenMemoryIds();
    const unread = ids.filter(id => !seen.includes(id)).length;
    renderMemoriesUnreadBadge(unread);
  } catch (error) {
    renderMemoriesUnreadBadge(0);
  }
}

function getMemoryPostId(item) {
  return String(item?.ID || item?.Id || item?.id || "").trim();
}

function getSeenMemoryIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORIES_SEEN_IDS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
}

function saveSeenMemoryIds(ids) {
  localStorage.setItem(
    MEMORIES_SEEN_IDS_KEY,
    JSON.stringify(Array.from(new Set((ids || []).map(String).filter(Boolean))).slice(0, 500))
  );
}

function renderMemoriesUnreadBadge(count) {
  const badge = document.getElementById("memoriesUnreadBadge");
  if (!badge) return;

  const safeCount = Math.max(0, Number(count) || 0);
  badge.hidden = safeCount === 0;
  badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
}

function renderDashboard(data) {
  if (!data || !data.settings) return;

  document.getElementById("dashboardTitle").textContent =
    data.settings.DashboardTitle || "SFK ClassBoard";

  document.getElementById("sectionText").textContent =
    `${data.settings.Section || ""} • S.Y. ${data.settings.SchoolYear || ""} • ${data.settings.Motto || ""}`;

  document.getElementById("dateText").textContent =
    `${data.day}, ${data.date}`;

  const periodState = getDisplayPeriodState(data.schedule || [], data.currentSubject, data.nextSubject);

  renderCurrentSubject(periodState.currentPeriod);
  renderNextSubject(periodState.nextPeriod);
  updateMobilePeriodCardVisibility(periodState);
  renderPrayerLeader(data.prayerLeader);
  renderCleanersToday();
  renderSchedule(data.schedule, periodState.currentPeriod);
  renderAnnouncements(data.announcements || []);
  ensureAnnouncementRotation(data.announcements || []);
  renderThings(data.thingsToBring || []);
  renderReminders(data.adviserReminders || []);
  renderQuote(data.dailyQuote);
  renderBirthdays(data.birthdays || []);
  renderTicker(data.ticker || []);
  updateCountdownAndBell();
}

function getDisplayPeriodState(schedule, currentSubject, nextSubject) {
  const sortedSchedule = (schedule || [])
    .filter(item => item && item.StartTime && item.EndTime)
    .slice()
    .sort((a, b) => timeToMinutes(a.StartTime) - timeToMinutes(b.StartTime));

  const nowMinutes = getCurrentManilaMinutes();
  const todayName = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Manila"
  });

  const isWeekend = todayName === "Saturday" || todayName === "Sunday";
  const firstPeriod = sortedSchedule[0] || null;
  const lastPeriod = sortedSchedule[sortedSchedule.length - 1] || null;
  const firstStart = firstPeriod ? timeToMinutes(firstPeriod.StartTime) : null;
  const lastEnd = lastPeriod ? timeToMinutes(lastPeriod.EndTime) : null;
  const oneHour = 60;

  let currentPeriod = sortedSchedule.find(item => {
    const start = timeToMinutes(item.StartTime);
    const end = timeToMinutes(item.EndTime);
    return nowMinutes >= start && nowMinutes < end;
  }) || null;

  let nextPeriod = sortedSchedule.find(item => timeToMinutes(item.StartTime) > nowMinutes) || null;

  if (!currentPeriod && firstPeriod && firstStart !== null && nowMinutes >= firstStart - oneHour && nowMinutes < firstStart) {
    currentPeriod = null;
    nextPeriod = firstPeriod;
  }

  const shouldHideOnMobile =
    isWeekend ||
    sortedSchedule.length === 0 ||
    (lastEnd !== null && nowMinutes >= lastEnd + oneHour) ||
    (firstStart !== null && nowMinutes < firstStart - oneHour);

  return {
    currentPeriod,
    nextPeriod,
    shouldHideOnMobile
  };
}

function updateMobilePeriodCardVisibility(periodState) {
  document.body.classList.toggle(
    "mobileHidePeriodCards",
    Boolean(periodState && periodState.shouldHideOnMobile)
  );
}

function renderCleanersToday() {
  const cleanersEl = document.getElementById("cleanersToday");
  if (!cleanersEl) return;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Manila"
  });

  const cleanersByDay = {
    Monday: "Group 1 + Group 6 (1)",
    Tuesday: "Group 2 + Group 6 (1)",
    Wednesday: "Group 3 + Group 6 (2)",
    Thursday: "Group 4 + Group 6 (2)",
    Friday: "Group 5 + Group 6 (2)"
  };

  cleanersEl.textContent = cleanersByDay[today] || "No cleaners today";
}

function iconFor(subject) {
  const text = String(subject || "").toLowerCase();

  for (const key in subjectIcons) {
    if (text.includes(key)) return subjectIcons[key];
  }

  return "📚";
}

function getSubjectColor(subject) {
  const sub = String(subject || "").toLowerCase().trim();

  if (sub.includes("mapeh")) return "#333333";
  if (sub.includes("cled")) return "#C084FC";
  if (sub.includes("math")) return "#90EE90";
  if (sub.includes("ict")) return "#FF6B6B";
  if (sub.includes("le")) return "#FF6B6B";
  if (sub.includes("english")) return "#FFB6C1";
  if (sub.includes("filipino") || sub.includes("filipno")) return "#A0522D";
  if (sub.includes("science")) return "#FFD700";
  if (sub.includes("ap") || sub.includes("araling")) return "#60A5FA";

  return "#FFD700";
}

function getSubjectTextColor(subject) {
  const color = getSubjectColor(subject);
  return getReadableTextColor(color);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function renderPeriodDetails(element, item) {
  if (!element || !item) return;

  const time = `${item.StartTime || ""} - ${item.EndTime || ""}`;
  const location = [item.Teacher, item.Room].filter(Boolean).join(" • ");

  element.innerHTML = `
    <span class="period-time">${escapeHtml(time)}</span>
    <span class="period-location">${escapeHtml(location)}</span>
  `;
}

const DEFAULT_ASSEMBLY_CANVA_LINK = "https://canva.link/gqit03d2of2blzy";
const HOLY_MASS_LINK = "https://www.facebook.com/CCFO56/";

function getScheduleItemLink(item = {}) {
  const directLink =
    item.Link ||
    item.link ||
    item.URL ||
    item.Url ||
    item.url ||
    item.Hyperlink ||
    item.hyperlink;

  if (directLink) return String(directLink).trim();

  const subject = String(item.Subject || item.subject || "").toLowerCase();
  const isMorningWorshipPeriod =
    subject.includes("morning assembly") ||
    subject.includes("morning worship") ||
    (subject.includes("morning") && subject.includes("homeroom"));

  const isHolyMassPeriod =
    subject === "mass" ||
    subject.includes("holy mass");

  if (isHolyMassPeriod) return HOLY_MASS_LINK;

  return isMorningWorshipPeriod ? DEFAULT_ASSEMBLY_CANVA_LINK : "";
}

function isSafeExternalLink(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function renderScheduleSubjectText(item = {}, textColor = "inherit") {
  const subject = item.Subject || item.subject || "";
  const label = `${iconFor(subject)} ${subject}`;
  const itemLink = getScheduleItemLink(item);
  const safeLabel = escapeHtml(label);

  if (!isSafeExternalLink(itemLink)) {
    return safeLabel;
  }

  return `
    <a class="schedule-text-link"
       href="${escapeHtml(itemLink)}"
       target="_blank"
       rel="noopener noreferrer"
       style="color:${textColor};">
      ${safeLabel}
    </a>
  `;
}

function renderCurrentSubject(item) {
  const card = document.querySelector(".current");
  const subjectEl = document.getElementById("currentSubject");
  const detailsEl = document.getElementById("currentDetails");
  const countdownEl = document.getElementById("currentCountdownText");

  if (item) {
    const color = item.Color || getSubjectColor(item.Subject);
    const textColor = getReadableTextColor(color);

    card.style.background = color;
    card.style.color = textColor;

    subjectEl.style.color = textColor;
    detailsEl.style.color = textColor;

    if (countdownEl) {
      countdownEl.style.color = textColor === "#111" ? "#111" : "#fff";
      countdownEl.style.background =
        textColor === "#111"
          ? "rgba(255,255,255,.65)"
          : "rgba(0,0,0,.45)";
      countdownEl.style.borderColor =
        textColor === "#111"
          ? "rgba(0,0,0,.35)"
          : "rgba(255,255,255,.35)";
    }

    subjectEl.innerHTML = renderScheduleSubjectText(item, textColor);

    renderPeriodDetails(detailsEl, item);
  } else {
    card.style.background = "#111";
    card.style.color = "#fff";

    subjectEl.style.color = "#fff";
    detailsEl.style.color = "#fff";

    if (countdownEl) {
      countdownEl.style.color = "#111";
      countdownEl.style.background = "rgba(255, 215, 0, .95)";
      countdownEl.style.borderColor = "rgba(0,0,0,.35)";
    }

    document.getElementById("currentSubject").textContent =
      "No current period";

    document.getElementById("currentDetails").textContent =
      "Free time / no scheduled period";
  }
}
function renderNextSubject(item) {
  const card = document.querySelector(".next");
  const subjectEl = document.getElementById("nextSubject");
  const detailsEl = document.getElementById("nextDetails");
  const countdownEl = document.getElementById("countdownText");

  if (item) {
    const color = item.Color || getSubjectColor(item.Subject);
    const textColor = getReadableTextColor(color);

    card.style.background = color;
    card.style.color = textColor;

    subjectEl.style.color = textColor;
    detailsEl.style.color = textColor;

    if (countdownEl) {
      countdownEl.style.color = textColor === "#111" ? "#111" : "#fff";
      countdownEl.style.background =
        textColor === "#111"
          ? "rgba(255,255,255,.65)"
          : "rgba(0,0,0,.45)";
    }

    subjectEl.innerHTML = renderScheduleSubjectText(item, textColor);

    renderPeriodDetails(detailsEl, item);
  } else {
    card.style.background = "#fff7c7";
    card.style.color = "#111";

    subjectEl.style.color = "#111";
    detailsEl.style.color = "#111";

    if (countdownEl) {
      countdownEl.style.color = "#fff";
      countdownEl.style.background = "rgba(0, 0, 0, .44)";
    }

    document.getElementById("nextSubject").textContent =
      "No next period";

    document.getElementById("nextDetails").textContent =
      "End of schedule";

    document.getElementById("countdownText").textContent =
      "No upcoming period";
  }
}

function renderPrayerLeader(item) {
  document.getElementById("prayerLeader").textContent =
    item ? item.PrayerLeader : "Not set";
}

function renderSchedule(items, currentSubject) {
  const box = document.getElementById("scheduleList");

  if (!items || items.length === 0) {
    box.innerHTML = `<p>No schedule for today.</p>`;
    syncTodayScheduleToggle();
    if (!lastScheduleAutoScrollKey) {
      box.scrollTo({ top: 0, behavior: "smooth" });
    }
    return;
  }

  const previousScrollTop = box.scrollTop;
  const currentKey = currentSubject
    ? `${currentSubject.Subject || ""}|${currentSubject.StartTime || ""}|${currentSubject.EndTime || ""}`
    : "";

  box.innerHTML = items.map(item => {
    const color = item.Color || getSubjectColor(item.Subject);
    const textColor = getReadableTextColor(color);

    const isCurrent =
      currentSubject &&
      item.Subject === currentSubject.Subject &&
      item.StartTime === currentSubject.StartTime &&
      item.EndTime === currentSubject.EndTime;

    return `
  <div class="schedule-item ${isCurrent ? "current-row" : ""}"
       style="background:${color}; color:${textColor};">
    ${isCurrent ? `<div class="current-badge">▶ CURRENT PERIOD</div>` : ""}
    <strong style="color:${textColor};">${item.StartTime} - ${item.EndTime}</strong><br>
    <span class="subject-name" style="color:${textColor};">${renderScheduleSubjectText(item, textColor)}</span><br>
    <small style="color:${textColor}; opacity:.9;">${item.Teacher} • ${item.Room}</small>
  </div>
`;
  }).join("");

  syncTodayScheduleToggle();

  if (currentKey && currentKey !== lastScheduleAutoScrollKey) {
    lastScheduleAutoScrollKey = currentKey;
    scrollToCurrentSchedule();
    return;
  }

  if (!currentKey && !lastScheduleAutoScrollKey) {
    box.scrollTop = 0;
    return;
  }

  box.scrollTop = previousScrollTop;
}

function isCompactScheduleView() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function syncTodayScheduleToggle() {
  const card = document.querySelector(".scheduleCard");
  const button = document.getElementById("todayScheduleToggle");

  if (!card || !button) return;

  if (!isCompactScheduleView()) {
    card.classList.remove("todayScheduleCollapsed");
    button.textContent = "Today's Schedule";
    return;
  }

  card.classList.toggle("todayScheduleCollapsed", !isTodayScheduleOpen);
  button.textContent = isTodayScheduleOpen
    ? "Hide Today ▲"
    : "Show Today ▼";
}

function toggleTodaySchedule() {
  isTodayScheduleOpen = !isTodayScheduleOpen;
  syncTodayScheduleToggle();

  if (isTodayScheduleOpen) {
    setTimeout(scrollToCurrentSchedule, 120);
  }
}

function scrollToCurrentSchedule() {
  const scheduleBox = document.getElementById("scheduleList");
  if (!scheduleBox) return;

  const currentRow = scheduleBox.querySelector(".current-row");

  setTimeout(() => {
    if (currentRow) {
      const boxRect = scheduleBox.getBoundingClientRect();
      const rowRect = currentRow.getBoundingClientRect();

      const offset =
        rowRect.top -
        boxRect.top -
        scheduleBox.clientHeight / 2 +
        currentRow.clientHeight / 2;

      scheduleBox.scrollTo({
        top: scheduleBox.scrollTop + offset,
        behavior: "smooth"
      });
    }
  }, 300);
}

function renderAnnouncements(items) {
  items = getActiveAnnouncements(items);
  const box = document.getElementById("announcementList");
  const title = document.getElementById("announcementTitle");

  if (!items || items.length === 0) {
    title.textContent = "Subject Announcements";
    box.innerHTML = `<p>No announcements yet.</p>`;
    return;
  }

  const total = items.length;
  const currentNumber = (announcementIndex % total) + 1;
  const item = items[announcementIndex % total];

  const subjectColor = getSubjectColor(item.Subject);
  const subjectTextColor = getSubjectTextColor(item.Subject);
  const announcementText = item.Announcement || "";
  const formattedAnnouncement = formatBoardText(announcementText, "center");
  const announcementSizeClass = getAnnouncementTextSizeClass(announcementText);
  const announcementRichClass = isRichBoardText(announcementText) ? "announcement-rich" : "";
  const attachmentMarkup = renderAnnouncementAttachments(item);
  const metadataMarkup = renderAnnouncementMetadata(item);
  const postedChipMarkup = renderAnnouncementPostedChip(item);

  title.textContent = `Subject Announcements (${currentNumber} / ${total})`;

  box.innerHTML = `
    <div class="announcement-item rotating-announcement ${announcementSizeClass} ${announcementRichClass}">

      <div class="announcement-top-left">
        <span class="announcement-subject-pill"
              style="background:${subjectColor}; color:${subjectTextColor};">
          ${iconFor(item.Subject)} ${item.Subject}

          <span class="priority-mini">
            ${item.Priority || "Reminder"}
          </span>
        </span>
        ${postedChipMarkup}
      </div>

      <div class="announcement-center-content">
        <div class="announcement-main-text">
          ${formattedAnnouncement}
        </div>
      </div>

      <div class="announcement-bottom-stack">
        ${metadataMarkup}

        ${attachmentMarkup}

        <div class="announcement-controls">
          <button class="announcement-btn prev-btn" onclick="previousAnnouncement()" aria-label="Previous announcement">
            <span class="announcement-nav-icon" aria-hidden="true">←</span>
            <span class="announcement-nav-label">Previous</span>
          </button>
          ${renderAnnouncementHeartButton(item)}
          <button class="announcement-btn next-btn" onclick="nextAnnouncement()" aria-label="Next announcement">
            <span class="announcement-nav-label">Next</span>
            <span class="announcement-nav-icon" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

    </div>
  `;

  requestAnimationFrame(fitAnnouncementTextToCard);
  setTimeout(fitAnnouncementTextToCard, 90);
  setTimeout(fitAnnouncementTextToCard, 260);
}



function fitAnnouncementTextToCard() {
  const card = document.querySelector(".announcement-item.rotating-announcement");
  const text = card ? card.querySelector(".announcement-main-text") : null;
  const center = card ? card.querySelector(".announcement-center-content") : null;

  if (!card || !text || !center) return;

  const plainText = (text.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  const charCount = plainText.length;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
  const visualUnits = estimateAnnouncementVisualUnits(text);
  const hasRichText = !!text.querySelector(".richBoardText");
  const canGrowWithPage = viewportWidth <= 1200 || card.classList.contains("announcement-phone-flow");

  card.classList.remove("announcement-fitted-tight", "announcement-fit-scroll");
  text.style.removeProperty("max-height");
  text.style.removeProperty("overflow-y");

  const targetFont = getAnnouncementTargetFontSize(charCount, viewportWidth, viewportHeight, visualUnits, hasRichText);
  const minimumFont = getAnnouncementMinimumFontSize(charCount, viewportWidth, viewportHeight, visualUnits, hasRichText);
  const lineHeight = getAnnouncementLineHeight(charCount, visualUnits, hasRichText);

  text.style.setProperty("--announcement-fit-font", `${targetFont}px`);
  text.style.setProperty("--announcement-fit-line-height", String(lineHeight));

  // In one-column tablet/phone layouts, the card is allowed to grow with the page.
  // Do not squeeze the text there; readability is more important than fixed height.
  if (canGrowWithPage) {
    text.style.maxHeight = "none";
    text.style.overflowY = "visible";
    return;
  }

  let fontSize = targetFont;
  let safetyCounter = 0;
  let availableTextHeight = getAnnouncementAvailableTextHeight(center, text);
  text.style.maxHeight = `${availableTextHeight}px`;
  text.style.overflowY = "hidden";

  while (
    safetyCounter < 80 &&
    fontSize > minimumFont &&
    announcementContentOverflows(card, center, text, availableTextHeight)
  ) {
    fontSize = Math.max(minimumFont, fontSize - 0.75);
    text.style.setProperty("--announcement-fit-font", `${fontSize}px`);
    availableTextHeight = getAnnouncementAvailableTextHeight(center, text);
    text.style.maxHeight = `${availableTextHeight}px`;
    safetyCounter++;
  }

  const stillOverflowing = announcementContentOverflows(card, center, text, availableTextHeight);
  card.classList.toggle("announcement-fitted-tight", stillOverflowing);

  // Last-resort safety: never overlap the footer/buttons. Keep a readable floor and
  // allow the text area itself to scroll only when an announcement is truly too long.
  if (stillOverflowing) {
    text.style.overflowY = "auto";
    card.classList.add("announcement-fit-scroll");
  }
}

function getAnnouncementAvailableTextHeight(center, text) {
  if (!center || !text) return 160;

  const children = Array.from(center.children || []);
  const styles = window.getComputedStyle(center);
  const gap = Number.parseFloat(styles.rowGap || styles.gap || "0") || 0;
  const paddingTop = Number.parseFloat(styles.paddingTop || "0") || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom || "0") || 0;
  const centerHeight = center.clientHeight || center.getBoundingClientRect().height || 0;
  const nonTextHeight = children
    .filter(child => child !== text && child.offsetParent !== null)
    .reduce((sum, child) => sum + child.offsetHeight, 0);
  const visibleChildren = children.filter(child => child.offsetParent !== null).length;
  const gapHeight = Math.max(0, visibleChildren - 1) * gap;
  const available = centerHeight - nonTextHeight - gapHeight - paddingTop - paddingBottom - 10;

  return Math.max(58, available || Math.max(120, centerHeight * 0.70));
}

function announcementContentOverflows(card, center, text, availableTextHeight) {
  if (!center || !text) return false;

  // Only the text slot is allowed to shrink/scroll.
  // The deadline/teacher row and navigation buttons live in a fixed bottom stack,
  // so they must not be used as part of the text-fit calculation.
  const slotHeight = availableTextHeight || center.clientHeight || 0;
  return text.scrollHeight > slotHeight + 3 || center.scrollHeight > center.clientHeight + 3;
}

function estimateAnnouncementVisualUnits(text) {
  if (!text) return 1;

  const rich = text.querySelector(".richBoardText");
  const blockCount = rich
    ? rich.querySelectorAll("p, div").length
    : 0;
  const breakCount = rich
    ? rich.querySelectorAll("br").length
    : 0;
  const listCount = rich
    ? rich.querySelectorAll("li").length
    : 0;
  const plain = (text.textContent || "").replace(/\s+/g, " ").trim();
  const wrapUnits = Math.ceil(plain.length / 72);

  // Count visual rows, but keep the estimate gentle. The actual DOM measurement
  // below will decide whether shrinking is really needed.
  return Math.max(1, Math.ceil(blockCount * 0.75) + Math.ceil(breakCount * 0.45) + Math.ceil(listCount * 0.28), wrapUnits);
}

function getAnnouncementTargetFontSize(charCount, viewportWidth, viewportHeight, visualUnits = 1, hasRichText = false) {
  const shortHeight = viewportHeight <= 820;
  const veryShortHeight = viewportHeight <= 720;
  const phone = viewportWidth <= 900;
  const wideBoard = viewportWidth >= 1500 && viewportHeight >= 820;

  let size;

  if (hasRichText) {
    if (charCount <= 60) size = phone ? 21 : 26;
    else if (charCount <= 120) size = phone ? 19 : 23;
    else if (charCount <= 220) size = phone ? 17 : 21;
    else if (charCount <= 360) size = phone ? 15 : 18;
    else if (charCount <= 540) size = phone ? 14 : 16;
    else size = phone ? 13 : 15;

    if (wideBoard && charCount <= 260) size += 2;
    if (visualUnits >= 8) size -= 1;
    if (visualUnits >= 12) size -= 1;
  } else {
    if (charCount <= 60) size = phone ? 40 : 44;
    else if (charCount <= 100) size = phone ? 34 : 38;
    else if (charCount <= 160) size = phone ? 28 : 32;
    else if (charCount <= 240) size = phone ? 24 : 28;
    else if (charCount <= 340) size = phone ? 21 : 24;
    else if (charCount <= 460) size = phone ? 18 : 21;
    else size = phone ? 16 : 18;
  }

  if (shortHeight) size -= hasRichText ? 1 : 2;
  if (veryShortHeight) size -= hasRichText ? 1 : 2;

  return Math.max(size, getAnnouncementMinimumFontSize(charCount, viewportWidth, viewportHeight, visualUnits, hasRichText));
}

function getAnnouncementMinimumFontSize(charCount, viewportWidth, viewportHeight, visualUnits = 1, hasRichText = false) {
  const phone = viewportWidth <= 900;
  const veryShortHeight = viewportHeight <= 720;

  if (hasRichText) {
    if (phone) return 12;
    if (charCount > 700 || visualUnits > 14 || veryShortHeight) return 10.5;
    return 12;
  }

  if (charCount <= 120) return phone ? 16 : 17;
  if (charCount <= 260) return phone ? 13 : 14;
  if (charCount <= 460) return phone ? 11 : 12;

  return veryShortHeight ? 9.5 : 10.5;
}

function getAnnouncementLineHeight(charCount, visualUnits = 1, hasRichText = false) {
  if (hasRichText) {
    if (charCount <= 120 && visualUnits <= 3) return 1.20;
    if (charCount <= 360) return 1.16;
    return 1.12;
  }
  return charCount <= 120 ? 1.08 : 1.14;
}

function renderAnnouncementHeartButton(item) {
  if (!shouldShowAnnouncementHeart(item)) return `<span class="announcement-heart-spacer"></span>`;

  const id = getAnnouncementId(item);
  const count = getAnnouncementHeartCount(item);
  const isHearted = id ? isAnnouncementHeartedByThisDevice(item) : false;
  const label = "Noted";

  return `
    <button
      class="announcement-heart-btn ${isHearted ? "is-hearted" : ""}"
      type="button"
      data-announcement-id="${escapeAttr(id)}"
      onclick="heartAnnouncement('${escapeJsAttribute(id)}')"
      ${!id ? "disabled" : ""}
      aria-label="Acknowledge this announcement">
      <span class="heart-icon">${isHearted ? "❤️" : "🤍"}</span>
      <span>${label}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function shouldShowAnnouncementHeart(item) {
  return true;
}

function getAnnouncementId(item) {
  const explicitId = String(
    (item && (item.docId || item.DocID || item.__docId || item.ID || item.Id || item.id || item.RecordID || item["Record ID"])) ||
    ""
  ).trim();

  if (explicitId) return explicitId;

  return createAnnouncementFallbackId(item);
}

function createAnnouncementFallbackId(item) {
  if (!item) return "";

  const rowNumber = String(
    item.RowNumber ||
    item.rowNumber ||
    item.__rowNumber ||
    ""
  ).trim();

  if (rowNumber) {
    return `ANN-ROW-${rowNumber}`;
  }

  const raw = [
    item.Date || item.PostedDate || item.DatePosted || "",
    item.Subject || "",
    item.Announcement || "",
    item.Teacher || "",
    item.Deadline || ""
  ]
    .map(normalizeAnnouncementKeyPart)
    .filter(Boolean)
    .join("|");

  return raw ? `ANN-${simpleAnnouncementHash(raw)}` : "";
}

function normalizeAnnouncementKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function simpleAnnouncementHash(value) {
  let hash = 0;
  const text = String(value || "");

  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36).toUpperCase();
}


function getAnnouncementHeartCount(item) {
  const heartUsers = getHeartUsersV2(item);
  const mapCount = Object.keys(heartUsers).length;
  if (mapCount > 0) return mapCount;

  const values = [
    item?.HeartCountV2,
    item?.heartCountV2,
    item?.NotedCountV2,
    item?.notedCountV2
  ]
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0);

  return values.length ? Math.max(...values) : 0;
}

function getHeartUsersV2(item) {
  return normalizeHeartedDevices(item?.HeartUsersV2 || item?.heartUsersV2 || item?.NotedDevicesV2 || item?.notedDevicesV2);
}

function isAnnouncementHeartedByThisDevice(item) {
  const deviceId = getClassBoardHeartDeviceId();
  return Boolean(getHeartUsersV2(item)[deviceId]);
}

function getHeartedAnnouncements() {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_HEARTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveHeartedAnnouncements(ids) {
  localStorage.setItem(
    ANNOUNCEMENT_HEARTS_KEY,
    JSON.stringify(Array.from(new Set(ids.filter(Boolean))))
  );
}

function isAnnouncementHearted(id) {
  return getHeartedAnnouncements().includes(String(id || ""));
}

function markAnnouncementHearted(id) {
  const ids = getHeartedAnnouncements();
  ids.push(String(id || ""));
  saveHeartedAnnouncements(ids);
}

function unmarkAnnouncementHearted(id) {
  const cleanId = String(id || "");
  saveHeartedAnnouncements(getHeartedAnnouncements().filter(item => item !== cleanId));
}


const HEART_DEVICE_ID_KEY = "sfkClassBoardHeartDeviceId.v1";
const ANNOUNCEMENT_HEART_PENDING = new Set();

function getClassBoardHeartDeviceId() {
  try {
    const existing = localStorage.getItem(HEART_DEVICE_ID_KEY);
    if (existing) return existing;
    const random = window.crypto && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(12))).map(value => value.toString(16).padStart(2, "0")).join("")
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const id = `device-${random}`;
    localStorage.setItem(HEART_DEVICE_ID_KEY, id);
    return id;
  } catch (error) {
    return "device-fallback";
  }
}

function setAnnouncementHeartState(id, hearted) {
  if (hearted) markAnnouncementHearted(id);
  else unmarkAnnouncementHearted(id);
}


function syncAnnouncementHeartStatesFromServer(data) {
  const announcements = Array.isArray(data?.announcements) ? data.announcements : [];
  if (announcements.length === 0) return;

  const deviceId = getClassBoardHeartDeviceId();
  announcements.forEach(item => {
    const id = getAnnouncementId(item);
    if (!id) return;

    const serverState = getServerHeartStateForDevice(item, deviceId);
    if (serverState === true) setAnnouncementHeartState(id, true);
    else if (serverState === false || getAnnouncementHeartCount(item) === 0) setAnnouncementHeartState(id, false);
  });
}

function getServerHeartStateForDevice(item, deviceId) {
  const map = normalizeHeartedDevices(item?.HeartUsersV2 || item?.heartUsersV2 || item?.NotedDevicesV2 || item?.notedDevicesV2 || item?.HeartedDevices || item?.heartedDevices);
  const keys = Object.keys(map);
  if (keys.length === 0) return null;
  return Boolean(map[deviceId]);
}

function normalizeHeartedDevices(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, isHearted]) => key && Boolean(isHearted))
      .map(([key]) => [String(key), true])
  );
}

function escapeJsAttribute(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

async function heartAnnouncement(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId || ANNOUNCEMENT_HEART_PENDING.has(cleanId)) return false;

  const item = findAnnouncementById(cleanId);
  if (!item) {
    console.warn("Announcement not found for heart:", cleanId);
    return false;
  }

  const nextHearted = !isAnnouncementHeartedByThisDevice(item);
  ANNOUNCEMENT_HEART_PENDING.add(cleanId);
  setAnnouncementHeartButtonSaving(cleanId, true);

  try {
    const result = await saveAnnouncementHeartV2(cleanId, nextHearted);
    applyAnnouncementHeartResult(cleanId, result.count, result.hearted, result.heartUsers);
    renderAnnouncements(latestData?.announcements || []);
  } catch (error) {
    console.error("Announcement heart failed:", error);
    alert("Unable to save Noted. Please refresh and try again.");
  } finally {
    ANNOUNCEMENT_HEART_PENDING.delete(cleanId);
    setAnnouncementHeartButtonSaving(cleanId, false);
  }

  return false;
}

function findAnnouncementById(id) {
  const cleanId = String(id || "").trim();
  return (latestData?.announcements || []).find(item => getAnnouncementId(item) === cleanId) || null;
}

function setAnnouncementHeartButtonSaving(id, saving) {
  const button = document.querySelector(`.announcement-heart-btn[data-announcement-id="${cssEscapeSafe(id)}"]`);
  if (!button) return;
  button.disabled = Boolean(saving);
  button.classList.toggle("is-saving", Boolean(saving));
}

function cssEscapeSafe(value) {
  const text = String(value || "");
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(text);
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function saveAnnouncementHeartV2(id, hearted) {
  const db = getClassBoardFirestore();
  if (!db) {
    const response = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "announcementHeartV2",
        payload: { id, announcementId: id, hearted, deviceId: getClassBoardHeartDeviceId() }
      })
    });
    const result = await response.json();
    if (!result.success && result.status !== "success") throw new Error(result.message || "Heart save failed.");
    return normalizeHeartSaveResult(result, hearted);
  }

  const ref = await resolveClassBoardDocumentRef(db, "announcements", id, ["ID", "id", "RecordID"]);
  if (!ref) throw new Error("Announcement record was not found in Firebase.");

  return runHeartV2Transaction(db, ref, hearted);
}

async function resolveClassBoardDocumentRef(db, collectionName, id, fields = []) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  const collection = db.collection(collectionName);
  try {
    const direct = await collection.doc(cleanId).get();
    if (direct.exists) return direct.ref;
  } catch (error) {
    console.warn("Direct document lookup failed:", error);
  }

  for (const field of fields) {
    try {
      const snap = await collection.where(field, "==", cleanId).limit(1).get();
      if (!snap.empty) return snap.docs[0].ref;
    } catch (error) {
      console.warn(`Document lookup by ${field} failed:`, error);
    }
  }

  return null;
}

async function runHeartV2Transaction(db, ref, hearted) {
  const deviceId = getClassBoardHeartDeviceId();
  let heartUsers = {};
  let nextCount = 0;

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new Error("Record was not found in Firebase.");

    const data = doc.data() || {};
    heartUsers = getHeartUsersV2(data);

    if (hearted) heartUsers[deviceId] = true;
    else delete heartUsers[deviceId];

    nextCount = Object.keys(heartUsers).length;
    const update = {
      HeartUsersV2: heartUsers,
      heartUsersV2: heartUsers,
      HeartCountV2: nextCount,
      heartCountV2: nextCount,
      NotedCountV2: nextCount,
      notedCountV2: nextCount,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    transaction.set(ref, update, { merge: true });
  });

  return { success: true, hearted: Boolean(heartUsers[deviceId]), count: nextCount, heartUsers };
}

function normalizeHeartSaveResult(result, requestedHearted) {
  const heartUsers = normalizeHeartedDevices(result.heartUsers || result.HeartUsersV2 || result.heartUsersV2);
  const count = Number.isFinite(Number(result.count)) ? Math.max(0, Number(result.count)) : Object.keys(heartUsers).length;
  return {
    success: true,
    hearted: typeof result.hearted === "boolean" ? result.hearted : Boolean(requestedHearted),
    count,
    heartUsers
  };
}

function getClassBoardFirestore() {
  try {
    if (window.SFK_CLASSBOARD_FIREBASE_DB) return window.SFK_CLASSBOARD_FIREBASE_DB;
    if (!window.firebase || !window.SFK_FIREBASE_READY) return null;
    if (!firebase.apps.length) firebase.initializeApp(window.SFK_FIREBASE_CONFIG);
    const db = firebase.firestore();
    window.SFK_CLASSBOARD_FIREBASE_DB = db;
    return db;
  } catch (error) {
    console.warn("Firebase database is unavailable:", error);
    return null;
  }
}

function applyAnnouncementHeartResult(id, count, hearted, heartUsers) {
  if (!latestData || !Array.isArray(latestData.announcements)) return;

  const deviceId = getClassBoardHeartDeviceId();
  const map = normalizeHeartedDevices(heartUsers);
  if (Object.keys(map).length === 0 && hearted) map[deviceId] = true;
  if (!hearted) delete map[deviceId];
  const safeCount = Math.max(0, Number.isFinite(Number(count)) ? Number(count) : Object.keys(map).length);

  latestData.announcements = latestData.announcements.map(item => {
    if (getAnnouncementId(item) !== id) return item;
    return {
      ...item,
      HeartUsersV2: map,
      heartUsersV2: map,
      HeartCountV2: safeCount,
      heartCountV2: safeCount,
      NotedCountV2: safeCount,
      notedCountV2: safeCount
    };
  });

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(latestData));
    latestDataString = JSON.stringify(latestData);
  } catch (error) {
    // Ignore cache update errors.
  }
}

function updateAnnouncementHeartCountLocal(id, value, absolute = false) {
  if (!latestData || !Array.isArray(latestData.announcements)) return;

  latestData.announcements = latestData.announcements.map(item => {
    if (getAnnouncementId(item) !== id) return item;

    const current = getAnnouncementHeartCount(item);
    const nextCount = absolute ? value : current + value;

    const safeCount = Math.max(0, Number(nextCount) || 0);
    return {
      ...item,
      HeartCount: safeCount,
      heartCount: safeCount,
      NotedCount: safeCount,
      notedCount: safeCount,
      AcknowledgementCount: safeCount,
      AcknowledgeCount: safeCount,
      Hearts: safeCount,
      hearts: safeCount
    };
  });

  try {
    const cachedData = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

    if (cachedData && Array.isArray(cachedData.announcements)) {
      cachedData.announcements = cachedData.announcements.map(item => {
        const itemId = String(
          item.ID || item.Id || item.id || item.RecordID || item["Record ID"] || ""
        ).trim();

        if (itemId !== id) return item;

        const current = getAnnouncementHeartCount(item);
        const safeCount = Math.max(0, Number(absolute ? value : current + value) || 0);
        return {
          ...item,
          HeartCount: safeCount,
          heartCount: safeCount,
          NotedCount: safeCount,
          notedCount: safeCount,
          AcknowledgementCount: safeCount,
          AcknowledgeCount: safeCount,
          Hearts: safeCount,
          hearts: safeCount
        };
      });

      localStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
      latestDataString = JSON.stringify(cachedData);
    }
  } catch (error) {
    // Ignore cache update errors.
  }
}


function renderAnnouncementPostedChip(item) {
  const postedDate = getAnnouncementPostedDate(item);

  if (!postedDate) return "";

  return `
    <span class="announcement-posted-chip" aria-label="Published ${escapeHtml(postedDate)}">
      <span class="posted-icon">📌</span>
      <span class="posted-word">Published</span>
      <span class="posted-separator">•</span>
      <span class="posted-date-text">${escapeHtml(postedDate)}</span>
    </span>
  `;
}

function renderAnnouncementMetadata(item) {
  const deadline = getAnnouncementField(item, [
    "Deadline",
    "DueDate",
    "Due Date"
  ]);
  const teacher = getAnnouncementField(item, [
    "Teacher",
    "PostedBy",
    "Posted By"
  ]);
  const showDeadlineValue = getAnnouncementField(item, [
    "ShowDeadline",
    "Show Deadline",
    "DisplayDeadline",
    "Display Deadline"
  ]);
  const shouldShowDeadline = shouldDisplayAnnouncementDeadline(showDeadlineValue, deadline);
  const parts = [];

  if (shouldShowDeadline && deadline) parts.push(`📅 Deadline: ${escapeHtml(deadline)}`);
  if (teacher) parts.push(`👤 ${escapeHtml(teacher)}`);

  if (parts.length === 0) return "";

  return `
    <div class="announcement-footer">
      ${parts.join(" <span class=\"announcement-meta-dot\">•</span> ")}
    </div>
  `;
}

function getAnnouncementPostedDate(item) {
  const postedDate = getAnnouncementField(item, [
    "PublishDate",
    "Publish Date",
    "Date",
    "PostedDate",
    "DatePosted",
    "Posted Date",
    "Date Posted",
    "Posted"
  ]);

  if (postedDate) return postedDate;

  const id = getAnnouncementField(item, ["ID", "Id", "RecordID", "Record Id"]);
  const match = String(id || "").match(/ANN-(\d{4})(\d{2})(\d{2})/i);

  if (!match) return "";

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (isNaN(date)) return "";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function getAnnouncementField(item, names) {
  const entries = Object.entries(item || {});

  for (const name of names) {
    const direct = item && item[name];
    if (direct !== undefined && String(direct).trim()) {
      return String(direct).trim();
    }

    const normalizedName = normalizeAnnouncementKey(name);
    const match = entries.find(([key, value]) => {
      return normalizeAnnouncementKey(key) === normalizedName && String(value || "").trim();
    });

    if (match) return String(match[1]).trim();
  }

  return "";
}

function normalizeAnnouncementKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function shouldDisplayAnnouncementDeadline(showDeadlineValue, deadline) {
  if (!deadline) return false;

  const value = String(showDeadlineValue || "").trim().toLowerCase();

  if (!value) return true;
  if (["no", "n", "false", "hide", "hidden", "0"].includes(value)) return false;

  return true;
}

function renderAnnouncementAttachments(item) {
  const urls = splitAttachmentField(item.AttachmentURLs || item.Attachments || item.AttachmentURL);
  const labels = splitAttachmentField(item.AttachmentNames || item.AttachmentLabels || item.AttachmentName);

  if (urls.length === 0) return "";

  const safeUrls = urls
    .filter(isSafeExternalLink)
    .slice(0, 8);

  const links = safeUrls
    .map((url, index) => {
      const label = labels[index] || `Attachment ${index + 1}`;
      const isImage = isImageUrl(url) || isImageUrl(label);
      const icon = isImage ? "🖼️" : "📎";

      return `
        <a class="announcement-attachment-chip compact-attachment-row"
           href="${escapeHtml(url)}"
           target="_blank"
           rel="noopener noreferrer"
           title="Open ${escapeHtml(label)}">
          <span class="attachment-file-icon" aria-hidden="true">${icon}</span>
          <span class="attachment-file-name">${escapeHtml(label)}</span>
          <span class="attachment-file-open" aria-hidden="true">↗</span>
        </a>
      `;
    })
    .join("");

  if (!links) return "";

  const attachmentLabel = safeUrls.length === 1 ? "Attachment" : "Attachments";

  return `
    <div class="announcement-attachments compact-attachments" aria-label="Announcement attachments">
      <div class="announcement-attachments-label compact-attachments-label">📎 ${attachmentLabel} (${safeUrls.length})</div>
      <div class="announcement-attachment-list compact-attachment-list">
        ${links}
      </div>
    </div>
  `;
}

function splitAttachmentField(value) {
  return String(value || "")
    .split(/\r?\n|,\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(String(url || ""));
}

function getAnnouncementTextSizeClass(value) {
  const text = stripBoardTextFormatTag(value);
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const charCount = text.replace(/\s+/g, " ").trim().length;
  const lineCount = lines.length;

  if (charCount > 420 || lineCount >= 8) return "announcement-size-xs";
  if (charCount > 280 || lineCount >= 6) return "announcement-size-sm";
  if (charCount > 160 || lineCount >= 4) return "announcement-size-md";

  if (lineCount <= 1 && charCount <= 80) return "announcement-size-one-line";
  if (lineCount <= 2 && charCount <= 120) return "announcement-size-short";

  return "announcement-size-normal";
}

function rotateAnnouncements() {
  const items = getActiveAnnouncements(latestData?.announcements || []);
  if (items.length === 0) return;

  announcementIndex++;
  renderAnnouncements(items);
  resetAnnouncementRotation(items);
}

function previousAnnouncement() {
  const items = getActiveAnnouncements(latestData?.announcements || []);
  if (items.length === 0) return;

  announcementIndex--;

  if (announcementIndex < 0) {
    announcementIndex = items.length - 1;
  }

  renderAnnouncements(items);
  resetAnnouncementRotation(items);
}

function nextAnnouncement() {
  const items = getActiveAnnouncements(latestData?.announcements || []);
  if (items.length === 0) return;

  announcementIndex++;
  renderAnnouncements(items);
  resetAnnouncementRotation(items);
}

function ensureAnnouncementRotation(items) {
  const total = getActiveAnnouncements(items).length;
  if (
    announcementRotationCount !== total ||
    (!announcementRotateTimer && !announcementRotationPaused)
  ) {
    resetAnnouncementRotation(items);
  }
}

function resetAnnouncementRotation(items = latestData?.announcements || []) {
  announcementRotationVersion++;
  const rotationVersion = announcementRotationVersion;
  window.clearTimeout(announcementRotateTimer);
  announcementRotateTimer = null;
  announcementRotationCount = getActiveAnnouncements(items).length;
  announcementRemainingMs = ANNOUNCEMENT_ROTATE_MS;

  const progress = document.getElementById("announcementProgress");
  const fill = document.getElementById("announcementProgressFill");
  if (!progress || !fill) return;

  progress.classList.toggle("isStatic", announcementRotationCount <= 1);
  fill.style.transition = "none";
  fill.style.width = announcementRotationCount ? (announcementRotationCount === 1 ? "100%" : "0%") : "0%";
  updateAnnouncementTimerButton();

  if (announcementRotationCount <= 1 || announcementRotationPaused) return;

  void fill.offsetWidth;
  window.requestAnimationFrame(() => {
    if (rotationVersion !== announcementRotationVersion) return;
    fill.style.transition = `width ${announcementRemainingMs}ms linear`;
    fill.style.width = "100%";
    announcementRotateTimer = window.setTimeout(rotateAnnouncements, announcementRemainingMs);
  });
}

function toggleAnnouncementRotation() {
  if (announcementRotationCount <= 1) return;

  const progress = document.getElementById("announcementProgress");
  const fill = document.getElementById("announcementProgressFill");
  if (!progress || !fill) return;

  announcementRotationVersion++;
  window.clearTimeout(announcementRotateTimer);
  announcementRotateTimer = null;

  if (!announcementRotationPaused) {
    const trackWidth = Math.max(1, progress.getBoundingClientRect().width);
    const fillWidth = Math.max(0, fill.getBoundingClientRect().width);
    const completedRatio = Math.min(1, fillWidth / trackWidth);
    announcementRemainingMs = Math.max(80, ANNOUNCEMENT_ROTATE_MS * (1 - completedRatio));
    fill.style.transition = "none";
    fill.style.width = `${completedRatio * 100}%`;
    announcementRotationPaused = true;
    updateAnnouncementTimerButton();
    return;
  }

  announcementRotationPaused = false;
  updateAnnouncementTimerButton();
  const rotationVersion = announcementRotationVersion;
  void fill.offsetWidth;
  window.requestAnimationFrame(() => {
    if (rotationVersion !== announcementRotationVersion) return;
    fill.style.transition = `width ${announcementRemainingMs}ms linear`;
    fill.style.width = "100%";
    announcementRotateTimer = window.setTimeout(rotateAnnouncements, announcementRemainingMs);
  });
}

function updateAnnouncementTimerButton() {
  const button = document.getElementById("announcementTimerToggle");
  if (!button) return;

  const paused = announcementRotationPaused;
  button.disabled = announcementRotationCount <= 1;
  button.classList.toggle("isPaused", paused);
  button.setAttribute("aria-pressed", paused ? "true" : "false");
  button.setAttribute("aria-label", paused ? "Resume announcement timer" : "Pause announcement timer");
  button.title = paused ? "Resume announcement timer" : "Pause announcement timer";
  button.innerHTML = paused ? "&#9654;" : "&#10074;&#10074;";
}

function getActiveAnnouncements(items) {
  const todayKey = getManilaDateKey(new Date());
  return (Array.isArray(items) ? items : []).filter(item => {
    const publishKey = getAnnouncementDateKey(item?.PublishDate || item?.ScheduledPublishDate || item?.StartDate);
    const expiryKey = getAnnouncementDateKey(item?.ExpiryDate || item?.ExpirationDate || item?.EndDate);
    return (!publishKey || todayKey >= publishKey) && (!expiryKey || todayKey < expiryKey);
  });
}

function getManilaDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value || "";
  const month = parts.find(part => part.type === "month")?.value || "";
  const day = parts.find(part => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function getAnnouncementDateKey(value) {
  if (!value) return "";
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? getManilaDateKey(date) : "";
}

function renderThings(items) {
  const box = document.getElementById("thingsList");
  const summary = document.getElementById("bringSummary");

  if (!box) return;

  if (!items || items.length === 0) {
    if (summary) summary.textContent = "";
    box.innerHTML = `<p>No things to bring yet.</p>`;
    return;
  }

  const visibleItems = items
    .map(item => {
      const subject = item.Subject || "Reminder";
      const dateValue = getThingDateValue(item);
      const itemText = getThingText(item);
      const status = getBringStatus(dateValue);

      return {
        ...item,
        subject,
        dateValue,
        itemText,
        status
      };
    })
    .filter(item => item.status && (item.itemText || item.subject))
    .sort((a, b) => {
      if (a.status.priority !== b.status.priority) {
        return a.status.priority - b.status.priority;
      }

      return a.status.sortValue - b.status.sortValue;
    });

  updateBringSummary(visibleItems);

  if (visibleItems.length === 0) {
    box.innerHTML = `<p>No upcoming things to bring.</p>`;
    return;
  }

  box.innerHTML = visibleItems.map(item => {
    const safeSubject = escapeHTML(item.subject);
    const formattedItemText = formatBoardText(item.itemText || "No item specified", "left");
    const subjectClass = getThingSubjectClass(item.subject);

    const statusLabel = item.status.label
      ? `<span class="bring-status ${item.status.className}">${escapeHTML(item.status.label)}</span>`
      : "";

    return `
      <div class="thing-item">
        <div class="thing-topline">
          <strong class="thing-subject ${subjectClass}">${safeSubject}</strong>
          ${statusLabel}
        </div>

        <div class="thing-detail">${formattedItemText}</div>
      </div>
    `;
  }).join("");


}

function getThingDateValue(item) {
  return (
    item.DateNeeded ||
    item.NeededDate ||
    item.DueDate ||
    item.Deadline ||
    item.Date ||
    ""
  );
}

function getThingText(item) {
  return (
    item.Item ||
    item.Things ||
    item.Materials ||
    item.Reminder ||
    item.Description ||
    item.Task ||
    ""
  );
}

function updateBringSummary(items) {
  const summary = document.getElementById("bringSummary");
  if (!summary) return;

  const todayCount = items.filter(item => item.status?.type === "today").length;
  const tomorrowCount = items.filter(item => item.status?.type === "tomorrow").length;

  const parts = [];

  if (todayCount > 0) {
    parts.push(`🔥 TODAY: ${todayCount}`);
  }

  if (tomorrowCount > 0) {
    parts.push(`⚠️ TOMORROW: ${tomorrowCount}`);
  }

  summary.textContent = parts.join(" | ");
}

function getBringStatus(dateValue) {
  const dueParts = parseDateToManilaParts(dateValue);

  if (!dueParts) {
    return {
      type: "no-date",
      label: "",
      className: "",
      priority: 6,
      sortValue: Number.MAX_SAFE_INTEGER
    };
  }

  const todayParts = getTodayManilaParts();

  const dueUTC = Date.UTC(dueParts.year, dueParts.month - 1, dueParts.day);
  const todayUTC = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

  const diffDays = Math.round((dueUTC - todayUTC) / 86400000);

  if (diffDays < 0) return null;

  if (diffDays === 0) {
    return {
      type: "today",
      label: "🔥 TODAY",
      className: "status-today",
      priority: 1,
      sortValue: dueUTC
    };
  }

  if (diffDays === 1) {
    return {
      type: "tomorrow",
      label: "🔴 NEED TOMORROW",
      className: "status-tomorrow",
      priority: 2,
      sortValue: dueUTC
    };
  }

  if (diffDays === 2) {
    return {
      type: "two-days",
      label: "🟠 IN 2 DAYS",
      className: "status-two-days",
      priority: 3,
      sortValue: dueUTC
    };
  }

  const week = getManilaWeekRangeUTC(todayUTC);

  if (dueUTC <= week.endThisWeekUTC) {
    return {
      type: "this-week",
      label: `🟡 THIS WEEK • ${formatShortBringDate(dueParts)}`,
      className: "status-this-week",
      priority: 4,
      sortValue: dueUTC
    };
  }

  if (dueUTC >= week.startNextWeekUTC && dueUTC <= week.endNextWeekUTC) {
    return {
      type: "next-week",
      label: `🔵 NEXT WEEK • ${formatShortBringDate(dueParts)}`,
      className: "status-next-week",
      priority: 5,
      sortValue: dueUTC
    };
  }

  return {
    type: "future",
    label: `🟢 FUTURE DATE • ${formatShortBringDate(dueParts)}`,
    className: "status-future",
    priority: 6,
    sortValue: dueUTC
  };
}

function getTodayManilaParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  return {
    year: Number(parts.find(part => part.type === "year")?.value || 0),
    month: Number(parts.find(part => part.type === "month")?.value || 0),
    day: Number(parts.find(part => part.type === "day")?.value || 0)
  };
}

function getManilaWeekRangeUTC(todayUTC) {
  const dayMs = 86400000;
  const today = new Date(todayUTC);
  const dayOfWeek = today.getUTCDay(); // 0 Sunday, 1 Monday, ... 6 Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const startThisWeekUTC = todayUTC - (daysSinceMonday * dayMs);

  return {
    startThisWeekUTC,
    endThisWeekUTC: startThisWeekUTC + (6 * dayMs),
    startNextWeekUTC: startThisWeekUTC + (7 * dayMs),
    endNextWeekUTC: startThisWeekUTC + (13 * dayMs)
  };
}

function parseDateToManilaParts(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3])
    };
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (slashMatch) {
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    return {
      year,
      month: Number(slashMatch[1]),
      day: Number(slashMatch[2])
    };
  }

  const dashMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);

  if (dashMatch) {
    const rawYear = Number(dashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    return {
      year,
      month: Number(dashMatch[1]),
      day: Number(dashMatch[2])
    };
  }

  const parsedDate = new Date(text);

  if (isNaN(parsedDate)) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(parsedDate);

  return {
    year: Number(parts.find(part => part.type === "year")?.value || 0),
    month: Number(parts.find(part => part.type === "month")?.value || 0),
    day: Number(parts.find(part => part.type === "day")?.value || 0)
  };
}

function formatShortBringDate(dateParts) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(date).toUpperCase();
}

function getThingSubjectClass(subject) {
  const sub = String(subject || "").toLowerCase().trim();

  if (sub.includes("mapeh")) return "subject-mapeh";
  if (sub.includes("cled") || sub.includes("christian") || sub.includes("religion")) return "subject-cled";
  if (sub.includes("math")) return "subject-mathematics";
  if (sub.includes("ict")) return "subject-ict";
  if (sub.includes("le")) return "subject-le";
  if (sub.includes("english")) return "subject-english";
  if (sub.includes("filipino") || sub.includes("filipno")) return "subject-filipino";
  if (sub.includes("science")) return "subject-science";
  if (sub.includes("araling") || /\bap\b/.test(sub)) return "subject-ap";
  if (sub.includes("homeroom")) return "subject-homeroom";

  return "subject-homeroom";
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBoardText(value, defaultAlign = "center") {
  const rawValue = String(value || "").replace(/\r/g, "").trim();

  if (!rawValue) {
    return "";
  }

  if (isRichBoardText(rawValue)) {
    const richHtml = extractRichBoardHtml(rawValue);
    const safeHtml = sanitizeBoardRichHtml(richHtml);
    if (!safeHtml) return "";
    return `<div class="formattedText richBoardText">${safeHtml}</div>`;
  }

  const rawLines = rawValue
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (rawLines.length === 0) {
    return "";
  }

  const firstLine = rawLines[0].toLowerCase();
  const tagMatch = firstLine.match(/^\[(left|center|right|bullets|numbers)\]$/);
  const mode = tagMatch ? tagMatch[1] : defaultAlign;
  const contentLines = tagMatch ? rawLines.slice(1) : rawLines;
  const safeLines = contentLines.map(line => escapeHTML(line));

  if (safeLines.length === 0) {
    return "";
  }

  if (mode === "bullets" || mode === "numbers") {
    const tagName = mode === "numbers" ? "ol" : "ul";
    return `
      <${tagName} class="formattedText align-left">
        ${safeLines.map(line => `<li>${line}</li>`).join("")}
      </${tagName}>
    `;
  }

  const alignClass =
    mode === "right"
      ? "align-right"
      : mode === "left"
        ? "align-left"
        : "align-center";
  return `<div class="formattedText ${alignClass}">${safeLines.join("<br>")}</div>`;
}

function isRichBoardText(value) {
  return /^\[rich\]\s*\n/i.test(String(value || "").replace(/\r/g, ""));
}

function extractRichBoardHtml(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\[rich\]\s*\n?/i, "")
    .trim();
}

function sanitizeBoardRichHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const cleanFragment = sanitizeBoardRichNode(template.content);
  const wrapper = document.createElement("div");
  wrapper.appendChild(cleanFragment);
  return wrapper.innerHTML.trim();
}

function sanitizeBoardRichNode(node) {
  const fragment = document.createDocumentFragment();
  const allowedTags = ["b", "strong", "i", "em", "u", "br", "div", "p", "ul", "ol", "li", "span", "font"];
  const allowedAlignments = ["left", "center", "right"];
  const allowedListStyles = ["disc", "circle", "square", "decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"];
  const maxIndentEm = 7.5;

  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      fragment.appendChild(document.createTextNode(child.textContent || ""));
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const tag = child.tagName.toLowerCase();
    if (!allowedTags.includes(tag)) {
      fragment.appendChild(sanitizeBoardRichNode(child));
      return;
    }

    const cleanTag = tag === "font" ? "span" : tag;
    const clean = document.createElement(cleanTag);
    const styleParts = [];
    const textAlign = String(child.style?.textAlign || "").toLowerCase();
    const listStyleType = String(child.style?.listStyleType || "").toLowerCase();
    const fontWeight = String(child.style?.fontWeight || "").toLowerCase();
    const fontStyle = String(child.style?.fontStyle || "").toLowerCase();
    const textDecoration = String(child.style?.textDecoration || "").toLowerCase();
    const color = normalizeBoardRichColor(child.getAttribute("color") || child.style?.color || "");
    const indent = normalizeBoardRichIndent(child.style?.marginLeft || "", maxIndentEm);

    if (allowedAlignments.includes(textAlign)) styleParts.push(`text-align:${textAlign}`);
    if ((cleanTag === "ul" || cleanTag === "ol") && allowedListStyles.includes(listStyleType)) {
      styleParts.push(`list-style-type:${listStyleType}`);
    }
    if (["div", "p", "li", "ul", "ol"].includes(cleanTag) && indent) styleParts.push(`margin-left:${indent}`);
    if (cleanTag === "span" && (fontWeight === "bold" || Number(fontWeight) >= 600)) styleParts.push("font-weight:700");
    if (cleanTag === "span" && fontStyle === "italic") styleParts.push("font-style:italic");
    if (cleanTag === "span" && textDecoration.includes("underline")) styleParts.push("text-decoration:underline");
    if (cleanTag === "span" && color) styleParts.push(`color:${color}`);
    if (styleParts.length) clean.setAttribute("style", styleParts.join(";"));

    clean.appendChild(sanitizeBoardRichNode(child));
    fragment.appendChild(clean);
  });

  return fragment;
}


function normalizeBoardRichColor(value) {
  const raw = String(value || "").trim().toLowerCase();

  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return `#${shortHex[1].split("").map(char => char + char).join("")}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();

  const rgb = raw.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*(?:0|1|0?\.\d+))?\)$/i);
  if (rgb) {
    const parts = rgb.slice(1, 4).map(part => Math.max(0, Math.min(255, Number(part) || 0)));
    return `#${parts.map(part => part.toString(16).padStart(2, "0")).join("")}`;
  }

  return "";
}

function normalizeBoardRichIndent(value, maxIndentEm = 7.5) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  let parsed = 0;
  if (raw.endsWith("em")) {
    parsed = Number.parseFloat(raw) || 0;
  } else if (raw.endsWith("px")) {
    parsed = (Number.parseFloat(raw) || 0) / 16;
  } else {
    parsed = Number.parseFloat(raw) || 0;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  const rounded = Math.round(Math.min(maxIndentEm, parsed) * 100) / 100;
  return `${String(rounded).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}em`;
}

function stripHtmlToPlainText(html) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeBoardRichHtml(html);
  return String(template.content.textContent || "").replace(/\s+/g, " ").trim();
}

function stripBoardTextFormatTag(value) {
  const raw = String(value || "").replace(/\r/g, "").trim();

  if (isRichBoardText(raw)) {
    return stripHtmlToPlainText(extractRichBoardHtml(raw));
  }

  return raw
    .replace(/^\[(left|center|right|bullets|numbers)\]\s*\n?/i, "")
    .trim();
}

function renderReminders(items) {
  const box = document.getElementById("reminderList");

  if (!box) return;

  if (!items || items.length === 0) {
    box.innerHTML = `<p>No adviser reminders yet.</p>`;
    return;
  }

  box.innerHTML = items.map(item => {
    const reminder = item.Reminder || item.Message || item.Description || "";

    return `
      <div class="reminder-item">
        ${formatBoardText(reminder, "left")}
      </div>
    `;
  }).join("");
}

/* BIRTHDAY CORNER */
function renderBirthdays(items) {
  const box = document.getElementById("birthdayList");
  const dateText = document.getElementById("birthdayDateText");

  if (!box) return;

  const todayMonthDay = getTodayMonthDay();

  if (dateText) {
    dateText.textContent = formatBirthdayDateText(todayMonthDay);
  }

  if (!items || items.length === 0) {
    birthdayIndex = 0;

    box.innerHTML = `
      <div class="noBirthday">
        <span>🎂</span>
        <p>No birthday celebrants today.</p>
      </div>
    `;
    return;
  }

  const birthdayToday = items.filter(item => {
    const birthdayValue =
      item.MonthDay ||
      item.Birthday ||
      item.Birthdate ||
      item.Date ||
      "";

    return normalizeBirthdayValue(birthdayValue) === todayMonthDay;
  });

  if (birthdayToday.length === 0) {
    birthdayIndex = 0;

    box.innerHTML = `
      <div class="noBirthday">
        <span>🎂</span>
        <p>No birthday celebrants today.</p>
      </div>
    `;
    return;
  }

  if (birthdayIndex >= birthdayToday.length) {
    birthdayIndex = 0;
  }

  const currentNumber = (birthdayIndex % birthdayToday.length) + 1;
  const item = birthdayToday[birthdayIndex % birthdayToday.length];

  const name =
    item.Name ||
    item.StudentName ||
    item.Student ||
    "Birthday Celebrant";

  const counterText =
    birthdayToday.length > 1
      ? `<span class="birthdayCounter">${currentNumber}/${birthdayToday.length}</span>`
      : "";

  const birthdayDisplayKey = `${name}-${currentNumber}-${birthdayToday.length}`;
const shouldFadeBirthday = birthdayDisplayKey !== lastBirthdayDisplayKey;
lastBirthdayDisplayKey = birthdayDisplayKey;

box.innerHTML = `
  <div class="birthdayItem ${shouldFadeBirthday ? "birthdayFadeIn" : ""}">
    <div class="birthdayIcon">🎉</div>

      <div class="birthdayContent">
        <strong>
          Happy Birthday!
          ${counterText}
        </strong>

        <h3 class="birthdayNameMarquee">
          <span>${name}</span>
        </h3>

        <p>Have a joyful day! 🐨💛</p>
      </div>
    </div>
  `;
}

function rotateBirthdays() {
  if (!latestData || !latestData.birthdays || latestData.birthdays.length === 0) return;

  const todayMonthDay = getTodayMonthDay();

  const birthdayToday = latestData.birthdays.filter(item => {
    const birthdayValue =
      item.MonthDay ||
      item.Birthday ||
      item.Birthdate ||
      item.Date ||
      "";

    return normalizeBirthdayValue(birthdayValue) === todayMonthDay;
  });

  if (birthdayToday.length <= 1) return;

  birthdayIndex++;

  if (birthdayIndex >= birthdayToday.length) {
    birthdayIndex = 0;
  }

  renderBirthdays(latestData.birthdays);
}

function getTodayMonthDay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const month = parts.find(part => part.type === "month")?.value || "";
  const day = parts.find(part => part.type === "day")?.value || "";

  return `${month}-${day}`;
}

function normalizeBirthdayValue(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{1,2}-\d{1,2}$/.test(text)) {
    const [month, day] = text.split("-");
    return `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{1,2}\/\d{1,2}$/.test(text)) {
    const [month, day] = text.split("/");
    return `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const date = new Date(text);

  if (!isNaN(date)) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const month = parts.find(part => part.type === "month")?.value || "";
    const day = parts.find(part => part.type === "day")?.value || "";

    return `${month}-${day}`;
  }

  return text;
}

function formatBirthdayDateText(value) {
  const monthDay = normalizeBirthdayValue(value);

  if (!monthDay || !monthDay.includes("-")) {
    return "";
  }

  const [monthText, dayText] = monthDay.split("-");
  const month = Number(monthText);
  const day = Number(dayText);

  const monthNames = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return `${getOrdinalDay(day)} of ${monthNames[month] || ""}`;
}

function getOrdinalDay(day) {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }

  const lastDigit = day % 10;

  if (lastDigit === 1) return `${day}st`;
  if (lastDigit === 2) return `${day}nd`;
  if (lastDigit === 3) return `${day}rd`;

  return `${day}th`;
}

function renderQuote(item) {
  document.getElementById("dailyQuote").textContent =
    item ? `“${item.Quote}”` : "Be kind today.";

  document.getElementById("quoteAuthor").textContent =
    item ? `— ${item.Author || "SFK ClassBoard"}` : "";
}

function renderTicker(items) {
  const ticker = document.getElementById("tickerText");

  if (!items || items.length === 0) {
    ticker.textContent = "📢 Welcome to SFK ClassBoard";
    return;
  }

  ticker.textContent = items
    .map(item => `📢 ${item.Message}`)
    .join("     •     ");
}

function updateCountdownAndBell() {
  const nextCountdown = document.getElementById("countdownText");
  const currentCountdown = document.getElementById("currentCountdownText");
  const alert = document.getElementById("bellAlert");

  const currentMinutes = getCurrentManilaMinutes();
  const periodState = latestData
    ? getDisplayPeriodState(latestData.schedule || [], latestData.currentSubject, latestData.nextSubject)
    : { currentPeriod: null, nextPeriod: null };
  const currentPeriod = periodState.currentPeriod;
  const nextPeriod = periodState.nextPeriod;

  if (currentCountdown) {
    if (!currentPeriod) {
      currentCountdown.textContent = "No ongoing period";
    } else {
      const endMinutes = timeToMinutes(currentPeriod.EndTime);
      const startMinutes = timeToMinutes(currentPeriod.StartTime);

      if (currentMinutes < startMinutes) {
        currentCountdown.textContent = `Starts in: ${formatMinutesCountdown(startMinutes - currentMinutes)}`;
      } else {
        const remaining = endMinutes - currentMinutes;

        if (remaining <= 0) {
          currentCountdown.textContent = "Ending soon";
        } else {
          currentCountdown.textContent = `Ends in: ${formatMinutesCountdown(remaining)}`;
        }
      }
    }
  }

  if (!nextPeriod) {
    if (nextCountdown) {
      nextCountdown.textContent = "No upcoming period";
    }

    if (alert) {
      alert.classList.add("hidden");
    }

    return;
  }

  const startMinutes = timeToMinutes(nextPeriod.StartTime);
  const diff = startMinutes - currentMinutes;

  if (diff <= 0) {
    if (nextCountdown) {
      nextCountdown.textContent = "Starting soon";
    }

    if (alert) {
      alert.classList.remove("hidden");
    }

    return;
  }

  if (nextCountdown) {
    nextCountdown.textContent = `Starts in: ${formatMinutesCountdown(diff)}`;
  }

  if (diff <= 5) {
    if (alert) {
      alert.textContent =
        `⏰ ${nextPeriod.Subject} starts in ${diff} minute${diff > 1 ? "s" : ""}`;

      alert.classList.remove("hidden");
    }
  } else {
    if (alert) {
      alert.classList.add("hidden");
    }
  }
}

function formatMinutesCountdown(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getCurrentManilaMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const hours = Number(parts.find(part => part.type === "hour")?.value || 0);
  const minutes = Number(parts.find(part => part.type === "minute")?.value || 0);

  return hours * 60 + minutes;
}

function getReadableTextColor(hexColor) {
  if (!hexColor || !hexColor.startsWith("#")) return "#111";

  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return "#111";

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#111" : "#fff";
}

function timeToMinutes(timeValue) {
  const text = String(timeValue || "").trim();

  const match =
    text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);

  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function startLiveClock() {
  updateClock();

  if (!window.clockInterval) {
    window.clockInterval = setInterval(() => {
      updateClock();
      updateCountdownAndBell();
      checkPrayerTimes();

      document.title =
        "SFK ClassBoard " + new Date().getSeconds();
    }, 1000);
  }
}

function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById("timeText");
  if (!timeEl) return;

  const isPhoneHeader = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;

  const formatterOptions = {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila"
  };

  if (!isPhoneHeader) {
    // Desktop/tablet should keep the original one-line browser text sizing.
    timeEl.textContent = new Intl.DateTimeFormat("en-US", formatterOptions).format(now);
    timeEl.classList.remove("phoneCompactTime");
    return;
  }

  const parts = new Intl.DateTimeFormat("en-US", formatterOptions).formatToParts(now);

  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";
  const hour = getPart("hour") || "--";
  const minute = getPart("minute") || "--";
  const second = getPart("second") || "--";
  const dayPeriod = getPart("dayPeriod") || "";

  timeEl.innerHTML = `
    <span class="timeMain">${hour}:${minute}</span><span class="timeSeconds">:${second}</span><span class="timePeriod">${dayPeriod}</span>
  `.trim();

  timeEl.classList.add("phoneCompactTime");
}

function startAutoScroll(id) {
  const box = document.getElementById(id);
  if (!box) return;

  let direction = 1;
  let paused = false;

  setInterval(() => {
    const maxScroll = box.scrollHeight - box.clientHeight;

    if (maxScroll <= 5 || paused) return;

    const nextScroll = box.scrollTop + direction;

    if (nextScroll >= maxScroll) {
      box.scrollTop = maxScroll;
      paused = true;

      setTimeout(() => {
        direction = -1;
        paused = false;
      }, 2000);

      return;
    }

    if (nextScroll <= 0) {
      box.scrollTop = 0;
      paused = true;

      setTimeout(() => {
        direction = 1;
        paused = false;
      }, 2000);

      return;
    }

    box.scrollTop = nextScroll;
  }, 180);
}

async function openWeeklySchedule() {
  const modal = document.getElementById("weeklyScheduleModal");
  if (!modal) return;

  modal.classList.remove("hidden");

  if (weeklyScheduleData.length === 0) {
    await loadWeeklySchedule();
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Manila"
  });

  const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  activeWeeklyDay = validDays.includes(today) ? today : "Monday";

  showWeeklyDay(activeWeeklyDay);
}

function closeWeeklySchedule() {
  const modal = document.getElementById("weeklyScheduleModal");
  if (!modal) return;

  modal.classList.add("hidden");
}

async function loadWeeklySchedule() {
  const content = document.getElementById("weeklyScheduleContent");

  if (content) {
    content.innerHTML = `<p>Loading weekly schedule...</p>`;
  }

  try {
    const response = await fetch(`${API_URL}?type=schedule`, {
      cache: "no-store"
    });

    const data = await response.json();

    console.log("Weekly schedule raw data:", data);

    if (Array.isArray(data)) {
      weeklyScheduleData = data;
      weeklyDailyInfoData = [];
    } else if (Array.isArray(data.schedule)) {
      weeklyScheduleData = data.schedule;
      weeklyDailyInfoData = Array.isArray(data.dailyInfo) ? data.dailyInfo : [];
    } else if (Array.isArray(data.data)) {
      weeklyScheduleData = data.data;
      weeklyDailyInfoData = Array.isArray(data.dailyInfo) ? data.dailyInfo : [];
    } else if (Array.isArray(data.rows)) {
      weeklyScheduleData = data.rows;
      weeklyDailyInfoData = Array.isArray(data.dailyInfo) ? data.dailyInfo : [];
    } else {
      weeklyScheduleData = [];
      weeklyDailyInfoData = [];
    }

    console.log("Weekly schedule parsed:", weeklyScheduleData);

  } catch (error) {
    console.error("Weekly schedule failed:", error);

    if (content) {
      content.innerHTML = `
        <p>Unable to load weekly schedule.</p>
      `;
    }
  }
}
function showWeeklyDay(day) {
  activeWeeklyDay = day;

  const content = document.getElementById("weeklyScheduleContent");
  if (!content) return;

  document.querySelectorAll(".weeklyTab").forEach(button => {
    button.classList.toggle("active", button.textContent.trim() === day);
  });

const dayItems = weeklyScheduleData
  .filter(item => {
    const itemDay = String(
      item.Day ||
      item.day ||
      item.DAY ||
      item.Weekday ||
      item.weekday ||
      ""
    ).trim().toLowerCase();

    return itemDay === day.toLowerCase();
  })
  .sort((a, b) => {
    const aStart = a.StartTime || a.startTime || a.Start || a.start || "";
    const bStart = b.StartTime || b.startTime || b.Start || b.start || "";

    return timeToMinutes(aStart) - timeToMinutes(bStart);
  });

  if (dayItems.length === 0) {
    content.innerHTML = `
      <div class="weeklyEmpty">
        <h3>${day}</h3>
        <p>No schedule found for this day.</p>
      </div>
    `;
    return;
  }

  const firstItem = dayItems[0];
  const lastItem = dayItems[dayItems.length - 1];

  const pasokTime = firstItem.StartTime || "--";
  const uwianTime = lastItem.EndTime || "--";
  const dailyInfo = getWeeklyDailyInfo(day);
  const entryGate = dailyInfo.EntryGate || dailyInfo.entryGate || "Gate 2";
  const exitGate = dailyInfo.ExitGate || dailyInfo.exitGate || "SHS Gate";
  const uniform = dailyInfo.Uniform || dailyInfo.uniform || "To be announced";

  content.innerHTML = `
    <div class="weeklyDayTitle">
      <div class="weeklyDayHeaderLine">
        <h3>${day}</h3>
        <div class="weeklyDayMeta">
          <span><b>Pasok:</b> ${pasokTime}</span>
          <span><b>Uwian:</b> ${uwianTime}</span>
          <span><b>Entry:</b> ${escapeHTML(entryGate)}</span>
          <span><b>Exit:</b> ${escapeHTML(exitGate)}</span>
          <span><b>Uniform:</b> ${escapeHTML(uniform)}</span>
        </div>
      </div>

      <div class="weeklyDaySummary weeklyDaySummaryCompact" aria-hidden="true">
        <div>
          <span>Pasok</span>
          <strong>${pasokTime}</strong>
        </div>

        <div>
          <span>Uwian</span>
          <strong>${uwianTime}</strong>
        </div>

        <div>
          <span>Entry Gate</span>
          <strong>${escapeHTML(entryGate)}</strong>
        </div>

        <div>
          <span>Exit Gate</span>
          <strong>${escapeHTML(exitGate)}</strong>
        </div>

        <div class="weeklyUniformInfo">
          <span>Uniform</span>
          <strong>${escapeHTML(uniform)}</strong>
        </div>
      </div>
    </div>

    <div class="weeklyList">
      ${dayItems.map(item => {
        const color = item.Color || getSubjectColor(item.Subject);
        const textColor = getReadableTextColor(color);

        return `
          <div class="weeklyItem" style="border-left-color:${color};">
            <div class="weeklyTime">
              ${item.StartTime || item.startTime || item.Start || ""} - ${item.EndTime || item.endTime || item.End || ""}
            </div>

            <div class="weeklySubject">
              <strong style="color:${textColor}; background:${color};">
                ${renderScheduleSubjectText(item, textColor)}
              </strong>

				<p>
				  ${item.Teacher || item.teacher || ""}
				  ${(item.Room || item.room) ? `• ${item.Room || item.room}` : ""}
				</p>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getWeeklyDailyInfo(day) {
  return (weeklyDailyInfoData || []).slice().reverse().find(item => {
    const itemDay = String(item.Day || item.day || "").trim().toLowerCase();
    return itemDay === String(day || "").trim().toLowerCase();
  }) || {};
}


/* ================================
   PRAYER AUDIO PLAYER SYSTEM
   12:00 PM = Angelus / Regina Caeli based on season
   3:00 PM = Three PM Prayer
   TEST: configurable time = Angelus

   This version does NOT autoplay and does NOT use bell audio.
   It opens a popup with a built-in audio player instead.
================================ */
function checkPrayerTimes() {
  const trigger = getCurrentPrayerTrigger();

  if (!trigger || !trigger.config || !trigger.triggerKey) return;
  if (lastPrayerTriggerKey === trigger.triggerKey) return;

  lastPrayerTriggerKey = trigger.triggerKey;
  showPrayerPlayerPopup(trigger.config);
}

function getCurrentPrayerTrigger() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const dateKey = `${getPartValue(parts, "year")}-${getPartValue(parts, "month")}-${getPartValue(parts, "day")}`;
  const hour = getPartValue(parts, "hour");
  const minute = getPartValue(parts, "minute");

  if (hour === "12" && minute === "00") {
    const config = getNoonPrayerConfig(dateKey);
    return {
      config,
      triggerKey: `${dateKey}-12PM-${config.audioSrc}`
    };
  }

  if (hour === "15" && minute === "00") {
    return {
      config: {
        icon: "🙏",
        title: "3:00 PM Prayer",
        subtitle: "Let us pause for the three o’clock prayer.",
        audioSrc: "three-pm-prayer.mp3"
      },
      triggerKey: `${dateKey}-3PM`
    };
  }

  if (PRAYER_TEST_TRIGGER_ENABLED && hour === PRAYER_TEST_HOUR && minute === PRAYER_TEST_MINUTE) {
    return {
      config: {
        icon: "🙏",
        title: "Angelus Test",
        subtitle: `${PRAYER_TEST_HOUR}:${PRAYER_TEST_MINUTE} test prayer player.`,
        audioSrc: "angelus.mp3"
      },
      triggerKey: `${dateKey}-${PRAYER_TEST_HOUR}${PRAYER_TEST_MINUTE}-TEST-ANGELUS-PLAYER`
    };
  }

  return null;
}

function getNoonPrayerConfig(dateKey) {
  if (dateKey >= "2027-03-28" && dateKey <= "2027-05-16") {
    return {
      icon: "👑",
      title: "Regina Caeli",
      subtitle: "Queen of Heaven • Easter Season",
      audioSrc: "regina-caeli.mp3"
    };
  }

  return {
    icon: "🙏",
    title: "Angelus",
    subtitle: "12:00 PM Prayer",
    audioSrc: "angelus.mp3"
  };
}

function showPrayerPlayerPopup(config) {
  const popup = document.getElementById("prayerPopup");
  const icon = document.getElementById("prayerPopupIcon");
  const title = document.getElementById("prayerPopupTitle");
  const subtitle = document.getElementById("prayerPopupSubtitle");
  const status = document.getElementById("prayerPopupStatus");
  const player = document.getElementById("prayerPlayer");

  if (!popup) return;

  if (icon) icon.textContent = config.icon || "🙏";
  if (title) title.textContent = config.title || "Prayer Time";
  if (subtitle) subtitle.textContent = config.subtitle || "Please pause for prayer.";
  if (status) status.textContent = "Press play below to start the prayer.";

  if (player) {
    player.pause();
    player.src = config.audioSrc;
    player.currentTime = 0;
    player.load();
  }

  popup.classList.remove("hidden");
}

function closePrayerPopup() {
  const popup = document.getElementById("prayerPopup");
  const player = document.getElementById("prayerPlayer");

  if (player) {
    player.pause();
    player.currentTime = 0;
  }

  if (popup) {
    popup.classList.add("hidden");
  }
}

// Kept for compatibility with older onclick handlers, if any.
function stopPrayerSequence() {
  closePrayerPopup();
}

function enableClassBoardSound() {
  showSoundAlert("Audio player mode is active. The prayer will use manual controls.");
}

function startClassBoardAudio() {
  enableClassBoardSound();
}

function updatePrayerPopupStatus(message) {
  const status = document.getElementById("prayerPopupStatus");
  if (status) {
    status.textContent = message;
  }
}

function showSoundAlert(message) {
  const alert = document.getElementById("bellAlert");
  if (!alert) return;

  alert.textContent = message;
  alert.classList.remove("hidden");

  clearTimeout(window.soundAlertTimer);
  window.soundAlertTimer = setTimeout(() => {
    alert.classList.add("hidden");
  }, 5000);
}

function getPartValue(parts, type) {
  return parts.find(part => part.type === type)?.value || "";
}

// initClassBoard() is called after the stable heart ledger override below.


/* ========================================================================
   STABLE HEART LEDGER V3
   Source of truth: settings collection documents with Kind=ClassBoardHeartLedgerV3.
   This avoids writing counts into announcement/memory records and avoids old broken
   HeartCount/HeartUsers fields. Counts are always calculated from actual heart docs.
======================================================================== */
const HEART_LEDGER_KIND_V3 = "ClassBoardHeartLedgerV3";
const HEART_LEDGER_COLLECTION_V3 = "settings";
const ANNOUNCEMENT_HEART_LEDGER_PENDING = new Set();

function getHeartLedgerDbV3() {
  try {
    if (window.SFK_CLASSBOARD_FIREBASE_DB) return window.SFK_CLASSBOARD_FIREBASE_DB;
    if (!window.firebase || !window.SFK_FIREBASE_READY) return null;
    if (!firebase.apps.length) firebase.initializeApp(window.SFK_FIREBASE_CONFIG);
    const db = firebase.firestore();
    window.SFK_CLASSBOARD_FIREBASE_DB = db;
    return db;
  } catch (error) {
    console.warn("Heart ledger database unavailable:", error);
    return null;
  }
}

function makeHeartLedgerTargetKeyV3(type, id) {
  return `${String(type || "record").trim()}:${String(id || "").trim()}`;
}

function makeAnnouncementHeartTargetKeyV3(itemOrId) {
  const id = typeof itemOrId === "object" ? getAnnouncementId(itemOrId) : String(itemOrId || "").trim();
  return makeHeartLedgerTargetKeyV3("announcement", id);
}

function hashHeartLedgerTextV3(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function makeHeartLedgerDocIdV3(targetKey, deviceId) {
  return `heartV3_${hashHeartLedgerTextV3(targetKey)}_${hashHeartLedgerTextV3(deviceId)}`;
}

async function readHeartLedgerSummaryV3(targetType, targetKeys) {
  const db = getHeartLedgerDbV3();
  const uniqueKeys = Array.from(new Set((targetKeys || []).map(String).filter(Boolean)));
  const summary = {};
  uniqueKeys.forEach(key => {
    summary[key] = { count: 0, mine: false };
  });

  if (!db || uniqueKeys.length === 0) return summary;

  const deviceId = getClassBoardHeartDeviceId();
  const targetSet = new Set(uniqueKeys);

  try {
    const snap = await db.collection(HEART_LEDGER_COLLECTION_V3)
      .where("Kind", "==", HEART_LEDGER_KIND_V3)
      .get();

    snap.forEach(doc => {
      const data = doc.data() || {};
      const key = String(data.TargetKey || "").trim();
      if (!targetSet.has(key)) return;
      if (String(data.TargetType || "").trim() !== String(targetType || "").trim()) return;
      if (data.Active === false) return;

      summary[key].count += 1;
      if (String(data.DeviceID || "") === deviceId) summary[key].mine = true;
    });
  } catch (error) {
    console.warn("Unable to read heart ledger:", error);
  }

  return summary;
}

async function saveHeartLedgerStateV3(targetType, targetKey, shouldHeart) {
  const db = getHeartLedgerDbV3();
  if (!db) throw new Error("Firebase is not ready for hearts.");

  const deviceId = getClassBoardHeartDeviceId();
  const cleanTargetKey = String(targetKey || "").trim();
  if (!cleanTargetKey) throw new Error("Missing heart target.");

  const docId = makeHeartLedgerDocIdV3(cleanTargetKey, deviceId);
  const ref = db.collection(HEART_LEDGER_COLLECTION_V3).doc(docId);

  if (shouldHeart) {
    const payload = {
      Kind: HEART_LEDGER_KIND_V3,
      TargetType: String(targetType || "record"),
      TargetKey: cleanTargetKey,
      DeviceID: deviceId,
      Active: true,
      UpdatedAtText: new Date().toISOString()
    };
    if (window.firebase?.firestore?.FieldValue) {
      payload.UpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
    }
    await ref.set(payload, { merge: true });
  } else {
    await ref.delete().catch(async () => {
      await ref.set({
        Kind: HEART_LEDGER_KIND_V3,
        TargetType: String(targetType || "record"),
        TargetKey: cleanTargetKey,
        DeviceID: deviceId,
        Active: false,
        UpdatedAtText: new Date().toISOString()
      }, { merge: true });
    });
  }

  const summary = await readHeartLedgerSummaryV3(targetType, [cleanTargetKey]);
  return {
    success: true,
    hearted: Boolean(summary[cleanTargetKey]?.mine),
    count: Number(summary[cleanTargetKey]?.count || 0),
    targetKey: cleanTargetKey
  };
}

async function hydrateAnnouncementHeartsV3(announcements) {
  if (!Array.isArray(announcements) || announcements.length === 0) return announcements;
  const keys = announcements.map(item => makeAnnouncementHeartTargetKeyV3(item));
  const summary = await readHeartLedgerSummaryV3("announcement", keys);
  announcements.forEach(item => {
    const key = makeAnnouncementHeartTargetKeyV3(item);
    const info = summary[key] || { count: 0, mine: false };
    item._heartV3TargetKey = key;
    item._heartV3Count = Number(info.count || 0);
    item._heartV3Mine = Boolean(info.mine);
  });
  return announcements;
}

// Override the original loader so heart counts come from the ledger before rendering.
loadClassBoard = async function loadClassBoardWithHeartLedger() {
  if (isFetching) return;
  isFetching = true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(`${API_URL}?type=today`, {
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await response.json();
    if (Array.isArray(data.announcements)) {
      await hydrateAnnouncementHeartsV3(data.announcements);
    }

    const newDataString = JSON.stringify(data);
    localStorage.setItem(CACHE_KEY, newDataString);

    if (newDataString !== latestDataString) {
      latestDataString = newDataString;
      latestData = data;
      renderDashboard(data);
    } else {
      latestData = data;
      updateCountdownAndBell();
      renderCleanersToday();
    }
  } catch (error) {
    console.error("ClassBoard fetch failed:", error);
    if (!latestData) {
      const title = document.getElementById("dashboardTitle");
      if (title) title.textContent = "Unable to load ClassBoard";
    }
  } finally {
    isFetching = false;
  }
};

renderAnnouncementHeartButton = function renderAnnouncementHeartButtonV3(item) {
  if (!shouldShowAnnouncementHeart(item)) return `<span class="announcement-heart-spacer"></span>`;
  const id = getAnnouncementId(item);
  const count = getAnnouncementHeartCount(item);
  const isHearted = isAnnouncementHeartedByThisDevice(item);
  return `
    <button
      class="announcement-heart-btn ${isHearted ? "is-hearted" : ""}"
      type="button"
      data-announcement-id="${escapeAttr(id)}"
      onclick="return heartAnnouncement('${escapeJsAttribute(id)}')"
      ${!id ? "disabled" : ""}
      aria-label="Acknowledge this announcement">
      <span class="heart-icon">${isHearted ? "❤️" : "🤍"}</span>
      <span>Noted</span>
      <strong>${count}</strong>
    </button>
  `;
};

getAnnouncementHeartCount = function getAnnouncementHeartCountV3(item) {
  const value = Number(item?._heartV3Count);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

isAnnouncementHeartedByThisDevice = function isAnnouncementHeartedByThisDeviceV3(item) {
  return Boolean(item?._heartV3Mine);
};

syncAnnouncementHeartStatesFromServer = function syncAnnouncementHeartStatesFromServerV3() {
  // No-op. Heart state comes from the Firestore ledger, not localStorage.
};

heartAnnouncement = async function heartAnnouncementV3(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId || ANNOUNCEMENT_HEART_LEDGER_PENDING.has(cleanId)) return false;

  const item = findAnnouncementById(cleanId);
  if (!item) {
    console.warn("Announcement not found for heart:", cleanId);
    return false;
  }

  const targetKey = makeAnnouncementHeartTargetKeyV3(item);
  const nextHearted = !Boolean(item._heartV3Mine);
  ANNOUNCEMENT_HEART_LEDGER_PENDING.add(cleanId);
  setAnnouncementHeartButtonSaving(cleanId, true);

  try {
    const result = await saveHeartLedgerStateV3("announcement", targetKey, nextHearted);
    if (latestData && Array.isArray(latestData.announcements)) {
      latestData.announcements.forEach(record => {
        if (getAnnouncementId(record) === cleanId) {
          record._heartV3TargetKey = targetKey;
          record._heartV3Count = result.count;
          record._heartV3Mine = result.hearted;
        }
      });
      latestDataString = JSON.stringify(latestData);
      localStorage.setItem(CACHE_KEY, latestDataString);
    }
    renderAnnouncements(latestData?.announcements || []);
  } catch (error) {
    console.error("Announcement heart failed:", error);
    alert("Unable to save Noted. Please refresh and try again.");
  } finally {
    ANNOUNCEMENT_HEART_LEDGER_PENDING.delete(cleanId);
    setAnnouncementHeartButtonSaving(cleanId, false);
  }

  return false;
};

initClassBoard();
