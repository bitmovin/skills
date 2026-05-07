#!/usr/bin/env node
import { run } from '../src/wizard.js';

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`\n[31merror:[0m ${err.message}\n`);
  process.exit(1);
});
