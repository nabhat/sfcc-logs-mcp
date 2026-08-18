# 🚀 Salesforce Commerce Cloud (SFCC) Logs MCP Server

[![CI](https://github.com/nabhat/sfcc-logs-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/nabhat/sfcc-logs-mcp/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=nabhat_sfcc-logs-mcp&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=nabhat_sfcc-logs-mcp)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=nabhat_sfcc-logs-mcp&metric=coverage)](https://sonarcloud.io/summary/new_code?id=nabhat_sfcc-logs-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Supported-green.svg)](https://modelcontextprotocol.io/)
[![Dependabot Updates](https://github.com/nabhat/sfcc-logs-mcp/actions/workflows/dependabot/dependabot-updates/badge.svg)](https://github.com/nabhat/sfcc-logs-mcp/actions/workflows/dependabot/dependabot-updates)

A production-grade **Model Context Protocol (MCP)** server that enables AI coding assistants (**Claude Desktop, Cursor, Gemini, Claude Code, VS Code Copilot, Windsurf**, etc.) to query, tail, search, analyze, and clean **Salesforce Commerce Cloud (SFCC / Demandware)** logs in real-time over standard I/O (stdio).

---

## ✨ Key Features

* 🔄 **Context-Aware Dynamic Workspace Resolution**: Automatically detects the active workspace folder sent during the MCP initialization handshake and walks up the directory tree to find `dw.json` or `.env`. Switch between client projects or sandbox environments seamlessly without restarting your MCP server or changing settings.
* ⚡ **Bandwidth-Optimized Range Chunking**: Uses HTTP `Range` headers (`bytes=-1MB`) over WebDAV to fetch only the trailing chunk of huge log files. Tail multi-gigabyte production logs in milliseconds with minimal bandwidth consumption.
* 🔍 **Multi-File Search & Filtering**: Perform case-insensitive regex/text searches across multiple log files filtered by log level (`error`, `warn`, `info`, `debug`) or target date (`YYYYMMDD` or `today`).
* ⏱️ **SFCC Background Job Analytics**: Dedicated toolset to inspect cron job logs (`job-*`), filter entries by severity, and parse step boundaries to construct visual execution timelines (`RUNNING`, `OK`, `ERROR`).
* 📊 **Statistical Log Volume Summaries**: Generate high-level audits breaking down active log volume, category distributions, file counts, and newest active files for any given date.
* 🧹 **Log Sanitization**: Clean or reset active log files directly from chat to isolate freshly reproduced bugs.

---

## 📦 Installation

### Global Installation (Recommended)
Install globally to make the `sfcc-logs-mcp` binary available everywhere in your `PATH`:

```bash
npm install -g sfcc-logs-mcp
```

Once installed globally, you can run:
```bash
sfcc-logs-mcp
# or shorthand alias
sfcc-logs
```

### Run on Demand (npx)
```bash
npx sfcc-logs-mcp
```

---

## 🔐 Authentication & Credential Discovery

The server resolves credentials in the following order of priority:

### 1. `dw.json` (Standard SFCC Tooling Config)
Place a `dw.json` file in your workspace root (or any parent directory):
```json
{
  "hostname": "your-sandbox.demandware.net",
  "username": "your_webdav_username",
  "password": "your_webdav_password",
  "webdav_path": "/on/demandware.servlet/webdav/Sites/Logs"
}
```

### 2. `.env` File
Alternatively, define credentials in a local `.env` file in your project folder:
```env
SFCC_SERVER=your-sandbox.demandware.net
SFCC_USERNAME=your_webdav_username
SFCC_PASSWORD=your_webdav_password
SFCC_WEBDAV_PATH=/on/demandware.servlet/webdav/Sites/Logs
```

### 3. Environment Variables
Set system environment variables for static single-instance configurations:
```env
DW_WEBDAV_USERNAME=your_webdav_username
DW_WEBDAV_PASSWORD=your_webdav_password
SFCC_SERVER=your-sandbox.demandware.net
```

---

## 🛠️ MCP Tools Reference

| Tool Name | Description | Arguments |
| :--- | :--- | :--- |
| **`get_sfcc_logfile`** | List all available log files or return the last `count` lines from a specific log file. | `logFileName` *(optional)*, `count` *(default: 10)* |
| **`clean_sfcc_logfile`** | Clean/reset an active log file by replacing it with a timestamped cleared marker. | `logFileName` *(required)* |
| **`get_latest_error`** | Fetch the newest error logs for `today` or a specific date string (`YYYYMMDD`). | `limit` *(default: 10)*, `date` *(default: 'today')* |
| **`get_latest_warn`** | Fetch the newest warning logs for `today` or a specific date string (`YYYYMMDD`). | `limit` *(default: 10)*, `date` *(default: 'today')* |
| **`get_latest_info`** | Fetch the newest info logs for `today` or a specific date string (`YYYYMMDD`). | `limit` *(default: 10)*, `date` *(default: 'today')* |
| **`get_latest_debug`** | Fetch the newest debug logs for `today` or a specific date string (`YYYYMMDD`). | `limit` *(default: 10)*, `date` *(default: 'today')* |
| **`summarize_logs`** | Generate a statistical breakdown of log categories, file counts, and sizes. | `date` *(default: 'today')* |
| **`search_logs`** | Search across multiple log files matching level/date for a text pattern. | `pattern` *(required)*, `loglevel` *(default: 'all')*, `limit` *(default: 20)*, `date` *(default: 'today')* |
| **`get_latest_job_log_files`**| List background cron job log files (`job-*`), sorted newest first. | `limit` *(default: 10)* |
| **`search_job_logs_by_name`** | Filter background job logs strictly by Job ID/name (e.g. `CatalogImport`). | `jobName` *(required)*, `limit` *(default: 10)* |
| **`get_job_log_entries`** | Retrieve trailing log entries inside a job log, optionally filtered by severity. | `jobName` *(optional)*, `level` *(default: 'all')*, `limit` *(default: 10)* |
| **`search_job_logs`** | Search for a text pattern strictly within background job logs. | `pattern` *(required)*, `level` *(optional)*, `limit` *(default: 20)*, `jobName` *(optional)* |
| **`get_job_execution_summary`** | Parses job step boundaries to return structured execution timeline & status (`OK`/`ERROR`/`RUNNING`). | `jobName` *(optional)* |

---

## 🔌 Connecting to AI Clients

### Claude Desktop
Add to your `claude_desktop_config.json`:

* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sfcc-logs": {
      "command": "sfcc-logs-mcp"
    }
  }
}
```

---

### Cursor IDE
Add to `.cursor/mcp.json` in your workspace or global Cursor settings:

```json
{
  "mcpServers": {
    "sfcc-logs": {
      "command": "sfcc-logs-mcp"
    }
  }
}
```

---

### Windsurf / VS Code / Other MCP Clients
Configure the stdio server using the globally installed binary:

```json
{
  "mcpServers": {
    "sfcc-logs": {
      "command": "npx",
      "args": ["-y", "sfcc-logs-mcp"]
    }
  }
}
```

---

## 🧪 Testing with MCP Inspector

You can test and verify all tools interactively using the official `@modelcontextprotocol/inspector`:

```bash
# 1. Interactive Web UI
npx @modelcontextprotocol/inspector sfcc-logs-mcp

# 2. CLI Mode (List tools)
npx @modelcontextprotocol/inspector --cli sfcc-logs-mcp --method tools/list

# 3. CLI Mode (Call a tool)
npx @modelcontextprotocol/inspector --cli sfcc-logs-mcp --method tools/call --tool-name get_latest_error

# 4. Interactive Terminal UI (TUI)
npx @modelcontextprotocol/inspector --tui sfcc-logs-mcp
```

---

## 👨‍💻 Development & Contributing

```bash
# Clone the repository
git clone https://github.com/nabhat/sfcc-logs-mcp.git
cd sfcc-logs-mcp

# Install dependencies
npm install

# Run unit tests with Vitest & coverage
npm run test

# Lint the codebase
npm run lint

# Compile TypeScript
npm run build
```

---

## 📒 License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.