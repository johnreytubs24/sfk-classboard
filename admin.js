const ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const ADMIN_PIN = "0524"; 
const ADMIN_LOGIN_KEY = "sfkAdminLoggedIn";

let currentAdminSheet = "";
let editingRecord = null;
let latestAdminTableData = null;

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

document.addEventListener("DOMContentLoaded", () => {
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

  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("adminPanel").classList.add("hidden");
}

function showAdminPanel() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("adminPanel").classList.remove("hidden");

  setTodayForDateInputs();
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

    const result = await response.json();

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
  const payload = {
    Date: document.getElementById("announcementDate").value,
    Subject: document.getElementById("announcementSubject").value,
    Announcement: document.getElementById("announcementText").value.trim(),
    Teacher: document.getElementById("announcementTeacher").value,
    Deadline: document.getElementById("announcementDeadline").value,
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
      "announcementTeacher",
      "announcementDeadline",
      "announcementPriority",
      "announcementPublish"
    ]);
  }
}

/* THINGS TO BRING */
async function saveThingsToBring() {
  const payload = {
    Date: document.getElementById("thingsDate").value,
    Subject: document.getElementById("thingsSubject").value,
    Item: document.getElementById("thingsItem").value.trim(),
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
      "thingsPublish"
    ]);
  }
}

/* ADVISER REMINDER */
async function saveAdviserReminder() {
  const payload = {
    Date: document.getElementById("adviserDate").value,
    Reminder: document.getElementById("adviserReminder").value.trim(),
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

/* MANAGE EXISTING DATA - EDIT / HIDE / DELETE */
async function loadAdminTable(sheetName, buttonEl) {
  currentAdminSheet = sheetName;

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

function renderAdminTable(result) {
  const tableHead = document.querySelector("#adminDataTable thead");
  const tableBody = document.querySelector("#adminDataTable tbody");

  const headers = result.headers || [];
  const rows = result.rows || [];

  if (!tableHead || !tableBody) return;

  if (headers.length === 0) {
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    setManageStatus(`${formatSheetLabel(result.sheetName)} has no headers.`);
    return;
  }

  tableHead.innerHTML = `
    <tr>
      <th>Actions</th>
      <th>Row</th>
      ${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}
    </tr>
  `;

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${headers.length + 2}" class="emptyCell">
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
        <td>
          <div class="actionCell">
            <button class="tableActionBtn editBtn" onclick="openEditModal(${row.rowNumber})">Edit</button>
            <button class="tableActionBtn hideBtn" onclick="hideAdminRecord(${row.rowNumber})">Hide</button>
            <button class="tableActionBtn deleteBtn" onclick="deleteAdminRecord(${row.rowNumber})">Delete</button>
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

  setManageStatus(`${formatSheetLabel(result.sheetName)} loaded. ${rows.length} record(s) found.`);
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

    const isLongText =
      lowerHeader.includes("announcement") ||
      lowerHeader.includes("reminder") ||
      lowerHeader.includes("quote") ||
      lowerHeader.includes("message") ||
      lowerHeader.includes("item");

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
      return `
        <div class="${fieldClass}">
          <label>${escapeHtml(header)}</label>
          <textarea class="editInput" data-index="${index}">${escapeHtml(value)}</textarea>
        </div>
      `;
    }

    return `
      <div class="${fieldClass}">
        <label>${escapeHtml(header)}</label>
        <input 
          class="editInput"
          data-index="${index}"
          value="${escapeAttribute(value)}"
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
    updatedValues[index] = input.value;
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

    const result = await response.json();

    if (result.success) {
      showToast("Record updated.");
      closeEditModal();
      refreshCurrentAdminTable();
      return;
    }

    showToast(result.message || "Failed to update record.");

  } catch (error) {
    console.error(error);
    showToast("Error updating record.");
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

function formatSheetLabel(sheetName) {
  const labels = {
    Announcements: "Announcements",
    ThingsToBring: "Things to Bring",
    AdviserReminders: "Adviser Reminders",
    PrayerLeaders: "Prayer Leaders",
    DailyQuotes: "Daily Quotes",
    Birthdays: "Birthdays",
    TickerMessages: "Ticker Messages"
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