import {
	NodeApiError,
	sleep,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';
import type { RequestSpec } from './requests';

export const BASE_URL = 'https://app.posteverywhere.ai/api/v1';
export const CREDENTIAL_NAME = 'postEverywhereApi';

/** Most retries after a 429 (any method) or a 5xx (GET only). */
const MAX_RETRIES = 2;
/** Never wait longer than this for a Retry-After header. */
const MAX_WAIT_SECONDS = 30;

type Context = IExecuteFunctions | ILoadOptionsFunctions;

interface FullResponse {
	statusCode: number;
	headers?: Record<string, unknown>;
	body: unknown;
}

export interface ApiErrorInfo {
	message: string;
	code?: string;
	requestId?: string;
	statusCode: number;
	body: JsonObject;
}

/**
 * Reads the PostEverywhere envelope `{ data, error, meta }`.
 * Returns `{ data }` on success or `{ error }` with a readable message.
 */
export function unwrapEnvelope(
	statusCode: number,
	body: unknown,
): { data: unknown; error?: undefined } | { data?: undefined; error: ApiErrorInfo } {
	let parsed = body;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			// Not JSON (for example a proxy error page). Handled below.
		}
	}
	const envelope = (parsed && typeof parsed === 'object' ? parsed : {}) as IDataObject;
	const apiError = envelope.error as IDataObject | null | undefined;
	const meta = (envelope.meta ?? {}) as IDataObject;

	if (statusCode >= 400 || (apiError && typeof apiError === 'object')) {
		const message =
			(apiError && typeof apiError.message === 'string' && apiError.message) ||
			`PostEverywhere API returned HTTP ${statusCode}`;
		return {
			error: {
				message,
				code: apiError && typeof apiError.code === 'string' ? apiError.code : undefined,
				requestId: typeof meta.request_id === 'string' ? meta.request_id : undefined,
				statusCode,
				body: (typeof parsed === 'object' && parsed !== null
					? parsed
					: { body: String(body ?? '') }) as JsonObject,
			},
		};
	}
	return { data: 'data' in envelope ? envelope.data : parsed };
}

function header(headers: Record<string, unknown> | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
	const value = key ? headers[key] : undefined;
	return value === undefined ? undefined : String(value);
}

/** Seconds to wait before a retry. Uses Retry-After when present. */
export function retryDelaySeconds(
	headers: Record<string, unknown> | undefined,
	attempt: number,
): number {
	const retryAfter = header(headers, 'retry-after');
	if (retryAfter !== undefined) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, MAX_WAIT_SECONDS);
		const date = Date.parse(retryAfter);
		if (!Number.isNaN(date)) {
			return Math.min(Math.max(0, (date - Date.now()) / 1000), MAX_WAIT_SECONDS);
		}
	}
	return Math.min(2 ** attempt, MAX_WAIT_SECONDS);
}

/**
 * Sends one request and returns the envelope's `data`.
 *
 * Retries: a 429 is retried for any method (the API refused the request, so
 * nothing ran). A 5xx is retried only for GET, so a create is never sent twice.
 */
export async function apiRequest(
	this: Context,
	spec: Pick<RequestSpec, 'method' | 'path' | 'qs' | 'body'>,
	itemIndex = 0,
): Promise<unknown> {
	const options: IHttpRequestOptions = {
		method: spec.method,
		url: `${BASE_URL}${spec.path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		headers: { Accept: 'application/json' },
	};
	if (spec.qs && Object.keys(spec.qs).length) options.qs = spec.qs;
	if (spec.body !== undefined) options.body = spec.body;

	for (let attempt = 0; ; attempt++) {
		let response: FullResponse;
		try {
			response = (await this.helpers.httpRequestWithAuthentication.call(
				this,
				CREDENTIAL_NAME,
				options,
			)) as FullResponse;
		} catch (error) {
			// Network failure: no HTTP response at all.
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: `Could not reach the PostEverywhere API: ${(error as Error).message}`,
				itemIndex,
			});
		}

		const statusCode = Number(response.statusCode);
		const retryable = statusCode === 429 || (statusCode >= 500 && spec.method === 'GET');
		if (retryable && attempt < MAX_RETRIES) {
			await sleep(retryDelaySeconds(response.headers, attempt) * 1000);
			continue;
		}

		const result = unwrapEnvelope(statusCode, response.body);
		if (result.error) {
			const { message, code, requestId } = result.error;
			const details = [
				code ? `Error code: ${code}` : undefined,
				requestId ? `Request ID: ${requestId}` : undefined,
			].filter(Boolean);
			throw new NodeApiError(this.getNode(), result.error.body, {
				message,
				description: details.length ? details.join('. ') : undefined,
				httpCode: String(statusCode),
				itemIndex,
			});
		}
		return result.data;
	}
}

/**
 * Pages through a list endpoint with limit/offset and returns the items.
 * Stops when the API says there is no more, or a page comes back short.
 */
export async function apiRequestList(
	this: Context,
	spec: RequestSpec,
	itemIndex = 0,
): Promise<IDataObject[]> {
	const key = spec.listKey as string;
	const readItems = (data: unknown): IDataObject[] => {
		const list = (data as IDataObject | undefined)?.[key];
		return Array.isArray(list) ? (list as IDataObject[]) : [];
	};

	if (!spec.paginate) {
		return readItems(await apiRequest.call(this, spec, itemIndex));
	}

	const { returnAll, limit } = spec.paginate;
	const pageSize = returnAll ? 100 : Math.min(Math.max(limit, 1), 100);
	const results: IDataObject[] = [];
	let offset = 0;

	for (;;) {
		const data = (await apiRequest.call(
			this,
			{ ...spec, qs: { ...(spec.qs ?? {}), limit: pageSize, offset } },
			itemIndex,
		)) as IDataObject | undefined;
		const page = readItems(data);
		results.push(...page);

		if (!returnAll && results.length >= limit) return results.slice(0, limit);

		const pagination = (data?.pagination ?? {}) as IDataObject;
		const hasMore =
			typeof pagination.has_more === 'boolean' ? pagination.has_more : page.length === pageSize;
		if (!hasMore || page.length === 0) return results;
		offset += page.length;
	}
}
