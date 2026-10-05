import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { apiRequest, CREDENTIAL_NAME } from '../PostEverywhere/transport';
import { isValidSignature, sameEvents, WEBHOOK_EVENTS } from './webhook';

interface WebhookStaticData extends IDataObject {
	webhookId?: string;
	webhookSecret?: string;
}

const isNotFound = (error: unknown): boolean =>
	error instanceof NodeApiError && String(error.httpCode) === '404';

export class PostEverywhereTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostEverywhere Trigger',
		name: 'postEverywhereTrigger',
		icon: {
			light: 'file:../../icons/posteverywhere.svg',
			dark: 'file:../../icons/posteverywhere.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when a PostEverywhere event happens',
		defaults: {
			name: 'PostEverywhere Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL_NAME,
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['post.published'],
				options: [...WEBHOOK_EVENTS],
				description:
					'The events to listen to. A post sent to 3 accounts fires Post Published 3 times, once per account.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				if (!staticData.webhookId) return false;

				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events', []) as string[];
				let existing: IDataObject;
				try {
					existing = (await apiRequest.call(this, {
						method: 'GET',
						path: `/webhooks/${encodeURIComponent(staticData.webhookId)}`,
					})) as IDataObject;
				} catch (error) {
					if (isNotFound(error)) {
						delete staticData.webhookId;
						delete staticData.webhookSecret;
						return false;
					}
					throw new NodeOperationError(this.getNode(), error as Error);
				}

				if (
					existing.url === webhookUrl &&
					existing.is_active !== false &&
					sameEvents(existing.events, events) &&
					staticData.webhookSecret
				) {
					return true;
				}

				// The settings changed, or the webhook was turned off after failed
				// deliveries. Remove it so create() can make a fresh one.
				try {
					await apiRequest.call(this, {
						method: 'DELETE',
						path: `/webhooks/${encodeURIComponent(staticData.webhookId)}`,
					});
				} catch (error) {
					if (!isNotFound(error)) throw new NodeOperationError(this.getNode(), error as Error);
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events', []) as string[];
				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Choose at least one event');
				}

				const created = (await apiRequest.call(this, {
					method: 'POST',
					path: '/webhooks',
					body: {
						url: webhookUrl,
						events,
						name: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 100),
						description:
							'Created by the n8n PostEverywhere Trigger. Turn off the workflow to remove it.',
					},
				})) as IDataObject;

				if (!created?.id || !created.secret) {
					throw new NodeOperationError(
						this.getNode(),
						'PostEverywhere did not return a webhook ID and secret. Try to activate the workflow again.',
					);
				}
				staticData.webhookId = String(created.id);
				staticData.webhookSecret = String(created.secret);
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
				if (staticData.webhookId) {
					try {
						await apiRequest.call(this, {
							method: 'DELETE',
							path: `/webhooks/${encodeURIComponent(staticData.webhookId)}`,
						});
					} catch (error) {
						// 404: the webhook is already gone, which is the result we want.
						if (!isNotFound(error)) return false;
					}
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const staticData = this.getWorkflowStaticData('node') as WebhookStaticData;
		const body = this.getBodyData();
		const headers = this.getHeaderData();
		const req = this.getRequestObject() as { rawBody?: Buffer };

		const secret = staticData.webhookSecret;
		if (secret) {
			const raw = req.rawBody ?? JSON.stringify(body);
			const signature = headers['x-posteverywhere-signature'];
			if (!isValidSignature(raw, Array.isArray(signature) ? signature[0] : signature, secret)) {
				const res = this.getResponseObject();
				res.status(401).send('Invalid signature');
				return { noWebhookResponse: true };
			}
		}

		const events = this.getNodeParameter('events', []) as string[];
		const event = typeof body.event === 'string' ? body.event : undefined;
		if (event && events.length && !events.includes(event)) {
			return {};
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body)],
		};
	}
}
