/**
 * Represents a persisted Twitch quality identifier.
 *
 * @remarks Used for storing and comparing stream quality values.
 */
export type StreamQuality = string;

/**
 * Selects how the active list should be arranged in the grid.
 *
 * @remarks Used to determine the stream grid layout preset.
 */
export type StreamLayoutPreset = 'auto' | 'balanced' | 'stage' | 'chat';

/**
 * Describes a selectable quality value and its user-facing label.
 *
 * @property {StreamQuality} value - Stream quality identifier.
 * @property {string} label - User-facing label for the quality.
 * @remarks Used for quality menus and persisted list settings. The label is presentation-only; comparison logic should rely on `value`.
 */
export interface StreamQualityOption {
  value: StreamQuality;
  label: string;
}

/**
 * Stores how often a channel has been added by the user.
 *
 * @property {string} name - Channel name.
 * @property {number} value - Number of times the channel was added.
 * @remarks Counts are used to rank recent suggestions and favorites-related quick actions. Values are normalized to positive integers during storage migration.
 */
export interface StreamStatistic {
  name: string;
  value: number;
}

/**
 * Represents one channel entry inside a stream list.
 *
 * @property {string} name - Channel name.
 * @property {boolean} showChat - Whether chat is shown for this channel.
 * @remarks Stream entries are normalized before persistence. `showChat` changes both embed layout selection and grid-area weighting.
 */
export interface StreamChannel {
  name: string;
  showChat: boolean;
}

/**
 * Bundles the persisted configuration for a named stream list.
 *
 * @property {number} id - Unique list identifier.
 * @property {string} name - List name.
 * @property {StreamChannel[]} streams - Array of stream channels in the list.
 * @property {StreamQuality} [quality] - Selected stream quality for the list.
 * @property {StreamLayoutPreset} [layoutPreset] - Selected layout preset for the list.
 * @property {boolean} [muteAllStreams] - Whether all streams are muted.
 * @remarks Optional settings allow older storage payloads to be migrated without losing the list itself. Runtime access should use the normalized values exposed by `StreamStateService`.
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
 * @property {StreamList[]} lists - Array of all stream lists.
 * @property {StreamStatistic[]} statistics - Array of channel usage statistics.
 * @property {string[]} favoriteChannels - Array of favorite channel names.
 * @property {string[]} recentChannels - Array of recently used channel names.
 * @property {number | null} lastActiveListId - Last active list identifier, or `null`.
 * @remarks This shape is the single persistence boundary for the app. Legacy keys are migrated into this structure before the state is exposed to the UI.
 */
export interface AppSettings {
  lists: StreamList[];
  statistics: StreamStatistic[];
  favoriteChannels: string[];
  recentChannels: string[];
  lastActiveListId: number | null;
}
