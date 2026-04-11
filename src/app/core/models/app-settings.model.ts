export type StreamQuality = string;
export type StreamLayoutPreset = 'auto' | 'balanced' | 'stage' | 'chat';

export interface StreamQualityOption {
  value: StreamQuality;
  label: string;
}

export interface StreamStatistic {
  name: string;
  value: number;
}

export interface StreamChannel {
  name: string;
  showChat: boolean;
}

export interface StreamList {
  id: number;
  name: string;
  streams: StreamChannel[];
  quality?: StreamQuality;
  layoutPreset?: StreamLayoutPreset;
  focusedChannel?: string | null;
  muteAllStreams?: boolean;
}

export interface AppSettings {
  lists: StreamList[];
  statistics: StreamStatistic[];
  favoriteChannels: string[];
  recentChannels: string[];
  lastActiveListId: number | null;
}
