import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminSessionGuard } from './admin-session.guard';

@Controller('admin/api')
@UseGuards(AdminSessionGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('overview')
  overview() {
    return this.dashboard.overview();
  }

  @Get('deletion-queue')
  deletionQueue() {
    return this.dashboard.deletionQueue();
  }
}
