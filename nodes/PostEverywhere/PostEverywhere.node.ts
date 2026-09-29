import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { postFields, postOperations } from './descriptions/PostDescription';
import {
	accountFields,
	accountOperations,
	aiFields,
	aiOperations,
	analyticsFields,
	analyticsOperations,
	mediaFields,
	mediaOperations,
} from './descriptions/OtherDescriptions';
import { buildRequest } from './requests';
import { apiRequest, apiRequestList, CREDENTIAL_NAME } from './transport';

export class PostEverywhere implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostEverywhere',
		name: 'postEverywhere',
		icon: {
			light: 'file:../../icons/posteverywhere.svg',
			dark: 'file:../../icons/posteverywhere.dark.svg',
		},
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Schedule and publish social media posts with PostEverywhere',
		defaults: {
			name: 'PostEverywhere',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL_NAME,
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'AI', value: 'ai' },
					{ name: 'Analytics', value: 'analytics' },
					{ name: 'Media', value: 'media' },
					{ name: 'Post', value: 'post' },
				],
				default: 'post',
			},
			...postOperations,
			...postFields,
			...accountOperations,
			...accountFields,
			...mediaOperations,
			...mediaFields,
			...aiOperations,
			...aiFields,
			...analyticsOperations,
			...analyticsFields,
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = (await apiRequest.call(this, { method: 'GET', path: '/accounts' })) as
					| IDataObject
					| undefined;
				const accounts = (Array.isArray(data?.accounts) ? data?.accounts : []) as IDataObject[];
				return accounts
					.map((account) => {
						const health = (account.health ?? {}) as IDataObject;
						return {
							name: `${String(account.platform)}: ${String(account.account_name)}`,
							value: Number(account.id),
							description:
								health.can_post === false
									? `Cannot post right now (${String(health.status ?? 'unhealthy')}). Reconnect it in PostEverywhere.`
									: undefined,
						};
					})
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const workflowTimezone = this.getTimezone();

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let spec;
				try {
					spec = buildRequest(
						resource,
						operation,
						(name, fallback) => this.getNodeParameter(name, i, fallback),
						{ workflowTimezone },
					);
				} catch (error) {
					throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex: i });
				}

				let results: IDataObject[];
				if (spec.listKey) {
					results = await apiRequestList.call(this, spec, i);
				} else {
					const data = await apiRequest.call(this, spec, i);
					results = [(data && typeof data === 'object' ? data : { result: data }) as IDataObject];
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(results), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Keeps the message and description (API error code, request ID).
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
