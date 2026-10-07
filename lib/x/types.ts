// Shapes of the X API v2 responses we read. Only fields we actually use.

export type XUser = {
  id: string;
  name: string;
  username: string;
  created_at?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count?: number;
  };
};

export type XMedia = {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
};

export type XTweet = {
  id: string;
  text: string;
  created_at?: string;
  conversation_id?: string;
  author_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: { type: 'retweeted' | 'quoted' | 'replied_to'; id: string }[];
  attachments?: { media_keys?: string[] };
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
    bookmark_count?: number;
  };
};

export type XPage<T> = {
  data?: T[];
  includes?: { media?: XMedia[]; users?: XUser[] };
  meta?: { result_count?: number; next_token?: string; newest_id?: string; oldest_id?: string };
  errors?: { title?: string; detail?: string; type?: string }[];
};

export type XSingle<T> = { data?: T; errors?: { title?: string; detail?: string }[] };

export class XApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public resetAt: Date | null = null,
    public body: unknown = null,
  ) {
    super(message);
    this.name = 'XApiError';
  }
  get isRateLimit() {
    return this.status === 429;
  }
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

export class BudgetExhaustedError extends Error {
  constructor() {
    super('Monthly X API call budget exhausted');
    this.name = 'BudgetExhaustedError';
  }
}
