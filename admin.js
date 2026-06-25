const ADMIN_API_URL = "https://script.google.com/macros/s/AKfycbzCjWVnO-ZNvKTNqKN1zVscNsfPox0uDnO1QTSbBCrMFaS79tfL3mopHa2pH7gHczYeOA/exec";

const ADMIN_PIN = "0524"; 
const ADMIN_LOGIN_KEY = "sfkAdminLoggedIn";

let currentAdminSheet = "";
let editingRecord = null;
let latestAdminTableData = null;
let selectedAdminRows = new Set();
let activeAdminTool = null;
let currentAdminFilteredRows = [];

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
  initRichTextEditors();

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
  initRichTextEditors();
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

function showToastAction(message, actionLabel, callback) {
  const toast = document.getElementById("adminToast");
  if (!toast) return;

  toast.innerHTML = `<span>${escapeHtml(message)}</span><button type="button">${escapeHtml(actionLabel)}</button>`;
  toast.classList.remove("hidden");

  const button = toast.querySelector("button");
  button?.addEventListener("click", () => {
    toast.classList.add("hidden");
    callback?.();
  });

  clearTimeout(window.adminToastTimer);
  window.adminToastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 6500);
}

function clearFields(ids) {
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

  setTodayForDateInputs();
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
  const blocks = getSelectedRichBlocks(editor);
  const listTargets = new Set();

  blocks.forEach(block => {
    const list = getClosestRichList(editor, block);
    if (list) {
      listTargets.add(list);
    } else {
      block.style.textAlign = align;
    }
  });

  listTargets.forEach(list => applyRichListAlignment(list, align));
}

function applyRichListAlignment(list, align) {
  list.style.textAlign = align;

  if (align === "left") {
    list.style.width = "100%";
    list.style.marginLeft = "0";
    list.style.marginRight = "0";
  } else if (align === "center") {
    list.style.width = "fit-content";
    list.style.marginLeft = "auto";
    list.style.marginRight = "auto";
  } else if (align === "right") {
    list.style.width = "100%";
    list.style.marginLeft = "0";
    list.style.marginRight = "0";
  }
}

function applyRichIndentToSelection(editor, direction) {
  const blocks = getSelectedRichBlocks(editor);
  if (!blocks.length) return;

  const targets = [];
  const seen = new Set();

  blocks.forEach(block => {
    const target = getRichIndentTarget(editor, block);
    if (target && !seen.has(target)) {
      seen.add(target);
      targets.push(target);
    }
  });

  targets.forEach(target => {
    const current = parseRichIndentValue(target.style.marginLeft);
    const next = Math.max(0, Math.min(RICH_MAX_INDENT_LEVEL * RICH_INDENT_STEP_EM, current + (direction * RICH_INDENT_STEP_EM)));

    if (next <= 0.01) {
      target.style.removeProperty("margin-left");
    } else {
      target.style.marginLeft = formatRichIndentValue(next);
    }
  });
}

function getRichIndentTarget(editor, block) {
  const list = getClosestRichList(editor, block);
  return list || block;
}

