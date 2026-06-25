const OFFICER_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const OFFICER_PIN = "SFK2627";
const OFFICER_LOGIN_KEY = "sfkOfficerLoggedIn";

let currentOfficerSheet = "";
let latestOfficerTableData = null;
let selectedOfficerRows = new Set();
let activeOfficerTool = null;
let currentOfficerFilteredRows = [];

const TEXT_FORMAT_OPTIONS = ["center", "left", "right", "bullets", "numbers"];
const MAX_ANNOUNCEMENT_ATTACHMENTS = 5;
const MAX_ANNOUNCEMENT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

document.addEventListener("DOMContentLoaded", () => {
  initOfficerToolLauncher();
  initRichTextEditors();

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
  initRichTextEditors();
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

function showOfficerToastAction(message, actionLabel, callback) {
  const toast = document.getElementById("officerToast");
  if (!toast) return;

  toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">${escapeHtml(actionLabel)}</button>`;
  toast.classList.remove("hidden");

  const button = toast.querySelector("button");
  button?.addEventListener("click", () => {
    toast.classList.add("hidden");
    callback?.();
  });

  clearTimeout(window.officerToastTimer);
  window.officerToastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 6500);
}

function clearOfficerFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.classList && el.classList.contains("richHiddenTextarea")) {
      clearRichEditorForTarget(id);
    } else if (el.tagName === "SELECT") {
      el.selectedIndex = 0;
    } else {
      el.value = "";
    }
  });

  setTodayForOfficerDateInputs();
}


/* RICH TEXT EDITOR FOR ANNOUNCEMENTS / THINGS TO BRING */
const RICH_TEXT_PREFIX = "[rich]";
const RICH_LIST_STYLES = ["disc", "circle", "square", "decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"];
const RICH_ALIGNMENTS = ["left", "center", "right"];
const RICH_INDENT_STEP_EM = 1.25;
const RICH_MAX_INDENT_LEVEL = 6;

function initRichTextEditors() {
  if (!window.__sfkRichSelectionWatcherAttached) {
    window.__sfkRichSelectionWatcherAttached = true;
    document.addEventListener("selectionchange", () => {
      const activeComposer = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".richComposer") : null;
      if (activeComposer) saveRichSelection(activeComposer);
    });
  }

  document.querySelectorAll(".richComposer").forEach(composer => {
    if (composer.dataset.richReady === "true") return;
    const targetId = composer.dataset.richTarget;
    const editor = composer.querySelector(".richEditor");
    if (!targetId || !editor) return;

    composer.dataset.richReady = "true";

    editor.addEventListener("input", () => syncRichEditorToTextarea(targetId));
    editor.addEventListener("blur", () => {
      saveRichSelection(composer);
      syncRichEditorToTextarea(targetId);
    });
    editor.addEventListener("keyup", () => saveRichSelection(composer));
    editor.addEventListener("mouseup", () => saveRichSelection(composer));
    editor.addEventListener("touchend", () => setTimeout(() => saveRichSelection(composer), 0));
    editor.addEventListener("paste", (event) => handleRichEditorPaste(event, targetId));

    composer.querySelectorAll("[data-rich-command], [data-rich-list], [data-rich-align], [data-rich-indent], [data-rich-color]").forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => runRichEditorToolbarAction(composer, button));
    });

    composer.querySelectorAll("[data-rich-color-picker]").forEach(input => {
      input.addEventListener("mousedown", () => saveRichSelection(composer));
      input.addEventListener("input", () => runRichEditorColorPickerAction(composer, input.value));
      input.addEventListener("change", () => runRichEditorColorPickerAction(composer, input.value));
    });

    syncRichEditorToTextarea(targetId);
  });
}

