import type { INodeProperties } from 'n8n-workflow';

const show = (operation: string[]) => ({ show: { resource: ['post'], operation } });

export const PLATFORM_OPTIONS = [
	{ name: 'Bluesky', value: 'bluesky' },
	{ name: 'Discord', value: 'discord' },
	{ name: 'Facebook', value: 'facebook' },
	{ name: 'Instagram', value: 'instagram' },
	{ name: 'LinkedIn', value: 'linkedin' },
	{ name: 'Pinterest', value: 'pinterest' },
	{ name: 'Telegram', value: 'telegram' },
	{ name: 'Threads', value: 'threads' },
	{ name: 'TikTok', value: 'tiktok' },
	{ name: 'WordPress', value: 'wordpress' },
	{ name: 'X', value: 'x' },
	{ name: 'YouTube', value: 'youtube' },
];

const timezoneField: INodeProperties = {
	displayName: 'Timezone',
	name: 'timezone',
	type: 'string',
	default: '',
	placeholder: 'Europe/London',
	description:
		'IANA timezone. A scheduled time without an offset is read in this timezone. Leave empty to use the workflow timezone.',
};

const platformContentField: INodeProperties = {
	displayName: 'Platform Content (JSON)',
	name: 'platformContent',
	type: 'json',
	default: '{}',
	description:
		'Per-platform overrides keyed by platform name, for example {"x": {"content": "Short version"}}. See the platform guides at https://developers.posteverywhere.ai.',
};

export const postOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['post'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create, schedule, queue or draft a post',
				action: 'Create a post',
			},
			{ name: 'Delete', value: 'delete', description: 'Delete a post', action: 'Delete a post' },
			{
				name: 'Get',
				value: 'get',
				description: 'Get a post with its destination statuses',
				action: 'Get a post',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many posts',
				action: 'Get many posts',
			},
			{
				name: 'Get Results',
				value: 'getResults',
				description: 'Get per-platform publish results for a post',
				action: 'Get post results',
			},
			{
				name: 'Retry',
				value: 'retry',
				description: 'Retry every failed destination of a post',
				action: 'Retry a failed post',
			},
			{
				name: 'Schedule Draft',
				value: 'schedule',
				description: 'Schedule or publish a draft',
				action: 'Schedule a draft',
			},
			{ name: 'Update', value: 'update', description: 'Update a post', action: 'Update a post' },
		],
		default: 'create',
	},
];

export const postFields: INodeProperties[] = [
	/* ---------------------------- post:create ---------------------------- */
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: show(['create']),
		description: 'The post text. Can be empty only when you attach media or set platform content.',
	},
	{
		displayName: 'Account Names or IDs',
		name: 'accountIds',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getAccounts' },
		default: [],
		displayOptions: show(['create']),
		description:
			'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		hint: 'Accounts to post to. Optional only when Mode is Save as Draft.',
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'now',
		displayOptions: show(['create']),
		options: [
			{
				name: 'Add to Queue',
				value: 'queue',
				description: 'Use the next free slot in your posting queue',
			},
			{ name: 'Publish Now', value: 'now', description: 'Publish right away' },
			{
				name: 'Save as Draft',
				value: 'draft',
				description: 'Save a draft. Nothing publishes until you schedule it.',
			},
			{ name: 'Schedule', value: 'schedule', description: 'Publish at a set time' },
		],
	},
	{
		displayName: 'Scheduled For',
		name: 'scheduledFor',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['post'], operation: ['create'], mode: ['schedule'] } },
		description:
			'When to publish. Must be in the future. A time without an offset is read in the Timezone option, or the workflow timezone.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: [
			{
				displayName: 'Media IDs',
				name: 'mediaIds',
				type: 'string',
				default: '',
				description:
					'Comma-separated media IDs. Get them from Media > Upload From URL. Media must be ready.',
			},
			platformContentField,
			timezoneField,
		],
	},

	/* ------------------------- post: id-based ops ------------------------ */
	{
		displayName: 'Post ID',
		name: 'postId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['get', 'update', 'delete', 'getResults', 'retry', 'schedule']),
		description: 'The post ID (a UUID)',
	},

	/* ---------------------------- post:update ---------------------------- */
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{
				displayName: 'Account IDs',
				name: 'accountIds',
				type: 'string',
				default: '',
				description: 'Comma-separated account IDs. Replaces the current accounts.',
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
			},
			{
				displayName: 'Media IDs',
				name: 'mediaIds',
				type: 'string',
				default: '',
				description: 'Comma-separated media IDs. Replaces the current media.',
			},
			platformContentField,
			{
				displayName: 'Scheduled For',
				name: 'scheduledFor',
				type: 'dateTime',
				default: '',
				description: 'New publish time. Must be in the future.',
			},
			timezoneField,
		],
	},

	/* ---------------------------- post:delete ---------------------------- */
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['delete']),
		options: [
			{
				displayName: 'Also Delete on X',
				name: 'deleteOnX',
				type: 'boolean',
				default: false,
				description: 'Whether to also delete published copies of the post on X',
			},
		],
	},

	/* --------------------------- post:schedule --------------------------- */
	{
		displayName: 'Mode',
		name: 'scheduleMode',
		type: 'options',
		default: 'now',
		displayOptions: show(['schedule']),
		options: [
			{ name: 'Publish Now', value: 'now' },
			{ name: 'Schedule', value: 'schedule' },
		],
	},
	{
		displayName: 'Scheduled For',
		name: 'scheduledFor',
		type: 'dateTime',
		default: '',
		required: true,
		displayOptions: {
			show: { resource: ['post'], operation: ['schedule'], scheduleMode: ['schedule'] },
		},
		description: 'When to publish. Must be at least 1 minute in the future.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['schedule']),
		options: [
			{
				displayName: 'Account IDs',
				name: 'accountIds',
				type: 'string',
				default: '',
				description:
					'Comma-separated account IDs. Replaces the accounts saved on the draft. Required if the draft has none.',
			},
			timezoneField,
		],
	},

	/* ---------------------------- post:getAll ---------------------------- */
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: show(['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['post'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Account ID',
				name: 'accountId',
				type: 'string',
				default: '',
				description: 'Only posts that target this account',
			},
			{
				displayName: 'Platforms',
				name: 'platform',
				type: 'multiOptions',
				options: PLATFORM_OPTIONS,
				default: [],
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive text match on post content',
			},
			{
				displayName: 'Statuses',
				name: 'status',
				type: 'multiOptions',
				options: [
					{ name: 'Draft', value: 'draft' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Partially Failed', value: 'partially_failed' },
					{ name: 'Published', value: 'published' },
					{ name: 'Publishing', value: 'publishing' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
				default: [],
			},
		],
	},
];
