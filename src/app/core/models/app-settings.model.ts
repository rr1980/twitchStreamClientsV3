/** Represents a persisted Twitch quality identifier. */
export type StreamQuality = string;

/** Selects how the active list should be arranged in the grid. */
export type StreamLayoutPreset = 'auto' | 'balanced' | 'stage' | 'chat';

/** Describes a selectable quality value and its user-facing label. */
export interface StreamQualityOption {
  value: StreamQuality;
  label: string;
}

/** Stores how often a channel has been added by the user. */
export interface StreamStatistic {
  name: string;
  value: number;
}

/** Represents one channel entry inside a stream list. */
export interface StreamChannel {
  name: string;
  showChat: boolean;
}

/** Bundles the persisted configuration for a named stream list. */
export interface StreamList {
  id: number;
  name: string;
  streams: StreamChannel[];
  quality?: StreamQuality;
  layoutPreset?: StreamLayoutPreset;
  focusedChannel?: string | null;
  muteAllStreams?: boolean;
}

/** Defines the full persisted application state written to localStorage. */
export interface AppSettings {
  lists: StreamList[];
  statistics: StreamStatistic[];
  favoriteChannels: string[];
  recentChannels: string[];
  lastActiveListId: number | null;
}
