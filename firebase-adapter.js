(function () {
  const APPS_SCRIPT_MARKER = "script.google.com/macros";
  const TIMEZONE = "Asia/Manila";

  const SHEETS = {
    Settings: {
      collection: "settings",
      headers: ["Key", "Value"]
    },
    Schedule: {
      collection: "schedule",
      headers: ["Day", "StartTime", "EndTime", "Subject", "Teacher", "Room", "Color", "Publish"]
    },
    Announcements: {
      collection: "announcements",
      headers: ["ID", "Date", "Subject", "Announcement", "Teacher", "Deadline", "ShowDeadline", "AttachmentURLs", "AttachmentNames", "Priority", "PublishDate", "ExpiryDate", "Publish", "HeartCount"]
    },
    ThingsToBring: {
      collection: "thingsToBring",
      headers: ["Date", "Subject", "Item", "Publish"]
    },
    AdviserReminders: {
      collection: "adviserReminders",
      headers: ["Date", "Reminder", "Publish"]
    },
    PrayerLeaders: {
      collection: "prayerLeaders",
      headers: ["Date", "PrayerLeader", "Publish"]
    },
    DailyQuotes: {
      collection: "dailyQuotes",
      headers: ["Date", "Quote", "Author", "Publish"]
    },
    Birthdays: {
      collection: "birthdays",
      headers: ["Name", "Birthday", "Publish"]
    },
    TickerMessages: {
      collection: "tickerMessages",
      headers: ["Message", "Priority", "Publish"]
    },
    DailyInfo: {
      collection: "dailyInfo",
      headers: ["Day", "EntryGate", "ExitGate", "Uniform", "Publish"]
    },
    Memories: {
      collection: "memories",
      headers: ["ID", "Date", "Caption", "Author", "Role", "MediaItems", "Music", "Publish", "HeartCount"]
    }
  };

  const TYPE_TO_SHEET = {
    schedule: "Schedule",
    announcement: "Announcements",
    things: "ThingsToBring",
    reminder: "AdviserReminders",
    prayer: "PrayerLeaders",
    quote: "DailyQuotes",
    birthday: "Birthdays",
    ticker: "TickerMessages",
    dailyInfo: "DailyInfo"
  };

  const originalFetch = window.fetch.bind(window);
  let db = null;

  function initialize() {
    if (!window.SFK_FIREBASE_READY || !window.firebase) {
      console.warn("SFK Firebase is not configured yet. Apps Script fallback remains active.");
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(window.SFK_FIREBASE_CONFIG);
    }

    db = firebase.firestore();
    window.SFK_CLASSBOARD_FIREBASE_DB = db;
    window.fetch = firebaseAwareFetch;
    console.info("SFK ClassBoard Firebase adapter enabled.");
  }

  async function firebaseAwareFetch(input, options) {
    const url = typeof input === "string" ? input : input && input.url;
    if (!url || !String(url).includes(APPS_SCRIPT_MARKER)) {
      return originalFetch(input, options);
    }

    try {
      const parsed = new URL(url);
      const requestType = parsed.searchParams.get("type");
      if (requestType === "memoryAudio" || requestType === "memoryMedia") {
        return originalFetch(input, options);
      }

      if (options && String(options.method || "GET").toUpperCase() === "POST") {
        const body = JSON.parse(options.body || "{}");
        // These request types must go directly to Apps Script/Drive.
        // If they are intercepted here, the page shows errors like
        // "Unknown Firebase request type: memoryUploadSession" and photo uploads fail.
        if (["musicMetadataBatch", "memoryUploadSession", "memoryUploadAssets"].includes(body.type)) {
          return originalFetch(input, options);
        }
        return jsonResponse(await handlePost(body, url));
      }

      return jsonResponse(await handleGet(parsed.searchParams));
    } catch (error) {
      console.error("Firebase adapter error:", error);
      return jsonResponse({ success: false, status: "error", message: error.message || "Firebase error" }, 500);
    }
  }

  async function handleGet(params) {
    const type = params.get("type") || "today";

    if (type === "today") return getTodayBoard();
    if (type === "schedule") return getWeeklySchedule();
    if (type === "settings") return getSettings();
    if (type === "adminList") {
      requireFirebaseRole(["admin"]);
      return getManageList(params.get("sheet"));
    }
    if (type === "officerList") {
      requireFirebaseRole(["admin", "officer"]);
      return getManageList(params.get("sheet"));
    }
    if (type === "memories") return getMemories();
    if (type === "memoryAudio") return getMemoryAudio(params.get("fileId"));

    return { status: "error", message: "Invalid Firebase endpoint." };
  }

  async function handlePost(body, sourceUrl) {
    const type = body.type;
    const payload = body.payload || {};

    if (type === "adminUpdate") {
      requireFirebaseRole(["admin"]);
      return updateRow(payload);
    }
    if (type === "adminUnpublish") {
      requireFirebaseRole(["admin"]);
      return unpublishRow(payload);
    }
    if (type === "officerHide") {
      requireFirebaseRole(["admin", "officer"]);
      return unpublishRow(payload);
    }
    if (type === "adminRestore") {
      requireFirebaseRole(["admin"]);
      return publishRow(payload);
    }
    if (type === "officerRestore") {
      requireFirebaseRole(["admin", "officer"]);
      return publishRow(payload);
    }
    if (type === "adminDelete") {
      requireFirebaseRole(["admin"]);
      return deleteRow(payload);
    }
    if (type === "adminBatchUnpublish") {
      requireFirebaseRole(["admin"]);
      return batchRows(payload, unpublishRow);
    }
    if (type === "officerBatchHide") {
      requireFirebaseRole(["admin", "officer"]);
      return batchRows(payload, unpublishRow);
    }
    if (type === "adminBatchDelete") {
      requireFirebaseRole(["admin"]);
      return batchRows(payload, deleteRow);
    }
    if (type === "officerAdd") {
      requireFirebaseRole(["admin", "officer"]);
      return addTypedRow(payload.kind, payload, sourceUrl);
    }
    if (type === "announcementHeart" || type === "announcementHeartV2") return recordHeart("Announcements", payload.announcementId || payload.AnnouncementID || payload.ID || payload.id, payload.delta, payload);
    if (type === "memoryHeart" || type === "memoryHeartV2") return recordHeart("Memories", payload.memoryId || payload.MemoryID || payload.ID || payload.id, payload.delta, payload);
    if (type === "memoryAuth") return checkMemoryAuth(payload);
    if (type === "memoryHide") {
      requireFirebaseRole(["admin", "officer"]);
      return hideMemory(payload.memoryId || payload.MemoryID || payload.ID || payload.id);
    }
    if (type === "memoryDelete") {
      requireFirebaseRole(["admin"]);
      return deleteMemory(payload.memoryId || payload.MemoryID || payload.ID || payload.id);
    }
    if (type === "memoryUpdate") {
      requireFirebaseRole(["admin", "officer"]);
      return updateMemory(payload.memoryId || payload.MemoryID || payload.ID || payload.id, payload);
    }
    if (type === "memoryCreate") {
      requireFirebaseRole(["admin", "officer"]);
      return createMemory(payload, sourceUrl);
    }

    if (TYPE_TO_SHEET[type]) {
      requireFirebaseRole(["admin"]);
      return addTypedRow(type, payload, sourceUrl);
    }

    return { success: false, message: `Unknown Firebase request type: ${type}` };
  }

  async function getTodayBoard() {
    const now = new Date();
    const todayDate = formatLongDate(now);
    const day = formatDay(now);
    const schedule = (await getPublishedRows("Schedule"))
      .filter(row => normalize(row.Day) === normalize(day))
      .sort((a, b) => timeToMinutes(a.StartTime) - timeToMinutes(b.StartTime));

    const birthdays = (await getPublishedRows("Birthdays")).map(row => ({
      ...row,
      Birthday: row.Birthday || row.MonthDay || row.Birthdate || row.Date,
      Birthdate: row.Birthday || row.MonthDay || row.Birthdate || row.Date,
      Date: row.Birthday || row.MonthDay || row.Birthdate || row.Date
    }));

    return {
      status: "success",
      date: todayDate,
      day,
      time: now.toLocaleTimeString("en-US", { timeZone: TIMEZONE }),
      settings: await getSettings(),
      schedule,
      currentSubject: getCurrentSubject(schedule, now),
      nextSubject: getNextSubject(schedule, now),
      announcements: await getPublishedRows("Announcements"),
      thingsToBring: await getPublishedRows("ThingsToBring"),
      prayerLeader: (await getTodayRows("PrayerLeaders", todayDate))[0] || null,
      adviserReminders: await getPublishedRows("AdviserReminders"),
      dailyInfo: await getPublishedRows("DailyInfo"),
      dailyQuote: (await getTodayRows("DailyQuotes", todayDate))[0] || null,
      birthdays,
      ticker: await getPublishedRows("TickerMessages")
    };
  }

  async function getWeeklySchedule() {
    return {
      status: "success",
      schedule: await getPublishedRows("Schedule"),
      dailyInfo: await getPublishedRows("DailyInfo")
    };
  }

  async function getSettings() {
    const rows = await getRows("Settings");
    const settings = {};
    rows.forEach(row => {
      if (row.Key) settings[row.Key] = row.Value || "";
    });
    return settings;
  }

  async function getMemories() {
    const rows = await getPublishedRows("Memories");
    const memories = await Promise.all(rows.map(async row => {
      const count = readHeartCount(row);
      const id = row.ID || row.MemoryID || row.memoryId || row.id || row.docId;
      let media = Array.isArray(row.media) ? row.media : parseJsonArray(row.MediaJSON);

      // New reliable fallback: if photos were stored directly in Firestore
      // because Apps Script/Drive upload failed, attach them here before the
      // Memories page renders. This keeps the public viewer unchanged.
      const firestoreMedia = await getFirestoreMemoryMedia(id);
      if (firestoreMedia.length > 0) media = firestoreMedia;

      return {
        ...row,
        ID: id,
        id,
        HeartCount: count,
        heartCount: count,
        Hearts: count,
        hearts: count,
        media,
        music: row.music && typeof row.music === "object" ? row.music : parseJsonObject(row.MusicJSON)
      };
    }));

    return {
      status: "success",
      memories
    };
  }

  async function getFirestoreMemoryMedia(memoryId) {
    const id = String(memoryId || "").trim();
    if (!id) return [];

    try {
      const snap = await db.collection("memoryMedia")
        .where("MemoryID", "==", id)
        .orderBy("Index", "asc")
        .get();

      const items = [];
      snap.forEach(doc => {
        const data = doc.data() || {};
        const item = data.item || data.MediaItem || null;
        if (item && typeof item === "object") items.push(item);
      });
      return items;
    } catch (error) {
      // If the new rule/index is not published yet, do not break Memories.
      console.warn("Unable to load Firestore-stored memory media:", error);
      return [];
    }
  }

  async function getRows(sheetName) {
    const meta = getSheetMeta(sheetName);
    const snap = await db.collection(meta.collection).get();
    const rows = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      rows.push({ ...data, docId: doc.id, id: data.id || doc.id });
    });
    return rows.sort(compareRows);
  }

  async function getPublishedRows(sheetName) {
    return (await getRows(sheetName)).filter(row =>
      isPublished(row) &&
      (sheetName !== "Announcements" || isAnnouncementActiveToday(row))
    );
  }

  async function getTodayRows(sheetName, todayDate) {
    const todayKey = normalizeDate(todayDate);
    return (await getPublishedRows(sheetName)).filter(row => normalizeDate(row.Date || row.Birthday) === todayKey);
  }

  async function getManageList(sheetName) {
    const meta = getSheetMeta(sheetName);
    const rows = await getRows(sheetName);
    return {
      status: "success",
      sheetName,
      headers: meta.headers,
      rows: rows.map((row, index) => ({
        id: row.id,
        docId: row.id,
        rowNumber: index + 2,
        sheetName,
        notedCount: readHeartCount(row),
        heartCount: readHeartCount(row),
        cells: meta.headers.map(header => serializeCell(row[header]))
      }))
    };
  }

  async function addTypedRow(type, payload, sourceUrl) {
    const sheetName = TYPE_TO_SHEET[type] || TYPE_TO_SHEET[payload.kind];
    if (!sheetName) return { success: false, message: "Unknown row type." };

    const meta = getSheetMeta(sheetName);
    const id = generateId(type);
    const preparedPayload = sheetName === "Announcements"
      ? await prepareAnnouncementPayload(payload, id, sourceUrl)
      : payload;
    const row = normalizePayloadForSheet(sheetName, preparedPayload, id);
    await db.collection(meta.collection).doc(id).set(withMeta(cleanFirestoreData(row)));
    return { success: true, message: "Saved successfully.", id };
  }


  async function prepareAnnouncementPayload(payload, id, sourceUrl) {
    const files = Array.isArray(payload.AttachmentFiles)
      ? payload.AttachmentFiles.filter(file => file && file.data)
      : [];

    const prepared = { ...payload };
    delete prepared.AttachmentFiles;

    if (files.length === 0) {
      prepared.AttachmentURLs = normalizeAttachmentText(
        prepared.AttachmentURLs || prepared.Attachments || prepared.AttachmentURL || ""
      );
      prepared.AttachmentNames = normalizeAttachmentText(
        prepared.AttachmentNames || prepared.AttachmentLabels || prepared.AttachmentName || ""
      );
      return prepared;
    }

    if (!sourceUrl) {
      throw new Error("Attachment upload service is not available. Please refresh and try again.");
    }

    const uploadResult = await uploadAnnouncementAttachmentsViaAppsScript(sourceUrl, id, files);
    prepared.AttachmentURLs = uploadResult.urls || "";
    prepared.Attachments = uploadResult.urls || "";
    prepared.AttachmentURL = uploadResult.urls || "";
    prepared.AttachmentNames = uploadResult.names || "";
    prepared.AttachmentLabels = uploadResult.names || "";
    prepared.AttachmentName = uploadResult.names || "";
    return prepared;
  }

  async function uploadAnnouncementAttachmentsViaAppsScript(sourceUrl, id, files) {
    const authToken = await getFirebaseAuthToken();
    const response = await originalFetch(sourceUrl, {
      method: "POST",
      body: JSON.stringify({
        type: "announcementUploadAttachments",
        payload: {
          RecordID: id,
          AttachmentFiles: files,
          AuthToken: authToken
        }
      })
    });

    const text = await response.text();
    let result = {};
    try {
      result = JSON.parse(text || "{}");
    } catch (error) {
      throw new Error(text.slice(0, 180) || "Attachment upload failed.");
    }

    if (!result.success) {
      throw new Error(result.message || "Attachment upload failed.");
    }

    const attachments = result.attachments || result.AttachmentFiles || {};
    return {
      urls: normalizeAttachmentText(result.AttachmentURLs || attachments.urls || result.urls || ""),
      names: normalizeAttachmentText(result.AttachmentNames || attachments.names || result.names || "")
    };
  }

  function normalizeAttachmentText(value) {
    if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean).join("\n");
    return String(value || "").replace(/\r\n/g, "\n").trim();
  }

  function cleanFirestoreData(value) {
    if (value === undefined) return "";
    if (value === null) return null;
    if (Array.isArray(value)) {
      return value
        .map(item => cleanFirestoreData(item))
        .filter(item => item !== undefined);
    }
    if (value && typeof value === "object" && typeof value.toMillis !== "function") {
      const clean = {};
      Object.entries(value).forEach(([key, item]) => {
        if (!key) return;
        const next = cleanFirestoreData(item);
        if (next !== undefined) clean[key] = next;
      });
      return clean;
    }
    return value;
  }

  async function updateRow(payload) {
    const row = await rowByNumber(payload.sheetName, payload.rowNumber);
    const meta = getSheetMeta(payload.sheetName);
    const values = payload.values || [];
    const next = {};

    meta.headers.forEach((header, index) => {
      next[header] = deserializeCell(values[index]);
    });

    await db.collection(meta.collection).doc(row.id).set(withMeta(cleanFirestoreData(next), false), { merge: true });
    return { success: true, message: "Record updated." };
  }

  async function unpublishRow(payload) {
    const row = await rowByNumber(payload.sheetName, payload.rowNumber);
    const meta = getSheetMeta(payload.sheetName);
    await db.collection(meta.collection).doc(row.id).set(withMeta({ Publish: "NO" }, false), { merge: true });
    return { success: true, message: "Record hidden." };
  }

  async function publishRow(payload) {
    const row = await rowByNumber(payload.sheetName, payload.rowNumber);
    const meta = getSheetMeta(payload.sheetName);
    await db.collection(meta.collection).doc(row.id).set(withMeta({ Publish: "YES" }, false), { merge: true });
    return { success: true, message: "Record restored." };
  }

  async function deleteRow(payload) {
    const row = await rowByNumber(payload.sheetName, payload.rowNumber);
    const meta = getSheetMeta(payload.sheetName);
    await db.collection(meta.collection).doc(row.id).delete();
    return { success: true, message: "Record deleted." };
  }

  async function batchRows(payload, action) {
    for (const rowNumber of payload.rowNumbers || []) {
      await action({ sheetName: payload.sheetName, rowNumber });
    }
    return { success: true, message: "Batch action complete." };
  }

  async function rowByNumber(sheetName, rowNumber) {
    const rows = await getRows(sheetName);
    const row = rows[Number(rowNumber) - 2];
    if (!row) throw new Error("Record not found.");
    return row;
  }

  async function recordHeart(sheetName, id, deltaValue, payload = {}) {
    const recordId = String(id || "").trim();
    if (!recordId) return { success: false, message: "Missing record ID." };

    const meta = getSheetMeta(sheetName);
    const ref = await resolveRecordRef(meta.collection, recordId);
    if (!ref) {
      return { success: false, message: "Record not found. Please refresh and try again." };
    }

    const deviceId = normalizeHeartDeviceId(payload.deviceId || payload.DeviceID || payload.device || "anonymous-device");
    const requestedState = parseHeartRequestedState(payload);
    let count = 0;
    let hearted = false;
    let savedHeartUsers = {};

    await db.runTransaction(async transaction => {
      const doc = await transaction.get(ref);
      if (!doc.exists) throw new Error("Record not found.");

      const data = doc.data() || {};
      const heartedDevices = normalizeHeartedDevices(data.HeartUsersV2 || data.heartUsersV2 || data.NotedDevicesV2 || data.notedDevicesV2);
      const currentlyHearted = Boolean(heartedDevices[deviceId]);
      const nextHearted = requestedState === null ? !currentlyHearted : requestedState;

      if (nextHearted) heartedDevices[deviceId] = true;
      else delete heartedDevices[deviceId];

      hearted = Boolean(heartedDevices[deviceId]);
      count = Object.keys(heartedDevices).length;
      savedHeartUsers = { ...heartedDevices };

      const update = withMeta({
        HeartUsersV2: heartedDevices,
        heartUsersV2: heartedDevices,
        HeartCountV2: count,
        heartCountV2: count,
        NotedCountV2: count,
        notedCountV2: count
      }, false);
      transaction.set(ref, update, { merge: true });
    });

    return { success: true, count, hearted, heartUsers: savedHeartUsers };
  }

  async function resolveRecordRef(collectionName, recordId) {
    const directRef = db.collection(collectionName).doc(recordId);
    const directDoc = await directRef.get();
    if (directDoc.exists) return directRef;

    const byUpperId = await db.collection(collectionName).where("ID", "==", recordId).limit(1).get();
    if (!byUpperId.empty) return byUpperId.docs[0].ref;

    const byLowerId = await db.collection(collectionName).where("id", "==", recordId).limit(1).get();
    if (!byLowerId.empty) return byLowerId.docs[0].ref;

    const byMemoryId = await db.collection(collectionName).where("MemoryID", "==", recordId).limit(1).get();
    if (!byMemoryId.empty) return byMemoryId.docs[0].ref;

    const byLowerMemoryId = await db.collection(collectionName).where("memoryId", "==", recordId).limit(1).get();
    if (!byLowerMemoryId.empty) return byLowerMemoryId.docs[0].ref;

    return null;
  }

  function readHeartCount(row) {
    const users = normalizeHeartedDevices(row?.HeartUsersV2 || row?.heartUsersV2 || row?.NotedDevicesV2 || row?.notedDevicesV2);
    const mapCount = Object.keys(users).length;
    if (mapCount > 0) return mapCount;

    const values = [row?.HeartCountV2, row?.heartCountV2, row?.NotedCountV2, row?.notedCountV2]
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= 0);

    return values.length ? Math.max(...values) : 0;
  }

  function normalizeHeartedDevices(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, isHearted]) => key && Boolean(isHearted))
        .map(([key]) => [normalizeHeartDeviceId(key), true])
    );
  }

  function parseHeartRequestedState(payload = {}) {
    const raw = payload.hearted ?? payload.isHearted ?? payload.Noted ?? payload.noted ?? payload.action;
    if (raw === undefined || raw === null || raw === "") return null;
    const text = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "heart", "hearted", "note", "noted", "add"].includes(text)) return true;
    if (["false", "0", "no", "unheart", "unhearted", "remove", "delete"].includes(text)) return false;
    return null;
  }

  function normalizeHeartDeviceId(value) {
    const text = String(value || "").trim();
    return text || "anonymous-device";
  }

  function makeHeartDocId(targetId, deviceId) {
    return `${safeHeartDocPart(targetId)}__${safeHeartDocPart(deviceId)}`.slice(0, 1400);
  }

  function safeHeartDocPart(value) {
    return encodeURIComponent(String(value || ""))
      .replace(/\./g, "%2E")
      .replace(/%/g, "_");
  }

  function checkMemoryAuth(payload) {
    const role = currentFirebaseRole();
    const ok = role === "admin" || role === "officer";
    return {
      success: ok,
      role: ok ? (role === "admin" ? "Admin" : "Officer") : "",
      message: ok ? "Posting unlocked." : "Authentication required."
    };
  }

  async function createMemory(payload, sourceUrl) {
    const id = String(payload.MemoryID || payload.ID || generateId("memory")).trim() || generateId("memory");
    const hasMediaFiles = Array.isArray(payload.MediaFiles) && payload.MediaFiles.length > 0;
    let media = normalizeUploadedMemoryMedia(payload);
    let music = payload.MusicFile ? null : buildMemoryMusic(payload);
    let mediaSource = media.length > 0 ? "drive" : "";
    let mediaCount = media.length;

    if (media.length === 0 || (payload.MusicFile && payload.MusicFile.data)) {
      try {
        const uploaded = await uploadMemoryAssets(payload, id, sourceUrl);
        if (Array.isArray(uploaded.media) && uploaded.media.length > 0) {
          media = uploaded.media;
          mediaSource = "drive";
          mediaCount = media.length;
        }
        if (uploaded.music) music = uploaded.music;
      } catch (error) {
        // Reliable no-Drive fallback for photos. This avoids the repeated
        // "photo upload authorization failed" issue by storing each optimized
        // photo in its own Firestore document. Videos/audio still need links or
        // Apps Script/Drive because they are too large for Firestore documents.
        if (hasMediaFiles && canStoreAllMemoryFilesInFirestore(payload.MediaFiles)) {
          const stored = await storeMemoryMediaFiles(id, payload.MediaFiles);
          media = [];
          mediaSource = "firestoreMedia";
          mediaCount = stored.count;
        } else {
          throw error;
        }
      }
    }

    if (media.length === 0 && mediaSource !== "firestoreMedia" && hasMediaFiles) {
      if (canStoreAllMemoryFilesInFirestore(payload.MediaFiles)) {
        const stored = await storeMemoryMediaFiles(id, payload.MediaFiles);
        media = [];
        mediaSource = "firestoreMedia";
        mediaCount = stored.count;
      }
    }

    const row = {
      ID: id,
      Title: payload.Title || "Untitled Memory",
      Date: normalizeInputDate(payload.Date) || formatLongDate(new Date()),
      Caption: payload.Caption || payload.caption || "",
      PostedBy: payload.PostedBy || payload.Author || payload.author || "SFK",
      Role: payload.Role || payload.role || "",
      media,
      MediaJSON: media.length > 0 ? JSON.stringify(media) : "",
      MediaSource: mediaSource,
      MediaCount: mediaCount,
      music,
      MusicTitle: String(payload.MusicTitle || payload.MusicDisplayTitle || payload.MusicName || "").trim(),
      MusicJSON: music ? JSON.stringify(music) : "",
      VideoURL: payload.VideoURL || "",
      Publish: payload.Publish || "YES",
      HeartCount: 0,
      heartCount: 0,
      Hearts: 0,
      hearts: 0
    };

    const linkedVideo = String(payload.VideoURL || "").trim();
    if (linkedVideo) row.VideoURL = linkedVideo;

    await db.collection(SHEETS.Memories.collection).doc(id).set(withMeta(cleanFirestoreData(row)));
    return { success: true, id, message: "Memory posted." };
  }

  function normalizeUploadedMemoryMedia(payload) {
    if (Array.isArray(payload.UploadedMedia)) {
      return payload.UploadedMedia.filter(isUsableMemoryMediaItem);
    }

    const parsed = parseJsonArray(payload.UploadedMediaJSON || payload.UploadedMediaText || "[]");
    return parsed.filter(isUsableMemoryMediaItem);
  }

  function isUsableMemoryMediaItem(item) {
    return Boolean(item && typeof item === "object" && (
      item.url || item.viewerUrl || item.fullUrl || item.downloadUrl || item.streamUrl
    ));
  }

  function canStoreAllMemoryFilesInFirestore(files) {
    const list = Array.isArray(files) ? files : [];
    if (list.length === 0) return false;

    return list.every(file => {
      const mimeType = String(file && file.mimeType || "").toLowerCase();
      const data = String(file && file.data || "");
      return mimeType.startsWith("image/") && data.length > 0 && data.length <= 900000;
    });
  }

  async function storeMemoryMediaFiles(memoryId, files) {
    const id = String(memoryId || "").trim();
    const list = Array.isArray(files) ? files : [];
    if (!id || list.length === 0) return { count: 0 };

    const batch = db.batch();
    let count = 0;

    list.forEach((file, index) => {
      const mimeType = String(file.mimeType || "image/jpeg").toLowerCase();
      const data = String(file.data || "");
      if (!mimeType.startsWith("image/") || !data) return;
      if (data.length > 900000) {
        throw new Error("One selected photo is still too large after optimization. Please choose a smaller photo.");
      }

      const dataUrl = `data:${mimeType};base64,${data}`;
      const item = {
        kind: "image",
        url: dataUrl,
        viewerUrl: dataUrl,
        fullUrl: dataUrl,
        name: file.name || `SFK memory photo ${index + 1}`,
        mimeType,
        muted: true,
        storedIn: "firestore"
      };

      const docId = `${id}_${String(index).padStart(2, "0")}`;
      batch.set(db.collection("memoryMedia").doc(docId), withMeta(cleanFirestoreData({
        MemoryID: id,
        Index: index,
        item,
        Publish: "YES"
      })));
      count += 1;
    });

    await batch.commit();
    return { count };
  }

  async function uploadMemoryAssets(payload, memoryId, sourceUrl) {
    const hasMediaFiles = Array.isArray(payload.MediaFiles) && payload.MediaFiles.length > 0;
    const hasMusicFile = Boolean(payload.MusicFile && payload.MusicFile.data);
    if (!hasMediaFiles && !hasMusicFile) {
      return { media: [], music: null };
    }

    const authToken = await getFirebaseAuthToken();
    const response = await originalFetch(sourceUrl, {
      method: "POST",
      body: JSON.stringify({
        type: "memoryUploadAssets",
        payload: {
          Role: payload.Role,
          AuthToken: authToken,
          MemoryID: memoryId,
          MediaFiles: payload.MediaFiles || [],
          MusicFile: payload.MusicFile || null
        }
      })
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || "Unable to upload memory media to Drive.");
    }
    return result;
  }

  function currentFirebaseRole() {
    try {
      return window.SFKAuth?.currentRole?.() || "";
    } catch (error) {
      return "";
    }
  }

  function requireFirebaseRole(allowedRoles) {
    const role = currentFirebaseRole();
    if (!allowedRoles.includes(role)) {
      throw new Error("You are not authorized to perform this action.");
    }
    return role;
  }

  async function getFirebaseAuthToken() {
    const token = await window.SFKAuth?.getIdToken?.();
    if (!token) throw new Error("Your login session expired. Please sign in again.");
    return token;
  }

  async function hideMemory(id) {
    if (!id) return { success: false, message: "Missing memory ID." };
    await db.collection(SHEETS.Memories.collection).doc(String(id)).set(withMeta({ Publish: "NO" }, false), { merge: true });
    return { success: true, message: "Memory hidden." };
  }

  async function deleteMemory(id) {
    if (!id) return { success: false, message: "Missing memory ID." };
    const cleanId = String(id);
    const mediaSnap = await db.collection("memoryMedia").where("MemoryID", "==", cleanId).get();
    if (!mediaSnap.empty) {
      const batch = db.batch();
      mediaSnap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.collection(SHEETS.Memories.collection).doc(cleanId).delete();
    return { success: true, message: "Memory deleted." };
  }

  async function updateMemory(id, payload) {
    if (!id) return { success: false, message: "Missing memory ID." };

    const next = {
      Title: payload.Title || "Untitled Memory",
      Date: normalizeInputDate(payload.Date) || formatLongDate(new Date()),
      Caption: payload.Caption || "",
      PostedBy: payload.PostedBy || "SFK",
      VideoURL: payload.VideoURL || "",
      MusicTitle: String(payload.MusicTitle || payload.MusicDisplayTitle || payload.MusicName || "").trim()
    };

    const cleanMusicTitle = next.MusicTitle;
    const current = await db.collection(SHEETS.Memories.collection).doc(String(id)).get();
    const currentMusic = current.exists ? current.data()?.music : null;
    if (currentMusic && typeof currentMusic === "object") {
      const fallbackName = deriveMusicNameFromUrl(
        currentMusic.previewUrl || currentMusic.fullUrl || currentMusic.url || currentMusic.downloadUrl || currentMusic.fallbackUrl
      ) || "Background music";
      next.music = { ...currentMusic, name: cleanMusicTitle || fallbackName, customTitle: cleanMusicTitle };
      next.MusicJSON = JSON.stringify(next.music);
    }

    await db.collection(SHEETS.Memories.collection).doc(String(id)).set(withMeta(next, false), { merge: true });
    return { success: true, message: "Memory updated." };
  }

  function getMemoryAudio(fileId) {
    return {
      success: false,
      message: fileId
        ? "This Firebase version will play public/direct audio links directly. If this is a Google Drive audio file, make sure it is shared publicly."
        : "Missing audio file ID."
    };
  }

  function buildMemoryMedia(files) {
    return (files || [])
      .filter(file => file && file.data)
      .map(file => {
        const mimeType = String(file.mimeType || "application/octet-stream");
        const isVideo = mimeType.startsWith("video/");
        const dataUrl = `data:${mimeType};base64,${file.data}`;

        return {
          kind: isVideo ? "direct-video" : "image",
          url: dataUrl,
          viewerUrl: dataUrl,
          fullUrl: dataUrl,
          name: file.name || "SFK memory",
          mimeType,
          muted: true
        };
      });
  }

  function buildMemoryMusic(payload) {
    const musicTitle = String(payload.MusicTitle || payload.MusicDisplayTitle || payload.MusicName || "").trim();

    if (payload.MusicFile && payload.MusicFile.data) {
      const mimeType = String(payload.MusicFile.mimeType || "audio/mpeg");
      return {
        kind: "direct-audio",
        name: musicTitle || payload.MusicFile.name || "Background music",
        customTitle: musicTitle,
        url: `data:${mimeType};base64,${payload.MusicFile.data}`,
        mimeType,
        muted: true,
        started: false
      };
    }

    const url = String(payload.MusicURL || "").trim();
    if (!url) return null;

    const youtubeId = getYouTubeId(url);
    if (youtubeId) {
      return {
        kind: "youtube-audio",
        videoId: youtubeId,
        name: musicTitle || "YouTube music",
        customTitle: musicTitle,
        url: `https://www.youtube.com/watch?v=${youtubeId}`,
        muted: true,
        started: false
      };
    }

    const driveId = getDriveFileId(url);
    if (driveId) {
      return {
        kind: "drive-audio",
        name: musicTitle || "Google Drive music",
        customTitle: musicTitle,
        fileId: driveId,
        url: getDriveAudioStreamUrl(driveId),
        fallbackUrl: getDriveStreamUrl(driveId),
        previewUrl: url,
        muted: true,
        started: false
      };
    }

    return {
      kind: "direct-audio",
      name: musicTitle || deriveMusicNameFromUrl(url) || "Background music",
      customTitle: musicTitle,
      url,
      muted: true,
      started: false
    };
  }

  function deriveMusicNameFromUrl(value) {
    try {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const parsed = new URL(raw, window.location.href);
      const last = decodeURIComponent((parsed.pathname.split("/").filter(Boolean).pop() || "").replace(/[_-]+/g, " "));
      const cleaned = last.replace(/\.(mp3|m4a|aac|ogg|wav|webm)$/i, "").trim();
      return cleaned ? cleaned.replace(/\s+/g, " ") : "";
    } catch (error) {
      return "";
    }
  }

  function getYouTubeId(value) {
    const match = String(value || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})/i);
    return match ? match[1] : "";
  }

  function getDriveFileId(url) {
    const text = String(url || "");
    const pathMatch = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (pathMatch) return decodeURIComponent(pathMatch[1]);
    const queryMatch = text.match(/[?&]id=([^&]+)/i);
    return queryMatch ? decodeURIComponent(queryMatch[1]) : "";
  }

  function getDriveStreamUrl(fileId) {
    return fileId
      ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`
      : "";
  }

  function getDriveAudioStreamUrl(fileId) {
    return fileId
      ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
      : "";
  }

  function normalizePayloadForSheet(sheetName, payload, id) {
    if (sheetName === "Announcements") {
      return {
        ID: id,
        Date: normalizeInputDate(payload.Date),
        Subject: payload.Subject || "",
        Announcement: payload.Announcement || "",
        Teacher: payload.Teacher || "",
        Deadline: normalizeInputDate(payload.Deadline),
        PublishDate: normalizeInputDate(payload.PublishDate),
        ExpiryDate: normalizeInputDate(payload.ExpiryDate),
        ShowDeadline: payload.ShowDeadline || "",
        AttachmentURLs: payload.AttachmentURLs || payload.Attachments || payload.AttachmentURL || "",
        Attachments: payload.AttachmentURLs || payload.Attachments || payload.AttachmentURL || "",
        AttachmentURL: payload.AttachmentURLs || payload.Attachments || payload.AttachmentURL || "",
        AttachmentNames: payload.AttachmentNames || payload.AttachmentLabels || payload.AttachmentName || "",
        AttachmentLabels: payload.AttachmentNames || payload.AttachmentLabels || payload.AttachmentName || "",
        AttachmentName: payload.AttachmentNames || payload.AttachmentLabels || payload.AttachmentName || "",
        Priority: payload.Priority || "Normal",
        Publish: payload.Publish || "YES",
        HeartCount: Number(payload.HeartCount || 0) || 0
      };
    }

    if (sheetName === "Schedule") return {
      Day: payload.Day || "",
      StartTime: normalizeScheduleTime(payload.StartTime),
      EndTime: normalizeScheduleTime(payload.EndTime),
      Subject: payload.Subject || "",
      Teacher: payload.Teacher || "",
      Room: payload.Room || "",
      Color: normalizeScheduleColor(payload.Color || payload.ColorHex || payload.SubjectColor || ""),
      Type: inferScheduleType(payload.Subject),
      Publish: payload.Publish || "YES"
    };

    if (sheetName === "ThingsToBring") return { Date: normalizeInputDate(payload.Date), Subject: payload.Subject || "", Item: payload.Item || "", Publish: payload.Publish || "YES" };
    if (sheetName === "AdviserReminders") return { Date: normalizeInputDate(payload.Date), Reminder: payload.Reminder || "", Publish: payload.Publish || "YES" };
    if (sheetName === "PrayerLeaders") return { Date: normalizeInputDate(payload.Date), PrayerLeader: payload.PrayerLeader || "", Publish: payload.Publish || "YES" };
    if (sheetName === "DailyQuotes") return { Date: normalizeInputDate(payload.Date), Quote: payload.Quote || "", Author: payload.Author || "SFK ClassBoard", Publish: payload.Publish || "YES" };
    if (sheetName === "Birthdays") return { Name: payload.Name || "", Birthday: normalizeBirthday(payload.Birthday), Publish: payload.Publish || "YES" };
    if (sheetName === "TickerMessages") return { Message: payload.Message || "", Priority: payload.Priority || "Normal", Publish: payload.Publish || "YES" };
    if (sheetName === "DailyInfo") return { Day: payload.Day || "", EntryGate: payload.EntryGate || "", ExitGate: payload.ExitGate || "", Uniform: payload.Uniform || "", Publish: payload.Publish || "YES" };

    return payload;
  }

  function inferScheduleType(subject) {
    const text = String(subject || "").trim().toLowerCase();
    if (!text) return "Class";
    if (text.includes("assembly")) return "Assembly";
    if (text.includes("break")) return "Break";
    if (text.includes("lunch")) return "Lunch";
    if (text.includes("mass")) return "Mass";
    if (text.includes("homeroom")) return "Homeroom";
    if (text.includes("no class")) return "No Classes";
    if (text.includes("activity") || text.includes("performance task") || text.includes("peta")) return "Activity";
    return "Class";
  }

  function normalizeScheduleColor(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    const hex = text.match(/^#?([0-9a-fA-F]{6})$/);
    if (hex) return `#${hex[1].toUpperCase()}`;

    return text.replace(/\s+/g, " ");
  }

  function normalizeScheduleTime(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    const twentyFourHour = text.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFourHour) {
      let hour = Number(twentyFourHour[1]);
      const minute = twentyFourHour[2];
      const meridiem = hour >= 12 ? "PM" : "AM";
      if (hour === 0) hour = 12;
      else if (hour > 12) hour -= 12;
      return `${hour}:${minute} ${meridiem}`;
    }

    return text.replace(/\s+/g, " ").toUpperCase();
  }

  function withMeta(row, includeCreated = true) {
    const meta = { ...row, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (includeCreated) meta.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    return meta;
  }

  function getSheetMeta(sheetName) {
    const meta = SHEETS[sheetName];
    if (!meta) throw new Error(`Unknown sheet: ${sheetName}`);
    return meta;
  }

  function compareRows(a, b) {
    const ao = Number(a.Order || a.Sort || 0);
    const bo = Number(b.Order || b.Sort || 0);
    if (ao || bo) return ao - bo;
    const ad = toMillis(a.createdAt) || 0;
    const bd = toMillis(b.createdAt) || 0;
    return bd - ad;
  }

  function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  function isPublished(row) {
    return String(row.Publish || row.Published || "YES").trim().toUpperCase() !== "NO";
  }

  function isAnnouncementActiveToday(row) {
    const todayKey = getManilaDateKey(new Date());
    const publishKey = getDateKey(row.PublishDate || row.ScheduledPublishDate || row.StartDate);
    const expiryKey = getDateKey(row.ExpiryDate || row.ExpirationDate || row.EndDate);
    return (!publishKey || todayKey >= publishKey) && (!expiryKey || todayKey < expiryKey);
  }

  function getManilaDateKey(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const year = parts.find(part => part.type === "year")?.value || "";
    const month = parts.find(part => part.type === "month")?.value || "";
    const day = parts.find(part => part.type === "day")?.value || "";
    return `${year}-${month}-${day}`;
  }

  function getDateKey(value) {
    if (!value) return "";
    if (typeof value.toDate === "function") return getManilaDateKey(value.toDate());
    const text = String(value).trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? getManilaDateKey(date) : "";
  }

  function getCurrentSubject(schedule, now) {
    const nowMinutes = getManilaMinutes(now);
    return schedule.find(item => nowMinutes >= timeToMinutes(item.StartTime) && nowMinutes < timeToMinutes(item.EndTime)) || null;
  }

  function getNextSubject(schedule, now) {
    const nowMinutes = getManilaMinutes(now);
    return schedule.find(item => timeToMinutes(item.StartTime) > nowMinutes) || null;
  }

  function getManilaMinutes(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const hour = Number(parts.find(part => part.type === "hour").value);
    const minute = Number(parts.find(part => part.type === "minute").value);
    return hour * 60 + minute;
  }

  function timeToMinutes(value) {
    if (!value) return 99999;
    const text = String(value).trim();
    const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return 99999;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = (match[3] || "").toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  function formatLongDate(date) {
    return date.toLocaleDateString("en-US", { timeZone: TIMEZONE, month: "long", day: "numeric", year: "numeric" });
  }

  function formatDay(date) {
    return date.toLocaleDateString("en-US", { timeZone: TIMEZONE, weekday: "long" });
  }

  function normalizeInputDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return formatLongDate(date);
    return String(value);
  }

  function normalizeBirthday(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleDateString("en-US", { timeZone: TIMEZONE, month: "long", day: "numeric" });
    }
    return String(value);
  }

  function normalizeDate(value) {
    return String(value || "").trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function generateId(prefix) {
    return `${prefix || "row"}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function serializeCell(value) {
    if (Array.isArray(value) || (value && typeof value === "object" && typeof value.toMillis !== "function")) {
      return JSON.stringify(value);
    }
    return value == null ? "" : String(value);
  }

  function parseJsonArray(value) {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function parseJsonObject(value) {
    try {
      const parsed = JSON.parse(value || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function deserializeCell(value) {
    const text = String(value || "").trim();
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
      try { return JSON.parse(text); } catch (error) { return value; }
    }
    return value;
  }

  function jsonResponse(data, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    }));
  }

  window.SFKClassBoardFirebaseAdapter = {
    SHEETS,
    getRows,
    getPublishedRows,
    getTodayBoard,
    getWeeklySchedule
  };

  initialize();
}());
