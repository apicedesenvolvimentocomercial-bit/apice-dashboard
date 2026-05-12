import { goalAtRiskRule } from './goal-at-risk'
import { highMarketingLowRoiRule } from './high-marketing-low-roi'
import { highNoShowRule } from './high-no-show'
import { inactivePatientsRule } from './inactive-patients'
import { lowConversionRule } from './low-conversion'
import { lowMarginRule } from './low-margin'
import { noLeads7dRule } from './no-leads-7d'
import { procedureConcentrationRule } from './procedure-concentration'
import { revenueDropRule } from './revenue-drop'
import { slowFirstContactRule } from './slow-first-contact'

import type { InsightRule } from '../types'

export const ALL_RULES: InsightRule[] = [
  highNoShowRule,
  lowConversionRule,
  lowMarginRule,
  revenueDropRule,
  noLeads7dRule,
  slowFirstContactRule,
  procedureConcentrationRule,
  inactivePatientsRule,
  goalAtRiskRule,
  highMarketingLowRoiRule,
]
