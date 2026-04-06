import type {
  ActivityAction,
  ProjectActivityEntry,
  TaskSummary
} from "@taskflow/shared-types";

export const SESSION_STORAGE_KEY = "taskflow.session";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export type TaskStatusFilter = "ALL" | TaskSummary["status"];
export type TaskPriorityFilter = "ALL" | TaskSummary["priority"];

const ACTIVITY_LABELS: Record<ActivityAction, string> = {
  CREATED: "created",
  UPDATED: "updated",
  TASK_MOVED: "moved",
  COMMENTED: "commented",
  INVITED: "invited"
};

function resolveStorage(storage?: Storage) {
  if (storage) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function loadSession(storage?: Storage) {
  const resolvedStorage = resolveStorage(storage);

  if (!resolvedStorage) {
    return null;
  }

  const raw = resolvedStorage.getItem(SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    resolvedStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function persistSession(session: AuthSession | null, storage?: Storage) {
  const resolvedStorage = resolveStorage(storage);

  if (!resolvedStorage) {
    return;
  }

  if (!session) {
    resolvedStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  resolvedStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function normalizeProjectKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function formatTimestamp(value?: string) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function getActivityTitle(activity: ProjectActivityEntry) {
  const metadata =
    activity.metadata &&
    typeof activity.metadata === "object" &&
    !Array.isArray(activity.metadata)
      ? activity.metadata
      : null;
  const entity = typeof metadata?.entity === "string" ? metadata.entity : null;
  const from = typeof metadata?.from === "string" ? metadata.from : null;
  const to = typeof metadata?.to === "string" ? metadata.to : null;
  const namedEntity = typeof metadata?.name === "string" ? metadata.name : null;
  const taskTitle =
    activity.taskTitle ??
    (typeof metadata?.title === "string" ? metadata.title : null) ??
    "a task";

  if (activity.action === "TASK_MOVED" && from && to) {
    return `${activity.actorName} moved ${taskTitle} from ${from} to ${to}`;
  }

  if (activity.action === "CREATED" && entity === "project") {
    return `${activity.actorName} created project ${namedEntity ?? "this workspace"}`;
  }

  if (activity.action === "CREATED" && entity === "board") {
    return `${activity.actorName} created board ${namedEntity ?? "a board"}`;
  }

  if (activity.action === "CREATED" && entity === "task") {
    return `${activity.actorName} created task ${taskTitle}`;
  }

  if (activity.action === "COMMENTED") {
    return `${activity.actorName} commented on ${taskTitle}`;
  }

  if (activity.action === "UPDATED") {
    return `${activity.actorName} updated ${taskTitle}`;
  }

  return `${activity.actorName} ${ACTIVITY_LABELS[activity.action]} ${
    taskTitle === "a task" ? "an item" : taskTitle
  }`;
}

export function getActivityMeta(activity: ProjectActivityEntry) {
  const parts = [formatTimestamp(activity.createdAt)];

  if (activity.actorEmail) {
    parts.push(activity.actorEmail);
  }

  return parts.join(" · ");
}

export function matchesTaskFilters(
  task: TaskSummary,
  filters: {
    search: string;
    status: TaskStatusFilter;
    priority: TaskPriorityFilter;
  }
) {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const matchesSearch =
    normalizedSearch.length === 0 ||
    task.title.toLowerCase().includes(normalizedSearch) ||
    task.assigneeName?.toLowerCase().includes(normalizedSearch);
  const matchesStatus = filters.status === "ALL" || task.status === filters.status;
  const matchesPriority =
    filters.priority === "ALL" || task.priority === filters.priority;

  return matchesSearch && matchesStatus && matchesPriority;
}
