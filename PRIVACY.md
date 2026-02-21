# Privacy Policy — Thunder AI Clerk

**Last updated: 2025**

## Summary

Thunder AI Clerk sends email content to a local AI service that you configure and control. It does not collect, store, or transmit any data to the extension developer or any third party.

## What data is processed

When you right-click an email and choose "Add to Calendar" or "Add as Task", the extension reads:

- The plain-text body of the selected email
- The email's sender, recipients, subject, and date

This data is sent as a prompt to the Ollama instance configured in the extension settings (default: `http://127.0.0.1:11434`). The request goes directly from Thunderbird to that host — no data passes through any server operated by the extension developer.

## What data is stored

- **Extension settings** (Ollama host URL, model name, and your preferences) are stored locally in Thunderbird's extension storage (`browser.storage.sync`). If Firefox Sync is enabled in your Thunderbird profile, these settings may be synced across your devices via your Mozilla account.
- No email content is ever stored by the extension.

## Third-party services

The extension communicates only with the Ollama endpoint you configure. By default this is a local server (`127.0.0.1`) that runs entirely on your own machine. If you configure a remote Ollama host, you are responsible for understanding the privacy implications of sending email content to that host.

## Permissions used

| Permission | Why it is needed |
|---|---|
| `messagesRead` | To read the body of the selected email |
| `menus` | To add "Add to Calendar" / "Add as Task" to the message right-click menu |
| `storage` | To save your settings locally |
| `messageDisplay` | To identify which message is displayed/selected |
| `notifications` | To show error notifications if something goes wrong |

The extension does **not** request access to all your messages, your address book, your calendar data directly, or any network resource other than the Ollama host you configure.

## Contact

If you have questions about this privacy policy, please open an issue on the project's GitHub repository.
