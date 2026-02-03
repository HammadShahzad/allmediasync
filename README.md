# Slack Sync

Custom automation system integrating Slack, ClickUp, and Dropbox for internal project management.

## Features

- **ClickUp Integration**: Automatic Slack notifications when tasks are completed
- **Dropbox Integration**: Automatic Slack notifications when files are uploaded
- **Slack Commands**: Query project status and task breakdowns from Slack
- **Client-based Organization**: Organize notifications by client/project

## Commands

| Command | Description |
|---------|-------------|
| `/projects` | List all clients (ClickUp Spaces) |
| `/projects [client]` | View project status and completion % for a client |
| `/status [project]` | View detailed task breakdown for a project |
| `/sync` | Sync and verify connection to ClickUp |

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `chat:write` - Send messages
   - `commands` - Add slash commands
   - `app_mentions:read` - Respond to @mentions
3. Install the app to your workspace
4. Copy the **Bot User OAuth Token** (`xoxb-...`)
5. Under **Basic Information**, copy the **Signing Secret**

### 2. Configure Slash Commands

Under **Slash Commands**, create:

| Command | Request URL | Description |
|---------|-------------|-------------|
| `/projects` | `https://your-app.vercel.app/api/slack/commands` | View project status |
| `/status` | `https://your-app.vercel.app/api/slack/commands` | View task details |
| `/sync` | `https://your-app.vercel.app/api/slack/commands` | Sync with ClickUp |

### 3. Configure Event Subscriptions

1. Enable Events and set the Request URL to `https://your-app.vercel.app/api/slack/events`
2. Subscribe to bot events: `app_mention`, `message.im`

### 4. Get ClickUp Credentials

1. Go to [ClickUp Settings > Apps](https://app.clickup.com/settings/apps)
2. Generate an API Token
3. Find your Team ID in the URL when viewing your workspace (the number after `/t/`)

### 5. Set Up ClickUp Webhooks

1. Use the ClickUp API to create a webhook:
```bash
curl -X POST "https://api.clickup.com/api/v2/team/YOUR_TEAM_ID/webhook" \
  -H "Authorization: YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://your-app.vercel.app/api/webhooks/clickup",
    "events": ["taskStatusUpdated"]
  }'
```

### 6. Get Dropbox Credentials

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Create a new app with Full Dropbox access
3. Generate an Access Token
4. Under Webhooks, add: `https://your-app.vercel.app/api/webhooks/dropbox`

### 7. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Or use: vercel env add VARIABLE_NAME
```

### 8. Set Environment Variables

Copy `.env.example` to `.env.local` for local development, or add them in Vercel dashboard:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_NOTIFICATION_CHANNEL=all-media
CLICKUP_API_TOKEN=pk_...
CLICKUP_TEAM_ID=...
DROPBOX_ACCESS_TOKEN=...
```

## Local Development

```bash
# Install dependencies
npm install

# Run locally with Vercel dev server
npm run dev

# Use ngrok for webhook testing
ngrok http 3000
```

## Architecture

```
api/
├── webhooks/
│   ├── clickup.ts    # Receives task completion events
│   └── dropbox.ts    # Receives file upload events
└── slack/
    ├── commands.ts   # Handles /projects, /status, /sync
    └── events.ts     # Handles @mentions and DMs

lib/
├── clickup.ts        # ClickUp API client
├── dropbox.ts        # Dropbox API client
├── slack.ts          # Slack message formatting
└── types.ts          # TypeScript interfaces
```

## Channel Mapping

You can route notifications to specific channels based on client:

```
# ClickUp Space -> Slack Channel
CHANNEL_MAPPING=LST:lst-updates,Cashnowauto:cashnowauto-updates

# Dropbox Folder -> Slack Channel
DROPBOX_CHANNEL_MAPPING=/Clients/LST:lst-updates,/Clients/Cashnowauto:cashnowauto-updates
```

## License

MIT
