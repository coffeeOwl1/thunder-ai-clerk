"use strict";

const {
  normalizeCalDate,
  extractJSON,
  buildAttendeesHint,
  buildDescription,
  buildCategoryInstruction,
  isValidHostUrl,
  extractTextBody,
} = require("../utils.js");

// ---------------------------------------------------------------------------
// normalizeCalDate
// ---------------------------------------------------------------------------
describe("normalizeCalDate", () => {
  test("returns null/undefined unchanged", () => {
    expect(normalizeCalDate(null)).toBe(null);
    expect(normalizeCalDate(undefined)).toBe(undefined);
    expect(normalizeCalDate("")).toBe("");
  });

  test("passes already-correct compact format through", () => {
    expect(normalizeCalDate("20260225T140000")).toBe("20260225T140000");
  });

  test("strips ISO 8601 dashes and colons", () => {
    expect(normalizeCalDate("2026-02-25T14:00:00")).toBe("20260225T140000");
  });

  test("strips trailing Z", () => {
    expect(normalizeCalDate("2026-02-25T14:00:00Z")).toBe("20260225T140000");
  });

  test("strips timezone offset", () => {
    expect(normalizeCalDate("2026-02-25T14:00:00+0530")).toBe("20260225T140000");
    expect(normalizeCalDate("2026-02-25T09:30:00-0500")).toBe("20260225T093000");
  });

  test("strips fractional seconds", () => {
    expect(normalizeCalDate("2026-02-25T14:00:00.000Z")).toBe("20260225T140000");
  });

  test("pads truncated time to 6 digits", () => {
    // Model returned only hours
    expect(normalizeCalDate("2028-01-10T13")).toBe("20280110T130000");
    // Model returned hours:minutes with trailing colons stripped
    expect(normalizeCalDate("2028-01-10T13::")).toBe("20280110T130000");
  });

  test("date-only string gets midnight time", () => {
    expect(normalizeCalDate("20260225")).toBe("20260225T000000");
    expect(normalizeCalDate("2026-02-25")).toBe("20260225T000000");
  });
});

// ---------------------------------------------------------------------------
// extractJSON
// ---------------------------------------------------------------------------
describe("extractJSON", () => {
  test("extracts a plain JSON object", () => {
    const raw = '{"summary":"Team lunch","startDate":"20260301T120000"}';
    expect(extractJSON(raw)).toBe(raw);
  });

  test("strips markdown json fence", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJSON(raw)).toBe('{"a":1}');
  });

  test("strips plain markdown fence", () => {
    const raw = "```\n{\"a\":1}\n```";
    expect(extractJSON(raw)).toBe('{"a":1}');
  });

  test("ignores preamble text before {", () => {
    const raw = 'Here is the JSON:\n{"a":1}';
    expect(extractJSON(raw)).toBe('{"a":1}');
  });

  test("handles nested objects", () => {
    const raw = '{"outer":{"inner":42},"x":1}';
    expect(extractJSON(raw)).toBe(raw);
  });

  test("throws on no JSON object", () => {
    expect(() => extractJSON("no braces here")).toThrow("No JSON object found");
  });

  test("throws on unclosed object", () => {
    expect(() => extractJSON('{"a":1')).toThrow("Unclosed JSON object");
  });

  test("parse round-trip", () => {
    const obj = { summary: "Test", startDate: "20260301T090000", forceAllDay: false };
    const raw = JSON.stringify(obj);
    expect(JSON.parse(extractJSON(raw))).toEqual(obj);
  });
});

