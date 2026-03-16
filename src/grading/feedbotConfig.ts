import { FeedBotConfig } from './types.js'

export interface FeedbotValidationResult {
  runtimeEnabled: boolean
  valid: boolean
  missingFields: string[]
}

export function validateFeedbotConfig(
  feedbot: FeedBotConfig | undefined
): FeedbotValidationResult {
  if (!feedbot || !feedbot.enabled) {
    return {
      runtimeEnabled: false,
      valid: true,
      missingFields: []
    }
  }

  const missingFields: string[] = []
  if (!feedbot.provider) missingFields.push('provider')
  if (!feedbot.model) missingFields.push('model')
  if (!feedbot.account) missingFields.push('account')
  if (!feedbot.spec_url) missingFields.push('spec_url')

  const valid = missingFields.length === 0

  return {
    runtimeEnabled: valid,
    valid,
    missingFields
  }
}
