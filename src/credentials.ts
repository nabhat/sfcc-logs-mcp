import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import * as findUp from 'find-up';
import * as json5 from 'json5';

export interface Credentials {
    username: string;
    password: string;
    hostname: string;
    webdavPath: string;
    webdavUrl: string;
}

const DEFAULT_WEBDAV_PATH = '/on/demandware.servlet/webdav/Sites/Logs';

// Helper to construct a clean, future-proof webdav URL using Node's native URL class
export function buildWebdavUrl(hostname: string, webdavPath: string): string {
    if (!hostname) return '';
    // Ensure protocol is present so native URL class can parse it safely
    const base = hostname.includes('://') ? hostname : `https://${hostname}`;
    try {
        const url = new URL(base);
        url.pathname = webdavPath;
        return url.toString();
    } catch {
        // Simple fallback if parsing fails
        return `https://${hostname.replace(/^https?:\/\//i, '').split('/')[0]}${webdavPath}`;
    }
}

// Helper to normalize the hostname using Node's native URL class
export function normalizeHostname(hostname: string): string {
    if (!hostname) return '';
    try {
        const urlString = hostname.includes('://') ? hostname : `https://${hostname}`;
        const myUrl = new URL(urlString);
        return myUrl.hostname;
    } catch {
        return hostname.trim().replace(/^https?:\/\//i, '').split('/')[0];
    }
}

/**
 * Helper to construct a complete Credentials object from raw inputs.
 */
export function buildCredentialsObject(
    username?: string,
    password?: string,
    rawHost?: string,
    webdavPath?: string,
    webdavUrl?: string
): Credentials | null {
    if (!username || !password || !rawHost) {
        return null;
    }
    const hostname = normalizeHostname(rawHost);
    const resolvedPath = webdavPath || DEFAULT_WEBDAV_PATH;
    return {
        username,
        password,
        hostname,
        webdavPath: resolvedPath,
        webdavUrl: webdavUrl || buildWebdavUrl(hostname, resolvedPath)
    };
}

/**
 * Locate credentials from environment variables, walking up for .env or dw.json
 * 
 * @param activeWorkspacePath - Starting folder path from editor's active workspace
 * @returns credentials containing username, password, hostname, webdavPath, and webdavUrl
 */
export function findCredentials(activeWorkspacePath: string | null): Credentials | null {
    // 1. Check environment variables
    const envCreds = buildCredentialsObject(
        process.env.DW_WEBDAV_USERNAME,
        process.env.DW_WEBDAV_PASSWORD,
        process.env.SFCC_SERVER || process.env.SFCC_HOST || process.env.SFCC_HOSTNAME,
        process.env.SFCC_WEBDAV_PATH,
        process.env.SFCC_WEBDAV_URL
    );
    if (envCreds) {
        return envCreds;
    }

    // 2. Walk up parent directories starting from activeWorkspacePath or process.cwd()
    const startDir = activeWorkspacePath || process.cwd();

    // Find closest dw.json up the tree
    const dwJsonPath = findUp.sync('dw.json', { cwd: startDir });
    if (dwJsonPath) {
        try {
            const content = fs.readFileSync(dwJsonPath, 'utf-8');
            const config = json5.parse(content);
            const dwCreds = buildCredentialsObject(
                config.username,
                config.password,
                config.hostname || config.server,
                config.webdavPath || config.webdav_path,
                config.webdavUrl || config.webdav_url
            );
            if (dwCreds) {
                return dwCreds;
            }
        } catch (e: any) {
            console.error(`Error parsing dw.json at ${dwJsonPath}: ${e.message}`);
        }
    }

    // Fallback: Find closest .env up the tree
    const envPath = findUp.sync('.env', { cwd: startDir });
    if (envPath) {
        try {
            const content = fs.readFileSync(envPath, 'utf-8');
            const env = dotenv.parse(content);
            const dotenvCreds = buildCredentialsObject(
                env.SFCC_USERNAME,
                env.SFCC_PASSWORD,
                env.SFCC_SERVER || env.SFCC_HOST || env.SFCC_HOSTNAME,
                env.SFCC_WEBDAV_PATH,
                env.SFCC_WEBDAV_URL
            );
            if (dotenvCreds) {
                return dotenvCreds;
            }
        } catch (e: any) {
            console.error(`Error parsing .env at ${envPath}: ${e.message}`);
        }
    }

    return null;
}