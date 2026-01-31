# Feature Log

## 2026-01-31
- Add multi-tool navigation with tabs to switch between Link Auditor and Status Validator.
- Add Status Code Validator tool for batch-checking HTTP status codes.
  - Two-panel layout: URL input on left, results on right.
  - Summary stats for 2xx, 3xx, 4xx, 5xx, and error counts.
  - Filter results by text or status category.
  - CSV export for status check results.
- Stop temporary debug instrumentation from recreating `.cursor/debug.log`.
- Add Railway deployment configs and Chromium settings for Puppeteer.

## 2026-01-30
- Group health report issues by page in the report view and CSV export.
- Add collapsible page groups with page-level status updates.
