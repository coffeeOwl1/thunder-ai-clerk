"use strict";

const DEBUG = false;

const DEFAULT_HOST = "http://127.0.0.1:11434";

const DEFAULTS = {
  ollamaHost:              DEFAULT_HOST,
  ollamaModel:             "mistral:7b",
  // Calendar event settings
  attendeesSource:         "from_to",          // "from_to" | "from" | "to" | "static" | "none"
  attendeesStatic:         "",
  defaultCalendar:         "",                 // "" = use currently selected
  descriptionFormat:       "body_from_subject", // "body_from_subject" | "body" | "none" | "ai_summary"
  // Task settings
  taskDescriptionFormat:   "body_from_subject", // "body_from_subject" | "body" | "none" | "ai_summary"
  taskDefaultDue:          "none",             // "none" | "7" | "14" | "30" (days from now)
  // Category settings
  calendarUseCategory:     false,
  taskUseCategory:         false,
  // Compose action settings
  replyMode:               "replyToSender",    // "replyToSender" | "replyToAll"
  // Contact settings
  contactAddressBook:      "",                 // "" = first writable address book
  // Debug settings
  debugPromptPreview:      false,
};

// --- First-run onboarding ---

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Flag so the options page can show the first-run notice
    await browser.storage.local.set({ firstRun: true });
    // Open settings so the user can configure Ollama host and model
    browser.runtime.openOptionsPage();
  }
});

// --- Context menu setup ---

const MENU_IDS = new Set([
  "thunderclerk-ai-add-calendar",
  "thunderclerk-ai-add-task",
  "thunderclerk-ai-draft-reply",
  "thunderclerk-ai-summarize-forward",
  "thunderclerk-ai-extract-contact",
]);

browser.menus.create({
  id: "thunderclerk-ai-parent",
  title: "ThunderClerk-AI",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-add-calendar",
  parentId: "thunderclerk-ai-parent",
  title: "Add to Calendar",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-add-task",
  parentId: "thunderclerk-ai-parent",
  title: "Add as Task",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-sep-1",
  parentId: "thunderclerk-ai-parent",
  type: "separator",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-draft-reply",
  parentId: "thunderclerk-ai-parent",
  title: "Draft Reply",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-summarize-forward",
  parentId: "thunderclerk-ai-parent",
  title: "Summarize & Forward",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-sep-2",
  parentId: "thunderclerk-ai-parent",
  type: "separator",
  contexts: ["message_list"],
});

browser.menus.create({
  id: "thunderclerk-ai-extract-contact",
  parentId: "thunderclerk-ai-parent",
  title: "Extract Contact",
  contexts: ["message_list"],
});

// Pure utility functions (normalizeCalDate, extractJSON, buildAttendeesHint,
// buildDescription, buildCategoryInstruction, isValidHostUrl, etc.) are
// defined in utils.js, which is loaded before this script.

function normalizeCalendarData(data) {
  if (data.startDate) data.startDate = normalizeCalDate(data.startDate);
  if (data.endDate)   data.endDate   = normalizeCalDate(data.endDate);
  data.forceAllDay = !!data.forceAllDay; // schema requires this field
  return data;
}

function normalizeTaskData(data) {
  if (data.dueDate)     data.dueDate     = normalizeCalDate(data.dueDate);
  if (data.initialDate) data.initialDate = normalizeCalDate(data.initialDate);
  if (data.InitialDate) {
    data.initialDate = normalizeCalDate(data.InitialDate);
    delete data.InitialDate;
  }
  return data;
}

// buildCalendarPrompt, buildTaskPrompt, buildDraftReplyPrompt,
// buildSummarizeForwardPrompt, buildContactPrompt are defined in utils.js,
// which is loaded before this script in the extension manifest.

