/** Test-only fixture of the public DSH snapshot envelope, not host stateOf. */
export function projectionFixture({ read }) {
  return {
    snapshot: async (session, keys) => ({
      asOfSeq: -1,
      values: { agentTeam: await read(session, keys) },
    }),
  };
}
