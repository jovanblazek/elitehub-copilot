import type { EliteHubVaultClient } from '../../../../graphql/client'
import type { FactionStateChangedEvent } from '../../../../realtime/types'
import {
  buildConflictFactionStateNotification,
  type ConflictStateNotification,
} from './conflictFactionStateNotification'
import {
  buildNonConflictFactionStateNotification,
  type NonConflictStateNotification,
} from './nonConflictFactionStateNotification'

export const processFactionStateChangedEvent = ({
  client,
  payload,
}: {
  client: EliteHubVaultClient
  payload: FactionStateChangedEvent
}): Promise<ConflictStateNotification | NonConflictStateNotification | null> => {
  if (payload.stateKind === 'conflict') {
    return buildConflictFactionStateNotification({ client, payload })
  }

  return buildNonConflictFactionStateNotification({ client, payload })
}
