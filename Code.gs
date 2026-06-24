const SPREADSHEET_ID = "1RVCRiYviRAr3nXS_uMBXDK3g9FISq9m3GBt4_V4h3Ew";
const TIMEZONE = "Asia/Manila";
const ATTACHMENT_FOLDER_NAME = "SFK ClassBoard Attachments";
const MEMORY_FOLDER_NAME = "SFK ClassBoard Memories";
const MEMORY_MUSIC_FOLDER_NAME = "SFK ClassBoard Music";
const MEMORY_ADMIN_PIN = "0524";
const MEMORY_OFFICER_PIN = "SFK2627";

function authorizeClassBoardDriveAccess() {
  const folder = getOrCreateAttachmentFolder();
  return "Drive access authorized for: " + folder.getName();
}

function doGet(e) {
  const type = e && e.parameter && e.parameter.type ? e.parameter.type : "today";
  let result;

  switch (type) {
    case "settings":
      result = getSettings();
      break;

    case "schedule":
      result = getWeeklySchedule();
      break;

    case "today":
      result = getTodayBoard();
      break;

    case "adminList":
      result = getAdminList(e.parameter.sheet);
      break;

    case "officerList":
      result = getOfficerList(e.parameter.sheet);
      break;

    case "memories":
      result = getPublishedMemories();
      break;

    case "memoryAudio":
      result = getMemoryAudioPayload(e.parameter.fileId);
      break;

    default:
      result = {
        status: "error",
        message: "Invalid API endpoint"
      };
  }

  return jsonResponse(result);
}

/* ADMIN + OFFICER SAVE / UPDATE / HIDE / DELETE API */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const type = body.type;
    const payload = body.payload || {};

    if (!type) {
      return jsonResponse({
        success: false,
        message: "Missing request type."
      });
    }

    /* ADMIN MANAGE ACTIONS */
    if (type === "adminUpdate") {
      return jsonResponse(updateAdminRow(payload));
    }

    if (type === "adminUnpublish") {
      return jsonResponse(unpublishAdminRow(payload));
    }

    if (type === "adminRestore") {
      return jsonResponse(restoreAdminRow(payload));
    }

    if (type === "adminDelete") {
      return jsonResponse(deleteAdminRow(payload));
    }

    if (type === "adminBatchUnpublish") {
      return jsonResponse(batchUnpublishAdminRows(payload));
    }

    if (type === "adminBatchDelete") {
      return jsonResponse(batchDeleteAdminRows(payload));
    }

    /* OFFICER SAFE ACTIONS */
    if (type === "officerAdd") {
      return jsonResponse(addOfficerRow(payload));
    }


    if (type === "announcementHeart") {
      return jsonResponse(recordAnnouncementHeart(payload));
    }

    if (type === "memoryCreate") {
      return jsonResponse(createMemoryPost(payload));
    }

    if (type === "memoryUploadAssets") {
      return jsonResponse(uploadMemoryAssets(payload));
    }

    if (type === "memoryAuth") {
      const role = normalizeMemoryRole(payload.Role);
      const allowed = isValidMemoryAuth(role, payload.Pin);
      return jsonResponse({
        success: allowed,
        role: allowed ? role : "",
        message: allowed ? "Posting unlocked." : "Incorrect admin/officer PIN."
      });
    }

    if (type === "memoryHeart") {
      return jsonResponse(recordMemoryHeart(payload));
    }

    if (type === "memoryHide") {
      return jsonResponse(hideMemoryPost(payload));
    }

    if (type === "memoryDelete") {
      return jsonResponse(deleteMemoryPost(payload));
    }

    if (type === "memoryUpdate") {
      return jsonResponse(updateMemoryPost(payload));
    }

    if (type === "officerHide") {
      return jsonResponse(hideOfficerRow(payload));
    }

    if (type === "officerRestore") {
      return jsonResponse(restoreOfficerRow(payload));
    }

    if (type === "officerBatchHide") {
      return jsonResponse(batchHideOfficerRows(payload));
    }

    const todayDate = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "MMMM d, yyyy"
    );

    const id = generateAdminId(type);

    if (type === "announcement") {
      const attachments = uploadAnnouncementAttachments(payload.AttachmentFiles, id);
      appendAnnouncementRow(id, payload, todayDate, attachments);
    }

    else if (type === "things") {
      appendAdminRow("ThingsToBring", [
        formatInputDateToSheetDate(payload.Date) || todayDate,
        payload.Subject || "",
        payload.Item || "",
        payload.Publish || "YES"
      ]);
    }

    else if (type === "reminder") {
      appendAdminRow("AdviserReminders", [
        formatInputDateToSheetDate(payload.Date) || todayDate,
        payload.Reminder || "",
        payload.Publish || "YES"
      ]);
    }

    else if (type === "prayer") {
      appendAdminRow("PrayerLeaders", [
        formatInputDateToSheetDate(payload.Date) || todayDate,
        payload.PrayerLeader || "",
        payload.Publish || "YES"
      ]);
    }

    else if (type === "quote") {
      appendAdminRow("DailyQuotes", [
        formatInputDateToSheetDate(payload.Date) || todayDate,
        payload.Quote || "",
        payload.Author || "SFK ClassBoard",
        payload.Publish || "YES"
      ]);
    }

    else if (type === "birthday") {
      appendAdminRow("Birthdays", [
        payload.Name || "",
        convertBirthdayToMonthDay(payload.Birthday),
        payload.Publish || "YES"
      ]);
    }

    else if (type === "ticker") {
      appendAdminRow("TickerMessages", [
        payload.Message || "",
        payload.Priority || "Normal",
        payload.Publish || "YES"
      ]);
    }

    else if (type === "dailyInfo") {
      appendAdminRow("DailyInfo", [
        payload.Day || "",
        payload.EntryGate || "",
        payload.ExitGate || "",
        payload.Uniform || "",
        payload.Publish || "YES"
      ]);
    }

    else {
      return jsonResponse({
        success: false,
        message: "Unknown request type: " + type
      });
    }

    return jsonResponse({
      success: true,
      message: "Saved successfully."
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      message: error.message
    });
  }
}

