const OFFICER_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const OFFICER_PIN = "SFK2627";
const OFFICER_LOGIN_KEY = "sfkOfficerLoggedIn";

let currentOfficerSheet = "";
let latestOfficerTableData = null;
let selectedOfficerRows = new Set();

const TEXT_FORMAT_OPTIONS = ["center", "left", "right", "bullets", "numbers"];

document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem(OFFICER_LOGIN_KEY) === "YES") {
    showOfficerPanel();
  }

  const pinInput = document.getElementById("officerPin");
  if (pinInput) {
    pinInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        loginOfficer();
      }
    });
  }

  setTodayForOfficerDateInputs();
});

function loginOfficer() {
  const pinInput = document.getElementById("officerPin");
  const message = document.getElementById("officerLoginMessage");

  const pin = pinInput.value.trim();

  if (pin === OFFICER_PIN) {
    localStorage.setItem(OFFICER_LOGIN_KEY, "YES");
    showOfficerPanel();
    pinInput.value = "";
    message.textContent = "";
  } else {
    message.textContent = "Incorrect Officer PIN. Please try again.";
    pinInput.value = "";
    pinInput.focus();
  }
}

function logoutOfficer() {
  localStorage.removeItem(OFFICER_LOGIN_KEY);

  document.getElementById("officerLoginScreen").classList.remove("hidden");
  document.getElementById("officerPanel").classList.add("hidden");
}

function showOfficerPanel() {
  document.getElementById("officerLoginScreen").classList.add("hidden");
  document.getElementById("officerPanel").classList.remove("hidden");

  setTodayForOfficerDateInputs();
}

function setTodayForOfficerDateInputs() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila"
  });

  const dateInputs = [
    "officerAnnouncementDate",
    "officerAnnouncementDeadline",
    "officerThingsDate",
    "officerPrayerDate",
    "officerQuoteDate",
    "officerBirthdayDate"
  ];

  dateInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.value) {
      input.value = today;
    }
  });
}

async function sendOfficerData(kind, payload) {
  showOfficerToast("Saving...");

  try {
    const response = await fetch(OFFICER_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "officerAdd",
        payload: {
          kind,
          ...payload
        }
      })
    });

    const result = await response.json();

    if (result.success) {
      showOfficerToast("Saved successfully.");

      if (currentOfficerSheet) {
        refreshCurrentOfficerTable();
      }

      return true;
    }

    showOfficerToast(result.message || "Failed to save.");
    return false;

  } catch (error) {
    console.error(error);
    showOfficerToast("Error saving data.");
    return false;
  }
}

function showOfficerToast(message) {
  const toast = document.getElementById("officerToast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(window.officerToastTimer);
  window.officerToastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

function clearOfficerFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === "SELECT") {
      el.selectedIndex = 0;
    } else {
      el.value = "";
    }
  });

  setTodayForOfficerDateInputs();
}

/* SUBJECT ANNOUNCEMENT */
async function saveOfficerAnnouncement() {
  const announcementText = document.getElementById("officerAnnouncementText").value.trim();
  const announcementFormat = document.getElementById("officerAnnouncementFormat").value;

  const payload = {
    Date: document.getElementById("officerAnnouncementDate").value,
    Subject: document.getElementById("officerAnnouncementSubject").value,
    Announcement: applyTextFormat(announcementText, announcementFormat),
    Teacher: document.getElementById("officerAnnouncementTeacher").value,
    Deadline: document.getElementById("officerAnnouncementDeadline").value,
    Priority: document.getElementById("officerAnnouncementPriority").value,
    Publish: document.getElementById("officerAnnouncementPublish").value
  };

  if (!payload.Date || !payload.Subject || !payload.Announcement || !payload.Teacher) {
    showOfficerToast("Date, subject, teacher, and announcement are required.");
    return;
  }

  const saved = await sendOfficerData("announcement", payload);

  if (saved) {
    clearOfficerFields([
      "officerAnnouncementDate",
      "officerAnnouncementSubject",
      "officerAnnouncementText",
      "officerAnnouncementFormat",
      "officerAnnouncementTeacher",
      "officerAnnouncementDeadline",
      "officerAnnouncementPriority",
      "officerAnnouncementPublish"
    ]);
  }
}

