import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

const ci = read(".github/workflows/ci.yml");
const autoUpdate = read(".github/workflows/auto-update-prs.yml");
const closeLinkedIssues = read(".github/workflows/close-linked-issues.yml");
const codeql = read(".github/workflows/codeql.yml");
const release = read(".github/workflows/release.yml");
const versionCut = read(".github/workflows/version-cut.yml");
const policyRevision =
  "qwts/playbook-engineering/.github/actions/ci-policy@4e70c773155c2c804e52a487352627010bea1897";

describe("governed CI lifecycle", () => {
  test("uses lifecycle triggers and PR-scoped cancellation", () => {
    expect(ci).toMatch(/^ {2}pull_request:$/mu);
    expect(ci).toMatch(/types: \[opened, synchronize, reopened, ready_for_review\]/u);
    expect(ci).toMatch(/^ {2}merge_group:\n {4}types: \[checks_requested\]$/mu);
    expect(ci).toMatch(/^ {2}push:\n {4}branches: \[main\]$/mu);
    expect(ci).toMatch(/^ {2}workflow_dispatch:$/mu);
    expect(ci).not.toMatch(/^ {2}(?:pull_request_target|repository_dispatch|schedule):$/mu);
    expect(ci).toMatch(/format\('pr-\{0\}', github\.event\.pull_request\.number\)/u);
    expect(ci).toMatch(/cancel-in-progress: \$\{\{ github\.event_name != 'push' \}\}/u);
  });

  test("gates direct entrypoints on the immutable actor and fork policy", () => {
    for (const workflow of [ci, autoUpdate, closeLinkedIssues, release, versionCut]) {
      expect(workflow).toContain(policyRevision);
    }
    for (const workflow of [autoUpdate, closeLinkedIssues, release, versionCut]) {
      expect(workflow).toMatch(/authorization-only: ["']true["']/u);
    }
    expect(ci).toMatch(/github\.event\.pull_request\.draft == false/u);
    expect(ci).toMatch(
      /^ {4}if: always\(\) && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false\)$/mu
    );
  });

  test("reuses only successful complete-suite evidence for the exact SHA", () => {
    expect(ci).toMatch(/event=workflow_dispatch&head_sha=\$TARGET_SHA/u);
    expect(ci).toContain('.display_title == "CI workflow_dispatch purpose=exact-sha-preflight"');
    expect(ci).toMatch(/event=merge_group&head_sha=\$GITHUB_SHA/u);
    expect(ci).toContain('.path == ".github/workflows/ci.yml"');
    expect(ci).toContain('.name == "CI" and .conclusion == "success"');
    expect(ci).toMatch(/needs\.preflight-evidence\.outputs\.validated != 'true'/u);
    expect(ci).toMatch(/needs\.merge-evidence\.outputs\.validated != 'true'/u);
  });

  test("preserves the complete suite, packaging, security, and stable CI gate", () => {
    for (const command of [
      "npm ci",
      "npm run ci",
      "node scripts/check-version-policy.mjs --built",
      "node scripts/package-release.mjs",
    ]) {
      expect(ci).toContain(command);
    }
    expect(ci).toMatch(/^ {2}complete:\n {4}name: Complete suite$/mu);
    expect(ci).toMatch(/^ {2}zizmor:\n {4}name: GitHub Actions security$/mu);
    expect(ci).toMatch(/^ {2}gate:\n {4}name: CI$/mu);
    expect(ci).toMatch(/name: Post-merge smoke/u);
  });

  test("runs governed Advanced CodeQL for both configured languages", () => {
    expect(codeql).toMatch(/^ {2}workflow_call:$/mu);
    expect(codeql).not.toMatch(/^ {2}(?:pull_request|push|workflow_dispatch|schedule):$/mu);
    expect(codeql).toMatch(/language: \[actions, javascript-typescript\]/u);
    expect(codeql).toMatch(/security-events: write/u);
    expect(ci).toMatch(/^ {2}codeql:\n {4}name: Advanced CodeQL$/mu);
    expect(ci).toMatch(/needs\.policy\.outputs\.run_post_merge == 'true'/u);
  });

  test("keeps ready branches current only through fail-closed chores-dumb writes", () => {
    expect(autoUpdate).toMatch(/^ {2}pull_request_target:$/mu);
    expect(autoUpdate).toMatch(/pull_request_target is safe here|never checks out PR code/u);
    expect(autoUpdate).toContain("pulls/$number/update-branch");
    expect(autoUpdate).toContain("expected_head_sha");
    expect(autoUpdate).toContain("dependabot/");
    expect(autoUpdate).toContain("changeset-release/");
    for (const workflow of [autoUpdate, versionCut]) {
      expect(workflow).toMatch(
        /secrets\.CHORES_DUMB_CLIENT_ID != '' && secrets\.CHORES_DUMB_PRIVATE_KEY != ''/u
      );
      expect(workflow).not.toMatch(/RELEASE_TOKEN|\|\| github\.token/u);
    }
  });
});

describe("workflow run selectors", () => {
  test("identify workflow runs by path rather than evaluated run-name", () => {
    const workflows = readdirSync(join(root, ".github/workflows"))
      .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
      .map((entry) => ({ entry, body: read(`.github/workflows/${entry}`) }));
    const offenders = workflows
      .filter(({ body }) =>
        body
          .split("workflow_runs[]")
          .slice(1)
          .some((rest) => /\.name\s*==/u.test(rest.split("'")[0] ?? ""))
      )
      .map(({ entry }) => entry);

    expect(offenders).toEqual([]);
  });
});
