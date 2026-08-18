import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getAvailableTools,
    executeTool,
    getActiveWorkspacePath,
    setActiveWorkspacePath,
    handleCallToolRequest,
    transport
} from '../src/mcp-server';
import * as webdav from '../src/webdav';
import * as credsModule from '../src/credentials';
import { Credentials } from '../src/credentials';

const mockCredentials: Credentials = {
    username: 'user',
    password: 'pass',
    hostname: 'host.demandware.net',
    webdavPath: '/Logs',
    webdavUrl: 'https://host.demandware.net/Logs'
};

describe('mcp-server', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('manages active workspace path state', () => {
        setActiveWorkspacePath('/my/workspace');
        expect(getActiveWorkspacePath()).toBe('/my/workspace');
        setActiveWorkspacePath(null);
        expect(getActiveWorkspacePath()).toBeNull();
    });

    it('returns all available tool definitions', () => {
        const tools = getAvailableTools();
        expect(tools.length).toBeGreaterThan(5);
        const toolNames = tools.map(t => t.name);
        expect(toolNames).toContain('get_sfcc_logfile');
        expect(toolNames).toContain('clean_sfcc_logfile');
        expect(toolNames).toContain('get_latest_error');
        expect(toolNames).toContain('get_latest_warn');
        expect(toolNames).toContain('get_latest_info');
        expect(toolNames).toContain('get_latest_debug');
        expect(toolNames).toContain('summarize_logs');
        expect(toolNames).toContain('search_logs');
        expect(toolNames).toContain('get_latest_job_log_files');
        expect(toolNames).toContain('search_job_logs_by_name');
        expect(toolNames).toContain('get_job_log_entries');
        expect(toolNames).toContain('search_job_logs');
        expect(toolNames).toContain('get_job_execution_summary');
    });

    describe('executeTool', () => {
        it('executes get_sfcc_logfile without logFileName (list files)', async () => {
            vi.spyOn(webdav, 'listLogs').mockResolvedValue([
                { name: 'error.log', size: 1024, lastModified: '2026-08-18T10:00:00.000Z' }
            ]);

            const res = await executeTool(mockCredentials, 'get_sfcc_logfile');
            expect(res.content[0].text).toContain('error.log');
        });

        it('executes get_sfcc_logfile with logFileName (fetch content)', async () => {
            vi.spyOn(webdav, 'getLogContent').mockResolvedValue('log line 1\nlog line 2');

            const res = await executeTool(mockCredentials, 'get_sfcc_logfile', { logFileName: 'error.log', count: 2 });
            expect(res.content[0].text).toBe('log line 1\nlog line 2');
        });

        it('executes clean_sfcc_logfile', async () => {
            vi.spyOn(webdav, 'cleanLog').mockResolvedValue(true);

            const res = await executeTool(mockCredentials, 'clean_sfcc_logfile', { logFileName: 'error.log' });
            expect(res.content[0].text).toContain('Successfully cleaned log file: error.log');
        });

        it('returns error when clean_sfcc_logfile lacks logFileName', async () => {
            const res = await executeTool(mockCredentials, 'clean_sfcc_logfile', {});
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain('logFileName is required');
        });

        it('executes get_latest_error / warn / info / debug', async () => {
            vi.spyOn(webdav, 'getLatestLogs').mockImplementation(async (_creds, level) => `Logs for ${level}`);

            for (const level of ['error', 'warn', 'info', 'debug']) {
                const res = await executeTool(mockCredentials, `get_latest_${level}`, { limit: 5 });
                expect(res.content[0].text).toBe(`Logs for ${level}`);
            }
        });

        it('executes summarize_logs', async () => {
            vi.spyOn(webdav, 'summarizeLogs').mockResolvedValue('Summary report');

            const res = await executeTool(mockCredentials, 'summarize_logs', { date: 'today' });
            expect(res.content[0].text).toBe('Summary report');
        });

        it('executes search_logs', async () => {
            vi.spyOn(webdav, 'searchLogs').mockResolvedValue('Search results');

            const res = await executeTool(mockCredentials, 'search_logs', { pattern: 'test' });
            expect(res.content[0].text).toBe('Search results');
        });

        it('executes job logs tools', async () => {
            vi.spyOn(webdav, 'listJobLogs').mockResolvedValue('Job logs list');
            vi.spyOn(webdav, 'searchJobLogsByName').mockResolvedValue('Matched job logs');
            vi.spyOn(webdav, 'getJobLogEntries').mockResolvedValue('Job log entries');
            vi.spyOn(webdav, 'searchJobLogs').mockResolvedValue('Job search results');
            vi.spyOn(webdav, 'getJobExecutionSummary').mockResolvedValue('Execution summary');

            expect((await executeTool(mockCredentials, 'get_latest_job_log_files')).content[0].text).toBe('Job logs list');
            expect((await executeTool(mockCredentials, 'search_job_logs_by_name', { jobName: 'import' })).content[0].text).toBe('Matched job logs');
            expect((await executeTool(mockCredentials, 'get_job_log_entries', { jobName: 'import' })).content[0].text).toBe('Job log entries');
            expect((await executeTool(mockCredentials, 'search_job_logs', { pattern: 'err' })).content[0].text).toBe('Job search results');
            expect((await executeTool(mockCredentials, 'get_job_execution_summary', { jobName: 'import' })).content[0].text).toBe('Execution summary');
        });

        it('throws error for unknown tool name', async () => {
            await expect(executeTool(mockCredentials, 'unknown_tool')).rejects.toThrow('Tool not found: unknown_tool');
        });
    });

    describe('handleCallToolRequest', () => {
        it('returns error message if no credentials are found', async () => {
            vi.spyOn(credsModule, 'findCredentials').mockReturnValue(null);

            const result = await handleCallToolRequest({
                params: { name: 'get_sfcc_logfile' }
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error: No credentials found.');
        });

        it('executes tool successfully when credentials exist', async () => {
            vi.spyOn(credsModule, 'findCredentials').mockReturnValue(mockCredentials);
            vi.spyOn(webdav, 'listLogs').mockResolvedValue([]);

            const result = await handleCallToolRequest({
                params: { name: 'get_sfcc_logfile' }
            });
            expect(result.content[0].text).toBe('No log files found.');
        });

        it('catches execution errors and returns error response', async () => {
            vi.spyOn(credsModule, 'findCredentials').mockReturnValue(mockCredentials);
            vi.spyOn(webdav, 'listLogs').mockRejectedValue(new Error('Network error'));

            const result = await handleCallToolRequest({
                params: { name: 'get_sfcc_logfile' }
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Error executing tool');
        });
    });

    describe('transport onmessage workspace interception', () => {
        it('parses workspace uri from initialize message', async () => {
            if (transport.onmessage) {
                await transport.onmessage({
                    method: 'initialize',
                    params: {
                        workspaceFolders: [
                            { uri: 'file:///C:/Users/nabha/Workspace/test' }
                        ]
                    }
                } as any);
                expect(getActiveWorkspacePath()).toBeTruthy();
            }
        });
    });
});
