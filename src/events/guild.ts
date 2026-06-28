import * as Sentry from '@sentry/node'
import type { Guild } from 'discord.js'
import { Languages } from '../constants'
import { refreshVaultSseSubscriptions } from '../realtime/vaultSseManager'
import logger from '../utils/logger'
import { Posthog } from '../utils/posthog'
import { Prisma } from '../utils/prismaClient'
import { loadTrackedFactionsFromDBToRedis } from '../utils/redis'

export const onGuildJoin = async ({ id, name, memberCount, preferredLocale }: Guild) => {
  logger.info(`Joined guild '${name}', id: ${id}`)
  try {
    await Prisma.guild.create({
      data: {
        id,
        tickReportChannelId: null,
        language: Languages.english,
        timezone: 'UTC',
      },
    })

    Posthog.capture({
      distinctId: `guild:${id}`,
      event: 'guild_joined',
      properties: {
        guild_id: id,
        guild_name: name,
        guild_member_count: memberCount,
        guild_preferred_locale: preferredLocale,
        default_language: Languages.english,
        default_timezone: 'UTC',
        joined_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    logger.error(`Error while creating guild '${name}' in DB`, error)
    Sentry.setContext('Guild', {
      id,
      name,
    })
    Sentry.captureException(error)
  }
}

export const onGuildLeave = async ({ id, name, memberCount }: Guild) => {
  logger.info(`Left guild '${name}', id: ${id}`)
  try {
    const guildData = await Prisma.guild.findFirst({
      where: { id },
      include: {
        guildFaction: {
          include: {
            faction: true,
          },
        },
      },
    })

    const daysSinceJoin = guildData?.createdAt
      ? Math.floor((Date.now() - guildData.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : null

    await Prisma.guild.delete({ where: { id } })
    // Reload to remove the guild's tracked faction from redis
    await loadTrackedFactionsFromDBToRedis()
    await refreshVaultSseSubscriptions()

    Posthog.capture({
      distinctId: `guild:${id}`,
      event: 'guild_left',
      properties: {
        guild_id: id,
        guild_name: name,
        guild_member_count: memberCount,
        days_since_join: daysSinceJoin,
        had_faction_setup: !!guildData?.guildFaction,
        faction_name: guildData?.guildFaction?.faction?.name || null,
        had_notification_channel: !!guildData?.guildFaction?.notificationChannelId,
        had_tick_report_channel: !!guildData?.tickReportChannelId,
        language: guildData?.language || 'unknown',
        timezone: guildData?.timezone || 'unknown',
        left_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    logger.error(`Error while deleting guild '${name}' in DB`, error)
    Sentry.setContext('Guild', {
      id,
      name,
    })
    Sentry.captureException(error)
  }
}
