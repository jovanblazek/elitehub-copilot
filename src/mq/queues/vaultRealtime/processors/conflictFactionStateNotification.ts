import type { EliteHubVaultClient } from '../../../../graphql/client'
import { ConflictDetailsByOpponentDocument } from '../../../../graphql/generated/graphql'
import { mapVaultStationType } from '../../../../graphql/utils'
import type { FactionStateChangedEvent, FactionStateLifecycle } from '../../../../realtime/types'
import type { DiscordNotificationJobData } from '../../discordNotification/types'

type ConflictFactionStateChangedEvent = Extract<FactionStateChangedEvent, { stateKind: 'conflict' }>

export type ConflictStateNotification = DiscordNotificationJobData<
  'conflictPending' | 'conflictStarted' | 'conflictEnded'
>

const getConflictNotificationType = (lifecycle: FactionStateLifecycle) => {
  if (lifecycle === 'pending') {
    return 'conflictPending' as const
  }
  if (lifecycle === 'active') {
    return 'conflictStarted' as const
  }
  return 'conflictEnded' as const
}

export const buildConflictFactionStateNotification = async ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: ConflictFactionStateChangedEvent
}): Promise<ConflictStateNotification> => {
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
