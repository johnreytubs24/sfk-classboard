const API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const DATA_REFRESH_MS = 5000;
const ANNOUNCEMENT_ROTATE_MS = 10000;
const BIRTHDAY_ROTATE_MS = 30000;
const CACHE_KEY = "sfkClassBoardData";

/* PRAYER AUDIO PLAYER SYSTEM
   No autoplay / no bell.
   Prayer popup appears at scheduled/test time with a manual audio player.
*/
const PRAYER_TEST_TRIGGER_ENABLED = true;
const PRAYER_TEST_HOUR = "00";
const PRAYER_TEST_MINUTE = "59";

let latestData = null;
let latestDataString = "";
let announcementIndex = 0;
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

  setInterval(loadClassBoard, DATA_REFRESH_MS);
  setInterval(rotateAnnouncements, ANNOUNCEMENT_ROTATE_MS);
  setInterval(rotateBirthdays, BIRTHDAY_ROTATE_MS);
  setInterval(renderCleanersToday, 60000);

  setTimeout(() => {
    startAutoScroll("thingsList");
    startAutoScroll("reminderList");
  }, 1500);

  syncTodayScheduleToggle();
  window.addEventListener("resize", syncTodayScheduleToggle);
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
  renderSchedule(data.schedule, data.currentSubject);
  renderAnnouncements(data.announcements || []);
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
  const secondPeriod = sortedSchedule[1] || null;
  const oneHour = 60;

  let currentPeriod = currentSubject || null;
  let nextPeriod = nextSubject || null;

  if (!currentPeriod && firstPeriod && firstStart !== null && nowMinutes >= firstStart - oneHour && nowMinutes < firstStart) {
    currentPeriod = firstPeriod;
    nextPeriod = secondPeriod;
  }

  if (!currentPeriod && !nextPeriod && lastPeriod && lastEnd !== null && nowMinutes >= lastEnd && nowMinutes < lastEnd + oneHour) {
    currentPeriod = lastPeriod;
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

  title.textContent = `Subject Announcements (${currentNumber} / ${total})`;

  box.innerHTML = `
    <div class="announcement-item rotating-announcement ${announcementSizeClass}">

      <div class="announcement-top-left">
        <span class="announcement-subject-pill"
              style="background:${subjectColor}; color:${subjectTextColor};">
          ${iconFor(item.Subject)} ${item.Subject}

          <span class="priority-mini">
            ${item.Priority || "Reminder"}
          </span>
        </span>
      </div>

      <div class="announcement-center-content">
        <div class="announcement-main-text">
          ${formattedAnnouncement}
        </div>

        <div class="announcement-footer">
          📅 Deadline: ${item.Deadline || "None"} • 👤 ${item.Teacher || ""}
        </div>
      </div>

      <div class="announcement-controls">
        <button class="announcement-btn prev-btn" onclick="previousAnnouncement()">← Previous</button>
        <button class="announcement-btn next-btn" onclick="nextAnnouncement()">Next →</button>
      </div>

    </div>
  `;
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

  return "announcement-size-normal";
}

function rotateAnnouncements() {
  if (!latestData || !latestData.announcements || latestData.announcements.length === 0) return;

  announcementIndex++;
  renderAnnouncements(latestData.announcements);
}

function previousAnnouncement() {
  if (!latestData || !latestData.announcements || latestData.announcements.length === 0) return;

  announcementIndex--;

  if (announcementIndex < 0) {
    announcementIndex = latestData.announcements.length - 1;
  }

  renderAnnouncements(latestData.announcements);
}

function nextAnnouncement() {
  if (!latestData || !latestData.announcements || latestData.announcements.length === 0) return;

  announcementIndex++;
  renderAnnouncements(latestData.announcements);
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

  if (diffDays <= 7) {
    return {
      type: "this-week",
      label: `🟡 THIS WEEK • ${formatShortBringDate(dueParts)}`,
      className: "status-this-week",
      priority: 4,
      sortValue: dueUTC
    };
  }

  return {
    type: "future",
    label: `🟢 ${formatShortBringDate(dueParts)}`,
    className: "status-future",
    priority: 5,
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
  const rawLines = String(value || "")
    .replace(/\r/g, "")
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

function stripBoardTextFormatTag(value) {
  return String(value || "")
    .replace(/\r/g, "")
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

  document.getElementById("timeText").textContent =
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Manila"
    });
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

initClassBoard();
