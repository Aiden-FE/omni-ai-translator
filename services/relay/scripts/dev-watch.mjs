// Relay 本地开发启动器：先完整编译，再并行运行 tsc watch 与 node watch。
//
// 不能用 tsx 直接运行 Nest 源码：tsx/esbuild 不支持 emitDecoratorMetadata，
// Nest DI 会丢失构造参数元数据。这里保留 TypeScript 编译器语义：
// tsc 负责增量编译，node --watch 负责在 dist 变化后重启服务。
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

const initialBuild = spawnSync(
  process.execPath,
  [tsc, '-p', 'tsconfig.build.json'],
  { stdio: 'inherit' },
);
if (initialBuild.error) {
  console.error(`relay dev: initial build failed: ${initialBuild.error.message}`);
  process.exit(1);
}
if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

let shuttingDown = false;
const children = [
  spawn(
    process.execPath,
    [tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
    { stdio: 'inherit' },
  ),
  spawn(
    process.execPath,
    ['--watch', '--watch-preserve-output', 'dist/main.js'],
    { stdio: 'inherit' },
  ),
];

function stopChildren() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren();
    process.exit(0);
  });
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    stopChildren();
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
