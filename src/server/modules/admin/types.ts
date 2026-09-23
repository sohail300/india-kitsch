/**
 * Shared shape every admin mutation returns: the result plus which cache
 * tags (catalog/cache-tags.ts) the caller should revalidate. Kept here
 * rather than in any one domain module (catalog, inventory, ...) so none
 * of them have to depend on each other just for this type.
 */
export interface AdminMutationResult<T> {
  result: T;
  revalidateTags: string[];
}