function getTodayBoard() {
  const now = new Date();
  const todayDate = Utilities.formatDate(now, TIMEZONE, "MMMM d, yyyy");
  const schedule = getTodaySchedule();

  const birthdayRows = getPublishedRows("Birthdays").map(row => {
    return {
      ...row,
      Birthday: getValue(row, ["MonthDay", "Birthday", "Birthdate", "Date"]),
      Birthdate: getValue(row, ["MonthDay", "Birthday", "Birthdate", "Date"]),
      Date: getValue(row, ["MonthDay", "Birthday", "Birthdate", "Date"])
    };
  });

  return {
    status: "success",
    date: todayDate,
    day: Utilities.formatDate(now, TIMEZONE, "EEEE"),
    time: Utilities.formatDate(now, TIMEZONE, "h:mm:ss a"),

    settings: getSettings(),
    schedule: schedule,
    currentSubject: getCurrentSubject(schedule, now),
    nextSubject: getNextSubject(schedule, now),

    announcements: attachAnnouncementHeartCounts(getPublishedRows("Announcements")),
    thingsToBring: getPublishedRows("ThingsToBring"),
    prayerLeader: getTodaySingleRow("PrayerLeaders", "Date", todayDate),
    adviserReminders: getPublishedRows("AdviserReminders"),
    dailyInfo: getPublishedRows("DailyInfo"),
    dailyQuote: getTodaySingleRow("DailyQuotes", "Date", todayDate),
    birthdays: birthdayRows,
    ticker: getPublishedRows("TickerMessages")
  };
}

function getSettings() {
  const rows = getRows("Settings");
  let settings = {};

  rows.forEach(row => {
    settings[row.Key] = row.Value;
  });

  return settings;
}

function getTodaySchedule() {
  const today = Utilities.formatDate(new Date(), TIMEZONE, "EEEE");

  return getRows("Schedule")
    .filter(row =>
      normalizeDayName(getValue(row, ["Day"])) === today &&
      isPublished(row)
    );
}

/* WHOLE WEEK SCHEDULE FOR MODAL */
function getWeeklySchedule() {
  const dayOrder = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5
  };

  const schedule = getRows("Schedule")
    .filter(row => isPublished(row))
    .map(row => {
      return {
        Day: normalizeDayName(getValue(row, ["Day", "day", "DAY", "Weekday", "weekday"])),
        StartTime: getValue(row, ["StartTime", "Start Time", "Start", "startTime", "start"]),
        EndTime: getValue(row, ["EndTime", "End Time", "End", "endTime", "end"]),
        Subject: getValue(row, ["Subject", "subject"]),
        Teacher: getValue(row, ["Teacher", "teacher"]),
        Room: getValue(row, ["Room", "room"]),
        Color: getValue(row, ["Color", "color"]),
        Publish: getValue(row, ["Publish", "Published", "publish", "PUBLISH"])
      };
    })
    .filter(row => row.Day && row.StartTime && row.EndTime)
    .sort((a, b) => {
      const dayDiff = (dayOrder[a.Day] || 99) - (dayOrder[b.Day] || 99);

      if (dayDiff !== 0) return dayDiff;

      return timeToMinutes(a.StartTime) - timeToMinutes(b.StartTime);
    });

  return {
    status: "success",
    schedule: schedule,
    dailyInfo: getDailyInfoRows()
  };
}

function getDailyInfoRows() {
  return getPublishedRows("DailyInfo")
    .map(row => {
      return {
        Day: normalizeDayName(getValue(row, ["Day", "day", "DAY"])),
        EntryGate: getValue(row, ["EntryGate", "Entry Gate", "Entry", "entryGate"]),
        ExitGate: getValue(row, ["ExitGate", "Exit Gate", "Exit", "exitGate"]),
        Uniform: getValue(row, ["Uniform", "PrescribedUniform", "Prescribed Uniform", "uniform"]),
        Publish: getValue(row, ["Publish", "Published", "publish", "PUBLISH"])
      };
    })
    .filter(row => row.Day);
}

function normalizeDayName(value) {
  const text = String(value || "").trim().toLowerCase();

  const days = {
    monday: "Monday",
    mon: "Monday",
    tuesday: "Tuesday",
    tue: "Tuesday",
    tues: "Tuesday",
    wednesday: "Wednesday",
    wed: "Wednesday",
    thursday: "Thursday",
    thu: "Thursday",
    thurs: "Thursday",
    friday: "Friday",
    fri: "Friday"
  };

  return days[text] || String(value || "").trim();
}

function getPublishedRows(sheetName) {
  return getRows(sheetName)
    .filter(row => isPublished(row));
}

function getTodayRows(sheetName, dateColumn, todayDate) {
  return getPublishedRows(sheetName)
    .filter(row => {
      const rowDate = normalizeSheetDate(getValue(row, [dateColumn]));
      const today = normalizeSheetDate(todayDate);

      return rowDate === today;
    });
}

function getTodaySingleRow(sheetName, dateColumn, todayDate) {
  return getTodayRows(sheetName, dateColumn, todayDate)[0] || null;
}

function isPublished(row) {
  const publish = getValue(row, [
    "Publish",
    "Publish ",
    "Publish|",
    "Published",
    "publish",
    "PUBLISH"
  ]);

  if (!publish) return true;

  return String(publish).trim().toUpperCase() === "YES";
}

function getValue(row, possibleKeys) {
  for (let i = 0; i < possibleKeys.length; i++) {
    const key = possibleKeys[i];

    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }

  return "";
}

function normalizeSheetDate(value) {
  if (!value) return "";

  const text = String(value).trim();

  const date = new Date(text);

  if (!isNaN(date)) {
    return Utilities.formatDate(date, TIMEZONE, "MMMM d, yyyy");
  }

  return text;
}


/* ANNOUNCEMENT HEART / NOTED COUNT */
function recordAnnouncementHeart(payload) {
  const announcementId = String(
    payload.announcementId ||
    payload.AnnouncementID ||
    payload.ID ||
    ""
  ).trim();

  if (!announcementId) {
    return {
      success: false,
      message: "Missing announcement ID."
    };
  }

  const delta = Number(payload.delta) < 0 ? -1 : 1;

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    const sheet = ensureAnnouncementHeartSheet();
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values.length ? values[0].map(h => String(h).trim()) : [];
    const idCol = getHeaderColumnIndex(headers, ["AnnouncementID", "Announcement ID", "ID"]);
    const countCol = getHeaderColumnIndex(headers, ["Count", "HeartCount", "NotedCount"]);
    const updatedCol = getHeaderColumnIndex(headers, ["LastUpdated", "Last Updated"]);

    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol - 1] || "").trim() === announcementId) {
        targetRow = i + 1;
        break;
      }
    }

    let count = delta > 0 ? 1 : 0;

    if (targetRow === -1) {
      targetRow = sheet.getLastRow() + 1;
      sheet.getRange(targetRow, idCol).setValue(announcementId);
      sheet.getRange(targetRow, countCol).setValue(count);
    } else {
      const current = Number(sheet.getRange(targetRow, countCol).getValue()) || 0;
      count = Math.max(0, current + delta);
      sheet.getRange(targetRow, countCol).setValue(count);
    }

    if (updatedCol > 0) {
      sheet.getRange(targetRow, updatedCol).setValue(
        Utilities.formatDate(new Date(), TIMEZONE, "MMMM d, yyyy h:mm:ss a")
      );
    }

    return {
      success: true,
      count: count,
      message: delta > 0 ? "Announcement noted." : "Announcement unnoted."
    };

  } finally {
    lock.releaseLock();
  }
}

