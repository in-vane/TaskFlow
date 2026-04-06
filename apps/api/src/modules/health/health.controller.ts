import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  getLive() {
    return this.healthService.live();
  }

  @Get("ready")
  getReady() {
    return this.healthService.ready();
  }
}

