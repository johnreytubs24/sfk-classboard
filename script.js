const API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const DATA_REFRESH_MS = 5000;
const ANNOUNCEMENT_ROTATE_MS = 10000;
const BIRTHDAY_ROTATE_MS = 15000;
const CACHE_KEY = "sfkClassBoardData";

let latestData = null;
let latestDataString = "";
let announcementIndex = 0;
let birthdayIndex = 0;
let isFetching = false;

const subjectIcons = {
  english: "📘",
  math: "🧮",
  mathematics: "🧮",
  science: "🔬",
  ict: "💻",
  filipino: "📖",
  filipno: "📖",
  mapeh: "🎵🎨⚽❤️",
  music: "🎵",
  arts: "🎨",
  pe: "⚽",
  health: "❤️",
  ap: "🌏",
  araling: "🌏",
  cled: "🙏",
  christian: "🙏",
  religion: "🙏",
  le: "🙏",
  homeroom: "🏠",
  assembly: "📣",
  mass: "⛪",
  break: "🍽️",
  recess: "🍽️",
  lunch: "🍱"
};

function initClassBoard() {
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
      renderBirthdays(data.birthdays || []);
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

  renderCurrentSubject(data.currentSubject);
  renderNextSubject(data.nextSubject);
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

function renderCurrentSubject(item) {
  const card = document.querySelector(".current");

  if (item) {
    const color = item.Color || getSubjectColor(item.Subject);
    card.style.background = color;
    card.style.color = getReadableTextColor(color);

    document.getElementById("currentSubject").textContent =
      `${iconFor(item.Subject)} ${item.Subject}`;

    document.getElementById("currentDetails").textContent =
      `${item.StartTime} - ${item.EndTime} • ${item.Teacher} • ${item.Room}`;
  } else {
    card.style.background = "#111";
    card.style.color = "#fff";

    document.getElementById("currentSubject").textContent =
      "No current subject";

    document.getElementById("currentDetails").textContent =
      "Free time / no class";

    const currentCountdown = document.getElementById("currentCountdownText");
    if (currentCountdown) {
      currentCountdown.textContent = "No ongoing class";
    }
  }
}

function renderNextSubject(item) {
  const card = document.querySelector(".next");

  if (item) {
    const color = item.Color || getSubjectColor(item.Subject);
    card.style.background = color;
    card.style.color = getReadableTextColor(color);

    document.getElementById("nextSubject").textContent =
      `${iconFor(item.Subject)} ${item.Subject}`;

    document.getElementById("nextDetails").textContent =
      `${item.StartTime} - ${item.EndTime} • ${item.Teacher} • ${item.Room}`;
  } else {
    card.style.background = "#fff7c7";
    card.style.color = "#111";

    document.getElementById("nextSubject").textContent =
      "No next subject";

    document.getElementById("nextDetails").textContent =
      "End of schedule";

    document.getElementById("countdownText").textContent =
      "No upcoming class";
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
    box.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

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
        ${isCurrent ? `<div class="current-badge">▶ CURRENT CLASS</div>` : ""}
        <strong>${item.StartTime} - ${item.EndTime}</strong><br>
        <span class="subject-name">${iconFor(item.Subject)} ${item.Subject}</span><br>
        <small style="color:${textColor}; opacity:.85;">${item.Teacher} • ${item.Room}</small>
      </div>
    `;
  }).join("");

  scrollToCurrentSchedule();
}

function scrollToCurrentSchedule() {
  const scheduleBox = document.getElementById("scheduleList");
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
    } else {
      scheduleBox.scrollTo({
        top: 0,
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

  title.textContent = `Subject Announcements (${currentNumber} / ${total})`;

  box.innerHTML = `
    <div class="announcement-item rotating-announcement">

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
          ${item.Announcement || ""}
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

  if (!box) return;

  if (!items || items.length === 0) {
    box.innerHTML = `<p>No things to bring yet.</p>`;
    return;
  }

  box.innerHTML = items.map(item => {
    const subject = item.Subject || "Reminder";
    const date = item.Date || "";
    const itemText = item.Item || item.Things || item.Reminder || item.Description || "";

    return `
      <div class="thing-item">
        <strong>
          ${iconFor(subject)} ${subject}
          ${date ? `<small class="thing-date">(${date})</small>` : ""}
        </strong><br>
        ${itemText}
      </div>
    `;
  }).join("");
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
        ${reminder}
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

  box.innerHTML = `
    <div class="birthdayItem">
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

  if (currentCountdown) {
    if (!latestData || !latestData.currentSubject) {
      currentCountdown.textContent = "No ongoing class";
    } else {
      const endMinutes = timeToMinutes(latestData.currentSubject.EndTime);
      const remaining = endMinutes - currentMinutes;

      if (remaining <= 0) {
        currentCountdown.textContent = "Ending soon";
      } else {
        currentCountdown.textContent = `Ends in: ${formatMinutesCountdown(remaining)}`;
      }
    }
  }

  if (!latestData || !latestData.nextSubject) {
    if (nextCountdown) {
      nextCountdown.textContent = "No upcoming class";
    }

    if (alert) {
      alert.classList.add("hidden");
    }

    return;
  }

  const startMinutes = timeToMinutes(latestData.nextSubject.StartTime);
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
        `⏰ ${latestData.nextSubject.Subject} starts in ${diff} minute${diff > 1 ? "s" : ""}`;

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

initClassBoard();