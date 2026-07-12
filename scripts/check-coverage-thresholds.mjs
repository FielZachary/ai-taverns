import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const enforce = process.argv.includes("--enforce");

const packageThresholds = [
  {
    name: "apps/api",
    summaryPath: "apps/api/coverage/coverage-summary.json",
    thresholds: {
      statements: 92,
      lines: 92,
      functions: 95,
      branches: 85
    }
  },
  {
    name: "apps/web",
    summaryPath: "apps/web/coverage/coverage-summary.json",
    thresholds: {
      statements: 16.5,
      lines: 16.5,
      functions: 23,
      branches: 18
    }
  },
  {
    name: "packages/contracts",
    summaryPath: "packages/contracts/coverage/coverage-summary.json",
    thresholds: {
      statements: 95,
      lines: 95,
      functions: 95,
      branches: 95
    }
  },
  {
    name: "packages/db",
    summaryPath: "packages/db/coverage/coverage-summary.json",
    thresholds: {
      statements: 25,
      lines: 25,
      functions: 30,
      branches: 35
    }
  },
  {
    name: "packages/dm",
    summaryPath: "packages/dm/coverage/coverage-summary.json",
    thresholds: {
      statements: 35,
      lines: 35,
      functions: 45,
      branches: 40
    }
  }
];

const metricNames = ["statements", "lines", "functions", "branches"];

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`;
}

async function readCoverageSummary(summaryPath) {
  const rawSummary = await readFile(summaryPath, "utf8");
  const summary = JSON.parse(rawSummary);

  if (!summary.total) {
    throw new Error(`Coverage summary at ${summaryPath} is missing a total section.`);
  }

  return summary.total;
}

function checkMetric(packageName, metricName, actual, minimum) {
  const passed = actual >= minimum;
  const label = passed ? "PASS" : "FAIL";

  return {
    passed,
    message: `${label} ${packageName} ${metricName}: ${formatPercent(actual)} >= ${formatPercent(minimum)}`
  };
}

let hasFailure = false;

for (const packageConfig of packageThresholds) {
  const summaryPath = path.resolve(packageConfig.summaryPath);
  let totalCoverage;

  try {
    totalCoverage = await readCoverageSummary(summaryPath);
  } catch (error) {
    hasFailure = true;
    console.error(`FAIL ${packageConfig.name}: could not read ${packageConfig.summaryPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    continue;
  }

  console.log(`\n${packageConfig.name}`);

  for (const metricName of metricNames) {
    const metric = totalCoverage[metricName];

    if (!metric || typeof metric.pct !== "number") {
      hasFailure = true;
      console.error(`FAIL ${packageConfig.name} ${metricName}: missing numeric coverage percentage.`);
      continue;
    }

    const result = checkMetric(
      packageConfig.name,
      metricName,
      metric.pct,
      packageConfig.thresholds[metricName]
    );

    if (!result.passed) {
      hasFailure = true;
    }

    console.log(result.message);
  }
}

if (hasFailure && enforce) {
  console.error("\nCoverage thresholds failed.");
  process.exit(1);
}

if (hasFailure) {
  console.warn("\nCoverage thresholds failed, but --enforce was not set.");
} else {
  console.log("\nCoverage thresholds passed.");
}
