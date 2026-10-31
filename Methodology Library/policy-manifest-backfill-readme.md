# Policy manifest backfill log

Working log for the sidecar `policy.yml` backfill (branch `swid/policy-manifest-backfill`). The workflow sheet is **Policy Manifest Backfill** (tabs `Policies`, `Required Fields`, `Optional Fields`). Spec: [MANIFEST_SPEC.md](./MANIFEST_SPEC.md). Design: [RFC 0001](../docs/community-and-contributing/community-standards/rfcs/policy_manifest_prd.md).

**Approach:** a minimal first pass (required fields only, plus optional fields that have clear evidence), then **flag anything uncertain for human review** rather than guessing. Nothing here renames or edits existing files; each manifest is one new `policy.yml` beside its policy.

**Maintained by the team lead only.** Teammates report `FLAG | folder | severity | field | issue | evidence` lines; the lead merges them below.

Severity: `blocker` (manifest invalid or misleading) · `review` (a human should decide) · `info`.

## Source of truth

The Google Sheet is **deprecated**. The exported `Policy Manifest Backfill.xlsx` in this folder (untracked, not yet committed) is the working copy and is edited by the lead. It is edited by patching the workbook XML, not with openpyxl, because openpyxl would delete the threaded comments, the assigned task and the drawings. Every edit asserts the cell's old value first. The original export is kept in the scratchpad.

## Decisions

| Decision | Detail |
|---|---|
| Sidecar only | One `policy.yml` per directory. No folder renames; the sheet's `Policies:Proposed Path` is ignored. |
| Publications are events, not properties | `policy.yml` has **no** Hedera timestamp field. Publication events live in `publications.json` beside it, written only by `scripts/record-publication.js`. Decided by the RFC author on 2026-10-30. |
| Network is always explicit | Every `publications.json` entry carries `network` (`mainnet` or `testnet`); a timestamp exists on exactly one network. |
| No `uuid` check on publications | Each publish or re-import gets a new `uuid`, policy tag and instance topic, so none of the three real VM0007 publications matches the `.policy` bundles in the repo (see Evidence below). Verification checks existence on the claimed network, `publish-policy` action, and version instead. |
| Sheet path convention | `Policies:Current Path` must match what exists on disk. `Policies:Proposed Path` is filled only where a change is proposed, otherwise blank.  |
| ACE | Real folder is `African Clean Enery (ACE)` (typo kept). `Current Path` stays the real folder; the typo fix goes in `Proposed Path` (`examples/African Clean Energy (ACE)`). |
| Eggologic | `Community Contributions/2026-Hackathon/Eggologic` has a contributor-supplied `policy-manifest.yml` (valid against the schema, non-standard filename). Initially left out of the sheet; **a row was added later the same day** (`Policies:row 108`, `Required Fields:row 107`, `Optional Fields:row 109`), populated from that manifest and the bundle. The backfill still writes no `policy.yml` there and leaves the file alone. |
| Tolam | Add a sheet row for the top folder `Tolam Digitization of Analog Assets Policy` (one bundle at `policies/v1`), `Proposed Path` blank. |
| Which id wins | The ids already written on `swid/methodology-library-updates` win over the sheet's generated ids (EUDR Precheck, MECD v2.0, LIP, VM0007, VM0044 deprecated). Ids that repeat a word are de-duplicated. |
| VM0044 rows | `Required Fields` rows 99 and 100 are completed from the existing manifests (version, description, authors, category `waste`, tags). |
| `other` needs a note | Add `category_note` and `policy_type_note` columns at the end of `Required Fields`; Hello World gets `tutorial` in both. |
| Other branch left alone | `swid/methodology-library-updates` is not touched; its schema errors will surface on merge and in future checks. |
| CDM status | All CDM manifests are `deprecated` (decided 2026-10-30, owner). |
| License | `Apache-2.0` for all policies; not marked ASSUMED, no LICENSE file needed. |
| Authors / maintainers | Authors follow the workbook (`Envision` + `UNFCCC` for most CDM rows, `Envision` only where the workbook says so; `UFCCC` typo fixed). Maintainers default to the primary author unless evidence says otherwise; may be left blank when nothing can be deduced. A human reviews on `ready`. |
| Roles | An open list of strings taken from the bundle `policyRoles`; not forced to `Admin` / `Project Proponent` / `VVB`. |
| Tags and descriptions | No partner or origin tags (e.g. `envision`; duplicates `authors`). Descriptions are sparse (1-2 sentences) from the README or domain knowledge. |
| Sector | Set for every CDM manifest (energy, waste, water, agriculture, land-use) per methodology scope. |
| Commits | The lead commits manifests and the workbook as rows reach `ready` (one commit per row); nothing is pushed. |
| Team pattern from Phase 2 | A timestamp verifier runs alongside each backfill batch, an auditor samples each batch, and provenance runs where workbook authors are blank or contradicted. |

