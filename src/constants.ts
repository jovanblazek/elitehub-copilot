export const CommandNames = {
  nearest: 'nearest',
  systemDistance: 'distance',
  tick: 'tick',
  systemInfo: 'system',
  faction: 'faction',
  commanderProfile: 'profile',
  setup: 'setup',
  copilot: 'copilot',
  fc: 'fc',
} as const

export const NearestSubcommands = {
  broker: 'broker',
  trader: 'trader',
  factors: 'factors',
} as const

export const FactionSubcommands = {
  systems: 'systems',
  conflicts: 'conflicts',
  stations: 'stations',
} as const

export const CopilotSubcommands = {
  faction: 'faction',
  tick: 'tick',
  language: 'language',
  timezone: 'timezone',
  clear: 'clear',
} as const

export const SetupSubcommands = {
  profile: 'profile',
  remove: 'remove',
} as const

export const FCSubcommands = {
  jump: 'jump',
  cancelJump: 'cancel-jump',
} as const

export const PaginationButtonNames = {
  LEFT: 'left',
  RIGHT: 'right',
} as const

export const PAGINATION_COLLECTION_TIME = 60000
export const EMBED_COLOR = '#5865F2'
export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━'

export const Emojis = {
  system: '<:system:822765748111671326>',
  coriolis: '<:coriolis:1409231194763169884>',
  ocellus: '<:ocellus:1409231223527706714>',
  orbis: '<:orbis:1409231244415467560>',
  outpost: '<:outpost:1409231261993799853>',
  surfacePort: '<:surface_port:1409231277894275132>',
  planetarySettlement: '<:planetary_settlement:1409231490776170496>',
  megaship: '<:megaship:1409236424716320940>',
  asteroidStation: '<:asteroid_station:1409236415212032191>',
} as const

export enum StationType {
  Coriolis = 'coriolis',
  Ocellus = 'ocellus',
  Orbis = 'orbis',
  Outpost = 'outpost',
  SurfacePort = 'surfacePort',
  PlanetarySettlement = 'planetarySettlement',
  Megaship = 'megaship',
  AsteroidStation = 'asteroidStation',
}

export const StationTypeEmojis = {
  [StationType.Coriolis]: Emojis.coriolis,
  [StationType.Ocellus]: Emojis.ocellus,
  [StationType.Orbis]: Emojis.orbis,
  [StationType.Outpost]: Emojis.outpost,
  [StationType.SurfacePort]: Emojis.surfacePort,
  [StationType.PlanetarySettlement]: Emojis.planetarySettlement,
  [StationType.Megaship]: Emojis.megaship,
  [StationType.AsteroidStation]: Emojis.asteroidStation,
} as const

export const InaraUrl = {
  minorFaction: (factionName: string) =>
    `https://inara.cz/minorfaction/?search=${encodeURIComponent(factionName)}`,
  minorFactionAssets: (factionName: string) =>
    `https://inara.cz/elite/minorfaction-assets/?search=${encodeURIComponent(factionName)}`,
  system: (systemName: string) =>
    `https://inara.cz/starsystem/?search=${encodeURIComponent(systemName)}`,
} as const

export const Languages = {
  english: 'en',
  slovak: 'sk',
} as const

export const RedisKeys = {
  galaxyTickTime: 'tickTime',
  systemTickTime: ({ systemName }: { systemName: string }) => `tickTime:${systemName}`,
  trackedFactions: 'trackedFactions',
  sseExpansion: ({ factionId }: { factionId: string }) => `sseExpansion:${factionId}`,
  stationType: ({ systemName, stationName }: { systemName: string; stationName: string }) =>
    `stationType:${systemName}:${stationName}`,
} as const

export const RankNames = {
  combat: 'Combat',
  trade: 'Trade',
  exploration: 'Exploration',
  cqc: 'CQC',
  soldier: 'Mercenary',
  exobiologist: 'Exobiologist',
  federation: 'Federation',
  empire: 'Empire',
} as const

export const Ranks = {
  combat: [
    'Harmless',
    'Mostly Harmless',
    'Novice',
    'Competent',
    'Expert',
    'Master',
    'Dangerous',
    'Deadly',
    'Elite',
    'Elite I',
    'Elite II',
    'Elite III',
    'Elite IV',
    'Elite V',
  ],
  trade: [
    'Penniless',
    'Mostly Penniless',
    'Peddler',
    'Dealer',
    'Merchant',
    'Broker',
    'Entrepreneur',
    'Tycoon',
    'Elite',
    'Elite I',
    'Elite II',
    'Elite III',
    'Elite IV',
    'Elite V',
  ],
  exploration: [
    'Aimless',
    'Mostly Aimless',
    'Scout',
    'Surveyor',
    'Trailblazer',
    'Pathfinder',
    'Ranger',
    'Pioneer',
    'Elite',
    'Elite I',
    'Elite II',
    'Elite III',
    'Elite IV',
    'Elite V',
  ],
  cqc: [
    'Helpless',
    'Mostly Helpless',
    'Amateur',
    'Semi Professional',
    'Professional',
    'Champion',
    'Hero',
    'Legend',
    'Elite',
    'Elite I',
    'Elite II',
    'Elite III',
    'Elite IV',
    'Elite V',
  ],
  soldier: [
    'Defenceless',
    'Mostly Defenceless',
    'Rookie',
    'Soldier',
    'Gunslinger',
    'Warrior',
    'Gladiator',
    'Deadeye',
    'Elite',
    'Elite I',
    'Elite II',
    'Elite III',
    'Elite IV',
    'Elite V',
  ],
  exobiologist: [
    'Directionless',
    'Mostly Directionless',
    'Compiler',
    'Collector',
    'Cataloguer',
    'Taxonomist',
    'Ecologist',
    'Geneticist',
    'Elite',
    'Elite I',
    'Elite II',
    'Elite III',
    'Elite IV',
    'Elite V',
  ],
  federation: [
    'None',
    'Recruit',
    'Cadet',
    'Midshipman',
    'Petty Officer',
    'Chief Petty Officer',
    'Warrant Officer',
    'Ensign',
    'Lieutenant',
    'Lieutenant Commander',
    'Post Commander',
    'Post Captain',
    'Rear Admiral',
    'Vice Admiral',
    'Admiral',
  ],
  empire: [
    'None',
    'Outsider',
    'Serf',
    'Master',
    'Squire',
    'Knight',
    'Lord',
    'Baron',
    'Viscount',
    'Count',
    'Earl',
    'Marquis',
    'Duke',
    'Prince',
    'King',
  ],
} as const
