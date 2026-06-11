import { describe, expect, it } from 'vitest'

import { findPermissionEscalations, type RolePermissions } from './role-permissions'

/**
 * Anti-escalação (princípio do subconjunto): gestor de cargos não concede o
 * que não tem. Cobre módulo/ação, a capacidade `staff` (convidar pessoas) e a
 * visibilidade de dashboard (seção + item desligado).
 */

const actor: RolePermissions = {
  crm: { access: true, read: true, write: true },
  patients: { access: true, read: true },
  staff: { access: true, read: true, write: true },
  dashboard: {
    commercialKpis: { access: true, items: { noShow: false } },
  } as never,
}

describe('findPermissionEscalations', () => {
  it('subconjunto exato → sem violações', () => {
    const granted: RolePermissions = {
      crm: { access: true, read: true },
      dashboard: { commercialKpis: { access: true, items: { noShow: false } } } as never,
    }
    expect(findPermissionEscalations(granted, actor)).toEqual([])
  })

  it('conceder módulo que o ator não tem → violação de access', () => {
    const granted: RolePermissions = {
      financial: { access: true, read: true },
    }
    expect(findPermissionEscalations(granted, actor)).toEqual(['financial:access'])
  })

  it('conceder ação acima da própria (write sem ter write) → violação', () => {
    const granted: RolePermissions = {
      patients: { access: true, read: true, write: true },
    }
    expect(findPermissionEscalations(granted, actor)).toEqual(['patients:write'])
  })

  it('exemplo do requisito: sem staff não pode conceder convite', () => {
    const semStaff: RolePermissions = { crm: { access: true, read: true, write: true } }
    const granted: RolePermissions = { staff: { access: true, read: true, write: true } }
    expect(findPermissionEscalations(granted, semStaff)).toEqual(['staff:access'])
    // Quem TEM staff pode conceder.
    expect(findPermissionEscalations(granted, actor)).toEqual([])
  })

  it('dashboard: seção que o ator não vê → violação', () => {
    const granted: RolePermissions = {
      dashboard: { financialKpis: { access: true } } as never,
    }
    expect(findPermissionEscalations(granted, actor)).toEqual(['dashboard:financialKpis'])
  })

  it('dashboard: item desligado do ator não pode nascer ligado', () => {
    // Ator não vê noShow; conceder a seção SEM desligar noShow = escalação.
    const granted: RolePermissions = {
      dashboard: { commercialKpis: { access: true } } as never,
    }
    expect(findPermissionEscalations(granted, actor)).toEqual(['dashboard:commercialKpis.noShow'])
  })

  it('módulo bloqueado (access false) no concedido é ignorado', () => {
    const granted: RolePermissions = { financial: { access: false } }
    expect(findPermissionEscalations(granted, actor)).toEqual([])
  })

  it('notifications é preferência, não capacidade — ignorada', () => {
    const granted: RolePermissions = {
      notifications: { financial: { inApp: true, email: true } } as never,
    }
    expect(findPermissionEscalations(granted, actor)).toEqual([])
  })
})
