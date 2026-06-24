const OFFICER_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const OFFICER_PIN = "SFK2627";
const OFFICER_LOGIN_KEY = "sfkOfficerLoggedIn";

let currentOfficerSheet = "";
let latestOfficerTableData = null;
let selectedOfficerRows = new Set();
let activeOfficerTool = null;

const TEXT_FORMAT_OPTIONS = ["center", "left", "right", "bullets", "numbers"];
const MAX_ANNOUNCEMENT_ATTACHMENTS = 5;
const MAX_ANNOUNCEMENT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

document.addEventListener("DOMContentLoaded", () => {
  initOfficerToolLauncher();

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
  closeOfficerTool();

  document.getElementById("officerLoginScreen").classList.remove("hidden");
  document.getElementById("officerPanel").classList.add("hidden");
}

function showOfficerPanel() {
  document.getElementById("officerLoginScreen").classList.add("hidden");
  document.getElementById("officerPanel").classList.remove("hidden");

  initOfficerToolLauncher();
  setTodayForOfficerDateInputs();
}

function initOfficerToolLauncher() {
  const panel = document.getElementById("officerPanel");
  const grid = document.querySelector(".officerGrid");
  const managePanel = document.querySelector(".managePanel");
  if (!panel || !grid || panel.dataset.toolsReady === "true") return;

  panel.dataset.toolsReady = "true";
  panel.classList.add("toolsReady");

  const launcher = document.createElement("section");
  launcher.className = "toolLauncher";
  launcher.setAttribute("aria-label", "Officer tools");
  launcher.innerHTML = `
    <div class="toolLauncherHeader">
      <div>
        <p class="toolEyebrow">Choose action</p>
        <h2>What do you want to open?</h2>
      </div>
      <span>Forms are hidden until needed.</span>
    </div>
    <div class="toolLauncherGrid"></div>
  `;

  const launcherGrid = launcher.querySelector(".toolLauncherGrid");
  Array.from(grid.querySelectorAll(".formCard")).forEach((card, index) => {
    const title = card.querySelector("h2")?.textContent?.trim() || `Tool ${index + 1}`;
    const button = document.createElement("button");
    button.className = "toolLaunchButton";
    button.type = "button";
    button.innerHTML = `<strong>${escapeOfficerText(title)}</strong><small>Create or publish this item</small>`;
    button.addEventListener("click", () => openOfficerTool(card, title));
    launcherGrid.appendChild(button);
  });

  if (managePanel) {
    const button = document.createElement("button");
    button.className = "toolLaunchButton manageLaunchButton";
    button.type = "button";
    button.innerHTML = `<strong>🗂 Manage Existing Data</strong><small>View and hide records if needed</small>`;
    button.addEventListener("click", () => openOfficerTool(managePanel, "Manage Existing Data"));
    launcherGrid.appendChild(button);
  }

  panel.insertBefore(launcher, grid);

  const modal = document.createElement("div");
  modal.id = "officerToolModal";
  modal.className = "toolModal hidden";
  modal.innerHTML = `
    <div class="toolModalBackdrop" data-officer-tool-close></div>
    <section class="toolModalCard" role="dialog" aria-modal="true" aria-labelledby="officerToolModalTitle">
      <header class="toolModalHeader">
        <div>
          <p class="toolEyebrow">SFK Officers</p>
          <h2 id="officerToolModalTitle">Tool</h2>
        </div>
        <button class="toolModalClose" type="button" data-officer-tool-close aria-label="Close">×</button>
      </header>
      <div id="officerToolModalContent" class="toolModalContent"></div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-officer-tool-close]")) closeOfficerTool();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeOfficerTool();
  });
}

function openOfficerTool(element, title) {
  if (!element) return;
  closeOfficerTool();

  const modal = document.getElementById("officerToolModal");
  const content = document.getElementById("officerToolModalContent");
  const titleElement = document.getElementById("officerToolModalTitle");
  if (!modal || !content || !titleElement) return;

  activeOfficerTool = {
    element,
    parent: element.parentNode,
    nextSibling: element.nextSibling
  };

  titleElement.textContent = title.replace(/^[^\w]+/, "").trim() || title;
  content.appendChild(element);
  element.classList.add("toolModalPanel");
  modal.classList.toggle("toolModalManage", element.classList.contains("managePanel"));
  modal.classList.remove("hidden");
  document.body.classList.add("toolModalOpen");

  const firstInput = element.querySelector("input, textarea, select, button");
  window.setTimeout(() => firstInput?.focus({ preventScroll: true }), 80);
}

function closeOfficerTool() {
  const modal = document.getElementById("officerToolModal");
  const content = document.getElementById("officerToolModalContent");

  if (activeOfficerTool?.element && activeOfficerTool.parent) {
    activeOfficerTool.element.classList.remove("toolModalPanel");
    activeOfficerTool.parent.insertBefore(activeOfficerTool.element, activeOfficerTool.nextSibling);
  }

  activeOfficerTool = null;
  if (content) content.innerHTML = "";
  modal?.classList.add("hidden");
  modal?.classList.remove("toolModalManage");
  document.body.classList.remove("toolModalOpen");
}

function escapeOfficerText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const attachmentFiles = await buildOfficerAttachmentPayload("officerAnnouncementAttachments", showOfficerToast);

  if (attachmentFiles === null) return;

  const payload = {
    Date: document.getElementById("officerAnnouncementDate").value,
    Subject: document.getElementById("officerAnnouncementSubject").value,
    Announcement: applyTextFormat(announcementText, announcementFormat),
    Teacher: document.getElementById("officerAnnouncementTeacher").value,
    OfficerPosition: document.getElementById("officerAnnouncementPosition").value,
    Deadline: document.getElementById("officerAnnouncementDeadline").value,
    ShowDeadline: document.getElementById("officerAnnouncementShowDeadline").value,
    AttachmentFiles: attachmentFiles,
    Priority: document.getElementById("officerAnnouncementPriority").value,
    Publish: document.getElementById("officerAnnouncementPublish").value
  };

  if (!payload.Date || !payload.Subject || !payload.Announcement || !payload.Teacher || !payload.OfficerPosition) {
    showOfficerToast("Date, subject, teacher, officer position, and announcement are required.");
    return;
  }

  const saved = await sendOfficerData("announcement", payload);

  if (saved) {
    clearOfficerFields([
      "officerAnnouncementDate",
      "officerAnnouncementSubject",
      "officerAnnouncementText",
      "officerAnnouncementFormat",
      "officerAnnouncementAttachments",
      "officerAnnouncementTeacher",
      "officerAnnouncementDeadline",
      "officerAnnouncementShowDeadline",
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

async function buildOfficerAttachmentPayload(inputId, notify) {
  const input = document.getElementById(inputId);
  const files = input && input.files ? Array.from(input.files) : [];

  if (files.length === 0) return [];

  if (files.length > MAX_ANNOUNCEMENT_ATTACHMENTS) {
    notify(`Maximum of ${MAX_ANNOUNCEMENT_ATTACHMENTS} attachments only.`);
    return null;
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (totalBytes > MAX_ANNOUNCEMENT_ATTACHMENT_BYTES) {
    notify("Attachments are too large. Keep total size under 8 MB.");
    return null;
  }

  return Promise.all(files.map(file => readOfficerAttachmentFile(file)));
}

function readOfficerAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.split(",")[1] || "";

      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: base64
      });
    };

    reader.onerror = () => reject(reader.error || new Error("Unable to read attachment."));
    reader.readAsDataURL(file);
  });
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


function getVisibleManageColumnIndexes(headers) {
  const seen = new Set();

  return (headers || [])
    .map((header, index) => ({ header, index }))
    .filter(item => {
      const key = normalizeManageHeaderKey(item.header);

      if (!key) return true;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .map(item => item.index);
}

function normalizeManageHeaderKey(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}


function renderOfficerTable(result) {
  const tableHead = document.querySelector("#officerDataTable thead");
  const tableBody = document.querySelector("#officerDataTable tbody");

  const headers = result.headers || [];
  const rows = result.rows || [];
  const visibleColumnIndexes = getVisibleManageColumnIndexes(headers);

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
      ${visibleColumnIndexes.map(index => `<th>${escapeHtml(headers[index])}</th>`).join("")}
    </tr>
  `;

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${visibleColumnIndexes.length + 3}" class="emptyCell">
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
        <td class="selectCell" data-label="Select">
          <input type="checkbox" class="rowSelectInput" data-row="${row.rowNumber}" onchange="toggleOfficerRowSelection(${row.rowNumber}, this.checked)" />
        </td>

        <td class="actionsDataCell" data-label="Action">
          <div class="actionCell">
            <button class="tableActionBtn hideBtn" onclick="hideOfficerRecord(${row.rowNumber})">Hide</button>
          </div>
        </td>

        <td class="rowNumberCell" data-label="Row">#${row.rowNumber}</td>

        ${visibleColumnIndexes.map(index => {
          const header = headers[index];
          const value = row.cells[index] || "";
          return `
            <td class="${value ? "" : "emptyCell"}" data-label="${escapeHtml(header)}">
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
