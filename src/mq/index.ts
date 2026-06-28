import type { Client } from 'discord.js'
import logger from '../utils/logger'
import { CreateDiscordNotificationWorker } from './queues/discordNotification'
import { CreateFleetCarrierJumpCleanupWorker } from './queues/fleetCarrierJumpCleanup'
import { VaultRealtimeWorker } from './queues/vaultRealtime'

export const initMQ = ({ client }: { client: Client }) => {
  const bullMQWorkers = [
    CreateDiscordNotificationWorker({ client }),
    CreateFleetCarrierJumpCleanupWorker({ client }),
    VaultRealtimeWorker,
  ]
  bullMQWorkers.forEach((worker) => {
    worker.on('failed', (job) => {
      if (job) {
        logger.error(new Error(job.failedReason), `[BullMQ] Job: ${job.name}:${job.id} - FAILED`)
      } else {
        logger.error(
          new Error('Unknown job failed'),
          `[BullMQ] Worker: ${worker.name} UNKNOWN JOB FAILED`
        )
      }
    })
    worker.on('error', (error) => {
      logger.error(error, `[BullMQ] Worker: ${worker.name} - ERROR`)
    })
    worker.on('active', (job) => {
      logger.debug(job.data, `[BullMQ] Job: ${job.name}:${job.id} - ACTIVE`)
    })
    worker.on('completed', (job) => {
      logger.debug(job.returnvalue, `[BullMQ] Job: ${job.name}:${job.id} - COMPLETED`)
    })
    worker.on('closed', () => {
      logger.debug(`[BullMQ] Worker: ${worker.name} - CLOSED`)
    })
  })

  return bullMQWorkers
}
