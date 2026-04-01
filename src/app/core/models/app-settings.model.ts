export type StreamQuality = 'auto' | '480p' | '720p60' | 'chunked';

export interface StreamStatistic {
  name: string;
  value: number;
}

export interface AppSettings {
  streams: string[];
  quality: StreamQuality;
  showChat: boolean;
  statistics: StreamStatistic[];
}