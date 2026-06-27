import * as Sentry from '@sentry/node'
import { type ErrorEvent, EventSource } from 'eventsource'
import { ELITEHUB_VAULT_API_KEY_HEADER, getEliteHubVaultRealtimeSseUrl } from '../graphql/client'
import { VaultRealtimeQueue } from '../mq/queues/vaultRealtime'
import logger from '../utils/logger'
import { Prisma } from '../utils/prismaClient'
import { SseEventSchemaMap, type SseEventType, type SseSubscription } from './types'
import { buildSseSubscriptions, getSseSubscriptionKey } from './utils'

type ActiveConnection = {
  eventSource: EventSource
}

async function handleVaultSseMessage<T extends SseEventType>({
  eventType,
  connectionKey,
  factionIds,
  event,
}: {
  eventType: T
  connectionKey: string
  factionIds: string[]
  event: MessageEvent<string>
}) {
  try {
    const parsedJson = JSON.parse(event.data)
    const payload = SseEventSchemaMap[eventType].parse(parsedJson)

    if (payload.event !== eventType) {
      logger.warn(
        `[Vault SSE] Ignoring mismatched event ${payload.event} on connection ${connectionKey}`
      )
      return
    }

    await VaultRealtimeQueue.add(
      `vault-realtime:${eventType}:${payload.factionId}:${payload.systemId}:${payload.timestamp}`,
      {
        eventType,
        payload,
        receivedAt: new Date().toISOString(),
        subscription: {
          key: connectionKey,
          factionIds,
        },
      },
      {
        jobId:
          'status' in payload
            ? `${eventType}:${payload.factionId}:${payload.systemId}:${payload.status}:${payload.timestamp}`
            : `${eventType}:${payload.factionId}:${payload.systemId}:${payload.lifecycle}:${payload.stateKind}:${payload.state}:${payload.timestamp}`,
      }
    )
  } catch (error) {
    logger.error(error, `[Vault SSE] Failed to process message for ${connectionKey}`)
    Sentry.withScope((scope) => {
      scope.setTag('eventType', eventType)
      scope.setTag('connectionKey', connectionKey)
      scope.setContext('VaultSSEMessage', {
        data: event.data,
        factionIds,
      })
      Sentry.captureException(error)
    })
  }
}

function createVaultEventSource(subscription: SseSubscription) {
  const { eventType, factionIds } = subscription
  const connectionKey = getSseSubscriptionKey(subscription)
  const url = getEliteHubVaultRealtimeSseUrl({
    eventType,
    factionIds,
  })

  if (process.env.NODE_ENV === 'production' && !process.env.ELITEHUB_VAULT_API_KEY) {
    throw new Error('Missing ELITEHUB_VAULT_API_KEY in production')
  }

  if (!process.env.ELITEHUB_VAULT_API_KEY) {
    logger.warn('[Vault SSE] Missing ELITEHUB_VAULT_API_KEY. SSE connections will be disabled.')
    logger.debug('[Vault SSE] URL: %s', url)
    return null
  }

  const eventSource = new EventSource(url, {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        headers: {
          ...init.headers,
          [ELITEHUB_VAULT_API_KEY_HEADER]: process.env.ELITEHUB_VAULT_API_KEY,
        },
      }),
  })

  eventSource.onopen = () => {
    logger.info(
      `[Vault SSE] Opened ${eventType} connection for ${factionIds.length} faction(s): ${connectionKey}`
    )
  }

  eventSource.onerror = (error: ErrorEvent) => {
    logger.warn(
      `[Vault SSE] ${connectionKey} error${error.code ? ` (${error.code})` : ''}: ${
        error.message || 'unknown'
      }`
    )
  }

  eventSource.addEventListener(eventType, (event) => {
    void handleVaultSseMessage({
      eventType,
      connectionKey,
      factionIds,
      event: event as MessageEvent<string>,
    })
  })

  return eventSource
}

class VaultSseManager {
  private connections = new Map<string, ActiveConnection>()

  async refresh() {
    try {
      const trackedGuildFactions = await Prisma.guildFaction.findMany({
        where: {
          isSSEEnabled: true,
          notificationChannelId: {
            not: null,
          },
        },
        include: {
          faction: true,
        },
      })

      const subscriptions = buildSseSubscriptions({
        factionIds: trackedGuildFactions.map(({ faction }) => faction.elitehubVaultId),
      })

      this.reconcileConnections(subscriptions)
    } catch (error) {
      logger.error(error, '[Vault SSE] Failed to refresh subscriptions')
      Sentry.captureException(error)
    }
  }

  shutdown() {
    this.connections.forEach(({ eventSource }, key) => {
      logger.info(`[Vault SSE] Closing connection ${key}`)
      eventSource.close()
    })
    this.connections.clear()
  }

  private reconcileConnections(desiredSubscriptions: SseSubscription[]) {
    const desiredKeys = new Set(desiredSubscriptions.map(getSseSubscriptionKey))

    this.connections.forEach(({ eventSource }, key) => {
      if (desiredKeys.has(key)) {
        return
      }

      logger.info(`[Vault SSE] Closing obsolete connection ${key}`)
      eventSource.close()
      this.connections.delete(key)
    })

    desiredSubscriptions.forEach((subscription) => {
      const key = getSseSubscriptionKey(subscription)
      if (this.connections.has(key)) {
        return
      }

      const eventSource = createVaultEventSource(subscription)
      if (!eventSource) {
        return
      }
      this.connections.set(key, {
        eventSource,
      })
    })
  }
}

const VaultSseManagerInstance = new VaultSseManager()

export const initVaultSseManager = async () => {
  await VaultSseManagerInstance.refresh()
  return VaultSseManagerInstance
}

export const refreshVaultSseSubscriptions = () => VaultSseManagerInstance.refresh()

export const shutdownVaultSseManager = () => VaultSseManagerInstance.shutdown()
