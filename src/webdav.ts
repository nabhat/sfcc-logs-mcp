import { createClient, WebDAVClient } from 'webdav';
import { Credentials } from './credentials';

export interface LogFileMetadata {
    name: string;
    size: number;
    lastModified: string;
}

interface SearchMatch {
    file: string;
    line: number;
    text: string;
}

// Helper to create an authenticated webdav client
export function getWebDavClient(credentials: Credentials): WebDAVClient {
    return createClient(credentials.webdavUrl, {
        username: credentials.username,
        password: credentials.password,
    });
}

// Helper to check if a filename is a background cron job log
export function isJobLog(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.includes('job') || lower.startsWith('jobs-') || lower.startsWith('job-');
}

// Helper to normalize the date into YYYYMMDD format
export function formatDateString(dateStr: string | undefined): string {
    if (!dateStr || dateStr.toLowerCase() === 'today') {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }
    return dateStr.replace(/\D/g, '');
}

// Helper to format a list of log files into markdown
export function formatFileList(files: LogFileMetadata[], limit?: number): string {
    const list = limit ? files.slice(0, limit) : files;
    return list
        .map(l => `- ${l.name} (Size: ${(l.size / 1024).toFixed(2)} KB, Modified: ${l.lastModified})`)
        .join('\n');
}

// Helper to filter job logs by optional job name
export function filterJobLogs(files: LogFileMetadata[], jobName?: string): LogFileMetadata[] {
    let matched = files.filter(f => isJobLog(f.name));
    if (jobName) {
        const lower = jobName.toLowerCase();
        matched = matched.filter(f => f.name.toLowerCase().includes(lower));
    }
    return matched;
}

// Helper to scan a batch of files for a pattern and optional level
async function scanFilesInBatches(
    credentials: Credentials,
    filesToScan: LogFileMetadata[],
    pattern: string,
    level: string | undefined,
    limit: number,
    linesPerFile: number
): Promise<string> {
    const normalizedPattern = pattern.toLowerCase();
    const results: SearchMatch[] = [];

    for (const file of filesToScan) {
        if (results.length >= limit) break;
        const content = await getLogContent(credentials, file.name, linesPerFile);
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (results.length >= limit) return;
            const matchesPattern = line.toLowerCase().includes(normalizedPattern);
            const matchesLevel = !level || level.toLowerCase() === 'all' || line.toLowerCase().includes(level.toLowerCase());

            if (matchesPattern && matchesLevel) {
                results.push({
                    file: file.name,
                    line: index + 1,
                    text: line.trim()
                });
            }
        });
    }

    if (results.length === 0) {
        return `No matches found for the pattern: "${pattern}" across ${filesToScan.length} files scanned.`;
    }

    return `Found ${results.length} matches for pattern: "${pattern}" across ${filesToScan.length} files scanned.\n\n` +
        results.map(r => `[${r.file}:${r.line}] ${r.text}`).join('\n');
}

/**
 * Fetch all available log files from the instance's webDAV Logs folder
 */
export async function listLogs(credentials: Credentials): Promise<LogFileMetadata[]> {
    const client = getWebDavClient(credentials);
    const contents = await client.getDirectoryContents('/');

    // Ensure standard array and filter out directory collection objects
    const list = Array.isArray(contents) ? contents : [contents];

    return list
        .filter((item: any) => item.type === 'file' && item.basename)
        .map((item: any) => ({
            name: item.basename,
            size: item.size || 0,
            lastModified: item.lastmod ? new Date(item.lastmod).toISOString() : ''
        }))
        .sort((a, b) => {
            const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
            const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
            return dateB - dateA;
        });
}

// Helper to parse file contents into a string safely
function parseTextContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Buffer.isBuffer(content)) {
        return content.toString('utf-8');
    }
    if (content instanceof ArrayBuffer) {
        return Buffer.from(content).toString('utf-8');
    }
    return '';
}

/**
 * Fetch the end of a specific log file using partial content (Range header) to optimise bandwidth
 */
export async function getLogContent(credentials: Credentials, fileName: string, count = 10): Promise<string> {
    const client = getWebDavClient(credentials);
    let text: string;
    let isTruncated = false;

    try {
        // Try requesting the last 1MB of the file to save bandwidth
        const content = await client.getFileContents('/' + fileName, {
            format: 'text',
            headers: {
                range: 'bytes=-1048576' // last 1MB
            }
        });
        text = parseTextContent(content);
        isTruncated = true;
    } catch {
        // Fall back to fetching full file
        const content = await client.getFileContents('/' + fileName, {
            format: 'text'
        });
        text = parseTextContent(content);
    }

    const lines = text.split(/\r?\n/);

    // If text was successfully chunked by range, drop the first line as it may be cut in the middle of a string
    if (isTruncated && lines.length > 1) {
        lines.shift();
    }

    return lines.slice(-count).join('\n');
}

