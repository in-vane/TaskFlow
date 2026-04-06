import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post
} from "@nestjs/common";
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MinLength
} from "class-validator";
import type { TaskPriority, TaskStatus } from "@taskflow/shared-types";
import { TasksService } from "./tasks.service.js";

const TaskStatusValues = {
  BACKLOG: "BACKLOG",
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE"
} as const;

const TaskPriorityValues = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT"
} as const;

export class CreateTaskDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsString()
  @MinLength(3)
  projectId!: string;

  @IsString()
  @MinLength(3)
  boardId!: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  title?: string;

  @IsOptional()
  @IsEnum(TaskStatusValues)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriorityValues)
  priority?: TaskPriority;
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get("projects/:projectId/tasks")
  findByProject(
    @Param("projectId") projectId: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.tasksService.findByProject(projectId, authorization);
  }

  @Get("tasks/:id")
  findOne(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.tasksService.findOne(id, authorization);
  }

  @Post("tasks")
  create(
    @Body() dto: CreateTaskDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.tasksService.create(dto, authorization);
  }

  @Patch("tasks/:id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.tasksService.update(id, dto, authorization);
  }

  @Post("tasks/:id/comments")
  createComment(
    @Param("id") id: string,
    @Body() dto: CreateCommentDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.tasksService.createComment(id, dto.body, authorization);
  }
}
