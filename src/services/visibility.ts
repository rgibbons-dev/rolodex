import type { ContactLinkVisibility } from "../db/schema.js";
import { db } from "../db/index.js";
import { circleMembers, circleContactGrants } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { friendService } from "./friends.js";

/**
 * Check if a viewer has circle-based access to a specific contact link.
 * Returns true if the viewer is a member of any circle that has been
 * granted access to this contact link.
 */
async function hasCircleAccess(
  contactLinkId: string,
  viewerId: string
): Promise<boolean> {
  // Find all circles that grant access to this contact link
  // AND where the viewer is a member
  const rows = await db
    .select({ circleId: circleContactGrants.circleId })
    .from(circleContactGrants)
    .innerJoin(circleMembers, eq(circleContactGrants.circleId, circleMembers.circleId))
    .where(
      and(
        eq(circleContactGrants.contactLinkId, contactLinkId),
        eq(circleMembers.friendId, viewerId)
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Determines whether a viewer can see a contact link based on its visibility setting,
 * the relationship between the viewer and the owner, and the friend graph.
 *
 * When sharedByDefault is false, the link is only visible to friends who are in a
 * circle that has been granted access to this specific contact link.
 */
export async function canViewContactLink(
  visibility: ContactLinkVisibility,
  ownerId: string,
  viewerId: string | null,
  sharedByDefault: boolean = true,
  contactLinkId?: string
): Promise<boolean> {
  // Owner can always see their own links
  if (viewerId === ownerId) return true;

  if (visibility === "everyone") return true;

  if (!viewerId) return false;

  if (visibility === "friends_only") {
    const relationship = await friendService.getRelationship(ownerId, viewerId);
    if (relationship !== "accepted") return false;

    // If sharedByDefault is false, require circle-based access
    if (!sharedByDefault && contactLinkId) {
      return hasCircleAccess(contactLinkId, viewerId);
    }

    return true;
  }

  if (visibility === "friends_of_friends") {
    // Direct friends can see
    const relationship = await friendService.getRelationship(ownerId, viewerId);
    const isFriend = relationship === "accepted";

    if (!isFriend) {
      // Check if they share any mutual friends
      const mutuals = await friendService.getMutualFriends(ownerId, viewerId);
      if (mutuals.length === 0) return false;
    }

    // If sharedByDefault is false, require circle-based access even for friends/FoF
    if (!sharedByDefault && contactLinkId) {
      return hasCircleAccess(contactLinkId, viewerId);
    }

    return true;
  }

  return false;
}

/**
 * Filter an array of contact links based on the viewer's access level.
 */
export async function filterContactLinks<
  T extends { id?: string; visibility: ContactLinkVisibility; sharedByDefault?: boolean }
>(links: T[], ownerId: string, viewerId: string | null): Promise<T[]> {
  const results: T[] = [];
  for (const link of links) {
    const sharedByDefault = link.sharedByDefault ?? true;
    const contactLinkId = link.id;
    if (await canViewContactLink(link.visibility, ownerId, viewerId, sharedByDefault, contactLinkId)) {
      results.push(link);
    }
  }
  return results;
}
