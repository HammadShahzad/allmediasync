import { Dropbox } from 'dropbox';
import type { DropboxFileMetadata, DropboxMetadata } from './types';

let dropboxClient: Dropbox | null = null;

/**
 * Get or create Dropbox client
 */
function getDropboxClient(): Dropbox {
  if (!dropboxClient) {
    const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
    
    if (!accessToken) {
      throw new Error('DROPBOX_ACCESS_TOKEN not configured');
    }

    dropboxClient = new Dropbox({ accessToken });
  }
  
  return dropboxClient;
}

/**
 * Get the latest changes from Dropbox (using cursor)
 * Used for webhook processing
 */
export async function getLatestChanges(cursor?: string): Promise<{
  entries: DropboxMetadata[];
  cursor: string;
  hasMore: boolean;
}> {
  const dbx = getDropboxClient();
  
  let result;
  if (cursor) {
    // Continue from where we left off
    result = await dbx.filesListFolderContinue({ cursor });
  } else {
    // Start fresh - list root folder recursively
    result = await dbx.filesListFolder({
      path: '',
      recursive: true,
      include_deleted: false,
    });
  }

  return {
    entries: result.result.entries as unknown as DropboxMetadata[],
    cursor: result.result.cursor,
    hasMore: result.result.has_more,
  };
}

/**
 * Get list of files in a specific folder
 */
export async function listFolder(path: string): Promise<DropboxMetadata[]> {
  const dbx = getDropboxClient();
  
  const result = await dbx.filesListFolder({
    path: path || '',
    recursive: false,
    include_deleted: false,
  });

  return result.result.entries as unknown as DropboxMetadata[];
}

/**
 * Get a shared link for a file (creates one if doesn't exist)
 */
export async function getSharedLink(path: string): Promise<string> {
  const dbx = getDropboxClient();
  
  try {
    // Try to get existing shared links
    const existing = await dbx.sharingListSharedLinks({ path });
    
    if (existing.result.links.length > 0) {
      return existing.result.links[0].url;
    }
    
    // Create a new shared link
    const result = await dbx.sharingCreateSharedLinkWithSettings({
      path,
      settings: {
        requested_visibility: { '.tag': 'public' },
      },
    });
    
    return result.result.url;
  } catch (error: any) {
    // If shared link already exists, extract from error
    if (error?.error?.error_summary?.includes('shared_link_already_exists')) {
      const existing = await dbx.sharingListSharedLinks({ path });
      if (existing.result.links.length > 0) {
        return existing.result.links[0].url;
      }
    }
    
    throw error;
  }
}

/**
 * Get file metadata by path
 */
export async function getFileMetadata(path: string): Promise<DropboxFileMetadata | null> {
  const dbx = getDropboxClient();
  
  try {
    const result = await dbx.filesGetMetadata({ path });
    
    if (result.result['.tag'] === 'file') {
      return result.result as unknown as DropboxFileMetadata;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting file metadata:', error);
    return null;
  }
}

/**
 * Filter entries to only include new files (not folders, not deleted)
 */
export function filterNewFiles(entries: DropboxMetadata[]): DropboxFileMetadata[] {
  return entries.filter((entry): entry is DropboxFileMetadata => 
    entry['.tag'] === 'file'
  );
}

/**
 * Check if a file path matches any of the watched folders
 */
export function isInWatchedFolder(filePath: string, watchedFolders: string[]): boolean {
  const normalizedPath = filePath.toLowerCase();
  
  return watchedFolders.some(folder => {
    const normalizedFolder = folder.toLowerCase();
    return normalizedPath.startsWith(normalizedFolder);
  });
}

/**
 * Get watched folders from environment variable
 * Format: DROPBOX_WATCHED_FOLDERS=/Folder1,/Folder2/Subfolder
 */
export function getWatchedFolders(): string[] {
  const foldersStr = process.env.DROPBOX_WATCHED_FOLDERS;
  
  if (!foldersStr) {
    return []; // Watch all folders if not specified
  }
  
  return foldersStr.split(',').map(f => f.trim()).filter(f => f);
}

/**
 * Get folder-to-channel mapping for notifications
 * Format: DROPBOX_CHANNEL_MAPPING=/ClientA:channel-a,/ClientB:channel-b
 */
export function getDropboxChannelMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  const mappingStr = process.env.DROPBOX_CHANNEL_MAPPING;
  
  if (mappingStr) {
    const pairs = mappingStr.split(',');
    for (const pair of pairs) {
      const colonIndex = pair.lastIndexOf(':');
      if (colonIndex > 0) {
        const folder = pair.substring(0, colonIndex).trim();
        const channel = pair.substring(colonIndex + 1).trim();
        if (folder && channel) {
          mapping[folder.toLowerCase()] = channel;
        }
      }
    }
  }
  
  return mapping;
}

/**
 * Find the best matching channel for a file path
 */
export function getChannelForPath(filePath: string): string {
  const mapping = getDropboxChannelMapping();
  const normalizedPath = filePath.toLowerCase();
  
  // Find the longest matching prefix
  let bestMatch = '';
  let bestChannel = process.env.SLACK_NOTIFICATION_CHANNEL || 'all-media';
  
  for (const [folder, channel] of Object.entries(mapping)) {
    if (normalizedPath.startsWith(folder) && folder.length > bestMatch.length) {
      bestMatch = folder;
      bestChannel = channel;
    }
  }
  
  return bestChannel;
}

// Cursor storage (in-memory for serverless, consider using KV store for production)
let storedCursor: string | null = null;

export function getCursor(): string | null {
  // In production, you'd want to use Vercel KV, Redis, or another persistent store
  return storedCursor || process.env.DROPBOX_CURSOR || null;
}

export function setCursor(cursor: string): void {
  storedCursor = cursor;
  // In production, persist this to a database or KV store
}
