import type { IDataObject } from 'n8n-workflow';

/**
 * Small, dependency-free helpers. They throw plain Errors with a clear
 * message; the node wraps them in NodeOperationError.
 */

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** Offset of `timeZone` from UTC at the instant `utcMs`, in milliseconds. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(utcMs));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);
	return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Turn a date-time from n8n into a UTC ISO 8601 string for the API.
 *
 * The API reads a time without an offset as UTC. n8n date pickers give a
 * wall-clock time without an offset. So a value without an offset is read in
 * `timeZone` (the node's Timezone field, or the workflow timezone) and
 * converted to UTC here. A value with an offset or "Z" is kept as the same
 * instant.
 */
export function toUtcIso(value: unknown, timeZone: string): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;

	let raw: string;
	if (typeof value === 'string') {
		raw = value.trim();
	} else if (value instanceof Date) {
		raw = value.toISOString();
	} else if (
		typeof value === 'object' &&
		typeof (value as { toISO?: unknown }).toISO === 'function'
	) {
		// Luxon DateTime from an n8n expression such as {{ $now.plus(1, 'day') }}
		raw = String((value as { toISO: () => string }).toISO());
	} else {
		raw = String(value);
	}
	if (raw === '') return undefined;

	if (OFFSET_RE.test(raw)) {
		const ms = Date.parse(raw);
		if (Number.isNaN(ms)) throw new Error(`"${raw}" is not a valid date and time`);
		return new Date(ms).toISOString();
	}

	const m = WALL_CLOCK_RE.exec(raw);
	if (!m) {
		throw new Error(
			`"${raw}" is not a valid date and time. Use ISO 8601, for example 2026-10-01T09:30:00`,
		);
	}
	if (!isValidTimeZone(timeZone)) throw new Error(`"${timeZone}" is not a valid IANA timezone`);

	const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
	const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
	let utc = wall - zoneOffsetMs(wall, timeZone);
	// A second pass handles times near a daylight saving change.
	const second = wall - zoneOffsetMs(utc, timeZone);
	if (second !== utc) utc = second;
	return new Date(utc).toISOString();
}

/** Accepts [1, "2"], "1, 2" or 3. Returns integers. */
export function toIntArray(value: unknown, fieldName: string): number[] {
	if (value === undefined || value === null || value === '') return [];
	const list = Array.isArray(value) ? value : String(value).split(',');
	return list
		.map((v) => String(v).trim())
		.filter((v) => v !== '')
		.map((v) => {
			if (!/^\d+$/.test(v)) {
				throw new Error(`${fieldName} must be whole numbers. "${v}" is not valid`);
			}
			return Number(v);
		});
}

/** Accepts ["a", "b"] or "a, b". */
export function toStringArray(value: unknown): string[] {
	if (value === undefined || value === null || value === '') return [];
	const list = Array.isArray(value) ? value : String(value).split(',');
	return list.map((v) => String(v).trim()).filter((v) => v !== '');
}

/** Accepts a JSON string or an object. Returns an object or undefined. */
export function toJsonObject(value: unknown, fieldName: string): IDataObject | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	let parsed: unknown = value;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '' || trimmed === '{}') return undefined;
		let valid = true;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			valid = false;
		}
		if (!valid) throw new Error(`${fieldName} is not valid JSON`);
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${fieldName} must be a JSON object, for example {"x": {"content": "..."}}`);
	}
	return Object.keys(parsed).length ? (parsed as IDataObject) : undefined;
}
