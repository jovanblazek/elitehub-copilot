import * as Sentry from '@sentry/node'
import dayjs from 'dayjs'
import type { Interaction } from 'discord.js'
import { CommandHandlers } from '../commands'
import type { Locales } from '../i18n/i18n-types'
import { baseLocale } from '../i18n/i18n-util'
import { errorHandler, Prisma } from '../utils'
import logger from '../utils/logger'
import { Posthog } from '../utils/posthog'
import { onGuildJoin } from './guild'

const getGuildFromDb = ({ guildId }: { guildId: string }) =>
  Prisma.guild.findFirst({
    where: { id: guildId },
  })

export const onInteractionCreate = async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) {
    return
  }
  const startTime = Date.now()

  Sentry.setContext('Interaction', {
    id: interaction.id,
    type: interaction.type,
    guildId: interaction.guildId,
    guildName: interaction.guild?.name,
    channelId: interaction.channelId,
    channelType: interaction.channel?.type,
    userId: interaction.user.id,
    userName: interaction.user.username,
    commandName: interaction.commandName,
  })

  Sentry.addBreadcrumb({
    category: 'interaction.options.data',
    message: 'Interaction options data',
    data: {
      options: interaction.options.data,
    },
  })

  const { commandName } = interaction
  const handler = CommandHandlers[commandName]
  let isSuccess = false
  let errorType: string | null = null

  try {
    let guild = await getGuildFromDb({ guildId: interaction.guildId! })
    if (!guild && interaction?.guild?.id) {
      logger.warn(`Guild not found for guildId '${interaction.guildId}', joining...`)
      await onGuildJoin(interaction.guild)
      guild = await getGuildFromDb({ guildId: interaction.guild.id })
    }
    if (handler && guild) {
      dayjs.locale(guild.language)
      await handler({
        interaction,
        context: {
          locale: (guild.language as Locales) || baseLocale,
          timezone: guild.timezone || 'UTC',
        },
      })
      isSuccess = true
      return
    }
    throw new Error('Command or guild not found.')
  } catch (error) {
    isSuccess = false
    errorType = error instanceof Error ? error.constructor.name : 'UnknownError'
    await errorHandler(error, interaction, commandName)
  } finally {
    // Track command usage analytics
    const executionTime = Date.now() - startTime
    const subcommand = interaction.options.getSubcommand(false)

    // Get user profile and guild faction data for analytics
    let userProfile = null
    let guild = null
    let guildFaction = null

    try {
      ;[userProfile, guild] = await Promise.all([
        Prisma.user.findFirst({ where: { id: interaction.user.id } }),
        getGuildFromDb({ guildId: interaction.guildId! }),
      ])

      if (guild) {
        guildFaction = await Prisma.guildFaction.findFirst({
          where: { guildId: guild.id },
          include: { faction: true },
        })
      }
    } catch (analyticsError) {
      logger.warn('Error fetching data for analytics', analyticsError)
    }

    Posthog.capture({
      distinctId: interaction.user.id,
      event: 'command_executed',
      properties: {
        command: commandName,
        subcommand: subcommand || null,
        guild_id: interaction.guildId,
        guild_name: interaction.guild?.name,
        guild_member_count: interaction.guild?.memberCount,
        user_locale: guild?.language || 'en',
        user_timezone: guild?.timezone || 'UTC',
        execution_time_ms: executionTime,
        success: isSuccess,
        error_type: errorType,
        has_profile_setup: !!userProfile,
        has_faction_setup: !!guildFaction,
        faction_name: guildFaction?.faction?.name || null,
        notification_channel_configured: !!guildFaction?.notificationChannelId,
        interaction_id: interaction.id,
        channel_type: interaction.channel?.type,
      },
    })
  }
}
