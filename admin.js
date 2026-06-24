const ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const ADMIN_PIN = "0524"; 
const ADMIN_LOGIN_KEY = "sfkAdminLoggedIn";

let currentAdminSheet = "";
let editingRecord = null;
let latestAdminTableData = null;
let selectedAdminRows = new Set();
let activeAdminTool = null;

const TEACHER_OPTIONS = [
  "Mr. John Rey Tubello",
  "Ms. Chiarah De Castro",
  "Mrs. Melanie Sebastian",
  "Ms. Hannah Lee Cillo",
  "Ms Christine Tolentino",
  "Ms. Kamille Lajom",
  "Mr. Alexis Pastrana",
  "Ms. Gina Soriano",
  "Mr. Runmar Quipanes"
];

const TEXT_FORMAT_OPTIONS = ["center", "left", "right", "bullets", "numbers"];
const MAX_ANNOUNCEMENT_ATTACHMENTS = 5;
const MAX_ANNOUNCEMENT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

document.addEventListener("DOMContentLoaded", () => {
  initAdminToolLauncher();

  if (localStorage.getItem(ADMIN_LOGIN_KEY) === "YES") {
    showAdminPanel();
  }

  const pinInput = document.getElementById("adminPin");
  if (pinInput) {
    pinInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        loginAdmin();
      }
    });
  }

  setTodayForDateInputs();
});

function loginAdmin() {
  const pinInput = document.getElementById("adminPin");
  const message = document.getElementById("loginMessage");

  const pin = pinInput.value.trim();

  if (pin === ADMIN_PIN) {
    localStorage.setItem(ADMIN_LOGIN_KEY, "YES");
    showAdminPanel();
    pinInput.value = "";
    message.textContent = "";
  } else {
    message.textContent = "Incorrect PIN. Please try again.";
    pinInput.value = "";
    pinInput.focus();
  }
}

function logoutAdmin() {
  localStorage.removeItem(ADMIN_LOGIN_KEY);
  closeAdminTool();

  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("adminPanel").classList.add("hidden");
}

function showAdminPanel() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("adminPanel").classList.remove("hidden");

  initAdminToolLauncher();
  setTodayForDateInputs();
}

