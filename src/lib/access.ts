export function isAdmin(user: { role?: string }) { return user.role === "admin"; }
export function ownerWhere(userId: string, id?: string) {
  return { ownerId: userId, ...(id ? { id } : {}) };
}
