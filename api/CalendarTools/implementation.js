/*
 * Thunder AI Clerk - Thunderbird Extension
 * CalendarTools Experiment API
 *
 * Adapted from ThunderAI Sparks (https://micz.it/thunderbird-addon-thunderai/#sparks)
 * Original Copyright (C) 2024-2025 Mic (m@micz.it) — GPL v3
 *
 * WHY AN EXPERIMENT API?
 * ----------------------
 * Thunderbird's WebExtension APIs (TB 128+) do not expose the native calendar
 * dialog functions (createEventWithDialog / createTodoWithDialog) or the
 * calendar manager to extension background scripts. This Experiment API bridges
 * that gap by running privileged code in the "addon_parent" scope (chrome process)
 * where those functions are available via XPCOM / ChromeUtils.
 *
 * WHAT THIS FILE DOES (summary for ATN reviewers)
 * ------------------------------------------------
 *  openCalendarDialog  — calls window.createEventWithDialog() to open the
 *                        native New Event dialog, pre-filled with AI-extracted
 *                        data. Uses CalEvent (XPCOM) to carry description,
 *                        attendees, and category that the dialog API doesn't
 *                        accept as plain parameters.
 *
 *  openTaskDialog      — calls createTodoWithDialog() (from window or the
 *                        calendar-item-editing module) to open the native
 *                        New Task dialog, pre-filled with AI-extracted data.
 *
 *  getCategories       — reads the list of user-configured calendar categories
 *                        from the "calendar.categories.names" preference so
 *                        the background script can pass them to the AI prompt.
 *
 *  getCalendars        — returns the names and IDs of all enabled calendars so
 *                        the options page can populate a dropdown.
 *
 * NO DATA LEAVES THUNDERBIRD VIA THIS FILE. All network I/O is done in the
 * unprivileged background.js using the standard fetch() API.
 */

/* global Services, ExtensionCommon */

"use strict";

