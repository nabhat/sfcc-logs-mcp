import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isJobLog,
    formatDateString,
    formatFileList,
    filterJobLogs,
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
    getJobExecutionSummary,
    LogFileMetadata
} from '../src/webdav';
import { Credentials } from '../src/credentials';

const getDirectoryContentsMock = vi.fn();
const getFileContentsMock = vi.fn();
const putFileContentsMock = vi.fn();

vi.mock('webdav', () => ({
    createClient: () => ({
        getDirectoryContents: (...args: any[]) => getDirectoryContentsMock(...args),
        getFileContents: (...args: any[]) => getFileContentsMock(...args),
        putFileContents: (...args: any[]) => putFileContentsMock(...args)
    })
}));

const mockCredentials: Credentials = {
    username: 'testUser',
    password: 'testPassword',
    hostname: 'test.demandware.net',
    webdavPath: '/on/demandware.servlet/webdav/Sites/Logs',
    webdavUrl: 'https://test.demandware.net/on/demandware.servlet/webdav/Sites/Logs'
};

describe('webdav', () => {
    beforeEach(() => {
        getDirectoryContentsMock.mockReset();
        getFileContentsMock.mockReset();
        putFileContentsMock.mockReset();
    });

    describe('helper functions', () => {
        it('isJobLog correctly identifies job log files', () => {
            expect(isJobLog('job-orders-sync.log')).toBe(true);
            expect(isJobLog('jobs-catalog.log')).toBe(true);
            expect(isJobLog('custom-job-execution.log')).toBe(true);
            expect(isJobLog('custom-error-20260818.log')).toBe(false);
        });

        it('formatDateString handles "today", empty, and formatted dates', () => {
            const todayStr = formatDateString('today');
            expect(todayStr).toMatch(/^\d{8}$/);

            const emptyStr = formatDateString(undefined);
            expect(emptyStr).toMatch(/^\d{8}$/);

            expect(formatDateString('2026-08-18')).toBe('20260818');
        });

        it('formatFileList formats files into markdown', () => {
            const files: LogFileMetadata[] = [
                { name: 'error-1.log', size: 2048, lastModified: '2026-08-18T10:00:00.000Z' },
                { name: 'warn-1.log', size: 1024, lastModified: '2026-08-18T09:00:00.000Z' }
            ];
            const formatted = formatFileList(files, 1);
            expect(formatted).toBe('- error-1.log (Size: 2.00 KB, Modified: 2026-08-18T10:00:00.000Z)');
        });

        it('filterJobLogs filters by job name when provided', () => {
            const files: LogFileMetadata[] = [
                { name: 'job-catalog-import.log', size: 100, lastModified: '' },
                { name: 'job-order-export.log', size: 100, lastModified: '' },
                { name: 'error-system.log', size: 100, lastModified: '' }
            ];
            const allJobs = filterJobLogs(files);
            expect(allJobs).toHaveLength(2);

            const catalogJobs = filterJobLogs(files, 'catalog');
            expect(catalogJobs).toHaveLength(1);
            expect(catalogJobs[0].name).toBe('job-catalog-import.log');
        });
    });

    describe('listLogs', () => {
        it('fetches and sorts files from webdav directory', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'older.log', size: 1000, lastmod: '2026-08-18T08:00:00Z' },
                { type: 'directory', basename: 'subfolder' },
                { type: 'file', basename: 'newer.log', size: 2000, lastmod: '2026-08-18T10:00:00Z' }
            ]);

            const logs = await listLogs(mockCredentials);
            expect(logs).toHaveLength(2);
            expect(logs[0].name).toBe('newer.log');
            expect(logs[1].name).toBe('older.log');
        });
    });

    describe('getLogContent', () => {
        it('fetches truncated content via Range header', async () => {
            getFileContentsMock.mockResolvedValue('line0\nline1\nline2\nline3');
            const content = await getLogContent(mockCredentials, 'error.log', 2);
            expect(content).toBe('line2\nline3');
        });

        it('falls back to full file if range request fails', async () => {
            getFileContentsMock
                .mockRejectedValueOnce(new Error('Range not supported'))
                .mockResolvedValueOnce('lineA\nlineB\nlineC');

            const content = await getLogContent(mockCredentials, 'error.log', 2);
            expect(content).toBe('lineB\nlineC');
        });
    });

    describe('cleanLog', () => {
        it('overwrites file with clean message', async () => {
            putFileContentsMock.mockResolvedValue(undefined);
            const result = await cleanLog(mockCredentials, 'error.log');
            expect(result).toBe(true);
            expect(putFileContentsMock).toHaveBeenCalledWith('/error.log', expect.stringContaining('[Log file cleared on'));
        });
    });

    describe('getLatestLogs', () => {
        it('returns message if no matching files found', async () => {
            getDirectoryContentsMock.mockResolvedValue([]);
            const result = await getLatestLogs(mockCredentials, 'error', 10, '20260818');
            expect(result).toContain('No matching ERROR log files found');
        });

        it('returns tail of latest matching log file', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'custom-error-20260818.log', size: 2048, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue('err line 1\nerr line 2');

            const result = await getLatestLogs(mockCredentials, 'error', 2, '20260818');
            expect(result).toContain('custom-error-20260818.log');
            expect(result).toContain('err line 2');
        });
    });

    describe('summarizeLogs', () => {
        it('returns message when no files match the date', async () => {
            getDirectoryContentsMock.mockResolvedValue([]);
            const result = await summarizeLogs(mockCredentials, '20260818');
            expect(result).toContain('No log files found for date: 20260818');
        });

        it('categorizes log files accurately', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'error-20260818.log', size: 1024, lastmod: '2026-08-18T10:00:00Z' },
                { type: 'file', basename: 'warn-20260818.log', size: 2048, lastmod: '2026-08-18T09:00:00Z' },
                { type: 'file', basename: 'info-20260818.log', size: 3072, lastmod: '2026-08-18T08:00:00Z' },
                { type: 'file', basename: 'debug-20260818.log', size: 4096, lastmod: '2026-08-18T07:00:00Z' },
                { type: 'file', basename: 'job-sync-20260818.log', size: 5120, lastmod: '2026-08-18T06:00:00Z' },
                { type: 'file', basename: 'other-20260818.log', size: 6144, lastmod: '2026-08-18T05:00:00Z' }
            ]);

            const summary = await summarizeLogs(mockCredentials, '20260818');
            expect(summary).toContain('Total Files: 6');
            expect(summary).toContain('ERROR: 1 file(s)');
            expect(summary).toContain('WARN: 1 file(s)');
            expect(summary).toContain('INFO: 1 file(s)');
            expect(summary).toContain('DEBUG: 1 file(s)');
            expect(summary).toContain('JOB: 1 file(s)');
            expect(summary).toContain('OTHER: 1 file(s)');
        });
    });

    describe('searchLogs', () => {
        it('returns message if no log files match', async () => {
            getDirectoryContentsMock.mockResolvedValue([]);
            const result = await searchLogs(mockCredentials, 'NullPointerException', 'error', 10, '20260818');
            expect(result).toContain('No log files matching level error');
        });

        it('finds matching lines across files', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'custom-error-20260818.log', size: 1024, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue('normal line\nNullPointerException at line 42\nanother line');

            const result = await searchLogs(mockCredentials, 'NullPointerException', 'all', 10, '20260818');
            expect(result).toContain('Found 1 matches');
            expect(result).toContain('[custom-error-20260818.log:1] NullPointerException at line 42');
        });

        it('returns message when pattern is not found in scanned files', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'custom-error-20260818.log', size: 1024, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue('line 1\nline 2');

            const result = await searchLogs(mockCredentials, 'NonExistentError', 'all', 10, '20260818');
            expect(result).toContain('No matches found for the pattern: "NonExistentError"');
        });
    });

    describe('job logs functions', () => {
        it('listJobLogs returns list of available job logs', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'job-order-sync.log', size: 1024, lastmod: '2026-08-18T10:00:00Z' }
            ]);

            const result = await listJobLogs(mockCredentials);
            expect(result).toContain('job-order-sync.log');
        });

        it('listJobLogs returns fallback when no jobs exist', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'error-system.log', size: 1024, lastmod: '2026-08-18T10:00:00Z' }
            ]);

            const result = await listJobLogs(mockCredentials);
            expect(result).toBe('No job logs found on the instance.');
        });

        it('searchJobLogsByName finds matching jobs or returns fallback', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'job-catalog-feed.log', size: 2048, lastmod: '2026-08-18T10:00:00Z' }
            ]);

            const found = await searchJobLogsByName(mockCredentials, 'catalog');
            expect(found).toContain('job-catalog-feed.log');

            const notFound = await searchJobLogsByName(mockCredentials, 'inventory');
            expect(notFound).toContain('No job logs found matching: "inventory"');
        });

        it('getJobLogEntries filters entries by severity level', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'job-sync.log', size: 2048, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue('[INFO] Step 1\n[ERROR] Step 2 failed\n[DEBUG] Step 3');

            const errorsOnly = await getJobLogEntries(mockCredentials, 'ERROR', 10, 'sync');
            expect(errorsOnly).toContain('[ERROR] Step 2 failed');
            expect(errorsOnly).not.toContain('[DEBUG] Step 3');
        });

        it('getJobLogEntries returns fallback when job not found', async () => {
            getDirectoryContentsMock.mockResolvedValue([]);
            const result = await getJobLogEntries(mockCredentials, 'ERROR', 10, 'missingJob');
            expect(result).toContain('No job logs found for job: missingJob');
        });

        it('searchJobLogs searches pattern inside job logs', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'job-export.log', size: 2048, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue('Export starting\nTimeoutException during export\nDone');

            const result = await searchJobLogs(mockCredentials, 'TimeoutException', undefined, 10, 'export');
            expect(result).toContain('Found 1 matches');
            expect(result).toContain('TimeoutException during export');
        });

        it('searchJobLogs returns fallback when job not found', async () => {
            getDirectoryContentsMock.mockResolvedValue([]);
            const result = await searchJobLogs(mockCredentials, 'timeout', undefined, 10, 'nonexistent');
            expect(result).toContain('No job logs found for job: nonexistent');
        });

        it('getJobExecutionSummary parses step execution timeline and status', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'job-import.log', size: 2048, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue(
                '2026-08-18 10:00:00 Step \'ValidateInput\' started\n' +
                '2026-08-18 10:01:00 Step \'ValidateInput\' finished with status \'OK\'\n' +
                '2026-08-18 10:02:00 Job finished with status \'SUCCESS\' in 2 minutes'
            );

            const summary = await getJobExecutionSummary(mockCredentials, 'import');
            expect(summary).toContain('Job Status: [SUCCESS]');
            expect(summary).toContain('Step: \'ValidateInput\' -> Status: [OK]');
        });

        it('getJobExecutionSummary handles logs without step statements', async () => {
            getDirectoryContentsMock.mockResolvedValue([
                { type: 'file', basename: 'job-plain.log', size: 1024, lastmod: '2026-08-18T10:00:00Z' }
            ]);
            getFileContentsMock.mockResolvedValue('Plain log line without standard steps');

            const summary = await getJobExecutionSummary(mockCredentials, 'plain');
            expect(summary).toContain('No specific step-execution logs parsed');
        });

        it('getJobExecutionSummary returns fallback when job file is not found', async () => {
            getDirectoryContentsMock.mockResolvedValue([]);
            const result = await getJobExecutionSummary(mockCredentials, 'missing');
            expect(result).toContain('No job logs found for job: missing');
        });
    });
});
