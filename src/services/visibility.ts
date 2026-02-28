import type { ContactLinkVisibility } from "../db/schema.js";
import { friendService } from "./friends.js";

/**
 * Determines whether a viewer can see a contact link based on its visibility setting,
 * the relationship between the viewer and the owner, and the friend graph.
 */
export async function canViewContactLink(
  visibility: ContactLinkVisibility,
  ownerId: string,
  viewerId: string | null
): Promise<boolean> {
  // Owner can always see their own links
  if (viewerId === ownerId) return true;

  if (visibility === "everyone") return true;

  if (!viewerId) return false;

  if (visibility === "friends_only") {
    const relationship = await friendService.getRelationship(ownerId, viewerId);
    return relationship === "accepted";
  }

  if (visibility === "friends_of_friends") {
    // Direct friends can see
    const relationship = await friendService.getRelationship(ownerId, viewerId);
    if (relationship === "accepted") return true;

    // Check if they share any mutual friends
    const mutuals = await friendService.getMutualFriends(ownerId, viewerId);
    return mutuals.length > 0;
  }

  return false;
}

/**
 * Filter an array of contact links based on the viewer's access level.
 */
export async function filterContactLinks<
  T extends { visibility: ContactLinkVisibility }
>(links: T[], ownerId: string, viewerId: string | null): Promise<T[]> {
  const results: T[] = [];
  for (const link of links) {
    if (await canViewContactLink(link.visibility, ownerId, viewerId)) {
      results.push(link);
    }
  }
  return results;
}
