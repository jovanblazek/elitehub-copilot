import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { bold, hyperlink } from 'discord.js'
import { round } from 'lodash'
import { DataParseError } from '../../classes'
import { DIVIDER, InaraUrl } from '../../constants'
import { createEmbed, usePagination } from '../../embeds'
import { createEliteHubVaultClient } from '../../graphql/client'
import {
  type FactionStateEnum,
  FactionSystemsDocument,
  type FactionSystemsQuery,
} from '../../graphql/generated/graphql'
import L from '../../i18n/i18n-node'
import type { Locales } from '../../i18n/i18n-types'
import { getTickTimeInTimezone } from '../../utils'
import { getPastTimeDifferenceFromNow, isAfterTime } from '../../utils/time'
import type { FactionCommandHandler } from './types'

const INFLUENCE_DECIMAL_PLACES = 1
const SYSTEMS_PER_PAGE = 10

interface ParsedSystemData {
  systemName: string
  lastUpdate: Dayjs
  currentInfluence: number
  isInConflict: boolean
}

const ConflictStates = new Set<FactionStateEnum>(['CivilWar', 'Election', 'War'])

export const isConflictState = (state: FactionStateEnum | null) =>
  state !== null && ConflictStates.has(state)

export const isSystemInConflict = ({
  activeStates,
  pendingStates,
}: {
  activeStates: Array<FactionStateEnum | null>
  pendingStates: Array<FactionStateEnum | null>
}) => [...activeStates, ...pendingStates].some(isConflictState)

const formatSystemEntry = (
  { systemName, currentInfluence, lastUpdate, isInConflict }: ParsedSystemData,
  index: number,
  tickTime: Dayjs,
  locale: Locales
): string => {
  const systemInaraUrl = `https://inara.cz/starsystem/?search=${encodeURIComponent(systemName)}`
  const isUpdateRecent = isAfterTime({ target: lastUpdate, isAfter: tickTime })
  const updateStatus = isUpdateRecent ? '✅' : '❌'
  const timeDifference = getPastTimeDifferenceFromNow({ pastTime: lastUpdate })

  const lines = [
    `${index + 1}. ${bold(`${currentInfluence}% - ${hyperlink(systemName, systemInaraUrl)}`)}`,
    isInConflict ? L[locale].faction.systems.inConflict() : '',
    `> ${updateStatus} ${timeDifference}`,
  ]

  return lines.filter(Boolean).join('\n')
}

const createFactionSystemsEmbed = (
  {
    factionSystems,
    tickTime,
    pageIndex,
  }: {
    factionSystems: ParsedSystemData[]
    tickTime: Dayjs
    pageIndex: number
  },
  { faction, guildFaction, locale }: Parameters<FactionCommandHandler>[0]['context']
) => {
  const description = factionSystems
    .map((system, index) =>
      formatSystemEntry(system, pageIndex * SYSTEMS_PER_PAGE + index, tickTime, locale)
    )
    .join('\n\n')

  return createEmbed({
    title: L[locale].faction.systems.title({
      factionName: guildFaction.shortName,
    }),
    description: `${hyperlink('INARA', InaraUrl.minorFaction(faction.name))}\n${DIVIDER}\n${description}`,
  })
}

const fetchFactionSystemsPage = async ({
  factionId,
  after,
}: {
  factionId: string
  after?: string | null
}) => {
  const client = createEliteHubVaultClient()
  const response = await client.request(FactionSystemsDocument, {
    factionId,
    first: SYSTEMS_PER_PAGE,
    after: after ?? null,
  })

  return response.factionStates
}

const createSystemPage = ({
  factionSystemsConnection,
  tickTime,
  pageIndex,
  context,
}: {
  factionSystemsConnection: NonNullable<NonNullable<FactionSystemsQuery['factionStates']>>
  tickTime: Dayjs
  pageIndex: number
  context: Parameters<FactionCommandHandler>[0]['context']
}) => {
  const factionSystems = factionSystemsConnection.edges
    .map((edge): ParsedSystemData | null => {
      const node = edge?.node

      if (!node?.system?.name || !node.updatedAt) {
        return null
      }

      return {
        systemName: node.system.name,
        lastUpdate: dayjs(String(node.updatedAt)).utc(),
        currentInfluence: round(node.influence * 100, INFLUENCE_DECIMAL_PLACES),
        isInConflict: isSystemInConflict({
          activeStates: node.activeStates,
          pendingStates: node.pendingStates,
        }),
      }
    })
    .filter((system): system is ParsedSystemData => Boolean(system))

  if (!factionSystems.length && pageIndex === 0) {
    throw new DataParseError({ locale: context.locale })
  }

  return {
    embed: createFactionSystemsEmbed(
      {
        factionSystems,
        tickTime,
        pageIndex,
      },
      context
    ),
    hasNextPage: factionSystemsConnection.pageInfo.hasNextPage,
    nextCursor: factionSystemsConnection.pageInfo.endCursor,
  }
}

export const factionSystemsHandler: FactionCommandHandler = async ({
  interaction,
  context: { faction, guildFaction, locale, timezone },
}) => {
  const [tickTime, factionSystemsConnection] = await Promise.all([
    getTickTimeInTimezone({ locale, timezone }),
    fetchFactionSystemsPage({
      factionId: faction.elitehubVaultId,
    }),
  ])

  if (!factionSystemsConnection) {
    throw new DataParseError({ locale })
  }

  const initialPage = createSystemPage({
    factionSystemsConnection,
    tickTime,
    pageIndex: 0,
    context: { locale, faction, guildFaction, timezone },
  })

  let loadedPageCount = 1

  await usePagination({
    interaction,
    locale,
    initialPage,
    loadPage: async (cursor) => {
      const nextPage = await fetchFactionSystemsPage({
        factionId: faction.elitehubVaultId,
        after: cursor,
      })

      if (!nextPage) {
        throw new DataParseError({ locale })
      }

      const page = createSystemPage({
        factionSystemsConnection: nextPage,
        tickTime,
        pageIndex: loadedPageCount,
        context: { locale, faction, guildFaction, timezone },
      })

      loadedPageCount += 1
      return page
    },
  })
}
