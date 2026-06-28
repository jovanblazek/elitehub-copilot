import { Queue } from 'bullmq'
import { Redis } from '../../../utils/redis'
import { QueueNames } from '../../constants'
import type { DiscordNotificationJobData, EventTypeMap } from './types'

// Defined here because of dependency cycle if defined in index.ts
export const DiscordNotificationQueue = new Queue<DiscordNotificationJobData<keyof EventTypeMap>>(
  QueueNames.discordNotification,
  {
    connection: Redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000 * 60,
      },
      removeOnComplete: 100,
      removeOnFail: 1000,
    },
  }
)
