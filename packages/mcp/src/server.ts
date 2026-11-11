#!/usr/bin/env node
/**
 * Runs the RatesSpot MCP server over stdio, for Claude Desktop, Claude Code
 * and other MCP clients that start local servers.
 *
 *   RATESSPOT_API_KEY=rs_live_sk_…  node src/server.ts
 *
 * RATESSPOT_API_URL defaults to https://api.ratesspot.com. The key decides
 * which business the agent works on and what it may do (its scopes).
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createRatesSpotMcp } from "./tools.ts";

const apiKey = process.env["RATESSPOT_API_KEY"];
if (!apiKey) {
  console.error("Set RATESSPOT_API_KEY to a RatesSpot secret key (dashboard → API keys).");
  process.exit(1);
}

const server = createRatesSpotMcp({ baseUrl: process.env["RATESSPOT_API_URL"] ?? "https://api.ratesspot.com", apiKey });
await server.connect(new StdioServerTransport());
// stdout carries the protocol, so anything for people goes to stderr.
console.error("RatesSpot MCP server running on stdio.");
