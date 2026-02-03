import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SlackCommandPayload } from '../../lib/types';
import {
  verifySlackSignature,
  postProjectSummary,
  postTaskList,
  sendError,
  sendEphemeralResponse,
  postResponseUrlMessage,
} from '../../lib/slack';
import {
  getSpaces,
  findSpaceByName,
  findListByName,
  getProjectSummary,
  getTasksFromList,
  getTasksFromSpace,
} from '../../lib/clickup';

/**
 * Slack Slash Command Handler
 * 
 * Handles the following commands:
 * - /projects [client] - List all projects for a client with status
 * - /status [project] - Show detailed task breakdown for a project
 * - /sync - Force refresh of project data
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Parse the slash command payload (signature verification disabled for now)
    const payload = parseSlashCommandPayload(req.body);
    const { command, text, channel_id, user_id, user_name, response_url } = payload;

    console.log(`Received command: ${command} ${text} from @${user_name}`);

    // Respond immediately to acknowledge (Slack requires response within 3s)
    res.status(200).json({ response_type: 'ephemeral', text: 'Working on it…' });

    // Process the command asynchronously
    await handleCommand(command, text, channel_id, user_id, response_url);
  } catch (error) {
    console.error('Error processing Slack command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function parseSlashCommandPayload(body: VercelRequest['body']): SlackCommandPayload {
  if (!body) {
    return {} as SlackCommandPayload;
  }

  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    return Object.fromEntries(params.entries()) as unknown as SlackCommandPayload;
  }

  if (Buffer.isBuffer(body)) {
    const params = new URLSearchParams(body.toString('utf8'));
    return Object.fromEntries(params.entries()) as unknown as SlackCommandPayload;
  }

  return body as SlackCommandPayload;
}

/**
 * Route command to appropriate handler
 */
async function handleCommand(
  command: string,
  text: string,
  channelId: string,
  userId: string,
  responseUrl?: string
): Promise<void> {
  const normalizedCommand = command.toLowerCase();
  const args = text.trim();

  switch (normalizedCommand) {
    case '/projects':
    case '/mediaprojects':
      await handleProjectsCommand(args, channelId, userId, responseUrl);
      break;

    case '/status':
    case '/mediastatus':
      await handleStatusCommand(args, channelId, userId, responseUrl);
      break;

    case '/sync':
    case '/mediasync':
      await handleSyncCommand(channelId, userId, responseUrl);
      break;

    default:
      await sendCommandError(channelId, userId, responseUrl, `Unknown command: ${command}`);
  }
}

/**
 * Handle /projects [client] command
 * Lists all projects for a client with completion status
 */
async function handleProjectsCommand(
  clientName: string,
  channelId: string,
  userId: string,
  responseUrl?: string
): Promise<void> {
  const teamId = process.env.CLICKUP_TEAM_ID;

  if (!teamId) {
    await sendCommandError(channelId, userId, responseUrl, 'CLICKUP_TEAM_ID not configured');
    return;
  }

  try {
    // If no client specified, list available clients (spaces)
    if (!clientName) {
      const spaces = await getSpaces(teamId);
      const spaceList = spaces.map(s => `• ${s.name}`).join('\n');

      await sendCommandResponse(responseUrl, channelId, userId, {
        response_type: 'ephemeral',
        text: `Available clients:\n${spaceList}\n\nUsage: \`/mediaprojects [client name]\``,
      });
      return;
    }

    // Find the space (client) by name
    const space = await findSpaceByName(teamId, clientName);

    if (!space) {
      const spaces = await getSpaces(teamId);
      const suggestions = spaces
        .filter(s => s.name.toLowerCase().includes(clientName.toLowerCase()))
        .map(s => s.name);

      if (suggestions.length > 0) {
        await sendCommandError(
          channelId,
          userId,
          responseUrl,
          `Client "${clientName}" not found. Did you mean: ${suggestions.join(', ')}?`
        );
      } else {
        await sendCommandError(channelId, userId, responseUrl, `Client "${clientName}" not found.`);
      }
      return;
    }

    // Get project summary and post it
    const summary = await getProjectSummary(space.id, space.name);
    await postProjectSummary(summary, channelId, responseUrl);
  } catch (error) {
    console.error('Error handling /projects command:', error);
    await sendCommandError(channelId, userId, responseUrl, 'Failed to fetch project data. Please try again.');
  }
}

