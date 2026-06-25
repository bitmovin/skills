#!/usr/bin/env -S npx tsx
/**
 * cli.ts — the agent↔script handoff surface for the ad-ops report skill.
 *
 * The agent assembles a JSON payload from `queryTotal` / `queryGroupBy`
 * results, pipes it to a command here, and reads structured JSON back.
 * Scripts return numbers and classifications only — the agent decides what to
 * say in the report.
 *
 *   echo '<json>' | npx tsx cli.ts <command>
 *
 * Commands and their stdin shapes:
 *
 *   funnel          {
 *                     stages: [{name, count}, ...]  // 6 stages in canonical order:
 *                                                   // impressions, starts, q1, midpoint, q3, completions
 *                     clicks?: number | null,
 *                     skips?:  number | null,
 *                     beaconMissingRatio?: number   // default 0.01
 *                   }
 *
 *   pareto          {
 *                     entries: [{key, value}, ...],  // non-negative values
 *                     topN?: number,                  // default 5
 *                     threshold?: number              // default 0.8
 *                   }
 *
 *   anomaly-flags   {
 *                     funnel: FunnelResult,           // output of `funnel`
 *                     errors?: { topCodeShare?, topCode?, errorPercentage? },
 *                     concentration?: { topAdvertiserShare?, topAdvertiser? },
 *                     latency?: { p95Ms? },
 *                     thresholds?: { ... }            // overrides; see types.ts
 *                   }
 *
 *   sample-gate     { n, minN?, eventCount?, minExpected? }
 */

import { buildFunnel } from "./funnel.js";
import { pareto } from "./pareto.js";
import { anomalyFlags } from "./anomaly-flags.js";
import { sampleSizeAdequate } from "./sample-gate.js";

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
    case "funnel":
      out = buildFunnel(p);
      break;
    case "pareto":
      out = pareto(p);
      break;
    case "anomaly-flags":
      out = anomalyFlags(p);
      break;
    case "sample-gate":
      out = sampleSizeAdequate(p.n, {
        minN: p.minN,
        eventCount: p.eventCount,
        minExpected: p.minExpected,
      });
      break;
    default:
      fail(`unknown command "${cmd}"`);
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => fail((e as Error).message));
