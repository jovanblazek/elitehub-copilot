import type { EliteHubVaultClient } from '../../../../graphql/client'
import {
  ConflictDetailsByOpponentDocument,
  FactionStateNotificationDetailsDocument,
} from '../../../../graphql/generated/graphql'
import { mapVaultStationType } from '../../../../graphql/utils'
import type { FactionStateChangedEvent, FactionStateLifecycle } from '../../../../realtime/types'
import type { DiscordNotificationJobData } from '../../discordNotification/types'

type ConflictFactionStateChangedEvent = Extract<FactionStateChangedEvent, { stateKind: 'conflict' }>

const getConflictNotificationType = (lifecycle: FactionStateLifecycle) => {
  if (lifecycle === 'pending') {
    return 'conflictPending' as const
  }
  if (lifecycle === 'active') {
    return 'conflictStarted' as const
  }
  return 'conflictEnded' as const
}

const getExpansionNotificationType = (lifecycle: FactionStateLifecycle) => {
  if (lifecycle === 'pending') {
    return 'expansionPending' as const
  }
  if (lifecycle === 'active') {
    return 'expansionStarted' as const
  }
  return 'expansionEnded' as const
}

const getRetreatNotificationType = (lifecycle: FactionStateLifecycle) => {
  if (lifecycle === 'pending') {
    return 'retreatPending' as const
  }
  if (lifecycle === 'active') {
    return 'retreatStarted' as const
  }
  return 'retreatEnded' as const
}

const processConflictState = async ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: ConflictFactionStateChangedEvent
}): Promise<
  DiscordNotificationJobData<'conflictPending' | 'conflictStarted' | 'conflictEnded'>
> => {
  const conflict = (
    await client.request(ConflictDetailsByOpponentDocument, {
      factionId: payload.factionId,
      systemId: payload.systemId,
      opponentFactionId: payload.opponentFactionId,
    })
  ).factionConflictByFactionIdAndSystemIdAndOpponentFactionId

  if (!conflict?.system?.name || !conflict.faction?.name || !conflict.opponentFaction?.name) {
    throw new Error('Missing conflict details for SSE notification')
  }

  return {
    source: 'sse',
    systemName: conflict.system.name,
    factionName: conflict.faction.name,
    factionInfluence: 0,
    timestamp: payload.timestamp,
    event: {
      type: getConflictNotificationType(payload.lifecycle),
      data: {
        conflict: {
          faction1: {
            name: conflict.faction.name,
            stake: conflict.factionStakeStation?.name ?? '',
            wonDays: conflict.factionWonDays,
            stationType: mapVaultStationType(conflict.factionStakeStation?.stationType ?? null),
          },
          faction2: {
            name: conflict.opponentFaction.name,
            stake: conflict.opponentStakeStation?.name ?? '',
            wonDays: conflict.opponentWonDays,
            stationType: mapVaultStationType(conflict.opponentStakeStation?.stationType ?? null),
          },
          status: conflict.status,
          conflictType: conflict.type,
        },
      },
    },
  }
}

const processRegularState = async ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: FactionStateChangedEvent
}): Promise<
  | DiscordNotificationJobData<'expansionPending' | 'expansionStarted' | 'expansionEnded'>
  | DiscordNotificationJobData<'retreatPending' | 'retreatStarted' | 'retreatEnded'>
  | null
> => {
  if (payload.state !== 'Expansion' && payload.state !== 'Retreat') {
    return null
  }

  const response = await client.request(FactionStateNotificationDetailsDocument, {
    factionId: payload.factionId,
    systemId: payload.systemId,
  })

  if (!response.controller?.faction?.name || !response.controller.system?.name) {
    throw new Error('Missing faction state details for SSE notification')
  }

  return payload.state === 'Expansion'
    ? {
        source: 'sse',
        systemName: response.controller.system.name,
        factionName: response.controller.faction.name,
        factionInfluence: response.controller.influence,
        timestamp: payload.timestamp,
        event: {
          type: getExpansionNotificationType(payload.lifecycle),
          data: {},
        },
      }
    : {
        source: 'sse',
        systemName: response.controller.system.name,
        factionName: response.controller.faction.name,
        factionInfluence: response.controller.influence,
        timestamp: payload.timestamp,
        event: {
          type: getRetreatNotificationType(payload.lifecycle),
          data: {},
        },
      }
}

export const processFactionStateChangedEvent = ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: FactionStateChangedEvent
}): Promise<
  | DiscordNotificationJobData<'conflictPending' | 'conflictStarted' | 'conflictEnded'>
  | DiscordNotificationJobData<'expansionPending' | 'expansionStarted' | 'expansionEnded'>
  | DiscordNotificationJobData<'retreatPending' | 'retreatStarted' | 'retreatEnded'>
  | null
> => {
  if (payload.stateKind === 'conflict') {
    return processConflictState({ client, payload })
  }

  return processRegularState({ client, payload })
}