/* THINGS TO BRING */
async function saveOfficerThings() {
  const itemText = document.getElementById("officerThingsItem").value.trim();
  const itemFormat = document.getElementById("officerThingsFormat").value;

  const payload = {
    Date: document.getElementById("officerThingsDate").value,
    Subject: document.getElementById("officerThingsSubject").value,
    Item: applyTextFormat(itemText, itemFormat),
    Publish: document.getElementById("officerThingsPublish").value
  };

  if (!payload.Date || !payload.Subject || !payload.Item) {
    showOfficerToast("Date, subject, and item are required.");
    return;
  }

  const saved = await sendOfficerData("things", payload);

  if (saved) {
    clearOfficerFields([
      "officerThingsDate",
      "officerThingsSubject",
      "officerThingsItem",
      "officerThingsFormat",
      "officerThingsPublish"
    ]);
  }
}

/* PRAYER LEADER */
async function saveOfficerPrayer() {
  const payload = {
    Date: document.getElementById("officerPrayerDate").value,
    PrayerLeader: document.getElementById("officerPrayerName").value.trim(),
    Publish: document.getElementById("officerPrayerPublish").value
  };

  if (!payload.Date || !payload.PrayerLeader) {
    showOfficerToast("Date and prayer leader are required.");
    return;
  }

  const saved = await sendOfficerData("prayer", payload);

  if (saved) {
    clearOfficerFields([
      "officerPrayerDate",
      "officerPrayerName",
      "officerPrayerPublish"
    ]);
  }
}

/* DAILY KINDNESS QUOTE */
async function saveOfficerQuote() {
  const payload = {
    Date: document.getElementById("officerQuoteDate").value,
    Quote: document.getElementById("officerQuoteText").value.trim(),
    Author: document.getElementById("officerQuoteAuthor").value.trim(),
    Publish: document.getElementById("officerQuotePublish").value
  };

  if (!payload.Date || !payload.Quote) {
    showOfficerToast("Date and quote are required.");
    return;
  }

  const saved = await sendOfficerData("quote", payload);

  if (saved) {
    clearOfficerFields([
      "officerQuoteDate",
      "officerQuoteText",
      "officerQuoteAuthor",
      "officerQuotePublish"
    ]);
  }
}

/* BIRTHDAY GREETINGS */
async function saveOfficerBirthday() {
  const payload = {
    Name: document.getElementById("officerBirthdayName").value.trim(),
    Birthday: document.getElementById("officerBirthdayDate").value,
    Publish: document.getElementById("officerBirthdayPublish").value
  };

  if (!payload.Name || !payload.Birthday) {
    showOfficerToast("Name and birthday are required.");
    return;
  }

  const saved = await sendOfficerData("birthday", payload);

  if (saved) {
    clearOfficerFields([
      "officerBirthdayName",
      "officerBirthdayDate",
      "officerBirthdayPublish"
    ]);
  }
}

/* MANAGE EXISTING DATA - VIEW + HIDE ONLY */
async function loadOfficerTable(sheetName, buttonEl) {
  currentOfficerSheet = sheetName;
  selectedOfficerRows = new Set();

  setActiveOfficerTab(buttonEl);
  setOfficerManageStatus(`Loading ${formatSheetLabel(sheetName)}...`);

  const tableHead = document.querySelector("#officerDataTable thead");
  const tableBody = document.querySelector("#officerDataTable tbody");

  if (!tableHead || !tableBody) {
    showOfficerToast("Officer table not found in officer.html.");
    return;
  }

  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  try {
    const response = await fetch(`${OFFICER_API_URL}?type=officerList&sheet=${encodeURIComponent(sheetName)}`, {
      cache: "no-store"
    });

    const result = await response.json();

    if (result.status !== "success") {
      setOfficerManageStatus(result.message || "Unable to load data.");
      return;
    }

    latestOfficerTableData = result;
    renderOfficerTable(result);

  } catch (error) {
    console.error(error);
    setOfficerManageStatus("Error loading data.");
  }
}

