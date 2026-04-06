import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BoardSummary,
  HealthPayload,
  ProjectActivityEntry,
  ProjectSummary,
  TaskSummary
} from "@taskflow/shared-types";
import {
  formatTimestamp,
  getActivityMeta,
  getActivityTitle,
  loadSession,
  matchesTaskFilters,
  normalizeProjectKey,
  persistSession
} from "./lib/app-utils";
import type {
  AuthSession,
  TaskPriorityFilter,
  TaskStatusFilter
} from "./lib/app-utils";

interface MePayload {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  projects: Array<{
    id: string;
    key: string;
    name: string;
    role: string;
  }>;
}

interface TaskCommentPayload {
  id: string;
  body: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  taskId?: string;
}

interface TaskDetailPayload {
  id: string;
  title: string;
  description: string | null;
  status: TaskSummary["status"];
  priority: TaskSummary["priority"];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    key: string;
    name: string;
  };
  board: {
    id: string;
    name: string;
  };
  assignee: {
    id: string;
    displayName: string;
    email: string;
  } | null;
  comments: TaskCommentPayload[];
}

const TASK_STATUSES: TaskSummary["status"][] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "DONE"
];

const TASK_PRIORITIES: TaskSummary["priority"][] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT"
];

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function fetchHealth(): Promise<HealthPayload> {
  const response = await fetch("/api/health/live");

  if (!response.ok) {
    throw new Error("TaskFlow API is unavailable");
  }

  return response.json();
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new HttpError(
      payload?.message ?? "TaskFlow request failed",
      response.status
    );
  }

  return payload as T;
}