function initAdminToolLauncher() {
  const panel = document.getElementById("adminPanel");
  const grid = document.querySelector(".adminGrid");
  const managePanel = document.querySelector(".managePanel");
  if (!panel || !grid || panel.dataset.toolsReady === "true") return;

  panel.dataset.toolsReady = "true";
  panel.classList.add("toolsReady");

  const launcher = document.createElement("section");
  launcher.className = "toolLauncher";
  launcher.setAttribute("aria-label", "Admin tools");
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
    button.innerHTML = `<strong>${escapeAdminText(title)}</strong><small>Create or publish this item</small>`;
    button.addEventListener("click", () => openAdminTool(card, title));
    launcherGrid.appendChild(button);
  });

  if (managePanel) {
    const button = document.createElement("button");
    button.className = "toolLaunchButton manageLaunchButton";
    button.type = "button";
    button.innerHTML = `<strong>🗂 Manage Existing Data</strong><small>View, edit, hide, or delete records</small>`;
    button.addEventListener("click", () => openAdminTool(managePanel, "Manage Existing Data"));
    launcherGrid.appendChild(button);
  }

  panel.insertBefore(launcher, grid);

  const modal = document.createElement("div");
  modal.id = "adminToolModal";
  modal.className = "toolModal hidden";
  modal.innerHTML = `
    <div class="toolModalBackdrop" data-admin-tool-close></div>
    <section class="toolModalCard" role="dialog" aria-modal="true" aria-labelledby="adminToolModalTitle">
      <header class="toolModalHeader">
        <div>
          <p class="toolEyebrow">SFK Admin</p>
          <h2 id="adminToolModalTitle">Tool</h2>
        </div>
        <button class="toolModalClose" type="button" data-admin-tool-close aria-label="Close">×</button>
      </header>
      <div id="adminToolModalContent" class="toolModalContent"></div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-admin-tool-close]")) closeAdminTool();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeAdminTool();
  });
}

function openAdminTool(element, title) {
  if (!element) return;
  closeAdminTool();

  const modal = document.getElementById("adminToolModal");
  const content = document.getElementById("adminToolModalContent");
  const titleElement = document.getElementById("adminToolModalTitle");
  if (!modal || !content || !titleElement) return;

  activeAdminTool = {
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

function closeAdminTool() {
  const modal = document.getElementById("adminToolModal");
  const content = document.getElementById("adminToolModalContent");

  if (activeAdminTool?.element && activeAdminTool.parent) {
    activeAdminTool.element.classList.remove("toolModalPanel");
    activeAdminTool.parent.insertBefore(activeAdminTool.element, activeAdminTool.nextSibling);
  }

  activeAdminTool = null;
  if (content) content.innerHTML = "";
  modal?.classList.add("hidden");
  modal?.classList.remove("toolModalManage");
  document.body.classList.remove("toolModalOpen");
}

function escapeAdminText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setTodayForDateInputs() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila"
  });

  const dateInputs = [
    "announcementDate",
    "announcementDeadline",
    "thingsDate",
    "adviserDate",
    "prayerDate",
    "quoteDateInput",
    "birthdayDate"
  ];

  dateInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.value) {
      input.value = today;
    }
  });
}

async function sendAdminData(type, payload) {
  showToast("Saving...");

  try {
    const response = await fetch(ADMIN_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type,
        payload
      })
    });

    const responseText = await response.text();
    let result = {};

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(responseText.slice(0, 180) || "Invalid server response.");
    }

    if (result.success) {
      showToast("Saved successfully.");

      if (currentAdminSheet) {
        refreshCurrentAdminTable();
      }

      return true;
    }

    showToast(result.message || "Failed to save.");
    return false;

  } catch (error) {
    console.error(error);
    showToast("Error saving data.");
    return false;
  }
}

function showToast(message) {
  const toast = document.getElementById("adminToast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(window.adminToastTimer);
  window.adminToastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

function clearFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === "SELECT") {
      el.selectedIndex = 0;
    } else {
      el.value = "";
    }
  });

  setTodayForDateInputs();
}

/* SUBJECT ANNOUNCEMENT */
async function saveAnnouncement() {
  const announcementText = document.getElementById("announcementText").value.trim();
  const announcementFormat = document.getElementById("announcementFormat").value;
  const attachmentFiles = await buildAttachmentPayload("announcementAttachments", showToast);

  if (attachmentFiles === null) return;

  const payload = {
    Date: document.getElementById("announcementDate").value,
    Subject: document.getElementById("announcementSubject").value,
    Announcement: applyTextFormat(announcementText, announcementFormat),
    Teacher: document.getElementById("announcementTeacher").value,
    Deadline: document.getElementById("announcementDeadline").value,
    ShowDeadline: document.getElementById("announcementShowDeadline").value,
    AttachmentFiles: attachmentFiles,
    Priority: document.getElementById("announcementPriority").value,
    Publish: document.getElementById("announcementPublish").value
  };

  if (!payload.Date || !payload.Subject || !payload.Announcement || !payload.Teacher) {
    showToast("Date, subject, teacher, and announcement are required.");
    return;
  }

  const saved = await sendAdminData("announcement", payload);

  if (saved) {
    clearFields([
      "announcementDate",
      "announcementSubject",
      "announcementText",
      "announcementFormat",
      "announcementAttachments",
      "announcementTeacher",
      "announcementDeadline",
      "announcementShowDeadline",
      "announcementPriority",
      "announcementPublish"
    ]);
  }
}

/* THINGS TO BRING */
async function saveThingsToBring() {
  const itemText = document.getElementById("thingsItem").value.trim();
  const itemFormat = document.getElementById("thingsFormat").value;

  const payload = {
    Date: document.getElementById("thingsDate").value,
    Subject: document.getElementById("thingsSubject").value,
    Item: applyTextFormat(itemText, itemFormat),
    Publish: document.getElementById("thingsPublish").value
  };

  if (!payload.Date || !payload.Subject || !payload.Item) {
    showToast("Date, subject, and item are required.");
    return;
  }

  const saved = await sendAdminData("things", payload);

  if (saved) {
    clearFields([
      "thingsDate",
      "thingsSubject",
      "thingsItem",
      "thingsFormat",
      "thingsPublish"
    ]);
  }
}

/* ADVISER REMINDER */
async function saveAdviserReminder() {
  const reminderText = document.getElementById("adviserReminder").value.trim();
  const reminderFormat = document.getElementById("adviserFormat").value;

  const payload = {
    Date: document.getElementById("adviserDate").value,
    Reminder: applyTextFormat(reminderText, reminderFormat),
    Publish: document.getElementById("adviserPublish").value
  };

  if (!payload.Date || !payload.Reminder) {
    showToast("Date and reminder are required.");
    return;
  }

  const saved = await sendAdminData("reminder", payload);

  if (saved) {
    clearFields([
      "adviserDate",
      "adviserReminder",
      "adviserFormat",
      "adviserPublish"
    ]);
  }
}

/* PRAYER LEADER */
async function savePrayerLeader() {
  const payload = {
    Date: document.getElementById("prayerDate").value,
    PrayerLeader: document.getElementById("prayerName").value.trim(),
    Publish: document.getElementById("prayerPublish").value
  };

  if (!payload.Date || !payload.PrayerLeader) {
    showToast("Date and prayer leader are required.");
    return;
  }

  const saved = await sendAdminData("prayer", payload);

  if (saved) {
    clearFields([
      "prayerDate",
      "prayerName",
      "prayerPublish"
    ]);
  }
}

/* DAILY KINDNESS QUOTE */
async function saveQuote() {
  const payload = {
    Date: document.getElementById("quoteDateInput").value,
    Quote: document.getElementById("quoteTextInput").value.trim(),
    Author: document.getElementById("quoteAuthorInput").value.trim(),
    Publish: document.getElementById("quotePublishInput").value
  };

  if (!payload.Date || !payload.Quote) {
    showToast("Date and quote are required.");
    return;
  }

  const saved = await sendAdminData("quote", payload);

  if (saved) {
    clearFields([
      "quoteDateInput",
      "quoteTextInput",
      "quoteAuthorInput",
      "quotePublishInput"
    ]);
  }
}

/* BIRTHDAY */
async function saveBirthday() {
  const payload = {
    Name: document.getElementById("birthdayName").value.trim(),
    Birthday: document.getElementById("birthdayDate").value,
    Publish: document.getElementById("birthdayPublish").value
  };

  if (!payload.Name || !payload.Birthday) {
    showToast("Name and birthday are required.");
    return;
  }

  const saved = await sendAdminData("birthday", payload);

  if (saved) {
    clearFields([
      "birthdayName",
      "birthdayDate",
      "birthdayPublish"
    ]);
  }
}

/* TICKER MESSAGE */
async function saveTickerMessage() {
  const payload = {
    Message: document.getElementById("tickerMessage").value.trim(),
    Priority: "Normal",
    Publish: document.getElementById("tickerPublish").value
  };

  if (!payload.Message) {
    showToast("Ticker message is required.");
    return;
  }

  const saved = await sendAdminData("ticker", payload);

  if (saved) {
    clearFields([
      "tickerMessage",
      "tickerPublish"
    ]);
  }
}

async function buildAttachmentPayload(inputId, notify) {
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

  return Promise.all(files.map(file => readAttachmentFile(file)));
}

function readAttachmentFile(file) {
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

/* DAILY SCHEDULE INFO */
async function saveDailyInfo() {
  const payload = {
    Day: document.getElementById("dailyInfoDay").value,
    EntryGate: document.getElementById("dailyInfoEntryGate").value.trim(),
    ExitGate: document.getElementById("dailyInfoExitGate").value.trim(),
    Uniform: document.getElementById("dailyInfoUniform").value.trim(),
    Publish: document.getElementById("dailyInfoPublish").value
  };

  if (!payload.Day || !payload.EntryGate || !payload.ExitGate || !payload.Uniform) {
    showToast("Day, entry gate, exit gate, and uniform are required.");
    return;
  }

  const saved = await sendAdminData("dailyInfo", payload);

  if (saved) {
    clearFields([
      "dailyInfoEntryGate",
      "dailyInfoExitGate",
      "dailyInfoUniform",
      "dailyInfoPublish"
    ]);
  }
}

/* MANAGE EXISTING DATA - EDIT / HIDE / DELETE */
async function loadAdminTable(sheetName, buttonEl) {
  currentAdminSheet = sheetName;
  selectedAdminRows = new Set();

  setActiveManageTab(buttonEl);
  setManageStatus(`Loading ${formatSheetLabel(sheetName)}...`);

  const tableHead = document.querySelector("#adminDataTable thead");
  const tableBody = document.querySelector("#adminDataTable tbody");

  if (!tableHead || !tableBody) {
    showToast("Manage table not found in admin.html.");
    return;
  }

  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  try {
    const response = await fetch(`${ADMIN_API_URL}?type=adminList&sheet=${encodeURIComponent(sheetName)}`, {
      cache: "no-store"
    });

    const result = await response.json();

    if (result.status !== "success") {
      setManageStatus(result.message || "Unable to load data.");
      return;
    }

    latestAdminTableData = result;
    renderAdminTable(result);

  } catch (error) {
    console.error(error);
    setManageStatus("Error loading data.");
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


function renderAdminTable(result) {
  const tableHead = document.querySelector("#adminDataTable thead");
  const tableBody = document.querySelector("#adminDataTable tbody");

  const headers = result.headers || [];
  const rows = result.rows || [];
  const isAnnouncementsSheet = result.sheetName === "Announcements";
  const visibleColumnIndexes = getVisibleManageColumnIndexes(headers);

  if (!tableHead || !tableBody) return;

  if (headers.length === 0) {
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    setManageStatus(`${formatSheetLabel(result.sheetName)} has no headers.`);
    return;
  }

  tableHead.innerHTML = `
    <tr>
      <th>Select</th>
      <th>Actions</th>
      <th>Row</th>
      ${isAnnouncementsSheet ? "<th>Noted</th>" : ""}
      ${visibleColumnIndexes.map(index => `<th>${escapeHtml(headers[index])}</th>`).join("")}
    </tr>
  `;

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${visibleColumnIndexes.length + 3 + (isAnnouncementsSheet ? 1 : 0)}" class="emptyCell">
          No data found.
        </td>
      </tr>
    `;

    setManageStatus(`${formatSheetLabel(result.sheetName)} loaded. No records yet.`);
    return;
  }

  tableBody.innerHTML = rows.map(row => {
    return `
      <tr>
        <td class="selectCell" data-label="Select">
          <input type="checkbox" class="rowSelectInput" data-row="${row.rowNumber}" onchange="toggleAdminRowSelection(${row.rowNumber}, this.checked)" />
        </td>

        <td class="actionsDataCell" data-label="Actions">
          <div class="actionCell">
            <button class="tableActionBtn editBtn" onclick="openEditModal(${row.rowNumber})">Edit</button>
            <button class="tableActionBtn hideBtn" onclick="hideAdminRecord(${row.rowNumber})">Hide</button>
            <button class="tableActionBtn deleteBtn" onclick="deleteAdminRecord(${row.rowNumber})">Delete</button>
          </div>
        </td>

        <td class="rowNumberCell" data-label="Row">#${row.rowNumber}</td>

        ${isAnnouncementsSheet ? renderAdminNotedCountCell(row) : ""}

        ${visibleColumnIndexes.map(index => {
          const header = headers[index];
          const value = row.cells[index] || "";
          return `
            <td class="${value ? "" : "emptyCell"}" data-label="${escapeAttribute(header)}">
              ${value ? escapeHtml(value) : "—"}
            </td>
          `;
        }).join("")}
      </tr>
    `;
  }).join("");

  if (isAnnouncementsSheet) {
    const totalNoted = rows.reduce((sum, row) => sum + (Number(row.notedCount || row.heartCount || 0) || 0), 0);
    setManageStatus(`${formatSheetLabel(result.sheetName)} loaded. ${rows.length} record(s) found. Total noted: ${totalNoted}.`);
  } else {
    setManageStatus(`${formatSheetLabel(result.sheetName)} loaded. ${rows.length} record(s) found.`);
  }
  attachAdminLongPressSelection();
}


