import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ClickUpWebhookPayload } from '../../lib/types';
import { getTask, verifyClickUpWebhook } from '../../lib/clickup';
import { notifyTaskCompleted } from '../../lib/slack';

/**
 * ClickUp Webhook Handler
 * 
 * Receives webhook events from ClickUp and posts notifications to Slack.
 * 
 * Supported events:
 * - taskStatusUpdated: When a task status changes (triggers on completion)
 * - taskCreated: When a new task is created
 * - taskDeleted: When a task is deleted
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Get raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
    // Verify webhook signature if secret is configured
    const signature = req.headers['x-signature'] as string;
    if (signature && !verifyClickUpWebhook(signature, rawBody)) {
      console.error('Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload: ClickUpWebhookPayload = typeof req.body === 'string' 
      ? JSON.parse(req.body) 
      : req.body;

    console.log('Received ClickUp webhook:', payload.event, 'for task:', payload.task_id);

    // Handle different event types
    switch (payload.event) {
      case 'taskStatusUpdated':
        await handleTaskStatusUpdated(payload);
        break;
      
      case 'taskCreated':
        // Optionally notify on new tasks
        // await handleTaskCreated(payload);
        console.log('Task created:', payload.task_id);
        break;
      
      case 'taskDeleted':
        console.log('Task deleted:', payload.task_id);
        break;
      
      default:
        console.log('Unhandled event type:', payload.event);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing ClickUp webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle task status update events
 * Posts to Slack when a task is marked as complete
 */
async function handleTaskStatusUpdated(payload: ClickUpWebhookPayload): Promise<void> {
  // Check if the status was changed to a "closed" type
  const statusChange = payload.history_items.find(item => item.field === 'status');
  
  if (!statusChange || !statusChange.after) {
    console.log('No status change found in history items');
    return;
  }

  // Check if the new status is a "closed" type (completed)
  const isNowComplete = statusChange.after.type === 'closed';
  const wasNotComplete = !statusChange.before || statusChange.before.type !== 'closed';

  if (isNowComplete && wasNotComplete) {
    console.log('Task marked as complete, fetching details...');
    
    // Fetch full task details
    const task = await getTask(payload.task_id);
    
    // Determine which channel to post to based on the space/client
    // You can configure this mapping in environment variables or a config file
    const channelMapping: Record<string, string> = getChannelMapping();
    const channel = channelMapping[task.space.name] || process.env.SLACK_NOTIFICATION_CHANNEL || 'all-media';
    
    // Post notification to Slack
    await notifyTaskCompleted(task, channel);
    
    console.log(`Posted completion notification for task "${task.name}" to #${channel}`);
  } else {
    console.log('Status change but not a completion:', statusChange.after.status);
  }
}

/**
 * Get channel mapping from environment variable
 * Format: CHANNEL_MAPPING=SpaceName1:channel1,SpaceName2:channel2
 */
function getChannelMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  const mappingStr = process.env.CHANNEL_MAPPING;
  
  if (mappingStr) {
    const pairs = mappingStr.split(',');
    for (const pair of pairs) {
      const [space, channel] = pair.split(':');
      if (space && channel) {
        mapping[space.trim()] = channel.trim();
      }
    }
  }
  
  return mapping;
}
