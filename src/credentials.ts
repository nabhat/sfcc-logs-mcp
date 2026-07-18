import * as fs from 'fs';
import * as path from 'path';
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

// Helper to construct a clean, future-proof webdav URL using Node's native URL class
export function buildWebdavUrl(hostname: string, webdavPath: string): string {
    if (!hostname) return '';
    // Ensure protocol is present so native URL class can parse it safely
    const base = hostname.includes('://') ? hostname : `https://${hostname}`;
    try {
        const url = new URL(base);
        url.pathname = webdavPath;
        return url.toString();
    } catch (error) {
        //Simple fallback if parsing fails
        return `https://${hostname.replace(/^https?:\/\//i, '').split('/')[0]}${webdavPath}`;
    }
}

//Helper to normalize the hostname using Node's native URL class
function normalizeHostname(hostname: string): string {
    if (!hostname) return '';
    try {
        const urlString = hostname.includes('://') ? hostname : `https://${hostname}`;
        const myUrl = new URL(urlString);
        return myUrl.hostname;
    } catch (error) {
        return hostname.trim().replace(/^https?:\/\//i, '').split('/')[0];
    }
}

/**
 * Locate credentials from environment variables, walking up for .env or dw.json
 * 
 * @param activeWorkspacePath - Starting folder path from editor's active workspace
 * @returns credentails containing username, password, hostname, webdavPath, and webdavUrl
 */
export function findCredentials(activeWorkspacePath: string | null): Credentials | null {
    const defaultWebdavPath = '/on/demandware.servlet/webdav/Sites/Logs';

    //1. Check environment variables
    const username = process.env.DW_WEBDAV_USERNAME;
    const password = process.env.DW_WEBDAV_PASSWORD;
    const hostname = process.env.SFCC_SERVER || process.env.SFCC_HOST || process.env.SFCC_HOSTNAME;
    const webdavPathEnv = process.env.SFCC_WEBDAV_PATH;
    const webdavUrlEnv = process.env.SFCC_WEBDAV_URL;

    if (username && password && hostname) {
        const host = normalizeHostname(hostname);
        const resolvedPath = webdavPathEnv || defaultWebdavPath;
        return {
            username,
            password,
            hostname: host,
            webdavPath: resolvedPath,
            webdavUrl: webdavUrlEnv || buildWebdavUrl(host, resolvedPath)
        };
    }

    // 2. Walk up parent directories starting from activeWorkspacePath or process.cwd()
    const startDir = activeWorkspacePath || process.cwd();

    // Find closest dw.json up the tree
    const dwJsonPath = findUp.sync('dw.json', { cwd: startDir });
    if (dwJsonPath) {
        try {
            const content = fs.readFileSync(dwJsonPath, 'utf-8');
            const config = json5.parse(content);
            const rawHost = config.hostname || config.server;
            if (config.username && config.password && rawHost) {
                const host = normalizeHostname(rawHost);
                const resolvedPath = config.webdavPath || config.webdav_path || defaultWebdavPath;
                return {
                    username: config.username,
                    password: config.password,
                    hostname: host,
                    webdavPath: resolvedPath,
                    webdavUrl: config.webdavUrl || config.webdav_url || buildWebdavUrl(rawHost, resolvedPath)
                };
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
            const envUser = env.SFCC_USERNAME;
            const envPass = env.SFCC_PASSWORD;
            const envHost = env.SFCC_SERVER || env.SFCC_HOST || env.SFCC_HOSTNAME;
            const envWebdavPath = env.SFCC_WEBDAV_PATH;
            const envWebdavUrl = env.SFCC_WEBDAV_URL;

            if (envUser && envPass && envHost) {
                const host = normalizeHostname(envHost);
                const resolvedPath = envWebdavPath || defaultWebdavPath;
                return {
                    username: envUser,
                    password: envPass,
                    hostname: host,
                    webdavPath: resolvedPath,
                    webdavUrl: envWebdavUrl || buildWebdavUrl(envHost, resolvedPath)
                };
            }
        } catch (e: any) {
            console.error(`Error parsing .env at ${envPath}: ${e.message}`);
        }
    }

    return null
}