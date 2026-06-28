import type { Worker } from 'bullmq'
import { Client, GatewayIntentBits } from 'discord.js'
import Koa from 'koa'
import { initEventHandlers } from './events'
import { initMQ } from './mq'
import { initVaultSseManager, shutdownVaultSseManager } from './realtime/vaultSseManager'
import initTickDetector from './tickDetector/tickDetector'
import { initActivityHandler } from './utils/botActivity'
import logger from './utils/logger'
import { Posthog } from './utils/posthog'
import { loadTrackedFactionsFromDBToRedis, Redis } from './utils/redis'
import './i18n/dayjsLocales'
import './utils/environment'
import './utils/sentry'

let BullMQWorkers: Worker[] = []
const BotClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

BotClient.once('ready', () => {
  initEventHandlers(BotClient)
  initActivityHandler(BotClient)
  // Disable to prevent spam when hot reloading
  if (process.env.NODE_ENV === 'production') {
    void initTickDetector(BotClient)
  }
  logger.info('[Bot] Ready')
})

void BotClient.login(process.env.BOT_TOKEN)

// Server used as a health check for the bot
const KoaApp = new Koa()
KoaApp.use((ctx) => {
  ctx.body = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  }
})
KoaApp.listen(process.env.PORT, () => {
  logger.info(`[Koa] Server listening on port ${process.env.PORT!}`)
})

// eslint-disable-next-line @typescript-eslint/no-misused-promises
Redis.on('ready', async () => {
  logger.info('[Redis] Connection established')
  await loadTrackedFactionsFromDBToRedis()
  BullMQWorkers = initMQ({ client: BotClient })
  await initVaultSseManager()
})

// Graceful shutdown
let isShuttingDown = false

const shutdown = async () => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  logger.info('Shutting down...')

  // Close Discord client
  logger.info('[Bot] Closing client connection...')
  await BotClient.destroy()
  logger.info('[Bot] Connection closed')

  shutdownVaultSseManager()

  // Close BullMQ workers
  logger.info('[BullMQ] Closing workers...')
  await Promise.all(BullMQWorkers.map((worker) => worker.close()))
  logger.info('[BullMQ] All workers closed')

  // Close Redis connection
  logger.info('[Redis] Closing connection...')
  await Redis.quit()
  logger.info('[Redis] Connection closed')

  // Close Koa server
  logger.info('[Koa] Closing server...')
  await new Promise<void>((resolve) => {
    KoaApp.listen().close(() => resolve())
  })
  logger.info('[Koa] Server closed')

  // Close PostHog
  logger.info('[PostHog] Shutting down analytics...')
  await Posthog.shutdown()
  logger.info('[PostHog] Analytics shut down')

  // Give time for connections to close
  await new Promise((resolve) => {
    setTimeout(resolve, 500)
  })

  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown()
})
process.on('SIGINT', () => {
  void shutdown()
})
