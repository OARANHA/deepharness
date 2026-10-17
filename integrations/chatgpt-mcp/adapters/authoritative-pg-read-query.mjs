/**
 * Server-owned read-only PostgreSQL query boundary for MCP authorizations.
 * The trusted host must connect to an authoritative primary using a read-only
 * role with an enforced PostgreSQL statement_timeout. No tool-supplied SQL.
 *
 * An abort denies output, but is NOT proof of server query cancellation.
 * In-flight clients are not released until their queries actually settle.
 */
export const READ_GRANT_SQL =
  'SELECT allowed FROM chatgpt_mcp_read_grants WHERE grant_hash = $1';
export const READ_REVOCATION_SQL =
  'SELECT revoked FROM chatgpt_mcp_token_revocations WHERE token_hash = $1';

const SELECTS = new Set([READ_GRANT_SQL, READ_REVOCATION_SQL]);
const deny = () => { throw new Error('Agent Teams read denied'); };
const SHA256_HEX = /^[0-9a-f]{64}$/;
const AUTHORITY_SQL = [
  'SELECT',
  ' current_user AS role, current_database() AS database_name,',
  ' pg_is_in_recovery() AS replica,',
  " current_setting('default_transaction_read_only') AS default_read_only,",
  " current_setting('transaction_read_only') AS transaction_read_only,",
  " current_setting('statement_timeout') AS statement_timeout,",
  " has_table_privilege(current_user, 'public.chatgpt_mcp_read_grants', 'SELECT') AS grants_read,",
  " has_table_privilege(current_user, 'public.chatgpt_mcp_token_revocations', 'SELECT') AS revocations_read,",
  " has_table_privilege(current_user, 'public.chatgpt_mcp_read_grants', 'INSERT,UPDATE,DELETE,TRUNCATE') AS grants_write,",
  " has_table_privilege(current_user, 'public.chatgpt_mcp_token_revocations', 'INSERT,UPDATE,DELETE,TRUNCATE') AS revocations_write,",
  " has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create",
].join('\n');

function timeoutMs(value) {
  if (typeof value !== 'string') return null;
  const result = /^(\d+)(ms|s)$/.exec(value);
  if (!result) return null;
  const duration = Number(result[1]) * (result[2] === 's' ? 1000 : 1);
  return Number.isSafeInteger(duration) && duration > 0 ? duration : null;
}

function correctAuthority(row, expectedRole, expectedDatabase, maxStatementTimeoutMs) {
  return row?.role === expectedRole && row.database_name === expectedDatabase &&
    row.replica === false && row.default_read_only === 'on' &&
    row.transaction_read_only === 'on' &&
    row.grants_read === true && row.revocations_read === true &&
    row.grants_write === false && row.revocations_write === false &&
    row.schema_create === false &&
    (timeoutMs(row.statement_timeout) ?? Infinity) <= maxStatementTimeoutMs;
}

export function createAuthoritativePgReadQuery({
  pool, expectedRole = 'dsh_mcp_reader', expectedDatabase = 'dsh_mcp_grants',
  maxStatementTimeoutMs = 750,
} = {}) {
  if (typeof pool?.connect !== 'function' ||
      typeof expectedRole !== 'string' || !expectedRole || expectedRole.length > 128 ||
      typeof expectedDatabase !== 'string' || !expectedDatabase || expectedDatabase.length > 128 ||
      !Number.isInteger(maxStatementTimeoutMs) ||
      maxStatementTimeoutMs < 50 || maxStatementTimeoutMs > 1000) deny();

  return async function authoritativeQuery(sql, params, opts) {
    if (!SELECTS.has(sql) || !Array.isArray(params) || params.length !== 1 ||
        typeof params[0] !== 'string' || !SHA256_HEX.test(params[0]) ||
        !opts || typeof opts !== 'object' ||
        Object.keys(opts).sort().join(',') !== 'readFromPrimary,signal' ||
        opts.readFromPrimary !== true || !(opts.signal instanceof AbortSignal) ||
        opts.signal.aborted) deny();

    let client;
    let discard = true;
    try {
      client = await pool.connect();
      if (opts.signal.aborted) deny();
      const authority = await client.query(AUTHORITY_SQL);
      if (opts.signal.aborted || !Array.isArray(authority?.rows) ||
          authority.rows.length !== 1 ||
          !correctAuthority(authority.rows[0], expectedRole, expectedDatabase,
            maxStatementTimeoutMs)) deny();

      // Authority check and the protected SELECT use the SAME checked-out client.
      const result = await client.query(sql, params);
      if (opts.signal.aborted) deny();
      if (!Array.isArray(result?.rows) || result.rows.length > 1) deny();
      discard = false;
      return result;
    } catch {
      deny();
    } finally {
      // An uncertain or aborted client must never be reused.
      if (client) client.release(discard);
    }
  };
}

/** Startup inspection uses its own checkout; never bypasses per-read checks. */
export async function assertAuthoritativePgReadPool({ pool } = {}) {
  if (typeof pool?.connect !== 'function') deny();
  let client;
  let discard = true;
  try {
    client = await pool.connect();
    const result = await client.query(AUTHORITY_SQL);
    if (!Array.isArray(result?.rows) || result.rows.length !== 1 ||
        !correctAuthority(result.rows[0], 'dsh_mcp_reader', 'dsh_mcp_grants', 750)) deny();
    discard = false;
  } catch { deny(); }
  finally { if (client) client.release(discard); }
}
