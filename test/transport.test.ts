import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';
import { PostEverywhere } from '../nodes/PostEverywhere/PostEverywhere.node';
import {
	apiRequest,
	apiRequestList,
	BASE_URL,
	retryDelaySeconds,
	unwrapEnvelope,
} from '../nodes/PostEverywhere/transport';

type Reply = { statusCode: number; body: unknown; headers?: Record<string, string> };

const ok = (data: unknown): Reply => ({
	statusCode: 200,
	body: { data, error: null, meta: { request_id: 'abc12345', timestamp: '2026-09-29T00:00:00Z' } },
});

const fail = (
	statusCode: number,
	code: string,
	message: string,
	headers?: Record<string, string>,
): Reply => ({
	statusCode,
	headers,
	body: { data: null, error: { message, code }, meta: { request_id: 'req00001' } },
});

/** A minimal fake of the n8n execute context. */
function fakeContext(
	replies: Reply[],
	params: Record<string, unknown> = {},
	continueOnFail = false,
) {
	const http = vi.fn(async () => {
		const next = replies.shift();
		if (!next) throw new Error('No more mocked replies');
		return next;
	});
	const ctx = {
		getNode: () => ({
			id: '1',
			name: 'PostEverywhere',
			type: 'postEverywhere',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getInputData: () => [{ json: {} }],
		getTimezone: () => 'UTC',
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: http,
			returnJsonArray: (items: object[]) => items.map((json) => ({ json })),
			constructExecutionMetaData: (items: object[], meta: { itemData: { item: number } }) =>
				items.map((item) => ({ ...item, pairedItem: meta.itemData })),
		},
	};
	return { ctx, http };
}

describe('unwrapEnvelope', () => {
	it('returns data on success', () => {
		expect(unwrapEnvelope(200, { data: { id: 1 }, error: null, meta: {} })).toEqual({
			data: { id: 1 },
		});
	});

	it('returns the API error message and code', () => {
		const result = unwrapEnvelope(400, {
			data: null,
			error: { message: 'Invalid timezone', code: 'invalid_timezone' },
			meta: { request_id: 'r1' },
		});
		expect(result.error).toMatchObject({
			message: 'Invalid timezone',
			code: 'invalid_timezone',
			requestId: 'r1',
			statusCode: 400,
		});
	});

	it('handles a non-JSON error body', () => {
		const result = unwrapEnvelope(502, '<html>Bad gateway</html>');
		expect(result.error?.message).toBe('PostEverywhere API returned HTTP 502');
	});
});

describe('retryDelaySeconds', () => {
	it('uses Retry-After and caps it', () => {
		expect(retryDelaySeconds({ 'Retry-After': '5' }, 0)).toBe(5);
		expect(retryDelaySeconds({ 'retry-after': '600' }, 0)).toBe(30);
		expect(retryDelaySeconds({}, 1)).toBe(2);
	});
});

describe('apiRequest', () => {
	it('calls the API with the credential and returns data', async () => {
		const { ctx, http } = fakeContext([ok({ accounts: [] })]);
		const data = await apiRequest.call(ctx as never, {
			method: 'GET',
			path: '/accounts',
			qs: { a: 1 },
		});
		expect(data).toEqual({ accounts: [] });
		expect(http).toHaveBeenCalledWith('postEverywhereApi', {
			method: 'GET',
			url: `${BASE_URL}/accounts`,
			qs: { a: 1 },
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			headers: { Accept: 'application/json' },
		});
	});

	it('throws NodeApiError with the API message', async () => {
		const { ctx } = fakeContext([
			fail(400, 'past_schedule_time', 'scheduled_for must be in the future'),
		]);
		const promise = apiRequest.call(ctx as never, { method: 'POST', path: '/posts', body: {} });
		await expect(promise).rejects.toBeInstanceOf(NodeApiError);
		await promise.catch((error: NodeApiError) => {
			expect(error.message).toBe('scheduled_for must be in the future');
			expect(error.description).toContain('past_schedule_time');
			expect(error.httpCode).toBe('400');
		});
	});

	it('retries a 429 after Retry-After', async () => {
		const { ctx, http } = fakeContext([
			fail(429, 'rate_limit_exceeded', 'Slow down', { 'Retry-After': '0' }),
			ok({ id: 'p1' }),
		]);
		await expect(
			apiRequest.call(ctx as never, { method: 'POST', path: '/posts', body: {} }),
		).resolves.toEqual({ id: 'p1' });
		expect(http).toHaveBeenCalledTimes(2);
	});

	it('never retries a POST after a 5xx, so a post is not sent twice', async () => {
		const { ctx, http } = fakeContext([fail(500, 'internal_error', 'Boom'), ok({})]);
		await expect(
			apiRequest.call(ctx as never, { method: 'POST', path: '/posts', body: {} }),
		).rejects.toThrow('Boom');
		expect(http).toHaveBeenCalledTimes(1);
	});

	it('retries a GET after a 5xx', async () => {
		const { ctx, http } = fakeContext([
			fail(503, 'internal_error', 'Busy', { 'Retry-After': '0' }),
			ok({ id: 'p1' }),
		]);
		await expect(
			apiRequest.call(ctx as never, { method: 'GET', path: '/posts/p1' }),
		).resolves.toEqual({
			id: 'p1',
		});
		expect(http).toHaveBeenCalledTimes(2);
	});
});

describe('apiRequestList', () => {
	it('pages with limit and offset until has_more is false', async () => {
		const { ctx, http } = fakeContext([
			ok({ posts: [{ id: 1 }, { id: 2 }], pagination: { limit: 100, offset: 0, has_more: true } }),
			ok({ posts: [{ id: 3 }], pagination: { limit: 100, offset: 2, has_more: false } }),
		]);
		const items = await apiRequestList.call(ctx as never, {
			method: 'GET',
			path: '/posts',
			qs: { status: 'failed' },
			listKey: 'posts',
			paginate: { returnAll: true, limit: 50 },
		});
		expect(items.map((p) => p.id)).toEqual([1, 2, 3]);
		expect(http.mock.calls[1][1]).toMatchObject({
			qs: { status: 'failed', limit: 100, offset: 2 },
		});
	});

	it('stops at the limit', async () => {
		const { ctx, http } = fakeContext([ok({ media: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })]);
		const items = await apiRequestList.call(ctx as never, {
			method: 'GET',
			path: '/media',
			listKey: 'media',
			paginate: { returnAll: false, limit: 2 },
		});
		expect(items).toHaveLength(2);
		expect(http.mock.calls[0][1]).toMatchObject({ qs: { limit: 2, offset: 0 } });
	});
});

describe('PostEverywhere node', () => {
	it('returns one item per account', async () => {
		const { ctx } = fakeContext([ok({ accounts: [{ id: 1 }, { id: 2 }] })], {
			resource: 'account',
			operation: 'getAll',
		});
		const [out] = await new PostEverywhere().execute.call(ctx as never);
		expect(out.map((i) => i.json)).toEqual([{ id: 1 }, { id: 2 }]);
	});

	it('returns an error item when Continue On Fail is on', async () => {
		const { ctx } = fakeContext(
			[fail(404, 'not_found', 'Post not found')],
			{ resource: 'post', operation: 'get', postId: 'missing' },
			true,
		);
		const [out] = await new PostEverywhere().execute.call(ctx as never);
		expect(out).toEqual([{ json: { error: 'Post not found' }, pairedItem: { item: 0 } }]);
	});

	it('reports bad input as an error before any request', async () => {
		const { ctx, http } = fakeContext([], {
			resource: 'post',
			operation: 'create',
			content: 'Hi',
			mode: 'now',
			accountIds: [],
		});
		await expect(new PostEverywhere().execute.call(ctx as never)).rejects.toThrow(
			/at least one account/,
		);
		expect(http).not.toHaveBeenCalled();
	});

	it('labels accounts as "platform: name" in the dropdown', async () => {
		const { ctx } = fakeContext([
			ok({
				accounts: [
					{
						id: 9,
						platform: 'x',
						account_name: 'acme',
						health: { status: 'healthy', can_post: true },
					},
					{
						id: 3,
						platform: 'linkedin',
						account_name: 'Acme Inc',
						health: { status: 'expired', can_post: false },
					},
				],
			}),
		]);
		const options = await new PostEverywhere().methods.loadOptions.getAccounts.call(ctx as never);
		expect(options.map((o) => [o.name, o.value])).toEqual([
			['linkedin: Acme Inc', 3],
			['x: acme', 9],
		]);
		expect(options[0].description).toMatch(/Reconnect/);
	});
});
