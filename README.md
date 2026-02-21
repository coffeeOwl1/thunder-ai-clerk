# ThunderClerk-AI — Thunderbird Extension

Add emails to your Thunderbird calendar or task list with a single right-click, using a **local Ollama model** to extract the event or task details.

No cloud accounts, no API keys, no text selection required — just Thunderbird and a running [Ollama](https://ollama.com) instance.

---

## Features

- **Add to Calendar** — right-click any email and open a pre-filled New Event dialog
- **Add as Task** — right-click any email and open a pre-filled New Task dialog
- AI extracts title, dates, times, attendees, and (optionally) category
- Reads the full email body — no need to select text first
- All processing is done locally via your own Ollama instance
- Configurable: model, host, attendees source, default calendar, description format, categories

## Requirements

- Thunderbird 128 or later
- [Ollama](https://ollama.com) running locally (or on a reachable host)
- At least one model pulled, e.g. `ollama pull mistral:7b`

## Installation

### From ATN (addons.thunderbird.net)

Search for **ThunderClerk-AI** and click Install.

### From source

```
git clone https://github.com/YOUR_USERNAME/thunderbird-thunderclerk-ai
cd thunderbird-thunderclerk-ai
zip -r thunderclerk-ai.xpi . -x "*.git*" "node_modules/*" "tests/*" "*.md" "package*.json"
```

In Thunderbird: **Add-ons Manager → gear icon → Install Add-on From File** → select `thunderclerk-ai.xpi`.

## Configuration

After installation the Settings page opens automatically. You can also reach it via **Add-ons Manager → ThunderClerk-AI → Preferences**.

| Setting | Default | Description |
|---|---|---|
| Ollama Host URL | `http://127.0.0.1:11434` | Where Ollama is running |
| Model | `mistral:7b` | Which model to use (dropdown populated from Ollama) |
| Default Calendar | (currently selected) | Which calendar to create events in |
| Attendees | From + To | Which addresses to suggest to the AI |
| Event Description | Body + From + Subject | What to pre-fill in the event Description field |
| Task Description | Body + From + Subject | What to pre-fill in the task Description field |
| Default Due Date | None | Fallback when no deadline is found |
| Auto-select category | Off | Ask the AI to pick the best category for events/tasks |

## Privacy

Email content is sent to the Ollama host you configure — by default your own machine. Nothing is sent to the extension developer or any third party. See [PRIVACY.md](PRIVACY.md) for details.

## License

GPL v3 — see [LICENSE](LICENSE).

The CalendarTools experiment API is adapted from [ThunderAI Sparks](https://micz.it/thunderbird-addon-thunderai/#sparks) by Mic (m@micz.it), Copyright (C) 2024-2025, GPL v3.

## Development

```
npm install        # install Jest for tests
npm test           # run unit tests
```