## Progress

| Policy | Folder | Manifest | Schema check | Audit | Provenance | Publications |
|---|---|---|---|---|---|---|
| CDM ACM0002 (pilot) | `Clean Development Mechanism (CDM)/CDM ACM0002` | committed, `deprecated` | pass | done (valid; status decided) | done (Envision only evidenced) | none documented in README |
| CDM ACM0001 | `.../CDM ACM0001` | committed | pass | sampled, OK | not run | testnet only (README ts verified) |
| CDM ACM0007, ACM0018 | `.../CDM ACM0007`, `.../CDM ACM0018` | committed | pass | not sampled | not run | testnet only (README ts verified) |
| CDM AMS-I.A, I.C, I.E, I.F, II.G, II.J | `.../CDM AMS-...` | committed | pass | I.E sampled, OK | not run | testnet only (README ts verified) |
| CDM AMS-III.D, III.F, III.H | `.../CDM AMS-III...` | committed | pass | III.D sampled, OK | not run | testnet only (README ts verified) |
| CDM AMS-III.AR | `.../CDM AMS-III.AR` | committed | pass | sampled, OK | not run | README ts 404 on both networks |
| CDM AMS-I.D, AMS-III.AV, AMS-III.BB | `.../CDM AMS-...` | committed | pass | not sampled | not run | none documented |
| CDM AR-ACM0003 | `.../CDM AR-ACM0003` | committed, `sector: land-use` | pass | sampled, OK | not run | README ts 404 on both networks |
| Verra PWRM0001, PWRM0002 | `Verra/Plastic Waste Reduction Standard (PWRM)/...` | committed | pass | sampled, no blockers | provenance run (Envision, medium) | PWRM0001 README ts testnet only; PWRM0002 none |
| Verra VM0003 | `Verra/Verified Carbon Standard (VCS)/VM0003` | committed | pass | sampled, no blockers | Allcot IO (PR #4239, medium) | README ts testnet only |
| Verra VM0007, VM0017, VM0041, VM0042 (Discontinued, V2.1) | `Verra/Verified Carbon Standard (VCS)/...` | committed | pass | VM0007, VM0042 V2.1 sampled | Envision (root readme grouping, medium; VM0042 V2.1 README says 'Developed by Envision') | VM0007 3 README ts testnet only; VM0017, VM0041, VM0042 Discontinued testnet only; VM0042 V2.1 none |
| Verra VM0033 | `.../VM0033` | committed | pass | sampled | Gautam Prajapati (PR #4231, medium); maintainer Alexander Pyatakov | README ts testnet only (README's 'IPSF Timestamp of 0.0.2' is the message version) |
| Verra VM0047 | `.../VM0047` | committed | pass | sampled | `ilyozzz` (low) | README ts decodes to 'Verra ARR Policy', not VM0047 |
| Verra VM0048 | `.../VM0048` | committed | pass | sampled | `erikamoji` (low) | README ts testnet only (v2.0.0) |
| Verra VMR0006 | `Verra/VMR0006` | committed | pass | sampled | Venkatesh R (LICENSE copyright; conflicts with root readme) | none documented |

Phases 1 and 2 (18 CDM rows and 12 Verra rows) are committed on this branch (one commit per row, plus `e2a970dac` adding `sector` to the CDM manifests). Nothing is pushed. No `publications.json` has been written anywhere.

## Flags for human review

| # | Folder | Severity | Field / area | Issue | Evidence | Raised by | Decision |
|---|---|---|---|---|---|---|---|
| 1 | `Clean Development Mechanism (CDM)` | review | `status` | Sheet marks CDM rows `deprecated`; the pilot used `draft`. | `Policies` tab | lead | **decided**: `deprecated` for all CDM rows |
| 2 | `Verra/Verified Carbon Standard (VCS)/VM0007` | info | `publications.json` | The unmerged branch's VM0007 `publications.json` records a mainnet 3.0.0 entry that does not exist (the timestamp is testnet only), uses `ipfs_timestamp`, wrong versions/topic, and `recorded_at`. Real publications are three testnet entries (below). | mirror-node lookups | lead | left alone by decision; fix on merge |
| 3 | seven folders on `swid/methodology-library-updates` | info | `policy.yml` | One manifest (`Archive/VM0044 (deprecated)`) sets the removed `hedera_timestamp`; five (Dovu/MMCM, EUDR Precheck, Gold Standard MECD v2.0, LIP, VM0007) set `ipfs_timestamp`, which was never in the schema. All fail validation today. Backfill will also collide with these seven folders (add/add, `id` clashes). | `ajv` run, this log | lead | left alone by decision; fix on merge |
| 4 | `Community Contributions/2026-Hackathon/Eggologic` | info | manifest filename | Contributor manifest is named `policy-manifest.yml`, not `policy.yml`; it passes `policy.schema.json`. Renaming it would be a separate decision. | folder listing, `ajv` | lead | no policy.yml written; file left alone; sheet row populated from it |
| 5 | `Required Fields:category`, `tags`, `version`, `description`, `authors` | review | sheet completeness | Still blank for most rows (category 29, tags 27, version 82, description 99, authors 81 of 103), and all are required by the schema. | xlsx export read 2026-10-30 | lead | open; the sheet is a work in progress |
| 6 | CDM: ACM0001, ACM0007, ACM0018, AMS-I.A, I.C, I.E, I.F, II.G, II.J, III.D, III.F, III.H | review | publications | README timestamps are real `publish-policy` messages on **testnet only** (404 on mainnet); READMEs name no network. No `publications.json` written (lead never writes it). Candidate `record-publication.js --network testnet` commands were suggested by the verifiers. | mirror-node lookups | timestamp-verifier | open (human runs the script) |
| 7 | CDM AMS-III.AR, AR-ACM0003 | review | publications | README timestamps `1698756576.572245003` and `1698755906.758865003` return 404 on both networks; not loggable. AR-ACM0003 README links `CDM/CDM.policy`, not its own bundle. | mirror-node lookups | timestamp-verifier | open |
| 8 | CDM AMS-I.E | review | `version` | Published testnet message and bundle say `1.0.2`; the manifest says `1.0.0`. | mirror node; bundle `policy.json` | timestamp-verifier, auditor | open |
| 9 | CDM AMS-III.AR, AMS-III.BB, AMS-III.D, AMS-III.F, AMS-III.H, AMS-II.J | review | `tags` | `clean-energy` (AR, BB) and `agriculture` (III.D) are judgement calls; AMS-II.J, III.F and III.H have only `cdm, cer` because the taxonomy has no matching tag. | `TAG_TAXONOMY.md` | backfillers | open |
| 10 | CDM (several) | info | `roles` | READMEs list `Registry (UNFCCC)` or `Project Proponent`, absent from the bundles; manifests follow the bundle roles (AR-ACM0003 keeps underscored `Project_Proponent`, `Designated_National_Authority`). | bundle `policyRoles` | backfillers, auditor | no action |
| 11 | CDM AMS-II.G, AR-ACM0003, ACM0001, ACM0002 | info | readme | AMS-II.G role text looks copied from another policy; AR-ACM0003 has a stale "Verra REDD Versions" heading; ACM0001/ACM0002 have typos and stale `CDM/Tools` links. | readmes | backfillers, auditor | no action |
| 12 | Verra VM0047 | review | methodology identity | Bundle is named 'Verra ARR Policy' and the README says the methodology is under development (v0.1); the README timestamp decodes to 'Verra ARR Policy'. The manifest describes the ARR methodology with `methodology_id: VM0047` from the reviewed workbook, status `draft`. Author `ilyozzz` is low confidence (PR #4951 merged after the folder import). | bundle `policy.json`; README; verifier | backfiller, verifier | open |
| 13 | Verra VM0048, VM0047 | review | authors | Authors rest on hackathon PR handles with unknown organizations (`erikamoji` PR #3476; `ilyozzz` PR #4951). | provenance | provenance | open |
| 14 | Verra VMR0006 | review | license, authors | Folder `LICENSE` is MIT (Copyright 2024 Venkatesh R) while the manifest follows the owner decision `Apache-2.0`; the root readme lists VMR0006 under Envision. The README is a cookstove/thermal methodology extending CDM AMS-II.G (not mangrove) and its token text is copy-pasted. | LICENSE; PR #3471 | backfiller | open |
| 15 | Verra VM0033, VM0017, VM0042 V2.1, PWRM0001, PWRM0002, VM0003 | review | version | Bundle `version` is empty, 'Dry Run' or missing, so `1.0.0` is a default (not evidence). VM0048's published testnet version is `2.0.0`, which the manifest matches; VM0033's published message version is `0.0.2`. | bundle `policy.json`; mirror node | backfillers | open |
| 16 | Verra VM0042 Discontinued | review | status | Workbook says `draft`; folder name says Discontinued and the workbook Proposed Path is `Archive/VM0042 (deprecated)`. `superseded_by` not set (sibling `VM0042 V2.1` is newer but nothing establishes a replacement). | folder name; workbook | backfiller | open |
| 17 | Verra PWRM0001, PWRM0002 | review | category | `category: carbon-credits` per the workbook, but the credits are plastic (WCC, WRC); the schema enum has `waste`. | schema; bundle tokens | auditor | open |
| 18 | Verra (several) | review | tags | Methodology-id tags (`pwrm0001`, `pwrm0002`, `vm0003`, etc.) are not in the taxonomy (CI warning only). Workbook tags `waste` and `land-use` are not canonical tags; scope moved to `sector`. | `TAG_TAXONOMY.md` | auditor, backfillers | open |
| 19 | Verra VM0003 | review | README | README body ('Conversion of Logged to Protected Forest') does not match the title, bundle or manifest ('Extension of Rotation Age'). The manifest is right; the README needs fixing by its maintainers. | README; bundle | auditor | open (not touched) |
| 20 | Verra VM0007, VM0017, VM0041, VM0042 Discontinued, VM0048, VM0033, VM0003, PWRM0001 | review | publications | README timestamps are real `publish-policy` messages on testnet only (404 on mainnet). VM0007's three versions are 1.0.0, 2.0.0, 3.0.0 on testnet. No `publications.json` written. | mirror nodes | verifier | open (human runs the script) |
| 21 | Verra VMR0006 | review | bundle / methodology_version | Tool IDs are identical to the VM0007 2.0.0 bundle (looks cloned); README states methodology v1.2 but `methodology_version` is omitted; README token text is copy-pasted (Waste Recycling Credit / ERC vs VCU). | auditor | auditor | open |
| 22 | Verra VM0033 | review | methodology_version, maintainers | Bundle name says 'v2.1' but `methodology_version` is omitted. Maintainer Alexander Pyatakov differs from author Gautam Prajapati (from commit/PR evidence for later updates; a deliberate exception to the default-to-primary-author rule). | bundle `policy.json`; provenance | auditor | open |
| 23 | Verra VM0047 | review | description | Auditor suggests softening to 'early implementation ... based on Verra VM0047' because the README says v0.1/unreleased and the bundle is 'Verra ARR Policy'. | auditor | auditor | open (proposed diff not applied) |
| 24 | Verra VM0048 | review | duplicate | A separate hackathon VM0048 exists (`Policies:row 84`, `Community Contributions/2024-Hackathon/VM0048`); confirm they are different bundles. | workbook | auditor | open |
| 25 | Verra (6 manifests) | info | tags | `vm0007`, `vm0033`, `vm0042`, `vm0047`, `vm0048`, `vmr0006` are non-canonical (CI warning only); the taxonomy has no methodology-id tag convention. | `TAG_TAXONOMY.md` | auditor | open |

## Spec and workflow-sheet issues

| Area | Issue | Status |
|---|---|---|
| `MANIFEST_SPEC.md` PRD link | Pointed at a path that does not exist | **Fixed** in `a1054fd7f` |
| `hedera_timestamp` | A scalar could not say which network it was on; the spec and RFC examples labelled a testnet timestamp (`1707207286.119377003`) as mainnet with an invented topic id | **Fixed** in `de1cd1a7f`: field removed from schema, spec and RFC; examples replaced with real entries |
| `publications.json` tooling | The RFC described `record-publication` and `publications.schema.json` but neither existed on `develop` | **Fixed** in `c9ddd2af5`: schema and script added and tested |
| `Optional Fields:hedera_timestamp` (sheet) | Column no longer maps to a schema property | **Done**: column removed by the sheet owner |
| `Optional Fields:token_standard`, `Dropdown Data:token_standard` | `non-fungible (HTS)` is not a schema value (`HIP-412-NFT`) | open |
| `Required Fields:version` | Values like `1.0` are not semver (`1.0.0`) | open |
| `Optional Fields:validation_body` | Column has no matching schema property (`additionalProperties: false`) | open |
| `Optional Fields:methodology_version` | Holds an id for ACM0001 | open |
| `Policies:Proposed Path` | Folder renames are out of scope (sidecar manifests only). Some rows are real moves owned elsewhere (VM0044 to `Archive/`, `Dovu/policies/` flattening); the backfill ignores the column | by design |
| `Policies:Current Path`, 29 rows | 26 hackathon rows (`Policies:row 59` to `84`) say `Hackathon/2024 Hackathon/...` but the repo has `Community Contributions/2024-Hackathon/...`; `Policies:row 5` (ACE) says "Energy" but the folder is "Enery"; `Policies:row 106` says `Tutorials/Hello World Policy` but the folder is `Tutorials/001-hello-world`; `Policies:row 101` (VM0044 v2) is blank (not on `develop` yet, expected) | **Done** in the xlsx (except `Policies:row 101`, blank by design until VM0044 v2 lands on `develop`) |
| Sheet coverage | Eggologic and Tolam had no row | **Done**: Tolam added at `Policies:row 107` (`Required Fields:row 106`, `Optional Fields:row 108`); Eggologic added at `Policies:row 108` (`Required Fields:row 107`, `Optional Fields:row 109`). Every folder with a `.policy` bundle now has a row |
| `Required Fields:id`, 5 rows | `eudr-eudr-precheck`, `gold-standard-mecd-v2-0`, `lip-living-income-price-lip`, `verra-vm0007`, `verra-vm0044` differ from the manifests on the other branch | **Decided**: use `eudr-precheck`, `gold-standard-mecd-v2`, `living-income-price`, `verra-vm0007-redd-plus`, `verra-vm0044-legacy`; **done** in the xlsx |
| `Required Fields:id`, repeated words | `ace-african-clean-enery-ace` (row 4), `irec-international-renewable-energy-certificate-irec` (row 84), `verified-farmer-verified-farmer-payments` (row 88), `verified-premium-verified-premium-payments` (row 89) | **Decided**: `ace-african-clean-energy`, `irec-international-renewable-energy-certificate`, `verified-farmer-payments`, `verified-premium-payments`; **done** in the xlsx |
| `Required Fields:row 99`, `row 100` (VM0044) | Marked `ready` / `in-progress` but version/description/authors blank (row 99) or version blank (row 100); category and tags differ from the manifests | **Done**: copied from the manifests |
| Sheet dropdowns | Four dropdown rules export as `#REF!` | **Repaired in the xlsx**: they work in the (now deprecated) Google Sheet, where they are table-column types that the xlsx export cannot carry; the four rules now point at `Dropdown Data` ranges |
| `category_note`, `policy_type_note` | Required by the schema when the value is `other`; no sheet columns | **Done**: `category_note` and `policy_type_note` added after `tags`; Hello World has `tutorial` in both |

## Evidence: real VM0007 publications

All three are on **testnet** only (404 on mainnet), `publish-policy` messages by the same owner DID (`did:hedera:testnet:…_0.0.2665978`):

| Timestamp | Version | Instance topic | Message `uuid` |
|---|---|---|---|
| `1707207018.434778003` | 1.0.0 | `0.0.2672416` | `87d42d6f-f564-4bb6-b8d7-5cf2a7644acb` |
| `1707207149.487956003` | 2.0.0 | `0.0.2672435` | `7146f2f3-8f6d-4640-9e75-3690527adfc2` |
| `1707207286.119377003` | 3.0.0 | `0.0.2672443` | `404a90a7-fe40-4aa3-bd4f-9c6838a1d8f1` |

The repo's `.policy` bundles for the same versions carry different `uuid`s (`e5281e10…`, `f5f260c9…`, `fe20fdfe…`) and instance topics (`0.0.3125154`, `0.0.5804915`, `0.0.5804924`), exported in late 2023, before these publications. Only the name and version agree.

## Run log

| Date | What was done |
|---|---|
| 2026-10-30 | Created branch and worktree. ACM0002 pilot manifest present and schema-valid. |
| 2026-10-30 | Fixed the broken PRD link in `MANIFEST_SPEC.md` (`a1054fd7f`). |
| 2026-10-30 | Dropped an earlier local commit that added an inline `hedera_publications` array; adopted the RFC's `publications.json` design instead. |
| 2026-10-30 | Removed `hedera_timestamp` from `policy.schema.json`, `MANIFEST_SPEC.md` and the RFC (`de1cd1a7f`). Validated the existing manifests before and after: only `Archive/VM0044 (deprecated)` (other branch) flipped to failing; the tutorial, ACM0002 pilot and VM0044 v2 still pass. |
| 2026-10-30 | Added `publications.schema.json` and `scripts/record-publication.js` (`c9ddd2af5`). Tested against the live mirror nodes: the three real VM0007 testnet entries reproduce the spec example and validate; refusals (wrong network, malformed, unknown network, nonexistent, non-publish message, missing `policy.yml`) leave the log untouched; `--check` catches a tampered version, wrong network label and `policy_id` mismatch; an unreachable mirror exits 2. |
| 2026-10-30 | Compared message `uuid`s with the repo's VM0007 bundles: no match, so `uuid` is not checked. |
| 2026-10-30 | Audit, provenance and publication-check agents for ACM0002 not yet run. |
| 2026-10-30 | Re-read the exported workbook (`Policy Manifest Backfill.xlsx`, untracked, not for commit) against the schema and the disk. Walked through seven findings with the sheet owner and recorded the decisions above: current-path corrections, coverage (Eggologic out, Tolam in), which ids win and de-duplication, the VM0044 rows, dropdowns (export artifact, no action) and `other` note columns. Sheet edits are being made by the sheet owner. |
| 2026-10-30 | Google Sheet declared deprecated; the xlsx is now the working copy. Applied the decided edits to it (59 cell changes, 3 new rows, 2 new columns, 4 repaired dropdown rules; all other workbook parts byte-identical). Re-checked: every `Current Path` exists except `Policies:row 101`; only Eggologic has no row (by decision); all seven ids match the other branch; no repeated-word or duplicate ids. |
| 2026-10-30 | Added the Eggologic row to the workbook (22 new cells, nothing existing altered), populated from its `policy-manifest.yml` (all ten required fields identical to it) and its bundle (roles `Registry, Project_Proponent, Operator, VVB`). `token_type` / `token_standard` left blank: the bundle mints two tokens (`EGGO` fungible, `CIN` non-fungible) and those fields hold one value. `Review Status` initially `not-started`, then set to `merged` on the sheet owner's instruction (the contributor's manifest is already in the repo). |
| 2026-10-30 | Phase 0 pilot (CDM ACM0002): audit, provenance and README-timestamp checks run; manifest reconciled with the workbook (status `deprecated`, authors `Envision` + `UNFCCC`, tag `envision` dropped, description shortened, `maintainers` added) and committed. |
| 2026-10-30 | Phase 1: the other 17 CDM rows backfilled by up to three backfillers and committed one row at a time; each row's workbook cells were updated from the manifest (XML patch with old-value assertions and a cell diff). All 18 CDM manifests pass `ajv`. |
| 2026-10-30 | Phase 1 checks: 13 README timestamps verified on both networks (11 testnet only, 2 not found on either); audit sample of five manifests found no blockers. Sector added to the CDM manifests (`e2a970dac`). |
| 2026-10-30 | Phase 2 (Verra): one provenance run supplied authors for 12 folders (workbook authors were blank); 12 rows backfilled by up to three backfillers with a timestamp verifier and auditor running alongside, one commit per row. All 31 tracked manifests pass `ajv`; no manifest carries Hedera or IPFS text; no `publications.json` written. VM0007 `land-use` tag removed for consistency; the lead's brief wrongly called VMR0006 a mangrove module (the backfiller corrected it from the README). |
