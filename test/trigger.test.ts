import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { PostEverywhereTrigger } from '../nodes/PostEverywhereTrigger/PostEverywhereTrigger.node';
import {
	isValidSignature,
	sameEvents,
	WEBHOOK_EVENTS,
} from '../nodes/PostEverywhereTrigger/webhook';

type Reply = { statusCode: number; body: unknown };

const ok = (data: unknown): Reply => ({
	statusCode: 200,
	body: { data, error: null, meta: { request_id: 'req1' } },
});
const notFound: Reply = {
	statusCode: 404,
	body: { data: null, error: { message: 'Webhook not found', code: 'not_found' }, meta: {} },
};

const HOOK_URL = 'https://n8n.example.com/webhook/abc/webhook';

function hookContext(replies: Reply[], staticData: Record<string, unknown>, events: string[]) {
	const http = vi.fn<(cred: string, opts: Record<string, unknown>) => Promise<Reply>>(async () => {
		const next = replies.shift();
		if (!next) throw new Error('No more mocked replies');
		return next;
	});
	const ctx = {
		getNode: () => ({
			id: '1',
			name: 'Trigger',
			type: 't',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getWorkflow: () => ({ id: 'w1', name: 'My flow', active: true }),
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => HOOK_URL,
		getNodeParameter: (name: string, fallback?: unknown) => (name === 'events' ? events : fallback),
		helpers: { httpRequestWithAuthentication: http },
	};
	return { ctx, http };
}

const trigger = new PostEverywhereTrigger();
const methods = trigger.webhookMethods.default;

describe('webhook helpers', () => {
	it('lists all 15 API webhook events', () => {
		expect(WEBHOOK_EVENTS.map((e) => e.value).sort()).toEqual(
			[
				'post.scheduled',
				'post.publishing',
				'post.published',
				'post.failed',
				'post.partially_failed',
				'post.updated',
				'post.deleted',
				'account.connected',
				'account.disconnected',
				'account.reconnect_needed',
				'media.uploaded',
				'media.deleted',
				'post.approval_requested',
				'post.approved',
				'post.changes_requested',
			].sort(),
		);
	});

	it('checks the HMAC signature', () => {
		const body = '{"event":"post.published"}';
		const sig = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
		expect(isValidSignature(body, sig, 's3cret')).toBe(true);
		expect(isValidSignature(body, sig, 'other')).toBe(false);
		expect(isValidSignature(body, undefined, 's3cret')).toBe(false);
		expect(isValidSignature(body, 'sha256=short', 's3cret')).toBe(false);
	});

	it('compares event lists in any order', () => {
		expect(sameEvents(['a', 'b'], ['b', 'a'])).toBe(true);
		expect(sameEvents(['a'], ['a', 'b'])).toBe(false);
		expect(sameEvents(undefined, ['a'])).toBe(false);
	});
});

describe('webhook lifecycle', () => {
	it('creates a webhook and stores its ID and secret', async () => {
		const staticData: Record<string, unknown> = {};
		const { ctx, http } = hookContext(
			[ok({ id: 'wh1', secret: 'whsec', url: HOOK_URL, events: ['post.published'] })],
			staticData,
			['post.published'],
		);
		expect(await methods.create.call(ctx as never)).toBe(true);
		expect(staticData).toEqual({ webhookId: 'wh1', webhookSecret: 'whsec' });
		const opts = http.mock.calls[0][1];
		expect(opts.method).toBe('POST');
		expect(opts.url).toBe('https://app.posteverywhere.ai/api/v1/webhooks');
		expect(opts.body).toMatchObject({
			url: HOOK_URL,
			events: ['post.published'],
			name: 'n8n: My flow',
		});
	});

	it('reports an existing matching webhook', async () => {
		const staticData = { webhookId: 'wh1', webhookSecret: 'whsec' };
		const { ctx } = hookContext(
			[
				ok({
					id: 'wh1',
					url: HOOK_URL,
					events: ['post.failed', 'post.published'],
					is_active: true,
				}),
			],
			staticData,
			['post.published', 'post.failed'],
		);
		expect(await methods.checkExists.call(ctx as never)).toBe(true);
	});

	it('removes a webhook whose events changed', async () => {
		const staticData: Record<string, unknown> = { webhookId: 'wh1', webhookSecret: 'whsec' };
		const { ctx, http } = hookContext(
			[
				ok({ id: 'wh1', url: HOOK_URL, events: ['post.published'], is_active: true }),
				ok({ deleted: true }),
			],
			staticData,
			['post.failed'],
		);
		expect(await methods.checkExists.call(ctx as never)).toBe(false);
		expect(http.mock.calls[1][1].method).toBe('DELETE');
		expect(staticData).toEqual({});
	});

	it('treats a deleted webhook as missing', async () => {
		const staticData: Record<string, unknown> = { webhookId: 'wh1', webhookSecret: 'whsec' };
		const { ctx } = hookContext([notFound], staticData, ['post.published']);
		expect(await methods.checkExists.call(ctx as never)).toBe(false);
		expect(staticData).toEqual({});
	});

	it('deletes the webhook, and a 404 still counts as done', async () => {
		const staticData: Record<string, unknown> = { webhookId: 'wh1', webhookSecret: 'whsec' };
		const { ctx } = hookContext([notFound], staticData, ['post.published']);
		expect(await methods.delete.call(ctx as never)).toBe(true);
		expect(staticData).toEqual({});
	});
});

describe('webhook()', () => {
	const body = {
		event: 'post.published',
		event_id: 'e1',
		created_at: '2026-10-05T10:00:00Z',
		organization_id: 'o1',
		data: { post_id: 'p1', platform: 'x' },
	};
	const raw = Buffer.from(JSON.stringify(body));

	function webhookContext(signature: string | undefined, events = ['post.published']) {
		const send = vi.fn();
		const status = vi.fn(() => ({ send }));
		const ctx = {
			getWorkflowStaticData: () => ({ webhookId: 'wh1', webhookSecret: 'whsec' }),
			getBodyData: () => body,
			getHeaderData: () => (signature ? { 'x-posteverywhere-signature': signature } : {}),
			getRequestObject: () => ({ rawBody: raw }),
			getResponseObject: () => ({ status }),
			getNodeParameter: () => events,
			helpers: { returnJsonArray: (o: object) => [{ json: o }] },
		};
		return { ctx, status };
	}

	const good = `sha256=${createHmac('sha256', 'whsec').update(raw).digest('hex')}`;

	it('starts the workflow for a signed event', async () => {
		const { ctx } = webhookContext(good);
		const result = await trigger.webhook.call(ctx as never);
		expect(result.workflowData).toEqual([[{ json: body }]]);
	});

	it('rejects a bad signature with 401', async () => {
		const { ctx, status } = webhookContext('sha256=bad');
		const result = await trigger.webhook.call(ctx as never);
		expect(result).toEqual({ noWebhookResponse: true });
		expect(status).toHaveBeenCalledWith(401);
	});

	it('ignores events that were not chosen', async () => {
		const { ctx } = webhookContext(good, ['post.failed']);
		expect(await trigger.webhook.call(ctx as never)).toEqual({});
	});
});
