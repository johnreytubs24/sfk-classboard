(function () {
  "use strict";

  const DEFAULT_UNLOCK_AT = new Date(2027, 3, 3, 12, 0, 0);
  const DEFAULT_DEADLINE = new Date(2027, 2, 31, 23, 59, 0);
  const ENTRY_TYPES = {
    memory: "Favorite Memory",
    message: "Message",
    goal: "Goal",
    prediction: "Prediction",
    photo: "Photo Memory"
  };

  const state = {
    context: null,
    settings: null,
    entries: [],
    settingsUnsubscribe: null,
    entriesUnsubscribe: null,
    publicUnsubscribe: null,
    countdownTimer: null,
    presentationTimer: null,
    presentationEntries: [],
    slideIndex: 0,
    settingsCreating: false,
    initialized: false
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    cacheElements();
    if (!elements.room) return;

    elements.back.addEventListener("click", close);
    elements.adminToggle.addEventListener("click", toggleAdminPanel);
    elements.composeToggle.addEventListener("click", toggleCompose);
    elements.form.addEventListener("submit", submitEntry);
    elements.cancelEdit.addEventListener("click", resetForm);
    elements.entries.addEventListener("click", handleEntryAction);
    elements.reviewList.addEventListener("click", handleEntryAction);
    elements.settingsForm.addEventListener("submit", saveSettings);
    elements.unlockNow.addEventListener("click", unlockNow);
    elements.reviewFilter.addEventListener("change", renderReviewEntries);
    elements.present.addEventListener("click", openPresentation);
    elements.presentationClose.addEventListener("click", closePresentation);
    elements.previous.addEventListener("click", () => showSlide(state.slideIndex - 1));
    elements.next.addEventListener("click", () => showSlide(state.slideIndex + 1));
    elements.play.addEventListener("click", togglePresentationPlayback);
    elements.print.addEventListener("click", printCapsule);
  }

  function cacheElements() {
    elements.room = document.getElementById("timeCapsuleRoom");
    elements.back = document.getElementById("timeCapsuleBack");
    elements.headerStatus = document.getElementById("timeCapsuleHeaderStatus");
    elements.adminToggle = document.getElementById("timeCapsuleAdminToggle");
    elements.eyebrow = document.getElementById("timeCapsuleEyebrow");
    elements.heroTitle = document.getElementById("timeCapsuleHeroTitle");
    elements.countdown = document.getElementById("timeCapsuleCountdown");
    elements.present = document.getElementById("timeCapsulePresent");
    elements.lockMark = document.getElementById("timeCapsuleLockMark");
    elements.entryCount = document.getElementById("timeCapsuleEntryCount");
    elements.classCount = document.getElementById("timeCapsuleClassCount");
    elements.contributorCount = document.getElementById("timeCapsuleContributorCount");
    elements.composeCard = document.getElementById("timeCapsuleComposeCard");
    elements.composeToggle = document.getElementById("timeCapsuleComposeToggle");
    elements.form = document.getElementById("timeCapsuleForm");
    elements.editId = document.getElementById("timeCapsuleEditId");
    elements.type = document.getElementById("timeCapsuleType");
    elements.text = document.getElementById("timeCapsuleText");
    elements.imageUrl = document.getElementById("timeCapsuleImageUrl");
    elements.cancelEdit = document.getElementById("timeCapsuleCancelEdit");
    elements.submit = document.getElementById("timeCapsuleSubmit");
    elements.formMessage = document.getElementById("timeCapsuleFormMessage");
    elements.entriesTitle = document.getElementById("timeCapsuleEntriesTitle");
    elements.entriesHint = document.getElementById("timeCapsuleEntriesHint");
    elements.entries = document.getElementById("timeCapsuleEntries");
    elements.adminPanel = document.getElementById("timeCapsuleAdminPanel");
    elements.settingsForm = document.getElementById("timeCapsuleSettingsForm");
    elements.deadline = document.getElementById("timeCapsuleDeadline");
    elements.unlockAt = document.getElementById("timeCapsuleUnlockAt");
    elements.allowSubmissions = document.getElementById("timeCapsuleAllowSubmissions");
    elements.unlockNow = document.getElementById("timeCapsuleUnlockNow");
    elements.settingsMessage = document.getElementById("timeCapsuleSettingsMessage");
    elements.reviewFilter = document.getElementById("timeCapsuleReviewFilter");
    elements.reviewList = document.getElementById("timeCapsuleReviewList");
    elements.presentation = document.getElementById("timeCapsulePresentation");
    elements.presentationClose = document.getElementById("timeCapsulePresentationClose");
    elements.slideCount = document.getElementById("timeCapsuleSlideCount");
    elements.slide = document.getElementById("timeCapsuleSlide");
    elements.previous = document.getElementById("timeCapsulePrevious");
    elements.play = document.getElementById("timeCapsulePlay");
    elements.next = document.getElementById("timeCapsuleNext");
    elements.print = document.getElementById("timeCapsulePrint");
  }

  function open(context) {
    initialize();
    if (!elements.room || !context?.profile || !context?.db) return;
    destroyListeners();
    state.context = context;
    state.settings = null;
    state.entries = [];
    state.slideIndex = 0;
    elements.room.hidden = false;
    elements.adminPanel.hidden = true;
    elements.adminToggle.hidden = context.profile.role !== "admin";
    elements.adminToggle.textContent = "Manage";
    elements.headerStatus.textContent = `${context.profile.name} · Capsule contributor`;
    context.panel?.classList.add("is-time-capsule-open");
    resetForm();
    startSettingsListener();
    startCountdown();
  }

  function close() {
    closePresentation();
    destroyListeners();
    elements.room.hidden = true;
    state.context?.panel?.classList.remove("is-time-capsule-open");
    const callback = state.context?.onClose;
    state.context = null;
    if (typeof callback === "function") callback();
  }

  function destroy() {
    closePresentation();
    destroyListeners();
    if (elements.room) elements.room.hidden = true;
    state.context?.panel?.classList.remove("is-time-capsule-open");
    state.context = null;
  }

  function destroyListeners() {
    state.settingsUnsubscribe?.();
    state.entriesUnsubscribe?.();
    state.publicUnsubscribe?.();
    state.settingsUnsubscribe = null;
    state.entriesUnsubscribe = null;
    state.publicUnsubscribe = null;
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }

  function startSettingsListener() {
    const settingsRef = state.context.db.collection("timeCapsuleSettings").doc("main");
    state.settingsUnsubscribe = settingsRef.onSnapshot(async (snapshot) => {
      if (snapshot.exists) {
        state.settings = snapshot.data() || {};
      } else if (isAdmin() && !state.settingsCreating) {
        state.settingsCreating = true;
        await settingsRef.set(defaultSettings()).catch((error) => {
          elements.settingsMessage.textContent = readableError(error);
        });
        state.settingsCreating = false;
        return;
      } else {
        state.settings = null;
      }
      renderSettings();
      startEntriesListeners();
      renderAll();
    }, (error) => {
      elements.headerStatus.textContent = readableError(error);
    });
  }

  function defaultSettings() {
    return {
      Title: "SFK Time Capsule",
      UnlockAt: firebase.firestore.Timestamp.fromDate(DEFAULT_UNLOCK_AT),
      SubmissionDeadline: firebase.firestore.Timestamp.fromDate(DEFAULT_DEADLINE),
      AllowSubmissions: true,
      UpdatedBy: state.context.profile.uid,
      UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  function startEntriesListeners() {
    state.entriesUnsubscribe?.();
    state.publicUnsubscribe?.();
    state.entriesUnsubscribe = null;
    state.publicUnsubscribe = null;
    state.entries = [];

    if (isAdmin()) {
      state.entriesUnsubscribe = state.context.db.collection("timeCapsuleEntries")
        .onSnapshot((snapshot) => {
          state.entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          renderAll();
        }, showEntriesError);
      return;
    }

    state.entriesUnsubscribe = state.context.db.collection("timeCapsuleEntries")
      .where("AuthorUID", "==", state.context.profile.uid)
      .onSnapshot((snapshot) => {
        mergeEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), true);
      }, showEntriesError);

    if (isUnlocked()) {
      state.publicUnsubscribe = state.context.db.collection("timeCapsuleEntries")
        .where("Status", "==", "approved")
        .onSnapshot((snapshot) => {
          mergeEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), false);
        }, showEntriesError);
    }
  }

  function mergeEntries(incoming, replaceOwn) {
    const ownUid = state.context.profile.uid;
    const retained = state.entries.filter((entry) => (
      replaceOwn ? entry.AuthorUID !== ownUid : entry.Status !== "approved"
    ));
    const merged = new Map(retained.concat(incoming).map((entry) => [entry.id, entry]));
    state.entries = Array.from(merged.values());
    renderAll();
  }

  function showEntriesError(error) {
    elements.entries.innerHTML = `<p class="timeCapsuleEmpty">${escapeHtml(readableError(error))}</p>`;
  }

  function renderAll() {
    if (!state.context) return;
    renderHero();
    renderStats();
    renderComposeState();
    renderMainEntries();
    if (isAdmin()) renderReviewEntries();
  }

  function renderHero() {
    const unlocked = isUnlocked();
    const deadline = settingsDate("SubmissionDeadline", DEFAULT_DEADLINE);
    elements.present.hidden = !unlocked && !isAdmin();
    elements.present.textContent = unlocked ? "View Capsule" : "Preview";
    elements.lockMark.classList.toggle("is-unlocked", unlocked);
    elements.eyebrow.textContent = unlocked ? "CAPSULE UNLOCKED" : "SEALED FOR NOW";
    elements.heroTitle.textContent = unlocked
      ? "Our SFK memories are ready."
      : "Our memories are growing.";
    if (!state.settings) {
      elements.countdown.textContent = isAdmin()
        ? "Creating capsule settings..."
        : "The Adviser is still preparing the capsule.";
    } else if (unlocked) {
      elements.countdown.textContent = `Unlocked ${formatDate(settingsDate("UnlockAt", DEFAULT_UNLOCK_AT), true)}`;
    } else if (Date.now() > deadline.getTime()) {
      elements.countdown.textContent = "Submissions are closed. Waiting for unlock day.";
    }
  }

  function renderStats() {
    const own = state.entries.filter((entry) => entry.AuthorUID === state.context.profile.uid);
    const visibleClassEntries = isAdmin() || isUnlocked()
      ? state.entries.filter((entry) => isAdmin() || entry.Status === "approved")
      : null;
    const contributors = visibleClassEntries
      ? new Set(visibleClassEntries.map((entry) => entry.AuthorUID).filter(Boolean)).size
      : null;
    elements.entryCount.textContent = String(own.length);
    elements.classCount.textContent = visibleClassEntries ? String(visibleClassEntries.length) : "--";
    elements.contributorCount.textContent = contributors == null ? "--" : String(contributors);
  }

  function renderComposeState() {
    const available = isSubmissionOpen();
    elements.composeCard.hidden = !available;
    if (!available && !elements.form.hidden) resetForm();
  }

  function renderMainEntries() {
    const unlocked = isUnlocked();
    let entries;
    if (unlocked) {
      entries = state.entries.filter((entry) => entry.Status === "approved");
      elements.entriesTitle.textContent = "Unlocked Entries";
      elements.entriesHint.textContent = "Approved memories from the SFK class.";
    } else {
      entries = state.entries.filter((entry) => entry.AuthorUID === state.context.profile.uid);
      elements.entriesTitle.textContent = "My Sealed Entries";
      elements.entriesHint.textContent = "Only you and the Adviser can view these before unlock day.";
    }
    entries.sort(sortEntriesNewest);
    elements.entries.innerHTML = entries.length
      ? entries.map((entry) => entryCard(entry, false)).join("")
      : `<p class="timeCapsuleEmpty">${unlocked ? "No approved entries yet." : "You have not sealed an entry yet."}</p>`;
  }

  function renderReviewEntries() {
    if (!isAdmin()) return;
    const filter = elements.reviewFilter.value;
    const entries = state.entries
      .filter((entry) => filter === "all" || entry.Status === filter)
      .sort(sortEntriesNewest);
    elements.reviewList.innerHTML = entries.length
      ? entries.map((entry) => entryCard(entry, true)).join("")
      : `<p class="timeCapsuleEmpty">No ${escapeHtml(filter)} entries.</p>`;
  }

  function entryCard(entry, forReview) {
    const imageUrl = safeImageUrl(entry.ImageURL);
    const ownPending = entry.AuthorUID === state.context.profile.uid
      && entry.Status === "pending"
      && isSubmissionOpen();
    const actions = forReview
      ? `<div class="timeCapsuleEntryActions">
          <button type="button" data-capsule-action="edit" data-entry-id="${entry.id}">Edit</button>
          ${entry.Status !== "approved" ? `<button type="button" data-capsule-action="approve" data-entry-id="${entry.id}">Approve</button>` : ""}
          ${entry.Status !== "rejected" ? `<button type="button" data-capsule-action="reject" data-entry-id="${entry.id}">Reject</button>` : ""}
          <button type="button" data-capsule-action="delete" data-entry-id="${entry.id}">Delete</button>
        </div>`
      : ownPending
        ? `<div class="timeCapsuleEntryActions">
            <button type="button" data-capsule-action="edit" data-entry-id="${entry.id}">Edit</button>
            <button type="button" data-capsule-action="delete" data-entry-id="${entry.id}">Delete</button>
          </div>`
        : "";
    return `<article class="timeCapsuleEntry" data-status="${escapeHtml(entry.Status || "pending")}">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="Time capsule photo by ${escapeHtml(entry.AuthorName || "SFK")}" loading="lazy" referrerpolicy="no-referrer" />` : ""}
      <div class="timeCapsuleEntryBody">
        <div class="timeCapsuleEntryMeta">
          <span>${escapeHtml(ENTRY_TYPES[entry.Type] || "Memory")}</span>
          <b>${escapeHtml(entry.Status || "pending")}</b>
        </div>
        ${entry.Text ? `<p>${escapeHtml(entry.Text)}</p>` : ""}
        <footer><strong>${escapeHtml(entry.AuthorName || "SFK")}</strong><time>${escapeHtml(formatDate(timestampDate(entry.CreatedAt), false))}</time></footer>
        ${actions}
      </div>
    </article>`;
  }

  function toggleCompose() {
    if (!isSubmissionOpen()) return;
    const opening = elements.form.hidden;
    elements.form.hidden = !opening;
    elements.composeToggle.setAttribute("aria-expanded", String(opening));
    if (opening) window.setTimeout(() => elements.text.focus(), 50);
  }

  async function submitEntry(event) {
    event.preventDefault();
    if (!state.context || !isSubmissionOpen()) return;
    const text = elements.text.value.trim();
    const imageUrl = safeImageUrl(elements.imageUrl.value);
    if (!text && !imageUrl) {
      elements.formMessage.textContent = "Add a message or a valid public HTTPS image link.";
      return;
    }
    if (elements.imageUrl.value.trim() && !imageUrl) {
      elements.formMessage.textContent = "Photo link must be a valid public HTTPS URL.";
      return;
    }

    elements.submit.disabled = true;
    elements.formMessage.textContent = elements.editId.value ? "Updating entry..." : "Sealing entry...";
    try {
      const payload = {
        Type: ENTRY_TYPES[elements.type.value] ? elements.type.value : "memory",
        Text: text,
        ImageURL: imageUrl,
        UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (elements.editId.value) {
        await state.context.db.collection("timeCapsuleEntries").doc(elements.editId.value).update(payload);
        elements.formMessage.textContent = "Entry updated.";
      } else {
        await state.context.db.collection("timeCapsuleEntries").add({
          ...payload,
          AuthorUID: state.context.profile.uid,
          AuthorName: state.context.profile.name,
          AuthorRole: state.context.profile.role,
          Status: isAdmin() ? "approved" : "pending",
          CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        elements.formMessage.textContent = "Entry sealed.";
      }
      window.setTimeout(resetForm, 450);
    } catch (error) {
      elements.formMessage.textContent = readableError(error);
    } finally {
      elements.submit.disabled = false;
    }
  }

  async function handleEntryAction(event) {
    const button = event.target.closest("[data-capsule-action]");
    if (!button || !state.context) return;
    const entry = state.entries.find((item) => item.id === button.dataset.entryId);
    if (!entry) return;
    const action = button.dataset.capsuleAction;
    if (action === "edit") {
      elements.editId.value = entry.id;
      elements.type.value = ENTRY_TYPES[entry.Type] ? entry.Type : "memory";
      elements.text.value = entry.Text || "";
      elements.imageUrl.value = entry.ImageURL || "";
      elements.cancelEdit.hidden = false;
      elements.submit.textContent = "Update Entry";
      elements.form.hidden = false;
      elements.composeToggle.setAttribute("aria-expanded", "true");
      elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (action === "delete" && !window.confirm("Delete this capsule entry?")) return;

    button.disabled = true;
    try {
      const reference = state.context.db.collection("timeCapsuleEntries").doc(entry.id);
      if (action === "approve") {
        await reference.update({
          Status: "approved",
          ReviewedBy: state.context.profile.uid,
          ReviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
          UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else if (action === "reject") {
        await reference.update({
          Status: "rejected",
          ReviewedBy: state.context.profile.uid,
          ReviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
          UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else if (action === "delete") {
        await reference.delete();
        if (elements.editId.value === entry.id) resetForm();
      }
    } catch (error) {
      window.alert(readableError(error));
      button.disabled = false;
    }
  }

  function resetForm() {
    if (!elements.form) return;
    elements.form.reset();
    elements.editId.value = "";
    elements.cancelEdit.hidden = true;
    elements.submit.textContent = "Seal Entry";
    elements.formMessage.textContent = "";
    elements.form.hidden = true;
    elements.composeToggle.setAttribute("aria-expanded", "false");
  }

  function toggleAdminPanel() {
    if (!isAdmin()) return;
    const opening = elements.adminPanel.hidden;
    elements.adminPanel.hidden = !opening;
    elements.adminToggle.textContent = opening ? "Close" : "Manage";
    if (opening) {
      renderReviewEntries();
      elements.adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderSettings() {
    const deadline = settingsDate("SubmissionDeadline", DEFAULT_DEADLINE);
    const unlockAt = settingsDate("UnlockAt", DEFAULT_UNLOCK_AT);
    elements.deadline.value = toLocalInputValue(deadline);
    elements.unlockAt.value = toLocalInputValue(unlockAt);
    elements.allowSubmissions.checked = state.settings?.AllowSubmissions !== false;
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!isAdmin()) return;
    const deadline = new Date(elements.deadline.value);
    const unlockAt = new Date(elements.unlockAt.value);
    if (!Number.isFinite(deadline.getTime()) || !Number.isFinite(unlockAt.getTime())) {
      elements.settingsMessage.textContent = "Enter valid dates.";
      return;
    }
    elements.settingsMessage.textContent = "Saving settings...";
    try {
      await state.context.db.collection("timeCapsuleSettings").doc("main").set({
        Title: "SFK Time Capsule",
        SubmissionDeadline: firebase.firestore.Timestamp.fromDate(deadline),
        UnlockAt: firebase.firestore.Timestamp.fromDate(unlockAt),
        AllowSubmissions: elements.allowSubmissions.checked,
        UpdatedBy: state.context.profile.uid,
        UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      elements.settingsMessage.textContent = "Settings saved.";
    } catch (error) {
      elements.settingsMessage.textContent = readableError(error);
    }
  }

  async function unlockNow() {
    if (!isAdmin() || !window.confirm("Unlock the SFK Time Capsule now?")) return;
    elements.settingsMessage.textContent = "Unlocking capsule...";
    await state.context.db.collection("timeCapsuleSettings").doc("main").set({
      UnlockAt: firebase.firestore.FieldValue.serverTimestamp(),
      UpdatedBy: state.context.profile.uid,
      UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch((error) => {
      elements.settingsMessage.textContent = readableError(error);
    });
  }

  function startCountdown() {
    window.clearInterval(state.countdownTimer);
    updateCountdown();
    state.countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    if (!state.context || !state.settings) return;
    if (isUnlocked()) {
      if (elements.eyebrow.textContent !== "CAPSULE UNLOCKED") {
        startEntriesListeners();
        renderAll();
      }
      return;
    }
    const difference = settingsDate("UnlockAt", DEFAULT_UNLOCK_AT).getTime() - Date.now();
    if (difference <= 0) {
      renderAll();
      return;
    }
    const days = Math.floor(difference / 86400000);
    const hours = Math.floor((difference % 86400000) / 3600000);
    const minutes = Math.floor((difference % 3600000) / 60000);
    const seconds = Math.floor((difference % 60000) / 1000);
    elements.countdown.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s until unlock`;
  }

  function openPresentation() {
    const approved = state.entries.filter((entry) => entry.Status === "approved").sort(sortEntriesOldest);
    if (!approved.length) {
      window.alert("No approved capsule entries yet.");
      return;
    }
    state.presentationEntries = approved;
    state.slideIndex = 0;
    elements.presentation.hidden = false;
    showSlide(0);
  }

  function closePresentation() {
    window.clearInterval(state.presentationTimer);
    state.presentationTimer = null;
    if (elements.presentation) elements.presentation.hidden = true;
    if (elements.play) elements.play.innerHTML = "&#9654;";
  }

  function showSlide(index) {
    const entries = state.presentationEntries;
    if (!entries.length) return;
    state.slideIndex = (index + entries.length) % entries.length;
    const entry = entries[state.slideIndex];
    const imageUrl = safeImageUrl(entry.ImageURL);
    elements.slideCount.textContent = `${state.slideIndex + 1} / ${entries.length}`;
    elements.slide.innerHTML = `<article class="timeCapsuleSlideCard">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="SFK Time Capsule memory" referrerpolicy="no-referrer" />` : ""}
      <div>
        <span>${escapeHtml(ENTRY_TYPES[entry.Type] || "Memory")}</span>
        ${entry.Text ? `<p>${escapeHtml(entry.Text)}</p>` : ""}
        <footer>${escapeHtml(entry.AuthorName || "SFK")} · ${escapeHtml(formatDate(timestampDate(entry.CreatedAt), false))}</footer>
      </div>
    </article>`;
  }

  function togglePresentationPlayback() {
    if (state.presentationTimer) {
      window.clearInterval(state.presentationTimer);
      state.presentationTimer = null;
      elements.play.innerHTML = "&#9654;";
      return;
    }
    elements.play.innerHTML = "&#10074;&#10074;";
    state.presentationTimer = window.setInterval(() => showSlide(state.slideIndex + 1), 7000);
  }

  function printCapsule() {
    const original = elements.slide.innerHTML;
    elements.slide.innerHTML = state.presentationEntries.map((entry) => {
      const imageUrl = safeImageUrl(entry.ImageURL);
      return `<article class="timeCapsuleSlideCard">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="SFK Time Capsule memory" />` : ""}
        <div><span>${escapeHtml(ENTRY_TYPES[entry.Type] || "Memory")}</span>
        ${entry.Text ? `<p>${escapeHtml(entry.Text)}</p>` : ""}
        <footer>${escapeHtml(entry.AuthorName || "SFK")}</footer></div>
      </article>`;
    }).join("");
    document.body.classList.add("timeCapsulePrinting");
    window.print();
    document.body.classList.remove("timeCapsulePrinting");
    elements.slide.innerHTML = original;
  }

  function isAdmin() {
    return state.context?.profile?.role === "admin";
  }

  function isUnlocked() {
    if (!state.settings) return false;
    return Date.now() >= settingsDate("UnlockAt", DEFAULT_UNLOCK_AT).getTime();
  }

  function isSubmissionOpen() {
    if (!state.context || !state.settings) return false;
    if (isAdmin()) return true;
    return state.settings.AllowSubmissions !== false
      && Date.now() <= settingsDate("SubmissionDeadline", DEFAULT_DEADLINE).getTime();
  }

  function settingsDate(field, fallback) {
    return timestampDate(state.settings?.[field]) || new Date(fallback);
  }

  function timestampDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function toLocalInputValue(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function formatDate(date, includeTime) {
    if (!date || !Number.isFinite(date.getTime())) return "Just now";
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
    }).format(date);
  }

  function sortEntriesNewest(a, b) {
    return (timestampDate(b.CreatedAt)?.getTime() || 0) - (timestampDate(a.CreatedAt)?.getTime() || 0);
  }

  function sortEntriesOldest(a, b) {
    return (timestampDate(a.CreatedAt)?.getTime() || 0) - (timestampDate(b.CreatedAt)?.getTime() || 0);
  }

  function safeImageUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      return url.protocol === "https:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readableError(error) {
    const message = String(error?.message || error || "Something went wrong.");
    if (message.includes("permission")) return "This action is not allowed. Publish the latest Firebase rules.";
    return message.replace(/^Firebase:\s*/i, "").replace(/\s*\([^)]*\)\.?$/, "");
  }

  window.SFKTimeCapsule = { open, close, destroy };
})();