function renderOfficerTable(result) {
  const tableHead = document.querySelector("#officerDataTable thead");
  const tableBody = document.querySelector("#officerDataTable tbody");

  const headers = result.headers || [];
  const rows = result.rows || [];

  if (!tableHead || !tableBody) return;

  if (headers.length === 0) {
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    setOfficerManageStatus(`${formatSheetLabel(result.sheetName)} has no headers.`);
    return;
  }

  tableHead.innerHTML = `
    <tr>
      <th>Select</th>
      <th>Action</th>
      <th>Row</th>
      ${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}
    </tr>
  `;

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${headers.length + 3}" class="emptyCell">
          No data found.
        </td>
      </tr>
    `;

    setOfficerManageStatus(`${formatSheetLabel(result.sheetName)} loaded. No records yet.`);
    return;
  }

  tableBody.innerHTML = rows.map(row => {
    return `
      <tr>
        <td class="selectCell">
          <input type="checkbox" class="rowSelectInput" data-row="${row.rowNumber}" onchange="toggleOfficerRowSelection(${row.rowNumber}, this.checked)" />
        </td>

        <td>
          <div class="actionCell">
            <button class="tableActionBtn hideBtn" onclick="hideOfficerRecord(${row.rowNumber})">Hide</button>
          </div>
        </td>

        <td class="rowNumberCell">#${row.rowNumber}</td>

        ${headers.map((header, index) => {
          const value = row.cells[index] || "";
          return `
            <td class="${value ? "" : "emptyCell"}">
              ${value ? escapeHtml(value) : "—"}
            </td>
          `;
        }).join("")}
      </tr>
    `;
  }).join("");

  setOfficerManageStatus(`${formatSheetLabel(result.sheetName)} loaded. ${rows.length} record(s) found.`);
  attachOfficerLongPressSelection();
}

function toggleOfficerRowSelection(rowNumber, checked) {
  const numericRow = Number(rowNumber);

  if (checked) {
    selectedOfficerRows.add(numericRow);
  } else {
    selectedOfficerRows.delete(numericRow);
  }

  syncOfficerSelectedRows();
}

function syncOfficerSelectedRows() {
  document.querySelectorAll("#officerDataTable tbody tr").forEach(row => {
    const checkbox = row.querySelector(".rowSelectInput");
    if (!checkbox) return;

    const rowNumber = Number(checkbox.dataset.row);
    const selected = selectedOfficerRows.has(rowNumber);
    checkbox.checked = selected;
    row.classList.toggle("selectedRow", selected);
  });

  const count = selectedOfficerRows.size;
  if (currentOfficerSheet && latestOfficerTableData) {
    setOfficerManageStatus(`${formatSheetLabel(currentOfficerSheet)} loaded. ${latestOfficerTableData.rows.length} record(s) found. ${count} selected.`);
  }
}

function selectAllOfficerRows() {
  if (!latestOfficerTableData || !latestOfficerTableData.rows) return;
  selectedOfficerRows = new Set(latestOfficerTableData.rows.map(row => Number(row.rowNumber)));
  syncOfficerSelectedRows();
}

function clearOfficerSelection() {
  selectedOfficerRows = new Set();
  syncOfficerSelectedRows();
}

function attachOfficerLongPressSelection() {
  document.querySelectorAll("#officerDataTable tbody tr").forEach(row => {
    const checkbox = row.querySelector(".rowSelectInput");
    if (!checkbox) return;

    const rowNumber = Number(checkbox.dataset.row);
    let timer = null;

    row.addEventListener("touchstart", () => {
      timer = setTimeout(() => {
        toggleOfficerRowSelection(rowNumber, !selectedOfficerRows.has(rowNumber));
      }, 550);
    }, { passive: true });

    row.addEventListener("touchend", () => clearTimeout(timer));
    row.addEventListener("touchmove", () => clearTimeout(timer));
    row.addEventListener("touchcancel", () => clearTimeout(timer));
  });
}

async function hideSelectedOfficerRecords() {
  if (!currentOfficerSheet) {
    showOfficerToast("Select a category first.");
    return;
  }

  const rowNumbers = Array.from(selectedOfficerRows).sort((a, b) => a - b);

  if (rowNumbers.length === 0) {
    showOfficerToast("Select at least one record.");
    return;
  }

  const confirmed = confirm(`Hide ${rowNumbers.length} selected record(s)?`);
  if (!confirmed) return;

  showOfficerToast("Hiding selected records...");

  try {
    const response = await fetch(OFFICER_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "officerBatchHide",
        payload: {
          sheetName: currentOfficerSheet,
          rowNumbers
        }
      })
    });

    const result = await response.json();

    if (result.success) {
      showOfficerToast(result.message || "Selected records hidden.");
      selectedOfficerRows = new Set();
      refreshCurrentOfficerTable();
      return;
    }

    showOfficerToast(result.message || "Failed to hide selected records.");
  } catch (error) {
    console.error(error);
    showOfficerToast("Error hiding selected records.");
  }
}

async function hideOfficerRecord(rowNumber) {
  if (!currentOfficerSheet) {
    showOfficerToast("Select a category first.");
    return;
  }

  const confirmed = confirm("Hide this record? This will set Publish to NO.");

  if (!confirmed) return;

  showOfficerToast("Hiding record...");

  try {
    const response = await fetch(OFFICER_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "officerHide",
        payload: {
          sheetName: currentOfficerSheet,
          rowNumber
        }
      })
    });

    const result = await response.json();

    if (result.success) {
      showOfficerToast("Record hidden.");
      refreshCurrentOfficerTable();
      return;
    }

    showOfficerToast(result.message || "Failed to hide record.");

  } catch (error) {
    console.error(error);
    showOfficerToast("Error hiding record.");
  }
}

function refreshCurrentOfficerTable() {
  if (!currentOfficerSheet) {
    setOfficerManageStatus("Select a category first.");
    return;
  }

  loadOfficerTable(currentOfficerSheet);
}

function setActiveOfficerTab(buttonEl) {
  document.querySelectorAll(".manageTabs button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (buttonEl) {
    buttonEl.classList.add("active");
    return;
  }

  const buttons = document.querySelectorAll(".manageTabs button");

  buttons.forEach(btn => {
    const onclickValue = btn.getAttribute("onclick") || "";

    if (onclickValue.includes(currentOfficerSheet)) {
      btn.classList.add("active");
    }
  });
}

function setOfficerManageStatus(message) {
  const status = document.getElementById("officerManageStatus");
  if (status) {
    status.textContent = message;
  }
}

function applyTextFormat(text, format) {
  const cleanText = stripTextFormatTag(text).trim();
  const cleanFormat = TEXT_FORMAT_OPTIONS.includes(format) ? format : "left";

  if (!cleanText) return "";

  return `[${cleanFormat}]\n${cleanText}`;
}

function stripTextFormatTag(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\[(center|left|right|bullets|numbers)\]\s*\n?/i, "");
}

function formatSheetLabel(sheetName) {
  const labels = {
    Announcements: "Announcements",
    ThingsToBring: "Things to Bring",
    PrayerLeaders: "Prayer Leaders",
    DailyQuotes: "Daily Quotes",
    Birthdays: "Birthday Greetings"
  };

  return labels[sheetName] || sheetName;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
