#!/usr/bin/env -S npx tsx
/**
 * cli.ts — the agent↔script handoff surface.
 *
 * The agent assembles a small JSON payload from `query` / `queryGroupBy` /
 * `queryTotal` results, pipes it to a command here, and reads structured JSON
 * back. Scripts return numbers and classifications only — the agent makes the
 * call.
 *
 *   echo '<json>' | npx tsx cli.ts <command>
 *
 * Commands and their stdin shapes:
 *   decompose          { segments: SegmentObservation[], metricKind: "ratio"|"mean",
 *                        observed?: { m0?: number, m1?: number } }
 *   rank-percentile    { segments: SegmentObservation[] }
 *   detect-onset       { series: Bucket[], trailing?, k?, persistence? }
 *   two-proportion     { x0, n0, x1, n1, alpha? }
 *   welch              { mean0, sd0, n0, mean1, sd1, n1, alpha? }
 *   wilson             { x, n }
 *   sample-gate        { n, minN?, eventCount?, minExpected? }
 *   accumulate         { deltaTotal, drivers: Driver[], countMixDrivers? }
 *   loop-decision      { LoopState }
 */

import { decompose, rankPercentileHeuristic } from "./decompose.js";
import { detectOnset } from "./detect_onset.js";
import {
  twoProportionZTest,
  welchTTest,
  wilsonInterval,
  sampleSizeAdequate,
} from "./significance.js";
import { accumulate, loopDecision } from "./accounting.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) fail("usage: <json on stdin> | cli.ts <command>");
  const raw = (await readStdin()).trim();
  let p: any;
  try {
    p = raw ? JSON.parse(raw) : {};
  } catch (e) {
    fail(`invalid JSON on stdin: ${(e as Error).message}`);
  }

  let out: unknown;
  switch (cmd) {
    case "decompose":
      out = decompose(p.segments, p.metricKind, p.observed);
      break;
    case "rank-percentile":
      out = rankPercentileHeuristic(p.segments);
      break;
    case "detect-onset":
      out = detectOnset(p.series, p.trailing, p.k, p.persistence);
      break;
    case "two-proportion":
      out = twoProportionZTest(p.x0, p.n0, p.x1, p.n1, p.alpha);
      break;
    case "welch":
      out = welchTTest(p.mean0, p.sd0, p.n0, p.mean1, p.sd1, p.n1, p.alpha);
      break;
    case "wilson":
      out = wilsonInterval(p.x, p.n);
      break;
    case "sample-gate":
      out = sampleSizeAdequate(p.n, {
        minN: p.minN,
        eventCount: p.eventCount,
        minExpected: p.minExpected,
      });
      break;
    case "accumulate":
      out = accumulate(p.deltaTotal, p.drivers, {
        countMixDrivers: p.countMixDrivers,
      });
      break;
    case "loop-decision":
      out = loopDecision(p);
      break;
    default:
      fail(`unknown command "${cmd}"`);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => fail((e as Error).message));