function getRichEditorToolbarMarkup(label = "Formatting tools") {
  return `
    <div class="richToolbar" aria-label="${escapeHtml(label)}">
      <div class="richToolbarGroup" aria-label="Text style">
        <button type="button" data-rich-command="bold" title="Bold selected text"><b>B</b></button>
        <button type="button" data-rich-command="italic" title="Italic selected text"><i>I</i></button>
        <button type="button" data-rich-command="underline" title="Underline selected text"><u>U</u></button>
      </div>
      <div class="richToolbarGroup" aria-label="Bullets and numbering">
        <button type="button" data-rich-list="disc" title="Bullet list">•</button>
        <button type="button" data-rich-list="circle" title="Circle bullet">○</button>
        <button type="button" data-rich-list="square" title="Square bullet">▪</button>
        <button type="button" data-rich-list="decimal" title="Numbered list">1.</button>
        <button type="button" data-rich-list="lower-alpha" title="Letter list">a.</button>
        <button type="button" data-rich-list="upper-alpha" title="Capital letter list">A.</button>
      </div>
      <div class="richToolbarGroup" aria-label="Indent">
        <button type="button" data-rich-indent="out" title="Decrease indent">⇤</button>
        <button type="button" data-rich-indent="in" title="Increase indent">⇥</button>
      </div>
      <div class="richToolbarGroup" aria-label="Text color">
        <button type="button" class="richColorChip richColorBlack" data-rich-color="#111111" title="Black text">A</button>
        <button type="button" class="richColorChip richColorRed" data-rich-color="#d62828" title="Red text">A</button>
        <button type="button" class="richColorChip richColorBlue" data-rich-color="#2563eb" title="Blue text">A</button>
        <button type="button" class="richColorChip richColorGreen" data-rich-color="#0f766e" title="Green text">A</button>
        <button type="button" class="richColorChip richColorPurple" data-rich-color="#7c3aed" title="Purple text">A</button>
        <label class="richColorPickerLabel" title="Custom text color"><span>Color</span><input type="color" data-rich-color-picker value="#111111" aria-label="Custom text color"></label>
      </div>
      <div class="richToolbarGroup" aria-label="Alignment">
        <button type="button" data-rich-align="left" title="Align left">Left</button>
        <button type="button" data-rich-align="center" title="Align center">Center</button>
        <button type="button" data-rich-align="right" title="Align right">Right</button>
        <button type="button" data-rich-command="removeFormat" title="Clear selected formatting">Clear</button>
      </div>
    </div>`;
}

function runRichEditorToolbarAction(composer, button) {
  const targetId = composer.dataset.richTarget;
  const editor = composer.querySelector(".richEditor");
  if (!editor) return;

  editor.focus();
  restoreRichSelection(composer);

  const command = button.dataset.richCommand;
  const listStyle = button.dataset.richList;
  const align = button.dataset.richAlign;
  const indent = button.dataset.richIndent;
  const color = button.dataset.richColor;

  if (command) {
    document.execCommand(command, false, null);
  }

  if (align && RICH_ALIGNMENTS.includes(align)) {
    const commandName = align === "center" ? "justifyCenter" : align === "right" ? "justifyRight" : "justifyLeft";
    document.execCommand(commandName, false, null);
    applyAlignmentToSelectedBlocks(editor, align);
  }

  if (listStyle && RICH_LIST_STYLES.includes(listStyle)) {
    applyListStyleToSelection(editor, listStyle);
  }

  if (indent === "in" || indent === "out") {
    applyRichIndentToSelection(editor, indent === "in" ? 1 : -1);
  }

  if (color) {
    applyRichTextColor(editor, color);
  }

  saveRichSelection(composer);
  syncRichEditorToTextarea(targetId);
}

function runRichEditorColorPickerAction(composer, color) {
  const targetId = composer.dataset.richTarget;
  const editor = composer.querySelector(".richEditor");
  if (!editor) return;

  editor.focus();
  restoreRichSelection(composer);
  applyRichTextColor(editor, color);
  saveRichSelection(composer);
  syncRichEditorToTextarea(targetId);
}

function saveRichSelection(composer) {
  const editor = composer.querySelector(".richEditor");
  const selection = window.getSelection && window.getSelection();
  if (!editor || !selection || !selection.rangeCount) return;

  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if ((anchor && editor.contains(anchor)) || (focus && editor.contains(focus))) {
    composer.__savedRichRange = selection.getRangeAt(0).cloneRange();
  }
}

function restoreRichSelection(composer) {
  const editor = composer.querySelector(".richEditor");
  const selection = window.getSelection && window.getSelection();
  const range = composer.__savedRichRange;
  if (!editor || !selection || !range) return;

  const startInside = range.startContainer === editor || editor.contains(range.startContainer);
  const endInside = range.endContainer === editor || editor.contains(range.endContainer);
  if (!startInside || !endInside) return;

  selection.removeAllRanges();
  selection.addRange(range);
}

function handleRichEditorPaste(event, targetId) {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData)?.getData("text/plain") || "";
  document.execCommand("insertText", false, text);
  syncRichEditorToTextarea(targetId);
}

function applyListStyleToSelection(editor, listStyle) {
  const needsOrdered = ["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"].includes(listStyle);
  const desiredTag = needsOrdered ? "OL" : "UL";
  let list = getCurrentListElement(editor);

  if (!list || list.tagName !== desiredTag) {
    document.execCommand(needsOrdered ? "insertOrderedList" : "insertUnorderedList", false, null);
    list = getCurrentListElement(editor);
  }

  if (list && RICH_LIST_STYLES.includes(listStyle)) {
    list.style.listStyleType = listStyle;
  }
}

