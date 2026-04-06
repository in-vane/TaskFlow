import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service.js";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("auth/login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("auth/refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("auth/logout")
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get("me")
  me(@Headers("authorization") authorization?: string) {
    return this.authService.me(authorization);
  }
}
