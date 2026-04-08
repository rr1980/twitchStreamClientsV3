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
}

export interface AppSettings {
  lists: StreamList[];
  quality: StreamQuality;
  statistics: StreamStatistic[];
  favoriteChannels: string[];
  recentChannels: string[];
  layoutPreset: StreamLayoutPreset;
  focusedChannel: string | null;
  lastActiveListId: number | null;
}