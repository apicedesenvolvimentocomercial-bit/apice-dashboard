/**
 * Compat da clínica: os helpers de cargo agora vivem em `role-permissions.ts`
 * (neutros, compartilhados com AgencyRole). Este módulo só reexporta com os
 * nomes históricos da clínica para não tocar os imports existentes.
 *
 * Código novo da clínica pode importar direto de `role-permissions.ts`.
 */

export {
  roleCan as clinicRoleCan,
  roleHasTabAccess as clinicRoleHasTabAccess,
  parseRolePermissions as parseClinicRolePermissions,
  parseDashboardPermissions,
  dashboardSectionVisible,
  dashboardItemVisible,
  canActOnRoleLevel,
  DASHBOARD_PERM_KEY,
  NOTIFICATION_PERM_KEY,
  parseNotificationPermissions,
  notificationChannelEnabled,
} from './role-permissions'

export type {
  RolePermAction as ClinicPermAction,
  RoleModulePerm as ClinicModulePerm,
  RolePermissions as ClinicRolePermissions,
  DashboardSectionPerm,
  DashboardPermissions,
  NotificationCategoryPerm,
  NotificationPermissions,
} from './role-permissions'
