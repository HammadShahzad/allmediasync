import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getLatestChanges,
  filterNewFiles,
  getSharedLink,
  getWatchedFolders,
  isInWatchedFolder,
  getChannelForPath,
  getCursor,
  setCursor,
} from '../../lib/dropbox';
import { notifyFileUploaded } from '../../lib/slack';
import type { DropboxFileMetadata } from '../../lib/types';

/**
 * Dropbox Webhook Handler
 * 
 * Dropbox uses a challenge-response verification flow:
 * 1. GET request with challenge parameter - respond with the challenge
 * 2. POST request with notification - fetch changes and process
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle verification challenge (GET request)
  if (req.method === 'GET') {
    const challenge = req.query.challenge as string;
    
    if (challenge) {
      console.log('Responding to Dropbox verification challenge');
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(challenge);
      return;
    }
    
    res.status(400).json({ error: 'Missing challenge parameter' });
    return;
  }

  // Handle webhook notification (POST request)
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Verify the request is from Dropbox (check signature if configured)
    const signature = req.headers['x-dropbox-signature'] as string;
    if (signature && !verifyDropboxSignature(signature, req.body)) {
      console.error('Invalid Dropbox webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    console.log('Received Dropbox webhook notification');

    // Respond immediately to acknowledge receipt
    // Dropbox expects a quick response, so we process asynchronously
    res.status(200).json({ success: true });

    // Process the changes (this runs after response is sent in serverless)
    await processDropboxChanges();
  } catch (error) {
    console.error('Error processing Dropbox webhook:', error);
    // Already sent 200, so just log the error
  }
}

/**
 * Process Dropbox changes and notify about new files
 */
async function processDropboxChanges(): Promise<void> {
  const watchedFolders = getWatchedFolders();
  const cursor = getCursor();
  
  console.log('Fetching Dropbox changes...');
  
  let hasMore = true;
  let currentCursor = cursor;
  const newFiles: DropboxFileMetadata[] = [];
  
  while (hasMore) {
    const result = await getLatestChanges(currentCursor || undefined);
    
    // Filter for new files
    const files = filterNewFiles(result.entries);
    
    // Apply watched folder filter if configured
    const relevantFiles = watchedFolders.length > 0
      ? files.filter(f => isInWatchedFolder(f.path_display, watchedFolders))
      : files;
    
    newFiles.push(...relevantFiles);
    
    currentCursor = result.cursor;
    hasMore = result.hasMore;
  }
  
  // Save the cursor for next time
  if (currentCursor) {
    setCursor(currentCursor);
  }
  
  console.log(`Found ${newFiles.length} new files to notify about`);
  
  // Process each new file
  for (const file of newFiles) {
    try {
      await notifyAboutNewFile(file);
    } catch (error) {
      console.error(`Error notifying about file ${file.name}:`, error);
    }
  }
}

/**
 * Send a Slack notification about a new file
 */
async function notifyAboutNewFile(file: DropboxFileMetadata): Promise<void> {
  console.log(`Processing new file: ${file.path_display}`);
  
  // Get a shared link for the file
  let sharedLink: string;
  try {
    sharedLink = await getSharedLink(file.path_display);
  } catch (error) {
    console.error(`Could not create shared link for ${file.path_display}:`, error);
    sharedLink = `https://www.dropbox.com/home${file.path_display}`;
  }
  
  // Determine which channel to post to
  const channel = getChannelForPath(file.path_display);
  
  // Send the notification
  await notifyFileUploaded(file, sharedLink, channel);
  
  console.log(`Notified about ${file.name} in #${channel}`);
}

/**
 * Verify Dropbox webhook signature
 */
function verifyDropboxSignature(signature: string, body: any): boolean {
  const crypto = require('crypto');
  const appSecret = process.env.DROPBOX_APP_SECRET;
  
  if (!appSecret) {
    console.warn('DROPBOX_APP_SECRET not configured, skipping signature verification');
    return true;
  }
  
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