function attachAnnouncementHeartCounts(rows) {
  const counts = getAnnouncementHeartCountMap();

  return (rows || []).map(function(row) {
    const id = getAnnouncementStableId(row);
    const count = counts[String(id || "").trim()] || 0;

    return {
      ...row,
      ID: id,
      Id: id,
      id: id,
      HeartCount: count,
      NotedCount: count,
      AcknowledgementCount: count
    };
  });
}


function getAnnouncementStableId(row) {
  const explicitId = getValue(row, ["ID", "Id", "id", "RecordID", "Record ID"]);

  if (explicitId) return String(explicitId).trim();

  const rowNumber = getValue(row, ["RowNumber", "rowNumber", "__rowNumber"]);

  if (rowNumber) return "ANN-ROW-" + String(rowNumber).trim();

  const raw = [
    getValue(row, ["Date", "PostedDate", "DatePosted"]),
    getValue(row, ["Subject"]),
    getValue(row, ["Announcement"]),
    getValue(row, ["Teacher"]),
    getValue(row, ["Deadline"])
  ]
    .map(normalizeAnnouncementKeyPart)
    .filter(Boolean)
    .join("|");

  return raw ? "ANN-" + simpleAnnouncementHash(raw) : "";
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

function getAnnouncementHeartCountMap() {
  const sheet = ensureAnnouncementHeartSheet();
  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) return {};

  const headers = values[0].map(h => String(h).trim());
  const idCol = getHeaderColumnIndex(headers, ["AnnouncementID", "Announcement ID", "ID"]);
  const countCol = getHeaderColumnIndex(headers, ["Count", "HeartCount", "NotedCount"]);
  const counts = {};

  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][idCol - 1] || "").trim();
    const count = Number(values[i][countCol - 1]) || 0;

    if (id) counts[id] = count;
  }

  return counts;
}

function ensureAnnouncementHeartSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("AnnouncementHearts");

  if (!sheet) {
    sheet = ss.insertSheet("AnnouncementHearts");
    sheet.getRange(1, 1, 1, 3).setValues([[
      "AnnouncementID",
      "Count",
      "LastUpdated"
    ]]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const requiredHeaders = ["AnnouncementID", "Count", "LastUpdated"];
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(h => String(h).trim());

  requiredHeaders.forEach(function(header) {
    if (existingHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      existingHeaders.push(header);
    }
  });

  return sheet;
}

function getHeaderColumnIndex(headers, possibleNames) {
  const normalizedHeaders = headers.map(normalizeHeaderName);

  for (let i = 0; i < possibleNames.length; i++) {
    const target = normalizeHeaderName(possibleNames[i]);
    const index = normalizedHeaders.indexOf(target);

    if (index !== -1) return index + 1;
  }

  return -1;
}


/* ADMIN LIST API */
function getAdminList(sheetName) {
  if (!isAllowedAdminSheet(sheetName)) {
    return {
      status: "error",
      message: "Invalid or missing sheet name."
    };
  }

  return getManageList(sheetName);
}

/* OFFICER LIST API */
function getOfficerList(sheetName) {
  if (!isAllowedOfficerSheet(sheetName)) {
    return {
      status: "error",
      message: "This sheet is not allowed for officers."
    };
  }

  return getManageList(sheetName);
}

/* SHARED LIST FUNCTION */
function getManageList(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      status: "error",
      message: "Sheet not found: " + sheetName
    };
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 1) {
    return {
      status: "success",
      sheetName,
      headers: [],
      rows: []
    };
  }

  const headers = values[0].map(header => String(header).trim());

  let rows = values.slice(1)
    .map((row, index) => {
      return {
        rowNumber: index + 2,
        cells: row
      };
    })
    .filter(item => {
      return item.cells.some(cell => String(cell).trim() !== "");
    });

  if (sheetName === "Announcements") {
    rows = attachManageAnnouncementHeartCounts(headers, rows);
  }

  return {
    status: "success",
    sheetName,
    headers,
    rows
  };
}


function attachManageAnnouncementHeartCounts(headers, rows) {
  const counts = getAnnouncementHeartCountMap();

  return (rows || []).map(function(item) {
    const rowObject = {};

    (headers || []).forEach(function(header, index) {
      rowObject[header] = item.cells[index];
    });

    rowObject.RowNumber = item.rowNumber;
    rowObject.rowNumber = item.rowNumber;
    rowObject.__rowNumber = item.rowNumber;

    const id = getAnnouncementStableId(rowObject);
    const count = counts[String(id || "").trim()] || 0;

    return {
      ...item,
      announcementId: id,
      notedCount: count,
      heartCount: count
    };
  });
}


/* ADMIN PERMISSIONS */
function getAllowedAdminSheets() {
  return [
    "Announcements",
    "ThingsToBring",
    "AdviserReminders",
    "PrayerLeaders",
    "DailyQuotes",
    "Birthdays",
    "TickerMessages",
    "DailyInfo"
  ];
}

function isAllowedAdminSheet(sheetName) {
  return getAllowedAdminSheets().indexOf(sheetName) !== -1;
}

/* OFFICER PERMISSIONS */
function getAllowedOfficerSheets() {
  return [
    "Announcements",
    "ThingsToBring",
    "PrayerLeaders",
    "DailyQuotes",
    "Birthdays"
  ];
}

function isAllowedOfficerSheet(sheetName) {
  return getAllowedOfficerSheets().indexOf(sheetName) !== -1;
}

