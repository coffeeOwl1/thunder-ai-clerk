"use strict";

document.addEventListener("DOMContentLoaded", async () => {
  const { pendingAnalysis } = await browser.storage.local.get({ pendingAnalysis: null });

  if (!pendingAnalysis) {
    document.getElementById("loading").textContent = "No analysis data found.";
    return;
  }

  const analysis = pendingAnalysis;

  // --- Render summary ---
  document.getElementById("summary").textContent = analysis.summary || "(no summary)";

  // --- Render detected items ---
  const detectedEl = document.getElementById("detected-items");
  const detectedSection = document.getElementById("detected-section");
  let hasDetected = false;

  const groups = [
    { key: "events", label: "Calendar Events", prefix: "event", forceRow: "force-calendar-row" },
    { key: "tasks", label: "Tasks", prefix: "task", forceRow: "force-task-row" },
    { key: "contacts", label: "Contacts", prefix: "contact", forceRow: "force-contact-row" },
  ];

  for (const group of groups) {
    const items = analysis[group.key];
    if (!Array.isArray(items) || items.length === 0) {
      // No items detected — show the fallback override in the Actions section
      document.getElementById(group.forceRow).style.display = "";
      continue;
    }

    hasDetected = true;
    const groupDiv = document.createElement("div");
    groupDiv.className = "group";

    const groupLabel = document.createElement("div");
    groupLabel.className = "group-label";
    groupLabel.textContent = group.label;
    groupDiv.appendChild(groupLabel);

    items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "item-row";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `${group.prefix}-${idx}`;
      cb.checked = true;
      cb.dataset.group = group.key;
      cb.dataset.index = idx;

      const label = document.createElement("label");
      label.htmlFor = cb.id;
      // LLMs may use different keys — try common variants
      const previewText = typeof item === "string" ? item
        : item.preview || item.title || item.name || item.description
          || item.summary || item.label || null;
      label.textContent = previewText || `${group.label} item ${idx + 1}`;

      row.appendChild(cb);
      row.appendChild(label);
      groupDiv.appendChild(row);
    });

    detectedEl.appendChild(groupDiv);
  }

  // Hide detected section if nothing was found
  if (!hasDetected) {
    detectedSection.style.display = "none";
  }

  // --- Archive/Delete mutual exclusion ---
  const archiveCb = document.getElementById("action-archive");
  const deleteCb = document.getElementById("action-delete");

  archiveCb.addEventListener("change", () => {
    if (archiveCb.checked) deleteCb.checked = false;
  });
  deleteCb.addEventListener("change", () => {
    if (deleteCb.checked) archiveCb.checked = false;
  });

  // --- Show content, hide loading ---
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "";

  // --- Button handlers ---
  document.getElementById("ok-btn").addEventListener("click", async () => {
    const selections = buildSelections();
    await browser.runtime.sendMessage({ analyzeAction: "ok", selections });
    window.close();
  });

  document.getElementById("cancel-btn").addEventListener("click", async () => {
    await browser.runtime.sendMessage({ analyzeAction: "cancel" });
    window.close();
  });
});

function buildSelections() {
  const selections = {
    events: [],
    tasks: [],
    contacts: [],
    forceCalendar: document.getElementById("action-force-calendar").checked,
    forceTask: document.getElementById("action-force-task").checked,
    forceContact: document.getElementById("action-force-contact").checked,
    reply: document.getElementById("action-reply").checked,
    forward: document.getElementById("action-forward").checked,
    catalog: document.getElementById("action-catalog").checked,
    archive: document.getElementById("action-archive").checked,
    delete: document.getElementById("action-delete").checked,
  };

  // Collect checked detected items
  document.querySelectorAll('#detected-items input[type="checkbox"]:checked').forEach(cb => {
    const group = cb.dataset.group;
    const index = parseInt(cb.dataset.index, 10);
    if (selections[group]) selections[group].push(index);
  });

  return selections;
}
