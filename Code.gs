const SPREADSHEET_ID = "1RVCRiYviRAr3nXS_uMBXDK3g9FISq9m3GBt4_V4h3Ew";
const TIMEZONE = "Asia/Manila";

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

    if (type === "officerHide") {
      return jsonResponse(hideOfficerRow(payload));
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
      appendAdminRow("Announcements", [
        id,
        formatInputDateToSheetDate(payload.Date) || todayDate,
        payload.Subject || "",
        payload.Announcement || "",
        formatInputDateToSheetDate(payload.Deadline) || "",
        payload.Teacher || "",
        payload.Priority || "Reminder",
        payload.Publish || "YES"
      ]);
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

    announcements: getPublishedRows("Announcements"),
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

  const rows = values.slice(1)
    .map((row, index) => {
      return {
        rowNumber: index + 2,
        cells: row
      };
    })
    .filter(item => {
      return item.cells.some(cell => String(cell).trim() !== "");
    });

  return {
    status: "success",
    sheetName,
    headers,
    rows
  };
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
    appendAdminRow("Announcements", [
      generateAdminId("announcement"),
      formatInputDateToSheetDate(payload.Date) || todayDate,
      payload.Subject || "",
      payload.Announcement || "",
      formatInputDateToSheetDate(payload.Deadline) || "",
      payload.Teacher || "",
      payload.Priority || "Reminder",
      payload.Publish || "YES"
    ]);

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

  return values.slice(1).map(row => {
    let obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

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
    "reminder"
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

function stripTextFormatTag(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\[(center|left|right|bullets|numbers)\]\s*\n?/i, "")
    .trim();
}
