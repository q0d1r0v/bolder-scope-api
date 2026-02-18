import { Controller, Get, Param, Query } from '@nestjs/common';
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
import { AdminInvoicesQueryDto } from '@/modules/admin/dto/admin-invoices.dto';
import { AdminInvoicesService } from '@/modules/admin/services/admin-invoices.service';

@ApiTags('Admin - Invoices')
@ApiBearerAuth('bearer')
@SystemRoles(SystemRole.SUPER_ADMIN)
@Controller('admin/invoices')
export class AdminInvoicesController {
  constructor(private readonly adminInvoicesService: AdminInvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all invoices (admin)' })
  @ApiOkResponse({ description: 'Paginated list of all invoices' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findAll(@Query() query: AdminInvoicesQueryDto) {
    return this.adminInvoicesService.findAll(query);
  }

  @Get(':invoiceId')
  @ApiOperation({ summary: 'Get invoice details (admin)' })
  @ApiOkResponse({ description: 'Invoice details with organization and subscription' })
  @ApiNotFoundResponse({ description: 'Invoice not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Super admin access required' })
  findOne(@Param('invoiceId') invoiceId: string) {
    return this.adminInvoicesService.findOne(invoiceId);
  }
}
