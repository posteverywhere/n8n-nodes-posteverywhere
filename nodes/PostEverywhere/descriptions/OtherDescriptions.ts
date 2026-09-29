import type { INodeProperties } from 'n8n-workflow';

/* ------------------------------ account ------------------------------ */

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a connected account',
				action: 'Get an account',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many connected accounts',
				action: 'Get many accounts',
			},
		],
		default: 'getAll',
	},
];

export const accountFields: INodeProperties[] = [
	{
		displayName: 'Account Name or ID',
		name: 'accountId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAccounts' },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['account'], operation: ['get'] } },
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
];

/* ------------------------------- media ------------------------------- */

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many media library items',
				action: 'Get many media items',
			},
			{
				name: 'Upload From URL',
				value: 'uploadFromUrl',
				description: 'Import a public image or MP4 video URL into the media library',
				action: 'Upload media from a URL',
			},
		],
		default: 'uploadFromUrl',
	},
];

export const mediaFields: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/image.png',
		displayOptions: { show: { resource: ['media'], operation: ['uploadFromUrl'] } },
		description:
			'A public http(s) URL of an image (JPEG, PNG, GIF, WebP, HEIC, up to 25 MB) or an MP4 video (up to 4 GB). Images are ready at once. Videos import in the background.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['media'], operation: ['uploadFromUrl'] } },
		options: [
			{
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
				default: '',
			},
		],
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['media'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['media'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['media'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Document', value: 'document' },
					{ name: 'Image', value: 'image' },
					{ name: 'Video', value: 'video' },
				],
				default: 'image',
			},
		],
	},
];

/* --------------------------------- ai -------------------------------- */

export const aiOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['ai'] } },
		options: [
			{
				name: 'Generate Caption',
				value: 'generateCaption',
				description: 'Write captions for a topic. Uses 1 AI credit per caption.',
				action: 'Generate a caption',
			},
		],
		default: 'generateCaption',
	},
];

const showCaption = { show: { resource: ['ai'], operation: ['generateCaption'] } };

export const aiFields: INodeProperties[] = [
	{
		displayName: 'Topic',
		name: 'topic',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		displayOptions: showCaption,
		description: 'What the caption is about (up to 1,000 characters)',
	},
	{
		displayName: 'Platform',
		name: 'platform',
		type: 'options',
		default: '',
		displayOptions: showCaption,
		description: 'Sets the length limit and style. Choose Any for a general caption.',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Bluesky', value: 'bluesky' },
			{ name: 'Facebook', value: 'facebook' },
			{ name: 'Instagram', value: 'instagram' },
			{ name: 'LinkedIn', value: 'linkedin' },
			{ name: 'Pinterest', value: 'pinterest' },
			{ name: 'Threads', value: 'threads' },
			{ name: 'TikTok', value: 'tiktok' },
			{ name: 'WordPress', value: 'wordpress' },
			{ name: 'X', value: 'x' },
			{ name: 'YouTube', value: 'youtube' },
		],
	},
	{
		displayName: 'Tone',
		name: 'tone',
		type: 'options',
		default: 'professional',
		displayOptions: showCaption,
		options: [
			{ name: 'Casual', value: 'casual' },
			{ name: 'Enthusiastic', value: 'enthusiastic' },
			{ name: 'Inspirational', value: 'inspirational' },
			{ name: 'Professional', value: 'professional' },
			{ name: 'Urgent', value: 'urgent' },
			{ name: 'Witty', value: 'witty' },
		],
	},
	{
		displayName: 'Length',
		name: 'length',
		type: 'options',
		default: 'medium',
		displayOptions: showCaption,
		options: [
			{ name: 'Long', value: 'long' },
			{ name: 'Medium', value: 'medium' },
			{ name: 'Short', value: 'short' },
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: showCaption,
		options: [
			{
				displayName: 'Count',
				name: 'count',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 5 },
				default: 1,
				description: 'How many captions to write (1 to 5)',
			},
			{
				displayName: 'Include Emojis',
				name: 'includeEmojis',
				type: 'boolean',
				default: true,
				description: 'Whether to include emojis',
			},
			{
				displayName: 'Include Hashtags',
				name: 'includeHashtags',
				type: 'boolean',
				default: true,
				description: 'Whether to include hashtags',
			},
		],
	},
];

/* ----------------------------- analytics ----------------------------- */

export const analyticsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['analytics'] } },
		options: [
			{
				name: 'Get Summary',
				value: 'getSummary',
				description: 'Get post counts and engagement totals for a period',
				action: 'Get an analytics summary',
			},
		],
		default: 'getSummary',
	},
];

export const analyticsFields: INodeProperties[] = [
	{
		displayName: 'Period',
		name: 'period',
		type: 'options',
		default: 'month',
		displayOptions: { show: { resource: ['analytics'], operation: ['getSummary'] } },
		options: [
			{ name: 'All Time', value: 'all' },
			{ name: 'Custom', value: 'custom' },
			{ name: 'Last 24 Hours', value: 'today' },
			{ name: 'Last 30 Days', value: 'month' },
			{ name: 'Last 7 Days', value: 'week' },
		],
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['analytics'], operation: ['getSummary'], period: ['custom'] },
		},
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['analytics'], operation: ['getSummary'], period: ['custom'] },
		},
	},
];
