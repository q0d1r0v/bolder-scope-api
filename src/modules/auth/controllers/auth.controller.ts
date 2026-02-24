import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import {
  AuthResponseDto,
  LogoutResponseDto,
} from '@/modules/auth/dto/auth-response.dto';
import { LoginDto } from '@/modules/auth/dto/login.dto';
import { RefreshTokenDto } from '@/modules/auth/dto/refresh-token.dto';
import { RegisterDto } from '@/modules/auth/dto/register.dto';
import { VerifyEmailDto } from '@/modules/auth/dto/verify-email.dto';
import { AuthService } from '@/modules/auth/services/auth.service';

@ApiTags('Auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user account and send verification email',
  })
  @ApiCreatedResponse({
    description: 'User created and initial auth tokens issued',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'User with this email already exists' })
  register(@Body() payload: RegisterDto) {
    return this.authService.register(payload);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({
    description: 'Authenticated successfully and auth tokens issued',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'User account is not active' })
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token and rotate refresh token' })
  @ApiOkResponse({
    description: 'Token pair refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is expired or invalid',
  })
  @ApiForbiddenResponse({ description: 'User account is not active' })
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refresh(payload);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and revoke refresh session' })
  @ApiOkResponse({
    description: 'Session revoked (or already inactive)',
    type: LogoutResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  logout(@Body() payload: RefreshTokenDto) {
    return this.authService.logout(payload);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify user email with token sent via email' })
  @ApiOkResponse({
    description: 'Email verified and new auth tokens issued',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired email verification token',
  })
  verifyEmail(@Body() payload: VerifyEmailDto) {
    return this.authService.verifyEmail(payload);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify user email via direct link' })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token',
  })
  @ApiOkResponse({
    description: 'Email verified and new auth tokens issued',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired email verification token',
  })
  verifyEmailFromQuery(@Query() payload: VerifyEmailDto) {
    return this.authService.verifyEmail(payload);
  }
}
