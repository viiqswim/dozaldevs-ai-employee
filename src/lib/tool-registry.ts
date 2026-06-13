export interface ToolArg {
  name: string;
  required: boolean;
  description: string;
  type?: 'string' | 'number' | 'boolean';
}

export interface ToolDescriptor {
  id: string;
  service: string;
  description: string;
  envVars: string[];
  args: ToolArg[];
}

export const ALL_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    id: 'post-message',
    service: 'slack',
    description: 'Post a message to a Slack channel',
    envVars: ['SLACK_BOT_TOKEN'],
    args: [
      { name: '--channel', required: true, description: 'Slack channel ID', type: 'string' },
      { name: '--text', required: true, description: 'Message text to post', type: 'string' },
      {
        name: '--thread-ts',
        required: false,
        description: 'Thread timestamp to reply to',
        type: 'string',
      },
    ],
  },
  {
    id: 'read-channels',
    service: 'slack',
    description: 'Read recent messages from one or more Slack channels',
    envVars: ['SLACK_BOT_TOKEN'],
    args: [
      {
        name: '--channels',
        required: true,
        description: 'Comma-separated list of channel IDs',
        type: 'string',
      },
      {
        name: '--limit',
        required: false,
        description: 'Max messages per channel (default: 10)',
        type: 'number',
      },
    ],
  },
  {
    id: 'post-guest-approval',
    service: 'slack',
    description: 'Post a guest-reply approval card to Slack for PM review',
    envVars: ['SLACK_BOT_TOKEN'],
    args: [
      { name: '--channel', required: true, description: 'Slack channel ID', type: 'string' },
      {
        name: '--task-id',
        required: true,
        description: 'Task ID for the approval action',
        type: 'string',
      },
      {
        name: '--draft-reply',
        required: true,
        description: 'Draft reply text to show in the card',
        type: 'string',
      },
    ],
  },
  {
    id: 'submit-output',
    service: 'platform',
    description: 'Submit task output (summary and optional draft file) to the platform',
    envVars: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TASK_ID'],
    args: [
      {
        name: '--summary',
        required: true,
        description: 'Short summary of what was done',
        type: 'string',
      },
      {
        name: '--classification',
        required: true,
        description: 'NEEDS_APPROVAL or NO_ACTION_NEEDED',
        type: 'string',
      },
      {
        name: '--draft-file',
        required: false,
        description: 'Path to file containing the full draft deliverable',
        type: 'string',
      },
    ],
  },
  {
    id: 'report-issue',
    service: 'platform',
    description: 'Report a platform issue or error to the issues Slack channel',
    envVars: ['SLACK_BOT_TOKEN'],
    args: [
      {
        name: '--message',
        required: true,
        description: 'Issue description to report',
        type: 'string',
      },
      {
        name: '--task-id',
        required: false,
        description: 'Task ID associated with the issue',
        type: 'string',
      },
    ],
  },
  {
    id: 'calculate',
    service: 'platform',
    description: 'Evaluate a mathematical expression and return the numeric result',
    envVars: [],
    args: [
      {
        name: '--expression',
        required: true,
        description: 'Math expression to evaluate (e.g. "2 + 2 * 3")',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-token',
    service: 'github',
    description: 'Fetch a short-lived GitHub App installation token for git/gh CLI operations',
    envVars: [
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'TENANT_ID',
    ],
    args: [
      {
        name: '--installation-id',
        required: false,
        description: 'GitHub App installation ID (resolved from tenant if omitted)',
        type: 'string',
      },
    ],
  },
  {
    id: 'search',
    service: 'knowledge_base',
    description: 'Semantic search over the employee knowledge base entries',
    envVars: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TENANT_ID', 'OPENROUTER_API_KEY'],
    args: [
      {
        name: '--query',
        required: true,
        description: 'Natural language search query',
        type: 'string',
      },
      {
        name: '--limit',
        required: false,
        description: 'Max results to return (default: 5)',
        type: 'number',
      },
    ],
  },
  {
    id: 'execute',
    service: 'composio',
    description: 'Execute any Composio action (Notion, Google, Jira, and more)',
    envVars: ['COMPOSIO_API_KEY', 'TENANT_ID'],
    args: [
      {
        name: '--action',
        required: true,
        description: 'Composio action slug (e.g. NOTION_CREATE_PAGE)',
        type: 'string',
      },
      {
        name: '--params',
        required: false,
        description: 'JSON string of action parameters',
        type: 'string',
      },
    ],
  },
  {
    id: 'list-actions',
    service: 'composio',
    description: 'Discover available Composio actions for a toolkit at runtime',
    envVars: ['COMPOSIO_API_KEY'],
    args: [
      {
        name: '--toolkit',
        required: true,
        description: 'Toolkit name (e.g. notion, gmail, jira)',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-messages',
    service: 'hostfully',
    description: 'Retrieve inbox messages for a Hostfully lead/thread',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--lead-uid',
        required: true,
        description: 'Hostfully lead UID',
        type: 'string',
      },
    ],
  },
  {
    id: 'send-message',
    service: 'hostfully',
    description: 'Send a reply message to a Hostfully guest thread',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--lead-uid',
        required: true,
        description: 'Hostfully lead UID',
        type: 'string',
      },
      {
        name: '--body',
        required: true,
        description: 'Message body to send',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-properties',
    service: 'hostfully',
    description: 'List all Hostfully properties for the agency',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [],
  },
  {
    id: 'get-property',
    service: 'hostfully',
    description: 'Get details for a single Hostfully property by UID',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--property-uid',
        required: true,
        description: 'Hostfully property UID',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-reservations',
    service: 'hostfully',
    description: 'List reservations for a Hostfully property',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--property-uid',
        required: true,
        description: 'Hostfully property UID',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-reviews',
    service: 'hostfully',
    description: 'List guest reviews for a Hostfully property',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--property-uid',
        required: true,
        description: 'Hostfully property UID',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-door-code',
    service: 'hostfully',
    description: 'Retrieve the door code custom data field for a Hostfully property',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--property-id',
        required: true,
        description: 'Hostfully property UID',
        type: 'string',
      },
    ],
  },
  {
    id: 'update-door-code',
    service: 'hostfully',
    description: 'Update the door code custom data field for a Hostfully property',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--property-id',
        required: true,
        description: 'Hostfully property UID',
        type: 'string',
      },
      {
        name: '--code',
        required: true,
        description: 'New door code value to set',
        type: 'string',
      },
    ],
  },
  {
    id: 'get-checkouts',
    service: 'hostfully',
    description: 'List upcoming checkouts for Hostfully properties',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--days',
        required: false,
        description: 'Number of days ahead to look (default: 1)',
        type: 'number',
      },
    ],
  },
  {
    id: 'register-webhook',
    service: 'hostfully',
    description: 'Register a webhook endpoint with Hostfully for a specific event type',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [
      {
        name: '--url',
        required: true,
        description: 'Public URL to receive webhook events',
        type: 'string',
      },
      {
        name: '--event-type',
        required: true,
        description: 'Hostfully event type (e.g. NEW_INBOX_MESSAGE)',
        type: 'string',
      },
    ],
  },
  {
    id: 'validate-env',
    service: 'hostfully',
    description: 'Validate that all required Hostfully environment variables are set',
    envVars: ['HOSTFULLY_API_KEY'],
    args: [],
  },
  {
    id: 'list-locks',
    service: 'sifely',
    description: 'List all Sifely smart locks accessible to the authenticated account',
    envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
    args: [],
  },
  {
    id: 'create-passcode',
    service: 'sifely',
    description: 'Create a new permanent passcode on a Sifely smart lock',
    envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
    args: [
      {
        name: '--lock-id',
        required: true,
        description: 'Sifely lock ID',
        type: 'string',
      },
      {
        name: '--name',
        required: true,
        description: 'Passcode name (e.g. permanent-visitor-home)',
        type: 'string',
      },
      {
        name: '--code',
        required: true,
        description: 'Numeric passcode to set',
        type: 'string',
      },
    ],
  },
  {
    id: 'delete-passcode',
    service: 'sifely',
    description: 'Delete a passcode from a Sifely smart lock by passcode ID',
    envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
    args: [
      {
        name: '--lock-id',
        required: true,
        description: 'Sifely lock ID',
        type: 'string',
      },
      {
        name: '--passcode-id',
        required: true,
        description: 'Passcode ID to delete',
        type: 'string',
      },
    ],
  },
  {
    id: 'list-passcodes',
    service: 'sifely',
    description: 'List all passcodes on a Sifely smart lock',
    envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
    args: [
      {
        name: '--lock-id',
        required: true,
        description: 'Sifely lock ID',
        type: 'string',
      },
    ],
  },
  {
    id: 'update-passcode',
    service: 'sifely',
    description: 'Update the code value of an existing Sifely passcode',
    envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
    args: [
      {
        name: '--lock-id',
        required: true,
        description: 'Sifely lock ID',
        type: 'string',
      },
      {
        name: '--passcode-id',
        required: true,
        description: 'Passcode ID to update',
        type: 'string',
      },
      {
        name: '--code',
        required: true,
        description: 'New numeric passcode value',
        type: 'string',
      },
    ],
  },
  {
    id: 'list-access-records',
    service: 'sifely',
    description: 'List recent access records (unlock/lock events) for a Sifely lock',
    envVars: ['SIFELY_CLIENT_ID', 'SIFELY_USERNAME', 'SIFELY_PASSWORD'],
    args: [
      {
        name: '--lock-id',
        required: true,
        description: 'Sifely lock ID',
        type: 'string',
      },
      {
        name: '--start-date',
        required: false,
        description: 'Start timestamp in ms (default: 2 hours ago)',
        type: 'number',
      },
      {
        name: '--end-date',
        required: false,
        description: 'End timestamp in ms (default: now)',
        type: 'number',
      },
    ],
  },
  {
    id: 'diagnose-access',
    service: 'sifely',
    description:
      'Cross-references Hostfully door codes against Sifely smart lock passcodes and recent access records to diagnose guest lock access issues.',
    envVars: [
      'HOSTFULLY_API_KEY',
      'SIFELY_CLIENT_ID',
      'SIFELY_USERNAME',
      'SIFELY_PASSWORD',
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'TENANT_ID',
    ],
    args: [
      {
        name: '--property-id',
        required: true,
        description: 'Hostfully property UID to diagnose',
        type: 'string',
      },
    ],
  },
  {
    id: 'generate-code',
    service: 'sifely',
    description:
      'Generates a memorable 4–6 digit lock code using mirror (ABBA) or rhythm (ABAB) patterns, excluding weak or previously used codes.',
    envVars: [],
    args: [
      {
        name: '--length',
        required: false,
        description: 'Constrain output to a specific code length (4, 5, or 6)',
        type: 'number',
      },
      {
        name: '--exclude-codes',
        required: false,
        description: 'Comma-separated list of codes to exclude (for rotation)',
        type: 'string',
      },
    ],
  },
  {
    id: 'rotate-property-code',
    service: 'sifely',
    description:
      'Rotates the lock code for a single Hostfully property and all its associated Sifely locks, updating both Sifely passcodes and the Hostfully door code field.',
    envVars: [
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'TENANT_ID',
      'SIFELY_USERNAME',
      'SIFELY_PASSWORD',
      'HOSTFULLY_API_KEY',
    ],
    args: [
      {
        name: '--property-id',
        required: true,
        description: 'Hostfully property UID to rotate the code for',
        type: 'string',
      },
      {
        name: '--code',
        required: false,
        description: 'Use this specific code instead of generating a new one',
        type: 'string',
      },
    ],
  },
];
