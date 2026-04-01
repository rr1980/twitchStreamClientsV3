import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const coverageFilePath = resolve('coverage', 'twitchStreamClientsV3', 'coverage-final.json');

const thresholds = {
  statements: 94,
  branches: 92,
  functions: 89,
};

const report = JSON.parse(readFileSync(coverageFilePath, 'utf8'));

const totals = {
  statements: { covered: 0, total: 0 },
  branches: { covered: 0, total: 0 },
  functions: { covered: 0, total: 0 },
};

for (const fileCoverage of Object.values(report)) {
  accumulateCounter(totals.statements, fileCoverage.s);
  accumulateCounter(totals.functions, fileCoverage.f);

  for (const branchCounts of Object.values(fileCoverage.b)) {
    for (const count of branchCounts) {
      totals.branches.total += 1;

      if (count > 0) {
        totals.branches.covered += 1;
      }
    }
  }
}

const summary = Object.fromEntries(
  Object.entries(totals).map(([metric, counts]) => [
    metric,
    counts.total === 0 ? 100 : Number(((counts.covered / counts.total) * 100).toFixed(2)),
  ]),
);

const failures = Object.entries(thresholds)
  .filter(([metric, minimum]) => summary[metric] < minimum)
  .map(([metric, minimum]) => `${metric}: ${summary[metric]}% < ${minimum}%`);

console.log('Coverage summary');
for (const [metric, value] of Object.entries(summary)) {
  console.log(`- ${metric}: ${value}%`);
}

if (failures.length > 0) {
  console.error('\nCoverage thresholds failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log('\nCoverage thresholds satisfied.');

function accumulateCounter(target, counter) {
  for (const count of Object.values(counter)) {
    target.total += 1;

    if (count > 0) {
      target.covered += 1;
    }
  }
}