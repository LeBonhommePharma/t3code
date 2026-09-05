import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { glueSession, loadConfig } from "./lib.mjs";

function sessionsPath(stateDir) {
  return join(stateDir, "sessions.json");
}

export function readSessions(stateDir) {
  const file = sessionsPath(stateDir);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSessions(stateDir, sessions) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(sessionsPath(stateDir), `${JSON.stringify(sessions, null, 2)}\n`);
}

export function startSession(input) {
  const config = loadConfig(input.config);
  const session = glueSession({
    sessionId: input.sessionId ?? randomUUID(),
    armId: input.armId,
    pdb: input.pdb,
    metricLane: input.metricLane,
    flexaidds: config.flexaidds,
    results: config.results,
    artifacts: config.artifacts,
    createdAt: new Date().toISOString(),
  });
  const sessions = readSessions(config.stateDir);
  sessions.push(session);
  writeSessions(config.stateDir, sessions);
  return session;
}
