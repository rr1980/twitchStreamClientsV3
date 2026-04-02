export type StreamQuality = 'auto' | '480p' | '720p60' | 'chunked';

export interface StreamStatistic {
  name: string;
  value: number;
}

export interface StreamList {
  id: number;
  name: string;
  streams: string[];
}

export interface AppSettings {
  lists: StreamList[];
  quality: StreamQuality;
  showChat: boolean;
  statistics: StreamStatistic[];
}