function getCurrentListElement(editor) {
  const selection = window.getSelection && window.getSelection();
  let node = selection && selection.rangeCount ? selection.anchorNode : null;

  if (!node || !editor.contains(node)) {
    node = editor;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  while (node && node !== editor) {
    if (node.tagName === "UL" || node.tagName === "OL") return node;
    node = node.parentElement;
  }

  return editor.querySelector("ul, ol");
}

function applyAlignmentToSelectedBlocks(editor, align) {
  getSelectedRichBlocks(editor).forEach(block => {
    block.style.textAlign = align;
  });
}

function applyRichIndentToSelection(editor, direction) {
  const blocks = getSelectedRichBlocks(editor);
  if (!blocks.length) return;

  blocks.forEach(block => {
    const current = parseRichIndentValue(block.style.marginLeft);
    const next = Math.max(0, Math.min(RICH_MAX_INDENT_LEVEL * RICH_INDENT_STEP_EM, current + (direction * RICH_INDENT_STEP_EM)));

    if (next <= 0.01) {
      block.style.removeProperty("margin-left");
    } else {
      block.style.marginLeft = formatRichIndentValue(next);
    }
  });
}

function applyRichTextColor(editor, color) {
  const cleanColor = normalizeRichColor(color);
  if (!cleanColor) return;
  document.execCommand("foreColor", false, cleanColor);
}

function getSelectedRichBlocks(editor) {
  const selection = window.getSelection && window.getSelection();
  if (!selection || !selection.rangeCount) return [];

  const range = selection.getRangeAt(0);
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if ((!anchor || !editor.contains(anchor)) && (!focus || !editor.contains(focus))) return [];

  const candidates = Array.from(editor.querySelectorAll("p, div, li"))
    .filter(el => {
      try {
        return range.intersectsNode(el);
      } catch (error) {
        return false;
      }
    });

  const smallestBlocks = candidates.filter(el => !candidates.some(other => other !== el && el.contains(other)));
  if (smallestBlocks.length) return smallestBlocks;

  const closest = getClosestRichBlock(editor, anchor || focus);
  if (closest) return [closest];

  document.execCommand("formatBlock", false, "div");
  const created = getClosestRichBlock(editor, selection.anchorNode);
  return created ? [created] : [];
}

function getClosestRichBlock(editor, node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

  while (node && node !== editor) {
    if (["P", "DIV", "LI"].includes(node.tagName)) return node;
    node = node.parentElement;
  }

  return null;
}

function parseRichIndentValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return 0;

  if (raw.endsWith("em")) return Number.parseFloat(raw) || 0;
  if (raw.endsWith("px")) return (Number.parseFloat(raw) || 0) / 16;
  return Number.parseFloat(raw) || 0;
}

function formatRichIndentValue(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}em`;
}

function normalizeRichColor(value) {
  const raw = String(value || "").trim().toLowerCase();

  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return `#${shortHex[1].split("").map(char => char + char).join("")}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();

  const rgb = raw.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*(?:0|1|0?\.\d+))?\)$/i);
  if (rgb) {
    const parts = rgb.slice(1, 4).map(part => Math.max(0, Math.min(255, Number(part) || 0)));
    return `#${parts.map(part => part.toString(16).padStart(2, "0")).join("")}`;
  }

  return "";
}

function normalizeRichIndent(value) {
  const parsed = parseRichIndentValue(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  const max = RICH_MAX_INDENT_LEVEL * RICH_INDENT_STEP_EM;
  return formatRichIndentValue(Math.min(max, parsed));
}

function syncRichEditorToTextarea(targetId) {
  const hidden = document.getElementById(targetId);
  const editor = document.querySelector(`.richComposer[data-rich-target="${targetId}"] .richEditor`);
  if (!hidden || !editor) return;

  const html = sanitizeRichEditorHtml(editor.innerHTML);
  const plainText = getRichEditorPlainText(targetId);
  hidden.value = plainText ? `${RICH_TEXT_PREFIX}\n${html}` : "";
}

function getRichEditorStorageValue(targetId) {
  syncRichEditorToTextarea(targetId);
  const hidden = document.getElementById(targetId);
  return hidden ? hidden.value.trim() : "";
}

function isRichTextStorageValue(value) {
  return /^\[rich\]\s*\n/i.test(String(value || "").replace(/\r/g, ""));
}

function getRichTextStorageHtml(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\[rich\]\s*\n?/i, "")
    .trim();
}