/* OFFICER ADD ONLY */
function addOfficerRow(payload) {
  const kind = payload.kind;

  const todayDate = Utilities.formatDate(
    new Date(),
    TIMEZONE,
    "MMMM d, yyyy"
  );

  if (kind === "announcement") {
    const id = generateAdminId("announcement");
    const attachments = uploadAnnouncementAttachments(payload.AttachmentFiles, id);
    appendAnnouncementRow(id, payload, todayDate, attachments);

    return {
      success: true,
      message: "Officer announcement saved successfully."
    };
  }

  if (kind === "things") {
    appendAdminRow("ThingsToBring", [
      formatInputDateToSheetDate(payload.Date) || todayDate,
      payload.Subject || "",
      payload.Item || "",
      payload.Publish || "YES"
    ]);

    return {
      success: true,
      message: "Officer things to bring saved successfully."
    };
  }

  if (kind === "prayer") {
    appendAdminRow("PrayerLeaders", [
      formatInputDateToSheetDate(payload.Date) || todayDate,
      payload.PrayerLeader || "",
      payload.Publish || "YES"
    ]);

    return {
      success: true,
      message: "Officer daily prayer saved successfully."
    };
  }

  if (kind === "quote") {
    appendAdminRow("DailyQuotes", [
      formatInputDateToSheetDate(payload.Date) || todayDate,
      payload.Quote || "",
      payload.Author || "SFK Officers",
      payload.Publish || "YES"
    ]);

    return {
      success: true,
      message: "Officer daily quote saved successfully."
    };
  }

  if (kind === "birthday") {
    appendAdminRow("Birthdays", [
      payload.Name || "",
      convertBirthdayToMonthDay(payload.Birthday),
      payload.Publish || "YES"
    ]);

    return {
      success: true,
      message: "Officer birthday greeting saved successfully."
    };
  }

  return {
    success: false,
    message: "This officer action is not allowed."
  };
}

/* OFFICER HIDE ONLY */
function hideOfficerRow(payload) {
  const sheetName = payload.sheetName;
  const rowNumber = Number(payload.rowNumber);

  if (!isAllowedOfficerSheet(sheetName)) {
    return {
      success: false,
      message: "Officers are not allowed to manage this sheet."
    };
  }

  if (!rowNumber || rowNumber < 2) {
    return {
      success: false,
      message: "Invalid row number."
    };
  }

  return setPublishToNo(sheetName, rowNumber);
}

function restoreOfficerRow(payload) {
  const sheetName = payload.sheetName;
  const rowNumber = Number(payload.rowNumber);

  if (!isAllowedOfficerSheet(sheetName)) {
    return {
      success: false,
      message: "Officers are not allowed to manage this sheet."
    };
  }

  if (!rowNumber || rowNumber < 2) {
    return {
      success: false,
      message: "Invalid row number."
    };
  }

  return setPublishToYes(sheetName, rowNumber);
}

/* ADMIN UPDATE */
function updateAdminRow(payload) {
  const sheetName = payload.sheetName;
  const rowNumber = Number(payload.rowNumber);
  let values = payload.values || [];

  if (!isAllowedAdminSheet(sheetName)) {
    return {
      success: false,
      message: "Invalid sheet name."
    };
  }

  if (!rowNumber || rowNumber < 2) {
    return {
      success: false,
      message: "Invalid row number."
    };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      success: false,
      message: "Sheet not found: " + sheetName
    };
  }

  const lastColumn = sheet.getLastColumn();

  while (values.length < lastColumn) {
    values.push("");
  }

  if (values.length > lastColumn) {
    values = values.slice(0, lastColumn);
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(function(header) {
      return String(header).trim();
    });

  const formattedValues = formatAdminValuesForSheet(sheetName, values, headers);

  for (let column = 1; column <= lastColumn; column++) {
    setCellValueAllowCustom(
      sheet,
      rowNumber,
      column,
      formattedValues[column - 1] || "",
      headers[column - 1]
    );
  }

  return {
    success: true,
    message: "Record updated successfully."
  };
}

/* ADMIN HIDE */
function unpublishAdminRow(payload) {
  const sheetName = payload.sheetName;
  const rowNumber = Number(payload.rowNumber);

  if (!isAllowedAdminSheet(sheetName)) {
    return {
      success: false,
      message: "Invalid sheet name."
    };
  }

  if (!rowNumber || rowNumber < 2) {
    return {
      success: false,
      message: "Invalid row number."
    };
  }

  return setPublishToNo(sheetName, rowNumber);
}

function restoreAdminRow(payload) {
  const sheetName = payload.sheetName;
  const rowNumber = Number(payload.rowNumber);

  if (!isAllowedAdminSheet(sheetName)) {
    return {
      success: false,
      message: "Invalid sheet name."
    };
  }

  if (!rowNumber || rowNumber < 2) {
    return {
      success: false,
      message: "Invalid row number."
    };
  }

  return setPublishToYes(sheetName, rowNumber);
}

/* SHARED HIDE FUNCTION */
function setPublishToNo(sheetName, rowNumber) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      success: false,
      message: "Sheet not found: " + sheetName
    };
  }

  if (rowNumber > sheet.getLastRow()) {
    return {
      success: false,
      message: "Row does not exist."
    };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(header => String(header).trim());

  const publishIndex = headers.findIndex(header => {
    const cleanHeader = String(header).trim().toUpperCase();
    return cleanHeader === "PUBLISH" || cleanHeader === "PUBLISHED";
  });

  if (publishIndex === -1) {
    return {
      success: false,
      message: "Publish column not found."
    };
  }

  setCellValueAllowCustom(sheet, rowNumber, publishIndex + 1, "NO");

  return {
    success: true,
    message: "Record hidden successfully."
  };
}

function setPublishToYes(sheetName, rowNumber) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      success: false,
      message: "Sheet not found: " + sheetName
    };
  }

  if (rowNumber > sheet.getLastRow()) {
    return {
      success: false,
      message: "Row does not exist."
    };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(header => String(header).trim());

  const publishIndex = headers.findIndex(header => {
    const cleanHeader = String(header).trim().toUpperCase();
    return cleanHeader === "PUBLISH" || cleanHeader === "PUBLISHED";
  });

  if (publishIndex === -1) {
    return {
      success: false,
      message: "Publish column not found."
    };
  }

  setCellValueAllowCustom(sheet, rowNumber, publishIndex + 1, "YES");

  return {
    success: true,
    message: "Record restored successfully."
  };
}

/* ADMIN DELETE ONLY */
function deleteAdminRow(payload) {
  const sheetName = payload.sheetName;
  const rowNumber = Number(payload.rowNumber);

  if (!isAllowedAdminSheet(sheetName)) {
    return {
      success: false,
      message: "Invalid sheet name."
    };
  }

  if (!rowNumber || rowNumber < 2) {
    return {
      success: false,
      message: "Invalid row number."
    };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      success: false,
      message: "Sheet not found: " + sheetName
    };
  }

  if (rowNumber > sheet.getLastRow()) {
    return {
      success: false,
      message: "Row does not exist."
    };
  }

  sheet.deleteRow(rowNumber);

  return {
    success: true,
    message: "Record deleted successfully."
  };
}

