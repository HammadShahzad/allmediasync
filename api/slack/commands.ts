import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SlackCommandPayload } from '../../lib/types';
import {
  verifySlackSignature,
  postProjectSummary,
  postTaskList,
  sendError,
  sendEphemeralResponse,
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
    const payload: SlackCommandPayload = req.body;
    const { command, text, channel_id, user_id, user_name } = payload;

    console.log(`Received command: ${command} ${text} from @${user_name}`);

    // Respond immediately to acknowledge (Slack requires response within 3s)
    res.status(200).json({ response_type: 'in_channel' });

    // Process the command asynchronously
    await handleCommand(command, text, channel_id, user_id);
  } catch (error) {
    console.error('Error processing Slack command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Route command to appropriate handler
 */
async function handleCommand(
  command: string,
  text: string,
  channelId: string,
  userId: string
): Promise<void> {
  const normalizedCommand = command.toLowerCase();
  const args = text.trim();

  switch (normalizedCommand) {
    case '/projects':
    case '/mediaprojects':
      await handleProjectsCommand(args, channelId, userId);
      break;

    case '/status':
    case '/mediastatus':
      await handleStatusCommand(args, channelId, userId);
      break;

    case '/sync':
    case '/mediasync':
      await handleSyncCommand(channelId, userId);
      break;

    default:
      await sendError(channelId, userId, `Unknown command: ${command}`);
  }
}

/**
 * Handle /projects [client] command
 * Lists all projects for a client with completion status
 */
async function handleProjectsCommand(
  clientName: string,
  channelId: string,
  userId: string
): Promise<void> {
  const teamId = process.env.CLICKUP_TEAM_ID;

  if (!teamId) {
    await sendError(channelId, userId, 'CLICKUP_TEAM_ID not configured');
    return;
  }

  try {
    // If no client specified, list available clients (spaces)
    if (!clientName) {
      const spaces = await getSpaces(teamId);
      const spaceList = spaces.map(s => `• ${s.name}`).join('\n');

      await sendEphemeralResponse(
        channelId,
        userId,
        `Available clients:\n${spaceList}\n\nUsage: \`/projects [client name]\``
      );
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
        await sendError(
          channelId,
          userId,
          `Client "${clientName}" not found. Did you mean: ${suggestions.join(', ')}?`
        );
      } else {
        await sendError(channelId, userId, `Client "${clientName}" not found.`);
      }
      return;
    }

    // Get project summary and post it
    const summary = await getProjectSummary(space.id, space.name);
    await postProjectSummary(summary, channelId);
  } catch (error) {
    console.error('Error handling /projects command:', error);
    await sendError(channelId, userId, 'Failed to fetch project data. Please try again.');
  }
}

/**
 * Handle /status [project] command
 * Shows detailed task breakdown for a project (list)
 */
async function handleStatusCommand(
  projectName: string,
  channelId: string,
  userId: string
): Promise<void> {
  const teamId = process.env.CLICKUP_TEAM_ID;

  if (!teamId) {
    await sendError(channelId, userId, 'CLICKUP_TEAM_ID not configured');
    return;
  }

  if (!projectName) {
    await sendEphemeralResponse(
      channelId,
      userId,
      'Usage: `/status [project name]`\nShows detailed task breakdown for a project.'
    );
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
      await sendError(
        channelId,
        userId,
        `Project "${projectName}" not found. Use \`/projects\` to see available clients and projects.`
      );
      return;
    }

    // Get tasks for the list and post them
    const tasks = await getTasksFromList(foundList.id, { includeClosed: true });
    await postTaskList(foundList.name, tasks, channelId);
  } catch (error) {
    console.error('Error handling /status command:', error);
    await sendError(channelId, userId, 'Failed to fetch task data. Please try again.');
  }
}

/**
 * Handle /sync command
 * Forces a refresh of project data (useful for debugging)
 */
async function handleSyncCommand(channelId: string, userId: string): Promise<void> {
  const teamId = process.env.CLICKUP_TEAM_ID;

  if (!teamId) {
    await sendError(channelId, userId, 'CLICKUP_TEAM_ID not configured');
    return;
  }

  try {
    // Fetch all spaces to verify connection
    const spaces = await getSpaces(teamId);
    
    // Count total tasks across all spaces
    let totalTasks = 0;
    const spaceSummaries: string[] = [];

    for (const space of spaces) {
      const tasks = await getTasksFromSpace(space.id, { includeClosed: true });
      totalTasks += tasks.length;
      const completed = tasks.filter(t => t.status.type === 'closed').length;
      spaceSummaries.push(`• ${space.name}: ${tasks.length} tasks (${completed} complete)`);
    }

    await sendEphemeralResponse(
      channelId,
      userId,
      `✅ *Sync Complete*\n\nConnected to ClickUp workspace.\n\n*Clients:*\n${spaceSummaries.join('\n')}\n\n*Total Tasks:* ${totalTasks}`
    );
  } catch (error) {
    console.error('Error handling /sync command:', error);
    await sendError(channelId, userId, 'Failed to sync with ClickUp. Check API credentials.');
  }
}
