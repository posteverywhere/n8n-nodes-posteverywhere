import { describe, expect, it } from 'vitest';
import { buildRequest } from '../nodes/PostEverywhere/requests';
import { toIntArray, toJsonObject, toUtcIso } from '../nodes/PostEverywhere/utils';

const params =
	(values: Record<string, unknown>) =>
	(name: string, fallback?: unknown): unknown =>
		name in values ? values[name] : fallback;

const ctx = { workflowTimezone: 'UTC' };

describe('toUtcIso', () => {
	it('keeps an explicit UTC or offset time as the same instant', () => {
		expect(toUtcIso('2026-10-01T09:30:00Z', 'Asia/Tokyo')).toBe('2026-10-01T09:30:00.000Z');
		expect(toUtcIso('2026-10-01T09:30:00+02:00', 'UTC')).toBe('2026-10-01T07:30:00.000Z');
	});

	it('reads a time without an offset in the given timezone', () => {
		// New York is UTC-4 in October (daylight time) and UTC-5 in December.
		expect(toUtcIso('2026-10-01T09:30:00', 'America/New_York')).toBe('2026-10-01T13:30:00.000Z');
		expect(toUtcIso('2026-12-01T09:30:00', 'America/New_York')).toBe('2026-12-01T14:30:00.000Z');
		expect(toUtcIso('2026-10-01T09:30', 'Asia/Jakarta')).toBe('2026-10-01T02:30:00.000Z');
	});

	it('accepts a Luxon-like object from an expression', () => {
		expect(toUtcIso({ toISO: () => '2026-10-01T09:30:00.000+07:00' }, 'UTC')).toBe(
			'2026-10-01T02:30:00.000Z',
		);
	});

	it('returns undefined for empty values and throws on bad input', () => {
		expect(toUtcIso('', 'UTC')).toBeUndefined();
		expect(() => toUtcIso('next tuesday', 'UTC')).toThrow(/not a valid date/);
		expect(() => toUtcIso('2026-10-01T09:30:00', 'Mars/Base')).toThrow(/not a valid IANA timezone/);
	});
});

describe('value helpers', () => {
	it('parses account IDs from arrays and comma lists', () => {
		expect(toIntArray([1, '2'], 'Account IDs')).toEqual([1, 2]);
		expect(toIntArray('3, 4,', 'Account IDs')).toEqual([3, 4]);
		expect(() => toIntArray('abc', 'Account IDs')).toThrow(/whole numbers/);
	});

	it('parses platform content JSON', () => {
		expect(toJsonObject('{"x":{"content":"hi"}}', 'Platform Content')).toEqual({
			x: { content: 'hi' },
		});
		expect(toJsonObject('{}', 'Platform Content')).toBeUndefined();
		expect(() => toJsonObject('{bad', 'Platform Content')).toThrow(/not valid JSON/);
		expect(() => toJsonObject('[1]', 'Platform Content')).toThrow(/JSON object/);
	});
});

describe('buildRequest: post create', () => {
	it('publishes now by default', () => {
		const spec = buildRequest(
			'post',
			'create',
			params({ content: 'Hello', accountIds: [2280, 2291], mode: 'now' }),
			ctx,
		);
		expect(spec).toEqual({
			method: 'POST',
			path: '/posts',
			body: { content: 'Hello', account_ids: [2280, 2291] },
		});
	});

	it('schedules with the node timezone and converts to UTC', () => {
		const spec = buildRequest(
			'post',
			'create',
			params({
				content: 'Later',
				accountIds: [1],
				mode: 'schedule',
				scheduledFor: '2026-10-01T09:30:00',
				additionalFields: {
					timezone: 'Europe/London',
					mediaIds: 'm-1, m-2',
					platformContent: '{"linkedin":{"content":"Longer text"}}',
				},
			}),
			ctx,
		);
		expect(spec.body).toEqual({
			content: 'Later',
			account_ids: [1],
			scheduled_for: '2026-10-01T08:30:00.000Z',
			timezone: 'Europe/London',
			media_ids: ['m-1', 'm-2'],
			platform_content: { linkedin: { content: 'Longer text' } },
		});
	});

	it('falls back to the workflow timezone', () => {
		const spec = buildRequest(
			'post',
			'create',
			params({
				content: 'x',
				accountIds: [1],
				mode: 'schedule',
				scheduledFor: '2026-10-01T09:00:00',
			}),
			{ workflowTimezone: 'Asia/Jakarta' },
		);
		expect(spec.body).toMatchObject({
			scheduled_for: '2026-10-01T02:00:00.000Z',
			timezone: 'Asia/Jakarta',
		});
	});

	it('sets use_queue and draft modes', () => {
		expect(
			buildRequest('post', 'create', params({ content: 'q', accountIds: [1], mode: 'queue' }), ctx)
				.body,
		).toEqual({ content: 'q', account_ids: [1], use_queue: true });
		expect(
			buildRequest('post', 'create', params({ content: 'd', mode: 'draft' }), ctx).body,
		).toEqual({
			content: 'd',
			draft: true,
		});
	});

	it('rejects a non-draft post without accounts or content', () => {
		expect(() =>
			buildRequest('post', 'create', params({ content: 'x', mode: 'now' }), ctx),
		).toThrow(/at least one account/);
		expect(() =>
			buildRequest('post', 'create', params({ content: '', accountIds: [1], mode: 'now' }), ctx),
		).toThrow(/Add content/);
		expect(() =>
			buildRequest(
				'post',
				'create',
				params({ content: 'x', accountIds: [1], mode: 'schedule' }),
				ctx,
			),
		).toThrow(/Scheduled For is required/);
	});
});

