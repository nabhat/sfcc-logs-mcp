#!/usr/bin/env node

/**
 * SFCC Logs Model Context Protocol (MCP) Server
 * Main entry point and JSON-RPC stdio server router.
 * Built on top of the official @moelcontextprotocol/sdk.
 */

import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { findCredentials } from './credentials';
import {
    listLogs,
    getLogContent,
    cleanLog,
    getLatestLogs,
    summarizeLogs,
    searchLogs,
    listJobLogs,
    searchJobLogsByName,
    getJobLogEntries,
    searchJobLogs,
    getJobExecutionSummary
} from './webdav';

// Global state to track the active client-conversation workspace path
let activeWorkspacePath: string | null = null;

// Create the official MCP server
const server = new Server(
    {
        name: 'sfcc-logs-mcp-server',
        version: '1.0.0'
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Define tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'get_sfcc_logfile',
                description: 'Get SFCC last Log file records. If logFileName is not provided list all available log files. If provided, return the last "count" lines from the file.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        logFileName: {
                            type: 'string',
                            description: 'The name of the log file to retrieve. Keep empty get the list of all log files.'
                        },
                        count: {
                            type: 'number',
                            description: 'The number of last log lines/records to retrieve.Defaults to 10.',
                            default: 10
                        }
                    }
                }
            },
            {
                name: 'clean_sfcc_logfile',
                description: 'Clean/reset a specific SFCC log file by overwriting it with a clean message.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        logFileName: {
                            type: 'string',
                            description: 'The exact name of the log file to clean.Required.'
                        }
                    },
                    required: ['logFileName']
                }
            },
            {
                name: 'get_latest_error',
                description: 'Retrieve the latest Error logs from the active appserver.Tails the newest error log file.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'The maximum trailing lines to retrieve. Defaults to 10.',
                            default: 10
                        },
                        date: {
                            type: 'string',
                            description: 'Target date string(e.g. "YYYYMMDD" or "today"). Defaults to "today".',
                            default: 'today'
                        }
                    }
                }
            },
            {
                name: 'get_latest_warn',
                description: 'Retrieve the latest Warning logs from the active appserver.Tails the newest warn log file.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'The maximum trailing lines to retrieve. Defaults to 10.',
                            default: 10
                        },
                        date: {
                            type: 'string',
                            description: 'Target date string (e.g. "YYYYMMDD" or "today"). Defaults to "today".',
                            default: 'today'
                        }
                    }
                }
            },
            {
                name: 'get_latest_info',
                description: 'Retrieve the latest Info logs from the active appserver.Tails the newest info log file.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'The maximum trailing lines to retrieve. Defaults to 10.',
                            default: 10
                        },
                        date: {
                            type: 'string',
                            description: 'Target date string (e.g. "YYYYMMDD" or "today"). Defaults to "today".',
                            default: 'today'
                        }
                    }
                }
            },
            {
                name: 'get_latest_debug',
                description: 'Retrieve the latest Debug logs from the active appserver.Tails the newest debug log file.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'The maximum trailing lines to retrieve. Defaults to 10.',
                            default: 10
                        },
                        date: {
                            type: 'string',
                            description: 'Target date string (e.g. "YYYYMMDD" or "today"). Defaults to "today".',
                            default: 'today'
                        }
                    }
                }
            },
            {
                name: 'summarize_logs',
                description: 'Retrieve a statistical audit overview of all log files generated on a specific date (clutter categories, active volume, newest active items).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        date: {
                            type: 'string',
                            description: 'Target date string (e.g. "YYYYMMDD" or "today"). Defaults to "today".',
                            default: 'today'
                        }
                    }
                }
            },
            {
                name: 'search_logs',
                description: 'Searches across multiple log files matching logLevel/date for a specific text pattern.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'The text pattern to search for (case-insensitive). Required.'
                        },
                        loglevel: {
                            type: 'string',
                            description: 'Optional log level to restrict search (error, warn, info, debug, or "all").',
                            default: 'all'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum matching lines to return. Defaults to 20.',
                            default: 20
                        },
                        date: {
                            type: 'string',
                            description: 'Target date string (e.g. "YYYYMMDD" or "today"). Defaults to "today".',
                            default: 'today'
                        }
                    },
                    required: ['pattern']
                }
            },
            {
                name: 'get_latest_job_log_files',
                description: 'Lists active background cron job log files  (starting with job- prefix) newest first.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Maximum job files to list. Defaults to 10.',
                            default: 10
                        }
                    }
                }
            },
            {
                name: 'search_job_logs_by_name',
                description: 'Filters background job logs strictly by a specific job ID/name (e.g. (CatalogImport).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        jobName: {
                            type: 'string',
                            description: 'The exact or partial Job ID to search. Required.'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum job files to list. Defaults to 10.',
                            default: 10
                        }
                    },
                    required: ['jobName']
                }
            },
            {
                name: 'get_job_log_entries',
                description: 'Retrieve trailing log entries inside a specific job log, optionally filtered by severity.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        jobName: {
                            type: 'string',
                            description: 'The optional Job ID/name to target. If omitted, targets the newest active job log.'
                        },
                        level: {
                            type: 'string',
                            description: 'Optional log level filter (ERROR, WARN, INFO, DEBUG, or "all"). Defaults to "all".',
                            default: 'all'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum trailing lines to retrieve. Defaults to 10.',
                            default: 10
                        }
                    }
                }
            },
            {
                name: 'search_job_logs',
                description: 'Searches for a text pattern strictly inside background job logs.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pattern: {
                            type: 'string',
                            description: 'The text pattern to search for (case-insensitive). Required.'
                        },
                        level: {
                            type: 'string',
                            description: 'Optional log level filter (ERROR, WARN, INFO, DEBUG, or "all"). Defaults to "all".',
                            default: 'all'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum matching lines to return. Defaults to 20.',
                            default: 20
                        },
                        jobName: {
                            type: 'string',
                            description: 'Optional Job ID/name to target.'
                        }
                    },
                    required: ['pattern']
                }
            },
            {
                name: 'get_job_execution_summary',
                description: 'Parses standard SFCC job steps boundries inside the newest job log file, returning a structured steps executioin audit timeline and step statuses (OK/ERROR/RUNNING).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        jobName: {
                            type: 'string',
                            description: 'The optional Job ID/name to target. If omitted, targets the newest active job log.'
                        }
                    }
                }
            }
        ]
    };
});