function renderAdminNotedCountCell(row) {
  const count = Number(row.notedCount || row.heartCount || 0) || 0;

  return `
    <td class="adminNotedCountCell" data-label="Noted" title="Students who clicked Noted / Heart">
      <span class="adminNotedPill">❤️ ${count}</span>
    </td>
  `;
}

function toggleAdminRowSelection(rowNumber, checked) {
  const numericRow = Number(rowNumber);

  if (checked) {
    selectedAdminRows.add(numericRow);
  } else {
    selectedAdminRows.delete(numericRow);
  }

  syncAdminSelectedRows();
}

function syncAdminSelectedRows() {
  document.querySelectorAll("#adminDataTable tbody tr").forEach(row => {
    const checkbox = row.querySelector(".rowSelectInput");
    if (!checkbox) return;

    const rowNumber = Number(checkbox.dataset.row);
    const selected = selectedAdminRows.has(rowNumber);
    checkbox.checked = selected;
    row.classList.toggle("selectedRow", selected);
  });

  const count = selectedAdminRows.size;
  if (currentAdminSheet && latestAdminTableData) {
    setManageStatus(`${formatSheetLabel(currentAdminSheet)} loaded. ${latestAdminTableData.rows.length} record(s) found. ${count} selected.`);
  }
}

function selectAllAdminRows() {
  if (!latestAdminTableData || !latestAdminTableData.rows) return;
  selectedAdminRows = new Set(latestAdminTableData.rows.map(row => Number(row.rowNumber)));
  syncAdminSelectedRows();
}