function getRichEditorPlainText(targetId) {
  const editor = document.querySelector(`.richComposer[data-rich-target="${targetId}"] .richEditor`);
  return editor ? String(editor.innerText || "").replace(/\u00a0/g, " ").trim() : "";
}

function clearRichEditorForTarget(targetId) {
  const hidden = document.getElementById(targetId);
  const editor = document.querySelector(`.richComposer[data-rich-target="${targetId}"] .richEditor`);
  if (hidden) hidden.value = "";
  if (editor) editor.innerHTML = "";
}

function sanitizeRichEditorHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const fragment = sanitizeRichNode(template.content);
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML
    .replace(/<div><br><\/div>/gi, "")
    .replace(/<p><br><\/p>/gi, "")
    .trim();
}

function sanitizeRichNode(node) {
  const fragment = document.createDocumentFragment();

  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      fragment.appendChild(document.createTextNode(child.textContent || ""));
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const tag = child.tagName.toLowerCase();
    const allowed = ["b", "strong", "i", "em", "u", "br", "div", "p", "ul", "ol", "li", "span", "font"];

    if (!allowed.includes(tag)) {
      fragment.appendChild(sanitizeRichNode(child));
      return;
    }

    const cleanTag = tag === "font" ? "span" : tag;
    const clean = document.createElement(cleanTag);
    const styleParts = [];
    const textAlign = String(child.style?.textAlign || "").toLowerCase();
    const listStyleType = String(child.style?.listStyleType || "").toLowerCase();
    const fontWeight = String(child.style?.fontWeight || "").toLowerCase();
    const fontStyle = String(child.style?.fontStyle || "").toLowerCase();
    const textDecoration = String(child.style?.textDecoration || "").toLowerCase();
    const color = normalizeRichColor(child.getAttribute("color") || child.style?.color || "");
    const indent = normalizeRichIndent(child.style?.marginLeft || "");

    if (RICH_ALIGNMENTS.includes(textAlign)) styleParts.push(`text-align:${textAlign}`);
    if ((cleanTag === "ul" || cleanTag === "ol") && RICH_LIST_STYLES.includes(listStyleType)) {
      styleParts.push(`list-style-type:${listStyleType}`);
    }
    if (["div", "p", "li", "ul", "ol"].includes(cleanTag) && indent) styleParts.push(`margin-left:${indent}`);
    if (cleanTag === "span" && (fontWeight === "bold" || Number(fontWeight) >= 600)) styleParts.push("font-weight:700");
    if (cleanTag === "span" && fontStyle === "italic") styleParts.push("font-style:italic");
    if (cleanTag === "span" && textDecoration.includes("underline")) styleParts.push("text-decoration:underline");
    if (cleanTag === "span" && color) styleParts.push(`color:${color}`);
    if (styleParts.length) clean.setAttribute("style", styleParts.join(";"));

    clean.appendChild(sanitizeRichNode(child));
    fragment.appendChild(clean);
  });

  return fragment;
}

