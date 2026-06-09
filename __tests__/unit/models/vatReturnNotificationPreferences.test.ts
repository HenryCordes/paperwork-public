import mongoose from 'mongoose'

import VATPrefs from '../../../models/VATReturnNotificationPreferences'

describe('VATReturnNotificationPreferences.isNotificationEnabledForPeriod', () => {
  it('reflects the per-period-type flags', () => {
    const prefs = new VATPrefs({
      userId: new mongoose.Types.ObjectId(),
      tenantId: 't1',
      monthlyNotifications: true,
      quarterlyNotifications: false,
      yearlyNotifications: true,
    })

    expect(prefs.isNotificationEnabledForPeriod('monthly')).toBe(true)
    expect(prefs.isNotificationEnabledForPeriod('quarterly')).toBe(false)
    expect(prefs.isNotificationEnabledForPeriod('yearly')).toBe(true)
    expect(prefs.isNotificationEnabledForPeriod('weekly')).toBe(false)
  })
})
