(function () {
  "use strict";

  const REACTIONS = ["🫶", "👍", "❤️", "😂", "😮", "😢", "🙏", "✅"];
  const MESSAGE_LIMIT_STEP = 30;
  const MAX_POLL_OPTIONS = 12;
  const OWN_DELETE_WINDOW_MS = 5 * 60 * 1000;
  const PROFILE_COLOR_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
  const DEFAULT_PROFILE_COLOR = "#F7C600";
  const PROFILE_COLORS = [
    "#F7C600", "#FF7A7A", "#FF8FCB", "#B99CFF",
    "#73B9FF", "#68D9B0", "#FF9E45", "#A9B1BD"
  ];
  const CHAT_THEME_KEY = "sfkClassChatTheme";
  const CHAT_FONT_SIZE_KEY = "sfkClassChatFontSize";
  const CHAT_LAST_COUNT_KEY = "sfkClassChatLastReadCount";
  const CHAT_LAST_TIME_KEY = "sfkClassChatLastReadTime";
  const CHAT_DRAFT_PREFIX = "sfkClassChatDraft:";
  const STAFF_EMAILS = {
    admin: String(window.SFK_AUTH_ACCOUNTS?.admin || "").trim().toLowerCase(),
    officer: String(window.SFK_AUTH_ACCOUNTS?.officer || "").trim().toLowerCase()
  };

  let chatApp = null;
  let auth = null;
  let db = null;
  let currentProfile = null;
  let selectedRole = "student";
  let messageLimit = MESSAGE_LIMIT_STEP;
  let messagesUnsubscribe = null;
  let typingUnsubscribe = null;
  let pinnedUnsubscribe = null;
  let configUnsubscribe = null;
  let profileUnsubscribe = null;
  let metaUnsubscribe = null;
  let directoryUnsubscribe = null;
  let receiptsUnsubscribe = null;
  let savedUnsubscribe = null;
  let scheduledUnsubscribe = null;
  let scheduledRefreshTimer = null;
  let scheduledMessagesSignature = "";
  const pollVoteUnsubscribes = new Map();
  let currentMessages = [];
  let regularMessages = [];
  let scheduledMessages = [];
  let searchMessages = [];
  let chatDirectory = [];
  let readReceipts = [];
  let savedMessageIds = new Set();
  let savedItems = [];
  let replyTarget = null;
  let editTarget = null;
  let draftBeforeEdit = "";
  let currentPinned = null;
  let currentMetaCount = 0;
  let unreadDividerAfter = 0;
  let lastSentAt = 0;
  let currentConfig = { Locked: false, SlowModeSeconds: 0 };
  let reactionMessageId = "";
  let longPressTimer = null;
  let typingTimer = null;
  let typingClearTimer = null;
  let messageGesture = null;
  let lastTouchTap = { messageId: "", time: 0 };
  let lastTouchDoubleAt = 0;
  let chatToastTimer = null;
  let recentSentTimes = [];
  let lastSentText = "";
  let lastSentTextAt = 0;
  let chatHistoryActive = false;
  let suppressChatPopstate = false;
  let profileCustomColorSelected = false;
  let firstCustomColorSelected = false;

  const elements = {};

  document.addEventListener("DOMContentLoaded", initClassChat);

  function initClassChat() {
    cacheElements();
    if (!elements.open || !elements.layer) return;
    applySavedTheme();
    applySavedFontSize();
    startUnreadBadgeListener();

    elements.open.addEventListener("click", openChat);
    elements.layer.querySelectorAll("[data-chat-close]").forEach((button) => {
      button.addEventListener("click", requestCloseChat);
    });
    elements.logout.addEventListener("click", toggleChatMenu);
    elements.themeToggle.addEventListener("click", toggleChatTheme);
    elements.fontSizeToggle.addEventListener("click", cycleChatFontSize);
    elements.searchOpen.addEventListener("click", () => openUtility("search"));
    elements.savedOpen.addEventListener("click", () => openUtility("saved"));
    elements.colorOpen.addEventListener("click", () => openUtility("color"));
    elements.pollOpen.addEventListener("click", () => openUtility("poll"));
    elements.controlsOpen.addEventListener("click", () => openUtility("controls"));
    elements.scheduleOpen.addEventListener("click", () => openUtility("schedule"));
    elements.reportsOpen.addEventListener("click", () => openUtility("reports"));
    elements.leave.addEventListener("click", requestCloseChat);
    elements.exitNo.addEventListener("click", hideExitDialog);
    elements.exitYes.addEventListener("click", closeChat);
    elements.utilityBack.addEventListener("click", closeUtility);
    elements.searchInput.addEventListener("input", renderSearchResults);
    elements.controlsForm.addEventListener("submit", saveChatControls);
    elements.pollForm.addEventListener("submit", createQuickPoll);
    elements.scheduleForm.addEventListener("submit", scheduleChatMessage);
    elements.mediaOpen.addEventListener("click", () => openUtility("media"));
    elements.mediaForm.addEventListener("submit", sendMediaMessage);
    elements.colorForm.addEventListener("submit", saveProfileColor);
    elements.profileColors.addEventListener("change", () => {
      profileCustomColorSelected = false;
      setCustomColorSelected(elements.profileCustomColor, false);
      updateProfileColorPreview();
    });
    elements.profileCustomColor.addEventListener("input", () => {
      profileCustomColorSelected = true;
      setCustomColorSelected(elements.profileCustomColor, true);
      clearRadioColors(elements.profileColors.querySelectorAll('input[name="classChatProfileColor"]'));
      updateProfileColorPreview();
    });
    elements.firstColorChoices.forEach((input) => {
      input.addEventListener("change", () => {
        firstCustomColorSelected = false;
        setCustomColorSelected(elements.firstCustomColor, false);
      });
    });
    elements.firstCustomColor.addEventListener("input", () => {
      firstCustomColorSelected = true;
      setCustomColorSelected(elements.firstCustomColor, true);
      clearRadioColors(elements.firstColorChoices);
    });
    elements.addPollOption.addEventListener("click", addPollOption);
    elements.pollOptionsEditor.addEventListener("click", handlePollOptionEditorClick);
    elements.pinned.addEventListener("click", focusPinnedMessage);
    elements.jumpUnread.addEventListener("click", jumpToUnread);
    elements.messages.addEventListener("scroll", updateJumpButton);
    elements.roleTabs.forEach((button) => {
      button.addEventListener("click", () => selectRole(button.dataset.chatRole));
    });
    elements.studentForm.addEventListener("submit", signInStudent);
    elements.staffForm.addEventListener("submit", signInStaff);
    elements.changePinForm.addEventListener("submit", saveFirstPin);
    elements.composer.addEventListener("submit", sendMessage);
    elements.input.addEventListener("input", handleComposerInput);
    elements.replyCancel.addEventListener("click", clearReply);
    elements.loadEarlier.addEventListener("click", loadEarlier);
    elements.messages.addEventListener("click", handleMessageClick);
    elements.messages.addEventListener("dblclick", handleMessageDoubleClick);
    elements.messages.addEventListener("pointerdown", startLongPress);
    elements.messages.addEventListener("pointerup", finishMessageGesture);
    elements.messages.addEventListener("pointercancel", cancelMessageGesture);
    elements.messages.addEventListener("pointermove", moveMessageGesture);
    document.addEventListener("click", handleOutsideReactionTray);
    document.addEventListener("click", handleOutsideChatMenu);
    document.addEventListener("keydown", handleChatKeydown);
    window.addEventListener("popstate", handleChatPopstate);
    window.addEventListener("beforeunload", handleChatBeforeUnload);
  }

  function cacheElements() {
    elements.open = document.getElementById("classChatOpen");
    elements.unread = document.getElementById("classChatUnread");
    elements.layer = document.getElementById("classChatLayer");
    elements.panel = document.querySelector(".classChatPanel");
    elements.status = document.getElementById("classChatStatus");
    elements.logout = document.getElementById("classChatLogout");
    elements.menu = document.getElementById("classChatMenu");
    elements.themeToggle = document.getElementById("classChatThemeToggle");
    elements.themeLabel = elements.themeToggle?.querySelector(".classChatMenuLabel");
    elements.fontSizeToggle = document.getElementById("classChatFontSizeToggle");
    elements.fontSizeLabel = document.getElementById("classChatFontSizeLabel");
    elements.leave = document.getElementById("classChatLeave");
    elements.searchOpen = document.getElementById("classChatSearchOpen");
    elements.savedOpen = document.getElementById("classChatSavedOpen");
    elements.savedLabel = document.getElementById("classChatSavedLabel");
    elements.colorOpen = document.getElementById("classChatColorOpen");
    elements.colorMenuIcon = elements.colorOpen?.querySelector(".classChatColorMenuIcon");
    elements.pollOpen = document.getElementById("classChatPollOpen");
    elements.controlsOpen = document.getElementById("classChatControlsOpen");
    elements.scheduleOpen = document.getElementById("classChatScheduleOpen");
    elements.reportsOpen = document.getElementById("classChatReportsOpen");
    elements.utility = document.getElementById("classChatUtility");
    elements.utilityBack = document.getElementById("classChatUtilityBack");
    elements.utilityTitle = document.getElementById("classChatUtilityTitle");
    elements.searchPanel = document.getElementById("classChatSearchPanel");
    elements.searchInput = document.getElementById("classChatSearchInput");
    elements.searchResults = document.getElementById("classChatSearchResults");
    elements.controlsForm = document.getElementById("classChatControlsPanel");
    elements.lockToggle = document.getElementById("classChatLockToggle");
    elements.slowMode = document.getElementById("classChatSlowMode");
    elements.controlsMessage = document.getElementById("classChatControlsMessage");
    elements.pollForm = document.getElementById("classChatPollPanel");
    elements.pollQuestion = document.getElementById("classChatPollQuestion");
    elements.pollOptionsEditor = document.getElementById("classChatPollOptionsEditor");
    elements.addPollOption = document.getElementById("classChatAddPollOption");
    elements.pollMessage = document.getElementById("classChatPollMessage");
    elements.pollMultiple = document.getElementById("classChatPollMultiple");
    elements.pollAnonymous = document.getElementById("classChatPollAnonymous");
    elements.pollDeadline = document.getElementById("classChatPollDeadline");
    elements.savedPanel = document.getElementById("classChatSavedPanel");
    elements.savedResults = document.getElementById("classChatSavedResults");
    elements.colorForm = document.getElementById("classChatColorPanel");
    elements.profileColors = document.getElementById("classChatProfileColors");
    elements.colorPreview = document.getElementById("classChatColorPreview");
    elements.colorSave = document.getElementById("classChatColorSave");
    elements.colorMessage = document.getElementById("classChatColorMessage");
    elements.profileCustomColor = document.getElementById("classChatProfileCustomColor");
    elements.scheduleForm = document.getElementById("classChatSchedulePanel");
    elements.scheduleText = document.getElementById("classChatScheduleText");
    elements.scheduleAt = document.getElementById("classChatScheduleAt");
    elements.scheduleMessage = document.getElementById("classChatScheduleMessage");
    elements.reportsPanel = document.getElementById("classChatReportsPanel");
    elements.reportsResults = document.getElementById("classChatReportsResults");
    elements.mediaForm = document.getElementById("classChatMediaPanel");
    elements.mediaUrl = document.getElementById("classChatMediaUrl");
    elements.mediaType = document.getElementById("classChatMediaType");
    elements.mediaCaption = document.getElementById("classChatMediaCaption");
    elements.mediaMessage = document.getElementById("classChatMediaMessage");
    elements.hoursToggle = document.getElementById("classChatHoursToggle");
    elements.hoursStart = document.getElementById("classChatHoursStart");
    elements.hoursEnd = document.getElementById("classChatHoursEnd");
    elements.spamToggle = document.getElementById("classChatSpamToggle");
    elements.keywordToggle = document.getElementById("classChatKeywordToggle");
    elements.linksToggle = document.getElementById("classChatLinksToggle");
    elements.mediaToggle = document.getElementById("classChatMediaToggle");
    elements.blockedKeywords = document.getElementById("classChatBlockedKeywords");
    elements.login = document.getElementById("classChatLogin");
    elements.room = document.getElementById("classChatRoom");
    elements.pinned = document.getElementById("classChatPinned");
    elements.pinnedName = document.getElementById("classChatPinnedName");
    elements.pinnedText = document.getElementById("classChatPinnedText");
    elements.roleTabs = Array.from(document.querySelectorAll("[data-chat-role]"));
    elements.roleTabsWrap = document.querySelector(".classChatRoleTabs");
    elements.studentForm = document.getElementById("classChatStudentForm");
    elements.staffForm = document.getElementById("classChatStaffForm");
    elements.changePinForm = document.getElementById("classChatChangePinForm");
    elements.studentId = document.getElementById("classChatStudentId");
    elements.studentPin = document.getElementById("classChatStudentPin");
    elements.staffRole = document.getElementById("classChatStaffRole");
    elements.staffPin = document.getElementById("classChatStaffPin");
    elements.newPin = document.getElementById("classChatNewPin");
    elements.confirmPin = document.getElementById("classChatConfirmPin");
    elements.firstColorChoices = Array.from(document.querySelectorAll('input[name="classChatFirstColor"]'));
    elements.firstCustomColor = document.getElementById("classChatFirstCustomColor");
    elements.loginMessage = document.getElementById("classChatLoginMessage");
    elements.messages = document.getElementById("classChatMessages");
    elements.loadEarlier = document.getElementById("classChatLoadEarlier");
    elements.typing = document.getElementById("classChatTyping");
    elements.reply = document.getElementById("classChatReply");
    elements.replyName = document.getElementById("classChatReplyName");
    elements.replyText = document.getElementById("classChatReplyText");
    elements.replyCancel = document.getElementById("classChatReplyCancel");
    elements.mentionSuggestions = document.getElementById("classChatMentionSuggestions");
    elements.composer = document.getElementById("classChatComposer");
    elements.input = document.getElementById("classChatInput");
    elements.send = document.getElementById("classChatSend");
    elements.mediaOpen = document.getElementById("classChatMediaOpen");
    elements.reactionTray = document.getElementById("classChatReactionTray");
    elements.jumpUnread = document.getElementById("classChatJumpUnread");
    elements.toast = document.getElementById("classChatToast");
    elements.exitDialog = document.getElementById("classChatExitDialog");
    elements.exitNo = document.getElementById("classChatExitNo");
    elements.exitYes = document.getElementById("classChatExitYes");
  }

  function ensureFirebase() {
    if (!window.firebase || !window.SFK_FIREBASE_READY) {
      throw new Error("Class chat is not configured yet.");
    }

    try {
      chatApp = firebase.app("sfkClassChat");
    } catch (error) {
      chatApp = firebase.initializeApp(window.SFK_FIREBASE_CONFIG, "sfkClassChat");
    }

    auth = chatApp.auth();
    db = chatApp.firestore();
  }

  async function openChat() {
    elements.layer.hidden = false;
    document.body.classList.add("classChatIsOpen");
    elements.loginMessage.textContent = "";
    if (!chatHistoryActive) {
      window.history.pushState({ sfkClassChat: true }, "");
      chatHistoryActive = true;
    }

    try {
      ensureFirebase();
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      if (auth.currentUser) {
        await restoreCurrentProfile(auth.currentUser);
      } else {
        showLogin();
        window.setTimeout(() => elements.studentId.focus(), 80);
      }
    } catch (error) {
      showLogin();
      elements.loginMessage.textContent = readableError(error);
    }
  }

  async function closeChat() {
    hideExitDialog();
    elements.layer.hidden = true;
    document.body.classList.remove("classChatIsOpen");
    hideReactionTray();
    window.clearTimeout(chatToastTimer);
    elements.toast.hidden = true;
    closeChatMenu();
    closeUtility();
    clearReply();
    stopRealtimeListeners();
    await clearTyping();

    if (auth?.currentUser) {
      await auth.signOut().catch(() => {});
    }
    currentProfile = null;
    showLogin();
    if (chatHistoryActive) {
      chatHistoryActive = false;
      suppressChatPopstate = true;
      window.history.back();
    }
  }

  async function leaveChat() {
    await closeChat();
  }

  function requestCloseChat() {
    closeChatMenu();
    hideReactionTray();
    elements.exitDialog.hidden = false;
    window.setTimeout(() => elements.exitNo.focus(), 40);
  }

  function hideExitDialog() {
    elements.exitDialog.hidden = true;
  }

  function handleChatPopstate() {
    if (suppressChatPopstate) {
      suppressChatPopstate = false;
      return;
    }
    if (elements.layer.hidden) {
      chatHistoryActive = false;
      return;
    }
    chatHistoryActive = false;
    window.history.pushState({ sfkClassChat: true }, "");
    chatHistoryActive = true;
    requestCloseChat();
  }

  function handleChatBeforeUnload(event) {
    if (elements.layer.hidden) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function toggleChatMenu(event) {
    event.stopPropagation();
    const willOpen = elements.menu.hidden;
    elements.menu.hidden = !willOpen;
    elements.logout.setAttribute("aria-expanded", String(willOpen));
  }

  function closeChatMenu() {
    elements.menu.hidden = true;
    elements.logout.setAttribute("aria-expanded", "false");
  }

  function handleOutsideChatMenu(event) {
    if (elements.menu.hidden) return;
    if (!elements.menu.contains(event.target) && event.target !== elements.logout) closeChatMenu();
  }

  function applySavedTheme() {
    let theme = "light";
    try {
      theme = localStorage.getItem(CHAT_THEME_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      theme = "light";
    }
    setChatTheme(theme, false);
  }

  function toggleChatTheme() {
    const nextTheme = elements.panel.classList.contains("is-dark") ? "light" : "dark";
    setChatTheme(nextTheme, true);
  }

  function setChatTheme(theme, persist) {
    const dark = theme === "dark";
    elements.panel.classList.toggle("is-dark", dark);
    elements.themeToggle.setAttribute("aria-pressed", String(dark));
    elements.themeLabel.textContent = dark ? "Light mode" : "Dark mode";
    elements.themeToggle.querySelector(".classChatMenuIcon").textContent = dark ? "☀" : "☽";
    if (persist) {
      try {
        localStorage.setItem(CHAT_THEME_KEY, dark ? "dark" : "light");
      } catch (error) {
        // Theme persistence is optional when storage is blocked.
      }
    }
  }

  function applySavedFontSize() {
    let size = "default";
    try {
      const saved = localStorage.getItem(CHAT_FONT_SIZE_KEY);
      if (["small", "default", "large"].includes(saved)) size = saved;
    } catch (error) {
      size = "default";
    }
    setChatFontSize(size, false);
  }

  function cycleChatFontSize() {
    const current = elements.panel.classList.contains("font-large")
      ? "large"
      : elements.panel.classList.contains("font-small") ? "small" : "default";
    const next = current === "small" ? "default" : current === "default" ? "large" : "small";
    setChatFontSize(next, true);
  }

  function setChatFontSize(size, persist) {
    elements.panel.classList.toggle("font-small", size === "small");
    elements.panel.classList.toggle("font-large", size === "large");
    const label = size.charAt(0).toUpperCase() + size.slice(1);
    elements.fontSizeLabel.textContent = `Text size: ${label}`;
    if (persist) {
      try {
        localStorage.setItem(CHAT_FONT_SIZE_KEY, size);
      } catch (error) {
        // Font-size persistence is optional when storage is blocked.
      }
    }
  }

  function startUnreadBadgeListener() {
    try {
      ensureFirebase();
      if (metaUnsubscribe) metaUnsubscribe();
      metaUnsubscribe = db.collection("chatMeta").doc("main").onSnapshot((snapshot) => {
        currentMetaCount = Math.max(0, Number(snapshot.data()?.TotalMessages || 0));
        if (currentProfile && !elements.layer.hidden) {
          markLocalRead();
          return;
        }
        const lastReadCount = getStoredNumber(CHAT_LAST_COUNT_KEY);
        const unread = Math.max(0, currentMetaCount - lastReadCount);
        elements.unread.hidden = unread === 0;
        elements.unread.textContent = unread > 99 ? "99+" : String(unread);
      }, () => {
        elements.unread.hidden = true;
      });
    } catch (error) {
      elements.unread.hidden = true;
    }
  }

  function openUtility(type) {
    closeChatMenu();
    elements.utility.hidden = false;
    elements.searchPanel.hidden = type !== "search";
    elements.controlsForm.hidden = type !== "controls";
    elements.pollForm.hidden = type !== "poll";
    elements.savedPanel.hidden = type !== "saved";
    elements.colorForm.hidden = type !== "color";
    elements.scheduleForm.hidden = type !== "schedule";
    elements.reportsPanel.hidden = type !== "reports";
    elements.mediaForm.hidden = type !== "media";

    if (type === "search") {
      elements.utilityTitle.textContent = "Search messages";
      loadSearchMessages();
      window.setTimeout(() => elements.searchInput.focus(), 80);
    }
    if (type === "controls") {
      elements.utilityTitle.textContent = "Chat controls";
      elements.lockToggle.checked = currentConfig.Locked === true;
      elements.slowMode.value = String(Number(currentConfig.SlowModeSeconds || 0));
      elements.hoursToggle.checked = currentConfig.ChatHoursEnabled === true;
      elements.hoursStart.value = currentConfig.ChatHoursStart || "06:00";
      elements.hoursEnd.value = currentConfig.ChatHoursEnd || "21:00";
      elements.spamToggle.checked = currentConfig.SpamProtection === true;
      elements.keywordToggle.checked = currentConfig.KeywordFilterEnabled === true;
      elements.linksToggle.checked = currentConfig.ClickableLinksEnabled !== false;
      elements.mediaToggle.checked = currentConfig.AllowMedia !== false;
      elements.blockedKeywords.value = Array.isArray(currentConfig.BlockedKeywords)
        ? currentConfig.BlockedKeywords.join(", ")
        : "";
      elements.controlsMessage.textContent = "";
    }
    if (type === "poll") {
      elements.utilityTitle.textContent = "Create quick poll";
      elements.pollMessage.textContent = "";
      elements.pollDeadline.min = toLocalDateTimeInput(new Date(Date.now() + 5 * 60 * 1000));
      window.setTimeout(() => elements.pollQuestion.focus(), 80);
    }
    if (type === "saved") {
      elements.utilityTitle.textContent = "Saved messages";
      renderSavedMessages();
    }
    if (type === "color") {
      elements.utilityTitle.textContent = "Profile color";
      prepareProfileColorPanel();
    }
    if (type === "schedule") {
      elements.utilityTitle.textContent = "Schedule message";
      elements.scheduleMessage.textContent = "";
      elements.scheduleAt.min = toLocalDateTimeInput(new Date(Date.now() + 60 * 1000));
      window.setTimeout(() => elements.scheduleText.focus(), 80);
    }
    if (type === "reports") {
      elements.utilityTitle.textContent = "Reported messages";
      loadReportedMessages();
    }
    if (type === "media") {
      elements.utilityTitle.textContent = "Send media";
      elements.mediaMessage.textContent = "";
      window.setTimeout(() => elements.mediaUrl.focus(), 80);
    }
  }

  function closeUtility() {
    elements.utility.hidden = true;
  }

  async function loadSearchMessages() {
    elements.searchResults.innerHTML = `<p class="classChatUtilityHint">Loading recent messages...</p>`;
    try {
      const snapshot = await db.collection("chatMessages")
        .orderBy("CreatedAt", "desc")
        .limit(200)
        .get();
      searchMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderSearchResults();
    } catch (error) {
      elements.searchResults.innerHTML = `<p class="classChatUtilityHint">${escapeHtml(readableError(error))}</p>`;
    }
  }

  function renderSearchResults() {
    const query = String(elements.searchInput.value || "").trim().toLowerCase();
    if (!query) {
      elements.searchResults.innerHTML = `<p class="classChatUtilityHint">Type a word or student name.</p>`;
      return;
    }

    const results = searchMessages.filter((message) => {
      if (message.Removed) return false;
      return `${message.SenderName || ""} ${message.Text || ""}`.toLowerCase().includes(query);
    }).slice(0, 40);

    if (!results.length) {
      elements.searchResults.innerHTML = `<p class="classChatUtilityHint">No matching recent messages.</p>`;
      return;
    }

    elements.searchResults.innerHTML = results.map((message) => `
      <button type="button" class="classChatSearchResult" data-search-message="${message.id}">
        <strong>${escapeHtml(message.SenderName || "Classmate")}</strong>
        <span>${escapeHtml(message.Type === "poll" ? `Poll: ${message.Text || ""}` : message.Text || "")}</span>
        <small>${escapeHtml(formatDayLabel(timestampToDate(message.CreatedAt)))} · ${escapeHtml(formatTime(timestampToDate(message.CreatedAt)))}</small>
      </button>`).join("");

    elements.searchResults.querySelectorAll("[data-search-message]").forEach((button) => {
      button.addEventListener("click", () => openSearchResult(button.dataset.searchMessage));
    });
  }

  function openSearchResult(messageId) {
    closeUtility();
    if (findMessage(messageId)) {
      focusOriginalMessage(messageId);
      return;
    }
    messageLimit = 200;
    startRealtimeListeners();
    window.setTimeout(() => focusOriginalMessage(messageId), 650);
  }

  function showLogin() {
    closeUtility();
    closeChatMenu();
    elements.login.hidden = false;
    elements.room.hidden = true;
    elements.logout.hidden = false;
    elements.searchOpen.hidden = true;
    elements.savedOpen.hidden = true;
    elements.colorOpen.hidden = true;
    elements.pollOpen.hidden = true;
    elements.controlsOpen.hidden = true;
    elements.scheduleOpen.hidden = true;
    elements.reportsOpen.hidden = true;
    elements.status.textContent = "Sign in to join the conversation";
    elements.messages.innerHTML = "";
    elements.studentPin.value = "";
    elements.staffPin.value = "";
    elements.newPin.value = "";
    elements.confirmPin.value = "";
    firstCustomColorSelected = false;
    setCustomColorSelected(elements.firstCustomColor, false);
    elements.firstCustomColor.value = DEFAULT_PROFILE_COLOR;
    selectRadioColor(elements.firstColorChoices, DEFAULT_PROFILE_COLOR);
    elements.changePinForm.hidden = true;
    elements.roleTabsWrap.hidden = false;
    selectRole(selectedRole);
  }

  function showRoom() {
    elements.login.hidden = true;
    elements.room.hidden = false;
    elements.logout.hidden = false;
    elements.searchOpen.hidden = false;
    elements.savedOpen.hidden = false;
    elements.colorOpen.hidden = currentProfile.role !== "student";
    elements.colorMenuIcon?.style.setProperty("--profile-color", normalizeProfileColor(currentProfile.avatarColor));
    elements.status.textContent = `${currentProfile.name} · Class member`;
    elements.controlsOpen.hidden = currentProfile.role !== "admin";
    elements.pollOpen.hidden = false;
    elements.scheduleOpen.hidden = currentProfile.role !== "admin";
    elements.reportsOpen.hidden = currentProfile.role !== "admin";
    unreadDividerAfter = getStoredNumber(CHAT_LAST_TIME_KEY);
    elements.loginMessage.textContent = "";
    startRealtimeListeners();
    restoreDraft();
    window.setTimeout(() => elements.input.focus(), 80);
  }

  function selectRole(role) {
    selectedRole = role === "staff" ? "staff" : "student";
    elements.roleTabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.chatRole === selectedRole);
    });
    elements.studentForm.hidden = selectedRole !== "student";
    elements.staffForm.hidden = selectedRole !== "staff";
    elements.changePinForm.hidden = true;
    elements.loginMessage.textContent = "";
  }

  async function signInStudent(event) {
    event.preventDefault();
    const studentId = normalizeStudentId(elements.studentId.value);
    const pin = elements.studentPin.value.trim();

    if (!studentId || pin.length < 6) {
      elements.loginMessage.textContent = "Enter your Student ID and assigned 6-digit Chat PIN.";
      return;
    }

    await performLogin(async () => {
      ensureFirebase();
      const credential = await auth.signInWithEmailAndPassword(studentEmail(studentId), pin);
      const snapshot = await db.collection("chatProfiles").doc(credential.user.uid).get();
      if (!snapshot.exists) throw new Error("Your chat profile has not been activated.");

      const profile = snapshot.data() || {};
      if (String(profile.StudentID || "") !== studentId || profile.Active === false) {
        throw new Error("This chat account is not active.");
      }
      if (profile.Blocked === true) {
        throw new Error("This chat account is blocked. Please contact the adviser.");
      }

      currentProfile = {
        uid: credential.user.uid,
        studentId,
        name: String(profile.Name || "Student").trim(),
        role: "student",
        mutedUntil: timestampToMillis(profile.MutedUntil),
        mustChangePin: profile.MustChangePin === true,
        avatarColor: normalizeProfileColor(profile.AvatarColor),
        colorChangedAt: timestampToMillis(profile.ColorChangedAt)
      };
    });
  }

  async function signInStaff(event) {
    event.preventDefault();
    const role = elements.staffRole.value === "officer" ? "officer" : "admin";
    const email = STAFF_EMAILS[role];
    const pin = elements.staffPin.value.trim();

    if (!email || !pin) {
      elements.loginMessage.textContent = "Enter the account PIN.";
      return;
    }

    await performLogin(async () => {
      ensureFirebase();
      const credential = await auth.signInWithEmailAndPassword(email, pin);
      const signedEmail = String(credential.user.email || "").toLowerCase();
      if (signedEmail !== email) throw new Error("This account is not allowed.");

      currentProfile = {
        uid: credential.user.uid,
        studentId: "",
        name: role === "admin" ? "SFK Adviser" : "SFK Officer",
        role,
        mutedUntil: 0,
        avatarColor: DEFAULT_PROFILE_COLOR,
        colorChangedAt: 0
      };
    });
  }

  async function performLogin(loginAction) {
    elements.loginMessage.textContent = "Opening class chat...";
    setLoginDisabled(true);
    try {
      await loginAction();
      if (currentProfile?.mustChangePin) showFirstPinChange();
      else showRoom();
    } catch (error) {
      await auth?.signOut().catch(() => {});
      currentProfile = null;
      elements.loginMessage.textContent = readableError(error);
    } finally {
      setLoginDisabled(false);
    }
  }

  async function restoreCurrentProfile(user) {
    const email = String(user.email || "").toLowerCase();
    if (email === STAFF_EMAILS.admin || email === STAFF_EMAILS.officer) {
      currentProfile = {
        uid: user.uid,
        studentId: "",
        name: email === STAFF_EMAILS.admin ? "SFK Adviser" : "SFK Officer",
        role: email === STAFF_EMAILS.admin ? "admin" : "officer",
        mutedUntil: 0,
        avatarColor: DEFAULT_PROFILE_COLOR,
        colorChangedAt: 0
      };
      showRoom();
      return;
    }

    const snapshot = await db.collection("chatProfiles").doc(user.uid).get();
    const profile = snapshot.data() || {};
    if (!snapshot.exists || profile.Active === false || profile.Blocked === true) {
      await auth.signOut();
      showLogin();
      return;
    }

    currentProfile = {
      uid: user.uid,
      studentId: String(profile.StudentID || ""),
      name: String(profile.Name || "Student"),
      role: "student",
      mutedUntil: timestampToMillis(profile.MutedUntil),
      mustChangePin: profile.MustChangePin === true,
      avatarColor: normalizeProfileColor(profile.AvatarColor),
      colorChangedAt: timestampToMillis(profile.ColorChangedAt)
    };
    if (currentProfile.mustChangePin) showFirstPinChange();
    else showRoom();
  }

  function showFirstPinChange() {
    elements.studentForm.hidden = true;
    elements.staffForm.hidden = true;
    elements.changePinForm.hidden = false;
    elements.roleTabsWrap.hidden = true;
    elements.loginMessage.textContent = "";
    elements.status.textContent = "Create your personal Chat PIN";
    const currentColor = normalizeProfileColor(currentProfile.avatarColor);
    firstCustomColorSelected = !PROFILE_COLORS.includes(currentColor);
    elements.firstCustomColor.value = currentColor;
    setCustomColorSelected(elements.firstCustomColor, firstCustomColorSelected);
    selectRadioColor(elements.firstColorChoices, firstCustomColorSelected ? "" : currentColor);
    window.setTimeout(() => elements.newPin.focus(), 80);
  }

  async function saveFirstPin(event) {
    event.preventDefault();
    const newPin = elements.newPin.value.trim();
    const confirmPin = elements.confirmPin.value.trim();
    const avatarColor = firstCustomColorSelected
      ? normalizeProfileColor(elements.firstCustomColor.value)
      : selectedRadioColor(elements.firstColorChoices);

    if (!/^\d{6}$/.test(newPin)) {
      elements.loginMessage.textContent = "Your new PIN must contain exactly 6 digits.";
      return;
    }
    if (newPin === "123456") {
      elements.loginMessage.textContent = "Choose a PIN different from the default 123456.";
      return;
    }
    if (newPin !== confirmPin) {
      elements.loginMessage.textContent = "The two PIN entries do not match.";
      return;
    }

    const button = elements.changePinForm.querySelector("button");
    button.disabled = true;
    elements.loginMessage.textContent = "Saving your personal PIN...";
    try {
      await auth.currentUser.updatePassword(newPin);
      const batch = db.batch();
      const updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      batch.update(db.collection("chatProfiles").doc(currentProfile.uid), {
        MustChangePin: false,
        AvatarColor: avatarColor,
        ColorChangedAt: updatedAt,
        UpdatedAt: updatedAt
      });
      batch.set(db.collection("chatDirectory").doc(currentProfile.uid), {
        Name: currentProfile.name,
        Role: "student",
        AvatarColor: avatarColor,
        UpdatedAt: updatedAt
      }, { merge: true });
      await batch.commit();
      currentProfile.mustChangePin = false;
      currentProfile.avatarColor = avatarColor;
      currentProfile.colorChangedAt = Date.now();
      elements.colorMenuIcon?.style.setProperty("--profile-color", avatarColor);
      elements.changePinForm.hidden = true;
      elements.roleTabsWrap.hidden = false;
      showRoom();
    } catch (error) {
      elements.loginMessage.textContent = readableError(error);
    } finally {
      button.disabled = false;
    }
  }

  function setLoginDisabled(disabled) {
    elements.studentForm.querySelectorAll("input, button").forEach((node) => { node.disabled = disabled; });
    elements.staffForm.querySelectorAll("input, select, button").forEach((node) => { node.disabled = disabled; });
  }

  function normalizeProfileColor(value) {
    const color = String(value || "").trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_PROFILE_COLOR;
  }

  function selectedRadioColor(nodes) {
    return normalizeProfileColor(nodes.find((input) => input.checked)?.value);
  }

  function selectRadioColor(nodes, value) {
    const color = String(value || "").trim().toUpperCase();
    nodes.forEach((input) => {
      input.checked = normalizeProfileColor(input.value) === color;
    });
  }

  function clearRadioColors(nodes) {
    Array.from(nodes).forEach((input) => { input.checked = false; });
  }

  function setCustomColorSelected(input, selected) {
    input?.closest(".classChatCustomColor")?.classList.toggle("is-selected", selected);
  }

  function profileInkColor(value) {
    const color = normalizeProfileColor(value);
    const red = parseInt(color.slice(1, 3), 16);
    const green = parseInt(color.slice(3, 5), 16);
    const blue = parseInt(color.slice(5, 7), 16);
    return ((red * 299) + (green * 587) + (blue * 114)) / 1000 < 145 ? "#FFFFFF" : "#111111";
  }

  function profileColorForMessage(message) {
    const directoryProfile = chatDirectory.find((entry) => entry.uid === message.SenderUID);
    if (directoryProfile?.AvatarColor) return normalizeProfileColor(directoryProfile.AvatarColor);
    if (message.SenderUID === currentProfile?.uid) return normalizeProfileColor(currentProfile.avatarColor);
    return DEFAULT_PROFILE_COLOR;
  }

  function updateProfileColorPreview() {
    const choices = Array.from(elements.profileColors.querySelectorAll('input[name="classChatProfileColor"]'));
    const color = profileCustomColorSelected
      ? normalizeProfileColor(elements.profileCustomColor.value)
      : selectedRadioColor(choices);
    elements.colorPreview.style.setProperty("--profile-color", color);
    elements.colorPreview.style.setProperty("--profile-ink", profileInkColor(color));
  }

  function prepareProfileColorPanel() {
    const choices = Array.from(elements.profileColors.querySelectorAll('input[name="classChatProfileColor"]'));
    const selectedColor = normalizeProfileColor(currentProfile?.avatarColor);
    const availableAt = Number(currentProfile?.colorChangedAt || 0) + PROFILE_COLOR_COOLDOWN_MS;
    const coolingDown = Number(currentProfile?.colorChangedAt || 0) > 0 && Date.now() < availableAt;
    profileCustomColorSelected = !PROFILE_COLORS.includes(selectedColor);
    elements.profileCustomColor.value = selectedColor;
    setCustomColorSelected(elements.profileCustomColor, profileCustomColorSelected);
    selectRadioColor(choices, profileCustomColorSelected ? "" : selectedColor);
    choices.forEach((input) => { input.disabled = coolingDown; });
    elements.profileCustomColor.disabled = coolingDown;
    elements.colorPreview.textContent = initials(currentProfile?.name || "Student");
    elements.colorPreview.style.setProperty("--profile-color", selectedColor);
    elements.colorPreview.style.setProperty("--profile-ink", profileInkColor(selectedColor));
    elements.colorSave.disabled = coolingDown;
    elements.colorMessage.textContent = coolingDown
      ? `You can change your color again on ${new Date(availableAt).toLocaleString()}.`
      : "After saving, the next color change will be available after 3 days.";
  }

  async function saveProfileColor(event) {
    event.preventDefault();
    if (currentProfile?.role !== "student") return;
    const availableAt = Number(currentProfile.colorChangedAt || 0) + PROFILE_COLOR_COOLDOWN_MS;
    if (currentProfile.colorChangedAt > 0 && Date.now() < availableAt) {
      prepareProfileColorPanel();
      return;
    }

    const choices = Array.from(elements.profileColors.querySelectorAll('input[name="classChatProfileColor"]'));
    const avatarColor = profileCustomColorSelected
      ? normalizeProfileColor(elements.profileCustomColor.value)
      : selectedRadioColor(choices);
    if (avatarColor === normalizeProfileColor(currentProfile.avatarColor)) {
      elements.colorMessage.textContent = "Choose a different color before saving.";
      return;
    }

    elements.colorSave.disabled = true;
    elements.colorMessage.textContent = "Saving profile color...";
    try {
      const batch = db.batch();
      const updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      batch.update(db.collection("chatProfiles").doc(currentProfile.uid), {
        AvatarColor: avatarColor,
        ColorChangedAt: updatedAt,
        UpdatedAt: updatedAt
      });
      batch.set(db.collection("chatDirectory").doc(currentProfile.uid), {
        Name: currentProfile.name,
        Role: "student",
        AvatarColor: avatarColor,
        UpdatedAt: updatedAt
      }, { merge: true });
      await batch.commit();
      currentProfile.avatarColor = avatarColor;
      currentProfile.colorChangedAt = Date.now();
      elements.colorMenuIcon?.style.setProperty("--profile-color", avatarColor);
      renderMessages();
      prepareProfileColorPanel();
      showChatToast("Profile color updated.");
    } catch (error) {
      elements.colorSave.disabled = false;
      elements.colorMessage.textContent = readableError(error);
    }
  }

  function startRealtimeListeners() {
    stopRealtimeListeners();
    messageLimit = Math.max(MESSAGE_LIMIT_STEP, messageLimit);

    messagesUnsubscribe = db.collection("chatMessages")
      .orderBy("CreatedAt", "desc")
      .limit(messageLimit)
      .onSnapshot((snapshot) => {
        const wasNearBottom = isNearBottom();
        regularMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse();
        rebuildCurrentMessages();
        renderMessages();
        markRead();
        markLocalRead();
        if (wasNearBottom || currentMessages[currentMessages.length - 1]?.SenderUID === currentProfile.uid) {
          scrollToBottom();
        }
      }, (error) => {
        elements.messages.innerHTML = `<p class="classChatDay">${escapeHtml(readableError(error))}</p>`;
      });

    typingUnsubscribe = db.collection("chatTyping").onSnapshot((snapshot) => {
      const now = Date.now();
      const names = snapshot.docs
        .map((doc) => doc.data() || {})
        .filter((entry) => entry.UID !== currentProfile.uid && timestampToMillis(entry.ExpiresAt) > now)
        .map((entry) => String(entry.Name || "Someone"));

      if (!names.length) {
        elements.typing.hidden = true;
        return;
      }
      elements.typing.textContent = names.length === 1
        ? `${names[0]} is typing...`
        : `${names.slice(0, 2).join(" and ")} are typing...`;
      elements.typing.hidden = false;
    }, () => {
      elements.typing.hidden = true;
    });

    pinnedUnsubscribe = db.collection("chatMessages")
      .where("Pinned", "==", true)
      .limit(1)
      .onSnapshot((snapshot) => {
        currentPinned = snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        renderPinnedMessage();
      }, () => {
        currentPinned = null;
        renderPinnedMessage();
      });

    configUnsubscribe = db.collection("chatConfig").doc("main").onSnapshot((snapshot) => {
      const previousLinkSetting = currentConfig.ClickableLinksEnabled;
      currentConfig = {
        Locked: snapshot.data()?.Locked === true,
        SlowModeSeconds: Number(snapshot.data()?.SlowModeSeconds || 0),
        ChatHoursEnabled: snapshot.data()?.ChatHoursEnabled === true,
        ChatHoursStart: snapshot.data()?.ChatHoursStart || "06:00",
        ChatHoursEnd: snapshot.data()?.ChatHoursEnd || "21:00",
        SpamProtection: snapshot.data()?.SpamProtection === true,
        KeywordFilterEnabled: snapshot.data()?.KeywordFilterEnabled === true,
        BlockedKeywords: Array.isArray(snapshot.data()?.BlockedKeywords) ? snapshot.data().BlockedKeywords : [],
        ClickableLinksEnabled: snapshot.data()?.ClickableLinksEnabled !== false,
        AllowMedia: snapshot.data()?.AllowMedia !== false
      };
      applyChatConfig();
      if (previousLinkSetting !== undefined
          && previousLinkSetting !== currentConfig.ClickableLinksEnabled
          && currentMessages.length) {
        renderMessages();
      }
    }, () => {
      currentConfig = { Locked: false, SlowModeSeconds: 0 };
      applyChatConfig();
    });

    if (currentProfile.role === "student") {
      profileUnsubscribe = db.collection("chatProfiles").doc(currentProfile.uid).onSnapshot((snapshot) => {
        const profile = snapshot.data() || {};
        const previousColor = currentProfile.avatarColor;
        currentProfile.mutedUntil = timestampToMillis(profile.MutedUntil);
        currentProfile.avatarColor = normalizeProfileColor(profile.AvatarColor);
        currentProfile.colorChangedAt = timestampToMillis(profile.ColorChangedAt);
        elements.colorMenuIcon?.style.setProperty("--profile-color", currentProfile.avatarColor);
        if (previousColor !== currentProfile.avatarColor && currentMessages.length) renderMessages();
        if (profile.Active === false || profile.Blocked === true) leaveChat();
      });
    }

    directoryUnsubscribe = db.collection("chatDirectory").orderBy("Name").onSnapshot((snapshot) => {
      const previousColors = chatDirectory.map((entry) => `${entry.uid}:${entry.AvatarColor || ""}`).join("|");
      chatDirectory = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
      const nextColors = chatDirectory.map((entry) => `${entry.uid}:${entry.AvatarColor || ""}`).join("|");
      if (previousColors !== nextColors && currentMessages.length) renderMessages();
    }, () => {
      chatDirectory = [];
    });

    receiptsUnsubscribe = db.collection("chatReadReceipts").onSnapshot((snapshot) => {
      readReceipts = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
      updateSeenIndicators();
    });

    savedUnsubscribe = db.collection("chatSaved").doc(currentProfile.uid).collection("items")
      .onSnapshot((snapshot) => {
        savedMessageIds = new Set(snapshot.docs.map((doc) => doc.id));
        savedItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => timestampToMillis(b.SavedAt) - timestampToMillis(a.SavedAt));
        elements.savedLabel.textContent = savedItems.length
          ? `Saved messages (${savedItems.length})`
          : "Saved messages";
        if (!elements.savedPanel.hidden) renderSavedMessages();
      });

    refreshScheduledMessages();
    scheduledRefreshTimer = window.setInterval(() => {
      refreshScheduledMessages();
      applyChatConfig();
      updatePollDeadlineStates();
    }, 30000);
  }

  function stopRealtimeListeners() {
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (typingUnsubscribe) typingUnsubscribe();
    if (pinnedUnsubscribe) pinnedUnsubscribe();
    if (configUnsubscribe) configUnsubscribe();
    if (profileUnsubscribe) profileUnsubscribe();
    if (directoryUnsubscribe) directoryUnsubscribe();
    if (receiptsUnsubscribe) receiptsUnsubscribe();
    if (savedUnsubscribe) savedUnsubscribe();
    if (scheduledUnsubscribe) scheduledUnsubscribe();
    window.clearInterval(scheduledRefreshTimer);
    messagesUnsubscribe = null;
    typingUnsubscribe = null;
    pinnedUnsubscribe = null;
    configUnsubscribe = null;
    profileUnsubscribe = null;
    directoryUnsubscribe = null;
    receiptsUnsubscribe = null;
    savedUnsubscribe = null;
    scheduledUnsubscribe = null;
    scheduledRefreshTimer = null;
    clearPollVoteListeners();
  }

  function rebuildCurrentMessages() {
    currentMessages = regularMessages.concat(scheduledMessages)
      .sort((a, b) => timestampToMillis(a.CreatedAt) - timestampToMillis(b.CreatedAt));
  }

  function refreshScheduledMessages() {
    if (scheduledUnsubscribe) scheduledUnsubscribe();
    scheduledUnsubscribe = db.collection("chatScheduled")
      .where("PublishAt", "<=", firebase.firestore.Timestamp.now())
      .orderBy("PublishAt", "desc")
      .limit(50)
      .onSnapshot((snapshot) => {
        const nextScheduledMessages = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: `scheduled_${doc.id}`,
          ScheduledDocID: doc.id,
          IsScheduled: true,
          CreatedAt: doc.data().PublishAt,
          Removed: false
        })).reverse();
        const nextSignature = nextScheduledMessages.map((message) => (
          `${message.ScheduledDocID}:${timestampToMillis(message.CreatedAt)}:${message.Text || ""}`
        )).join("|");
        if (nextSignature === scheduledMessagesSignature) return;
        scheduledMessagesSignature = nextSignature;
        scheduledMessages = nextScheduledMessages;
        rebuildCurrentMessages();
        renderMessages();
      }, () => {
        if (!scheduledMessages.length) return;
        scheduledMessagesSignature = "";
        scheduledMessages = [];
        rebuildCurrentMessages();
        renderMessages();
      });
  }

  function updatePollDeadlineStates() {
    currentMessages.filter((message) => message.Type === "poll").forEach((message) => {
      const deadlinePassed = timestampToMillis(message.PollEndsAt) > 0
        && timestampToMillis(message.PollEndsAt) <= Date.now();
      if (!deadlinePassed && message.PollClosed !== true) return;
      const card = elements.messages.querySelector(`[data-poll-id="${cssEscape(message.id)}"]`);
      if (!card) return;
      card.querySelectorAll("[data-poll-option]").forEach((button) => { button.disabled = true; });
      const total = card.querySelector("[data-poll-total]");
      if (total && !total.textContent.includes("Poll closed")) {
        total.textContent = `${total.textContent} · Poll closed`;
      }
    });
  }

  function renderPinnedMessage() {
    if (!currentPinned || currentPinned.Removed) {
      elements.pinned.hidden = true;
      return;
    }
    elements.pinnedName.textContent = currentPinned.SenderName || "SFK Adviser";
    elements.pinnedText.textContent = currentPinned.Type === "poll"
      ? `Poll: ${currentPinned.Text || ""}`
      : currentPinned.Text || "";
    elements.pinned.hidden = false;
  }

  function focusPinnedMessage() {
    if (!currentPinned) return;
    if (findMessage(currentPinned.id)) {
      focusOriginalMessage(currentPinned.id);
      return;
    }
    messageLimit = 200;
    startRealtimeListeners();
    window.setTimeout(() => focusOriginalMessage(currentPinned.id), 650);
  }

  function applyChatConfig() {
    if (!currentProfile) return;
    const restricted = isChatRestrictedForUser();
    elements.input.disabled = restricted;
    elements.send.disabled = restricted;
    elements.mediaOpen.hidden = currentConfig.AllowMedia === false;
    elements.mediaOpen.disabled = restricted || currentConfig.AllowMedia === false;
    if (currentConfig.AllowMedia === false && !elements.mediaForm.hidden) closeUtility();
    elements.input.placeholder = restricted
      ? currentConfig.Locked
        ? "Conversation locked by the Adviser"
        : "Chat is outside the allowed hours"
      : currentConfig.SlowModeSeconds > 0
        ? `Message... · ${currentConfig.SlowModeSeconds}s slow mode`
        : "Message...";
    elements.status.textContent = restricted
      ? currentConfig.Locked ? "Adviser-only messaging" : "Chat hours closed"
      : `${currentProfile.name} · Class member`;
  }

  function isChatRestrictedForUser() {
    if (currentProfile?.role === "admin") return false;
    if (currentConfig.Locked) return true;
    if (!currentConfig.ChatHoursEnabled) return false;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const nowMinutes = Number(parts.find((part) => part.type === "hour")?.value || 0) * 60
      + Number(parts.find((part) => part.type === "minute")?.value || 0);
    const start = timeInputToMinutes(currentConfig.ChatHoursStart || "06:00");
    const end = timeInputToMinutes(currentConfig.ChatHoursEnd || "21:00");
    return start <= end
      ? nowMinutes < start || nowMinutes > end
      : nowMinutes > end && nowMinutes < start;
  }

  function timeInputToMinutes(value) {
    const [hours, minutes] = String(value || "00:00").split(":").map(Number);
    return (hours * 60) + minutes;
  }

  function loadEarlier() {
    messageLimit += MESSAGE_LIMIT_STEP;
    startRealtimeListeners();
  }

  function renderMessages() {
    if (!currentMessages.length) {
      elements.messages.innerHTML = `<p class="classChatDay">No messages yet. Start the class conversation.</p>`;
      return;
    }

    let lastDay = "";
    elements.messages.innerHTML = currentMessages.map((message, index) => {
      const previous = currentMessages[index - 1];
      const next = currentMessages[index + 1];
      const createdAt = timestampToDate(message.CreatedAt);
      const day = formatDayLabel(createdAt);
      const showDay = day !== lastDay;
      lastDay = day;
      const previousCreatedAt = previous ? timestampToMillis(previous.CreatedAt) : 0;
      const showNewDivider = unreadDividerAfter > 0
        && timestampToMillis(message.CreatedAt) > unreadDividerAfter
        && previousCreatedAt <= unreadDividerAfter;

      const own = message.SenderUID === currentProfile.uid;
      const grouped = isSameMessageGroup(previous, message);
      const groupEnd = !isSameMessageGroup(message, next);
      const canDeleteOwn = own && Date.now() - createdAt.getTime() <= OWN_DELETE_WINDOW_MS;
      const canEditOwn = own
        && message.Type !== "poll"
        && Date.now() - createdAt.getTime() <= OWN_DELETE_WINDOW_MS;
      const canModerate = currentProfile.role === "admin";
      const removed = message.Removed === true;
      const mentioned = !removed && isCurrentUserMentioned(message.Text);
      const priorityLabel = message.Priority === true
        ? `<span class="classChatPriorityLabel">ADVISER PRIORITY</span>`
        : "";
      const messageContent = removed
        ? `<span class="classChatRemoved">Message removed by the Adviser.</span>`
        : message.Type === "poll"
          ? renderPollMarkup(message)
          : `<div class="classChatText">${formatMessageText(message.Text || "")}${message.Edited ? `<small class="classChatEdited">edited</small>` : ""}</div>${renderYoutubeEmbed(message.Text || "")}${renderMediaAttachment(message)}`;

      const replySource = message.ReplyToID ? findMessage(message.ReplyToID) : null;
      const replyIsUnavailable = removed
        || message.ReplySourceRemoved === true
        || replySource?.Removed === true;
      const quoted = message.ReplyToID && !replyIsUnavailable ? `
        <div class="classChatQuoted" data-quoted-message-id="${message.ReplyToID}">
          <strong>${escapeHtml(message.ReplyToName || "Message")}</strong>
          <span>${escapeHtml(message.ReplyToText || "Original message")}</span>
        </div>` : "";

      const actionButtons = !removed && !message.IsScheduled ? `
        <div class="classChatMessageActions">
          <button type="button" data-chat-action="reply" data-message-id="${message.id}">Reply</button>
          <button type="button" data-chat-action="react" data-message-id="${message.id}">React</button>
          ${canEditOwn ? `<button type="button" data-chat-action="edit" data-message-id="${message.id}">Edit</button>` : ""}
          <button type="button" data-chat-action="save" data-message-id="${message.id}">${savedMessageIds.has(message.id) ? "Unsave" : "Save"}</button>
          ${canModerate ? `<button type="button" data-chat-action="pin" data-message-id="${message.id}">${message.Pinned ? "Unpin" : "Pin"}</button>` : ""}
          ${canModerate ? `<button type="button" data-chat-action="priority" data-message-id="${message.id}">${message.Priority ? "Normal" : "Priority"}</button>` : ""}
          ${message.Type === "poll" && (own || canModerate) && !message.PollClosed ? `<button type="button" data-chat-action="close-poll" data-message-id="${message.id}">Close poll</button>` : ""}
          ${!own ? `<button type="button" data-chat-action="report" data-message-id="${message.id}">Report</button>` : ""}
          ${(canDeleteOwn || canModerate) ? `<button type="button" data-chat-action="delete" data-message-id="${message.id}">Remove</button>` : ""}
        </div>` : "";

      return `
        ${showDay ? `<div class="classChatDay">${escapeHtml(day)}</div>` : ""}
        ${showNewDivider ? `<div class="classChatNewDivider">New messages</div>` : ""}
        <article class="classChatMessage ${own ? "is-own" : ""} ${grouped ? "is-grouped" : "is-first"} ${groupEnd ? "is-group-end" : ""} ${removed ? "has-removed" : ""} ${mentioned ? "is-mentioned" : ""} ${message.Priority ? "is-priority" : ""}"
                 data-message-id="${message.id}">
          ${own ? "" : (() => {
            const avatarColor = profileColorForMessage(message);
            return `<span class="classChatMessageAvatar" style="--profile-color:${avatarColor};--profile-ink:${profileInkColor(avatarColor)}">${escapeHtml(initials(message.SenderName))}</span>`;
          })()}
          <div class="classChatBubbleWrap">
            ${own ? "" : `<p class="classChatSender">${escapeHtml(message.SenderName || "Student")}${roleBadgeMarkup(message.SenderRole)}</p>`}
            <div class="classChatBubble">
              ${priorityLabel}
              ${quoted}
              ${messageContent}
            </div>
            <div class="classChatReactionSummary" data-reactions-for="${message.id}"></div>
            <div class="classChatMeta">${groupEnd ? `${formatTime(createdAt)}<span class="classChatSeen" data-seen-message="${message.id}"></span>` : ""}</div>
            ${actionButtons}
          </div>
        </article>`;
    }).join("");

    currentMessages.filter((message) => !message.IsScheduled).forEach((message) => loadReactions(message.id));
    clearPollVoteListeners();
    currentMessages.filter((message) => message.Type === "poll" && !message.Removed)
      .forEach((message) => loadPollVotes(message));
    verifyQuotedMessages();
    updateSeenIndicators();
    updateJumpButton();
  }

  function isSameMessageGroup(first, second) {
    if (!first || !second || first.SenderUID !== second.SenderUID) return false;
    const firstTime = timestampToMillis(first.CreatedAt);
    const secondTime = timestampToMillis(second.CreatedAt);
    if (!firstTime || !secondTime || secondTime - firstTime > 60 * 1000) return false;
    return timestampToDate(first.CreatedAt).toDateString() === timestampToDate(second.CreatedAt).toDateString();
  }

  function renderPollMarkup(message) {
    const options = Array.isArray(message.PollOptions) ? message.PollOptions : [];
    const deadlinePassed = timestampToMillis(message.PollEndsAt) > 0
      && timestampToMillis(message.PollEndsAt) <= Date.now();
    const closed = message.PollClosed === true || deadlinePassed;
    return `
      <div class="classChatPollCard" data-poll-id="${message.id}">
        <strong class="classChatPollQuestion">${escapeHtml(message.Text || "Class poll")}</strong>
        <small class="classChatPollTotal">${message.PollMultiple ? "Select one or more" : "Select one"}${message.PollAnonymous ? " · Anonymous" : ""}${closed ? " · Closed" : ""}</small>
        <div class="classChatPollOptions">
          ${options.map((option, index) => `
            <button type="button" class="classChatPollOption" data-poll-option="${index}" ${closed ? "disabled" : ""}>
              <span><b>${escapeHtml(option)}</b><em>0%</em></span>
              <small class="classChatPollVoters" data-poll-voters hidden></small>
            </button>`).join("")}
        </div>
        <small class="classChatPollTotal" data-poll-total>No votes yet${closed ? " · Poll closed" : ""}</small>
      </div>`;
  }

  function roleBadgeMarkup(role) {
    const cleanRole = String(role || "student").toLowerCase();
    if (cleanRole === "admin") return `<span class="classChatRoleBadge is-admin">Admin</span>`;
    if (cleanRole === "officer") return `<span class="classChatRoleBadge is-officer">Officer</span>`;
    return `<span class="classChatRoleBadge">Student</span>`;
  }

  function formatMessageText(text) {
    const source = String(text || "");
    if (currentConfig.ClickableLinksEnabled === false) return formatMentions(source);
    const urlPattern = /https?:\/\/[^\s<>"']+/gi;
    let output = "";
    let cursor = 0;
    source.replace(urlPattern, (rawUrl, offset) => {
      output += formatMentions(source.slice(cursor, offset));
      let url = rawUrl;
      let trailing = "";
      while (/[),.!?;:]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported link");
        const label = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
        output += `<a class="classChatLink" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>${escapeHtml(trailing)}`;
      } catch (error) {
        output += escapeHtml(rawUrl);
      }
      cursor = offset + rawUrl.length;
      return rawUrl;
    });
    output += formatMentions(source.slice(cursor));
    return output;
  }

  function formatMentions(text) {
    const names = [...new Set(
      chatDirectory.map((entry) => String(entry.Name || "").trim())
        .concat(currentProfile?.name || "")
        .filter(Boolean)
    )].sort((a, b) => b.length - a.length);
    if (!names.length) return escapeHtml(text);
    const pattern = new RegExp(`@(${names.map(escapeRegExp).join("|")})(?=\\s|$|[.,!?])`, "gi");
    let output = "";
    let cursor = 0;
    String(text).replace(pattern, (match, name, offset) => {
      output += escapeHtml(String(text).slice(cursor, offset));
      output += `<span class="classChatMention">@${escapeHtml(name)}</span>`;
      cursor = offset + match.length;
      return match;
    });
    output += escapeHtml(String(text).slice(cursor));
    return output;
  }

  function renderYoutubeEmbed(text) {
    if (currentConfig.ClickableLinksEnabled === false) return "";
    const urlMatch = String(text || "").match(/https?:\/\/[^\s<>"']+/i);
    if (!urlMatch) return "";
    const videoId = youtubeVideoId(urlMatch[0]);
    if (!videoId) return "";
    return `
      <div class="classChatYoutube">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${videoId}"
          title="YouTube video player"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen></iframe>
      </div>`;
  }

  function renderMediaAttachment(message) {
    if (!message.MediaURL || !message.MediaType) return "";
    const url = safeHttpUrl(message.MediaURL);
    if (!url) return "";
    if (message.MediaType === "youtube") {
      const videoId = youtubeVideoId(url);
      if (!videoId) return "";
      return `
        <div class="classChatYoutube">
          <iframe
            src="https://www.youtube-nocookie.com/embed/${videoId}"
            title="YouTube video player"
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen></iframe>
        </div>`;
    }
    if (message.MediaType === "image") {
      return `
        <div class="classChatMediaAttachment">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
            <img src="${escapeHtml(url)}" alt="Shared image" loading="lazy" referrerpolicy="no-referrer" />
          </a>
        </div>`;
    }
    if (message.MediaType === "video") {
      return `
        <div class="classChatMediaAttachment">
          <video src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open video</a>
        </div>`;
    }
    if (message.MediaType === "audio") {
      return `
        <div class="classChatMediaAttachment">
          <audio src="${escapeHtml(url)}" controls preload="metadata"></audio>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open audio</a>
        </div>`;
    }
    return "";
  }

  function safeHttpUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (error) {
      return "";
    }
  }

  function youtubeVideoId(value) {
    try {
      const parsed = new URL(String(value).replace(/[),.!?;:]+$/, ""));
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      let id = "";
      if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        id = parsed.searchParams.get("v") || "";
        if (!id) {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (["shorts", "embed", "live"].includes(parts[0])) id = parts[1] || "";
        }
      }
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : "";
    } catch (error) {
      return "";
    }
  }

  function isCurrentUserMentioned(text) {
    if (!currentProfile?.name) return false;
    return String(text || "").toLowerCase().includes(`@${currentProfile.name.toLowerCase()}`);
  }

  function updateSeenIndicators() {
    if (!currentProfile || !elements.messages) return;
    elements.messages.querySelectorAll("[data-seen-message]").forEach((node) => { node.textContent = ""; });
    const latestOwn = [...currentMessages].reverse().find((message) => (
      !message.IsScheduled && !message.Removed && message.SenderUID === currentProfile.uid
    ));
    if (!latestOwn) return;
    const createdAt = timestampToMillis(latestOwn.CreatedAt);
    const seenNames = readReceipts
      .filter((receipt) => receipt.uid !== currentProfile.uid && timestampToMillis(receipt.LastSeenAt) >= createdAt)
      .map((receipt) => receipt.Name || "Classmate");
    const node = elements.messages.querySelector(`[data-seen-message="${cssEscape(latestOwn.id)}"]`);
    if (!node || !seenNames.length) return;
    node.textContent = seenNames.length <= 2
      ? `Seen by ${seenNames.join(" and ")}`
      : `Seen by ${seenNames.length}`;
  }

  function updateJumpButton() {
    if (elements.room.hidden) {
      elements.jumpUnread.hidden = true;
      return;
    }
    elements.jumpUnread.hidden = isNearBottom();
  }

  function jumpToUnread() {
    const divider = elements.messages.querySelector(".classChatNewDivider");
    if (divider) divider.scrollIntoView({ behavior: "smooth", block: "center" });
    else scrollToBottom();
    window.setTimeout(updateJumpButton, 450);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function verifyQuotedMessages() {
    const quotedItems = Array.from(elements.messages.querySelectorAll("[data-quoted-message-id]"));
    const missingIds = [...new Set(quotedItems
      .map((node) => node.dataset.quotedMessageId)
      .filter((id) => id && !findMessage(id)))];

    await Promise.all(missingIds.map(async (messageId) => {
      try {
        const snapshot = await db.collection("chatMessages").doc(messageId).get();
        if (!snapshot.exists || snapshot.data()?.Removed === true) {
          elements.messages
            .querySelectorAll(`[data-quoted-message-id="${cssEscape(messageId)}"]`)
            .forEach((node) => node.remove());
        }
      } catch (error) {
        elements.messages
          .querySelectorAll(`[data-quoted-message-id="${cssEscape(messageId)}"]`)
          .forEach((node) => node.remove());
      }
    }));
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = elements.input.value.trim();
    if (!text || !currentProfile) return;

    if (currentProfile.mutedUntil > Date.now()) {
      window.alert(`Messaging is muted until ${new Date(currentProfile.mutedUntil).toLocaleString()}.`);
      return;
    }
    if (isChatRestrictedForUser()) {
      window.alert(currentConfig.Locked
        ? "The Adviser has temporarily locked the class conversation."
        : "Chat messaging is currently outside the allowed hours.");
      return;
    }
    const blockedReason = validateOutboundText(text);
    if (blockedReason) {
      window.alert(blockedReason);
      return;
    }
    const slowModeMs = Number(currentConfig.SlowModeSeconds || 0) * 1000;
    const waitMs = slowModeMs - (Date.now() - lastSentAt);
    if (!editTarget && currentProfile.role !== "admin" && waitMs > 0) {
      window.alert(`Slow mode is on. Please wait ${Math.ceil(waitMs / 1000)} more second${waitMs > 1000 ? "s" : ""}.`);
      return;
    }

    elements.send.disabled = true;
    try {
      if (editTarget) {
        await db.collection("chatMessages").doc(editTarget.id).update({
          Text: text,
          Edited: true,
          EditedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        elements.input.value = "";
        resizeComposer();
        clearReply();
        return;
      }

      const payload = {
        Text: text,
        SenderUID: currentProfile.uid,
        SenderName: currentProfile.name,
        SenderRole: currentProfile.role,
        Removed: false,
        CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (replyTarget) {
        payload.ReplyToID = replyTarget.id;
        payload.ReplyToName = replyTarget.SenderName || "Message";
        payload.ReplyToText = String(replyTarget.Text || "").slice(0, 100);
      }

      await createChatMessage(payload);
      lastSentAt = Date.now();
      recordSentText(text);
      elements.input.value = "";
      resizeComposer();
      clearReply();
      clearDraft();
      await clearTyping();
      scrollToBottom();
    } catch (error) {
      window.alert(readableError(error));
    } finally {
      elements.send.disabled = false;
      elements.input.focus();
    }
  }

  function validateOutboundText(text) {
    if (currentProfile?.role === "admin") return "";
    const normalized = String(text || "").trim().toLowerCase();
    if (currentConfig.KeywordFilterEnabled) {
      const blocked = (currentConfig.BlockedKeywords || []).find((keyword) => (
        keyword && keywordMatches(normalized, String(keyword).toLowerCase())
      ));
      if (blocked) return "This message contains a word blocked by the Adviser.";
    }
    if (currentConfig.SpamProtection) {
      const now = Date.now();
      recentSentTimes = recentSentTimes.filter((time) => now - time < 10000);
      if (recentSentTimes.length >= 4) return "Spam protection is on. Please wait before sending again.";
      if (normalized && normalized === lastSentText && now - lastSentTextAt < 30000) {
        return "Duplicate message blocked. Please avoid sending the same message repeatedly.";
      }
    }
    return "";
  }

  function keywordMatches(text, keyword) {
    if (!keyword) return false;
    if (keyword.includes(" ")) return text.includes(keyword);
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}($|[^a-z0-9])`, "i").test(text);
  }

  function recordSentText(text) {
    const now = Date.now();
    recentSentTimes.push(now);
    lastSentText = String(text || "").trim().toLowerCase();
    lastSentTextAt = now;
  }

  async function createChatMessage(payload) {
    const messageRef = db.collection("chatMessages").doc();
    const metaRef = db.collection("chatMeta").doc("main");
    const batch = db.batch();
    batch.set(messageRef, payload);
    batch.set(metaRef, {
      TotalMessages: firebase.firestore.FieldValue.increment(1),
      LatestAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    return messageRef.id;
  }

  function handleComposerInput() {
    resizeComposer();
    scheduleTyping();
    saveDraft();
    renderMentionSuggestions();
  }

  function renderMentionSuggestions() {
    const cursor = elements.input.selectionStart ?? elements.input.value.length;
    const beforeCursor = elements.input.value.slice(0, cursor);
    const match = beforeCursor.match(/@([^@\n]*)$/);
    if (!match) {
      elements.mentionSuggestions.hidden = true;
      return;
    }
    const query = match[1].trim().toLowerCase();
    if (match[1].endsWith(" ") && chatDirectory.some((entry) => String(entry.Name || "").toLowerCase() === query)) {
      elements.mentionSuggestions.hidden = true;
      return;
    }
    const suggestions = chatDirectory
      .filter((entry) => entry.uid !== currentProfile.uid && entry.Name !== currentProfile.name)
      .filter((entry) => !query || String(entry.Name || "").toLowerCase().includes(query))
      .slice(0, 8);
    if (!suggestions.length) {
      elements.mentionSuggestions.hidden = true;
      return;
    }
    elements.mentionSuggestions.innerHTML = suggestions.map((entry) => `
      <button type="button" data-mention-name="${escapeHtml(entry.Name || "")}">
        <span class="classChatMessageAvatar" style="visibility:visible">${escapeHtml(initials(entry.Name))}</span>
        <span>${escapeHtml(entry.Name || "Student")}</span>
      </button>`).join("");
    elements.mentionSuggestions.hidden = false;
    elements.mentionSuggestions.querySelectorAll("[data-mention-name]").forEach((button) => {
      button.addEventListener("click", () => insertMention(button.dataset.mentionName, match.index, cursor));
    });
  }

  function insertMention(name, start, end) {
    elements.input.setRangeText(`@${name} `, start, end, "end");
    elements.mentionSuggestions.hidden = true;
    elements.input.focus();
    handleComposerInput();
  }

  function draftKey() {
    return `${CHAT_DRAFT_PREFIX}${currentProfile?.uid || "guest"}`;
  }

  function saveDraft() {
    if (!currentProfile || editTarget) return;
    try {
      const value = elements.input.value;
      if (value) localStorage.setItem(draftKey(), value);
      else localStorage.removeItem(draftKey());
    } catch (error) {
      // Draft saving is optional when browser storage is blocked.
    }
  }

  function restoreDraft() {
    try {
      const draft = localStorage.getItem(draftKey()) || "";
      if (draft && !elements.input.value) {
        elements.input.value = draft;
        resizeComposer();
      }
    } catch (error) {
      // Draft saving is optional when browser storage is blocked.
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey());
    } catch (error) {
      // Draft saving is optional when browser storage is blocked.
    }
  }

  function resizeComposer() {
    elements.input.style.height = "auto";
    elements.input.style.height = `${Math.min(elements.input.scrollHeight, 112)}px`;
  }

  function scheduleTyping() {
    if (!currentProfile || !elements.input.value.trim()) {
      clearTyping();
      return;
    }

    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(async () => {
      const expiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + 7000);
      await db.collection("chatTyping").doc(currentProfile.uid).set({
        UID: currentProfile.uid,
        Name: currentProfile.name,
        ExpiresAt: expiresAt
      }).catch(() => {});
    }, 280);

    window.clearTimeout(typingClearTimer);
    typingClearTimer = window.setTimeout(clearTyping, 6500);
  }

  async function clearTyping() {
    window.clearTimeout(typingTimer);
    window.clearTimeout(typingClearTimer);
    if (db && currentProfile?.uid) {
      await db.collection("chatTyping").doc(currentProfile.uid).delete().catch(() => {});
    }
  }

  function handleMessageClick(event) {
    const quoted = event.target.closest("[data-quoted-message-id]");
    if (quoted) {
      focusOriginalMessage(quoted.dataset.quotedMessageId);
      return;
    }

    const pollOption = event.target.closest("[data-poll-option]");
    if (pollOption) {
      const pollCard = pollOption.closest("[data-poll-id]");
      voteInPoll(pollCard?.dataset.pollId, Number(pollOption.dataset.pollOption));
      return;
    }

    const button = event.target.closest("[data-chat-action]");
    if (!button) return;
    const message = findMessage(button.dataset.messageId);
    if (!message) return;

    if (button.dataset.chatAction === "reply") setReply(message);
    if (button.dataset.chatAction === "react") showReactionTray(message.id, button);
    if (button.dataset.chatAction === "edit") setEdit(message);
    if (button.dataset.chatAction === "save") toggleSavedMessage(message);
    if (button.dataset.chatAction === "pin") togglePinnedMessage(message);
    if (button.dataset.chatAction === "priority") togglePriorityMessage(message);
    if (button.dataset.chatAction === "close-poll") closePoll(message);
    if (button.dataset.chatAction === "report") reportMessage(message);
    if (button.dataset.chatAction === "delete") removeMessage(message);
  }

  function focusOriginalMessage(messageId) {
    const original = elements.messages.querySelector(`.classChatMessage[data-message-id="${cssEscape(messageId)}"]`);
    if (!original) return;
    original.scrollIntoView({ behavior: "smooth", block: "center" });
    original.classList.remove("is-highlighted");
    window.requestAnimationFrame(() => original.classList.add("is-highlighted"));
    window.setTimeout(() => original.classList.remove("is-highlighted"), 1100);
  }

  function handleMessageDoubleClick(event) {
    const article = event.target.closest(".classChatMessage");
    if (!article || event.target.closest("button, a, iframe, video, audio")) return;
    if (Date.now() - lastTouchDoubleAt < 650) return;
    showQuickHeart(article);
    reactToMessage(article.dataset.messageId, "🫶");
  }

  function startLongPress(event) {
    if (event.target.closest("button, a, iframe, video, audio")) return;
    const article = event.target.closest(".classChatMessage");
    if (!article) return;
    messageGesture = {
      article,
      messageId: article.dataset.messageId,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      translated: false,
      longPressed: false
    };
    if (event.pointerType === "mouse") return;
    window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      if (!messageGesture || messageGesture.messageId !== article.dataset.messageId) return;
      messageGesture.longPressed = true;
      showReactionTray(article.dataset.messageId, article.querySelector(".classChatBubble"));
      navigator.vibrate?.(24);
    }, 440);
  }

  function moveMessageGesture(event) {
    if (!messageGesture || messageGesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - messageGesture.startX;
    const dy = event.clientY - messageGesture.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) window.clearTimeout(longPressTimer);
    if (messageGesture.pointerType === "mouse" || Math.abs(dx) <= Math.abs(dy)) return;

    const message = findMessage(messageGesture.messageId);
    if (!message || message.Removed) return;
    const own = message.SenderUID === currentProfile.uid;
    const direction = own ? -1 : 1;
    const distance = Math.min(54, Math.max(0, dx * direction));
    if (!distance) return;

    event.preventDefault();
    messageGesture.translated = true;
    messageGesture.article.style.setProperty("--chat-swipe", `${distance * direction}px`);
    messageGesture.article.classList.toggle("is-reply-ready", distance >= 46);
  }

  function finishMessageGesture(event) {
    window.clearTimeout(longPressTimer);
    if (!messageGesture || messageGesture.pointerId !== event.pointerId) return;
    const gesture = messageGesture;
    messageGesture = null;
    const shouldReply = gesture.article.classList.contains("is-reply-ready");
    resetGestureArticle(gesture.article);
    if (shouldReply) {
      const message = findMessage(gesture.messageId);
      if (message && !message.Removed) {
        setReply(message);
        navigator.vibrate?.(18);
      }
      return;
    }

    if (gesture.pointerType !== "mouse" && !gesture.translated && !gesture.longPressed) {
      handleTouchTap(gesture);
    }
  }

  function handleTouchTap(gesture) {
    const now = Date.now();
    const isDoubleTap = lastTouchTap.messageId === gesture.messageId
      && now - lastTouchTap.time <= 320;

    if (!isDoubleTap) {
      lastTouchTap = { messageId: gesture.messageId, time: now };
      return;
    }

    lastTouchTap = { messageId: "", time: 0 };
    lastTouchDoubleAt = now;
    const message = findMessage(gesture.messageId);
    if (!message || message.Removed) return;
    showQuickHeart(gesture.article);
    reactToMessage(gesture.messageId, "🫶");
    navigator.vibrate?.([18, 22, 18]);
  }

  function cancelMessageGesture() {
    window.clearTimeout(longPressTimer);
    if (messageGesture?.article) resetGestureArticle(messageGesture.article);
    messageGesture = null;
  }

  function resetGestureArticle(article) {
    article.classList.remove("is-reply-ready");
    article.style.removeProperty("--chat-swipe");
  }

  function setReply(message) {
    if (message.Removed) return;
    editTarget = null;
    replyTarget = message;
    elements.replyName.textContent = `Replying to ${message.SenderName || "Message"}`;
    elements.replyText.textContent = message.Text || "";
    elements.reply.hidden = false;
    elements.input.focus();
  }

  function clearReply() {
    const wasEditing = Boolean(editTarget);
    replyTarget = null;
    editTarget = null;
    elements.reply.hidden = true;
    if (wasEditing) {
      elements.input.value = draftBeforeEdit;
      draftBeforeEdit = "";
      resizeComposer();
      saveDraft();
    }
  }

  function setEdit(message) {
    if (!message || message.Removed || message.Type === "poll") return;
    replyTarget = null;
    editTarget = message;
    draftBeforeEdit = elements.input.value;
    elements.replyName.textContent = "Editing message";
    elements.replyText.textContent = message.Text || "";
    elements.reply.hidden = false;
    elements.input.value = message.Text || "";
    resizeComposer();
    elements.input.focus();
    elements.input.setSelectionRange(elements.input.value.length, elements.input.value.length);
  }

  function showReactionTray(messageId, anchor) {
    const message = findMessage(messageId);
    if (!message || message.Removed) return;
    reactionMessageId = messageId;
    const own = message.SenderUID === currentProfile.uid;
    const canDeleteOwn = own && Date.now() - timestampToMillis(message.CreatedAt) <= OWN_DELETE_WINDOW_MS;
    const canEditOwn = own
      && message.Type !== "poll"
      && Date.now() - timestampToMillis(message.CreatedAt) <= OWN_DELETE_WINDOW_MS;
    const canRemove = currentProfile.role === "admin" || canDeleteOwn;
    elements.reactionTray.innerHTML = `
      <div class="classChatReactionChoices">
        ${REACTIONS.map((emoji) => (
          `<button type="button" data-chat-emoji="${emoji}" aria-label="React ${emoji}">${emoji}</button>`
        )).join("")}
      </div>
      <div class="classChatTrayActions">
        <button type="button" data-chat-tray-action="reply"><span aria-hidden="true">&#8617;</span> Reply</button>
        <button type="button" data-chat-tray-action="save"><span aria-hidden="true">&#9734;</span> ${savedMessageIds.has(message.id) ? "Unsave" : "Save"}</button>
        ${canEditOwn ? `<button type="button" data-chat-tray-action="edit"><span aria-hidden="true">&#9998;</span> Edit</button>` : ""}
        ${currentProfile.role === "admin" ? `<button type="button" data-chat-tray-action="pin"><span aria-hidden="true">&#128204;</span> ${message.Pinned ? "Unpin" : "Pin"}</button>` : ""}
        ${currentProfile.role === "admin" ? `<button type="button" data-chat-tray-action="priority"><span aria-hidden="true">&#9733;</span> ${message.Priority ? "Normal" : "Priority"}</button>` : ""}
        ${currentProfile.role === "admin" && !own && message.SenderRole === "student" ? `<button type="button" data-chat-tray-action="mute"><span aria-hidden="true">&#128263;</span> Mute 10m</button>` : ""}
        ${message.Type === "poll" && (own || currentProfile.role === "admin") && !message.PollClosed ? `<button type="button" data-chat-tray-action="close-poll"><span aria-hidden="true">&#9632;</span> Close poll</button>` : ""}
        ${!own ? `<button type="button" data-chat-tray-action="report"><span aria-hidden="true">&#9873;</span> Report</button>` : ""}
        ${canRemove ? `<button type="button" data-chat-tray-action="delete"><span aria-hidden="true">&#9003;</span> Remove</button>` : ""}
      </div>`;

    elements.reactionTray.querySelectorAll("[data-chat-emoji]").forEach((button) => {
      button.addEventListener("click", () => reactToMessage(messageId, button.dataset.chatEmoji));
    });
    elements.reactionTray.querySelectorAll("[data-chat-tray-action]").forEach((button) => {
      button.addEventListener("click", () => {
        hideReactionTray();
        if (button.dataset.chatTrayAction === "reply") setReply(message);
        if (button.dataset.chatTrayAction === "save") toggleSavedMessage(message);
        if (button.dataset.chatTrayAction === "edit") setEdit(message);
        if (button.dataset.chatTrayAction === "pin") togglePinnedMessage(message);
        if (button.dataset.chatTrayAction === "priority") togglePriorityMessage(message);
        if (button.dataset.chatTrayAction === "mute") muteMessageSender(message);
        if (button.dataset.chatTrayAction === "close-poll") closePoll(message);
        if (button.dataset.chatTrayAction === "report") reportMessage(message);
        if (button.dataset.chatTrayAction === "delete") removeMessage(message);
      });
    });

    elements.reactionTray.hidden = false;
    const panelRect = elements.layer.querySelector(".classChatPanel").getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const trayWidth = Math.min(360, panelRect.width - 24);
    const left = Math.max(12, Math.min(anchorRect.left - panelRect.left, panelRect.width - trayWidth - 12));
    const top = Math.max(74, anchorRect.top - panelRect.top - 112);
    elements.reactionTray.style.left = `${left}px`;
    elements.reactionTray.style.top = `${top}px`;
  }

  function hideReactionTray() {
    reactionMessageId = "";
    elements.reactionTray.hidden = true;
  }

  function showQuickHeart(article) {
    const bubble = article.querySelector(".classChatBubble");
    if (!bubble) return;
    const heart = document.createElement("span");
    heart.className = "classChatQuickHeart";
    heart.textContent = "🫶";
    bubble.appendChild(heart);
    window.setTimeout(() => heart.remove(), 620);
  }

  function handleOutsideReactionTray(event) {
    if (elements.reactionTray.hidden) return;
    if (!elements.reactionTray.contains(event.target) && !event.target.closest("[data-chat-action='react']")) {
      hideReactionTray();
    }
  }

  async function reactToMessage(messageId, emoji) {
    if (!REACTIONS.includes(emoji) || !currentProfile) return;
    hideReactionTray();

    const ref = db.collection("chatMessages").doc(messageId).collection("reactions").doc(currentProfile.uid);
    try {
      const existing = await ref.get();
      if (existing.exists && existing.data()?.Emoji === emoji) {
        await ref.delete();
      } else {
        await ref.set({
          Emoji: emoji,
          UID: currentProfile.uid,
          Name: currentProfile.name,
          UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      await loadReactions(messageId);
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function loadReactions(messageId) {
    const container = elements.messages.querySelector(`[data-reactions-for="${cssEscape(messageId)}"]`);
    if (!container || !db) return;

    try {
      const snapshot = await db.collection("chatMessages").doc(messageId).collection("reactions").get();
      const groups = new Map();
      snapshot.docs.forEach((doc) => {
        const reaction = doc.data() || {};
        if (!REACTIONS.includes(reaction.Emoji)) return;
        if (!groups.has(reaction.Emoji)) groups.set(reaction.Emoji, []);
        groups.get(reaction.Emoji).push({ uid: doc.id, name: reaction.Name || "Classmate" });
      });

      container.innerHTML = Array.from(groups.entries()).map(([emoji, users]) => {
        const mine = users.some((user) => user.uid === currentProfile.uid);
        const names = users.map((user) => user.name).join(", ");
        return `<button type="button" class="classChatReactionChip ${mine ? "is-mine" : ""}"
                  data-existing-reaction="${emoji}" data-message-id="${messageId}"
                  title="${escapeHtml(names)}">${emoji} ${users.length}</button>`;
      }).join("");
      container.closest(".classChatMessage")?.classList.toggle("has-reactions", groups.size > 0);

      container.querySelectorAll("[data-existing-reaction]").forEach((button) => {
        button.addEventListener("click", () => {
          reactToMessage(button.dataset.messageId, button.dataset.existingReaction);
        });
      });
    } catch (error) {
      container.innerHTML = "";
      container.closest(".classChatMessage")?.classList.remove("has-reactions");
    }
  }

  async function togglePinnedMessage(message) {
    if (currentProfile.role !== "admin" || !message || message.Removed) return;
    try {
      const pinnedSnapshot = await db.collection("chatMessages").where("Pinned", "==", true).get();
      const batch = db.batch();
      pinnedSnapshot.docs.forEach((doc) => {
        if (doc.id !== message.id) {
          batch.update(doc.ref, {
            Pinned: false,
            PinnedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });
      batch.update(db.collection("chatMessages").doc(message.id), {
        Pinned: message.Pinned !== true,
        PinnedBy: currentProfile.uid,
        PinnedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function togglePriorityMessage(message) {
    if (currentProfile.role !== "admin" || !message || message.IsScheduled) return;
    try {
      await db.collection("chatMessages").doc(message.id).update({
        Priority: message.Priority !== true,
        PriorityAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function toggleSavedMessage(message) {
    if (!message || message.IsScheduled) return;
    const ref = db.collection("chatSaved").doc(currentProfile.uid).collection("items").doc(message.id);
    const wasSaved = savedMessageIds.has(message.id);
    if (wasSaved) savedMessageIds.delete(message.id);
    else savedMessageIds.add(message.id);
    updateSaveButtons(message.id, !wasSaved);
    try {
      if (wasSaved) {
        await ref.delete();
        showChatToast("Removed from Saved messages");
      } else {
        await ref.set({
          MessageID: message.id,
          Text: message.Text || "",
          SenderName: message.SenderName || "",
          MessageCreatedAt: message.CreatedAt || firebase.firestore.Timestamp.now(),
          SavedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showChatToast("Saved. Open ⋯ → Saved messages");
      }
    } catch (error) {
      if (wasSaved) savedMessageIds.add(message.id);
      else savedMessageIds.delete(message.id);
      updateSaveButtons(message.id, wasSaved);
      window.alert(readableError(error));
    }
  }

  function updateSaveButtons(messageId, saved) {
    const article = elements.messages.querySelector(`.classChatMessage[data-message-id="${cssEscape(messageId)}"]`);
    article?.querySelectorAll("[data-chat-action='save']").forEach((button) => {
      button.textContent = saved ? "Unsave" : "Save";
    });
  }

  function showChatToast(message) {
    window.clearTimeout(chatToastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    chatToastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2400);
  }

  function renderSavedMessages() {
    if (!savedItems.length) {
      elements.savedResults.innerHTML = `<p class="classChatUtilityHint">No saved messages yet.</p>`;
      return;
    }
    elements.savedResults.innerHTML = savedItems.map((item) => `
      <button type="button" class="classChatSearchResult" data-saved-message="${item.MessageID || item.id}">
        <strong>${escapeHtml(item.SenderName || "Classmate")}</strong>
        <span>${escapeHtml(item.Text || "")}</span>
        <small>${escapeHtml(formatDayLabel(timestampToDate(item.MessageCreatedAt)))}</small>
      </button>`).join("");
    elements.savedResults.querySelectorAll("[data-saved-message]").forEach((button) => {
      button.addEventListener("click", () => openSearchResult(button.dataset.savedMessage));
    });
  }

  async function reportMessage(message) {
    if (!message || message.IsScheduled || message.SenderUID === currentProfile.uid) return;
    const reason = window.prompt("Why are you reporting this message? You may leave this blank.");
    if (reason === null) return;
    try {
      await db.collection("chatReports").add({
        MessageID: message.id,
        MessageText: message.Text || "",
        SenderUID: message.SenderUID || "",
        SenderName: message.SenderName || "",
        ReporterUID: currentProfile.uid,
        ReporterName: currentProfile.name,
        Reason: String(reason || "").trim(),
        Status: "OPEN",
        CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      window.alert("The message was privately reported to the Adviser.");
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function loadReportedMessages() {
    elements.reportsResults.innerHTML = `<p class="classChatUtilityHint">Loading reports...</p>`;
    try {
      const snapshot = await db.collection("chatReports").orderBy("CreatedAt", "desc").limit(100).get();
      if (snapshot.empty) {
        elements.reportsResults.innerHTML = `<p class="classChatUtilityHint">No reported messages.</p>`;
        return;
      }
      elements.reportsResults.innerHTML = snapshot.docs.map((doc) => {
        const report = doc.data() || {};
        return `
          <div class="classChatSearchResult">
            <strong>${escapeHtml(report.SenderName || "Student")} · ${escapeHtml(report.Status || "OPEN")}</strong>
            <span>${escapeHtml(report.MessageText || "Message unavailable")}</span>
            <small>Reported by ${escapeHtml(report.ReporterName || "Class member")}${report.Reason ? ` · ${escapeHtml(report.Reason)}` : ""}</small>
            ${report.Status !== "RESOLVED" ? `<button type="button" data-resolve-report="${doc.id}">Mark resolved</button>` : ""}
          </div>`;
      }).join("");
      elements.reportsResults.querySelectorAll("[data-resolve-report]").forEach((button) => {
        button.addEventListener("click", async () => {
          await db.collection("chatReports").doc(button.dataset.resolveReport).update({
            Status: "RESOLVED",
            ResolvedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          loadReportedMessages();
        });
      });
    } catch (error) {
      elements.reportsResults.innerHTML = `<p class="classChatUtilityHint">${escapeHtml(readableError(error))}</p>`;
    }
  }

  async function closePoll(message) {
    if (!message || message.Type !== "poll" || (message.SenderUID !== currentProfile.uid && currentProfile.role !== "admin")) return;
    if (!window.confirm("Close this poll? Voting will stop.")) return;
    try {
      await db.collection("chatMessages").doc(message.id).update({
        PollClosed: true,
        PollClosedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function muteMessageSender(message) {
    if (currentProfile.role !== "admin" || message.SenderRole !== "student") return;
    if (!window.confirm(`Mute ${message.SenderName || "this student"} for 10 minutes?`)) return;
    try {
      await db.collection("chatProfiles").doc(message.SenderUID).update({
        MutedUntil: firebase.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
        UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function saveChatControls(event) {
    event.preventDefault();
    if (currentProfile.role !== "admin") return;
    const button = elements.controlsForm.querySelector("button[type='submit']");
    button.disabled = true;
    elements.controlsMessage.textContent = "Saving controls...";
    try {
      await db.collection("chatConfig").doc("main").set({
        Locked: elements.lockToggle.checked,
        SlowModeSeconds: Number(elements.slowMode.value || 0),
        ChatHoursEnabled: elements.hoursToggle.checked,
        ChatHoursStart: elements.hoursStart.value || "06:00",
        ChatHoursEnd: elements.hoursEnd.value || "21:00",
        SpamProtection: elements.spamToggle.checked,
        KeywordFilterEnabled: elements.keywordToggle.checked,
        ClickableLinksEnabled: elements.linksToggle.checked,
        AllowMedia: elements.mediaToggle.checked,
        BlockedKeywords: String(elements.blockedKeywords.value || "")
          .split(/[,\n]/)
          .map((word) => word.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 100),
        UpdatedBy: currentProfile.uid,
        UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      elements.controlsMessage.textContent = "Chat controls saved.";
    } catch (error) {
      elements.controlsMessage.textContent = readableError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function createQuickPoll(event) {
    event.preventDefault();
    if (!currentProfile) return;
    if (isChatRestrictedForUser()) {
      elements.pollMessage.textContent = currentConfig.Locked
        ? "The Adviser has locked the conversation."
        : "Poll posting is outside the allowed chat hours.";
      return;
    }

    const question = elements.pollQuestion.value.trim();
    const options = Array.from(elements.pollOptionsEditor.querySelectorAll(".classChatPollOptionInput"))
      .map((input) => input.value.trim())
      .filter(Boolean);
    if (!question || options.length < 2) {
      elements.pollMessage.textContent = "Enter a question and at least two choices.";
      return;
    }
    const blockedReason = validateOutboundText(`${question} ${options.join(" ")}`);
    if (blockedReason) {
      elements.pollMessage.textContent = blockedReason;
      return;
    }
    const deadlineDate = elements.pollDeadline.value ? new Date(elements.pollDeadline.value) : null;
    if (deadlineDate && deadlineDate.getTime() <= Date.now()) {
      elements.pollMessage.textContent = "Choose a future voting deadline.";
      return;
    }

    const button = elements.pollForm.querySelector("button[type='submit']");
    button.disabled = true;
    elements.pollMessage.textContent = "Posting poll...";
    try {
      const payload = {
        Type: "poll",
        Text: question,
        PollOptions: options,
        PollMultiple: elements.pollMultiple.checked,
        PollAnonymous: elements.pollAnonymous.checked,
        PollClosed: false,
        SenderUID: currentProfile.uid,
        SenderName: currentProfile.name,
        SenderRole: currentProfile.role,
        Removed: false,
        CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (deadlineDate) payload.PollEndsAt = firebase.firestore.Timestamp.fromDate(deadlineDate);
      await createChatMessage(payload);
      elements.pollForm.reset();
      resetPollOptionsEditor();
      closeUtility();
      lastSentAt = Date.now();
      recordSentText(question);
      scrollToBottom();
    } catch (error) {
      elements.pollMessage.textContent = readableError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function scheduleChatMessage(event) {
    event.preventDefault();
    if (currentProfile.role !== "admin") return;
    const text = elements.scheduleText.value.trim();
    const publishAt = new Date(elements.scheduleAt.value);
    if (!text || !Number.isFinite(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
      elements.scheduleMessage.textContent = "Enter a message and a future publish date/time.";
      return;
    }
    const button = elements.scheduleForm.querySelector("button[type='submit']");
    button.disabled = true;
    elements.scheduleMessage.textContent = "Scheduling message...";
    try {
      await db.collection("chatScheduled").add({
        Text: text,
        PublishAt: firebase.firestore.Timestamp.fromDate(publishAt),
        SenderUID: currentProfile.uid,
        SenderName: currentProfile.name,
        SenderRole: "admin",
        Priority: true,
        CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      elements.scheduleForm.reset();
      elements.scheduleMessage.textContent = "Message scheduled.";
    } catch (error) {
      elements.scheduleMessage.textContent = readableError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function sendMediaMessage(event) {
    event.preventDefault();
    if (!currentProfile || currentConfig.AllowMedia === false) return;
    if (isChatRestrictedForUser()) {
      elements.mediaMessage.textContent = currentConfig.Locked
        ? "The Adviser has locked the conversation."
        : "Media posting is outside the allowed chat hours.";
      return;
    }

    const url = safeHttpUrl(elements.mediaUrl.value);
    const caption = elements.mediaCaption.value.trim();
    let mediaType = elements.mediaType.value;
    if (!url) {
      elements.mediaMessage.textContent = "Enter a valid http or https media link.";
      return;
    }
    if (mediaType === "auto") mediaType = detectMediaType(url);
    if (!mediaType) {
      elements.mediaMessage.textContent = "Media type could not be detected. Select Image, Video, Audio, or YouTube.";
      return;
    }
    if (mediaType === "youtube" && !youtubeVideoId(url)) {
      elements.mediaMessage.textContent = "Enter a valid YouTube video link.";
      return;
    }

    const blockedReason = validateOutboundText(`${caption} ${url}`);
    if (blockedReason) {
      elements.mediaMessage.textContent = blockedReason;
      return;
    }

    const button = elements.mediaForm.querySelector("button[type='submit']");
    button.disabled = true;
    elements.mediaMessage.textContent = "Sending media...";
    try {
      await createChatMessage({
        Text: caption || `Shared ${mediaType === "youtube" ? "YouTube video" : mediaType}`,
        MediaURL: url,
        MediaType: mediaType,
        SenderUID: currentProfile.uid,
        SenderName: currentProfile.name,
        SenderRole: currentProfile.role,
        Removed: false,
        CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      recordSentText(`${caption} ${url}`);
      elements.mediaForm.reset();
      closeUtility();
      scrollToBottom();
    } catch (error) {
      elements.mediaMessage.textContent = readableError(error);
    } finally {
      button.disabled = false;
    }
  }

  function detectMediaType(value) {
    if (youtubeVideoId(value)) return "youtube";
    try {
      const pathname = new URL(value).pathname.toLowerCase();
      if (/\.(jpg|jpeg|png|webp|gif|avif|svg)$/.test(pathname)) return "image";
      if (/\.(mp4|webm|mov|m4v|ogv)$/.test(pathname)) return "video";
      if (/\.(mp3|wav|m4a|aac|oga|ogg|opus)$/.test(pathname)) return "audio";
    } catch (error) {
      return "";
    }
    return "";
  }

  function addPollOption() {
    const currentCount = elements.pollOptionsEditor.querySelectorAll(".classChatPollOptionRow").length;
    if (currentCount >= MAX_POLL_OPTIONS) return;
    const row = document.createElement("div");
    row.className = "classChatPollOptionRow";
    row.innerHTML = `
      <input class="classChatPollOptionInput" type="text" maxlength="80" placeholder="Choice ${currentCount + 1} (optional)" />
      <button type="button" data-remove-poll-option aria-label="Remove choice">&times;</button>`;
    elements.pollOptionsEditor.appendChild(row);
    refreshPollOptionRows();
    row.querySelector("input").focus();
  }

  function handlePollOptionEditorClick(event) {
    const button = event.target.closest("[data-remove-poll-option]");
    if (!button) return;
    button.closest(".classChatPollOptionRow")?.remove();
    refreshPollOptionRows();
  }

  function refreshPollOptionRows() {
    const rows = Array.from(elements.pollOptionsEditor.querySelectorAll(".classChatPollOptionRow"));
    rows.forEach((row, index) => {
      const input = row.querySelector("input");
      input.required = index < 2;
      input.placeholder = `Choice ${index + 1}${index < 2 ? "" : " (optional)"}`;
    });
    elements.addPollOption.disabled = rows.length >= MAX_POLL_OPTIONS;
    elements.addPollOption.textContent = rows.length >= MAX_POLL_OPTIONS
      ? "Maximum 12 choices"
      : "+ Add choice";
  }

  function resetPollOptionsEditor() {
    elements.pollOptionsEditor.innerHTML = `
      <div class="classChatPollOptionRow">
        <input class="classChatPollOptionInput" type="text" maxlength="80" placeholder="Choice 1" required />
      </div>
      <div class="classChatPollOptionRow">
        <input class="classChatPollOptionInput" type="text" maxlength="80" placeholder="Choice 2" required />
      </div>
      <div class="classChatPollOptionRow">
        <input class="classChatPollOptionInput" type="text" maxlength="80" placeholder="Choice 3 (optional)" />
        <button type="button" data-remove-poll-option aria-label="Remove choice">&times;</button>
      </div>
      <div class="classChatPollOptionRow">
        <input class="classChatPollOptionInput" type="text" maxlength="80" placeholder="Choice 4 (optional)" />
        <button type="button" data-remove-poll-option aria-label="Remove choice">&times;</button>
      </div>`;
    refreshPollOptionRows();
  }

  function toLocalDateTimeInput(date) {
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  async function voteInPoll(messageId, optionIndex) {
    const message = findMessage(messageId);
    if (!message || message.Removed || message.Type !== "poll") return;
    const options = Array.isArray(message.PollOptions) ? message.PollOptions : [];
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) return;
    if (message.PollClosed === true || (timestampToMillis(message.PollEndsAt) > 0 && timestampToMillis(message.PollEndsAt) <= Date.now())) return;

    try {
      const ref = db.collection("chatMessages").doc(messageId).collection("votes").doc(currentProfile.uid);
      const existing = await ref.get();
      const oldIndexes = existing.exists
        ? (Array.isArray(existing.data()?.OptionIndexes)
          ? existing.data().OptionIndexes
          : [existing.data()?.OptionIndex].filter(Number.isInteger))
        : [];
      const optionIndexes = message.PollMultiple
        ? (oldIndexes.includes(optionIndex)
          ? oldIndexes.filter((index) => index !== optionIndex)
          : oldIndexes.concat(optionIndex))
        : [optionIndex];
      if (!optionIndexes.length) {
        await ref.delete();
        return;
      }
      await ref.set({
        UID: currentProfile.uid,
        Name: currentProfile.name,
        OptionIndexes: optionIndexes,
        UpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  function loadPollVotes(message) {
    const unsubscribe = db.collection("chatMessages").doc(message.id).collection("votes").onSnapshot((snapshot) => {
      const card = elements.messages.querySelector(`[data-poll-id="${cssEscape(message.id)}"]`);
      if (!card) return;
      const options = Array.isArray(message.PollOptions) ? message.PollOptions : [];
      const counts = options.map(() => 0);
      const voterNames = options.map(() => []);
      let selectedIndex = -1;
      snapshot.docs.forEach((doc) => {
        const vote = doc.data() || {};
        const indexes = Array.isArray(vote.OptionIndexes)
          ? vote.OptionIndexes
          : [vote.OptionIndex].filter(Number.isInteger);
        indexes.forEach((index) => {
          if (counts[index] !== undefined) {
            counts[index] += 1;
            voterNames[index].push(vote.Name || "Classmate");
          }
        });
        if (doc.id === currentProfile.uid) selectedIndex = indexes;
      });
      const total = counts.reduce((sum, count) => sum + count, 0);
      const closed = message.PollClosed === true
        || (timestampToMillis(message.PollEndsAt) > 0 && timestampToMillis(message.PollEndsAt) <= Date.now());
      card.querySelectorAll("[data-poll-option]").forEach((button) => {
        const index = Number(button.dataset.pollOption);
        const percent = total ? Math.round((counts[index] / total) * 100) : 0;
        button.style.setProperty("--poll-percent", `${percent}%`);
        button.classList.toggle("is-selected", Array.isArray(selectedIndex) && selectedIndex.includes(index));
        button.querySelector("em").textContent = `${percent}%`;
        const names = button.querySelector("[data-poll-voters]");
        names.hidden = message.PollAnonymous === true || !voterNames[index].length;
        names.textContent = message.PollAnonymous === true ? "" : voterNames[index].join(", ");
      });
      card.querySelector("[data-poll-total]").textContent = total
        ? `${total} vote${total === 1 ? "" : "s"}${closed ? " · Poll closed" : ""}`
        : `No votes yet${closed ? " · Poll closed" : ""}`;
    }, () => {
      const card = elements.messages.querySelector(`[data-poll-id="${cssEscape(message.id)}"]`);
      if (!card) return;
      card.querySelector("[data-poll-total]").textContent = "Votes unavailable";
    });
    pollVoteUnsubscribes.set(message.id, unsubscribe);
  }

  function clearPollVoteListeners() {
    pollVoteUnsubscribes.forEach((unsubscribe) => unsubscribe());
    pollVoteUnsubscribes.clear();
  }

  async function removeMessage(message) {
    const own = message.SenderUID === currentProfile.uid;
    const canDeleteOwn = own && Date.now() - timestampToMillis(message.CreatedAt) <= OWN_DELETE_WINDOW_MS;
    const canModerate = currentProfile.role === "admin";
    if (!canDeleteOwn && !canModerate) return;
    if (!window.confirm("Remove this message from the class chat?")) return;

    const ref = db.collection("chatMessages").doc(message.id);
    try {
      if (canModerate && !own) {
        await db.collection("chatModerationLogs").add({
          Action: "MESSAGE_REMOVED",
          MessageID: message.id,
          OriginalText: message.Text || "",
          SenderUID: message.SenderUID || "",
          SenderName: message.SenderName || "",
          ModeratorUID: currentProfile.uid,
          ModeratorName: currentProfile.name,
          CreatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      const removal = {
        Text: "",
        Removed: true,
        RemovedBy: currentProfile.uid,
        RemovedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (canModerate) removal.Pinned = false;
      await ref.update(removal);

      if (canModerate) {
        const replies = await db.collection("chatMessages").where("ReplyToID", "==", message.id).get();
        if (!replies.empty) {
          const batch = db.batch();
          replies.docs.forEach((replyDoc) => {
            batch.update(replyDoc.ref, {
              ReplyToText: "",
              ReplySourceRemoved: true
            });
          });
          await batch.commit();
        }
      }
    } catch (error) {
      window.alert(readableError(error));
    }
  }

  async function markRead() {
    if (!currentProfile || !db) return;
    await db.collection("chatReadReceipts").doc(currentProfile.uid).set({
      UID: currentProfile.uid,
      Name: currentProfile.name,
      LastSeenAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  }

  function markLocalRead() {
    try {
      localStorage.setItem(CHAT_LAST_COUNT_KEY, String(currentMetaCount));
      localStorage.setItem(CHAT_LAST_TIME_KEY, String(Date.now()));
      elements.unread.hidden = true;
    } catch (error) {
      // Unread persistence is optional when browser storage is blocked.
    }
  }

  function getStoredNumber(key) {
    try {
      const value = Number(localStorage.getItem(key) || 0);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  function findMessage(id) {
    return currentMessages.find((message) => message.id === id);
  }

  function isNearBottom() {
    const node = elements.messages;
    return !node || node.scrollHeight - node.scrollTop - node.clientHeight < 100;
  }

  function scrollToBottom() {
    window.requestAnimationFrame(() => {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    });
  }

  function handleChatKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey && document.activeElement === elements.input) {
      event.preventDefault();
      elements.composer.requestSubmit();
      return;
    }
    if (event.key !== "Escape" || elements.layer.hidden) return;
    if (!elements.exitDialog.hidden) {
      hideExitDialog();
      return;
    }
    if (!elements.utility.hidden) {
      closeUtility();
      return;
    }
    if (!elements.menu.hidden) {
      closeChatMenu();
      elements.logout.focus();
      return;
    }
    requestCloseChat();
  }

  function normalizeStudentId(value) {
    return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
  }

  function studentEmail(studentId) {
    const encoded = Array.from(studentId)
      .map((character) => character.codePointAt(0).toString(16).padStart(2, "0"))
      .join("");
    return `student.${encoded}@sfk-classboard.app`;
  }

  function initials(name) {
    return String(name || "S")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "S";
  }

  function timestampToMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function timestampToDate(value) {
    const millis = timestampToMillis(value);
    return millis ? new Date(millis) : new Date();
  }

  function formatDayLabel(date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatTime(date) {
    return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  }

  function readableError(error) {
    const code = String(error?.code || "");
    if (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("user-not-found")) {
      return "Student ID or PIN is incorrect.";
    }
    if (code.includes("too-many-requests")) return "Too many attempts. Please wait and try again.";
    if (code.includes("permission-denied")) return "This account is not allowed to access the class chat.";
    if (code.includes("network-request-failed")) return "No connection. Check your internet and try again.";
    return String(error?.message || "Class chat could not be opened.").replace(/^Firebase:\s*/i, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
