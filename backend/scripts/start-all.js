'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const children = new Map();
const childSpecs = [
  { name: 'api', entry: path.resolve(__dirname, '../dist/src/server.js') },
  { name: 'worker', entry: path.resolve(__dirname, '../dist/src/worker.js') },
];

let shuttingDown = false;
let exitCode = 0;
let shutdownTimer;

function isRunning(child) {
  return !child.exited;
}

function finishIfStopped() {
  if (shuttingDown && [...children.values()].every((state) => !isRunning(state))) {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    process.exitCode = exitCode;
  }
}

function stopAll(reason, code, signal = 'SIGTERM') {
  if (shuttingDown) {
    if (code !== 0) exitCode = code;
    return;
  }

  shuttingDown = true;
  exitCode = code;
  console.log(`[start:all] ${reason}; sending ${signal} to child processes`);

  for (const state of children.values()) {
    if (isRunning(state)) state.child.kill(signal);
  }

  shutdownTimer = setTimeout(() => {
    console.error('[start:all] Graceful shutdown timed out; sending SIGKILL');
    for (const state of children.values()) {
      if (isRunning(state)) state.child.kill('SIGKILL');
    }
    setTimeout(() => process.exit(1), 1_000).unref();
  }, 20_000);
  shutdownTimer.unref();
  finishIfStopped();
}

for (const spec of childSpecs) {
  console.log(`[start:all] Starting ${spec.name}: node ${spec.entry}`);
  const child = spawn(process.execPath, [spec.entry], {
    stdio: 'inherit',
    env: process.env,
  });
  const state = { child, spec, exited: false };
  children.set(spec.name, state);

  child.on('error', (error) => {
    state.exited = true;
    console.error(`[start:all] Failed to start ${spec.name}: ${error.message}`);
    stopAll(`${spec.name} process could not start`, 1);
    finishIfStopped();
  });

  child.on('exit', (code, signal) => {
    state.exited = true;
    console.log(`[start:all] ${spec.name} exited (code=${code}, signal=${signal})`);
    if (!shuttingDown) {
      stopAll(`${spec.name} exited unexpectedly`, 1);
    } else if (code !== 0 && signal === null) {
      exitCode = 1;
    }
    finishIfStopped();
  });
}

process.on('SIGTERM', () => stopAll('Received SIGTERM', 0));
process.on('SIGINT', () => stopAll('Received SIGINT', 0));
