import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { SystemRoles } from '@/common/decorators/system-roles.decorator';
import {
  AdminUpdateUserDto,
  AdminUsersQueryDto,
} from '@/modules/admin/dto/admin-users.dto';
import { AdminUsersService } from '@/modules/admin/services/admin-users.service';

@ApiTags('Admin - Users')
@ApiBearerAuth('bearer')
@SystemRoles(SystemRole.SUPER_ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (admin)' })
  @ApiOkResponse({ description: 'Paginated list of all users' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findAll(@Query() query: AdminUsersQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user details (admin)' })
  @ApiOkResponse({ description: 'User details with memberships' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findOne(@Param('userId') userId: string) {
    return this.adminUsersService.findOne(userId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update user status or system role (admin)' })
  @ApiOkResponse({ description: 'User updated successfully' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  update(@Param('userId') userId: string, @Body() payload: AdminUpdateUserDto) {
    return this.adminUsersService.update(userId, payload);
  }
}
