import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature, postMessage } from '../../lib/slack';

interface SlackEventPayload {
  token: string;
  type: string;
  challenge?: string;
  event?: {
    type: string;
    user: string;
    text: string;
    channel: string;
    ts: string;
    event_ts: string;
  };
  team_id?: string;
  api_app_id?: string;
}

/**
 * Slack Events API Handler
 * 
 * Handles events like:
 * - url_verification: Challenge-response for initial setup
 * - app_mention: When the bot is @mentioned
 * - message: When a message is posted (if subscribed)
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload: SlackEventPayload = req.body;

  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    console.log('Responding to Slack URL verification');
    res.status(200).json({ challenge: payload.challenge });
    return;
  }

  try {
    // Verify Slack signature for event callbacks
    if (payload.type === 'event_callback') {
      const signature = req.headers['x-slack-signature'] as string;
      const timestamp = req.headers['x-slack-request-timestamp'] as string;
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      if (!verifySlackSignature(signature, timestamp, rawBody)) {
        console.error('Invalid Slack signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    // Respond immediately to acknowledge (Slack requires response within 3s)
    res.status(200).json({ ok: true });

    // Process the event
    if (payload.event) {
      await handleEvent(payload.event);
    }
  } catch (error) {
    console.error('Error processing Slack event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle individual events
 */
async function handleEvent(event: NonNullable<SlackEventPayload['event']>): Promise<void> {
  console.log(`Received event: ${event.type}`);

  switch (event.type) {
    case 'app_mention':
      await handleAppMention(event);
      break;

    case 'message':
      // Only handle DMs to the bot
      if (event.channel.startsWith('D')) {
        await handleDirectMessage(event);
      }
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle when the bot is @mentioned
 */
async function handleAppMention(event: NonNullable<SlackEventPayload['event']>): Promise<void> {
  const text = event.text.toLowerCase();
  const channel = event.channel;

  // Extract command from mention (e.g., "@bot projects LST")
  const mentionRegex = /<@[A-Z0-9]+>/g;
  const command = event.text.replace(mentionRegex, '').trim().toLowerCase();

  if (command.startsWith('projects')) {
    const clientName = command.replace('projects', '').trim();
    await postMessage(
      channel,
      `To see projects, use the \`/projects${clientName ? ' ' + clientName : ''}\` command.`
    );
  } else if (command.startsWith('status')) {
    const projectName = command.replace('status', '').trim();
    await postMessage(
      channel,
      `To see project status, use the \`/status${projectName ? ' ' + projectName : ''}\` command.`
    );
  } else if (command.includes('help')) {
    await postMessage(channel, getHelpMessage());
  } else {
    await postMessage(
      channel,
      `👋 Hi! I'm the Slack Sync bot. ${getHelpMessage()}`
    );
  }
}

/**
 * Handle direct messages to the bot
 */
async function handleDirectMessage(event: NonNullable<SlackEventPayload['event']>): Promise<void> {
  const text = event.text.toLowerCase();
  const channel = event.channel;

  if (text.includes('help')) {
    await postMessage(channel, getHelpMessage());
  } else {
    await postMessage(
      channel,
      `👋 Hi! I can help you track projects. Use these commands in any channel:\n\n${getHelpMessage()}`
    );
  }
}

/**
 * Get help message
 */
function getHelpMessage(): string {
  return `*Available Commands:*
• \`/projects\` - List all clients
• \`/projects [client]\` - View project status for a client
• \`/status [project]\` - View task breakdown for a project
• \`/sync\` - Sync data from ClickUp

*Automatic Notifications:*
• ✅ Task completions from ClickUp
• 📁 File uploads from Dropbox`;
}