/**
 * Clear a specific log file by overwriting it with a tiny cleared-at message
 */
export async function cleanLog(credentials: Credentials, fileName: string): Promise<boolean> {
    const client = getWebDavClient(credentials);
    const bodyContent = `[Log file cleared on ${new Date().toISOString()}]\n`;

    await client.putFileContents('/' + fileName, bodyContent);

    return true;
}

/**
 * Get the latest logs matching a specific severity level and date
 */
export async function getLatestLogs(credentials: Credentials, level: string, limit = 10, date = 'today'): Promise<string> {
    const files = await listLogs(credentials);
    const datePattern = formatDateString(date);
    const lvl = level.toLowerCase();

    const matchedFiles = files.filter(f => {
        const name = f.name.toLowerCase();
        const matchesLevel = name.includes(`-${lvl}-`) || name.startsWith(`${lvl}-`);
        const matchesDate = !datePattern || name.includes(datePattern);
        return matchesLevel && matchesDate;
    });

    if (matchedFiles.length === 0) {
        return `No matching ${level.toUpperCase()} log files found for date: ${datePattern || 'any'}`;
    }

    const targetFile = matchedFiles[0];
    const content = await getLogContent(credentials, targetFile.name, limit);
    return `--- Last ${limit} lines of ${targetFile.name} (Size: ${(targetFile.size / 1024).toFixed(2)} KB, Modified: ${targetFile.lastModified}) ---\n\n${content}`;
}

/**
 * Statistical audit overview of all log files for a specific date
 */
export async function summarizeLogs(credentials: Credentials, date = 'today'): Promise<string> {
    const files = await listLogs(credentials);
    const datePattern = formatDateString(date);

    const matchedFiles = files.filter(f => !datePattern || f.name.includes(datePattern));
    if (matchedFiles.length === 0) {
        return `No log files found for date: ${datePattern || 'any'}`;
    }

    let totalSize = 0;
    const categories: Record<string, { count: number; size: number }> = {
        error: { count: 0, size: 0 },
        warn: { count: 0, size: 0 },
        info: { count: 0, size: 0 },
        debug: { count: 0, size: 0 },
        job: { count: 0, size: 0 },
        other: { count: 0, size: 0 },
    };

    matchedFiles.forEach(f => {
        const name = f.name.toLowerCase();
        totalSize += f.size;

        if (isJobLog(f.name)) {
            categories.job.count++;
            categories.job.size += f.size;
        } else if (name.includes('error')) {
            categories.error.count++;
            categories.error.size += f.size;
        } else if (name.includes('warn')) {
            categories.warn.count++;
            categories.warn.size += f.size;
        } else if (name.includes('info')) {
            categories.info.count++;
            categories.info.size += f.size;
        } else if (name.includes('debug')) {
            categories.debug.count++;
            categories.debug.size += f.size;
        } else {
            categories.other.count++;
            categories.other.size += f.size;
        }
    });

    let summary = `=== SFCC Log Summary for Date: ${datePattern || 'any'} ===\n`;
    summary += `Total Files: ${matchedFiles.length}\n`;
    summary += `Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n\n`;
    summary += 'Category Breakdown:\n';

    Object.entries(categories).forEach(([cat, data]) => {
        if (data.count > 0) {
            summary += `- ${cat.toUpperCase()}: ${data.count} file(s) ${(data.size / 1024).toFixed(2)} KB\n`;
        }
    });

    summary += '\nNewest Active Files:\n';
    matchedFiles.slice(0, 3).forEach(f => {
        summary += `- ${f.name} (${(f.size / 1024).toFixed(2)} KB, Modified: ${f.lastModified})\n`;
    });

    return summary;
}

/**
 * Searches across log files matching level/date for a specific text pattern
 */
export async function searchLogs(credentials: Credentials, pattern: string, logLevel?: string, limit = 20, date = 'today'): Promise<string> {
    const files = await listLogs(credentials);
    const datePattern = formatDateString(date);

    let matchedFiles = files.filter(f => !datePattern || f.name.includes(datePattern));
    if (logLevel && logLevel.toLowerCase() !== 'all') {
        const lvl = logLevel.toLowerCase();
        matchedFiles = matchedFiles.filter(f => {
            const name = f.name.toLowerCase();
            return name.includes(`-${lvl}-`) || name.startsWith(`${lvl}-`);
        });
    }

    if (matchedFiles.length === 0) {
        return `No log files matching level ${logLevel || 'any'} and date ${datePattern || 'any'}`;
    }

    return scanFilesInBatches(credentials, matchedFiles.slice(0, 5), pattern, undefined, limit, 10000);
}

/**
 * List background cron job log files (starting with job-)
 */
