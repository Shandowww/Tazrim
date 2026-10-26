# Personal app defaults

These defaults reflect Tal's app preferences from this project and the parking app. Apply them when building or improving his apps; explicit instructions and an established app's requirements take precedence. They are design and behaviour defaults, not a request to add unrelated features to every app.

## Appearance

- Apple-inspired interfaces: system fonts, clear hierarchy, calm surfaces, rounded cards and controls, restrained accent colours and subtle feedback. Follow the spirit of Apple interfaces rather than copying a specific Apple app.
- Design for phone use first, including an iPhone home-screen experience when relevant, and keep desktop use comfortable.
- Prefer Hebrew and complete RTL for personal apps unless another language is requested. Mirror navigation and layout intentionally; isolate numbers, currency signs, emails and mixed-language content.
- Include an appearance setting with System, Light and Dark choices. Default to System; apply changes immediately, remember the choice on each device and make it independent of saving app records. Follow later system changes when System is selected.
- Support light/dark system appearance, safe-area insets, readable text, touch-sized controls, keyboard access and reduced-motion preferences.
- Make charts understandable with units, meaningful labels, legends and concise explanations. Use progress and celebrations when the app tracks actual goals, without confusing predictions with completed achievements.

## Basic behaviour

- For apps with refreshable data, provide pull-down refresh from the top on touch devices, plus an accessible refresh action for desktop. Avoid triggering it during ordinary scrolling, horizontal swipes, input interaction or dialogs. Protect unsaved changes. Refresh should retrieve the latest UI as well as saved data when appropriate; for these simple hosted apps, use a guarded full-page reload with a connectivity check.
- When an app issue can be fixed inside the app, include a button or link to the exact screen/control, with temporary contextual guidance. Avoid notification-only instructions to find settings manually. Preserve unfinished edits during the transition.
- Show loading, save status, successful updates and actionable failures. Retry safely; preserve the last usable view if a refresh fails. Do not imply success until the action succeeds.
- Make persistence clear. Preserve an existing explicit-save or autosave model; prevent silent overwrites between devices. Offer backup/export/import for personal records where useful.
- Use private access for personal information. If multiple people use an app, keep their data separate unless sharing is explicitly requested. Make the signed-in account easy to identify.
- Keep apps lightweight. Prefer browser calculations and existing hosting. Do not buy a server, upgrade paid resources or introduce background services without a request.
- For phone apps, consider home-screen metadata and a proper app icon. Offline use and notifications require an actual implementation and verification; do not imply they are available by default.

## Applying these preferences

Use these defaults for future app work, while retaining the app's purpose and existing behaviour. Do not automatically retrofit every existing app. Extend this file when the user states a new general preference. Product-specific financial goals, privacy audiences and storage details belong in the relevant project's instructions.
