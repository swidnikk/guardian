# Guardian Policy Manifest Specification

> **Audience**: policy contributors and methodology authors adding or updating a policy in the Guardian Methodology Library.
> [See PRD for additional context](../docs/community-and-contributing/community-standards/rfcs/policy_manifest_prd.md).
> **Schema**: [policy.schema.json](./policy.schema.json)

---

## Quick start — minimal valid `policy.yml`

Drop this file alongside your `.policy` bundle. Fill in the required fields; all others are optional.

```yaml
id: my-policy-slug          # kebab-case, globally unique, stable
name: My Policy Name        # human-readable display name
version: "1.0.0"            # semver of this Guardian implementation
description: >
  One-to-three sentences explaining what this policy does and
  which upstream methodology it implements.
policy_type: standard-implementation   # see policy_type guide below
status: active                         # draft | candidate | active | deprecated | superseded
license: Apache-2.0                    # SPDX identifier
category: carbon-credits               # see category enum below
authors:
  - name: Your Organization
tags:
  - your-tag
  - another-tag
```

That is the complete minimum. Everything else is optional but strongly encouraged for published policies.

---

## One manifest per directory

A policy directory holds exactly one `policy.yml`. That file describes the one policy the directory contains, including all of its versions and variants (for example a methodology's v1 and v2 bundles, or regional or language variants of the same methodology). Versions and variants of one methodology are **not** separate policies: record them with `version` and `methodology_version`, and keep a single `policy.yml`.

**Exception: a directory that holds several distinct policies.** If one directory holds `.policy` bundles that implement different methodologies (different `methodology_id`, or no shared upstream methodology), each distinct policy gets its own sidecar named `policy.<slug>.yml`:

```
Greenhouse Gas (GHG)/Korean Fixed Combustion/
  policy.gaseous-fuel.yml
  policy.liquid-fuel.yml
  policy.solid-fuel.yml
```

Rules for the exception:

- `<slug>` is kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) and unique within the directory. It names the policy within the directory; it does not have to equal `id`.
- A `policy.<slug>.yml` follows exactly the same schema and content rules as `policy.yml`. The `id` is still required, globally unique and permanent.
- Do not mix the two forms: a directory has either one `policy.yml` or two or more `policy.<slug>.yml` files, never both.
- Do not use the exception to split versions or variants of one methodology. New contributions should still prefer one directory per policy.
- Existing files are never renamed to make this work. The manifests are sidecars.

---

## Field reference

