// ClickUp Types
export interface ClickUpTask {
  id: string;
  name: string;
  status: {
    status: string;
    type: string;
  };
  assignees: ClickUpAssignee[];
  url: string;
  list: {
    id: string;
    name: string;
  };
  folder: {
    id: string;
    name: string;
  };
  space: {
    id: string;
    name: string;
  };
  date_created: string;
  date_updated: string;
  date_closed: string | null;
}

export interface ClickUpAssignee {
  id: number;
  username: string;
  email: string;
  profilePicture: string | null;
}

export interface ClickUpWebhookPayload {
  event: string;
  webhook_id: string;
  task_id: string;
  history_items: ClickUpHistoryItem[];
}

export interface ClickUpHistoryItem {
  id: string;
  type: number;
  date: string;
  field: string;
  before: {
    status: string;
    type: string;
  } | null;
  after: {
    status: string;
    type: string;
  } | null;
}

export interface ClickUpSpace {
  id: string;
  name: string;
  private: boolean;
  statuses: ClickUpStatus[];
}

export interface ClickUpStatus {
  status: string;
  type: string;
  orderindex: number;
  color: string;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  space: {
    id: string;
    name: string;
  };
  lists: ClickUpList[];
}

export interface ClickUpList {
  id: string;
  name: string;
  folder: {
    id: string;
    name: string;
  };
  space: {
    id: string;
    name: string;
  };
  task_count: number;
}

export interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
}

// Dropbox Types
export interface DropboxWebhookPayload {
  list_folder: {
    accounts: string[];
  };
  delta: {
    users: number[];
  };
}

export interface DropboxFileMetadata {
  '.tag': 'file';
  name: string;
  path_display: string;
  path_lower: string;
  id: string;
  client_modified: string;
  server_modified: string;
  size: number;
  content_hash: string;
}

export interface DropboxFolderMetadata {
  '.tag': 'folder';
  name: string;
  path_display: string;
  path_lower: string;
  id: string;
}

export type DropboxMetadata = DropboxFileMetadata | DropboxFolderMetadata;

// Slack Types
export interface SlackCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: SlackBlockElement[];
  accessory?: SlackBlockAccessory;
  fields?: SlackTextField[];
}

export interface SlackBlockElement {
  type: string;
  text?: string;
  url?: string;
  action_id?: string;
}

export interface SlackBlockAccessory {
  type: string;
  image_url?: string;
  alt_text?: string;
  url?: string;
  text?: {
    type: string;
    text: string;
  };
}

export interface SlackTextField {
  type: string;
  text: string;
}

// Client/Project Types for internal tracking
export interface Client {
  id: string;
  name: string;
  clickupSpaceId?: string;
  dropboxFolder?: string;
  slackChannel?: string;
}

export interface ProjectSummary {
  clientName: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  projects: {
    name: string;
    taskCount: number;
    completedCount: number;
  }[];
}