/* SUBJECT ANNOUNCEMENT */
async function saveOfficerAnnouncement() {
  const announcementText = getRichEditorStorageValue("officerAnnouncementText");
  const attachmentFiles = await buildOfficerAttachmentPayload("officerAnnouncementAttachments", showOfficerToast);

  if (attachmentFiles === null) return;

  const payload = {
    Date: document.getElementById("officerAnnouncementDate").value,
    Subject: document.getElementById("officerAnnouncementSubject").value,
    Announcement: announcementText,
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
  const itemText = getRichEditorStorageValue("officerThingsItem");

  const payload = {
    Date: document.getElementById("officerThingsDate").value,
    Subject: document.getElementById("officerThingsSubject").value,
    Item: itemText,
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
    resetOfficerManageFilters();
    renderOfficerTable(getOfficerFilteredTableData());

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

function getOfficerManageFilters() {
  return {
    search: document.getElementById("officerManageSearch")?.value.trim().toLowerCase() || "",
    publish: document.getElementById("officerPublishFilter")?.value || "all"
  };
}

function resetOfficerManageFilters() {
  const search = document.getElementById("officerManageSearch");
  const publish = document.getElementById("officerPublishFilter");
  if (search) search.value = "";
  if (publish) publish.value = "all";
}

function getRowPublishValue(headers, row) {
  const publishIndex = (headers || []).findIndex(header => {
    const key = normalizeManageHeaderKey(header);
    return key === "publish" || key === "published";
  });

  if (publishIndex === -1) return "YES";
  return String(row?.cells?.[publishIndex] || "YES").trim().toUpperCase();
}

function rowMatchesManageFilters(headers, row, filters) {
  const publish = getRowPublishValue(headers, row);

  if (filters.publish === "published" && publish === "NO") return false;
  if (filters.publish === "hidden" && publish !== "NO") return false;

  if (!filters.search) return true;

  const haystack = [
    row.rowNumber,
    ...(row.cells || [])
  ].join(" ").toLowerCase();

  return haystack.includes(filters.search);
}

function getOfficerFilteredTableData() {
  if (!latestOfficerTableData) return null;

  const filters = getOfficerManageFilters();
  const allRows = latestOfficerTableData.rows || [];
  const rows = allRows.filter(row => rowMatchesManageFilters(latestOfficerTableData.headers || [], row, filters));

  currentOfficerFilteredRows = rows;

  return {
    ...latestOfficerTableData,
    rows,
    totalRows: allRows.length
  };
}

function applyOfficerManageFilters() {
  if (!latestOfficerTableData) return;

  const filteredData = getOfficerFilteredTableData();
  const visibleRows = new Set(currentOfficerFilteredRows.map(row => Number(row.rowNumber)));
  selectedOfficerRows = new Set([...selectedOfficerRows].filter(rowNumber => visibleRows.has(Number(rowNumber))));
  renderOfficerTable(filteredData);
  syncOfficerSelectedRows();
}

function renderOfficerTable(result) {
  const tableHead = document.querySelector("#officerDataTable thead");
  const tableBody = document.querySelector("#officerDataTable tbody");

  if (!result) return;

  const headers = result.headers || [];
  const rows = result.rows || [];
  const totalRows = Number.isFinite(result.totalRows) ? result.totalRows : rows.length;
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
          ${totalRows > 0 ? "No matching records found." : "No data found."}
        </td>
      </tr>
    `;

    setOfficerManageStatus(totalRows > 0
      ? `${formatSheetLabel(result.sheetName)} loaded. Showing 0 of ${totalRows} record(s).`
      : `${formatSheetLabel(result.sheetName)} loaded. No records yet.`
    );
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
              ${formatManageCellDisplay(value)}
            </td>
          `;
        }).join("")}
      </tr>
    `;
  }).join("");

  setOfficerManageStatus(`${formatSheetLabel(result.sheetName)} loaded. ${rows.length}${totalRows !== rows.length ? ` of ${totalRows}` : ""} record(s) shown.`);
  attachOfficerLongPressSelection();
}

function formatManageCellDisplay(value) {
  if (!value) return "—";

  if (typeof isRichTextStorageValue === "function" && isRichTextStorageValue(value)) {
    const safeHtml = sanitizeRichEditorHtml(getRichTextStorageHtml(value));
    return safeHtml ? `<div class="manageRichPreview">${safeHtml}</div>` : "—";
  }

  return escapeHtml(stripTextFormatTag(value));
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
    const visibleCount = currentOfficerFilteredRows.length || 0;
    const totalCount = latestOfficerTableData.rows.length;
    setOfficerManageStatus(`${formatSheetLabel(currentOfficerSheet)} loaded. ${visibleCount}${visibleCount !== totalCount ? ` of ${totalCount}` : ""} record(s) shown. ${count} selected.`);
  }
}

function selectAllOfficerRows() {
  if (!latestOfficerTableData || !latestOfficerTableData.rows) return;
  const rows = getOfficerFilteredTableData()?.rows || [];
  selectedOfficerRows = new Set(rows.map(row => Number(row.rowNumber)));
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
      showOfficerToastAction(result.message || "Selected records hidden.", "Undo", () => restoreOfficerRecords(rowNumbers));
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
      showOfficerToastAction("Record hidden.", "Undo", () => restoreOfficerRecords([rowNumber]));
      refreshCurrentOfficerTable();
      return;
    }

    showOfficerToast(result.message || "Failed to hide record.");

  } catch (error) {
    console.error(error);
    showOfficerToast("Error hiding record.");
  }
}

async function restoreOfficerRecords(rowNumbers) {
  if (!currentOfficerSheet) {
    showOfficerToast("Select a category first.");
    return;
  }

  const rows = (rowNumbers || []).map(Number).filter(rowNumber => rowNumber >= 2);
  if (rows.length === 0) return;

  showOfficerToast("Restoring record...");

  try {
    await Promise.all(rows.map(rowNumber => fetch(OFFICER_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "officerRestore",
        payload: {
          sheetName: currentOfficerSheet,
          rowNumber
        }
      })
    }).then(async response => {
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Restore failed.");
      return result;
    })));

    showOfficerToast(rows.length === 1 ? "Record restored." : `${rows.length} records restored.`);
    refreshCurrentOfficerTable();
  } catch (error) {
    console.error(error);
    showOfficerToast(error.message || "Error restoring record.");
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