function clearAdminSelection() {
  selectedAdminRows = new Set();
  syncAdminSelectedRows();
}

function attachAdminLongPressSelection() {
  document.querySelectorAll("#adminDataTable tbody tr").forEach(row => {
    const checkbox = row.querySelector(".rowSelectInput");
    if (!checkbox) return;

    const rowNumber = Number(checkbox.dataset.row);
    let timer = null;

    row.addEventListener("touchstart", () => {
      timer = setTimeout(() => {
        toggleAdminRowSelection(rowNumber, !selectedAdminRows.has(rowNumber));
      }, 550);
    }, { passive: true });

    row.addEventListener("touchend", () => clearTimeout(timer));
    row.addEventListener("touchmove", () => clearTimeout(timer));
    row.addEventListener("touchcancel", () => clearTimeout(timer));
  });
}

async function hideSelectedAdminRecords() {
  await runAdminBatchAction("adminBatchUnpublish", "hide");
}

async function deleteSelectedAdminRecords() {
  await runAdminBatchAction("adminBatchDelete", "delete");
}

async function runAdminBatchAction(type, actionLabel) {
  if (!currentAdminSheet) {
    showToast("Select a category first.");
    return;
  }

  const rowNumbers = Array.from(selectedAdminRows).sort((a, b) => a - b);

  if (rowNumbers.length === 0) {
    showToast("Select at least one record.");
    return;
  }

  const confirmed = confirm(`${actionLabel === "delete" ? "Delete" : "Hide"} ${rowNumbers.length} selected record(s)?`);
  if (!confirmed) return;

  showToast(`${actionLabel === "delete" ? "Deleting" : "Hiding"} selected records...`);

  try {
    const response = await fetch(ADMIN_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type,
        payload: {
          sheetName: currentAdminSheet,
          rowNumbers
        }
      })
    });

    const responseText = await response.text();
    let result = {};

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(responseText.slice(0, 180) || "Invalid server response.");
    }

    if (result.success) {
      showToast(result.message || "Batch action complete.");
      selectedAdminRows = new Set();
      refreshCurrentAdminTable();
      return;
    }

    showToast(result.message || "Batch action failed.");
  } catch (error) {
    console.error(error);
    showToast("Error running batch action.");
  }
}

