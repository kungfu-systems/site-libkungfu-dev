---
status: published-analysis
period: 2026-06-16/2026-08-01
theme: agent-mediated-engineering-output
doc_type: analysis
source_level: public-github-data
confidence: high
sensitivity: public
evidence_grade: A
review_state: self-reviewed
last_reviewed: 2026-08-17
---

# One human. Agents. Two thirty-day windows.

> The interactive version, charts, downloadable records, and machine-readable
> analysis are available at
> [libkungfu.dev/dogfood/parallel-runtime-paths](https://libkungfu.dev/dogfood/parallel-runtime-paths/).

## Summary

This is first-party analysis published by the Kungfu project. The underlying
records, collection code, and limitations are public so that the calculation
can be challenged independently.

This report compares public GitHub delivery from two Agent-runtime projects:
[Google AX](https://github.com/google/ax) and the public repositories in
[Kungfu Systems](https://github.com/kungfu-systems). Both projects treat durable
state, recovery, continuation, and inspection as runtime concerns. They are not
equivalent products, but their goals are close enough to make their visible
organization forms worth comparing.

The headline observation comes from one fixed 30-day operating window:

```text
2026-07-02 00:00 UTC through 2026-08-01 00:00 UTC

3,913 merged public PRs under Kungfu's primary accountable account
   52 merged public PRs from all four visible Google AX accounts combined
3,913 / 52 = 75.25
```

Rounded to the nearest whole number, that is **75x more merged public PRs** from
one primary Kungfu account than from the complete visible AX team in the same
calendar window.

This is a public responsibility-throughput anomaly. It is **not** a claim of
75x engineering productivity, 75x more features, 75x higher quality, or 75x
more valuable work.

## What is being compared

The scopes preserve the two organization forms that actually produced the
public records:

- **Google AX:** one professional Agent-runtime repository with every visible
  PR author account included.
- **Kungfu:** one human directing Agents across the complete public product,
  protocol, build, release, site, and publication system. One GitHub account is
  responsible for more than 96% of its merged PRs in the operating window.

Reducing Kungfu to one repository would omit the release and maintenance work
that the same human-Agent system had to carry. Reducing AX to its leading
author would overstate the contrast. The headline therefore compares one
primary Kungfu responsibility identity with all visible AX responsibility
identities combined.

## The two observations

### Window 1: v4 bootstrap

The first strict 30-day window runs from `2026-06-16T00:00:00Z` through
`2026-07-16T00:00:00Z`.

| Public observation | Google AX | Kungfu Systems |
| --- | ---: | ---: |
| Merged PRs | 102 | 2,323 |
| PR author accounts | 5 | 3 |
| Active repositories | 1 | 11 |
| Active merge days | 21 | 18 |
| Median gross changed lines per PR | 141 | 124 |

Kungfu v4 engineering began on June 16, but systematic PR-mediated settlement
did not begin until June 29. The record contains 99 default-branch commits over
12 active days before that boundary. Those commits are not converted into
synthetic PRs. This window preserves the bootstrap history, but it is not used
as a steady-state efficiency measure.

### Window 2: Buildchain operating

The second strict 30-day window runs from `2026-07-02T00:00:00Z` through
`2026-08-01T00:00:00Z`, after PR-mediated settlement is already operating.

| Public observation | Google AX | Kungfu Systems |
| --- | ---: | ---: |
| Merged PRs | 52 | 4,065 |
| PR author accounts | 4 | 4 |
| Active repositories | 1 | 16 |
| Active merge days | 15 | 30 |
| Median gross changed lines per PR | 92 | 106 |

Within the Kungfu total, the primary account carried 3,913 merged PRs, or
96.26% of the observed total. Its median gross change size was 119 lines per
PR, compared with 92 lines across all AX PRs. This stress check does not make
the PRs equivalent, but it does show that the count gap is not explained by a
lower Kungfu median change size.

Two ratios answer different questions:

- `4,065 / 52 = 78.17`: complete public Kungfu system versus complete visible
  AX team.
- `3,913 / 52 = 75.25`: one primary Kungfu responsibility account versus the
  complete visible AX team. This is the more conservative headline ratio.

## Evidence of Agent participation

This is not a comparison between one project that uses Agents and another that
does not.

The AX default-branch history before the cutoff contains seven commits with an
explicit Gemini Code Assist co-author marker. The Kungfu v4 history from June
16 through August 1 contains 135 uniquely attributed commits: 78 Codex, 34
Claude, 21 Cursor, and 2 Amp.

These markers prove that some Agent participation is publicly observable in
both histories. They do not prove Agent authorship of every change, autonomous
operation, equal Agent usage, or that Agent mediation alone caused the output
gap.

## What the result does not prove

The following boundaries are part of the result, not footnotes to it:

1. A merged PR is a public work item, not a feature, quality, maturity, labor,
   or value unit.
2. Google internal work and every other form of private work are outside the
   dataset.
3. AX is measured as one product repository. Kungfu is measured as the public
   multi-repository system carried by the same operating organization.
4. GitHub author accounts are public responsibility identities. They do not
   establish employment roles, labor hours, or individual authorship of every
   line.
5. Kungfu PRs act as settlement objects, while AX PRs follow a conventional
   contribution workflow. The units are not interchangeable features.
6. Gross line and file counts can include generated files, vendored material,
   formatting, and repeated edits.
7. Different review, merge, and PR-splitting disciplines remain a confounder.

The defensible conclusion is therefore narrow: during the fixed operating
window, one accountable human identity in the Kungfu system carried a radically
larger visible engineering and settlement surface than the complete visible
team of another professional Agent-runtime project. The public record does not,
by itself, identify a single cause.

## Reproduce the observation

The collector uses these exact GitHub Search scopes:

```text
repo:google/ax is:pr is:merged merged:2026-06-16T00:00:00Z..2026-07-15T23:59:59Z
org:kungfu-systems is:public is:pr is:merged merged:2026-06-16T00:00:00Z..2026-07-15T23:59:59Z

repo:google/ax is:pr is:merged merged:2026-07-02T00:00:00Z..2026-07-31T23:59:59Z
org:kungfu-systems is:public is:pr is:merged merged:2026-07-02T00:00:00Z..2026-07-31T23:59:59Z
```

From this repository, run:

```bash
node scripts/collect-agent-output-comparison.mjs --window bootstrap
node scripts/collect-agent-output-comparison.mjs --window operating
node scripts/check-agent-output-comparison.mjs
node scripts/check-agent-output-comparison.mjs \
  src/fixtures/agent-output-comparison-operating.snapshot.json
```

The checked-in snapshots are bound by these SHA-256 digests:

```text
d355600f62371bec3b87e76974d0c449405037c8a50552f34c14a9ee5229ef29  agent-output-comparison.snapshot.json
abb6711e92f731e03fab3bca1bad5cdb686fa1d3295b42bff956d2dddba7c58e  agent-output-comparison-operating.snapshot.json
```

Repository evidence:

- [Collector source](../../scripts/collect-agent-output-comparison.mjs)
- [Comparison checks](../../scripts/check-agent-output-comparison.mjs)
- [Bootstrap snapshot](../../src/fixtures/agent-output-comparison.snapshot.json)
- [Operating snapshot](../../src/fixtures/agent-output-comparison-operating.snapshot.json)
- [Editorial framing and pinned source authorities](../../src/fixtures/agent-runtime-comparison.json)

Public evidence:

- [Interactive comparison and charts](https://libkungfu.dev/dogfood/parallel-runtime-paths/)
- [Machine-readable analysis](https://libkungfu.dev/dogfood/parallel-runtime-paths.json)
- [Complete bootstrap records](https://libkungfu.dev/dogfood/agent-output-comparison-data.json)
- [Complete operating records](https://libkungfu.dev/dogfood/agent-output-comparison-operating-data.json)
- [Bootstrap SHA-256](https://libkungfu.dev/dogfood/agent-output-comparison-data.json.sha256)
- [Operating SHA-256](https://libkungfu.dev/dogfood/agent-output-comparison-operating-data.json.sha256)

The records are published so that readers can reject the headline metric,
define a different unit, remove categories they consider inappropriate, or
test whether another explanation fits the same public history better.
