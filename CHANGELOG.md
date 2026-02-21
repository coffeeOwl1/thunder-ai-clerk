# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- "AI-generated summary" description format option for events and tasks — the AI produces a concise 1-2 sentence summary instead of pasting the raw email body

## [1.0.0] — 2025

### Added
- Right-click context menu items "Add to Calendar" and "Add as Task" on messages
- Reads full email body via `messages.getFull()` — no text selection required
- Ollama integration: POST to `/api/generate`, 60-second timeout, progress notification
- Configurable Ollama host and model (dropdown populated live from Ollama)
- Configurable attendees source: From + To, From only, To only, Static address, None
- Configurable default calendar (dropdown populated from Thunderbird calendars)
- Configurable event and task description format
- Configurable fallback due date for tasks
- Optional AI-assisted category selection using Thunderbird's configured categories
- First-run onboarding: settings page opens automatically on install with data notice
- Input validation: host URL format, static email format
- GPL v3 license; CalendarTools API adapted from ThunderAI Sparks
