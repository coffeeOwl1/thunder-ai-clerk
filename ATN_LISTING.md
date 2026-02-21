# ATN Store Listing Text

## Extension Name
ThunderClerk-AI

## Summary (up to 250 characters)
Add emails to your Thunderbird calendar or task list in one click using a local Ollama AI model. No cloud service, no API key, no text selection — just right-click and go.

## Description (full)

**Turn emails into calendar events and tasks with a single right-click — using AI that runs entirely on your own machine.**

ThunderClerk-AI reads the full body of any selected email, sends it to a [local Ollama instance](https://ollama.com) of your choosing, and opens Thunderbird's native New Event or New Task dialog pre-filled with the AI-extracted details:

- Event or task title
- Start and end date/time (handles relative references like "next Tuesday")
- All-day flag
- Attendees (from the email's From/To headers, or a static address you configure)
- Description (email body, optionally with From + Subject header)
- Category (optionally chosen by the AI from your Thunderbird category list)

**No text selection required.** Unlike some other AI extensions, ThunderClerk-AI always reads the entire email body automatically.

**Your data stays local.** By default the extension talks to `http://127.0.0.1:11434` — Ollama running on your own machine. No email content is ever sent to the extension developer or any third party. You can point it at a remote Ollama host if you choose, but that's entirely under your control.

### Requirements
- Thunderbird 128 or later
- [Ollama](https://ollama.com) running locally (or on a network host you control)
- A model downloaded, e.g. `ollama pull mistral:7b`

### Quick start
1. Install the extension — the Settings page opens automatically
2. Choose your model from the dropdown (click Refresh if needed)
3. Right-click any email → "Add to Calendar" or "Add as Task"

### Settings
- Ollama host URL and model
- Which email addresses to suggest as attendees
- Default calendar to create events in
- Description format (full body, body only, or none)
- Fallback due date for tasks when no deadline is mentioned
- Optional AI category selection

## Categories
- Productivity
- Calendar

## Tags
ollama, ai, calendar, tasks, local-ai, llm

## Homepage URL
https://github.com/YOUR_USERNAME/thunderbird-thunderclerk-ai

## Support URL
https://github.com/YOUR_USERNAME/thunderbird-thunderclerk-ai/issues

## Privacy Policy URL
(Host PRIVACY.md on GitHub Pages or a static URL after creating the repo)

## License
GPL v3
