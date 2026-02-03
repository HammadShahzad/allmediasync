import { WebClient } from '@slack/web-api';
import type { ClickUpTask, ProjectSummary, DropboxFileMetadata, SlackBlock } from './types';

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Default channel for notifications
const DEFAULT_CHANNEL = process.env.SLACK_NOTIFICATION_CHANNEL || 'all-media';

/**
 * Post a message to a Slack channel
 */
export async function postMessage(
  channel: string,
  text: string,
  blocks?: SlackBlock[]
): Promise<void> {
  await slack.chat.postMessage({
    channel,
    text,
    blocks: blocks as any,
  });
}

/**
 * Post a message via Slack response_url
 */
export async function postResponseUrlMessage(
  responseUrl: string,
  message: {
    text: string;
    blocks?: SlackBlock[];
    response_type?: 'in_channel' | 'ephemeral';
  }
): Promise<void> {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`response_url post failed: ${response.status} ${body}`);
  }
}

/**
 * Post a task completion notification to Slack
 */
export async function notifyTaskCompleted(
  task: ClickUpTask,
  channel: string = DEFAULT_CHANNEL
): Promise<void> {
  const assigneeNames = task.assignees.map(a => a.username).join(', ') || 'Unassigned';
  const projectPath = `${task.space.name} > ${task.folder.name} > ${task.list.name}`;
  
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '✅ Task Completed',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${task.url}|${task.name}>*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Project:*\n${projectPath}`,
        },
        {
          type: 'mrkdwn',
          text: `*Assignee:*\n${assigneeNames}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Completed at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`,
        },
      ],
    },
    {
      type: 'divider',
    },
  ];

  await postMessage(channel, `✅ Task completed: ${task.name}`, blocks);
}

/**
 * Post a file upload notification to Slack
 */
export async function notifyFileUploaded(
  file: DropboxFileMetadata,
  dropboxLink: string,
  channel: string = DEFAULT_CHANNEL
): Promise<void> {
  const fileSizeFormatted = formatFileSize(file.size);
  const folderPath = file.path_display.split('/').slice(0, -1).join('/') || '/';
  
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📁 New File Uploaded',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${dropboxLink}|${file.name}>*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Folder:*\n${folderPath}`,
        },
        {
          type: 'mrkdwn',
          text: `*Size:*\n${fileSizeFormatted}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Uploaded at <!date^${Math.floor(new Date(file.server_modified).getTime() / 1000)}^{date_short_pretty} at {time}|${file.server_modified}>`,
        },
      ],
    },
    {
      type: 'divider',
    },
  ];

  await postMessage(channel, `📁 New file uploaded: ${file.name}`, blocks);
}

/**
 * Post a project summary to Slack
 */
export async function postProjectSummary(
  summary: ProjectSummary,
  channel: string = DEFAULT_CHANNEL,
  responseUrl?: string
): Promise<void> {
  const completionPercent = summary.totalTasks > 0
    ? Math.round((summary.completedTasks / summary.totalTasks) * 100)
    : 0;
  
  const progressBar = createProgressBar(completionPercent);
  
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 ${summary.clientName} - Project Status`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Overall Progress:* ${completionPercent}%\n${progressBar}`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Tasks:*\n${summary.totalTasks}`,
        },
        {
          type: 'mrkdwn',
          text: `*Completed:*\n${summary.completedTasks}`,
        },
        {
          type: 'mrkdwn',
          text: `*In Progress:*\n${summary.inProgressTasks}`,
        },
        {
          type: 'mrkdwn',
          text: `*Remaining:*\n${summary.totalTasks - summary.completedTasks - summary.inProgressTasks}`,
        },
      ],
    },
    {
      type: 'divider',
    },
  ];

  // Add individual project breakdowns
  for (const project of summary.projects) {
    const projectPercent = project.taskCount > 0
      ? Math.round((project.completedCount / project.taskCount) * 100)
      : 0;
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${project.name}*\n${project.completedCount}/${project.taskCount} tasks (${projectPercent}%)`,
      },
    });
  }

  if (responseUrl) {
    await postResponseUrlMessage(responseUrl, {
      response_type: 'in_channel',
      text: `📊 Project status for ${summary.clientName}`,
      blocks,
    });
    return;
  }

  await postMessage(channel, `📊 Project status for ${summary.clientName}`, blocks);
}

/**
 * Post a detailed task list to Slack
 */
export async function postTaskList(
  projectName: string,
  tasks: ClickUpTask[],
  channel: string = DEFAULT_CHANNEL,
  responseUrl?: string
): Promise<void> {
  const completedTasks = tasks.filter(t => t.status.type === 'closed');
  const inProgressTasks = tasks.filter(t => t.status.status.toLowerCase().includes('progress'));
  const pendingTasks = tasks.filter(t => t.status.type !== 'closed' && !t.status.status.toLowerCase().includes('progress'));

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 ${projectName} - Task Breakdown`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${tasks.length} total tasks*`,
      },
    },
    {
      type: 'divider',
    },
  ];

  // In Progress section
  if (inProgressTasks.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔄 In Progress (${inProgressTasks.length})*`,
      },
    });
    
    const inProgressList = inProgressTasks
      .slice(0, 10)
      .map(t => `• <${t.url}|${t.name}> - ${t.assignees.map(a => a.username).join(', ') || 'Unassigned'}`)
      .join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: inProgressList,
      },
    });
  }

  // Pending section
  if (pendingTasks.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⏳ Pending (${pendingTasks.length})*`,
      },
    });
    
    const pendingList = pendingTasks
      .slice(0, 10)
      .map(t => `• <${t.url}|${t.name}>`)
      .join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: pendingList + (pendingTasks.length > 10 ? `\n_...and ${pendingTasks.length - 10} more_` : ''),
      },
    });
  }

  // Completed section
  if (completedTasks.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*✅ Completed (${completedTasks.length})*`,
      },
    });
    
    const completedList = completedTasks
      .slice(0, 5)
      .map(t => `• ~${t.name}~`)
      .join('\n');
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: completedList + (completedTasks.length > 5 ? `\n_...and ${completedTasks.length - 5} more_` : ''),
      },
    });
  }

  if (responseUrl) {
    await postResponseUrlMessage(responseUrl, {
      response_type: 'in_channel',
      text: `📋 Task breakdown for ${projectName}`,
      blocks,
    });
    return;
  }

  await postMessage(channel, `📋 Task breakdown for ${projectName}`, blocks);
}

/**
 * Send an ephemeral (private) response to a slash command
 */
export async function sendEphemeralResponse(
  channel: string,
  userId: string,
  text: string,
  blocks?: SlackBlock[]
): Promise<void> {
  await slack.chat.postEphemeral({
    channel,
    user: userId,
    text,
    blocks: blocks as any,
  });
}

/**
 * Send an error message
 */
export async function sendError(
  channel: string,
  userId: string,
  errorMessage: string
): Promise<void> {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `❌ *Error:* ${errorMessage}`,
      },
    },
  ];

  await sendEphemeralResponse(channel, userId, `Error: ${errorMessage}`, blocks);
}

// Helper functions

function createProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '`' + '█'.repeat(filled) + '░'.repeat(empty) + '`';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Verify Slack request signature
 */
export function verifySlackSignature(
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const crypto = require('crypto');
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET not configured');
    return false;
  }

  // Check timestamp to prevent replay attacks
  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > 60 * 5) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}
