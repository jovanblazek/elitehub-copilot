import { RedisKeys } from '../../../constants'
import { Redis } from '../../../utils/redis'
import { EXPANSION_REDIS_EXPIRATION } from './constants'
import type { VaultRealtimeJobData } from './types'

export const shouldEmitSseNotification = async ({
  payload,
}: VaultRealtimeJobData<'factionStateChanged'>): Promise<boolean> => {
  if (payload.state !== 'Expansion') {
    return true
  }

  const redisKey = RedisKeys.sseExpansion({ factionId: payload.factionId })

  if (payload.lifecycle === 'ended') {
    const isDeletedFromRedis = await Redis.del(redisKey)
    return isDeletedFromRedis > 0
  }

  const isFirstOccurrence = await Redis.setnx(redisKey, 1)
  if (!isFirstOccurrence) {
    return false
  }

  await Redis.expire(redisKey, EXPANSION_REDIS_EXPIRATION)
  return true
}
