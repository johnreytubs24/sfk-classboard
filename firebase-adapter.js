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
      headers: ["Day", "StartTime", "EndTime", "Subject", "Teacher", "Room", "Type", "Publish"]
    },
    Announcements: {
      collection: "announcements",
      headers: ["ID", "Date", "Subject", "Announcement", "Teacher", "Deadline", "ShowDeadline", "AttachmentURLs", "AttachmentNames", "Priority", "Publish", "HeartCount"]
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
      if (parsed.searchParams.get("type") === "memoryAudio") {
        return originalFetch(input, options);
      }

      if (options && String(options.method || "GET").toUpperCase() === "POST") {
        const body = JSON.parse(options.body || "{}");
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
    if (type === "adminList") return getManageList(params.get("sheet"));
    if (type === "officerList") return getManageList(params.get("sheet"));
    if (type === "memories") return getMemories();
    if (type === "memoryAudio") return getMemoryAudio(params.get("fileId"));

    return { status: "error", message: "Invalid Firebase endpoint." };
  }

  async function handlePost(body, sourceUrl) {
    const type = body.type;
    const payload = body.payload || {};

    if (type === "adminUpdate") return updateRow(payload);
    if (type === "adminUnpublish" || type === "officerHide") return unpublishRow(payload);
    if (type === "adminRestore" || type === "officerRestore") return publishRow(payload);
    if (type === "adminDelete") return deleteRow(payload);
    if (type === "adminBatchUnpublish" || type === "officerBatchHide") return batchRows(payload, unpublishRow);
    if (type === "adminBatchDelete") return batchRows(payload, deleteRow);
    if (type === "officerAdd") return addTypedRow(payload.kind, payload, sourceUrl);
    if (type === "announcementHeart") return recordHeart("Announcements", payload.announcementId || payload.AnnouncementID || payload.ID || payload.id, payload.delta, payload);
    if (type === "memoryHeart") return recordHeart("Memories", payload.memoryId || payload.MemoryID || payload.ID || payload.id, payload.delta, payload);
    if (type === "memoryAuth") return checkMemoryAuth(payload);
    if (type === "memoryHide") return hideMemory(payload.memoryId || payload.MemoryID || payload.ID || payload.id);
    if (type === "memoryDelete") return deleteMemory(payload.memoryId || payload.MemoryID || payload.ID || payload.id);
    if (type === "memoryUpdate") return updateMemory(payload.memoryId || payload.MemoryID || payload.ID || payload.id, payload);
    if (type === "memoryCreate") return createMemory(payload, sourceUrl);

    if (TYPE_TO_SHEET[type]) return addTypedRow(type, payload, sourceUrl);

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
    const memories = (await getPublishedRows("Memories")).map(row => {
      const count = readHeartCount(row);
      return {
        ...row,
        ID: row.ID || row.MemoryID || row.memoryId || row.id || row.docId,
        id: row.ID || row.MemoryID || row.memoryId || row.id || row.docId,
        HeartCount: count,
        heartCount: count,
        Hearts: count,
        hearts: count,
        media: Array.isArray(row.media) ? row.media : parseJsonArray(row.MediaJSON),
        music: row.music && typeof row.music === "object" ? row.music : parseJsonObject(row.MusicJSON)
      };
    });

    return {
      status: "success",
      memories
    };
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
    return (await getRows(sheetName)).filter(row => isPublished(row));
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
    const response = await originalFetch(sourceUrl, {
      method: "POST",
      body: JSON.stringify({
        type: "announcementUploadAttachments",
        payload: {
          RecordID: id,
          AttachmentFiles: files
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

    await db.runTransaction(async transaction => {
      const doc = await transaction.get(ref);
      if (!doc.exists) throw new Error("Record not found.");

      const data = doc.data() || {};
      const currentCount = readHeartCount(data);
      const heartedDevices = normalizeHeartedDevices(data.HeartedDevices || data.heartedDevices);
      const currentlyHearted = Boolean(heartedDevices[deviceId]);
      const nextHearted = requestedState === null ? !currentlyHearted : requestedState;

      count = currentCount;
      if (nextHearted && !currentlyHearted) {
        heartedDevices[deviceId] = true;
        hearted = true;
        count = currentCount + 1;
      } else if (!nextHearted && currentlyHearted) {
        delete heartedDevices[deviceId];
        hearted = false;
        count = Math.max(0, currentCount - 1);
      } else {
        hearted = currentlyHearted;
        count = currentCount;
      }

      const update = withMeta({
        HeartCount: count,
        heartCount: count,
        Hearts: count,
        hearts: count,
        NotedCount: count,
        notedCount: count,
        HeartedDevices: heartedDevices,
        heartedDevices
      }, false);
      transaction.set(ref, update, { merge: true });
    });

    return { success: true, count, hearted };
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
    const values = [
      row?.HeartCount,
      row?.heartCount,
      row?.Hearts,
      row?.hearts,
      row?.Count,
      row?.count,
      row?.notedCount,
      row?.NotedCount,
      row?.AcknowledgeCount,
      row?.acknowledgeCount
    ]
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
    const role = normalize(payload.Role || payload.role);
    const pin = String(payload.Pin || payload.pin || "");
    const ok = (role === "admin" && pin === "0524") || (role === "officer" && pin === "sfk2627");
    return {
      success: ok,
      role: ok ? (role === "admin" ? "Admin" : "Officer") : "",
      message: ok ? "Posting unlocked." : "Incorrect PIN."
    };
  }

  async function createMemory(payload, sourceUrl) {
    const id = generateId("memory");
    const uploaded = await uploadMemoryAssets(payload, id, sourceUrl);
    const media = uploaded.media || [];
    const music = uploaded.music || (payload.MusicFile ? null : buildMemoryMusic(payload));

    const row = {
      ID: id,
      Title: payload.Title || "Untitled Memory",
      Date: normalizeInputDate(payload.Date) || formatLongDate(new Date()),
      Caption: payload.Caption || payload.caption || "",
      PostedBy: payload.PostedBy || payload.Author || payload.author || "SFK",
      Role: payload.Role || payload.role || "",
      media,
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

    await db.collection(SHEETS.Memories.collection).doc(id).set(withMeta(row));
    return { success: true, id, message: "Memory posted." };
  }

  async function uploadMemoryAssets(payload, memoryId, sourceUrl) {
    const hasMediaFiles = Array.isArray(payload.MediaFiles) && payload.MediaFiles.length > 0;
    const hasMusicFile = Boolean(payload.MusicFile && payload.MusicFile.data);
    if (!hasMediaFiles && !hasMusicFile) {
      return { media: [], music: null };
    }

    const response = await originalFetch(sourceUrl, {
      method: "POST",
      body: JSON.stringify({
        type: "memoryUploadAssets",
        payload: {
          Role: payload.Role,
          Pin: payload.Pin,
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

  async function hideMemory(id) {
    if (!id) return { success: false, message: "Missing memory ID." };
    await db.collection(SHEETS.Memories.collection).doc(String(id)).set(withMeta({ Publish: "NO" }, false), { merge: true });
    return { success: true, message: "Memory hidden." };
  }

  async function deleteMemory(id) {
    if (!id) return { success: false, message: "Missing memory ID." };
    await db.collection(SHEETS.Memories.collection).doc(String(id)).delete();
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

    if (sheetName === "ThingsToBring") return { Date: normalizeInputDate(payload.Date), Subject: payload.Subject || "", Item: payload.Item || "", Publish: payload.Publish || "YES" };
    if (sheetName === "AdviserReminders") return { Date: normalizeInputDate(payload.Date), Reminder: payload.Reminder || "", Publish: payload.Publish || "YES" };
    if (sheetName === "PrayerLeaders") return { Date: normalizeInputDate(payload.Date), PrayerLeader: payload.PrayerLeader || "", Publish: payload.Publish || "YES" };
    if (sheetName === "DailyQuotes") return { Date: normalizeInputDate(payload.Date), Quote: payload.Quote || "", Author: payload.Author || "SFK ClassBoard", Publish: payload.Publish || "YES" };
    if (sheetName === "Birthdays") return { Name: payload.Name || "", Birthday: normalizeBirthday(payload.Birthday), Publish: payload.Publish || "YES" };
    if (sheetName === "TickerMessages") return { Message: payload.Message || "", Priority: payload.Priority || "Normal", Publish: payload.Publish || "YES" };
    if (sheetName === "DailyInfo") return { Day: payload.Day || "", EntryGate: payload.EntryGate || "", ExitGate: payload.ExitGate || "", Uniform: payload.Uniform || "", Publish: payload.Publish || "YES" };

    return payload;
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