function openEditModal(rowNumber) {
  if (!latestAdminTableData) {
    showToast("Load a category first.");
    return;
  }

  const row = latestAdminTableData.rows.find(item => Number(item.rowNumber) === Number(rowNumber));

  if (!row) {
    showToast("Record not found.");
    return;
  }

  editingRecord = {
    sheetName: latestAdminTableData.sheetName,
    rowNumber: row.rowNumber,
    headers: latestAdminTableData.headers,
    cells: row.cells
  };

  const modalTitle = document.getElementById("editModalTitle");
  const modalSubtitle = document.getElementById("editModalSubtitle");
  const editFields = document.getElementById("editFields");
  const editModal = document.getElementById("editModal");

  if (!modalTitle || !modalSubtitle || !editFields || !editModal) {
    showToast("Edit modal not found in admin.html.");
    return;
  }

  modalTitle.textContent = `Edit ${formatSheetLabel(editingRecord.sheetName)}`;
  modalSubtitle.textContent = `Editing row #${editingRecord.rowNumber}`;

  editFields.innerHTML = editingRecord.headers.map((header, index) => {
    const value = editingRecord.cells[index] || "";
    const lowerHeader = String(header).trim().toLowerCase();

    const isLongText = isFormattedTextField(
      editingRecord.sheetName,
      header,
      index,
      editingRecord.headers
    );
    const isDuplicateAnnouncementField =
      editingRecord.sheetName === "Announcements" &&
      normalizeFieldName(header) === "announcement" &&
      !isLongText;

    if (isDuplicateAnnouncementField) {
      return "";
    }

    const isPublish =
	  lowerHeader === "publish" ||
	  lowerHeader === "published";

	const isTeacher =
	  lowerHeader === "teacher";

	const isId =
	  lowerHeader === "id";

    const fieldClass = isLongText ? "editField editFieldFull" : "editField";

    if (isId) {
  return `
    <div class="${fieldClass}">
      <label>${escapeHtml(header)}</label>
      <input 
        class="editInput readOnlyField"
        data-index="${index}"
        value="${escapeAttribute(value)}"
        readonly
      />
    </div>
  `;
}

if (isPublish) {
  return `
    <div class="${fieldClass}">
      <label>${escapeHtml(header)}</label>
      <select class="editInput" data-index="${index}">
        <option value="YES" ${String(value).toUpperCase() === "YES" ? "selected" : ""}>YES</option>
        <option value="NO" ${String(value).toUpperCase() === "NO" ? "selected" : ""}>NO</option>
      </select>
    </div>
  `;
}

if (isTeacher) {
  return `
    <div class="${fieldClass}">
      <label>${escapeHtml(header)}</label>
      <select class="editInput" data-index="${index}">
        ${renderTeacherOptions(value)}
      </select>
    </div>
  `;
}

    if (isLongText) {
      const parsedFormat = parseTextFormat(value);

      return `
        <div class="${fieldClass}">
          <label>${escapeHtml(header)}</label>
          <select class="editFormatSelect" data-index="${index}">
            ${renderTextFormatOptions(parsedFormat.format)}
          </select>
          <textarea class="editInput textFormatInput" data-format-enabled="YES" data-index="${index}">${escapeHtml(parsedFormat.text)}</textarea>
        </div>
      `;
    }

    return `
      <div class="${fieldClass}">
        <label>${escapeHtml(header)}</label>
        <input 
          class="editInput"
          data-index="${index}"
          value="${escapeAttribute(stripTextFormatTag(value))}"
        />
      </div>
    `;
  }).join("");

  editModal.classList.remove("hidden");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal) {
    modal.classList.add("hidden");
  }

  editingRecord = null;
}