function batchUnpublishAdminRows(payload) {
  const sheetName = payload.sheetName;
  const rowNumbers = sanitizeRowNumbers(payload.rowNumbers);

  if (!isAllowedAdminSheet(sheetName)) {
    return {
      success: false,
      message: "Invalid sheet name."
    };
  }

  if (rowNumbers.length === 0) {
    return {
      success: false,
      message: "No valid rows selected."
    };
  }

  rowNumbers.forEach(rowNumber => {
    setPublishToNo(sheetName, rowNumber);
  });

  return {
    success: true,
    message: rowNumbers.length + " selected record(s) hidden successfully."
  };
}

function batchDeleteAdminRows(payload) {
  const sheetName = payload.sheetName;
  const rowNumbers = sanitizeRowNumbers(payload.rowNumbers).sort(function(a, b) {
    return b - a;
  });

  if (!isAllowedAdminSheet(sheetName)) {
    return {
      success: false,
      message: "Invalid sheet name."
    };
  }

  if (rowNumbers.length === 0) {
    return {
      success: false,
      message: "No valid rows selected."
    };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return {
      success: false,
      message: "Sheet not found: " + sheetName
    };
  }

  rowNumbers.forEach(rowNumber => {
    if (rowNumber >= 2 && rowNumber <= sheet.getLastRow()) {
      sheet.deleteRow(rowNumber);
    }
  });

  return {
    success: true,
    message: rowNumbers.length + " selected record(s) deleted successfully."
  };
}

function batchHideOfficerRows(payload) {
  const sheetName = payload.sheetName;
  const rowNumbers = sanitizeRowNumbers(payload.rowNumbers);

  if (!isAllowedOfficerSheet(sheetName)) {
    return {
      success: false,
      message: "Officers are not allowed to manage this sheet."
    };
  }

  if (rowNumbers.length === 0) {
    return {
      success: false,
      message: "No valid rows selected."
    };
  }

  rowNumbers.forEach(rowNumber => {
    setPublishToNo(sheetName, rowNumber);
  });

  return {
    success: true,
    message: rowNumbers.length + " selected record(s) hidden successfully."
  };
}

function sanitizeRowNumbers(rowNumbers) {
  const seen = {};

  return (rowNumbers || [])
    .map(Number)
    .filter(rowNumber => rowNumber && rowNumber >= 2)
    .filter(rowNumber => {
      if (seen[rowNumber]) return false;
      seen[rowNumber] = true;
      return true;
    });
}

function uploadAnnouncementAttachments(files, recordId) {
  const safeFiles = Array.isArray(files) ? files.slice(0, 5) : [];

  if (safeFiles.length === 0) {
    return {
      urls: "",
      names: ""
    };
  }

  const folder = getOrCreateAttachmentFolder();
  const urls = [];
  const names = [];

  safeFiles.forEach(function(file, index) {
    if (!file || !file.data) return;

    const originalName = sanitizeFileName(file.name || ("attachment-" + (index + 1)));
    const mimeType = file.mimeType || "application/octet-stream";
    const bytes = Utilities.base64Decode(file.data);
    const blob = Utilities.newBlob(bytes, mimeType, recordId + "-" + (index + 1) + "-" + originalName);
    const driveFile = folder.createFile(blob);

    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      // Some school domains block public sharing. The file URL is still saved.
    }

    urls.push(driveFile.getUrl());
    names.push(originalName);
  });

  return {
    urls: urls.join("\n"),
    names: names.join("\n")
  };
}


function getAnnouncementTeacherDisplay(payload) {
  const teacher = String(payload.Teacher || "").trim();
  const officerPosition = String(payload.OfficerPosition || payload.Officer || payload.Position || "").trim();

  if (!officerPosition) {
    return teacher;
  }

  if (teacher) {
    return teacher + " thru " + officerPosition;
  }

  return "Teacher thru " + officerPosition;
}

function appendAnnouncementRow(id, payload, todayDate, attachments) {
  ensureAnnouncementAttachmentHeaders();

  const rowObject = {
    id: id,
    date: formatInputDateToSheetDate(payload.Date) || todayDate,
    posteddate: formatInputDateToSheetDate(payload.Date) || todayDate,
    dateposted: formatInputDateToSheetDate(payload.Date) || todayDate,
    subject: payload.Subject || "",
    announcement: payload.Announcement || "",
    deadline: formatInputDateToSheetDate(payload.Deadline) || "",
    showdeadline: payload.ShowDeadline || "YES",
    teacher: getAnnouncementTeacherDisplay(payload),
    priority: payload.Priority || "Reminder",
    officerposition: payload.OfficerPosition || "",
    publish: payload.Publish || "YES",
    attachmenturls: attachments.urls || "",
    attachments: attachments.urls || "",
    attachmenturl: attachments.urls || "",
    attachmentnames: attachments.names || "",
    attachmentlabels: attachments.names || "",
    attachmentname: attachments.names || ""
  };

  appendRowByHeader("Announcements", rowObject);
}

function appendRowByHeader(sheetName, rowObject) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const rowNumber = sheet.getLastRow() + 1;

  headers.forEach(function(header, index) {
    const cleanHeader = normalizeHeaderName(header);

    if (Object.prototype.hasOwnProperty.call(rowObject, cleanHeader)) {
      setCellValueAllowCustom(sheet, rowNumber, index + 1, rowObject[cleanHeader], header);
    }
  });
}

function getOrCreateAttachmentFolder() {
  const existing = DriveApp.getFoldersByName(ATTACHMENT_FOLDER_NAME);

  if (existing.hasNext()) {
    return existing.next();
  }

  return DriveApp.createFolder(ATTACHMENT_FOLDER_NAME);
}

