import { resolve } from 'path';
import { createServer } from 'vite';

const configPath = resolve(process.cwd(), 'vitest.config.ts');

async function main() {
  const server = await createServer({
    configFile: configPath,
    mode: 'test',
  });
  const { run } = await import('vitest/node');
  await run([
    'shared/fullpage/segmenter.test.ts',
    'shared/fullpage/translate-pool.test.ts',
  ]);
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