async function fetchProjects(accessToken: string): Promise<ProjectSummary[]> {
  return requestJson("/api/projects", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

async function fetchBoards(
  accessToken: string,
  projectId: string
): Promise<BoardSummary[]> {
  return requestJson(`/api/projects/${projectId}/boards`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

async function fetchProjectTasks(
  accessToken: string,
  projectId: string
): Promise<TaskSummary[]> {
  return requestJson(`/api/projects/${projectId}/tasks`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

async function fetchTaskDetail(
  accessToken: string,
  taskId: string
): Promise<TaskDetailPayload> {
  return requestJson(`/api/tasks/${taskId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

async function fetchProjectActivity(
  accessToken: string,
  projectId: string
): Promise<ProjectActivityEntry[]> {
  return requestJson(`/api/projects/${projectId}/activity`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

async function fetchMe(accessToken: string): Promise<MePayload> {
  return requestJson("/api/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

async function loginRequest(credentials: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  return requestJson("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(credentials)
  });
}

async function logoutRequest(refreshToken: string) {
  return requestJson<{ success: boolean }>("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      refreshToken
    })
  });
}

async function createProjectRequest({
  accessToken,
  payload
}: {
  accessToken: string;
  payload: {
    name: string;
    key: string;
  };
}) {
  return requestJson<ProjectSummary>("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

async function createTaskRequest({
  accessToken,
  payload
}: {
  accessToken: string;
  payload: {
    title: string;
    projectId: string;
    boardId: string;
  };
}) {
  return requestJson<TaskSummary>("/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

async function createCommentRequest({
  accessToken,
  taskId,
  body
}: {
  accessToken: string;
  taskId: string;
  body: string;
}) {
  return requestJson<TaskCommentPayload>(`/api/tasks/${taskId}/comments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      body
    })
  });
}

async function updateTaskRequest({
  accessToken,
  taskId,
  payload
}: {
  accessToken: string;
  taskId: string;
  payload: {
    title: string;
    status: TaskSummary["status"];
    priority: TaskSummary["priority"];
  };
}) {
  return requestJson<TaskSummary>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export default function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: "demo@taskflow.local",
    password: "taskflow123"
  });
  const [projectForm, setProjectForm] = useState({
    name: "",
    key: ""
  });
  const [taskForm, setTaskForm] = useState({
    title: ""
  });
  const [commentForm, setCommentForm] = useState({
    body: ""
  });
  const [taskFilters, setTaskFilters] = useState<{
    search: string;
    status: TaskStatusFilter;
    priority: TaskPriorityFilter;
  }>({
    search: "",
    status: "ALL",
    priority: "ALL"
  });
  const [taskEditForm, setTaskEditForm] = useState<{
    title: string;
    status: TaskSummary["status"];
    priority: TaskSummary["priority"];
  }>({
    title: "",
    status: "TODO",
    priority: "MEDIUM"
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setSession(loadSession());
      setIsHydrated(true);
    });
  }, []);

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", session?.accessToken],
    queryFn: () => fetchProjects(session!.accessToken),
    enabled: isHydrated && Boolean(session?.accessToken),
    retry: false
  });
  const meQuery = useQuery({
    queryKey: ["me", session?.accessToken],
    queryFn: () => fetchMe(session!.accessToken),
    enabled: isHydrated && Boolean(session?.accessToken),
    retry: false
  });
  const boardsQuery = useQuery({
    queryKey: ["boards", session?.accessToken, selectedProjectId],
    queryFn: () => fetchBoards(session!.accessToken, selectedProjectId!),
    enabled: isHydrated && Boolean(session?.accessToken && selectedProjectId),
    retry: false
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", session?.accessToken, selectedProjectId],
    queryFn: () => fetchProjectTasks(session!.accessToken, selectedProjectId!),
    enabled: isHydrated && Boolean(session?.accessToken && selectedProjectId),
    retry: false
  });
  const activityQuery = useQuery({
    queryKey: ["activity", session?.accessToken, selectedProjectId],
    queryFn: () => fetchProjectActivity(session!.accessToken, selectedProjectId!),
    enabled: isHydrated && Boolean(session?.accessToken && selectedProjectId),
    retry: false
  });
  const taskDetailQuery = useQuery({
    queryKey: ["task", session?.accessToken, selectedTaskId],
    queryFn: () => fetchTaskDetail(session!.accessToken, selectedTaskId!),
    enabled: isHydrated && Boolean(session?.accessToken && selectedTaskId),
    retry: false
  });
  const deferredTaskSearch = useDeferredValue(taskFilters.search);
  const effectiveTaskFilters = {
    ...taskFilters,
    search: deferredTaskSearch
  };
  const allProjectTasks = tasksQuery.data ?? [];
  const selectedBoardTasks =
    allProjectTasks.filter((task) => task.boardId === selectedBoardId);
  const filteredBoardTasks = selectedBoardTasks.filter((task) =>
    matchesTaskFilters(task, effectiveTaskFilters)
  );
  const kanbanColumns = (boardsQuery.data ?? []).map((board) => {
    const tasks = allProjectTasks.filter((task) => task.boardId === board.id);
    const visibleTasks = tasks.filter((task) =>
      matchesTaskFilters(task, effectiveTaskFilters)
    );

    return {
      board,
      tasks,
      visibleTasks
    };
  });
  const visibleProjectTaskCount = kanbanColumns.reduce(
    (sum, column) => sum + column.visibleTasks.length,
    0
  );
  const boardSnapshot = {
    total: selectedBoardTasks.length,
    done: selectedBoardTasks.filter((task) => task.status === "DONE").length,
    inProgress: selectedBoardTasks.filter((task) => task.status === "IN_PROGRESS").length,
    urgent: selectedBoardTasks.filter((task) => task.priority === "URGENT").length
  };
  const boardCompletion =
    boardSnapshot.total === 0 ? 0 : Math.round((boardSnapshot.done / boardSnapshot.total) * 100);
  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (nextSession) => {
      startTransition(() => {
        setSession(nextSession);
      });
      persistSession(nextSession);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });
  const createProjectMutation = useMutation({
    mutationFn: createProjectRequest,
    onSuccess: (project, variables) => {
      queryClient.setQueryData<ProjectSummary[]>(
        ["projects", variables.accessToken],
        (current) => {
          if (!current) {
            return [project];
          }

          return [...current, project];
        }
      );
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      startTransition(() => {
        setSelectedProjectId(project.id);
        setProjectForm({
          name: "",
          key: ""
        });
        setSelectedBoardId(null);
        setSelectedTaskId(null);
      });
    }
  });
  const createTaskMutation = useMutation({
    mutationFn: createTaskRequest,
    onSuccess: (task, variables) => {
      queryClient.setQueryData<TaskSummary[]>(
        ["tasks", variables.accessToken, variables.payload.projectId],
        (current) => {
          if (!current) {
            return [task];
          }

          return [...current, task];
        }
      );
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      startTransition(() => {
        setTaskForm({
          title: ""
        });
        setSelectedTaskId(task.id);
      });
    }
  });
  const createCommentMutation = useMutation({
    mutationFn: createCommentRequest,
    onSuccess: (comment, variables) => {
      queryClient.setQueryData<TaskDetailPayload>(
        ["task", variables.accessToken, variables.taskId],
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            comments: [
              ...current.comments,
              {
                id: comment.id,
                body: comment.body,
                authorName: comment.authorName,
                authorEmail: comment.authorEmail,
                createdAt: comment.createdAt
              }
            ]
          };
        }
      );
      startTransition(() => {
        setCommentForm({
          body: ""
        });
      });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  });
  const updateTaskMutation = useMutation({
    mutationFn: updateTaskRequest,
    onSuccess: (task, variables) => {
      queryClient.setQueryData<TaskSummary[]>(
        ["tasks", variables.accessToken, task.projectId],
        (current) =>
          current?.map((item) => (item.id === task.id ? task : item)) ?? [task]
      );
      queryClient.setQueryData<TaskDetailPayload>(
        ["task", variables.accessToken, task.id],
        (current) =>
          current
            ? {
                ...current,
                title: task.title,
                status: task.status,
                priority: task.priority
              }
            : current
      );
      queryClient.invalidateQueries({
        queryKey: ["task", variables.accessToken, task.id]
      });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  });
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      startTransition(() => {
        setSession(null);
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        setSelectedTaskId(null);
      });
      persistSession(null);
      queryClient.removeQueries({ queryKey: ["me"] });
      queryClient.removeQueries({ queryKey: ["projects"] });
      queryClient.removeQueries({ queryKey: ["boards"] });
      queryClient.removeQueries({ queryKey: ["tasks"] });
      queryClient.removeQueries({ queryKey: ["activity"] });
      queryClient.removeQueries({ queryKey: ["task"] });
    }
  });

  useEffect(() => {
    const authError =
      (projectsQuery.error instanceof HttpError && projectsQuery.error.status === 401) ||
      (meQuery.error instanceof HttpError && meQuery.error.status === 401) ||
      (boardsQuery.error instanceof HttpError && boardsQuery.error.status === 401) ||
      (activityQuery.error instanceof HttpError && activityQuery.error.status === 401) ||
      (tasksQuery.error instanceof HttpError && tasksQuery.error.status === 401) ||
      (taskDetailQuery.error instanceof HttpError && taskDetailQuery.error.status === 401);

    if (!authError) {
      return;
    }

    startTransition(() => {
      setSession(null);
      setSelectedProjectId(null);
      setSelectedBoardId(null);
      setSelectedTaskId(null);
    });
    persistSession(null);
    queryClient.removeQueries({ queryKey: ["me"] });
    queryClient.removeQueries({ queryKey: ["projects"] });
    queryClient.removeQueries({ queryKey: ["boards"] });
    queryClient.removeQueries({ queryKey: ["tasks"] });
    queryClient.removeQueries({ queryKey: ["activity"] });
    queryClient.removeQueries({ queryKey: ["task"] });
  }, [
    activityQuery.error,
    boardsQuery.error,
    meQuery.error,
    projectsQuery.error,
    queryClient,
    taskDetailQuery.error,
    tasksQuery.error
  ]);

  useEffect(() => {
    if (!session) {
      startTransition(() => {
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        setSelectedTaskId(null);
      });
      return;
    }

    const projects = projectsQuery.data;

    if (!projects) {
      return;
    }

    if (projects.length === 0) {
      startTransition(() => {
        setSelectedProjectId(null);
        setSelectedBoardId(null);
        setSelectedTaskId(null);
      });
      return;
    }

    const hasSelectedProject = projects.some((project) => project.id === selectedProjectId);

    if (hasSelectedProject) {
      return;
    }

    startTransition(() => {
      setSelectedProjectId(projects[0].id);
    });
  }, [projectsQuery.data, selectedProjectId, session]);

  useEffect(() => {
    if (!selectedProjectId) {
      startTransition(() => {
        setSelectedBoardId(null);
        setSelectedTaskId(null);
      });
      return;
    }

    const boards = boardsQuery.data;

    if (!boards) {
      return;
    }

    if (boards.length === 0) {
      startTransition(() => {
        setSelectedBoardId(null);
        setSelectedTaskId(null);
      });
      return;
    }

    const hasSelectedBoard = boards.some((board) => board.id === selectedBoardId);

    if (hasSelectedBoard) {
      return;
    }

    startTransition(() => {
      setSelectedBoardId(boards[0].id);
    });
  }, [boardsQuery.data, selectedBoardId, selectedProjectId]);

  useEffect(() => {
    if (!selectedBoardId) {
      startTransition(() => {
        setSelectedTaskId(null);
      });
      return;
    }

    if (filteredBoardTasks.length === 0) {
      startTransition(() => {
        setSelectedTaskId(null);
      });
      return;
    }

    const hasSelectedTask = filteredBoardTasks.some((task) => task.id === selectedTaskId);

    if (hasSelectedTask) {
      return;
    }

    startTransition(() => {
      setSelectedTaskId(filteredBoardTasks[0].id);
    });
  }, [filteredBoardTasks, selectedBoardId, selectedTaskId]);

  useEffect(() => {
    startTransition(() => {
      setCommentForm({
        body: ""
      });
    });
  }, [selectedTaskId]);

  useEffect(() => {
    const currentTaskDetail =
      taskDetailQuery.data && taskDetailQuery.data.id === selectedTaskId
        ? taskDetailQuery.data
        : null;

    if (!selectedTaskId) {
      startTransition(() => {
        setTaskEditForm({
          title: "",
          status: "TODO",
          priority: "MEDIUM"
        });
      });
      return;
    }

    if (!currentTaskDetail) {
      return;
    }

    startTransition(() => {
      setTaskEditForm({
        title: currentTaskDetail.title,
        status: currentTaskDetail.status,
        priority: currentTaskDetail.priority
      });
    });
  }, [
    selectedTaskId,
    taskDetailQuery.data?.id,
    taskDetailQuery.data?.priority,
    taskDetailQuery.data?.status,
    taskDetailQuery.data?.title
  ]);

  const activeUser = meQuery.data ?? session?.user;
  const selectedProject =
    projectsQuery.data?.find((project) => project.id === selectedProjectId) ?? null;
  const selectedBoard =
    boardsQuery.data?.find((board) => board.id === selectedBoardId) ?? null;
  const selectedTaskSummary =
    filteredBoardTasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTaskDetail =
    taskDetailQuery.data && taskDetailQuery.data.id === selectedTaskId
      ? taskDetailQuery.data
      : null;
  const isTaskEditDirty = selectedTaskDetail
    ? taskEditForm.title.trim() !== selectedTaskDetail.title ||
      taskEditForm.status !== selectedTaskDetail.status ||
      taskEditForm.priority !== selectedTaskDetail.priority
    : false;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__copy">
          <span className="eyebrow">Docker Compose + CI/CD Learning Project</span>
          <h1>TaskFlow gives you a realistic full-stack repo to practice shipping.</h1>
          <p>
            This starter intentionally includes frontend, API, worker, PostgreSQL,
            Redis, Compose layering, and GitHub Actions so you can learn the full path
            from local development to staging and production deployment.
          </p>
          <div className="hero__actions">
            <a className="button button--primary" href="https://docs.docker.com/compose/" target="_blank" rel="noreferrer">
              Docker Compose
            </a>
            <a className="button" href="https://docs.github.com/en/actions" target="_blank" rel="noreferrer">
              GitHub Actions
            </a>
          </div>
        </div>
        <div className="status-card">
          <p className="status-card__label">API Health</p>
          <strong className="status-card__value">
            {healthQuery.isLoading ? "Checking..." : healthQuery.isError ? "Unavailable" : healthQuery.data?.status}
          </strong>
          <p className="status-card__hint">
            {healthQuery.isError
              ? "Start the API container or local service to see runtime health."
              : healthQuery.data?.timestamp ?? "Waiting for first response"}
          </p>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panel__header">
            <h2>Projects</h2>
            <span>{session ? `${projectsQuery.data?.length ?? 0} visible` : "Sign in to load"}</span>
          </div>
          <div className="stack">
            {!session ? (
              <p className="empty-state">
                Project data is now protected. Sign in to load only the projects
                the current user can access.
              </p>
            ) : (
              <form
                className="project-form"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (!session?.accessToken) {
                    return;
                  }

                  const trimmedName = projectForm.name.trim();
                  const normalizedKey = normalizeProjectKey(projectForm.key);

                  if (trimmedName.length < 3 || normalizedKey.length < 2) {
                    return;
                  }

                  createProjectMutation.mutate({
                    accessToken: session.accessToken,
                    payload: {
                      name: trimmedName,
                      key: normalizedKey
                    }
                  });
                }}
              >
                <label className="field">
                  <span>Project Name</span>
                  <input
                    className="input"
                    value={projectForm.name}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                    placeholder="TaskFlow Marketing Site"
                  />
                </label>
                <label className="field">
                  <span>Project Key</span>
                  <input
                    className="input input--mono"
                    value={projectForm.key}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        key: normalizeProjectKey(event.target.value)
                      }))
                    }
                    placeholder="MKT"
                  />
                </label>
                <div className="toolbar">
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={
                      createProjectMutation.isPending ||
                      projectForm.name.trim().length < 3 ||
                      normalizeProjectKey(projectForm.key).length < 2
                    }
                  >
                    {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                  </button>
                  <span className="toolbar__hint">
                    New projects start with Backlog, In Progress, and Done boards.
                  </span>
                </div>
                {createProjectMutation.isError ? (
                  <p className="form-message form-message--error">
                    {(createProjectMutation.error as Error).message}
                  </p>
                ) : null}
              </form>
            )}
            {projectsQuery.isLoading ? <p className="empty-state">Loading projects...</p> : null}
            {projectsQuery.isError ? (
              <p className="empty-state">
                {(projectsQuery.error as Error).message}
              </p>
            ) : null}
            {session && projectsQuery.data?.length === 0 ? (
              <p className="empty-state">
                No projects yet for this account. Create one here to exercise the protected API end to end.
              </p>
            ) : null}
            {projectsQuery.data?.map((project) => (
              <button
                key={project.id}
                className={`list-card list-card--button ${
                  project.id === selectedProjectId ? "list-card--active" : ""
                }`}
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setSelectedProjectId(project.id);
                  });
                }}
              >
                <div>
                  <div className="list-card__row">
                    <p className="list-card__title">{project.name}</p>
                    {project.id === selectedProjectId ? (
                      <span className="pill">Selected</span>
                    ) : null}
                  </div>
                  <p className="list-card__meta">
                    {project.key} · {project.role}
                  </p>
                </div>
                <p className="list-card__meta">
                  {project.boardCount} boards · {project.taskCount} tasks
                </p>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel__header">
            <h2>{session ? "Workspace" : "Sign In"}</h2>
            <span>
              {session ? (selectedProject ? selectedProject.key : "Choose a project") : "Protected API"}
            </span>
          </div>
          <div className="stack">
            {!session ? (
              <>
                <p className="empty-state">
                  Use the seeded demo account to test the auth flow end to end.
                </p>
                <form
                  className="auth-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    loginMutation.mutate(loginForm);
                  }}
                >
                  <label className="field">
                    <span>Email</span>
                    <input
                      className="input"
                      value={loginForm.email}
                      onChange={(event) =>
                        setLoginForm((current) => ({
                          ...current,
                          email: event.target.value
                        }))
                      }
                      autoComplete="email"
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      className="input"
                      type="password"
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm((current) => ({
                          ...current,
                          password: event.target.value
                        }))
                      }
                      autoComplete="current-password"
                    />
                  </label>
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </button>
                  {loginMutation.isError ? (
                    <p className="form-message form-message--error">
                      {(loginMutation.error as Error).message}
                    </p>
                  ) : null}
                </form>
              </>
            ) : (
              <>
                {!selectedProject ? (
                  <p className="empty-state">
                    Choose a project on the left to load boards from the API with the current Bearer token.
                  </p>
                ) : (
                  <>
                    <section className="detail-card">
                      <div className="detail-card__header">
                        <div>
                          <p className="detail-card__eyebrow">Active Project</p>
                          <h3>{selectedProject.name}</h3>
                        </div>
                        <span className="pill">{selectedProject.role}</span>
                      </div>
                      <div className="mini-stats">
                        <div className="mini-stats__item">
                          <span>Key</span>
                          <strong>{selectedProject.key}</strong>
                        </div>
                        <div className="mini-stats__item">
                          <span>Boards</span>
                          <strong>{selectedProject.boardCount}</strong>
                        </div>
                        <div className="mini-stats__item">
                          <span>Tasks</span>
                          <strong>{selectedProject.taskCount}</strong>
                        </div>
                      </div>
                    </section>

                    <div className="panel__subheader">
                      <h3>Boards</h3>
                      <span>{boardsQuery.data?.length ?? 0} lanes</span>
                    </div>
                    {boardsQuery.isLoading ? (
                      <p className="empty-state">Loading boards...</p>
                    ) : null}
                    {boardsQuery.isError ? (
                      <p className="empty-state">
                        {(boardsQuery.error as Error).message}
                      </p>
                    ) : null}
                    {boardsQuery.data?.map((board) => (
                      <button
                        key={board.id}
                        className={`list-card list-card--button ${
                          board.id === selectedBoardId ? "list-card--active" : ""
                        }`}
                        type="button"
                        onClick={() => {
                          startTransition(() => {
                            setSelectedBoardId(board.id);
                          });
                        }}
                      >
                        <div>
                          <div className="list-card__row">
                            <p className="list-card__title">{board.name}</p>
                            {board.id === selectedBoardId ? (
                              <span className="pill">Active</span>
                            ) : null}
                          </div>
                          <p className="list-card__meta">
                            Lane {board.position}
                          </p>
                        </div>
                        <p className="list-card__meta">
                          {board.taskCount} tasks
                        </p>
                      </button>
                    ))}
                    {boardsQuery.data?.length === 0 && !boardsQuery.isLoading ? (
                      <p className="empty-state">
                        This project has no boards yet.
                      </p>
                    ) : null}

                    <div className="panel__subheader">
                      <h3>Tasks</h3>
                      <span>
                        {selectedBoard
                          ? `${filteredBoardTasks.length} of ${selectedBoardTasks.length} in ${selectedBoard.name}`
                          : "Pick a board"}
                      </span>
                    </div>
                    {!selectedBoard ? (
                      <p className="empty-state">
                        Choose a board to inspect its tasks and create a new one in that lane.
                      </p>
                    ) : (
                      <>
                        <section className="stats-card">
                          <div className="panel__subheader">
                            <h4>Board Snapshot</h4>
                            <span>{boardCompletion}% complete</span>
                          </div>
                          <div className="metric-grid">
                            <div className="metric-card">
                              <span>Total</span>
                              <strong>{boardSnapshot.total}</strong>
                            </div>
                            <div className="metric-card">
                              <span>Done</span>
                              <strong>{boardSnapshot.done}</strong>
                            </div>
                            <div className="metric-card">
                              <span>In Progress</span>
                              <strong>{boardSnapshot.inProgress}</strong>
                            </div>
                            <div className="metric-card">
                              <span>Urgent</span>
                              <strong>{boardSnapshot.urgent}</strong>
                            </div>
                          </div>
                          <div className="progress">
                            <div
                              className="progress__fill"
                              style={{ width: `${boardCompletion}%` }}
                            />
                          </div>
                          <p className="stats-card__meta">
                            {boardSnapshot.done} completed tasks out of {boardSnapshot.total} in this lane.
                          </p>
                        </section>

                        <section className="filter-panel">
                          <div className="panel__subheader">
                            <h4>Filters</h4>
                            <span>
                              {taskFilters.search || taskFilters.status !== "ALL" || taskFilters.priority !== "ALL"
                                ? "Active"
                                : "All tasks visible"}
                            </span>
                          </div>
                          <div className="field-grid">
                            <label className="field">
                              <span>Search</span>
                              <input
                                className="input"
                                value={taskFilters.search}
                                onChange={(event) =>
                                  setTaskFilters((current) => ({
                                    ...current,
                                    search: event.target.value
                                  }))
                                }
                                placeholder="Filter by title or assignee"
                              />
                            </label>
                            <label className="field">
                              <span>Status</span>
                              <select
                                className="input"
                                value={taskFilters.status}
                                onChange={(event) =>
                                  setTaskFilters((current) => ({
                                    ...current,
                                    status: event.target.value as TaskStatusFilter
                                  }))
                                }
                              >
                                <option value="ALL">ALL</option>
                                {TASK_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>Priority</span>
                              <select
                                className="input"
                                value={taskFilters.priority}
                                onChange={(event) =>
                                  setTaskFilters((current) => ({
                                    ...current,
                                    priority: event.target.value as TaskPriorityFilter
                                  }))
                                }
                              >
                                <option value="ALL">ALL</option>
                                {TASK_PRIORITIES.map((priority) => (
                                  <option key={priority} value={priority}>
                                    {priority}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="toolbar">
                            <button
                              className="button"
                              type="button"
                              onClick={() =>
                                setTaskFilters({
                                  search: "",
                                  status: "ALL",
                                  priority: "ALL"
                                })
                              }
                              disabled={
                                taskFilters.search.length === 0 &&
                                taskFilters.status === "ALL" &&
                                taskFilters.priority === "ALL"
                              }
                            >
                              Clear Filters
                            </button>
                            <span className="toolbar__hint">
                              Filters apply to the current lane and the project overview below.
                            </span>
                          </div>
                        </section>

                        <section className="kanban-section">
                          <div className="panel__subheader">
                            <h4>Kanban Overview</h4>
                            <span>
                              {visibleProjectTaskCount} of {allProjectTasks.length} visible
                            </span>
                          </div>
                          <div className="kanban-board">
                            {kanbanColumns.map((column) => (
                              <div
                                key={column.board.id}
                                className={`kanban-column ${
                                  column.board.id === selectedBoardId
                                    ? "kanban-column--active"
                                    : ""
                                }`}
                              >
                                <button
                                  className="kanban-column__header"
                                  type="button"
                                  onClick={() => {
                                    startTransition(() => {
                                      setSelectedBoardId(column.board.id);
                                    });
                                  }}
                                >
                                  <div>
                                    <p className="kanban-column__title">{column.board.name}</p>
                                    <p className="kanban-column__meta">
                                      {column.visibleTasks.length} of {column.tasks.length} tasks
                                    </p>
                                  </div>
                                  {column.board.id === selectedBoardId ? (
                                    <span className="pill">Focused</span>
                                  ) : null}
                                </button>
                                <div className="kanban-column__stack">
                                  {column.visibleTasks.map((task) => (
                                    <button
                                      key={task.id}
                                      className={`kanban-task ${
                                        task.id === selectedTaskId
                                          ? "kanban-task--active"
                                          : ""
                                      }`}
                                      type="button"
                                      onClick={() => {
                                        startTransition(() => {
                                          setSelectedBoardId(column.board.id);
                                          setSelectedTaskId(task.id);
                                        });
                                      }}
                                    >
                                      <p className="kanban-task__title">{task.title}</p>
                                      <div className="tag-row">
                                        <span className="pill">{task.status}</span>
                                        <span className="pill">{task.priority}</span>
                                      </div>
                                      <p className="kanban-task__meta">
                                        {task.assigneeName ?? "Unassigned"}
                                      </p>
                                    </button>
                                  ))}
                                  {column.tasks.length === 0 ? (
                                    <p className="empty-state">
                                      No tasks in this board yet.
                                    </p>
                                  ) : null}
                                  {column.tasks.length > 0 &&
                                  column.visibleTasks.length === 0 ? (
                                    <p className="empty-state">
                                      No tasks in this board match the current filters.
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <form
                          className="project-form"
                          onSubmit={(event) => {
                            event.preventDefault();

                            if (!session?.accessToken || !selectedProjectId || !selectedBoardId) {
                              return;
                            }

                            const trimmedTitle = taskForm.title.trim();

                            if (trimmedTitle.length < 3) {
                              return;
                            }

                            createTaskMutation.mutate({
                              accessToken: session.accessToken,
                              payload: {
                                title: trimmedTitle,
                                projectId: selectedProjectId,
                                boardId: selectedBoardId
                              }
                            });
                          }}
                        >
                          <label className="field">
                            <span>New Task In {selectedBoard.name}</span>
                            <input
                              className="input"
                              value={taskForm.title}
                              onChange={(event) =>
                                setTaskForm({
                                  title: event.target.value
                                })
                              }
                              placeholder="Ship board-level task flow"
                            />
                          </label>
                          <div className="toolbar">
                            <button
                              className="button button--primary"
                              type="submit"
                              disabled={
                                createTaskMutation.isPending ||
                                taskForm.title.trim().length < 3
                              }
                            >
                              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                            </button>
                            <span className="toolbar__hint">
                              New tasks start as `TODO` with `MEDIUM` priority.
                            </span>
                          </div>
                          {createTaskMutation.isError ? (
                            <p className="form-message form-message--error">
                              {(createTaskMutation.error as Error).message}
                            </p>
                          ) : null}
                        </form>

                        {tasksQuery.isLoading ? (
                          <p className="empty-state">Loading tasks...</p>
                        ) : null}
                        {tasksQuery.isError ? (
                          <p className="empty-state">
                            {(tasksQuery.error as Error).message}
                          </p>
                        ) : null}
                        {filteredBoardTasks.map((task) => (
                          <button
                            key={task.id}
                            className={`task-card task-card--button ${
                              task.id === selectedTaskId ? "task-card--active" : ""
                            }`}
                            type="button"
                            onClick={() => {
                              startTransition(() => {
                                setSelectedTaskId(task.id);
                              });
                            }}
                          >
                            <div className="task-card__header">
                              <p className="list-card__title">{task.title}</p>
                              <div className="tag-row">
                                <span className="pill">{task.status}</span>
                                <span className="pill">{task.priority}</span>
                              </div>
                            </div>
                            <div className="task-card__meta">
                              <span>{selectedBoard.name}</span>
                              <span>{task.assigneeName ?? "Unassigned"}</span>
                            </div>
                          </button>
                        ))}
                        {selectedBoardTasks.length === 0 && !tasksQuery.isLoading ? (
                          <p className="empty-state">
                            No tasks in this lane yet. Create the first one above.
                          </p>
                        ) : null}
                        {selectedBoardTasks.length > 0 &&
                        filteredBoardTasks.length === 0 &&
                        !tasksQuery.isLoading ? (
                          <p className="empty-state">
                            No tasks match the current filters. Clear them to see the full lane again.
                          </p>
                        ) : null}

                        <div className="panel__subheader">
                          <h3>Task Detail</h3>
                          <span>
                            {selectedTaskSummary
                              ? selectedTaskSummary.title
                              : "Pick a task"}
                          </span>
                        </div>
                        {!selectedTaskSummary ? (
                          <p className="empty-state">
                            Select a task card to load its full detail payload and comments.
                          </p>
                        ) : null}
                        {taskDetailQuery.isLoading ? (
                          <p className="empty-state">Loading task detail...</p>
                        ) : null}
                        {taskDetailQuery.isError ? (
                          <p className="empty-state">
                            {(taskDetailQuery.error as Error).message}
                          </p>
                        ) : null}
                        {selectedTaskDetail ? (
                          <section className="inspector">
                            <div className="inspector__header">
                              <div>
                                <p className="detail-card__eyebrow">Selected Task</p>
                                <h3>{selectedTaskDetail.title}</h3>
                              </div>
                              <div className="tag-row">
                                <span className="pill">{selectedTaskDetail.status}</span>
                                <span className="pill">{selectedTaskDetail.priority}</span>
                              </div>
                            </div>
                            <div className="inspector__meta">
                              <span>{selectedTaskDetail.project.key}</span>
                              <span>{selectedTaskDetail.board.name}</span>
                              <span>
                                {selectedTaskDetail.assignee?.displayName ?? "Unassigned"}
                              </span>
                              <span>
                                Updated {formatTimestamp(selectedTaskDetail.updatedAt)}
                              </span>
                            </div>
                            <div className="inspector__section">
                              <div className="panel__subheader">
                                <h4>Edit Task</h4>
                                <span>PATCH /api/tasks/:id</span>
                              </div>
                              <form
                                className="project-form"
                                onSubmit={(event) => {
                                  event.preventDefault();

                                  if (!session?.accessToken || !selectedTaskId) {
                                    return;
                                  }

                                  const trimmedTitle = taskEditForm.title.trim();

                                  if (trimmedTitle.length < 3 || !isTaskEditDirty) {
                                    return;
                                  }

                                  updateTaskMutation.mutate({
                                    accessToken: session.accessToken,
                                    taskId: selectedTaskId,
                                    payload: {
                                      title: trimmedTitle,
                                      status: taskEditForm.status,
                                      priority: taskEditForm.priority
                                    }
                                  });
                                }}
                              >
                                <label className="field">
                                  <span>Title</span>
                                  <input
                                    className="input"
                                    value={taskEditForm.title}
                                    onChange={(event) =>
                                      setTaskEditForm((current) => ({
                                        ...current,
                                        title: event.target.value
                                      }))
                                    }
                                  />
                                </label>
                                <div className="field-grid">
                                  <label className="field">
                                    <span>Status</span>
                                    <select
                                      className="input"
                                      value={taskEditForm.status}
                                      onChange={(event) =>
                                        setTaskEditForm((current) => ({
                                          ...current,
                                          status: event.target.value as TaskSummary["status"]
                                        }))
                                      }
                                    >
                                      {TASK_STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                          {status}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="field">
                                    <span>Priority</span>
                                    <select
                                      className="input"
                                      value={taskEditForm.priority}
                                      onChange={(event) =>
                                        setTaskEditForm((current) => ({
                                          ...current,
                                          priority: event.target.value as TaskSummary["priority"]
                                        }))
                                      }
                                    >
                                      {TASK_PRIORITIES.map((priority) => (
                                        <option key={priority} value={priority}>
                                          {priority}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <div className="toolbar">
                                  <button
                                    className="button button--primary"
                                    type="submit"
                                    disabled={
                                      updateTaskMutation.isPending ||
                                      taskEditForm.title.trim().length < 3 ||
                                      !isTaskEditDirty
                                    }
                                  >
                                    {updateTaskMutation.isPending
                                      ? "Saving..."
                                      : "Save Changes"}
                                  </button>
                                  <span className="toolbar__hint">
                                    Update the task without leaving the inspector.
                                  </span>
                                </div>
                                {updateTaskMutation.isError ? (
                                  <p className="form-message form-message--error">
                                    {(updateTaskMutation.error as Error).message}
                                  </p>
                                ) : null}
                              </form>
                            </div>
                            <div className="inspector__section">
                              <h4>Description</h4>
                              <p className="empty-state inspector__copy">
                                {selectedTaskDetail.description ??
                                  "This task does not have a description yet."}
                              </p>
                            </div>
                            <div className="inspector__section">
                              <div className="panel__subheader">
                                <h4>Comments</h4>
                                <span>
                                  {selectedTaskDetail.comments.length} total
                                </span>
                              </div>
                              <form
                                className="project-form"
                                onSubmit={(event) => {
                                  event.preventDefault();

                                  if (!session?.accessToken || !selectedTaskId) {
                                    return;
                                  }

                                  const trimmedBody = commentForm.body.trim();

                                  if (trimmedBody.length < 1) {
                                    return;
                                  }

                                  createCommentMutation.mutate({
                                    accessToken: session.accessToken,
                                    taskId: selectedTaskId,
                                    body: trimmedBody
                                  });
                                }}
                              >
                                <label className="field">
                                  <span>Add Comment</span>
                                  <textarea
                                    className="input input--multiline"
                                    value={commentForm.body}
                                    onChange={(event) =>
                                      setCommentForm({
                                        body: event.target.value
                                      })
                                    }
                                    placeholder="Share an implementation note or review comment"
                                  />
                                </label>
                                <div className="toolbar">
                                  <button
                                    className="button button--primary"
                                    type="submit"
                                    disabled={
                                      createCommentMutation.isPending ||
                                      commentForm.body.trim().length < 1
                                    }
                                  >
                                    {createCommentMutation.isPending
                                      ? "Posting..."
                                      : "Post Comment"}
                                  </button>
                                  <span className="toolbar__hint">
                                    Comments are written through the protected task endpoint.
                                  </span>
                                </div>
                                {createCommentMutation.isError ? (
                                  <p className="form-message form-message--error">
                                    {(createCommentMutation.error as Error).message}
                                  </p>
                                ) : null}
                              </form>
                              {selectedTaskDetail.comments.length === 0 ? (
                                <p className="empty-state">
                                  No comments yet. Add the first note for this task.
                                </p>
                              ) : null}
                              {selectedTaskDetail.comments.map((comment) => (
                                <div key={comment.id} className="comment-card">
                                  <div className="comment-card__meta">
                                    <strong>{comment.authorName}</strong>
                                    <span>{comment.authorEmail}</span>
                                    <span>{formatTimestamp(comment.createdAt)}</span>
                                  </div>
                                  <p className="comment-card__body">{comment.body}</p>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        <div className="panel__subheader">
                          <h3>Project Activity</h3>
                          <span>{activityQuery.data?.length ?? 0} events</span>
                        </div>
                        {activityQuery.isLoading ? (
                          <p className="empty-state">Loading activity...</p>
                        ) : null}
                        {activityQuery.isError ? (
                          <p className="empty-state">
                            {(activityQuery.error as Error).message}
                          </p>
                        ) : null}
                        {activityQuery.data?.slice(0, 8).map((activity) => (
                          <div key={activity.id} className="activity-card">
                            <p className="activity-card__title">
                              {getActivityTitle(activity)}
                            </p>
                            <p className="activity-card__meta">
                              {getActivityMeta(activity)}
                            </p>
                          </div>
                        ))}
                        {activityQuery.data?.length === 0 && !activityQuery.isLoading ? (
                          <p className="empty-state">
                            No activity yet for this project.
                          </p>
                        ) : null}
                      </>
                    )}
                  </>
                )}
                <div className="panel__subheader">
                  <h3>Account</h3>
                  <span>{meQuery.data?.projects.length ?? projectsQuery.data?.length ?? 0} projects</span>
                </div>
                <div className="list-card">
                  <div>
                    <p className="list-card__title">{activeUser?.displayName ?? session.user.displayName}</p>
                    <p className="list-card__meta">{activeUser?.email ?? session.user.email}</p>
                  </div>
                  <p className="list-card__meta">Authenticated</p>
                </div>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    if (!session?.refreshToken) {
                      return;
                    }
                    logoutMutation.mutate(session.refreshToken);
                  }}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
                </button>
              </>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
