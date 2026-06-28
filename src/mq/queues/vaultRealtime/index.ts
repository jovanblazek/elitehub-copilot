import * as Sentry from '@sentry/node'
import { Queue, Worker } from 'bullmq'
import { createEliteHubVaultClient } from '../../../graphql/client'
import { Redis } from '../../../utils/redis'
import { QueueNames } from '../../constants'
import { DiscordNotificationQueue } from '../discordNotification/queue'
import type { DiscordNotificationJobData } from '../discordNotification/types'
import { VAULT_REALTIME_JOB_NAME } from './constants'
import { processFactionControlThreatChangedEvent } from './processors/factionControlThreatChanged'
import { processFactionStateChangedEvent } from './processors/factionStateChanged'
import type { VaultRealtimeJobData } from './types'
import { shouldEmitSseNotification } from './utils'

const enqueueDiscordNotification = async ({ job }: { job: DiscordNotificationJobData }) => {
  await DiscordNotificationQueue.add(
    `${VAULT_REALTIME_JOB_NAME}:${job.event.type}:${job.factionName}:${job.systemName}`,
    job,
    {
      jobId: `${job.source}:${job.event.type}:${job.factionName}:${job.systemName}:${job.timestamp}`,
    }
  )
}

export const VaultRealtimeQueue = new Queue<VaultRealtimeJobData>(QueueNames.vaultRealtime, {
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
})

export const VaultRealtimeWorker = new Worker<VaultRealtimeJobData>(
  QueueNames.vaultRealtime,
  async (job) => {
    const client = createEliteHubVaultClient()

    try {
      if (job.data.eventType === 'factionControlThreatChanged') {
        const { payload } = job.data as VaultRealtimeJobData<'factionControlThreatChanged'>
        const notification = await processFactionControlThreatChangedEvent({ client, payload })
        if (notification) {
          await enqueueDiscordNotification({ job: notification })
        }
        return
      }

      const factionStateJob = job.data as VaultRealtimeJobData<'factionStateChanged'>
      const { payload } = factionStateJob
      const isNotificationAllowed = await shouldEmitSseNotification(factionStateJob)
      if (!isNotificationAllowed) {
        return
      }
      const notification = await processFactionStateChangedEvent({ client, payload })
      if (notification) {
        await enqueueDiscordNotification({ job: notification })
      }
    } catch (error) {
      Sentry.withScope((scope) => {
        scope.setTag('queue', QueueNames.vaultRealtime)
        scope.setTag('eventType', job.data.eventType)
        scope.setContext('JobData', {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          payload: job.data.payload,
          subscription: job.data.subscription,
        })
        Sentry.captureException(error)
      })
      throw error
    }
  },
  { connection: Redis }
)
