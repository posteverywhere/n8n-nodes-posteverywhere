import { createHmac, timingSafeEqual } from 'crypto';

/** Every event PostEverywhere can send to a webhook (GET /webhooks docs). */
export const WEBHOOK_EVENTS = [
	{ name: 'Account Connected', value: 'account.connected' },
	{ name: 'Account Disconnected', value: 'account.disconnected' },
	{ name: 'Account Reconnect Needed', value: 'account.reconnect_needed' },
	{ name: 'Media Deleted', value: 'media.deleted' },
	{ name: 'Media Uploaded', value: 'media.uploaded' },
	{ name: 'Post Approval Requested', value: 'post.approval_requested' },
	{ name: 'Post Approved', value: 'post.approved' },
	{ name: 'Post Changes Requested', value: 'post.changes_requested' },
	{ name: 'Post Deleted', value: 'post.deleted' },
	{ name: 'Post Failed', value: 'post.failed' },
	{ name: 'Post Partially Failed', value: 'post.partially_failed' },
	{ name: 'Post Published', value: 'post.published' },
	{ name: 'Post Publishing', value: 'post.publishing' },
	{ name: 'Post Scheduled', value: 'post.scheduled' },
	{ name: 'Post Updated', value: 'post.updated' },
] as const;

/**
 * Checks the X-PostEverywhere-Signature header: `sha256=<hex HMAC-SHA256 of
 * the raw body>`, keyed with the secret returned when the webhook was made.
 */
export function isValidSignature(
	rawBody: string | Buffer,
	header: string | undefined,
	secret: string,
): boolean {
	if (!header) return false;
	const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
	const a = Buffer.from(header.trim());
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** True when two event lists hold the same events, in any order. */
export function sameEvents(a: unknown, b: string[]): boolean {
	if (!Array.isArray(a) || a.length !== b.length) return false;
	const set = new Set(a.map(String));
	return b.every((e) => set.has(e));
}