async function callOllama(host, model, prompt) {
  if (!isValidHostUrl(host)) {
    throw new Error(`Invalid Ollama host URL: "${host}". Check the extension settings.`);
  }
  const url = host.replace(/\/$/, "") + "/api/generate";
  if (DEBUG) console.log("[ThunderClerk-AI] Calling Ollama", { url, model, promptLen: prompt.length });

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("Ollama request timed out after 60 seconds.");
    throw e;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
  const data = await response.json();
  if (DEBUG) console.log("[ThunderClerk-AI] Ollama response length:", data.response?.length);
  return data.response;
}

function previewPrompt(prompt) {
  return new Promise((resolve, reject) => {
    browser.storage.local.set({ pendingPrompt: prompt }).then(() => {
      const listener = (msg) => {
        if (msg && msg.promptAction) {
          browser.runtime.onMessage.removeListener(listener);
          browser.storage.local.remove("pendingPrompt").catch(() => {});
          if (msg.promptAction === "ok") {
            resolve();
          } else {
            reject(new Error("Prompt cancelled by user."));
          }
        }
      };
      browser.runtime.onMessage.addListener(listener);

      browser.windows.create({
        url: browser.runtime.getURL("debug/preview.html"),
        type: "popup",
        width: 620,
        height: 520,
      }).then((win) => {
        // If the user closes the window without clicking a button, treat as cancel
        const onRemoved = (windowId) => {
          if (windowId === win.id) {
            browser.windows.onRemoved.removeListener(onRemoved);
            browser.runtime.onMessage.removeListener(listener);
            browser.storage.local.remove("pendingPrompt").catch(() => {});
            reject(new Error("Prompt preview window closed."));
          }
        };
        browser.windows.onRemoved.addListener(onRemoved);
      });
    });
  });
}

function notifyError(title, message) {
  console.error("[ThunderClerk-AI]", title, message);
  browser.notifications.create({
    type: "basic",
    title: `ThunderClerk-AI — ${title}`,
    message,
  }).catch(() => {});
}

// --- Shared helper: call Ollama with a progress notification ---

async function callOllamaWithNotification(host, model, prompt, actionLabel, settings) {
  // Debug: show prompt preview if enabled
  if (settings && settings.debugPromptPreview) {
    await previewPrompt(prompt);
  }

  const THINKING_ID = "thunderclerk-ai-thinking";
  browser.notifications.create(THINKING_ID, {
    type: "basic",
    title: "ThunderClerk-AI",
    message: `Asking ${model} to ${actionLabel}…`,
  }).catch(() => {});

  let rawResponse;
  try {
    rawResponse = await callOllama(host, model, prompt);
  } catch (e) {
    browser.notifications.clear(THINKING_ID).catch(() => {});
    throw e;
  }
  browser.notifications.clear(THINKING_ID).catch(() => {});

  const jsonStr = extractJSON(rawResponse);
  return JSON.parse(jsonStr);
}

// --- Action handlers ---

