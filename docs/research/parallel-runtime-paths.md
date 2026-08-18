# One human. Agents. 3,913 merged PRs in 30 days.

## Summary

From July 2 through August 1, 2026, one primary account carried **3,913 merged
public PRs** while one human directed Agents across the Kungfu system. The
complete public system recorded 4,065 merged PRs across 16 repositories.

In the same fixed 30-day window, all four visible author accounts in
[Google AX](https://github.com/google/ax) merged 52 PRs. The primary Kungfu
account therefore carried **75.25x** as many merged public PRs as the complete
visible AX team.

OpenAI provides a second reference point. Its
[Harness engineering](https://openai.com/index/harness-engineering/) article
reports roughly 1,500 opened and merged PRs over five months with a small team
of three engineers driving Codex; the team had grown to seven by publication.
Kungfu's primary-account count in 30 days is about **2.6x** that reported
five-month total. The complete Kungfu count is about **2.7x**.

This report publishes the records, collector, checks, and source boundaries
behind those observations. The interpretation boundaries are collected at the
end so the evidence can be read first.

> Explore the interactive charts, downloadable records, and machine-readable
> analysis at
> [libkungfu.dev/dogfood/parallel-runtime-paths](https://libkungfu.dev/dogfood/parallel-runtime-paths/).

The fixed-window calculation is:

```text
2026-07-02 00:00 UTC through 2026-08-01 00:00 UTC

3,913 merged public PRs under Kungfu's primary accountable account
   52 merged public PRs from all four visible Google AX accounts combined
3,913 / 52 = 75.25
```

Rounded to the nearest whole number, the same-window Google AX comparison is
**75x**.

## Three systems and two evidence classes

| System | Evidence | Observation window | Responsibility surface | Merged PRs |
| --- | --- | --- | --- | ---: |
| Google AX | Reproducible public GitHub records | `2026-07-02` through `2026-08-01` | One public repository; four visible author accounts | 52 |
| OpenAI Harness engineering | Official OpenAI first-party report | About five months after the first commit in late August 2025 | One non-public repository; three engineers driving Codex, seven by publication | About 1,500 |
| Kungfu Systems | Reproducible public GitHub records | `2026-07-02` through `2026-08-01` | Sixteen public repositories; one primary account carried 96.26% | 4,065 total; 3,913 primary |

The Google coordinate answers a strict same-window public-data question. The
OpenAI coordinate answers a different question: how the Kungfu record compares
with one of the strongest publicly described examples of an Agent-first
engineering organization.

## What is being compared

The scopes preserve the organization forms that produced each observation:

- **Google AX:** one professional Agent-runtime repository with every visible
  PR author account included.
- **Kungfu:** one human directing Agents across the complete public product,
  protocol, build, release, site, and publication system. One GitHub account is
  responsible for more than 96% of its merged PRs in the operating window.
- **OpenAI Harness engineering:** a non-public, single-repository product built
  under a no-manually-written-code constraint. OpenAI reports that three
  engineers drove Codex, that the team had grown to seven by publication, and
  that roughly 1,500 PRs were opened and merged over five months.

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
12 active days before that boundary. Those commits remain commits rather than
synthetic PRs. This window preserves the bootstrap history; the operating
window below supplies the headline comparison.

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
PR, compared with 92 lines across all AX PRs. The count gap therefore coexists
with a higher Kungfu median gross change size in this window.

Two ratios answer different questions:

- `4,065 / 52 = 78.17`: complete public Kungfu system versus complete visible
  AX team.
- `3,913 / 52 = 75.25`: one primary Kungfu responsibility account versus the
  complete visible AX team. This is the more conservative headline ratio.

## Evidence of Agent participation

Agent participation is directly visible or explicitly reported in all three
systems.

The AX default-branch history before the cutoff contains seven commits with an
explicit Gemini Code Assist co-author marker. The Kungfu v4 history from June
16 through August 1 contains 135 uniquely attributed commits: 78 Codex, 34
Claude, 21 Cursor, and 2 Amp.

These markers make Agent participation publicly observable in both histories.

OpenAI's evidence is explicit but different: the company states that Codex
wrote every line in the repository and that humans never directly contributed
code. Its article also reports roughly one million lines and hundreds of
internal users.

## What this establishes

The exact public-data comparison shows one accountable Kungfu identity carrying
a radically larger visible engineering and settlement surface than the complete
visible Google AX team in the same 30-day window.

The OpenAI report supplies a second scale coordinate: Kungfu's primary-account
count in one month exceeds OpenAI's reported total for five months. Together,
the two references establish that the Kungfu record is unusual enough to demand
an explanation of the operating system behind it.

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

- [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/)
- [Interactive comparison and charts](https://libkungfu.dev/dogfood/parallel-runtime-paths/)
- [Machine-readable analysis](https://libkungfu.dev/dogfood/parallel-runtime-paths.json)
- [Complete bootstrap records](https://libkungfu.dev/dogfood/agent-output-comparison-data.json)
- [Complete operating records](https://libkungfu.dev/dogfood/agent-output-comparison-operating-data.json)
- [Bootstrap SHA-256](https://libkungfu.dev/dogfood/agent-output-comparison-data.json.sha256)
- [Operating SHA-256](https://libkungfu.dev/dogfood/agent-output-comparison-operating-data.json.sha256)

The records are published so that readers can reject the headline metric,
define a different unit, remove categories they consider inappropriate, or
test whether another explanation fits the same public history better.

## Interpretation boundaries

This is first-party analysis published by the Kungfu project. These boundaries
apply to every number and comparison above:

1. A merged PR is a public work item, not a feature, quality, maturity, labor,
   productivity, or value unit.
2. Google AX and Kungfu use reproducible public GitHub records. OpenAI's figures
   are approximate first-party disclosures from a non-public repository; the
   linked OpenAI article is their authority.
3. The OpenAI repository's exact PR records, dates, author distribution, and
   matching 30-day slice are unavailable. The `2.6x` and `2.7x` figures are raw
   contextual ratios rather than normalized productivity measures.
4. Google internal work and every other form of non-public work are outside the
   reproducible dataset.
5. AX is measured as one public product repository. Kungfu is measured as the
   16-repository public system carried by the same operating organization.
6. GitHub author accounts are public responsibility identities. They do not
   establish employment roles, labor hours, or individual authorship of every
   line.
7. Kungfu PRs act as settlement objects, while AX PRs follow a conventional
   contribution workflow. Review, merge, and PR-splitting disciplines differ.
8. Agent markers establish observable participation in part of the AX and
   Kungfu histories. They do not establish Agent authorship of every change,
   equal Agent usage, autonomous operation, or a single cause for the gap.
9. Gross line and file counts can include generated files, vendored material,
   formatting, and repeated edits.
10. OpenAI reports hundreds of internal users for its product. This report does
    not claim equivalent adoption, product maturity, or user value for Kungfu.
11. The observations establish an unusual public throughput pattern. They do
    not establish that Kungfu is superior, that the work units are equivalent,
    or that any one mechanism caused the difference.
