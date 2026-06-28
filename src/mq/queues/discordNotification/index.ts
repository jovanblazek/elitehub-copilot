import * as Sentry from '@sentry/node'
import { Worker } from 'bullmq'
import type { Client } from 'discord.js'
import { Prisma } from '../../../utils'
import { Redis } from '../../../utils/redis'
import { QueueNames } from '../../constants'
import { processConflictEvent } from './processors/conflict'
import { processExpansionEvent } from './processors/expansion'
import { processInfluenceThreatEvent } from './processors/influenceThreat'
import { processRetreatEvent } from './processors/retreat'
import type { DiscordNotificationJobData, EventTypeMap } from './types'
import {
  cleanupInvalidNotificationChannels,
  validateGuildFactionsNotificationChannel,
} from './utils'

export { DiscordNotificationQueue } from './queue'

const ConflictEventTypes = ['conflictPending', 'conflictStarted', 'conflictEnded'] as const
const ExpansionEventTypes = ['expansionPending', 'expansionStarted', 'expansionEnded'] as const
const RetreatEventTypes = ['retreatPending', 'retreatStarted', 'retreatEnded'] as const

type ConflictEventType = (typeof ConflictEventTypes)[number]
type ExpansionEventType = (typeof ExpansionEventTypes)[number]
type RetreatEventType = (typeof RetreatEventTypes)[number]

export const CreateDiscordNotificationWorker = ({ client }: { client: Client }) =>
  new Worker<DiscordNotificationJobData<keyof EventTypeMap>>(
    QueueNames.discordNotification,
    async (job) => {
      const { event, factionName, systemName, timestamp, source } = job.data

      try {
        Sentry.addBreadcrumb({
          category: QueueNames.discordNotification,
          message: `Processing notification for ${factionName} in ${systemName}`,
          data: {
            eventType: event.type,
            timestamp,
            source,
          },
        })

        const guildFactionsFromDB = await Prisma.guildFaction.findMany({
          where: {
            notificationChannelId: {
              not: null,
            },
            faction: {
              name: factionName,
            },
          },
          include: {
            guild: true,
            faction: true,
          },
        })

        if (guildFactionsFromDB.length === 0) {
          return
        }

        const { validGuildFactions: guildFactions, invalidGuildFactions } =
          validateGuildFactionsNotificationChannel(client, guildFactionsFromDB)

        void cleanupInvalidNotificationChannels(invalidGuildFactions)

        if (ConflictEventTypes.includes(event.type as ConflictEventType)) {
          await processConflictEvent({
            client,
            jobData: job.data as DiscordNotificationJobData<ConflictEventType>,
            guildFactions,
          })
        } else if (ExpansionEventTypes.includes(event.type as ExpansionEventType)) {
          await processExpansionEvent({
            client,
            jobData: job.data as DiscordNotificationJobData<ExpansionEventType>,
            guildFactions,
          })
        } else if (RetreatEventTypes.includes(event.type as RetreatEventType)) {
          await processRetreatEvent({
            client,
            jobData: job.data as DiscordNotificationJobData<RetreatEventType>,
            guildFactions,
          })
        } else if (event.type === 'influenceThreat') {
          await processInfluenceThreatEvent({
            client,
            jobData: job.data as DiscordNotificationJobData<'influenceThreat'>,
            guildFactions,
          })
        }
      } catch (error) {
        Sentry.withScope((scope) => {
          scope.setTag('queue', QueueNames.discordNotification)
          scope.setTag('system', systemName)
          scope.setTag('faction', factionName)
          scope.setTag('event_type', event.type)
          scope.setContext('JobData', {
            systemName,
            factionName,
            timestamp,
            eventType: event.type,
            source,
            jobId: job.id,
            attemptsMade: job.attemptsMade,
          })

          Sentry.captureException(error)
        })

        throw error
      }
    },
    {
      connection: Redis,
      limiter: {
        max: 5,
        duration: 1000,
      },
    }
  )