async function handleCalendar(message, emailBody, settings) {
  const host              = settings.ollamaHost        || DEFAULT_HOST;
  const model             = settings.ollamaModel       || DEFAULTS.ollamaModel;
  const attendeesSource   = settings.attendeesSource   || "from_to";
  const attendeesStatic   = settings.attendeesStatic   || "";
  const defaultCalendar   = settings.defaultCalendar   || "";
  const descriptionFormat = settings.descriptionFormat || "body_from_subject";
  const calendarUseCategory = !!settings.calendarUseCategory;

  const mailDatetime  = formatDatetime(message.date);
  const currentDt     = currentDatetime();
  const author        = message.author || "";
  const subject       = message.subject || "";
  const attendeeHints = buildAttendeesHint(message, attendeesSource, attendeesStatic);

  let categories = null;
  if (calendarUseCategory) {
    try {
      categories = await browser.CalendarTools.getCategories();
    } catch (e) {
      console.warn("[ThunderClerk-AI] Could not fetch categories, proceeding without:", e.message);
    }
  }

  const wantAiDescription = descriptionFormat === "ai_summary";
  const prompt = buildCalendarPrompt(emailBody, subject, mailDatetime, currentDt, attendeeHints, categories, wantAiDescription);

  const parsed = await callOllamaWithNotification(host, model, prompt, "extract event details", settings);

  normalizeCalendarData(parsed);

  const refYear = parseInt(currentDt.slice(-4), 10);
  if (parsed.startDate) parsed.startDate = advancePastYear(parsed.startDate, refYear);
  if (parsed.endDate)   parsed.endDate   = advancePastYear(parsed.endDate,   refYear);

  if (!parsed.summary) parsed.summary = subject;

  applyCalendarDefaults(parsed);

  if (descriptionFormat === "ai_summary") {
    if (!parsed.description) parsed.description = subject;
  } else {
    const description = buildDescription(emailBody, author, subject, descriptionFormat);
    if (description) parsed.description = description;
  }

  if (defaultCalendar) parsed.calendar_name = defaultCalendar;

  if (attendeesSource === "static") {
    parsed.attendees = attendeesStatic ? [attendeesStatic] : [];
  } else if (attendeesSource === "none") {
    parsed.attendees = [];
  }

  // iCal all-day events use an exclusive DTEND (the day *after* the last
  // visible day). Advance endDate by 1 day for multi-day all-day events so
  // Thunderbird displays the correct last day.
  if (parsed.forceAllDay && parsed.endDate && parsed.endDate !== parsed.startDate) {
    parsed.endDate = addHoursToCalDate(parsed.endDate, 24);
  }

  await browser.CalendarTools.openCalendarDialog(parsed);
}

async function handleTask(message, emailBody, settings) {
  const host                  = settings.ollamaHost            || DEFAULT_HOST;
  const model                 = settings.ollamaModel           || DEFAULTS.ollamaModel;
  const taskDescriptionFormat = settings.taskDescriptionFormat || "body_from_subject";
  const taskDefaultDue        = settings.taskDefaultDue        || "none";
  const taskUseCategory       = !!settings.taskUseCategory;

  const mailDatetime  = formatDatetime(message.date);
  const currentDt     = currentDatetime();
  const author        = message.author || "";
  const subject       = message.subject || "";

  let categories = null;
  if (taskUseCategory) {
    try {
      categories = await browser.CalendarTools.getCategories();
    } catch (e) {
      console.warn("[ThunderClerk-AI] Could not fetch categories, proceeding without:", e.message);
    }
  }

  const wantAiDescription = taskDescriptionFormat === "ai_summary";
  const prompt = buildTaskPrompt(emailBody, subject, mailDatetime, currentDt, categories, wantAiDescription);

  const parsed = await callOllamaWithNotification(host, model, prompt, "extract task details", settings);

  normalizeTaskData(parsed);

  if (!parsed.dueDate && taskDefaultDue !== "none") {
    const future = new Date();
    future.setDate(future.getDate() + parseInt(taskDefaultDue, 10));
    const y  = future.getFullYear();
    const mo = String(future.getMonth() + 1).padStart(2, "0");
    const d  = String(future.getDate()).padStart(2, "0");
    parsed.dueDate = `${y}${mo}${d}T120000`;
  }

  if (taskDescriptionFormat === "ai_summary") {
    if (!parsed.description) parsed.description = subject;
  } else {
    const taskDescription = buildDescription(emailBody, author, subject, taskDescriptionFormat);
    if (taskDescription) parsed.description = taskDescription;
  }

  await browser.CalendarTools.openTaskDialog(parsed);
}

async function handleDraftReply(message, emailBody, settings) {
  const host      = settings.ollamaHost  || DEFAULT_HOST;
  const model     = settings.ollamaModel || DEFAULTS.ollamaModel;
  const replyMode = settings.replyMode   || "replyToSender";
  const author    = message.author || "";
  const subject   = message.subject || "";

  const prompt = buildDraftReplyPrompt(emailBody, subject, author);
  const parsed = await callOllamaWithNotification(host, model, prompt, "draft a reply", settings);

  const replyBody = (parsed.body || "").trim();
  if (!replyBody) {
    notifyError("Empty reply", "The AI returned an empty reply body.");
    return;
  }

  // Open compose window as reply
  const composeTab = await browser.compose.beginReply(message.id, replyMode);

  // Get the existing compose body (contains quoted original)
  const details = await browser.compose.getComposeDetails(composeTab.id);

  // Convert AI reply to HTML and prepend before quoted original
  const escapedBody = replyBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const newBody = `<p>${escapedBody}</p><br>` + (details.body || "");
  await browser.compose.setComposeDetails(composeTab.id, { body: newBody });
}