### Required fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Kebab-case unique slug. Must be stable across versions — never change once published. | `verra-vm0007-redd-plus` |
| `name` | string | Human-readable display name (3–120 chars). | `Verra VM0007 REDD+ Methodology Framework` |
| `version` | string | Semver of this Guardian implementation. See [versioning](#versioning-convention). | `3.0.0` |
| `description` | string | 1–3 sentence plain-English summary (20–600 chars). | |
| `policy_type` | enum | See [policy_type guide](#policy_type-guide). | `standard-implementation` |
| `status` | enum | `draft` \| `candidate` \| `active` \| `deprecated` \| `superseded` | `active` |
| `license` | string | SPDX license identifier. | `Apache-2.0` |
| `category` | enum | `carbon-credits` \| `emission-reporting` \| `renewable-energy` \| `supply-chain` \| `sustainable-agriculture` \| `water` \| `biodiversity` \| `waste` \| `other` | `carbon-credits` |
| `authors` | array | One or more `{name, url?, type?, github?}` objects. | See below |
| `tags` | array | Lowercase-hyphenated strings. See [TAG_TAXONOMY.md](./TAG_TAXONOMY.md). | `[verra, redd-plus, forest]` |

### Optional fields (strongly recommended for active policies)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `category_note` | string | **Required when `category: other`.** Short label for the actual category — used to identify candidates for future enum promotion. | `parametric insurance` |
| `policy_type_note` | string | **Required when `policy_type: other`.** Short label for the actual policy type — used to identify candidates for future enum promotion. | `registry bridge` |
| `standard_body` | string | Standards organization owning the upstream methodology. | `Verra` |
| `methodology_id` | string | Upstream methodology identifier. | `VM0007` |
| `methodology_version` | string | Upstream version verbatim. | `7.0` |
| `token_type` | string | Token symbol minted by this policy. | `VCU` |
| `token_standard` | enum | `fungible` \| `HIP-412-NFT` \| `none` | `fungible` |
| `registry_status` | enum | `none` \| `pending` \| `validated` \| `revoked` | `validated` |
| `registry_body` | string | Registry that validated (when `registry_status: validated`). | `Verra` |
| `registry_reference` | string | Formal registry reference number. | `VCS-1234` |
| `registry_accepted_date` | string | ISO 8601 date of registry acceptance. | `2024-03-15` |
| `sdg_alignment` | array | UN SDG numbers 1–17. | `[13, 15]` |
| `sector` | string | `energy` \| `transport` \| `waste` \| `land-use` \| `industrial` \| `agriculture` \| `water` \| `other` | `land-use` |
| `guardian_version_min` | string | Minimum Guardian platform version required. | `2.20.0` |
| `roles` | array | Role name strings defined in the workflow. | `["Admin", "Project Proponent", "VVB"]` |
| `dependencies` | array | `{id, version_min?}` — other Guardian module IDs required. | |
| `supersedes` | string \| null | ID of the policy this replaces. | `gold-standard-mecd-v1` |
| `superseded_by` | string \| null | ID of policy that replaces this one. | |
| `resources` | array | External links. See [resources array](#resources-array). | |
| `contributors` | array | `{name, url?, type?, github?}` contributors beyond primary authors. | |
| `maintainers` | array | `{name, email?, url?}` current maintainers. | |
| `thumbnail` | string | Relative path to thumbnail image. See [thumbnails](#thumbnail-conventions). | `assets/thumbnail.png` |
| `homepage` | string | Upstream methodology or project homepage URL. | |
| `support` | string | Support URL or email address. | |

---

## `policy_type` guide

| Value | Use when... | Examples |
|-------|-------------|---------|
| `standard-implementation` | The policy faithfully implements a published methodology from a recognized standards body (Verra, Gold Standard, CDM, etc.). The methodology_id and standard_body fields should always be populated. | VM0007 REDD+, GS MECD, CDM AMS-III.BA |
| `novel-methodology` | The policy implements a new methodology not yet (or not fully) covered by an external standard, or a hybrid/extension of existing methodologies. May or may not have a registry_status. | EUDR Pre-Check, MMCM combined methodology, LIP |
| `mrv-template` | A reusable skeleton or scaffolding policy for a class of MRV projects. Not a complete policy on its own — intended to be forked and parameterized. | DOVU MMCM, generic dMRV templates |
| `proof-of-concept` | An exploratory or demonstration policy, not intended for production use. Typically found in Hackathon/ or Work In Progress/. | Hackathon submissions |
| `toolkit` | A set of schemas, modules, or utilities that support policy development but do not constitute a stand-alone policy workflow. | Modules/, reusable schema packs |
| `other` | Does not fit any of the above. `policy_type_note` is required — describe the actual type in plain English. | |

---

## Status lifecycle

Policies move through the following states:

```
                              ┌─────────┐
              initial commit  │         │
         ─────────────────►   │  draft  │
                              │         │
                              └────┬────┘
                                   │ ready for review
                                   ▼
                           ┌────────────┐
                           │            │
                           │ candidate  │
                           │            │
                           └──────┬─────┘
                                  │ passes review / live on testnet
                                  ▼
                            ┌──────────┐
             ┌──────────────│          │──────────────────────────┐
             │   issues     │  active  │  newer version published  │
             │   found      │          │                           │
             ▼              └──────────┘                           ▼
      ┌────────────┐                                      ┌────────────────┐
      │            │                                      │                │
      │ deprecated │                                      │   superseded   │
      │            │                                      │                │
      └────────────┘                                      └────────────────┘
```

- **draft** — work in progress; schema may be incomplete.
- **candidate** — implementation complete and under review; suitable for testnet use.
- **active** — production-ready; approved for mainnet publication.
- **deprecated** — no longer recommended; kept for reference. Set `superseded_by` if a replacement exists.
- **superseded** — explicitly replaced by another policy. Set `superseded_by` to the new policy's `id`.

When a policy moves to `superseded`, set `superseded_by` in the old manifest and `supersedes` in the new one.

---

## Versioning convention

Two version fields serve different purposes:

| Field | Tracks | Example |
|-------|--------|---------|
| `version` | The Guardian **implementation** — policy file, schemas, workflow logic, bug fixes | `3.0.0` |
| `methodology_version` | The **upstream methodology** version as published by the standards body | `7.0` |

Increment `version` using standard semver rules:
- **Patch** (`x.y.Z`): bug fixes, documentation, minor schema corrections.
- **Minor** (`x.Y.0`): new roles, new optional fields, workflow improvements that are backward-compatible.
- **Major** (`X.0.0`): breaking schema changes, workflow redesign, major methodology version bump.

`methodology_version` is copied verbatim from the upstream standard (e.g., `"7.0"` for VM0007 v7, `"2.0"` for MECD v2.0). It does not follow semver; it mirrors whatever the standard body publishes.

---

## Publication records

`policy.yml` describes what a policy **is**: identity, version, classification, ownership. It does not record Hedera publications. A publication is an **event** (one publish action, on one network, at one moment), so events live in a separate file, `publications.json`, beside `policy.yml`.

| File | Contains | Who writes it |
|---|---|---|
| `policy.yml` | Properties of the policy | Policy author, reviewed in a PR |
| `publications.json` | Append-only log of publication events | The `record-publication` script only. Never edit by hand |

There is deliberately no `hedera_timestamp` field in `policy.yml`. A timestamp identifies one message on one network, so a single scalar cannot say which network or version it belongs to, and it would duplicate the latest log entry. Tooling that needs "the latest mainnet publication" computes it from `publications.json`.

### `publications.json`

```json
{
  "policy_id": "verra-vm0007-redd-plus",
  "entries": [
    {
      "network": "testnet",
      "version": "1.0.0",
      "hedera_timestamp": "1707207018.434778003",
      "hedera_topic_id": "0.0.2672416"
    },
    {
      "network": "testnet",
      "version": "2.0.0",
      "hedera_timestamp": "1707207149.487956003",
      "hedera_topic_id": "0.0.2672435"
    },
    {
      "network": "testnet",
      "version": "3.0.0",
      "hedera_timestamp": "1707207286.119377003",
      "hedera_topic_id": "0.0.2672443"
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `policy_id` | yes | The `id` in the sibling `policy.yml`. |
| `entries[].network` | yes | `mainnet` or `testnet`. A timestamp exists on exactly one network, so this is always explicit. |
| `entries[].hedera_timestamp` | yes | Consensus timestamp of the Guardian publish message, as a string matching `^[0-9]+\.[0-9]+$`. Keep it quoted: it is not a number. |
| `entries[].version` | no | Policy version in the publish message. Filled in by the script. |
| `entries[].hedera_topic_id` | no | Instance topic of that publication. Each publish creates a new one. Filled in by the script. |

The publication time is the consensus timestamp itself, so there is no separate `recorded_at`.

### Directories with several policies

A directory that uses `policy.<slug>.yml` (see [One manifest per directory](#one-manifest-per-directory)) keeps one log per policy, named `publications.<slug>.json` beside its manifest, with the same `<slug>`:

| Manifest | Log |
|---|---|
| `policy.yml` | `publications.json` |
| `policy.<slug>.yml` | `publications.<slug>.json` |

The `policy_id` in `publications.<slug>.json` must equal the `id` in `policy.<slug>.yml`. The file format is unchanged.

The script takes `--manifest <file>` (default `policy.yml`; it must be a bare file name matching `policy.yml` or `policy.<slug>.yml`, not a path) and derives the log name from it. In a directory with several manifests it needs `--manifest` to record, and refuses rather than guess; `--check` without `--manifest` checks every manifest's log:

```bash
node scripts/record-publication.js \
  --dir "Greenhouse Gas (GHG)/Korean Fixed Combustion" \
  --manifest policy.gaseous-fuel.yml \
  --network testnet \
  --hedera-timestamp 1707207286.119377003
```

Logs are still written only by the script, never by hand.

### Recording a publication

After publishing in Guardian, run from the Methodology Library root:

```bash
node scripts/record-publication.js \
  --dir "Verra/Verified Carbon Standard (VCS)/VM0007" \
  --network testnet \
  --hedera-timestamp 1707207286.119377003
```

The script looks the timestamp up on the mirror node for the network you name:

- mainnet: `https://mainnet-public.mirrornode.hedera.com/api/v1/topics/messages/<timestamp>`
- testnet: `https://testnet.mirrornode.hedera.com/api/v1/topics/messages/<timestamp>`

It refuses to record the entry unless the message exists on that network and is a Guardian `publish-policy` message. It then reads `version` and the topic id from the message and appends the entry. Re-recording a timestamp already in the log is a no-op. `--check` re-verifies every entry in the log without writing. A directory with a single manifest needs no `--manifest`.

### Where publications show up

A policy whose log has no `mainnet` entry has never been published to production. Catalog tooling shows that as the absence of a "Live on mainnet" badge. A missing log means no publication is recorded, not that none exists.

---

## Resources array

Link to external references that help users understand or verify the policy:

```yaml
resources:
  - type: methodology
    label: "Verra VM0007 REDD+ Methodology Framework"
    url: "https://verra.org/methodologies/vm0007-redd-methodology-framework-redd-mf/"
  - type: demo-guide
    label: "Guardian Demo Guide — Verra REDD+"
    url: "https://docs.hedera.com/guardian/guardian/demo-guide/carbon-offsets/verra-redd+-demo-guide"
  - type: research
    label: "Berkeley Cookstove Overcrediting Study (2023)"
    url: "https://assets.researchsquare.com/files/rs-2606020/v1/c2e6a772-b013-49f9-9fc4-8d7d82d4bebc.pdf"
```

Allowed `type` values: `methodology`, `regulation`, `research`, `demo-guide`, `api-docs`, `tool`, `dataset`, `other`.

---

## Thumbnail conventions

- Place the thumbnail in an `assets/` subdirectory next to `policy.yml`. The path is relative to the manifest that references it; in a directory with several `policy.<slug>.yml` files, use distinct filenames (for example `assets/gaseous-fuel-thumbnail.png`).
- Reference it as a relative path: `thumbnail: assets/thumbnail.png`
- Recommended dimensions: **400 × 300 px** (4:3 ratio).
- Accepted formats: PNG (preferred) or JPEG.
- Maximum file size: 200 KB.
- If `thumbnail` is omitted, the catalog falls back to a generated icon based on `category` and `policy_type`.

---

## Tag guidance

See [TAG_TAXONOMY.md](./TAG_TAXONOMY.md) for the full canonical tag list and naming rules.

Key rules:
- All tags must be lowercase and hyphenated: `redd-plus`, not `REDD+` or `redd_plus`.
- Include at least one standard-body tag if `standard_body` is set.
- Include at least one thematic tag.
- Include a geographic tag if the policy is region-specific.

---

## Validation

### Validate locally with AJV

Install the AJV CLI (requires Node.js 18+):

```bash
npm install -g ajv-cli ajv-formats
```

Validate a single manifest (`policy.yml` or `policy.<slug>.yml`):

```bash
# Convert YAML to JSON first (requires js-yaml or yq)
yq -o=json . path/to/policy.yml > /tmp/policy.json

# Validate against the schema
ajv validate \
  --spec=draft2020 \
  -c ajv-formats \
  -s "Methodology Library/policy.schema.json" \
  -d /tmp/policy.json
```

### Validate all manifests at once

```bash
find "Methodology Library" \( -name "policy.yml" -o -name "policy.*.yml" \) | while read f; do
  yq -o=json . "$f" > /tmp/policy.json
  echo -n "$f: "
  ajv validate --spec=draft2020 -c ajv-formats \
    -s "Methodology Library/policy.schema.json" \
    -d /tmp/policy.json 2>&1 | tail -1
done
```

### CI

A GitHub Actions workflow (`.github/workflows/validate-manifests.yml`) runs on pull requests (and manually) that touch `Methodology Library/**/policy.yml`, `Methodology Library/**/policy.*.yml`, `Methodology Library/**/publications*.json`, `policy.schema.json`, `publications.schema.json`, `TAG_TAXONOMY.md` or `scripts/**`. It:

- validates every `policy.yml` and `policy.<slug>.yml` against `policy.schema.json` (the commands above);
- fails if a directory holds both `policy.yml` and a `policy.<slug>.yml`, or if two manifests share an `id`;
- validates every `publications*.json` against `publications.schema.json`;
- runs the offline unit tests for `scripts/record-publication.js` (`node --test`);
- reports tags missing from `TAG_TAXONOMY.md` as `::warning` annotations.

Failures in these checks block merge; tag warnings do not. The last step runs `record-publication.js --check` for each directory that has a log. It asks the Hedera mirror nodes, so it is set to `continue-on-error`: an outage or a mismatch shows as a warning on the run and does not block merge.