async function saveEditedRecord() {
  if (!editingRecord) {
    showToast("No record selected.");
    return;
  }

  const inputs = document.querySelectorAll(".editInput");
  const updatedValues = [...editingRecord.cells];

  inputs.forEach(input => {
    const index = Number(input.dataset.index);
    if (input.dataset.formatEnabled === "YES") {
      const formatSelect = document.querySelector(`.editFormatSelect[data-index="${index}"]`);
      updatedValues[index] = applyTextFormat(input.value.trim(), formatSelect ? formatSelect.value : "left");
    } else {
      updatedValues[index] = input.value;
    }
  });

  showToast("Saving changes...");

  try {
    const response = await fetch(ADMIN_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "adminUpdate",
        payload: {
          sheetName: editingRecord.sheetName,
          rowNumber: editingRecord.rowNumber,
          values: updatedValues
        }
      })
    });

    const responseText = await response.text();
    let result = {};

    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(responseText.slice(0, 180) || "Invalid server response.");
    }

    if (result.success) {
      showToast("Record updated.");
      closeEditModal();
      refreshCurrentAdminTable();
      return;
    }

    showToast(result.message || "Failed to update record.");

  } catch (error) {
    console.error(error);
    showToast(`Error updating record: ${error.message || "unknown error"}`);
  }
}

async function hideAdminRecord(rowNumber) {
  if (!currentAdminSheet) {
    showToast("Select a category first.");
    return;
  }

  const confirmed = confirm("Hide this record? This will set Publish to NO.");

  if (!confirmed) return;

  showToast("Hiding record...");

  try {
    const response = await fetch(ADMIN_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "adminUnpublish",
        payload: {
          sheetName: currentAdminSheet,
          rowNumber
        }
      })
    });

    const result = await response.json();

    if (result.success) {
      showToast("Record hidden.");
      refreshCurrentAdminTable();
      return;
    }

    showToast(result.message || "Failed to hide record.");

  } catch (error) {
    console.error(error);
    showToast("Error hiding record.");
  }
}

