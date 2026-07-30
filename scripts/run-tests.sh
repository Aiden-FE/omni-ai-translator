#!/bin/bash
exec "$AI_DEVFLOW_WORKTREE/.toolchain/node-v22.12.0-darwin-x64/bin/node" "$AI_DEVFLOW_WORKTREE/node_modules/vitest/vitest.mjs" run "$@"
