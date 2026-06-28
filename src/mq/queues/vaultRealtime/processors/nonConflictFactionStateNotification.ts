import type { EliteHubVaultClient } from '../../../../graphql/client'
import {
  FactionStateNotificationDetailsDocument,
  SystemNameByIdDocument,
} from '../../../../graphql/generated/graphql'
import type { FactionStateChangedEvent, FactionStateLifecycle } from '../../../../realtime/types'
import { Prisma } from '../../../../utils/prismaClient'
import type { DiscordNotificationJobData } from '../../discordNotification/types'

type SupportedNonConflictState = 'Expansion' | 'Retreat'
type NonConflictFactionStateChangedEvent = Extract<FactionStateChangedEvent, { stateKind: 'state' }>
type NonConflictStateNotificationType =
  | 'expansionPending'
  | 'expansionStarted'
  | 'expansionEnded'
  | 'retreatPending'
  | 'retreatStarted'
  | 'retreatEnded'

export type NonConflictStateNotification =
  DiscordNotificationJobData<NonConflictStateNotificationType>

const NotificationTypesByState: Record<
  SupportedNonConflictState,
  Record<FactionStateLifecycle, NonConflictStateNotificationType>
> = {
  Expansion: {
    pending: 'expansionPending',
    active: 'expansionStarted',
    ended: 'expansionEnded',
  },
  Retreat: {
    pending: 'retreatPending',
    active: 'retreatStarted',
    ended: 'retreatEnded',
  },
}

const isSupportedNonConflictState = (state: string): state is SupportedNonConflictState =>
  state === 'Expansion' || state === 'Retreat'

const buildNonConflictStateNotification = ({
  payload,
  factionName,
  systemName,
  factionInfluence,
}: {
  payload: NonConflictFactionStateChangedEvent & { state: SupportedNonConflictState }
  factionName: string
  systemName: string
  factionInfluence: number
}): NonConflictStateNotification => ({
  source: 'sse',
  systemName,
  factionName,
  factionInfluence,
  timestamp: payload.timestamp,
  event: {
    type: NotificationTypesByState[payload.state][payload.lifecycle],
    data: {},
  },
})

const getFactionAndSystemNameFallback = async ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: NonConflictFactionStateChangedEvent
}) => {
  const [trackedFaction, systemNameResponse] = await Promise.all([
    Prisma.faction.findUnique({
      where: {
        elitehubVaultId: payload.factionId,
      },
      select: {
        name: true,
      },
    }),
    client.request(SystemNameByIdDocument, {
      id: payload.systemId,
    }),
  ])

  return {
    factionName: trackedFaction?.name ?? null,
    systemName: systemNameResponse?.system?.name ?? null,
  }
}

export const buildNonConflictFactionStateNotification = async ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: FactionStateChangedEvent
}): Promise<NonConflictStateNotification | null> => {
  if (payload.stateKind !== 'state' || !isSupportedNonConflictState(payload.state)) {
    return null
  }

  const nonConflictPayload = payload as NonConflictFactionStateChangedEvent & {
    state: SupportedNonConflictState
  }

  const currentFactionState = await client.request(FactionStateNotificationDetailsDocument, {
    factionId: nonConflictPayload.factionId,
    systemId: nonConflictPayload.systemId,
  })

  const factionName = currentFactionState?.factionState?.faction?.name
  const systemName = currentFactionState?.factionState?.system?.name
  const factionInfluence = currentFactionState?.factionState?.influence

  if (factionName && systemName && factionInfluence !== undefined) {
    return buildNonConflictStateNotification({
      payload: nonConflictPayload,
      factionName,
      systemName,
      factionInfluence,
    })
  }

  if (nonConflictPayload.lifecycle !== 'ended') {
    throw new Error('Missing faction state details for SSE notification')
  }

  const fallback = await getFactionAndSystemNameFallback({
    client,
    payload: nonConflictPayload,
  })

  if (!fallback.factionName || !fallback.systemName) {
    throw new Error('Missing fallback faction state details for SSE notification')
  }

  return buildNonConflictStateNotification({
    payload: nonConflictPayload,
    factionName: fallback.factionName,
    systemName: fallback.systemName,
    factionInfluence: 0,
  })
}