export async function listJobLogs(credentials: Credentials, limit = 10): Promise<string> {
    const files = await listLogs(credentials);
    const jobFiles = filterJobLogs(files);
    const fileList = formatFileList(jobFiles, limit);

    return fileList ? `Available Background Job Logs:\n\n${fileList}` : 'No job logs found on the instance.';
}

/**
 * Filter job logs by a specific job ID / name
 */
export async function searchJobLogsByName(credentials: Credentials, jobName: string, limit = 10): Promise<string> {
    const files = await listLogs(credentials);
    const matched = filterJobLogs(files, jobName);
    const fileList = formatFileList(matched, limit);

    return fileList ? `Matching job logs for "${jobName}":\n\n${fileList}` : `No job logs found matching: "${jobName}"`;
}

function getJobNotFoundMessage(jobName?: string): string {
    return jobName ? `No job logs found for job: ${jobName}.` : 'No job logs found.';
}

/**
 * Stream and filter entries inside a specific job log by severity
 */
export async function getJobLogEntries(credentials: Credentials, level?: string, limit = 10, jobName?: string): Promise<string> {
    const files = await listLogs(credentials);
    const matchedFiles = filterJobLogs(files, jobName);

    if (matchedFiles.length === 0) {
        return getJobNotFoundMessage(jobName);
    }

    const targetFile = matchedFiles[0];
    const content = await getLogContent(credentials, targetFile.name, 2000);
    const lines = content.split('\n');

    let filtered = lines;
    if (level && level.toLowerCase() !== 'all') {
        const normalizedLevel = level.toUpperCase();
        filtered = lines.filter(line => {
            const upper = line.toUpperCase();
            return upper.includes(`[${normalizedLevel}]`) || upper.includes(`|${normalizedLevel}|`) || upper.includes(normalizedLevel);
        });
    }

    return `--- Job log: ${targetFile.name} (Filtered by level: ${level || 'all'}, Last ${limit} entries) ---\n\n` +
        filtered.slice(-limit).join('\n');
}

/**
 * Search for text pattern strictly inside job logs
 */
export async function searchJobLogs(credentials: Credentials, pattern: string, level?: string, limit = 20, jobName?: string): Promise<string> {
    const files = await listLogs(credentials);
    const matchedFiles = filterJobLogs(files, jobName);

    if (matchedFiles.length === 0) {
        return getJobNotFoundMessage(jobName);
    }

    return scanFilesInBatches(credentials, matchedFiles.slice(0, 3), pattern, level, limit, 5000);
}

/**
 * Parses a job log to extract a high-end, visual execution summary of steps and statuses
 */
export async function getJobExecutionSummary(credentials: Credentials, jobName?: string): Promise<string> {
    const files = await listLogs(credentials);
    const matchedFiles = filterJobLogs(files, jobName);

    if (matchedFiles.length === 0) {
        return getJobNotFoundMessage(jobName);
    }

    const targetFile = matchedFiles[0];
    const content = await getLogContent(credentials, targetFile.name, 5000);
    const lines = content.split('\n');

    const steps: Array<{ name: string; status: string; startedAt?: string; finishedAt?: string }> = [];
    let jobStatus = 'UNKNOWN';
    let duration = 'unknown';

    lines.forEach(line => {
        const stepStartMatch = /Step\s+'([^']+)'\s+started/i.exec(line);
        const stepFinishMatch = /Step\s+'([^']+)'\s+finished\s+with\s+status\s+'([^']+)'/i.exec(line);
        const exitStatusMatch = /Job\s+finished\s+with\s+status\s+'([^']+)'\s+in\s+([^)]+)/i.exec(line);

        if (stepStartMatch) {
            steps.push({
                name: stepStartMatch[1],
                status: 'RUNNING',
                startedAt: line.substring(0, 19)
            });
        } else if (stepFinishMatch) {
            const stepName = stepFinishMatch[1];
            const status = stepFinishMatch[2];
            const step = steps.find(s => s.name === stepName);
            if (step) {
                step.status = status;
                step.finishedAt = line.substring(0, 19);
            } else {
                steps.push({ name: stepName, status: status, finishedAt: line.substring(0, 19) });
            }
        } else if (exitStatusMatch) {
            jobStatus = exitStatusMatch[1];
            duration = exitStatusMatch[2];
        }
    });

    let summary = '=== SFCC Background Job Execution Summary ===\n';
    summary += `Log File: ${targetFile.name}\n`;
    summary += `Job Status: [${jobStatus}]\n`;
    summary += `Duration: ${duration}\n\n`;
    summary += 'Execution Steps Audit:\n';

    if (steps.length === 0) {
        summary += 'No specific step-execution logs parsed inside the file.\n';
    } else {
        steps.forEach((s, i) => {
            const timeInfo = s.startedAt ? `Started: ${s.startedAt}` : '';
            summary += `${i + 1}. Step: '${s.name}' -> Status: [${s.status}] ${timeInfo}\n`;
        });
    }

    return summary;
}