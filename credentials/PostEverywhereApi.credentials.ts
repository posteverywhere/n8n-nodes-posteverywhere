import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PostEverywhereApi implements ICredentialType {
	name = 'postEverywhereApi';

	displayName = 'PostEverywhere API';

	icon: Icon = {
		light: 'file:../icons/posteverywhere.svg',
		dark: 'file:../icons/posteverywhere.dark.svg',
	};

	documentationUrl = 'https://developers.posteverywhere.ai';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'pe_live_...',
			description:
				'Create a key at https://app.posteverywhere.ai/developers. It starts with pe_live_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.posteverywhere.ai/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