// ---------------------------------------------------------------------------
// buildAttendeesHint
// ---------------------------------------------------------------------------
describe("buildAttendeesHint", () => {
  const msg = {
    author: "alice@example.com",
    recipients: ["bob@example.com", "carol@example.com"],
  };

  test("from_to returns author + recipients", () => {
    expect(buildAttendeesHint(msg, "from_to", "")).toEqual([
      "alice@example.com", "bob@example.com", "carol@example.com",
    ]);
  });

  test("from returns only author", () => {
    expect(buildAttendeesHint(msg, "from", "")).toEqual(["alice@example.com"]);
  });

  test("to returns only recipients", () => {
    expect(buildAttendeesHint(msg, "to", "")).toEqual(["bob@example.com", "carol@example.com"]);
  });

  test("static returns the configured email", () => {
    expect(buildAttendeesHint(msg, "static", "me@example.com")).toEqual(["me@example.com"]);
  });

  test("static with empty string returns []", () => {
    expect(buildAttendeesHint(msg, "static", "")).toEqual([]);
  });

  test("none returns []", () => {
    expect(buildAttendeesHint(msg, "none", "")).toEqual([]);
  });

  test("unknown source defaults to from_to", () => {
    expect(buildAttendeesHint(msg, "unknown", "")).toEqual([
      "alice@example.com", "bob@example.com", "carol@example.com",
    ]);
  });

  test("handles missing author gracefully", () => {
    const noAuthor = { recipients: ["bob@example.com"] };
    expect(buildAttendeesHint(noAuthor, "from_to", "")).toEqual(["bob@example.com"]);
  });
});

// ---------------------------------------------------------------------------
// buildDescription
// ---------------------------------------------------------------------------
describe("buildDescription", () => {
  const body    = "Please join us for the Q1 review.";
  const author  = "alice@example.com";
  const subject = "Q1 Review Meeting";

  test("body_from_subject (default) includes from, subject, and body", () => {
    const result = buildDescription(body, author, subject, "body_from_subject");
    expect(result).toContain(`From: ${author}`);
    expect(result).toContain(`Subject: ${subject}`);
    expect(result).toContain(body);
  });

  test("body returns only the email body", () => {
    expect(buildDescription(body, author, subject, "body")).toBe(body);
  });

  test("none returns null", () => {
    expect(buildDescription(body, author, subject, "none")).toBeNull();
  });

  test("unknown format defaults to body_from_subject", () => {
    const result = buildDescription(body, author, subject, "unknown");
    expect(result).toContain(`From: ${author}`);
  });
});

// ---------------------------------------------------------------------------
// buildCategoryInstruction
// ---------------------------------------------------------------------------
describe("buildCategoryInstruction", () => {
  test("returns empty strings when no categories", () => {
    expect(buildCategoryInstruction([])).toEqual({ instruction: "", jsonLine: "" });
    expect(buildCategoryInstruction(null)).toEqual({ instruction: "", jsonLine: "" });
  });

  test("includes all category names in instruction", () => {
    const cats = ["Family", "Work", "Personal"];
    const { instruction, jsonLine } = buildCategoryInstruction(cats);
    expect(instruction).toContain("Family");
    expect(instruction).toContain("Work");
    expect(instruction).toContain("Personal");
    expect(jsonLine).toContain("category");
  });
});

// ---------------------------------------------------------------------------
// isValidHostUrl
// ---------------------------------------------------------------------------
describe("isValidHostUrl", () => {
  test("accepts http URLs", () => {
    expect(isValidHostUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isValidHostUrl("http://localhost:11434")).toBe(true);
  });

  test("accepts https URLs", () => {
    expect(isValidHostUrl("https://ollama.example.com")).toBe(true);
  });

  test("rejects non-URL strings", () => {
    expect(isValidHostUrl("not a url")).toBe(false);
    expect(isValidHostUrl("")).toBe(false);
  });

  test("rejects other protocols", () => {
    expect(isValidHostUrl("ftp://example.com")).toBe(false);
    expect(isValidHostUrl("file:///etc/passwd")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractTextBody
// ---------------------------------------------------------------------------
describe("extractTextBody", () => {
  test("returns body of a plain text part", () => {
    const part = { contentType: "text/plain", body: "Hello world" };
    expect(extractTextBody(part)).toBe("Hello world");
  });

  test("recurses into parts to find text/plain", () => {
    const part = {
      contentType: "multipart/alternative",
      parts: [
        { contentType: "text/html", body: "<p>Hello</p>" },
        { contentType: "text/plain", body: "Hello" },
      ],
    };
    expect(extractTextBody(part)).toBe("Hello");
  });

  test("returns empty string when no text/plain found", () => {
    const part = { contentType: "text/html", body: "<p>Hi</p>" };
    expect(extractTextBody(part)).toBe("");
  });

  test("handles null input", () => {
    expect(extractTextBody(null)).toBe("");
  });
});
