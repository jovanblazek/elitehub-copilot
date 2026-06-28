import RedisClient from 'ioredis'
import { uniqBy } from 'lodash'
import { RedisKeys } from '../constants'
import type { TrackedFaction } from '../types/redis'
import { Prisma } from './prismaClient'

const { REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, REDIS_HOST } = process.env

export const Redis = new RedisClient({
  port: parseInt(REDIS_PORT, 10),
  password: REDIS_PASSWORD,
  host: REDIS_HOST,
  username: REDIS_USERNAME,
  maxRetriesPerRequest: null,
})

export const getTrackedFactions = async () => {
  const trackedFactionsStringified = await Redis.get(RedisKeys.trackedFactions)
  if (!trackedFactionsStringified) {
    return []
  }

  return JSON.parse(trackedFactionsStringified) as TrackedFaction[]
}

export const loadTrackedFactionsFromDBToRedis = async () => {
  // Load only factions linked to guilds, not every faction in the DB
  const trackedGuildFactions = await Prisma.guildFaction.findMany({
    where: {
      notificationChannelId: {
        not: null,
      },
    },
    include: { faction: true },
  })

  const uniqueFactions = uniqBy(
    trackedGuildFactions.map(({ faction }) => faction),
    'id'
  )

  await Redis.set(RedisKeys.trackedFactions, JSON.stringify(uniqueFactions))
}
