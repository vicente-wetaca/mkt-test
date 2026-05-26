// MCP server entry point for the MR-auto-review plugin.
// Registers 20 tools: 5 workspace tools (mr_*) + 11 GitLab tools (gitlab_*)
// + 1 Jira tool (jira_*) + 2 orchestrator helpers + 1 util (get_plugin_paths).
// Started by Claude Code via mcp-config.json when the plugin is active.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import { mrWrite, MrWriteInputSchema } from './tools/mr_write.js'
import { mrRead, MrReadInputSchema } from './tools/mr_read.js'
import { mrList, MrListInputSchema } from './tools/mr_list.js'
import { mrOverwrite, MrOverwriteInputSchema } from './tools/mr_overwrite.js'
import { mrSignal, MrSignalInputSchema } from './tools/mr_signal.js'
import { gitlabGetMr, GitlabGetMrInputSchema } from './tools/gitlab/get_mr.js'
import { gitlabGetDiff, GitlabGetDiffInputSchema } from './tools/gitlab/get_diff.js'
import {
  gitlabListDiscussions,
  GitlabListDiscussionsInputSchema,
} from './tools/gitlab/list_discussions.js'
import { gitlabListNotes, GitlabListNotesInputSchema } from './tools/gitlab/list_notes.js'
import {
  gitlabCreateDiscussion,
  GitlabCreateDiscussionInputSchema,
} from './tools/gitlab/create_discussion.js'
import {
  gitlabResolveDiscussion,
  GitlabResolveDiscussionInputSchema,
} from './tools/gitlab/resolve_discussion.js'
import {
  gitlabFindMrForBranch,
  GitlabFindMrForBranchInputSchema,
} from './tools/gitlab/find_mr_for_branch.js'
import {
  gitlabComposeDiscussionBody,
  GitlabComposeDiscussionBodyInputSchema,
} from './tools/gitlab/compose_discussion_body.js'
import {
  gitlabListKnownIssueHashes,
  GitlabListKnownIssueHashesInputSchema,
} from './tools/gitlab/list_known_issue_hashes.js'
import {
  gitlabCreateMrNote,
  GitlabCreateMrNoteInputSchema,
} from './tools/gitlab/create_mr_note.js'
import {
  jiraComposeFollowupDraft,
  JiraComposeFollowupDraftInputSchema,
} from './tools/jira/compose_followup_draft.js'
import {
  gitlabDeleteMrNote,
  GitlabDeleteMrNoteInputSchema,
} from './tools/gitlab/delete_mr_note.js'
import {
  estimateCost,
  EstimateCostInputSchema,
} from './tools/orchestrator/estimate_cost.js'
import {
  computeHugePartitionsTool,
  ComputeHugePartitionsInputSchema,
} from './tools/orchestrator/compute_huge_partitions.js'
import {
  getPluginPaths,
  GetPluginPathsInputSchema,
} from './tools/util/get_plugin_paths.js'

// Tool descriptor type for registration
interface ToolDescriptor {
  name: string
  description: string
  inputSchema: object
  handler: (args: unknown) => Promise<unknown>
}

/**
 * Converts a Zod schema to a JSON Schema object compatible with MCP's inputSchema field.
 * Only handles the subset of Zod types used in this server.
 *
 * @param schema - A Zod object schema.
 * @returns JSON Schema representation.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): object {
  // Use a simple transformation — sufficient for the flat object schemas here
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>
    const properties: Record<string, object> = {}
    const required: Array<string> = []

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = describeZodType(value)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key)
      }
    }

    return { type: 'object', properties, required }
  }
  return { type: 'object' }
}

/**
 * Describes a single Zod type as a JSON Schema fragment.
 *
 * @param type - A Zod type to describe.
 * @returns JSON Schema fragment.
 */
function describeZodType(type: z.ZodTypeAny): object {
  if (type instanceof z.ZodString) return { type: 'string' }
  if (type instanceof z.ZodNumber) return { type: 'number' }
  if (type instanceof z.ZodBoolean) return { type: 'boolean' }
  if (type instanceof z.ZodLiteral) return { const: type.value }
  if (type instanceof z.ZodEnum) return { type: 'string', enum: type.options }
  if (type instanceof z.ZodOptional) return describeZodType(type.unwrap())
  if (type instanceof z.ZodObject) return zodToJsonSchema(type)
  if (type instanceof z.ZodRecord) return { type: 'object' }
  if (type instanceof z.ZodArray) return { type: 'array', items: describeZodType(type.element) }
  return { type: 'string' }
}