/**
 * Handle /status [project] command
 * Shows detailed task breakdown for a project (list)
 */
async function handleStatusCommand(
  projectName: string,
  channelId: string,
  userId: string,
  responseUrl?: string
): Promise<void> {
  const teamId = process.env.CLICKUP_TEAM_ID;

  if (!teamId) {
    await sendCommandError(channelId, userId, responseUrl, 'CLICKUP_TEAM_ID not configured');
    return;
  }

  if (!projectName) {
    await sendCommandResponse(responseUrl, channelId, userId, {
      response_type: 'ephemeral',
      text: 'Usage: `/mediastatus [project name]`\nShows detailed task breakdown for a project.',
    });
    return;
  }

  try {
    // Search for the project (list) across all spaces
    const spaces = await getSpaces(teamId);
    let foundList = null;
    let foundSpace = null;

    for (const space of spaces) {
      const list = await findListByName(space.id, projectName);
      if (list) {
        foundList = list;
        foundSpace = space;
        break;
      }
    }

    if (!foundList || !foundSpace) {
      await sendCommandError(
        channelId,
        userId,
        responseUrl,
        `Project "${projectName}" not found. Use \`/mediaprojects\` to see available clients and projects.`
      );
      return;
    }

    // Get tasks for the list and post them
    const tasks = await getTasksFromList(foundList.id, { includeClosed: true });
    await postTaskList(foundList.name, tasks, channelId, responseUrl);
  } catch (error) {
    console.error('Error handling /status command:', error);
    await sendCommandError(channelId, userId, responseUrl, 'Failed to fetch task data. Please try again.');
  }
}

/**
 * Handle /sync command
 * Forces a refresh of project data (useful for debugging)
 */
async function handleSyncCommand(
  channelId: string,
  userId: string,
  responseUrl?: string
): Promise<void> {
  const teamId = process.env.CLICKUP_TEAM_ID;

  if (!teamId) {
    await sendCommandError(channelId, userId, responseUrl, 'CLICKUP_TEAM_ID not configured');
    return;
  }

  try {
    // Fetch all spaces to verify connection (keep fast)
    const spaces = await getSpaces(teamId);
    const spaceSummaries = spaces.map(space => `• ${space.name}`).join('\n');

    await sendCommandResponse(responseUrl, channelId, userId, {
      response_type: 'ephemeral',
      text: `✅ *Sync Complete*\n\nConnected to ClickUp workspace.\n\n*Spaces:*\n${spaceSummaries}\n\nUse \`/mediaprojects [client]\` for details.`,
    });
  } catch (error) {
    console.error('Error handling /sync command:', error);
    await sendCommandError(channelId, userId, responseUrl, 'Failed to sync with ClickUp. Check API credentials.');
  }
}

async function sendCommandResponse(
  responseUrl: string | undefined,
  channelId: string,
  userId: string,
  message: { response_type?: 'in_channel' | 'ephemeral'; text: string }
): Promise<void> {
  if (responseUrl) {
    try {
      await postResponseUrlMessage(responseUrl, message);
      return;
    } catch (error) {
      console.error('Failed to post response_url message:', error);
    }
  }

  try {
    await sendEphemeralResponse(channelId, userId, message.text);
  } catch (error) {
    console.error('Failed to post ephemeral response:', error);
  }
}

async function sendCommandError(
  channelId: string,
  userId: string,
  responseUrl: string | undefined,
  message: string
): Promise<void> {
  await sendCommandResponse(responseUrl, channelId, userId, {
    response_type: 'ephemeral',
    text: `❌ ${message}`,
  });
}
