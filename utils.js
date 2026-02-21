"use strict";

// Pure utility functions shared between background.js and unit tests.
// No browser or XPCOM APIs are used here.

function extractTextBody(part) {
  if (!part) return "";
  if (part.contentType === "text/plain" && part.body) {
    return part.body;
  }
  if (part.parts) {
    for (const child of part.parts) {
      const text = extractTextBody(child);
      if (text) return text;
    }
  }
  return "";
}

function formatDatetime(date) {
  if (!date) return new Date().toString();
  return new Date(date).toLocaleString("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function currentDatetime() {
  return new Date().toLocaleString("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

// Normalize a date string to the compact iCal format YYYYMMDDTHHMMSS
// that cal.createDateTime() requires.  Handles:
//   2026-02-25T14:00:00        (ISO 8601)
//   2026-02-25T14:00:00Z       (UTC suffix)
//   2026-02-25T14:00:00+05:30  (tz offset)
//   2028-01-10T13::            (model returning truncated/malformed time)
//   20260225T140000            (already correct)
//   20260225                   (date only → midnight)
function normalizeCalDate(dateStr) {
  if (!dateStr) return dateStr;

  let s = dateStr
    .replace(/-/g, "")         // remove date dashes
    .replace(/:/g, "")         // remove time colons (and trailing colons from malformed values)
    .replace(/Z$/i, "")        // remove trailing Z
    .replace(/[+-]\d{4}$/, "") // remove ±HHMM tz offset
    .replace(/\.\d+$/, "");    // remove fractional seconds

  const tIdx = s.indexOf("T");
  if (tIdx === -1) {
    // Date only — treat as all-day / midnight
    return s.slice(0, 8) + "T000000";
  }

  const datePart = s.slice(0, tIdx).slice(0, 8);          // exactly 8 digits
  const timePart = s.slice(tIdx + 1).slice(0, 6).padEnd(6, "0"); // pad HH → HH0000 etc.
  return datePart + "T" + timePart;
}

// Extract the first complete JSON object from a string, handling
// markdown fences and any preamble the model may emit.
function extractJSON(text) {
  const fenced = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();

  const start = fenced.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model output");

  let depth = 0;
  let end = -1;
  for (let i = start; i < fenced.length; i++) {
    if (fenced[i] === "{") depth++;
    else if (fenced[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error("Unclosed JSON object in model output");

  return fenced.slice(start, end + 1);
}

// Build the attendee addresses to hint to the AI based on user's setting.
function buildAttendeesHint(message, source, staticEmail) {
  switch (source) {
    case "from":
      return message.author ? [message.author] : [];
    case "to":
      return message.recipients || [];
    case "static":
      return staticEmail ? [staticEmail] : [];
    case "none":
      return [];
    case "from_to":
    default: {
      const all = [];
      if (message.author) all.push(message.author);
      for (const r of (message.recipients || [])) all.push(r);
      return all;
    }
  }
}

// Build the description string to inject directly into the calendar event.
function buildDescription(emailBody, author, subject, format) {
  switch (format) {
    case "body":
      return emailBody;
    case "none":
      return null;
    case "body_from_subject":
    default:
      return `From: ${author}\nSubject: ${subject}\n\n${emailBody}`;
  }
}

function buildCategoryInstruction(categories) {
  if (!categories || categories.length === 0) return { instruction: "", jsonLine: "" };
  return {
    instruction: `Select the single most appropriate category for the "category" field using these guidelines:
- Available categories: ${categories.join(", ")}
- The subject line is the strongest signal — match it directly if a category fits
- Prefer the most specific matching category (e.g. prefer "Family" over "Personal" or "Miscellaneous" for family events, "Work" or "Business" over "Personal" for professional events)
- Only use a generic category like "Miscellaneous" or "Other" if no specific category clearly applies
- If truly none fit, use an empty string`,
    jsonLine: ',\n"category": "CategoryName"',
  };
}

function isValidHostUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Node.js export (used by Jest tests). Browser environment ignores this block.
if (typeof module !== "undefined") {
  module.exports = {
    extractTextBody,
    normalizeCalDate,
    extractJSON,
    buildAttendeesHint,
    buildDescription,
    buildCategoryInstruction,
    isValidHostUrl,
    formatDatetime,
    currentDatetime,
  };
}
