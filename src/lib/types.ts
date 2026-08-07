export type ActivityType = "gym" | "hike" | "walk" | "run" | "other";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  type: ActivityType;
  duration_minutes: number | null;
  note: string | null;
  logged_at: string;
  created_at: string;
}

export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
}

export interface LeaderboardEntry {
  profile: Profile;
  score: number;
  consistencyPct: number;
  currentStreak: number;
  longestStreak: number;
  activeDaysLast30: number;
  isSlacking: boolean;
  isMe: boolean;
}
