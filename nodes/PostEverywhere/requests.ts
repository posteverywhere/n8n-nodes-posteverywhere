import type { IDataObject, IHttpRequestMethods } from 'n8n-workflow';
import { toIntArray, toJsonObject, toStringArray, toUtcIso } from './utils';

/** Reads a node parameter for the current item. */
export type ParamGetter = (name: string, fallback?: unknown) => unknown;

export interface RequestSpec {
	method: IHttpRequestMethods;
	path: string;
	qs?: IDataObject;
	body?: IDataObject;
	/** Set for list operations: the key in `data` that holds the array. */
	listKey?: string;
	/** Set for list operations that page with limit/offset. */
	paginate?: { returnAll: boolean; limit: number };
}

export interface BuildContext {
	/** The workflow timezone, used when the node has no Timezone set. */
	workflowTimezone: string;
}

const id = (value: unknown, name: string): string => {
	const v = String(value ?? '').trim();
	if (!v) throw new Error(`${name} is required`);
	return encodeURIComponent(v);
};

const accountId = (value: unknown): number => {
	const [first] = toIntArray(value, 'Account ID');
	if (first === undefined) throw new Error('Account ID is required');
	return first;
};

function listPaging(get: ParamGetter): { returnAll: boolean; limit: number } {
	const returnAll = get('returnAll', false) === true;
	const limit = Number(get('limit', 50)) || 50;
	return { returnAll, limit };
}

function buildPost(operation: string, get: ParamGetter, ctx: BuildContext): RequestSpec {
	switch (operation) {
		case 'create': {
			const mode = String(get('mode', 'now'));
			const content = String(get('content', '') ?? '');
			const accountIds = toIntArray(get('accountIds', []), 'Account IDs');
			const options = (get('additionalFields', {}) ?? {}) as IDataObject;
			const timezone = String(options.timezone || ctx.workflowTimezone || 'UTC');

			if (mode !== 'draft' && accountIds.length === 0) {
				throw new Error('Choose at least one account. Only drafts can be saved without accounts');
			}

			const body: IDataObject = {};
			if (content) body.content = content;
			if (accountIds.length) body.account_ids = accountIds;

			if (mode === 'schedule') {
				const when = toUtcIso(get('scheduledFor', ''), timezone);
				if (!when) throw new Error('Scheduled For is required when Mode is Schedule');
				body.scheduled_for = when;
				body.timezone = timezone;
			} else if (mode === 'queue') {
				body.use_queue = true;
			} else if (mode === 'draft') {
				body.draft = true;
			}

			const mediaIds = toStringArray(options.mediaIds);
			if (mediaIds.length) body.media_ids = mediaIds;
			const platformContent = toJsonObject(options.platformContent, 'Platform Content');
			if (platformContent) body.platform_content = platformContent;

			if (!body.content && !body.media_ids && !body.platform_content) {
				throw new Error('Add content, media IDs or platform content');
			}
			return { method: 'POST', path: '/posts', body };
		}
		case 'get':
			return { method: 'GET', path: `/posts/${id(get('postId'), 'Post ID')}` };
		case 'getAll': {
			const filters = (get('filters', {}) ?? {}) as IDataObject;
			const qs: IDataObject = {};
			const status = toStringArray(filters.status);
			if (status.length) qs.status = status.join(',');
			const platform = toStringArray(filters.platform);
			if (platform.length) qs.platform = platform.join(',');
			if (filters.accountId !== undefined && filters.accountId !== '') {
				qs.account_id = accountId(filters.accountId);
			}
			if (filters.search) qs.search = String(filters.search);
			return { method: 'GET', path: '/posts', qs, listKey: 'posts', paginate: listPaging(get) };
		}
		case 'update': {
			const fields = (get('updateFields', {}) ?? {}) as IDataObject;
			const timezone = String(fields.timezone || ctx.workflowTimezone || 'UTC');
			const body: IDataObject = {};
			if (fields.content !== undefined && fields.content !== '')
				body.content = String(fields.content);
			if (fields.scheduledFor) {
				body.scheduled_for = toUtcIso(fields.scheduledFor, timezone);
				body.timezone = timezone;
			} else if (fields.timezone) {
				body.timezone = String(fields.timezone);
			}
			const accountIds = toIntArray(fields.accountIds, 'Account IDs');
			if (accountIds.length) body.account_ids = accountIds;
			const mediaIds = toStringArray(fields.mediaIds);
			if (mediaIds.length) body.media_ids = mediaIds;
			const platformContent = toJsonObject(fields.platformContent, 'Platform Content');
			if (platformContent) body.platform_content = platformContent;
			if (Object.keys(body).length === 0) throw new Error('Add at least one field to update');
			return { method: 'PATCH', path: `/posts/${id(get('postId'), 'Post ID')}`, body };
		}
		case 'delete': {
			const options = (get('options', {}) ?? {}) as IDataObject;
			const qs: IDataObject = {};
			if (options.deleteOnX === true) qs.delete_on_platforms = 'x';
			return { method: 'DELETE', path: `/posts/${id(get('postId'), 'Post ID')}`, qs };
		}
		case 'getResults':
			return { method: 'GET', path: `/posts/${id(get('postId'), 'Post ID')}/results` };
		case 'retry':
			return { method: 'POST', path: `/posts/${id(get('postId'), 'Post ID')}/retry` };
		case 'schedule': {
			const mode = String(get('scheduleMode', 'now'));
			const options = (get('additionalFields', {}) ?? {}) as IDataObject;
			const timezone = String(options.timezone || ctx.workflowTimezone || 'UTC');
			const body: IDataObject = {};
			if (mode === 'schedule') {
				const when = toUtcIso(get('scheduledFor', ''), timezone);
				if (!when) throw new Error('Scheduled For is required when Mode is Schedule');
				body.scheduled_for = when;
				body.timezone = timezone;
			} else {
				body.publish_now = true;
			}
			const accountIds = toIntArray(options.accountIds, 'Account IDs');
			if (accountIds.length) body.account_ids = accountIds;
			return { method: 'POST', path: `/posts/${id(get('postId'), 'Post ID')}/schedule`, body };
		}
	}
	throw new Error(`Unknown post operation "${operation}"`);
}

