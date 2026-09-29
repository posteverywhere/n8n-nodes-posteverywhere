# n8n-nodes-posteverywhere

An [n8n](https://n8n.io) community node for [PostEverywhere](https://posteverywhere.ai).

Use it to create, schedule and publish social media posts from your n8n workflows. One post can go to Instagram, TikTok, YouTube, LinkedIn, Facebook, X, Threads, Pinterest, Bluesky, Telegram and Discord, and to WordPress as a blog post.

The node calls the [PostEverywhere REST API](https://developers.posteverywhere.ai).

## Contents

- [Install](#install)
- [Credentials](#credentials)
- [Operations](#operations)
- [Example workflows](#example-workflows)
- [How the node behaves](#how-the-node-behaves)
- [Development](#development)
- [Links](#links)

## Install

In n8n (self-hosted):

1. Go to **Settings > Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-posteverywhere` and confirm.

For other install options, see the n8n [community nodes install guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

You need a PostEverywhere account and an API key.

1. Sign in to PostEverywhere and open [app.posteverywhere.ai/developers](https://app.posteverywhere.ai/developers).
2. Create an API key. It starts with `pe_live_`.
3. In n8n, create a new **PostEverywhere API** credential and paste the key.
4. Select **Save**. n8n tests the key by calling `GET /me`.

The node sends the key as `Authorization: Bearer <key>`.

Connect your social accounts in the PostEverywhere app first. The node lists the accounts you already connected.

## Operations

### Post

| Operation | What it does |
| --- | --- |
| **Create** | Creates a post. **Mode** picks what happens: **Publish Now**, **Schedule** (at a set time), **Add to Queue** (next free slot in your posting queue) or **Save as Draft**. |
| **Get** | Gets one post with the status of each destination. |
| **Get Many** | Lists posts. Filter by status, platform, account or text. Use **Return All** or set a **Limit**. |
| **Update** | Changes the content, time, accounts, media or platform content of a post. |
| **Delete** | Deletes a post. Turn on **Also Delete on X** to remove published copies on X too. |
| **Get Results** | Gets the publish result per platform, including the live post URL when it is published. |
| **Retry** | Queues every failed destination of a post again. |
| **Schedule Draft** | Publishes a draft now, or schedules it for a set time. You can also change its accounts. |

Fields for **Create**:

- **Content**: the post text.
- **Account Names or IDs**: pick accounts from the list (shown as `platform: account name`), or pass IDs with an expression, for example `{{ [2280, 2291] }}`. Optional for drafts.
- **Mode** and, for **Schedule**, **Scheduled For**.
- **Additional Fields**:
  - **Media IDs**: comma-separated IDs from **Media > Upload From URL**.
  - **Platform Content (JSON)**: per-platform overrides, for example `{"x": {"content": "Short version"}, "linkedin": {"content": "Longer version"}}`. See the platform guides in the [API docs](https://developers.posteverywhere.ai).
  - **Timezone**: an IANA timezone such as `Europe/London`.

### Account

| Operation | What it does |
| --- | --- |
| **Get Many** | Lists your connected accounts with a health summary. |
| **Get** | Gets one account. |

### Media

| Operation | What it does |
| --- | --- |
| **Upload From URL** | Imports a public image (JPEG, PNG, GIF, WebP, HEIC, up to 25 MB) or MP4 video (up to 4 GB) into your media library. Returns a `media_id`. |
| **Get Many** | Lists media library items. Filter by type. |

Images are ready at once. Videos import in the background: the response has `media_status: "uploading"`. Wait until the video is `ready` before you attach it to a post.

### AI

| Operation | What it does |
| --- | --- |
| **Generate Caption** | Writes 1 to 5 captions for a topic. Set the platform, tone (professional, casual, witty, enthusiastic, urgent, inspirational) and length (short, medium, long). Each caption uses 1 AI credit. |

### Analytics

| Operation | What it does |
| --- | --- |
| **Get Summary** | Gets post counts by status, a per-platform breakdown and engagement totals for the last 24 hours, 7 days, 30 days, all time, or a custom range. |

## Example workflows

### 1. RSS feed item to LinkedIn and X

Share each new blog article on LinkedIn and X one hour after it appears.

1. **RSS Feed Trigger**: set the feed URL of your blog.
2. **PostEverywhere**: Resource **Post**, Operation **Create**.
   - **Content**: `New on the blog: {{ $json.title }} {{ $json.link }}`
   - **Account Names or IDs**: pick your LinkedIn and X accounts.
   - **Mode**: **Schedule**.
   - **Scheduled For**: `{{ $now.plus(1, 'hour') }}`
   - **Additional Fields > Platform Content (JSON)** (optional, a shorter text for X):
     `{{ JSON.stringify({ x: { content: $json.title + ' ' + $json.link } }) }}`

Want PostEverywhere to pick the time? Set **Mode** to **Add to Queue** instead.

### 2. Google Sheets row to a post with an image

Plan posts in a sheet with the columns `text`, `image_url`, `publish_at` and `account_ids` (for example `2280,2291`).

1. **Google Sheets Trigger**: on row added.
2. **PostEverywhere**: Resource **Media**, Operation **Upload From URL**.
   - **URL**: `{{ $json.image_url }}`
3. **PostEverywhere**: Resource **Post**, Operation **Create**.
   - **Content**: `{{ $('Google Sheets Trigger').item.json.text }}`
   - **Account Names or IDs** (expression): `{{ $('Google Sheets Trigger').item.json.account_ids.split(',') }}`
   - **Mode**: **Schedule**.
   - **Scheduled For**: `{{ $('Google Sheets Trigger').item.json.publish_at }}`
   - **Additional Fields > Media IDs**: `{{ $json.media_id }}`

To check the outcome later, add a **PostEverywhere** node with **Post > Get Results** and the post ID from step 3.

## How the node behaves

- **Scheduled times.** The API reads a time without an offset as UTC. n8n date fields have no offset. So the node reads such a time in the **Timezone** field, or in the workflow timezone when that field is empty, and converts it to UTC. A time with an offset or `Z` is used as is. The time must be in the future.
- **Responses.** The API wraps every response as `{ data, error, meta }`. The node returns `data`. List operations return one n8n item per post, account or media item.
- **Errors.** API errors show the API message, the error code and the request ID. Quote the request ID when you contact support.
- **Continue On Fail.** When it is on, a failed item returns `{ "error": "<message>" }` and the workflow continues.
- **Rate limits and retries.** On HTTP 429 the node waits for `Retry-After` (up to 30 seconds) and tries again, up to 2 times. Server errors (5xx) are retried only for read requests. A create or update is never sent twice, so a post is never duplicated by a retry.
- **AI tool.** The node can be used as a tool by the n8n AI Agent.

## Development

```bash
npm install
npm run build   # compile to dist/
npm run lint    # n8n community node lint rules
npm test        # unit tests (mocked HTTP, no API key needed)
npm run dev     # start n8n with this node loaded
```

Planned for a later version: a trigger node for PostEverywhere webhooks (post published, post failed and similar events). The API supports webhooks today. You can use them now with the n8n **Webhook** node.

## Links

- [PostEverywhere](https://posteverywhere.ai)
- [API documentation](https://developers.posteverywhere.ai)
- [Get an API key](https://app.posteverywhere.ai/developers)
- [Node.js SDK](https://github.com/posteverywhere/sdk)
- [MCP server](https://github.com/posteverywhere/mcp)
- [CLI](https://github.com/posteverywhere/cli)
- [n8n community nodes docs](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)
