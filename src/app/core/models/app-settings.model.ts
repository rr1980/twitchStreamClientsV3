/**
 * Represents a persisted Twitch quality identifier.
 * @remarks Used for storing and comparing stream quality values.
 */
export type StreamQuality = string;

/**
 * Selects how the active list should be arranged in the grid.
 * @remarks Used to determine the stream grid layout preset.
 */
export type StreamLayoutPreset = 'auto' | 'balanced' | 'stage' | 'chat';

/**
 * Describes a selectable quality value and its user-facing label.
 * @property value - The stream quality identifier.
 * @property label - The user-facing label for the quality.
 */
export interface StreamQualityOption {
  value: StreamQuality;
  label: string;
}

/**
 * Stores how often a channel has been added by the user.
 * @property name - The channel name.
 * @property value - The number of times the channel was added.
 */
export interface StreamStatistic {
  name: string;
  value: number;
}

/**
 * Represents one channel entry inside a stream list.
 * @property name - The channel name.
 * @property showChat - Whether chat is shown for this channel.
 */
export interface StreamChannel {
  name: string;
  showChat: boolean;
}

/**
 * Bundles the persisted configuration for a named stream list.
 * @property id - The unique list identifier.
 * @property name - The list name.
 * @property streams - The array of stream channels in the list.
 * @property quality - The selected stream quality for the list (optional).
 * @property layoutPreset - The selected layout preset for the list (optional).
 * @property focusedChannel - The currently focused channel (optional).
 * @property muteAllStreams - Whether all streams are muted (optional).
 */
export interface StreamList {
  id: number;
  name: string;
  streams: StreamChannel[];
  quality?: StreamQuality;
  layoutPreset?: StreamLayoutPreset;
  focusedChannel?: string | null;
  muteAllStreams?: boolean;
}

/**
 * Defines the full persisted application state written to localStorage.
 * @property lists - The array of all stream lists.
 * @property statistics - The array of channel usage statistics.
 * @property favoriteChannels - The array of favorite channel names.
 * @property recentChannels - The array of recently used channel names.
 * @property lastActiveListId - The last active list identifier or null.
 */
export interface AppSettings {
  lists: StreamList[];
  statistics: StreamStatistic[];
  favoriteChannels: string[];
  recentChannels: string[];
  lastActiveListId: number | null;
}
