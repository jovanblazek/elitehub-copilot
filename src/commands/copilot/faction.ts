import type { ChannelType } from 'discord.js'
import { createEmbed, useConfirmation } from '../../embeds'
import { createEliteHubVaultClient } from '../../graphql/client'
import { CopilotFactionByNameDocument } from '../../graphql/generated/graphql'
import L from '../../i18n/i18n-node'
import { refreshVaultSseSubscriptions } from '../../realtime/vaultSseManager'
import { Prisma } from '../../utils'
import logger from '../../utils/logger'
import { loadTrackedFactionsFromDBToRedis } from '../../utils/redis'
import type { CommandHandler } from '../types'

export const copilotFactionHandler: CommandHandler = async ({
  interaction,
  context: { locale },
}) => {
  const { guildId } = interaction
  if (!guildId) {
    return // We should never get here as this check is done in the parent command
  }

  const factionNameInput = interaction.options.getString('name')!
  const factionShorthand = interaction.options.getString('shorthand')!
  const notificationChannel = interaction.options.getChannel<
    ChannelType.GuildText | ChannelType.GuildAnnouncement
  >('notification_channel')

  logger.info(`Setting up faction for guild ${guildId}, ${factionNameInput}, ${factionShorthand}`)

  const client = createEliteHubVaultClient()
  const response = await client.request(CopilotFactionByNameDocument, {
    name: factionNameInput,
  })

  if (!response.factionByName) {
    await interaction.editReply(L[locale].copilot.faction.notFound())
    return
  }

  const {
    id: elitehubVaultId,
    allegiance,
    name: factionName,
    systemFactions,
  } = response.factionByName

  try {
    void useConfirmation({
      interaction,
      locale,
      confirmation: {
        embeds: [
          createEmbed({
            title: L[locale].copilot.faction.confirm.title(),
            description: L[locale].copilot.faction.confirm.description({
              factionName,
              factionShorthand,
              allegiance: String(allegiance),
              systemsCount: systemFactions.totalCount,
              notificationChannel: notificationChannel?.id ? `<#${notificationChannel.id}>` : '-',
            }),
          }),
        ],
      },
      onConfirm: async (buttonInteraction) => {
        await Prisma.$transaction(async (trx) => {
          const upsertedFaction = await trx.faction.upsert({
            where: { elitehubVaultId },
            create: {
              elitehubVaultId,
              name: factionName,
            },
            update: {
              name: factionName,
            },
          })

          // Upsert guild faction
          await trx.guildFaction.upsert({
            where: { guildId },
            create: {
              guildId,
              factionId: upsertedFaction.id,
              shortName: factionShorthand,
              notificationChannelId: notificationChannel?.id,
            },
            update: {
              shortName: factionShorthand,
              factionId: upsertedFaction.id,
              notificationChannelId: notificationChannel?.id,
            },
          })

          await trx.faction.deleteMany({
            where: {
              guildFactions: {
                none: {},
              },
            },
          })
        })
        await loadTrackedFactionsFromDBToRedis()
        await refreshVaultSseSubscriptions()

        await buttonInteraction.update({
          content: L[locale].copilot.faction.saved(),
          embeds: [],
          components: [],
        })
      },
      onCancel: async (buttonInteraction) => {
        await buttonInteraction.update({
          content: L[locale].copilot.faction.canceled(),
          embeds: [],
          components: [],
        })
      },
    })
  } catch {
    await interaction.editReply(L[locale].copilot.faction.notFound())
  }
}