function sanitizeFileName(value) {
  const text = String(value || "attachment").trim();
  const safe = text.replace(/[\\/:*?"<>|#%{}~&]/g, "-").replace(/\s+/g, " ");

  return safe || "attachment";
}

function ensureAnnouncementAttachmentHeaders() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Announcements");

  if (!sheet) return;

  const requiredHeaders = ["ID", "ShowDeadline", "AttachmentURLs", "AttachmentNames", "OfficerPosition"];
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(String);
  let nextColumn = headers.length + 1;

  requiredHeaders.forEach(function(header) {
    const exists = headers.some(function(existingHeader) {
      return normalizeHeaderName(existingHeader) === normalizeHeaderName(header);
    });

    if (!exists) {
      sheet.getRange(1, nextColumn).setValue(header);
      headers.push(header);
      nextColumn += 1;
    }
  });
}

/* FORMAT EDITED VALUES BEFORE SAVING */
function formatAdminValuesForSheet(sheetName, values, headers) {
  const newValues = values.map(value => String(value || "").trim());

  if (sheetName === "Announcements") {
    const hasIdColumn = normalizeHeaderName(headers && headers[0]) === "id";
    const dateIndex = hasIdColumn ? 1 : 0;
    const deadlineIndex = hasIdColumn ? 4 : 3;

    if (newValues[dateIndex]) newValues[dateIndex] = formatInputDateToSheetDate(newValues[dateIndex]);
    if (newValues[deadlineIndex]) newValues[deadlineIndex] = formatInputDateToSheetDate(newValues[deadlineIndex]);
  }

  if (sheetName === "ThingsToBring") {
    if (newValues[0]) newValues[0] = formatInputDateToSheetDate(newValues[0]);
  }

  if (sheetName === "AdviserReminders") {
    if (newValues[0]) newValues[0] = formatInputDateToSheetDate(newValues[0]);
  }

  if (sheetName === "PrayerLeaders") {
    if (newValues[0]) newValues[0] = formatInputDateToSheetDate(newValues[0]);
  }

  if (sheetName === "DailyQuotes") {
    if (newValues[0]) newValues[0] = formatInputDateToSheetDate(newValues[0]);
  }

  if (sheetName === "Birthdays") {
    if (newValues[1]) newValues[1] = convertBirthdayToMonthDay(newValues[1]);
  }

  return newValues;
}

function normalizeHeaderName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getCurrentSubject(schedule, now) {
  const nowMinutes = getNowMinutes(now);

  return schedule.find(item => {
    const start = timeToMinutes(item.StartTime);
    const end = timeToMinutes(item.EndTime);

    return nowMinutes >= start && nowMinutes < end;
  }) || null;
}

function getNextSubject(schedule, now) {
  const nowMinutes = getNowMinutes(now);

  return schedule.find(item => {
    const start = timeToMinutes(item.StartTime);
    return start > nowMinutes;
  }) || null;
}

function getRows(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) return [];

  const headers = values[0].map(header => String(header).trim());

  return values.slice(1).map((row, index) => {
    let obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    obj.RowNumber = index + 2;
    obj.rowNumber = index + 2;
    obj.__rowNumber = index + 2;

    return obj;
  });
}

function appendAdminRow(sheetName, rowData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  const rowNumber = sheet.getLastRow() + 1;
  const headers = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    : [];

  rowData.forEach(function(value, index) {
    setCellValueAllowCustom(sheet, rowNumber, index + 1, value, headers[index]);
  });
}

function setCellValueAllowCustom(sheet, rowNumber, columnNumber, value, header) {
  const range = sheet.getRange(rowNumber, columnNumber);

  if (shouldAllowCustomValue(header)) {
    range.clearDataValidations();
  }

  try {
    range.setValue(value);
  } catch (error) {
    range.clearDataValidations();
    range.setValue(value);
  }
}

function shouldAllowCustomValue(header) {
  const cleanHeader = normalizeHeaderName(header);

  return [
    "subject",
    "teacher",
    "entrygate",
    "exitgate",
    "uniform",
    "prescribeduniform",
    "quote",
    "author",
    "message",
    "announcement",
    "item",
    "reminder",
    "officerposition"
  ].indexOf(cleanHeader) !== -1;
}

function generateAdminId(type) {
  const prefixMap = {
    announcement: "ANN",
    things: "TBR",
    reminder: "REM",
    prayer: "PRY",
    quote: "QTE",
    birthday: "BDY",
    ticker: "TCK"
  };

  const prefix = prefixMap[type] || "SFK";

  const stamp = Utilities.formatDate(
    new Date(),
    TIMEZONE,
    "yyyyMMddHHmmss"
  );

  return prefix + "-" + stamp;
}

function formatInputDateToSheetDate(dateValue) {
  if (!dateValue) return "";

  const text = stripTextFormatTag(dateValue);

  if (!text) return "";

  const date = new Date(text);

  if (isNaN(date)) {
    return text;
  }

  return Utilities.formatDate(date, TIMEZONE, "MMMM d, yyyy");
}

function convertBirthdayToMonthDay(dateValue) {
  if (!dateValue) return "";

  const text = String(dateValue).trim();

  if (!text) return "";

  const date = new Date(text);

  if (!isNaN(date)) {
    return Utilities.formatDate(date, TIMEZONE, "MM-dd");
  }

  return text;
}

function getNowMinutes(date) {
  const hours = Number(Utilities.formatDate(date, TIMEZONE, "H"));
  const minutes = Number(Utilities.formatDate(date, TIMEZONE, "m"));

  return hours * 60 + minutes;
}

function timeToMinutes(timeValue) {
  if (!timeValue) return 0;

  const text = String(timeValue).trim();

  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);

  if (!match) return 0;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* SFK MEMORIES */
function getPublishedMemories() {
  const sheet = ensureMemoriesSheet();
  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return { status: "success", memories: [] };
  }

  const headers = values[0].map(function(header) {
    return String(header || "").trim();
  });

  const memories = values.slice(1)
    .map(function(row, index) {
      const item = {};
      headers.forEach(function(header, columnIndex) {
        item[header] = row[columnIndex];
      });
      item.RowNumber = index + 2;
      return attachMemoryDriveDownloadUrls(item);
    })
    .filter(function(item) {
      return String(item.Publish || "YES").trim().toUpperCase() === "YES";
    })
    .sort(function(a, b) {
      return String(b.CreatedAt || b.Date || "").localeCompare(String(a.CreatedAt || a.Date || ""));
    });

  return {
    status: "success",
    memories: memories
  };
}

function getMemoryAudioPayload(fileId) {
  const cleanId = String(fileId || "").trim();

  if (!cleanId) {
    return { success: false, message: "Music file is not available." };
  }

  try {
    const file = DriveApp.getFileById(cleanId);
    const mimeType = file.getMimeType() || "";
    if (mimeType.indexOf("audio/") !== 0) {
      return { success: false, message: "This Drive file is not an audio file." };
    }

    const size = Number(file.getSize()) || 0;

    if (size > 12 * 1024 * 1024) {
      return { success: false, message: "Music file exceeds the 12 MB playback limit." };
    }

    const blob = file.getBlob();
    return {
      success: true,
      name: file.getName(),
      mimeType: blob.getContentType() || mimeType || "audio/mpeg",
      data: Utilities.base64Encode(blob.getBytes())
    };
  } catch (error) {
    return { success: false, message: "Unable to load the music file from Drive." };
  }
}

