# Changelog

## 0.2.0 (2026-10-05)

- New **PostEverywhere Trigger** node. It starts a workflow on any of the 15 PostEverywhere webhook events (post scheduled, published, failed and more). It creates the webhook when you activate the workflow and deletes it when you deactivate it. It checks the signature of every call.

## 0.1.0 (2026-09-29)

First release.

- PostEverywhere API credential with an API key (Bearer auth). The credential test calls `GET /me`.
- Post: Create (publish now, schedule, add to queue, save as draft), Get, Get Many, Update, Delete, Get Results, Retry, Schedule Draft.
- Account: Get Many, Get. Accounts show in a dropdown as `platform: account name`.
- Media: Upload From URL, Get Many.
- AI: Generate Caption.
- Analytics: Get Summary.
- Times without an offset are read in the node or workflow timezone and sent as UTC.
- Clear API error messages with the error code and request ID. Supports Continue On Fail.
- Waits and retries on HTTP 429. Retries 5xx for read requests only.
