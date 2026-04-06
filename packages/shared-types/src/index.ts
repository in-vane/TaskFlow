export type UserRole = "OWNER" | "ADMIN" | "MEMBER";
export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ActivityAction =
  | "CREATED"
  | "UPDATED"
  | "TASK_MOVED"
  | "COMMENTED"
  | "INVITED";

export interface HealthPayload {
  status: "ok" | "degraded";
  timestamp: string;
  services?: Record<string, "up" | "down">;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  role: UserRole;
  boardCount: number;
  taskCount: number;
}

export interface BoardSummary {
  id: string;
  projectId: string;
  name: string;
  position: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummary {
  id: string;
  projectId: string;
  boardId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName?: string;
  dueDate?: string;
}

export interface ProjectActivityEntry {
  id: string;
  projectId: string;
  taskId: string | null;
  action: ActivityAction;
  actorName: string;
  actorEmail?: string;
  taskTitle?: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