function getMemoryMusicLibrary() {
  const folder = getOrCreateMemoryMusicFolder();
  const files = folder.getFiles();
  const songs = [];

  while (files.hasNext() && songs.length < 100) {
    const file = files.next();
    const mimeType = file.getMimeType() || "";
    if (mimeType.indexOf("audio/") !== 0) continue;

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      // Managed school domains may block public sharing. The script can still proxy playback.
    }

    songs.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: mimeType,
      size: Number(file.getSize()) || 0,
      url: file.getUrl()
    });
  }

  songs.sort(function(a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return {
    status: "success",
    folderName: MEMORY_MUSIC_FOLDER_NAME,
    songs: songs
  };
}

function isPublishedMemoryAudioFile(fileId) {
  const rows = getRows("Memories").filter(function(row) {
    return isPublished(row);
  });

  return rows.some(function(row) {
    try {
      const music = JSON.parse(row.MusicJSON || "null");
      if (music && String(music.fileId || "").trim() === fileId) return true;
    } catch (error) {
      // Continue checking the linked music field.
    }

    return extractDriveFileId(row.MusicURL) === fileId;
  });
}

function createMemoryPost(payload) {
  const role = normalizeMemoryRole(payload.Role);

  if (!isValidMemoryAuth(role, payload.Pin)) {
    return { success: false, message: "Incorrect admin/officer credentials." };
  }

  const title = String(payload.Title || "").trim();
  const caption = String(payload.Caption || "").trim();
  const postedBy = String(payload.PostedBy || "").trim();
  const videoUrl = String(payload.VideoURL || "").trim();
  const musicUrl = String(payload.MusicURL || "").trim();
  const files = Array.isArray(payload.MediaFiles) ? payload.MediaFiles.slice(0, 6) : [];

  if (!postedBy) {
    return { success: false, message: "Posted by is required." };
  }

  if (files.length === 0 && !videoUrl && !musicUrl && !payload.MusicFile && !title && !caption) {
    return { success: false, message: "Write a title or caption, or add an attachment." };
  }

  const memoryId = "MEM-" + Utilities.formatDate(new Date(), TIMEZONE, "yyyyMMddHHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
  const media = uploadMemoryMedia(files, memoryId);
  const music = uploadMemoryMusic(payload.MusicFile, memoryId);
  const sheet = ensureMemoriesSheet();
  const eventDate = formatInputDateToSheetDate(payload.Date) || Utilities.formatDate(new Date(), TIMEZONE, "MMMM d, yyyy");
  const createdAt = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    memoryId,
    eventDate,
    title || "Untitled Memory",
    caption,
    postedBy,
    role,
    JSON.stringify(media),
    videoUrl,
    0,
    "YES",
    createdAt,
    musicUrl,
    JSON.stringify(music)
  ]);

  return {
    success: true,
    id: memoryId,
    message: "Memory posted successfully."
  };
}

function uploadMemoryAssets(payload) {
  const role = normalizeMemoryRole(payload.Role);

  if (!isValidMemoryAuth(role, payload.Pin)) {
    return { success: false, message: "Incorrect admin/officer credentials." };
  }

  const memoryId = String(payload.MemoryID || "").trim() ||
    "MEM-" + Utilities.formatDate(new Date(), TIMEZONE, "yyyyMMddHHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
  const files = Array.isArray(payload.MediaFiles) ? payload.MediaFiles.slice(0, 6) : [];

  return {
    success: true,
    memoryId: memoryId,
    media: uploadMemoryMedia(files, memoryId),
    music: uploadMemoryMusic(payload.MusicFile, memoryId)
  };
}

function uploadMemoryMedia(files, memoryId) {
  const safeFiles = Array.isArray(files) ? files.slice(0, 6) : [];
  if (safeFiles.length === 0) return [];

  const folder = getOrCreateMemoryFolder();
  const media = [];

  safeFiles.forEach(function(file, index) {
    if (!file || !file.data) return;

    const mimeType = String(file.mimeType || "application/octet-stream");
    if (mimeType.indexOf("image/") !== 0 && mimeType.indexOf("video/") !== 0) return;

    const name = sanitizeFileName(file.name || ("memory-" + (index + 1)));
    const bytes = Utilities.base64Decode(file.data);
    const blob = Utilities.newBlob(bytes, mimeType, memoryId + "-" + (index + 1) + "-" + name);
    const driveFile = folder.createFile(blob);

    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (error) {
      // Managed school domains may block public sharing.
    }

    const fileId = driveFile.getId();
    const isVideo = mimeType.indexOf("video/") === 0;

    media.push({
      kind: isVideo ? "drive-video" : "image",
      name: name,
      mimeType: mimeType,
      fileId: fileId,
      url: isVideo
        ? "https://drive.google.com/file/d/" + fileId + "/preview"
        : "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1600",
      viewerUrl: isVideo
        ? "https://drive.google.com/file/d/" + fileId + "/preview"
        : "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w4000",
      downloadUrl: driveFile.getDownloadUrl(),
      fullUrl: driveFile.getUrl()
    });
  });

  return media;
}

function uploadMemoryMusic(file, memoryId) {
  if (!file || !file.data || String(file.mimeType || "").indexOf("audio/") !== 0) {
    return null;
  }

  const folder = getOrCreateMemoryFolder();
  const mimeType = String(file.mimeType || "audio/mpeg");
  const name = sanitizeFileName(file.name || "background-music");
  const bytes = Utilities.base64Decode(file.data);
  const blob = Utilities.newBlob(bytes, mimeType, memoryId + "-music-" + name);
  const driveFile = folder.createFile(blob);

  try {
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    // Managed school domains may block public sharing.
  }

  return {
    kind: "drive-audio",
    name: name,
    mimeType: mimeType,
    fileId: driveFile.getId(),
    downloadUrl: driveFile.getDownloadUrl(),
    previewUrl: driveFile.getUrl()
  };
}

function attachMemoryDriveDownloadUrls(item) {
  try {
    const media = JSON.parse(item.MediaJSON || "[]");
    if (Array.isArray(media)) {
      media.forEach(function(entry) {
        if (entry && entry.fileId && !entry.downloadUrl) {
          entry.downloadUrl = DriveApp.getFileById(entry.fileId).getDownloadUrl();
        }
      });
      item.MediaJSON = JSON.stringify(media);
    }
  } catch (error) {
    // Keep the original media metadata when Drive lookup is unavailable.
  }

  try {
    const music = JSON.parse(item.MusicJSON || "null");
    if (music && music.fileId && !music.downloadUrl) {
      music.downloadUrl = DriveApp.getFileById(music.fileId).getDownloadUrl();
      item.MusicJSON = JSON.stringify(music);
    }
  } catch (error) {
    // Keep the original music metadata when Drive lookup is unavailable.
  }

  const videoFileId = extractDriveFileId(item.VideoURL);
  if (videoFileId) item.VideoDownloadURL = getDriveDownloadUrlSafely(videoFileId);

  const musicFileId = extractDriveFileId(item.MusicURL);
  if (musicFileId) item.MusicDownloadURL = getDriveDownloadUrlSafely(musicFileId);

  return item;
}

function extractDriveFileId(value) {
  const text = String(value || "");
  const pathMatch = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = text.match(/[?&]id=([^&]+)/i);
  return queryMatch ? queryMatch[1] : "";
}

function getDriveDownloadUrlSafely(fileId) {
  try {
    return DriveApp.getFileById(fileId).getDownloadUrl();
  } catch (error) {
    return "";
  }
}

function recordMemoryHeart(payload) {
  const memoryId = String(payload.MemoryID || payload.memoryId || "").trim();
  if (!memoryId) return { success: false, message: "Missing memory ID." };

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);

  try {
    const sheet = ensureMemoriesSheet();
    const rowNumber = findMemoryRow(sheet, memoryId);
    if (rowNumber < 2) return { success: false, message: "Memory not found." };

    const heartColumn = getMemoryColumn(sheet, "HeartCount");
    const current = Number(sheet.getRange(rowNumber, heartColumn).getValue()) || 0;
    const delta = Number(payload.delta) < 0 ? -1 : 1;
    const next = Math.max(0, current + delta);
    sheet.getRange(rowNumber, heartColumn).setValue(next);

    return { success: true, count: next };
  } finally {
    lock.releaseLock();
  }
}

