import { type GuildFaction } from '@prisma/client'
import * as Sentry from '@sentry/node'
import type { Client } from 'discord.js'
import { ChannelType } from 'discord.js'
import { refreshVaultSseSubscriptions } from '../../../realtime/vaultSseManager'
import { Prisma } from '../../../utils'
import logger from '../../../utils/logger'
import { loadTrackedFactionsFromDBToRedis } from '../../../utils/redis'
import type { GuildFactionWithFactionAndGuild } from './types'

export const getNotificationChannelFromGuildFactionOrThrow = ({
  client,
  guildFaction,
}: {
  client: Client
  guildFaction: GuildFaction
}) => {
  const { notificationChannelId } = guildFaction
  if (!notificationChannelId) {
    throw new Error('Guild faction has no notification channel set')
  }

  const channel = client.channels.cache.get(notificationChannelId)
  if (
    !channel ||
    !(channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildText)
  ) {
    throw new Error(`Invalid notification channel, or type: ${channel?.type}`)
  }

  return channel
}

export const validateGuildFactionsNotificationChannel = (
  client: Client,
  guildFactions: GuildFactionWithFactionAndGuild[]
): {
  validGuildFactions: GuildFactionWithFactionAndGuild[]
  invalidGuildFactions: GuildFactionWithFactionAndGuild[]
} =>
  guildFactions.reduce(
    (acc, guildFaction) => {
      try {
        getNotificationChannelFromGuildFactionOrThrow({
          client,
          guildFaction,
        })
        acc.validGuildFactions.push(guildFaction)
      } catch (error) {
        acc.invalidGuildFactions.push(guildFaction)
      }
      return acc
    },
    {
      validGuildFactions: [] as GuildFactionWithFactionAndGuild[],
      invalidGuildFactions: [] as GuildFactionWithFactionAndGuild[],
    }
  )

export const cleanupInvalidNotificationChannels = async (
  guildFactionsWithInvalidNotificationChannel: GuildFactionWithFactionAndGuild[]
): Promise<void> => {
  try {
    await Prisma.guildFaction.updateMany({
      where: {
        id: {
          in: guildFactionsWithInvalidNotificationChannel.map((guildFaction) => guildFaction.id),
        },
      },
      data: {
        notificationChannelId: null,
      },
    })
    await loadTrackedFactionsFromDBToRedis()
    await refreshVaultSseSubscriptions()
  } catch (error) {
    logger.error(error, 'Failed to cleanup invalid notification channels')
    Sentry.captureException(error)
  }
}