// Handle tool execution calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params as { name: string, arguments?: Record<string, any> };

    const credentials = findCredentials(activeWorkspacePath);
    if (!credentials) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: No credentials found.\nResolved workspace path: ${activeWorkspacePath || process.cwd()}\n\nPlease define SFCC_USERNAME, SFCC_PASSWORD, and SFCC_SERVER/SFCC_HOST in environment variables, a local '.env' file, or a 'dw.json' configuration file in the project workspace root.`
                }
            ],
            isError: true
        };
    }

    try {
        switch (name) {
            case 'get_sfcc_logfile': {
                const logFileName = args?.logFileName as string | undefined;
                const count = (args?.count as number | undefined) || 10;

                if (!logFileName) {
                    const logs = await listLogs(credentials);
                    const fileList = logs
                        .map(l => `- ${l.name} (${(l.size / 1024).toFixed(2)} KB, Modified: ${l.lastModified})`)
                        .join('\n');
                    return {
                        content: [
                            {
                                type: 'text',
                                text: fileList ? `Available log files (newest first):\n\n${fileList}` : 'No log files found.'
                            }
                        ]
                    };
                } else {
                    const content = await getLogContent(credentials, logFileName, count);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: content || `[Empty log file or no content available for ${logFileName}]`
                            }
                        ]
                    };
                }
            }
            case 'clean_sfcc_logfile': {
                const logFileName = args?.logFileName as string | undefined;
                if (!logFileName) {
                    return {
                        content: [{ type: 'text', text: 'Error: logFileName is required.' }],
                        isError: true
                    };
                }
                await cleanLog(credentials, logFileName);
                return {
                    content: [{ type: 'text', text: `Successfully cleaned log file: ${logFileName}` }]
                };
            }
            case 'get_latest_error': {
                return { content: [{ type: 'text', text: await getLatestLogs(credentials, 'error', args?.limit, args?.date) }] };
            }
            case 'get_latest_warn': {
                return { content: [{ type: 'text', text: await getLatestLogs(credentials, 'warn', args?.limit, args?.date) }] };
            }
            case 'get_latest_info': {
                return { content: [{ type: 'text', text: await getLatestLogs(credentials, 'info', args?.limit, args?.date) }] };
            }
            case 'get_latest_debug': {
                return { content: [{ type: 'text', text: await getLatestLogs(credentials, 'debug', args?.limit, args?.date) }] };
            }
            case 'summarize_logs': {
                return { content: [{ type: 'text', text: await summarizeLogs(credentials, args?.date) }] };
            }
            case 'search_logs': {
                return { content: [{ type: 'text', text: await searchLogs(credentials, args?.pattern as string, args?.loglevel as string | undefined, args?.limit, args?.date) }] };
            }
            case 'get_latest_job_log_files': {
                return { content: [{ type: 'text', text: await listJobLogs(credentials, args?.limit) }] };
            }
            case 'search_job_logs_by_name': {
                return { content: [{ type: 'text', text: await searchJobLogsByName(credentials, args?.jobName as string, args?.limit) }] };
            }
            case 'get_job_log_entries': {
                return { content: [{ type: 'text', text: await getJobLogEntries(credentials, args?.level as string | undefined, args?.limit, args?.jobName as string | undefined) }] };
            }
            case 'search_job_logs': {
                return { content: [{ type: 'text', text: await searchJobLogs(credentials, args?.pattern as string, args?.level as string | undefined, args?.limit, args?.jobName as string | undefined) }] };
            }
            case 'get_job_execution_summary': {
                return { content: [{ type: 'text', text: await getJobExecutionSummary(credentials, args?.jobName as string) }] };
            }
            default:
                throw new Error(`Tool not found: ${name}`);
        }
    } catch (error: any) {
        console.error(`Error executing tool '${name}':`, error);
        return {
            content: [
                {
                    type: 'text',
                    text: `Error executing tool '${name}': ${error.message || error}`
                }
            ],
            isError: true
        };
    }
});

// Configure standard I/O (stdio) transport
const transport = new StdioServerTransport();

// Intercept the transport's onmessage handler to dynamically capture active workspace path
const originalOnMessage = transport.onmessage;
transport.onmessage = async (message) => {
    const msg = message as any;
    if (msg && msg.method === 'initialize') {
        const params = msg.params;
        if (params && Array.isArray(params.workspaceFolders) && params.workspaceFolders.length > 0) {
            const workspace = params.workspaceFolders[0];
            try {
                const resolvedPath = fileURLToPath(workspace.uri);
                if (resolvedPath) {
                    activeWorkspacePath = resolvedPath;
                    console.log('SFCC Logs MCP: Active workspace path resolved dynamically:', activeWorkspacePath);
                }
            } catch (err: any) {
                console.error('SFCC Logs MCP: Error decoding workspace folder URI:', err.message);
            }
        }
    }
    if (originalOnMessage) {
        return originalOnMessage(message);
    }
};

// Start the MCP server connection
async function run() {
    await server.connect(transport);
    console.log('SFCC Logs MCP Server running over stdio transport.');
}

run().catch((error) => {
    console.error('Fatal error runnning MCP server:', error);
    process.exit(1);
});