function hideMemoryPost(payload) {
  const role = normalizeMemoryRole(payload.Role);
  if (!isValidMemoryAuth(role, payload.Pin)) {
    return { success: false, message: "Incorrect admin/officer credentials." };
  }

  const sheet = ensureMemoriesSheet();
  const rowNumber = findMemoryRow(sheet, payload.MemoryID || payload.memoryId);
  if (rowNumber < 2) return { success: false, message: "Memory not found." };

  sheet.getRange(rowNumber, getMemoryColumn(sheet, "Publish")).setValue("NO");
  return { success: true, message: "Memory hidden." };
}

function updateMemoryPost(payload) {
  const role = normalizeMemoryRole(payload.Role);
  if (!isValidMemoryAuth(role, payload.Pin)) {
    return { success: false, message: "Incorrect admin/officer credentials." };
  }

  const sheet = ensureMemoriesSheet();
  const rowNumber = findMemoryRow(sheet, payload.MemoryID || payload.memoryId);
  if (rowNumber < 2) return { success: false, message: "Memory not found." };

  const title = String(payload.Title || "").trim() || "Untitled Memory";
  const caption = String(payload.Caption || "").trim();
  const postedBy = String(payload.PostedBy || "").trim() || "SFK";
  const videoUrl = String(payload.VideoURL || "").trim();
  const eventDate = formatInputDateToSheetDate(payload.Date) ||
    Utilities.formatDate(new Date(), TIMEZONE, "MMMM d, yyyy");

  sheet.getRange(rowNumber, getMemoryColumn(sheet, "Date")).setValue(eventDate);
  sheet.getRange(rowNumber, getMemoryColumn(sheet, "Title")).setValue(title);
  sheet.getRange(rowNumber, getMemoryColumn(sheet, "Caption")).setValue(caption);
  sheet.getRange(rowNumber, getMemoryColumn(sheet, "PostedBy")).setValue(postedBy);
  sheet.getRange(rowNumber, getMemoryColumn(sheet, "VideoURL")).setValue(videoUrl);

  return { success: true, message: "Memory updated." };
}

function deleteMemoryPost(payload) {
  const role = normalizeMemoryRole(payload.Role);
  if (role !== "Admin" || !isValidMemoryAuth(role, payload.Pin)) {
    return { success: false, message: "Only the admin can permanently delete memories." };
  }

  const sheet = ensureMemoriesSheet();
  const rowNumber = findMemoryRow(sheet, payload.MemoryID || payload.memoryId);
  if (rowNumber < 2) return { success: false, message: "Memory not found." };

  sheet.deleteRow(rowNumber);
  return { success: true, message: "Memory deleted permanently." };
}

function normalizeMemoryRole(value) {
  return String(value || "").trim().toLowerCase() === "admin" ? "Admin" : "Officer";
}

function isValidMemoryAuth(role, pin) {
  const cleanPin = String(pin || "").trim();
  return (role === "Admin" && cleanPin === MEMORY_ADMIN_PIN) ||
    (role === "Officer" && cleanPin === MEMORY_OFFICER_PIN);
}

function ensureMemoriesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("Memories");
  const headers = [
    "ID", "Date", "Title", "Caption", "PostedBy", "Role",
    "MediaJSON", "VideoURL", "HeartCount", "Publish", "CreatedAt",
    "MusicURL", "MusicJSON"
  ];

  if (!sheet) {
    sheet = ss.insertSheet("Memories");
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#f7c600")
      .setFontColor("#111111");
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
      .getDisplayValues()[0]
      .map(function(header) { return String(header || "").trim(); });

    headers.forEach(function(header) {
      const exists = existingHeaders.some(function(existingHeader) {
        return normalizeHeaderName(existingHeader) === normalizeHeaderName(header);
      });

      if (!exists) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        existingHeaders.push(header);
      }
    });
  }

  return sheet;
}

function getOrCreateMemoryFolder() {
  const folders = DriveApp.getFoldersByName(MEMORY_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(MEMORY_FOLDER_NAME);
}

function getOrCreateMemoryMusicFolder() {
  const folders = DriveApp.getFoldersByName(MEMORY_MUSIC_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(MEMORY_MUSIC_FOLDER_NAME);
}

function findMemoryRow(sheet, memoryId) {
  const cleanId = String(memoryId || "").trim();
  if (!cleanId || sheet.getLastRow() < 2) return -1;

  const idColumn = getMemoryColumn(sheet, "ID");
  const ids = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getDisplayValues();

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === cleanId) return i + 2;
  }

  return -1;
}

function getMemoryColumn(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const target = normalizeHeaderName(headerName);

  for (let i = 0; i < headers.length; i++) {
    if (normalizeHeaderName(headers[i]) === target) return i + 1;
  }

  throw new Error("Missing Memories column: " + headerName);
}

function stripTextFormatTag(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\[(center|left|right|bullets|numbers)\]\s*\n?/i, "")
    .trim();
}