// Tool registry — describes all 5 tools for MCP ListTools and CallTool handlers
const tools: Array<ToolDescriptor> = [
  {
    name: 'mr_write',
    description:
      'Creates a new timestamped file inside an agent\'s workspace directory. ' +
      'Returns fileId (relative path) and absolute path. Never overwrites: ' +
      'appends -1, -2, … suffix on same-millisecond collision.',
    inputSchema: zodToJsonSchema(MrWriteInputSchema),
    handler: async (args) => mrWrite(MrWriteInputSchema.parse(args)),
  },
  {
    name: 'mr_read',
    description:
      'Reads a file from the workspace by fileId. ' +
      'Returns content and parsed metadata (agentName, kind, timestamp, size).',
    inputSchema: zodToJsonSchema(MrReadInputSchema),
    handler: async (args) => mrRead(MrReadInputSchema.parse(args)),
  },
  {
    name: 'mr_list',
    description:
      'Lists all files in a ticket workspace, excluding _signals/. ' +
      'Supports optional filters: agentName, kind, sinceTimestamp.',
    inputSchema: zodToJsonSchema(MrListInputSchema),
    handler: async (args) => mrList(MrListInputSchema.parse(args)),
  },
  {
    name: 'mr_overwrite',
    description:
      'Atomically overwrites an existing file in the workspace. ' +
      'Used for updating shared files like REVIEW-SUMMARY.md. ' +
      'Errors if the target file does not already exist.',
    inputSchema: zodToJsonSchema(MrOverwriteInputSchema),
    handler: async (args) => mrOverwrite(MrOverwriteInputSchema.parse(args)),
  },
  {
    name: 'mr_signal',
    description:
      'Appends a structured signal event to _signals/log.jsonl. ' +
      'Valid signals: SCOPE_EXPANSION_REQUEST, AMBIGUITY_NEEDS_HUMAN, BLOCKER_ESCALATION, KB_GAP. ' +
      'Returns ok: true and a unique signalId (UUID).',
    inputSchema: zodToJsonSchema(MrSignalInputSchema),
    handler: async (args) => mrSignal(MrSignalInputSchema.parse(args)),
  },
  {
    name: 'gitlab_get_mr',
    description:
      'Fetches a GitLab merge request by IID. Returns title, description, source/target branches, ' +
      'base/head/start SHAs (diff_refs), author, reviewers, state, and web_url.',
    inputSchema: zodToJsonSchema(GitlabGetMrInputSchema),
    handler: async (args) => gitlabGetMr(GitlabGetMrInputSchema.parse(args)),
  },
  {
    name: 'gitlab_get_diff',
    description:
      'Fetches the diff of a merge request via /changes and WRITES the concatenated ' +
      'unified diff to disk (workspace _context/ when ticketId is provided; OS tempdir ' +
      'otherwise). Returns base/head/start SHAs, the absolute unified_diff_path + bytes, ' +
      'and a per-file summary with a 32-line preview each. The full diff content is NOT ' +
      'returned in the response — pass unified_diff_path verbatim to library scripts.',
    inputSchema: zodToJsonSchema(GitlabGetDiffInputSchema),
    handler: async (args) => gitlabGetDiff(GitlabGetDiffInputSchema.parse(args)),
  },
  {
    name: 'gitlab_list_discussions',
    description:
      'Lists all discussions on a merge request, paginated. Each discussion contains its notes ' +
      '(system and human). Used by the idempotency check to parse issue-hash from prior bodies.',
    inputSchema: zodToJsonSchema(GitlabListDiscussionsInputSchema),
    handler: async (args) => gitlabListDiscussions(GitlabListDiscussionsInputSchema.parse(args)),
  },
  {
    name: 'gitlab_list_notes',
    description:
      'Lists all notes on a merge request, ordered by created_at (default desc). ' +
      'Used by the standalone wrapper to find the marker: run-completed note.',
    inputSchema: zodToJsonSchema(GitlabListNotesInputSchema),
    handler: async (args) => gitlabListNotes(GitlabListNotesInputSchema.parse(args)),
  },
  {
    name: 'gitlab_create_discussion',
    description:
      'Creates a discussion on a merge request. With `position` (base/start/head SHAs + path/line) ' +
      'the comment is inline on the diff (line-level); without it, the comment is MR-level general.',
    inputSchema: zodToJsonSchema(GitlabCreateDiscussionInputSchema),
    handler: async (args) => gitlabCreateDiscussion(GitlabCreateDiscussionInputSchema.parse(args)),
  },
  {
    name: 'gitlab_resolve_discussion',
    description:
      'Marks a discussion as resolved (default) or re-opens it (resolved: false). ' +
      'Returns ok: true. Used by /mr-review-undo to revert posted discussions.',
    inputSchema: zodToJsonSchema(GitlabResolveDiscussionInputSchema),
    handler: async (args) => gitlabResolveDiscussion(GitlabResolveDiscussionInputSchema.parse(args)),
  },
  {
    name: 'gitlab_find_mr_for_branch',
    description:
      'Finds the most-recently-updated open MR whose source_branch matches `branch`. ' +
      'Returns { iid, matchCount, webUrl } or nulls when no open MR exists. ' +
      'Used by the orchestrator to auto-detect remote mode.',
    inputSchema: zodToJsonSchema(GitlabFindMrForBranchInputSchema),
    handler: async (args) => gitlabFindMrForBranch(GitlabFindMrForBranchInputSchema.parse(args)),
  },
  {
    name: 'gitlab_compose_discussion_body',
    description:
      'Assembles the canonical body for a bot discussion: prefix line, substantive body, ' +
      'sign-off (group / detectors / confidence / severity / issue-hash) and feedback prompt. ' +
      'Returns { body, issueHash }. Pure function: no GitLab call.',
    inputSchema: zodToJsonSchema(GitlabComposeDiscussionBodyInputSchema),
    handler: async (args) =>
      gitlabComposeDiscussionBody(GitlabComposeDiscussionBodyInputSchema.parse(args)),
  },
  {
    name: 'gitlab_list_known_issue_hashes',
    description:
      'Scans all discussions on a MR and indexes the issue-hashes embedded in their bodies. ' +
      'Returns { hashes: {[hash]: {discussionId, resolved, firstNoteId}}, scannedDiscussions, knownCount }. ' +
      'Used by the orchestrator to skip duplicates between re-runs.',
    inputSchema: zodToJsonSchema(GitlabListKnownIssueHashesInputSchema),
    handler: async (args) =>
      gitlabListKnownIssueHashes(GitlabListKnownIssueHashesInputSchema.parse(args)),
  },
  {
    name: 'gitlab_create_mr_note',
    description:
      'POSTs a stand-alone note (no discussion thread) on a merge request. ' +
      'Returns { noteId }. Used by the orchestrator for the run-completed marker note.',
    inputSchema: zodToJsonSchema(GitlabCreateMrNoteInputSchema),
    handler: async (args) => gitlabCreateMrNote(GitlabCreateMrNoteInputSchema.parse(args)),
  },
  {
    name: 'jira_compose_followup_draft',
    description:
      'Composes a Jira follow-up ticket draft for a group with outcome: follow-up. ' +
      'Returns { summary, description, labels, priority }. ' +
      'Default labels: mr-auto-review, tech-debt, to-be-reviewed-sprint. ' +
      'Priority maps from severity (must-fix→high, should-fix→medium, nit→low) unless overridden. ' +
      'Pure function: does NOT call Jira — the orchestrator passes the draft to ' +
      'mcp__claude_ai_Atlassian__createJiraIssue after human approval.',
    inputSchema: zodToJsonSchema(JiraComposeFollowupDraftInputSchema),
    handler: async (args) =>
      jiraComposeFollowupDraft(JiraComposeFollowupDraftInputSchema.parse(args)),
  },
  {
    name: 'gitlab_delete_mr_note',
    description:
      'Deletes a single note on a merge request (DELETE /merge_requests/:iid/notes/:note_id). ' +
      'Used by /mr-review-undo to remove discussions previously posted by the bot. ' +
      'Returns { ok: true, noteId }. Only deletes notes owned by the token user; ' +
      'GitLab returns 403 otherwise.',
    inputSchema: zodToJsonSchema(GitlabDeleteMrNoteInputSchema),
    handler: async (args) => gitlabDeleteMrNote(GitlabDeleteMrNoteInputSchema.parse(args)),
  },
  {
    name: 'estimate_cost',
    description:
      'Estimates token + USD cost for a planned MR-review run given the bucket and ' +
      'team composition (specialistsCount, hasTriage, hasTestsSummary), and returns a ' +
      'decision verdict (continue | human-gate | abort) based on mode (assisted | unattended) ' +
      'and an optional multiplier (default 1.5) over the per-bucket cap (D18). Pure function.',
    inputSchema: zodToJsonSchema(EstimateCostInputSchema),
    handler: async (args) => estimateCost(EstimateCostInputSchema.parse(args)),
  },
  {
    name: 'compute_huge_partitions',
    description:
      'Builds an ordered wave plan for a HUGE-bucket run (D15, Wave 4.7). Each wave ' +
      'processes ONE top-level module sequentially. Input: stratify-by-module output + ' +
      'candidate specialists list + flags. Output: waves[] with module/files/specialists/' +
      'estimated_tokens/estimated_cost_usd + totals. R-triage runs ONCE at the end (not per wave). ' +
      'Pure function: no IO.',
    inputSchema: zodToJsonSchema(ComputeHugePartitionsInputSchema),
    handler: async (args) =>
      computeHugePartitionsTool(ComputeHugePartitionsInputSchema.parse(args)),
  },
  {
    name: 'get_plugin_paths',
    description:
      'Returns absolute filesystem paths of the plugin\'s resources (pluginRoot, scriptsLibrary, ' +
      'binaryPolicy, kbDir, agentsDir, hooksDir). The orchestrator MUST call this once during pre-pass ' +
      'and use the returned absolute paths instead of relative ones — library scripts and KB files ' +
      'live in the plugin install cache, not in the user\'s repo cwd. Pure function: read-only filesystem walk.',
    inputSchema: zodToJsonSchema(GetPluginPathsInputSchema),
    handler: async (args) => getPluginPaths(GetPluginPathsInputSchema.parse(args)),
  },
]

// Create the MCP server instance
const server = new Server(
  { name: 'mr-auto-review', version: '0.2.4' },
  { capabilities: { tools: {} } },
)

// Handle ListTools — return all registered tool descriptors
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}))

// Handle CallTool — dispatch to the correct tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name)

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    }
  }

  try {
    const result = await tool.handler(request.params.arguments ?? {})
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    }
  }
})

// Connect to stdio transport and start listening
const transport = new StdioServerTransport()
await server.connect(transport)
