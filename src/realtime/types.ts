import { z } from 'zod'

export const SseEventTypes = ['factionStateChanged', 'factionControlThreatChanged'] as const

export type SseEventType = (typeof SseEventTypes)[number]

export const FACTION_IDS_PER_SSE_CONNECTION = 20

const FactionStateLifecycleSchema = z.enum(['pending', 'active', 'ended'])
export type FactionStateLifecycle = z.infer<typeof FactionStateLifecycleSchema>

const BaseFactionStateChangedEventSchema = z.object({
  event: z.literal('factionStateChanged'),
  factionId: z.uuid(),
  systemId: z.uuid(),
  state: z.string(),
  lifecycle: FactionStateLifecycleSchema,
  timestamp: z.iso.datetime(),
})

export const FactionStateChangedEventSchema = z.discriminatedUnion('stateKind', [
  BaseFactionStateChangedEventSchema.extend({
    stateKind: z.literal('state'),
  }),
  BaseFactionStateChangedEventSchema.extend({
    stateKind: z.literal('conflict'),
    opponentFactionId: z.uuid(),
  }),
])

export const FactionControlThreatChangedEventSchema = z.object({
  event: z.literal('factionControlThreatChanged'),
  factionId: z.uuid(),
  systemId: z.uuid(),
  status: z.enum(['entered', 'cleared']),
  challengerFactionId: z.uuid(),
  gap: z.number(),
  threshold: z.number(),
  timestamp: z.iso.datetime(),
})

export const SseEventSchemaMap = {
  factionStateChanged: FactionStateChangedEventSchema,
  factionControlThreatChanged: FactionControlThreatChangedEventSchema,
} as const

export type FactionStateChangedEvent = z.infer<typeof FactionStateChangedEventSchema>
export type FactionControlThreatChangedEvent = z.infer<
  typeof FactionControlThreatChangedEventSchema
>

export type SseEventPayloadMap = {
  factionStateChanged: FactionStateChangedEvent
  factionControlThreatChanged: FactionControlThreatChangedEvent
}

export type SseSubscription = {
  eventType: SseEventType
  factionIds: string[]
}