(function (exports) {

  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  var { CalTimezoneService } = ChromeUtils.importESModule("resource:///modules/CalTimezoneService.sys.mjs");
  var { CalAttendee } = ChromeUtils.importESModule("resource:///modules/CalAttendee.sys.mjs");

  var CalEvent = null;
  try {
    ({ CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs"));
  } catch (e) {
    console.warn("[ThunderAIClerk] CalEvent import failed:", e.message);
  }

  var CalTodo = null;
  try {
    ({ CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs"));
  } catch (e) {
    console.warn("[ThunderAIClerk] CalTodo import failed:", e.message);
  }

  // createTodoWithDialog may live on the window (older TB) or in the module (TB 128+).
  function getCreateTodoFn(window) {
    if (typeof window.createTodoWithDialog === "function") {
      return window.createTodoWithDialog.bind(window);
    }
    try {
      const mod = ChromeUtils.importESModule(
        "resource:///modules/calendar/calendar-item-editing.sys.mjs"
      );
      if (typeof mod.createTodoWithDialog === "function") {
        console.log("[ThunderAIClerk] Using createTodoWithDialog from calendar-item-editing module");
        return mod.createTodoWithDialog;
      }
    } catch (e) {
      console.warn("[ThunderAIClerk] calendar-item-editing module not found:", e.message);
    }
    return null;
  }

  // Set a category on a calIItem.
  // `item.categories` has no setter in Thunderbird's ESM calendar classes —
  // assigning to it silently does nothing. Use setCategories() (modern API)
  // with setProperty("CATEGORIES", ...) as a fallback.
  function setItemCategory(item, category) {
    if (!category) return;
    if (typeof item.setCategories === "function") {
      try {
        item.setCategories([category]);
        return;
      } catch (e) {
        console.warn("[ThunderAIClerk] setCategories([]) failed:", e.message);
      }
    }
    try {
      item.setProperty("CATEGORIES", category);
    } catch (e) {
      console.warn("[ThunderAIClerk] Could not set category:", e.message);
    }
  }

  function findCalendarByName(name) {
    if (!name) return null;
    try {
      const calendars = cal.manager.getCalendars();
      return calendars.find(c => c.name === name && !c.getProperty("disabled")) || null;
    } catch (e) {
      console.warn("[ThunderAIClerk] findCalendarByName error:", e.message);
      return null;
    }
  }

  var CalendarTools = class extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        CalendarTools: {

          async openCalendarDialog(cal_data) {
            let window = Services.wm.getMostRecentWindow("mail:3pane");
            if (!window) {
              throw new Error("No active Thunderbird window found");
            }
            try {
              let startDate = cal.createDateTime(cal_data.startDate);
              let endDate = cal.createDateTime(cal_data.endDate);

              if (cal_data.use_timezone) {
                const timezoneService = new CalTimezoneService();
                startDate.timezone = timezoneService.getTimezone(cal_data.timezone);
                endDate.timezone = timezoneService.getTimezone(cal_data.timezone);
              }

              let attendees_obj = [];
              if (cal_data.attendees != null) {
                attendees_obj = cal_data.attendees.map(attendee => {
                  const addr = attendee.startsWith("mailto:") ? attendee : "mailto:" + attendee;
                  return new CalAttendee("ATTENDEE:" + addr, "", "REQ-PARTICIPANT", "", "");
                });
              }

              // Build a pre-populated CalEvent when we have description or attendees,
              // because createEventWithDialog uses the event object directly and ignores
              // the standalone attendees parameter when event != null.
              let calEvent = null;
              const needsEvent = cal_data.description || attendees_obj.length > 0 || cal_data.category;
              if (needsEvent && CalEvent) {
                try {
                  calEvent = new CalEvent();
                  calEvent.startDate = startDate.clone();
                  calEvent.endDate   = endDate.clone();
                  calEvent.title     = cal_data.summary || "";
                  if (cal_data.description) {
                    calEvent.setProperty("DESCRIPTION", cal_data.description);
                  }
                  setItemCategory(calEvent, cal_data.category);
                  for (const attendee of attendees_obj) {
                    calEvent.addAttendee(attendee);
                  }
                } catch (e) {
                  console.warn("[ThunderAIClerk] Could not set up CalEvent:", e.message);
                  calEvent = null;
                }
              }

              let curr_calendar = findCalendarByName(cal_data.calendar_name) || window.getSelectedCalendar();

              window.createEventWithDialog(
                curr_calendar,
                startDate,
                endDate,
                cal_data.summary,
                calEvent,
                cal_data.forceAllDay,
                calEvent ? [] : attendees_obj
              );
            } catch (e) {
              console.error("[ThunderAIClerk] openCalendarDialog error:", e);
              return { result: false, error: e.message };
            }
            return { result: true };
          },

          async openTaskDialog(task_data) {
            let window = Services.wm.getMostRecentWindow("mail:3pane");
            if (!window) {
              throw new Error("No active Thunderbird window found");
            }
            try {
              let dueDate     = task_data.dueDate     ? cal.createDateTime(task_data.dueDate)     : null;
              let initialDate = task_data.initialDate ? cal.createDateTime(task_data.initialDate) : null;

              if (task_data.use_timezone) {
                const timezoneService = new CalTimezoneService();
                if (dueDate)     dueDate.timezone     = timezoneService.getTimezone(task_data.timezone);
                if (initialDate) initialDate.timezone = timezoneService.getTimezone(task_data.timezone);
              }

              let curr_calendar = findCalendarByName(task_data.calendar_name) || window.getSelectedCalendar();

              // Build a pre-populated CalTodo when we have a description, so we can
              // pass it as the todo argument and have the description pre-filled.
              let calTodo = null;
              if ((task_data.description || task_data.category) && CalTodo) {
                try {
                  calTodo = new CalTodo();
                  calTodo.title = task_data.summary || "";
                  if (dueDate)     calTodo.dueDate   = dueDate.clone();
                  if (initialDate) calTodo.entryDate = initialDate.clone();
                  calTodo.setProperty("DESCRIPTION", task_data.description);
                  setItemCategory(calTodo, task_data.category);
                } catch (e) {
                  console.warn("[ThunderAIClerk] Could not set up CalTodo:", e.message);
                  calTodo = null;
                }
              }

              const createTodo = getCreateTodoFn(window);
              if (!createTodo) {
                throw new Error("createTodoWithDialog not available in this Thunderbird version");
              }

              console.log("[ThunderAIClerk] calling createTodoWithDialog", {
                calendar: curr_calendar?.name,
                dueDate: dueDate?.icalString,
                summary: task_data.summary,
                hasTodo: !!calTodo,
                initialDate: initialDate?.icalString,
              });

              createTodo(curr_calendar, dueDate, task_data.summary, calTodo, initialDate);

            } catch (e) {
              console.error("[ThunderAIClerk] openTaskDialog error:", e);
              return { result: false, error: e.message };
            }
            return { result: true };
          },

          async getCategories() {
            try {
              const pref = Services.prefs.getCharPref("calendar.categories.names", "");
              if (!pref) return [];
              return pref.split(",").map(s => s.trim()).filter(Boolean).sort();
            } catch (e) {
              console.error("[ThunderAIClerk] getCategories error:", e);
              return [];
            }
          },

          async getCalendars() {
            try {
              const calendars = cal.manager.getCalendars();
              return calendars
                .filter(c => !c.getProperty("disabled"))
                .map(c => ({ name: c.name, id: c.id }));
            } catch (e) {
              console.error("[ThunderAIClerk] getCalendars error:", e);
              return [];
            }
          }

        }
      };
    }
  };

  exports.CalendarTools = CalendarTools;

})(this);
