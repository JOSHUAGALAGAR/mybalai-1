import { describe, expect, it } from 'vitest'

import { primaryRole, roleHome } from '@/lib/auth/roles'
import { navForRoles } from '@/lib/navigation/nav-config'

describe('primaryRole', () => {
  it('picks the highest-authority role', () => {
    expect(primaryRole(['tenant', 'landlord'])).toBe('landlord')
    expect(primaryRole(['caretaker', 'tenant'])).toBe('caretaker')
    expect(primaryRole(['landlord', 'superadmin', 'tenant'])).toBe('superadmin')
  })
  it('defaults to tenant when empty', () => {
    expect(primaryRole([])).toBe('tenant')
  })
})

describe('roleHome', () => {
  it('maps each role to its landing route', () => {
    expect(roleHome(['tenant'])).toBe('/dashboard')
    expect(roleHome(['landlord'])).toBe('/landlord')
    expect(roleHome(['caretaker'])).toBe('/caretaker')
    expect(roleHome(['superadmin'])).toBe('/admin')
  })
  it('respects role priority', () => {
    expect(roleHome(['tenant', 'landlord'])).toBe('/landlord')
  })
})

describe('navForRoles', () => {
  it('returns the nav for the primary role', () => {
    const tenantNav = navForRoles(['tenant'])
    const hrefs = tenantNav.flatMap((s) => s.items.map((i) => i.href))
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/settings')
    expect(hrefs).not.toContain('/landlord')

    const adminNav = navForRoles(['superadmin', 'tenant'])
    const adminHrefs = adminNav.flatMap((s) => s.items.map((i) => i.href))
    expect(adminHrefs).toContain('/admin')
    expect(adminHrefs).toContain('/admin/subscriptions')
  })

  it('every nav ends with a Settings link that is not "soon"', () => {
    for (const roles of [
      ['tenant'],
      ['landlord'],
      ['caretaker'],
      ['superadmin'],
    ] as const) {
      const settings = navForRoles([...roles])
        .flatMap((s) => s.items)
        .find((i) => i.href === '/settings')
      expect(settings, `settings for ${roles[0]}`).toBeDefined()
      expect(settings?.soon).toBeFalsy()
    }
  })
})
