export type StreamQuality = string;

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
}