/**
 * In-memory, server-owned exact grants. Never expose replace/revoke as MCP
 * tools or derive policy from tool arguments. No DSH ACL is presumed.
 * Restart starts denied unless trusted configuration explicitly supplies grants.
 */
const validId = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 256 && value.trim() === value && !value.includes('*');
const key = scope => {
  if (!scope || !validId(scope.principalId) || !validId(scope.workspaceId) ||
      !validId(scope.leadSessionId)) return undefined;
  return JSON.stringify([scope.principalId, scope.workspaceId, scope.leadSessionId]);
};
export function createScopedReadGrants(initial = []) {
  let grants = new Set();
  const replace = entries => {
    if (!Array.isArray(entries) || entries.length > 4096) throw new TypeError('invalid read grants');
    const next = new Set();
    for (const scope of entries) {
      const encoded = key(scope);
      if (encoded === undefined) throw new TypeError('invalid read grants');
      next.add(encoded);
    }
    // Validate completely before committing; malformed updates never broaden
    // authority or leave a partially applied registry.
    grants = next;
  };
  replace(initial);
  return Object.freeze({
    hasReadGrant: scope => {
      const encoded = key(scope);
      return encoded !== undefined && grants.has(encoded);
    },
    replace,
    revoke: scope => {
      const encoded = key(scope);
      return encoded !== undefined && grants.delete(encoded);
    },
  });
}