function getClosestRichList(editor, node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

  while (node && node !== editor) {
    if (node.tagName === "UL" || node.tagName === "OL") return node;
    node = node.parentElement;
  }

  return null;
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
async function saveAnnouncement() {
  const announcementText = getRichEditorStorageValue("announcementText");
  const attachmentFiles = await buildAttachmentPayload("announcementAttachments", showToast);

  if (attachmentFiles === null) return;

  const payload = {
    Date: document.getElementById("announcementDate").value,
    Subject: document.getElementById("announcementSubject").value,
    Announcement: announcementText,
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
  const itemText = getRichEditorStorageValue("thingsItem");

  const payload = {
    Date: document.getElementById("thingsDate").value,
    Subject: document.getElementById("thingsSubject").value,
    Item: itemText,
    Publish: document.getElementById("thingsPublish").value
  };

  if (!payload.Date || !payload.Subject || !payload.Item) {
    showToast("Date needed, subject, and item are required.");
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
    resetAdminManageFilters();
    renderAdminTable(getAdminFilteredTableData());

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

function getAdminManageFilters() {
  return {
    search: document.getElementById("adminManageSearch")?.value.trim().toLowerCase() || "",
    publish: document.getElementById("adminPublishFilter")?.value || "all"
  };
}

function resetAdminManageFilters() {
  const search = document.getElementById("adminManageSearch");
  const publish = document.getElementById("adminPublishFilter");
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

function getAdminFilteredTableData() {
  if (!latestAdminTableData) return null;

  const filters = getAdminManageFilters();
  const allRows = latestAdminTableData.rows || [];
  const rows = allRows.filter(row => rowMatchesManageFilters(latestAdminTableData.headers || [], row, filters));

  currentAdminFilteredRows = rows;

  return {
    ...latestAdminTableData,
    rows,
    totalRows: allRows.length
  };
}

function applyAdminManageFilters() {
  if (!latestAdminTableData) return;

  const filteredData = getAdminFilteredTableData();
  const visibleRows = new Set(currentAdminFilteredRows.map(row => Number(row.rowNumber)));
  selectedAdminRows = new Set([...selectedAdminRows].filter(rowNumber => visibleRows.has(Number(rowNumber))));
  renderAdminTable(filteredData);
  syncAdminSelectedRows();
}

function renderAdminTable(result) {
  const tableHead = document.querySelector("#adminDataTable thead");
  const tableBody = document.querySelector("#adminDataTable tbody");

  if (!result) return;

  const headers = result.headers || [];
  const rows = result.rows || [];
  const totalRows = Number.isFinite(result.totalRows) ? result.totalRows : rows.length;
  const isAnnouncementsSheet = false; // Noted/heart column temporarily removed.
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
      ${visibleColumnIndexes.map(index => `<th>${escapeHtml(getManageHeaderLabel(result.sheetName, headers[index]))}</th>`).join("")}
    </tr>
  `;

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${visibleColumnIndexes.length + 3 + (isAnnouncementsSheet ? 1 : 0)}" class="emptyCell">
          ${totalRows > 0 ? "No matching records found." : "No data found."}
        </td>
      </tr>
    `;

    setManageStatus(totalRows > 0
      ? `${formatSheetLabel(result.sheetName)} loaded. Showing 0 of ${totalRows} record(s).`
      : `${formatSheetLabel(result.sheetName)} loaded. No records yet.`
    );
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
            <td class="${value ? "" : "emptyCell"}" data-label="${escapeAttribute(getManageHeaderLabel(result.sheetName, header))}">
              ${formatManageCellDisplay(value)}
            </td>
          `;
        }).join("")}
      </tr>
    `;
  }).join("");

  setManageStatus(`${formatSheetLabel(result.sheetName)} loaded. ${rows.length}${totalRows !== rows.length ? ` of ${totalRows}` : ""} record(s) shown.`);
  attachAdminLongPressSelection();
}


function formatManageCellDisplay(value) {
  if (!value) return "—";

  if (typeof isRichTextStorageValue === "function" && isRichTextStorageValue(value)) {
    const safeHtml = sanitizeRichEditorHtml(getRichTextStorageHtml(value));
    return safeHtml ? `<div class="manageRichPreview">${safeHtml}</div>` : "—";
  }

  return escapeHtml(stripTextFormatTag(value));
}

function renderAdminNotedCountCell(row) {
  const count = getManageHeartCount(row);

  return `
    <td class="adminNotedCountCell" data-label="Noted" title="Students who clicked Noted / Heart">
      <span class="adminNotedPill">❤️ ${count}</span>
    </td>
  `;
}


function getManageHeartCount(row) {
  const values = [
    row?.notedCount,
    row?.NotedCount,
    row?.heartCount,
    row?.HeartCount,
    row?.Hearts,
    row?.hearts,
    row?.Count,
    row?.count
  ]
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value >= 0);
  return values.length ? Math.max(...values) : 0;
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
    const visibleCount = currentAdminFilteredRows.length || 0;
    const totalCount = latestAdminTableData.rows.length;
    setManageStatus(`${formatSheetLabel(currentAdminSheet)} loaded. ${visibleCount}${visibleCount !== totalCount ? ` of ${totalCount}` : ""} record(s) shown. ${count} selected.`);
  }
}

function selectAllAdminRows() {
  if (!latestAdminTableData || !latestAdminTableData.rows) return;
  const rows = getAdminFilteredTableData()?.rows || [];
  selectedAdminRows = new Set(rows.map(row => Number(row.rowNumber)));
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

  if (actionLabel === "delete") {
    const secondConfirm = confirm("Last check: delete permanently? This cannot be undone.");
    if (!secondConfirm) return;
  }

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
      if (actionLabel === "hide") {
        showToastAction(result.message || "Selected records hidden.", "Undo", () => restoreAdminRecords(rowNumbers));
      } else {
        showToast(result.message || "Batch action complete.");
      }
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
    const labelText = getManageHeaderLabel(editingRecord.sheetName, header);

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
      <label>${escapeHtml(labelText)}</label>
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
      <label>${escapeHtml(labelText)}</label>
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
      <label>${escapeHtml(labelText)}</label>
      <select class="editInput" data-index="${index}">
        ${renderTeacherOptions(value)}
      </select>
    </div>
  `;
}

    if (isLongText) {
      if (isRichTextStorageValue(value)) {
        const targetId = `editRichText_${index}`;
        const safeHtml = sanitizeRichEditorHtml(getRichTextStorageHtml(value));

        return `
          <div class="${fieldClass}">
            <label>${escapeHtml(labelText)}</label>
            <div class="richComposer editRichComposer" data-rich-target="${targetId}">
              ${getRichEditorToolbarMarkup("Edit formatting tools")}
              <div class="richEditor" contenteditable="true" data-placeholder="Edit formatted text here...">${safeHtml}</div>
              <textarea id="${targetId}" class="editInput richHiddenTextarea" data-rich-storage="YES" data-index="${index}" aria-hidden="true" tabindex="-1"></textarea>
            </div>
          </div>
        `;
      }

      const parsedFormat = parseTextFormat(value);

      return `
        <div class="${fieldClass}">
          <label>${escapeHtml(labelText)}</label>
          <select class="editFormatSelect" data-index="${index}">
            ${renderTextFormatOptions(parsedFormat.format)}
          </select>
          <textarea class="editInput textFormatInput" data-format-enabled="YES" data-index="${index}">${escapeHtml(parsedFormat.text)}</textarea>
        </div>
      `;
    }

    return `
      <div class="${fieldClass}">
        <label>${escapeHtml(labelText)}</label>
        <input 
          class="editInput"
          data-index="${index}"
          value="${escapeAttribute(stripTextFormatTag(value))}"
        />
      </div>
    `;
  }).join("");

  editModal.classList.remove("hidden");
  initRichTextEditors();
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
    if (input.dataset.richStorage === "YES") {
      updatedValues[index] = getRichEditorStorageValue(input.id);
    } else if (input.dataset.formatEnabled === "YES") {
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
      showToastAction("Record hidden.", "Undo", () => restoreAdminRecords([rowNumber]));
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

  const secondConfirm = confirm("Last check: delete this record now?");
  if (!secondConfirm) return;

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

async function restoreAdminRecords(rowNumbers) {
  if (!currentAdminSheet) {
    showToast("Select a category first.");
    return;
  }

  const rows = (rowNumbers || []).map(Number).filter(rowNumber => rowNumber >= 2);
  if (rows.length === 0) return;

  showToast("Restoring record...");

  try {
    await Promise.all(rows.map(rowNumber => fetch(ADMIN_API_URL, {
      method: "POST",
      body: JSON.stringify({
        type: "adminRestore",
        payload: {
          sheetName: currentAdminSheet,
          rowNumber
        }
      })
    }).then(async response => {
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Restore failed.");
      return result;
    })));

    showToast(rows.length === 1 ? "Record restored." : `${rows.length} records restored.`);
    refreshCurrentAdminTable();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Error restoring record.");
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

function getManageHeaderLabel(sheetName, header) {
  const rawHeader = String(header || "").trim();
  const key = normalizeManageHeaderKey(rawHeader);

  if (sheetName === "ThingsToBring" && key === "date") {
    return "Date Needed";
  }

  return rawHeader || header;
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
