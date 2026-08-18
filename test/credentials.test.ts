import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    buildWebdavUrl,
    normalizeHostname,
    buildCredentialsObject,
    findCredentials
} from '../src/credentials';

const findUpSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock('find-up', () => ({
    sync: (...args: any[]) => findUpSyncMock(...args)
}));

vi.mock('node:fs', () => ({
    readFileSync: (...args: any[]) => readFileSyncMock(...args)
}));

describe('credentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        findUpSyncMock.mockReset();
        readFileSyncMock.mockReset();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe('buildWebdavUrl', () => {
        it('returns empty string if hostname is empty', () => {
            expect(buildWebdavUrl('', '/path')).toBe('');
        });

        it('constructs valid url with hostname without protocol', () => {
            const url = buildWebdavUrl('example.demandware.net', '/on/demandware.servlet/webdav/Sites/Logs');
            expect(url).toBe('https://example.demandware.net/on/demandware.servlet/webdav/Sites/Logs');
        });

        it('constructs valid url with hostname having https protocol', () => {
            const url = buildWebdavUrl('https://example.demandware.net', '/on/demandware.servlet/webdav/Sites/Logs');
            expect(url).toBe('https://example.demandware.net/on/demandware.servlet/webdav/Sites/Logs');
        });

        it('handles invalid url by falling back gracefully', () => {
            const url = buildWebdavUrl('http://invalid host', '/Logs');
            expect(url).toContain('/Logs');
        });
    });

    describe('normalizeHostname', () => {
        it('returns empty string for empty input', () => {
            expect(normalizeHostname('')).toBe('');
        });

        it('extracts hostname from full url', () => {
            expect(normalizeHostname('https://test.demandware.net/path')).toBe('test.demandware.net');
        });

        it('extracts hostname without protocol', () => {
            expect(normalizeHostname('test.demandware.net')).toBe('test.demandware.net');
        });
    });

    describe('buildCredentialsObject', () => {
        it('returns null if any required field is missing', () => {
            expect(buildCredentialsObject(undefined, 'pass', 'host')).toBeNull();
            expect(buildCredentialsObject('user', undefined, 'host')).toBeNull();
            expect(buildCredentialsObject('user', 'pass', undefined)).toBeNull();
        });

        it('creates a complete Credentials object with default path', () => {
            const creds = buildCredentialsObject('myuser', 'mypass', 'host.demandware.net');
            expect(creds).toEqual({
                username: 'myuser',
                password: 'mypass',
                hostname: 'host.demandware.net',
                webdavPath: '/on/demandware.servlet/webdav/Sites/Logs',
                webdavUrl: 'https://host.demandware.net/on/demandware.servlet/webdav/Sites/Logs'
            });
        });

        it('uses custom webdavPath and custom webdavUrl if provided', () => {
            const creds = buildCredentialsObject(
                'myuser',
                'mypass',
                'host.demandware.net',
                '/custom/path',
                'https://custom.url/path'
            );
            expect(creds).toEqual({
                username: 'myuser',
                password: 'mypass',
                hostname: 'host.demandware.net',
                webdavPath: '/custom/path',
                webdavUrl: 'https://custom.url/path'
            });
        });
    });

    describe('findCredentials', () => {
        it('finds credentials from process.env', () => {
            process.env.DW_WEBDAV_USERNAME = 'envUser';
            process.env.DW_WEBDAV_PASSWORD = 'envPassword';
            process.env.SFCC_SERVER = 'env-server.demandware.net';

            const creds = findCredentials(null);
            expect(creds).not.toBeNull();
            expect(creds?.username).toBe('envUser');
            expect(creds?.password).toBe('envPassword');
            expect(creds?.hostname).toBe('env-server.demandware.net');
        });

        it('finds credentials from dw.json', () => {
            delete process.env.DW_WEBDAV_USERNAME;
            delete process.env.DW_WEBDAV_PASSWORD;
            delete process.env.SFCC_SERVER;
            delete process.env.SFCC_HOST;
            delete process.env.SFCC_HOSTNAME;

            findUpSyncMock.mockImplementation((filename: string) => {
                if (filename === 'dw.json') return '/fake/path/dw.json';
                return undefined;
            });

            readFileSyncMock.mockImplementation((filePath: any) => {
                if (filePath === '/fake/path/dw.json') {
                    return JSON.stringify({
                        username: 'dwUser',
                        password: 'dwPassword',
                        hostname: 'dw-host.demandware.net'
                    });
                }
                throw new Error('File not found');
            });

            const creds = findCredentials('/fake/path');
            expect(creds).not.toBeNull();
            expect(creds?.username).toBe('dwUser');
            expect(creds?.password).toBe('dwPassword');
            expect(creds?.hostname).toBe('dw-host.demandware.net');
        });

        it('finds credentials from .env file when dw.json is absent', () => {
            delete process.env.DW_WEBDAV_USERNAME;
            delete process.env.DW_WEBDAV_PASSWORD;
            delete process.env.SFCC_SERVER;
            delete process.env.SFCC_HOST;
            delete process.env.SFCC_HOSTNAME;

            findUpSyncMock.mockImplementation((filename: string) => {
                if (filename === '.env') return '/fake/path/.env';
                return undefined;
            });

            readFileSyncMock.mockImplementation((filePath: any) => {
                if (filePath === '/fake/path/.env') {
                    return 'SFCC_USERNAME=envFileUser\nSFCC_PASSWORD=envFilePass\nSFCC_SERVER=dotenv-host.demandware.net';
                }
                throw new Error('File not found');
            });

            const creds = findCredentials('/fake/path');
            expect(creds).not.toBeNull();
            expect(creds?.username).toBe('envFileUser');
            expect(creds?.password).toBe('envFilePass');
            expect(creds?.hostname).toBe('dotenv-host.demandware.net');
        });

        it('returns null if no credentials found anywhere', () => {
            delete process.env.DW_WEBDAV_USERNAME;
            delete process.env.DW_WEBDAV_PASSWORD;
            delete process.env.SFCC_SERVER;
            delete process.env.SFCC_HOST;
            delete process.env.SFCC_HOSTNAME;

            findUpSyncMock.mockReturnValue(undefined);

            const creds = findCredentials('/fake/empty');
            expect(creds).toBeNull();
        });

        it('handles malformed dw.json gracefully and proceeds to .env fallback', () => {
            delete process.env.DW_WEBDAV_USERNAME;
            delete process.env.DW_WEBDAV_PASSWORD;
            delete process.env.SFCC_SERVER;
            delete process.env.SFCC_HOST;
            delete process.env.SFCC_HOSTNAME;

            findUpSyncMock.mockImplementation((filename: string) => {
                if (filename === 'dw.json') return '/fake/path/dw.json';
                if (filename === '.env') return '/fake/path/.env';
                return undefined;
            });

            readFileSyncMock.mockImplementation((filePath: any) => {
                if (filePath === '/fake/path/dw.json') {
                    return 'INVALID_JSON_CONTENT';
                }
                if (filePath === '/fake/path/.env') {
                    return 'SFCC_USERNAME=fallbackUser\nSFCC_PASSWORD=fallbackPass\nSFCC_SERVER=fallback-host.demandware.net';
                }
                throw new Error('File not found');
            });

            const creds = findCredentials('/fake/path');
            expect(creds?.username).toBe('fallbackUser');
        });
    });
});