async function handleSummarizeForward(message, emailBody, settings) {
  const host   = settings.ollamaHost  || DEFAULT_HOST;
  const model  = settings.ollamaModel || DEFAULTS.ollamaModel;
  const author = message.author || "";
  const subject = message.subject || "";

  const prompt = buildSummarizeForwardPrompt(emailBody, subject, author);
  const parsed = await callOllamaWithNotification(host, model, prompt, "summarize the email", settings);

  const summary = (parsed.summary || "").trim();
  if (!summary) {
    notifyError("Empty summary", "The AI returned an empty summary.");
    return;
  }

  // Open compose window as inline forward
  const composeTab = await browser.compose.beginForward(message.id, "forwardInline");

  const details = await browser.compose.getComposeDetails(composeTab.id);

  const escapedSummary = summary
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const newBody = `<p><strong>Summary:</strong><br>${escapedSummary}</p><hr>` + (details.body || "");
  await browser.compose.setComposeDetails(composeTab.id, { body: newBody });
}

async function handleExtractContact(message, emailBody, settings) {
  const host   = settings.ollamaHost  || DEFAULT_HOST;
  const model  = settings.ollamaModel || DEFAULTS.ollamaModel;
  const author = message.author || "";
  const subject = message.subject || "";

  const prompt = buildContactPrompt(emailBody, subject, author);
  const parsed = await callOllamaWithNotification(host, model, prompt, "extract contact info", settings);

  // Store extracted contact for the review popup to read
  await browser.storage.local.set({
    pendingContact: parsed,
    contactAddressBook: settings.contactAddressBook || "",
  });

  // Open the review popup
  await browser.windows.create({
    type: "popup",
    url: "contact/review.html",
    width: 420,
    height: 520,
  });
}

// --- Menu click handler ---

browser.menus.onClicked.addListener(async (info, tab) => {
  if (!MENU_IDS.has(info.menuItemId)) return;

  const messages = info.selectedMessages && info.selectedMessages.messages;
  if (!messages || messages.length === 0) {
    notifyError("No message selected", "Please select a message first.");
    return;
  }
  const message = messages[0];

  // Load settings
  const settings = await browser.storage.sync.get(DEFAULTS);

  // Get full message body
  let emailBody = "";
  try {
    const full = await browser.messages.getFull(message.id);
    emailBody = extractTextBody(full);
    if (!emailBody) {
      notifyError("Empty body", "Could not extract plain text from this message.");
      return;
    }
  } catch (e) {
    notifyError("Message read error", e.message);
    return;
  }

  // Dispatch to the appropriate handler
  try {
    if (info.menuItemId === "thunderclerk-ai-add-calendar") {
      await handleCalendar(message, emailBody, settings);
    } else if (info.menuItemId === "thunderclerk-ai-add-task") {
      await handleTask(message, emailBody, settings);
    } else if (info.menuItemId === "thunderclerk-ai-draft-reply") {
      await handleDraftReply(message, emailBody, settings);
    } else if (info.menuItemId === "thunderclerk-ai-summarize-forward") {
      await handleSummarizeForward(message, emailBody, settings);
    } else if (info.menuItemId === "thunderclerk-ai-extract-contact") {
      await handleExtractContact(message, emailBody, settings);
    }
  } catch (e) {
    if (e.message?.includes("invalid JSON") || e.message?.includes("No JSON object") || e.message?.includes("Unclosed JSON")) {
      console.error("[ThunderClerk-AI] JSON parse failed:", e.message);
      notifyError("Parse error", "Model returned invalid JSON. Check the browser console for details.");
    } else {
      notifyError("Error", e.message);
    }
  }
});
