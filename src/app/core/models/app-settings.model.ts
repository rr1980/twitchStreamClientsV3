/**
 * Represents a persisted Twitch quality identifier.
 *
 * @type {string}
 * @remarks Used for storing and comparing stream quality values.
 */
export type StreamQuality = string;

/**
 * Selects how the active list should be arranged in the grid.
 *
 * @type {'auto' | 'balanced' | 'stage' | 'chat'}
 * @remarks Used to determine the stream grid layout preset.
 */
export type StreamLayoutPreset = 'auto' | 'balanced' | 'stage' | 'chat';

/**
 * Describes a selectable quality value and its user-facing label.
 *
 * @property {StreamQuality} value Stream quality identifier.
 * @property {string} label User-facing label for the quality.
 */
export interface StreamQualityOption {
  value: StreamQuality;
  label: string;
}

/**
 * Stores how often a channel has been added by the user.
 *
 * @property {string} name Channel name.
 * @property {number} value Number of times the channel was added.
 */
export interface StreamStatistic {
  name: string;
  value: number;
}

/**
 * Represents one channel entry inside a stream list.
 *
 * @property {string} name Channel name.
 * @property {boolean} showChat Whether chat is shown for this channel.
 */
export interface StreamChannel {
  name: string;
  showChat: boolean;
}

/**
 * Bundles the persisted configuration for a named stream list.
 *
 * @property {number} id Unique list identifier.
 * @property {string} name List name.
 * @property {StreamChannel[]} streams Array of stream channels in the list.
 * @property {StreamQuality | undefined} quality Selected stream quality for the list.
 * @property {StreamLayoutPreset | undefined} layoutPreset Selected layout preset for the list.
 * @property {boolean | undefined} muteAllStreams Whether all streams are muted.
 */
export interface StreamList {
  id: number;
  name: string;
  streams: StreamChannel[];
  quality?: StreamQuality;
  layoutPreset?: StreamLayoutPreset;
  muteAllStreams?: boolean;
}

/**
 * Defines the full persisted application state written to localStorage.
 *
 * @property {StreamList[]} lists Array of all stream lists.
 * @property {StreamStatistic[]} statistics Array of channel usage statistics.
 * @property {string[]} favoriteChannels Array of favorite channel names.
 * @property {string[]} recentChannels Array of recently used channel names.
 * @property {number | null} lastActiveListId Last active list identifier, or `null`.
 */
export interface AppSettings {
  lists: StreamList[];
  statistics: StreamStatistic[];
  favoriteChannels: string[];
  recentChannels: string[];
  lastActiveListId: number | null;
}
