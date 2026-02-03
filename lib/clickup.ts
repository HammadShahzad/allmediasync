import type {
  ClickUpTask,
  ClickUpSpace,
  ClickUpFolder,
  ClickUpList,
  ClickUpTasksResponse,
  ProjectSummary,
} from './types';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

/**
 * Make an authenticated request to ClickUp API
 */
async function clickupFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = process.env.CLICKUP_API_TOKEN;
  
  if (!token) {
    throw new Error('CLICKUP_API_TOKEN not configured');
  }

  const response = await fetch(`${CLICKUP_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClickUp API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get all spaces in a workspace (team)
 */
export async function getSpaces(teamId: string): Promise<ClickUpSpace[]> {
  const data = await clickupFetch<{ spaces: ClickUpSpace[] }>(`/team/${teamId}/space`);
  return data.spaces;
}

/**
 * Get a single space by ID
 */
export async function getSpace(spaceId: string): Promise<ClickUpSpace> {
  return clickupFetch<ClickUpSpace>(`/space/${spaceId}`);
}

/**
 * Get all folders in a space
 */
export async function getFolders(spaceId: string): Promise<ClickUpFolder[]> {
  const data = await clickupFetch<{ folders: ClickUpFolder[] }>(`/space/${spaceId}/folder`);
  return data.folders;
}

/**
 * Get all lists in a folder
 */
export async function getLists(folderId: string): Promise<ClickUpList[]> {
  const data = await clickupFetch<{ lists: ClickUpList[] }>(`/folder/${folderId}/list`);
  return data.lists;
}

/**
 * Get all lists directly in a space (not in folders)
 */
export async function getSpaceLists(spaceId: string): Promise<ClickUpList[]> {
  const data = await clickupFetch<{ lists: ClickUpList[] }>(`/space/${spaceId}/list`);
  return data.lists;
}

/**
 * Get tasks from a list
 */
export async function getTasksFromList(
  listId: string,
  options: {
    includeSubtasks?: boolean;
    includeClosed?: boolean;
    page?: number;
  } = {}
): Promise<ClickUpTask[]> {
  const params = new URLSearchParams();
  if (options.includeSubtasks) params.append('subtasks', 'true');
  if (options.includeClosed) params.append('include_closed', 'true');
  if (options.page) params.append('page', options.page.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';
  const data = await clickupFetch<ClickUpTasksResponse>(`/list/${listId}/task${queryString}`);
  return data.tasks;
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string): Promise<ClickUpTask> {
  return clickupFetch<ClickUpTask>(`/task/${taskId}`);
}

/**
 * Get all tasks from a space (across all folders and lists)
 */
export async function getTasksFromSpace(
  spaceId: string,
  options: { includeClosed?: boolean } = {}
): Promise<ClickUpTask[]> {
  const allTasks: ClickUpTask[] = [];

  // Get folderless lists
  const spaceLists = await getSpaceLists(spaceId);
  for (const list of spaceLists) {
    const tasks = await getTasksFromList(list.id, { includeClosed: options.includeClosed });
    allTasks.push(...tasks);
  }

  // Get folders and their lists
  const folders = await getFolders(spaceId);
  for (const folder of folders) {
    const lists = await getLists(folder.id);
    for (const list of lists) {
      const tasks = await getTasksFromList(list.id, { includeClosed: options.includeClosed });
      allTasks.push(...tasks);
    }
  }

  return allTasks;
}

/**
 * Search for a space by name (case-insensitive)
 */
export async function findSpaceByName(teamId: string, spaceName: string): Promise<ClickUpSpace | null> {
  const spaces = await getSpaces(teamId);
  const normalizedName = spaceName.toLowerCase().trim();
  return spaces.find(s => s.name.toLowerCase().trim() === normalizedName) || null;
}

/**
 * Search for a list by name within a space
 */
export async function findListByName(spaceId: string, listName: string): Promise<ClickUpList | null> {
  const normalizedName = listName.toLowerCase().trim();
  
  // Check folderless lists first
  const spaceLists = await getSpaceLists(spaceId);
  const foundInSpace = spaceLists.find(l => l.name.toLowerCase().trim() === normalizedName);
  if (foundInSpace) return foundInSpace;

  // Check folders
  const folders = await getFolders(spaceId);
  for (const folder of folders) {
    const lists = await getLists(folder.id);
    const found = lists.find(l => l.name.toLowerCase().trim() === normalizedName);
    if (found) return found;
  }

  return null;
}

/**
 * Get project summary for a client (space)
 */
export async function getProjectSummary(spaceId: string, clientName: string): Promise<ProjectSummary> {
  const tasks = await getTasksFromSpace(spaceId, { includeClosed: true });
  
  const completedTasks = tasks.filter(t => t.status.type === 'closed');
  const inProgressTasks = tasks.filter(t => 
    t.status.status.toLowerCase().includes('progress') ||
    t.status.status.toLowerCase().includes('doing') ||
    t.status.status.toLowerCase().includes('working')
  );

  // Group tasks by list (project)
  const projectMap = new Map<string, { name: string; tasks: ClickUpTask[] }>();
  for (const task of tasks) {
    const listId = task.list.id;
    if (!projectMap.has(listId)) {
      projectMap.set(listId, { name: task.list.name, tasks: [] });
    }
    projectMap.get(listId)!.tasks.push(task);
  }

  const projects = Array.from(projectMap.values()).map(p => ({
    name: p.name,
    taskCount: p.tasks.length,
    completedCount: p.tasks.filter(t => t.status.type === 'closed').length,
  }));

  return {
    clientName,
    totalTasks: tasks.length,
    completedTasks: completedTasks.length,
    inProgressTasks: inProgressTasks.length,
    projects,
  };
}

/**
 * Verify ClickUp webhook signature
 */
export function verifyClickUpWebhook(signature: string, body: string): boolean {
  const crypto = require('crypto');
  const webhookSecret = process.env.CLICKUP_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.warn('CLICKUP_WEBHOOK_SECRET not configured, skipping verification');
    return true; // Allow if not configured (development)
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