function buildAccount(operation: string, get: ParamGetter): RequestSpec {
	if (operation === 'getAll') return { method: 'GET', path: '/accounts', listKey: 'accounts' };
	if (operation === 'get')
		return { method: 'GET', path: `/accounts/${accountId(get('accountId'))}` };
	throw new Error(`Unknown account operation "${operation}"`);
}

function buildMedia(operation: string, get: ParamGetter): RequestSpec {
	if (operation === 'uploadFromUrl') {
		const url = String(get('url', '') ?? '').trim();
		if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://');
		const body: IDataObject = { url };
		const options = (get('options', {}) ?? {}) as IDataObject;
		if (options.filename) body.filename = String(options.filename);
		return { method: 'POST', path: '/media/upload-from-url', body };
	}
	if (operation === 'getAll') {
		const filters = (get('filters', {}) ?? {}) as IDataObject;
		const qs: IDataObject = {};
		if (filters.type) qs.type = String(filters.type);
		return { method: 'GET', path: '/media', qs, listKey: 'media', paginate: listPaging(get) };
	}
	throw new Error(`Unknown media operation "${operation}"`);
}

function buildAi(operation: string, get: ParamGetter): RequestSpec {
	if (operation !== 'generateCaption') throw new Error(`Unknown AI operation "${operation}"`);
	const topic = String(get('topic', '') ?? '').trim();
	if (!topic) throw new Error('Topic is required');
	const body: IDataObject = {
		topic,
		tone: String(get('tone', 'professional')),
		length: String(get('length', 'medium')),
	};
	const platform = String(get('platform', '') ?? '');
	if (platform) body.platform = platform;
	const options = (get('options', {}) ?? {}) as IDataObject;
	if (options.includeHashtags !== undefined)
		body.include_hashtags = options.includeHashtags === true;
	if (options.includeEmojis !== undefined) body.include_emojis = options.includeEmojis === true;
	if (options.count !== undefined) body.count = Number(options.count);
	return { method: 'POST', path: '/ai/generate-caption', body };
}

function buildAnalytics(operation: string, get: ParamGetter, ctx: BuildContext): RequestSpec {
	if (operation !== 'getSummary') throw new Error(`Unknown analytics operation "${operation}"`);
	const period = String(get('period', 'month'));
	const qs: IDataObject = { period };
	if (period === 'custom') {
		const tz = ctx.workflowTimezone || 'UTC';
		const from = toUtcIso(get('from', ''), tz);
		const to = toUtcIso(get('to', ''), tz);
		if (!from || !to) throw new Error('From and To are required when Period is Custom');
		qs.from = from;
		qs.to = to;
	}
	return { method: 'GET', path: '/analytics/summary', qs };
}

/** Maps a resource and operation to one API request. Pure: no network. */
export function buildRequest(
	resource: string,
	operation: string,
	get: ParamGetter,
	ctx: BuildContext,
): RequestSpec {
	switch (resource) {
		case 'post':
			return buildPost(operation, get, ctx);
		case 'account':
			return buildAccount(operation, get);
		case 'media':
			return buildMedia(operation, get);
		case 'ai':
			return buildAi(operation, get);
		case 'analytics':
			return buildAnalytics(operation, get, ctx);
	}
	throw new Error(`Unknown resource "${resource}"`);
}