async function deleteAdminRecord(rowNumber) {
  if (!currentAdminSheet) {
    showToast("Select a category first.");
    return;
  }

  const confirmed = confirm("Delete this record permanently? This cannot be undone.");

  if (!confirmed) return;

  showToast("Deleting record...");

  try {
    const response = await fetch(ADMIN_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "adminDelete",
        payload: {
          sheetName: currentAdminSheet,
          rowNumber
        }
      })
    });

    const result = await response.json();

    if (result.success) {
      showToast("Record deleted.");
      refreshCurrentAdminTable();
      return;
    }

    showToast(result.message || "Failed to delete record.");

  } catch (error) {
    console.error(error);
    showToast("Error deleting record.");
  }
}

function refreshCurrentAdminTable() {
  if (!currentAdminSheet) {
    setManageStatus("Select a category first.");
    return;
  }

  loadAdminTable(currentAdminSheet);
}

function setActiveManageTab(buttonEl) {
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

    if (onclickValue.includes(currentAdminSheet)) {
      btn.classList.add("active");
    }
  });
}

function setManageStatus(message) {
  const status = document.getElementById("manageStatus");
  if (status) {
    status.textContent = message;
  }
}

function isFormattedTextField(sheetName, header, index, headers = []) {
  const cleanHeader = normalizeFieldName(header);
  const hasIdColumn = normalizeFieldName(headers[0] || "") === "id";

  if (sheetName === "Announcements") {
    return hasIdColumn ? index === 3 : index === 2;
  }

  if (sheetName === "ThingsToBring") {
    return index === 2;
  }

  if (sheetName === "AdviserReminders") {
    return index === 1;
  }

  if (sheetName === "DailyQuotes") {
    return index === 1;
  }

  if (sheetName === "TickerMessages") {
    return index === 0;
  }

  const formattedFields = {
    ThingsToBring: ["item", "things", "materials", "reminder", "description", "task"],
    AdviserReminders: ["reminder", "message", "description"],
    DailyQuotes: ["quote"],
    TickerMessages: ["message"]
  };

  return (formattedFields[sheetName] || []).includes(cleanHeader);
}

function normalizeFieldName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function applyTextFormat(text, format) {
  const cleanText = stripTextFormatTag(text).trim();
  const cleanFormat = TEXT_FORMAT_OPTIONS.includes(format) ? format : "left";

  if (!cleanText) return "";

  return `[${cleanFormat}]\n${cleanText}`;
}

function parseTextFormat(value) {
  const raw = String(value || "").replace(/\r/g, "").trim();
  const match = raw.match(/^\[(center|left|right|bullets|numbers)\]\s*\n?/i);

  if (!match) {
    return {
      format: "left",
      text: raw
    };
  }

  return {
    format: match[1].toLowerCase(),
    text: raw.replace(match[0], "").trim()
  };
}

function stripTextFormatTag(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\[(center|left|right|bullets|numbers)\]\s*\n?/i, "");
}

function renderTextFormatOptions(selectedValue) {
  const labels = {
    center: "Center",
    left: "Left",
    right: "Right",
    bullets: "Bullets",
    numbers: "Numbers"
  };

  return TEXT_FORMAT_OPTIONS.map(value => {
    const selected = value === selectedValue ? "selected" : "";
    return `<option value="${value}" ${selected}>${labels[value]}</option>`;
  }).join("");
}

function formatSheetLabel(sheetName) {
  const labels = {
    Announcements: "Announcements",
    ThingsToBring: "Things to Bring",
    AdviserReminders: "Adviser Reminders",
    PrayerLeaders: "Prayer Leaders",
    DailyQuotes: "Daily Quotes",
    Birthdays: "Birthdays",
    TickerMessages: "Ticker Messages",
    DailyInfo: "Daily Info"
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

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function renderTeacherOptions(selectedValue) {
  const selected = String(selectedValue || "").trim();

  let options = `<option value="">Select Teacher</option>`;

  TEACHER_OPTIONS.forEach(teacher => {
    options += `
      <option value="${escapeAttribute(teacher)}" ${selected === teacher ? "selected" : ""}>
        ${escapeHtml(teacher)}
      </option>
    `;
  });

  if (selected && !TEACHER_OPTIONS.includes(selected)) {
    options += `
      <option value="${escapeAttribute(selected)}" selected>
        ${escapeHtml(selected)}
      </option>
    `;
  }

  return options;
}
