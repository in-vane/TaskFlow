import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { ProjectsService } from "./projects.service.js";

class CreateProjectDto {
  @IsString()
  @Length(3, 80)
  name!: string;

  @IsString()
  @Length(2, 8)
  key!: string;
}

class CreateBoardDto {
  @IsString()
  @Length(2, 80)
  name!: string;
}

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@Headers("authorization") authorization?: string) {
    return this.projectsService.findAll(authorization);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.projectsService.findOne(id, authorization);
  }

  @Get(":id/boards")
  findBoards(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.projectsService.findBoards(id, authorization);
  }

  @Get(":id/activity")
  findActivity(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.projectsService.findActivity(id, authorization);
  }

  @Post()
  create(
    @Body() dto: CreateProjectDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.projectsService.create(dto, authorization);
  }

  @Post(":id/boards")
  createBoard(
    @Param("id") id: string,
    @Body() body: CreateBoardDto,
    @Headers("authorization") authorization?: string
  ) {
    return this.projectsService.createBoard(id, body, authorization);
  }
}