describe('buildRequest: other post operations', () => {
	it('builds get, results and retry paths with an encoded ID', () => {
		expect(buildRequest('post', 'get', params({ postId: 'abc' }), ctx)).toEqual({
			method: 'GET',
			path: '/posts/abc',
		});
		expect(buildRequest('post', 'getResults', params({ postId: 'a/b' }), ctx).path).toBe(
			'/posts/a%2Fb/results',
		);
		expect(buildRequest('post', 'retry', params({ postId: 'abc' }), ctx)).toEqual({
			method: 'POST',
			path: '/posts/abc/retry',
		});
		expect(() => buildRequest('post', 'get', params({ postId: ' ' }), ctx)).toThrow(
			/Post ID is required/,
		);
	});

	it('builds get many filters and paging', () => {
		const spec = buildRequest(
			'post',
			'getAll',
			params({
				returnAll: false,
				limit: 10,
				filters: {
					status: ['scheduled', 'failed'],
					platform: ['x'],
					accountId: '42',
					search: 'launch',
				},
			}),
			ctx,
		);
		expect(spec).toMatchObject({
			method: 'GET',
			path: '/posts',
			qs: { status: 'scheduled,failed', platform: 'x', account_id: 42, search: 'launch' },
			listKey: 'posts',
			paginate: { returnAll: false, limit: 10 },
		});
	});

	it('builds update and refuses an empty update', () => {
		const spec = buildRequest(
			'post',
			'update',
			params({ postId: 'p1', updateFields: { content: 'New', accountIds: '1,2' } }),
			ctx,
		);
		expect(spec).toEqual({
			method: 'PATCH',
			path: '/posts/p1',
			body: { content: 'New', account_ids: [1, 2] },
		});
		expect(() =>
			buildRequest('post', 'update', params({ postId: 'p1', updateFields: {} }), ctx),
		).toThrow(/at least one field/);
	});

	it('builds delete with the X option', () => {
		expect(
			buildRequest('post', 'delete', params({ postId: 'p1', options: { deleteOnX: true } }), ctx),
		).toEqual({ method: 'DELETE', path: '/posts/p1', qs: { delete_on_platforms: 'x' } });
	});

	it('schedules a draft now or later', () => {
		expect(
			buildRequest('post', 'schedule', params({ postId: 'p1', scheduleMode: 'now' }), ctx).body,
		).toEqual({ publish_now: true });
		expect(
			buildRequest(
				'post',
				'schedule',
				params({
					postId: 'p1',
					scheduleMode: 'schedule',
					scheduledFor: '2026-10-01T10:00:00Z',
					additionalFields: { accountIds: '7' },
				}),
				ctx,
			).body,
		).toEqual({ scheduled_for: '2026-10-01T10:00:00.000Z', timezone: 'UTC', account_ids: [7] });
	});
});

describe('buildRequest: other resources', () => {
	it('builds account requests', () => {
		expect(buildRequest('account', 'getAll', params({}), ctx)).toEqual({
			method: 'GET',
			path: '/accounts',
			listKey: 'accounts',
		});
		expect(buildRequest('account', 'get', params({ accountId: 2280 }), ctx).path).toBe(
			'/accounts/2280',
		);
	});

	it('builds media requests', () => {
		expect(
			buildRequest(
				'media',
				'uploadFromUrl',
				params({ url: 'https://example.com/a.png', options: { filename: 'a.png' } }),
				ctx,
			),
		).toEqual({
			method: 'POST',
			path: '/media/upload-from-url',
			body: { url: 'https://example.com/a.png', filename: 'a.png' },
		});
		expect(() => buildRequest('media', 'uploadFromUrl', params({ url: 'ftp://x' }), ctx)).toThrow(
			/http/,
		);
		expect(
			buildRequest('media', 'getAll', params({ returnAll: true, filters: { type: 'video' } }), ctx),
		).toMatchObject({ qs: { type: 'video' }, listKey: 'media', paginate: { returnAll: true } });
	});

	it('builds an AI caption request', () => {
		expect(
			buildRequest(
				'ai',
				'generateCaption',
				params({
					topic: 'Summer sale',
					platform: 'instagram',
					tone: 'witty',
					length: 'short',
					options: { count: 3, includeEmojis: false },
				}),
				ctx,
			),
		).toEqual({
			method: 'POST',
			path: '/ai/generate-caption',
			body: {
				topic: 'Summer sale',
				platform: 'instagram',
				tone: 'witty',
				length: 'short',
				count: 3,
				include_emojis: false,
			},
		});
	});

	it('builds analytics requests', () => {
		expect(buildRequest('analytics', 'getSummary', params({ period: 'week' }), ctx).qs).toEqual({
			period: 'week',
		});
		expect(
			buildRequest(
				'analytics',
				'getSummary',
				params({ period: 'custom', from: '2026-09-01T00:00:00Z', to: '2026-09-30T00:00:00Z' }),
				ctx,
			).qs,
		).toEqual({
			period: 'custom',
			from: '2026-09-01T00:00:00.000Z',
			to: '2026-09-30T00:00:00.000Z',
		});
		expect(() =>
			buildRequest('analytics', 'getSummary', params({ period: 'custom' }), ctx),
		).toThrow(/From and To/);
	});
});
