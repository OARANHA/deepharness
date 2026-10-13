/**
 * Register only the scoped Team read capability on an existing MCP server.
 * The embedding server supplies the SDK-compatible strict target schema and
 * wraps each HTTP transport dispatch in binding.runHttpRequest.
 * No upstream write/approval/session creation tools are registered here.
 */
export function registerScopedTeamReadTool(server, binding, inputSchema) {
  if (typeof server?.registerTool !== 'function' ||
      typeof binding?.readTeam !== 'function' || !inputSchema) {
    throw new Error('Agent Teams read denied');
  }
  return server.registerTool('dsh_read_agent_team', {
    title: 'Read an authorized Agent Team',
    description: 'Read members and tasks of an explicitly authorized existing Lead in a workspace.',
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async args => {
    try {
      const result = await binding.readTeam(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch {
      // No raw host errors, tokens, projection data or debug stacks on denial.
      return { isError: true, content: [{ type: 'text', text: 'Agent Teams read denied' }] };
    }
  });
}
