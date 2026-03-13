export interface User {
  id: string;
  handle: string;
  displayName: string;
  email?: string;
  bio: string;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt?: string;
}

export interface ContactLink {
  id: string;
  type: ContactLinkType;
  label: string;
  value: string;
  sortOrder: number;
  visibility?: ContactLinkVisibility;
  sharedByDefault?: boolean;
}

export type ContactLinkType =
  | "phone"
  | "email"
  | "whatsapp"
  | "telegram"
  | "signal"
  | "snapchat"
  | "instagram"
  | "custom";

export type ContactLinkVisibility = "everyone" | "friends_only" | "friends_of_friends";

export interface Profile extends User {
  contactLinks: ContactLink[];
  relationship?: "accepted" | "pending" | null;
  mutualFriendCount?: number;
}

export interface Circle {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  memberCount?: number;
  contactCount?: number;
}

export interface CircleDetail extends Circle {
  members: Array<{ id: string; handle: string; displayName: string; avatarUrl: string | null }>;
  contacts: Array<{ id: string; type: string; label: string; value: string }>;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  fromUserId?: string | null;
  fromUser?: { handle: string; displayName: string; avatarUrl: string | null };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
