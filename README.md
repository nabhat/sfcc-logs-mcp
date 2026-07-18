# Salesforce Commerce Cloud (SFCC) Logs MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg)](https://nodejs.org/)
[![Platform: SFCC](https://img.shields.io/badge/Platform-%20SFCC%20Demandware-orange.svg)](https://www.salesforce.com/products/commerce-cloud/overview/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Supported-green.svg)](https://modelcontextprotocol.io/)

A robust, standardized Model Context Protocol (MCP) server that empowers AI coding agents (such as Claude Desktop, Cursor, or VSCode Copilot) to directly fetch, tail, and clean Salesforce Commerce Cloud (SFCC/Demandware) log files in real-time over standard I/O (stdio).

---

## ⚡ The Challenge This Server Solves

When developers work across **multiple SFCC instances**, configuring separate MCP servers for each instance/setup is clunky and impractical.

Typical MCP servers run globally with static environment configurations, makingit imposible to switch instances dynamically as you change project folders in your editor.

### 🌟 Our Solution: Dynamic Workspace Resolution

This MCP server implements a **Context-Aware Workspace Handshake**:
1. During initialization, the server intercepts the editor's active workspace folder path (`workspaceFolders` array) sent by the host (Claude. Cursor, etc.).
2. When a tool is invoked, the server walks up the directory tree *starting from the active conversation folder* to locate the corresponding **`dw.json`** or **`.env`** file.
3. It dynamically extracts the specific hostname, username, and password for **that specific project's instances** allowing seamless hot-swapping between different instances as you switch between sessions or projects.

---

### Installation
```bash
#Install globally
npm install -g @nabhat/sfcc-logs-mcp

```

---

## 📒 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.