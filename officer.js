const OFFICER_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const OFFICER_PIN = "SFK2627";
const OFFICER_LOGIN_KEY = "sfkOfficerLoggedIn";

let currentOfficerSheet = "";

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
  const payload = {
    Date: document.getElementById("officerAnnouncementDate").value,
    Subject: document.getElementById("officerAnnouncementSubject").value,
    Announcement: document.getElementById("officerAnnouncementText").value.trim(),
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
      "officerAnnouncementTeacher",
      "officerAnnouncementDeadline",
      "officerAnnouncementPriority",
      "officerAnnouncementPublish"
    ]);
  }
}

/* THINGS TO BRING */
async function saveOfficerThings() {
  const payload = {
    Date: document.getElementById("officerThingsDate").value,
    Subject: document.getElementById("officerThingsSubject").value,
    Item: document.getElementById("officerThingsItem").value.trim(),
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
      <th>Action</th>
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

    setOfficerManageStatus(`${formatSheetLabel(result.sheetName)} loaded. No records yet.`);
    return;
  }

  tableBody.innerHTML = rows.map(row => {
    return `
      <tr>
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

function formatSheetLabel(sheetName) {
  const labels = {
    Announcements: "Announcements",
    ThingsToBring: "Things to Bring",
    PrayerLeaders: "Prayer Leaders",
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