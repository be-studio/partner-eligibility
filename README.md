# Partner eligibility import

Imports a partner-supplied CSV of eligible members, stores the valid rows, and lets you look one up by `partner_member_id`.

## Requirements

- Node.js 22+

## Install

```bash
npm install
```

## Run the import

```bash
npm run import -- samples/sample.csv
```

Prints a summary (created / updated / unchanged / rejected) and, for each rejected row, its line number in the file and every reason it failed. Running the same file again is safe — it won't create duplicates, and unchanged rows are reported as `unchanged` rather than re-created.

To see the update path, import the same file again after editing a value, or try the second sample:

```bash
npm run import -- samples/sample.csv
npm run import -- samples/sample-updated.csv   # PM-1002's email has changed
```

Imported data is written to `data/members.json` (created on first run, git-ignored).

## Look up a member

Start the server:

```bash
npm run dev
```

Then, in another terminal:

```bash
curl localhost:3000/members/PM-1001   # 200, the member
curl localhost:3000/members/no-such-id  # 404
```

## Tests

```bash
npm test
```

Also available: `npm run lint` (ESLint), `npm run format` / `npm run format:check` (Prettier), `npm run build` (type-check via `tsc`).

## How it's put together

- `src/types.ts` — the `Member` domain type and report shapes.
- `src/validate.ts` — pure validation of one raw CSV row; no side effects, easy to unit test in isolation.
- `src/store.ts` — a `MemberStore` interface with one implementation, `JsonFileMemberStore`. Everything else (the import logic, the server, the tests) depends only on the interface, not the concrete class — so swapping in a different storage engine later is a one-file change, not a redesign.
- `src/import.ts` — reads and parses the CSV, validates each row, and upserts all the valid ones into whichever store it's given in a single batch.
- `src/server.ts` — a small Express app exposing the lookup endpoint; takes a store as an argument so tests can hand it a store backed by a throwaway temp file, without starting a real server.
- `src/report.ts` — turns an import report into the text the import command prints, so that output can be tested without running the command.
- `src/config.ts` — the settings both entry points share: where the data file lives (`DATA_FILE`) and which port to listen on (`PORT`, checked to be a valid port number).
- `src/index.ts` / `src/cli.ts` — the two entry points (HTTP server, import command). These are the only places that construct a real `JsonFileMemberStore` or touch `process`/`console` — everything else is pure and directly testable.

## Assumptions and decisions

The brief deliberately leaves some things open. Here's what I decided and why:

- **Identity:** `partner_member_id` is the only thing that identifies a member. If any other field changes — including the email — it's treated as an update to the same person, not a new record, because that's literally what the id is for.
- **Change detection:** every field of an incoming valid row is compared against the stored record; any difference is an update, no difference is a no-op, no prior record is a create.
- **Duplicate ids within one file:** if the same `partner_member_id` appears twice in a single import, the later row wins. This falls out naturally from processing rows in file order and is consistent with how a changed row is handled between imports.
- **Imports are all-or-nothing:** valid rows are applied in memory and the data file is saved once at the end (via a temp file and rename, so it's never half-written). If an import fails partway, nothing from it is saved, and re-running it is safe. Re-importing an unchanged file doesn't write at all.
- **Wrong number of values:** a row with too few values is rejected with a "field is required" reason for each missing one. A row with more values than the header is also rejected, because that usually means a stray comma has pushed every later value into the wrong column. That includes a trailing comma, which some spreadsheet exports add.
- **Trusting the data file:** `data/members.json` is checked when it's read, since it can be edited by hand. If it isn't valid JSON, isn't a list, or has a member with a missing field, the import or lookup fails with a message naming the file, rather than carrying on with bad data.
- **Date validation:** dates must be strict `YYYY-MM-DD` and a real calendar date — `2024-02-30` is rejected rather than silently rolled over to March. I'm not validating that a date of birth implies a sensible age; that felt out of scope for the time box.
- **Email validation:** a structural check (`local@domain.tld` shape), not full RFC 5322 compliance. Good enough to catch the obviously broken rows without writing a spec-compliant email parser.
- **Policy dates:** `policy_end` must not be before `policy_start`; equal is allowed (a single-day policy is plausible).
- **Rejection reporting:** every row can fail for multiple reasons at once, and all of them are reported together (not just the first), so a partner could fix their file from one report instead of a back-and-forth.
- **Storage:** a JSON file behind the `MemberStore` interface, rather than SQLite. The brief says either is fine, and neither is actually what a production system would use (that would be a proper managed database) — so I didn't treat this as the interesting decision. The interesting part is that nothing outside `store.ts` knows which storage is in use, so swapping it out later is a one-file change, not a redesign. JSON also has zero native dependencies, which matters for "clone and run" reliability.
- **Lookup interface:** an HTTP endpoint rather than a CLI command. In practice this data is more likely to be queried by another system than typed by a person, and it gives a bit of real full-stack surface (routing, status codes) that's relevant to the role, at very low extra cost since the underlying store lookup is identical either way.
- **Out of scope for this exercise:** authentication on the endpoint, a listing/pagination endpoint, partner-namespacing of ids (this assumes one partner's file at a time), and concurrent-write locking on the JSON file. All reasonable next steps, not needed to demonstrate the behaviour asked for here.

## How I used AI tooling

I used Claude Code throughout, but treated it as a pair-programmer to direct rather than a black box to accept from — the two decisions with real trade-offs (storage backend, lookup mechanism) were things I pushed back on and made deliberately, not just took the first suggestion for. Specifically:

- **Helped:** scaffolding the boilerplate (project setup, the Express/Express-supertest wiring, test skeletons), and drafting this README from the actual decisions made in our conversation.
- **Helped, but I directed it:** the storage and lookup-mechanism choices above didn't come from just accepting a default — I asked "is JSON too basic for a technical test?" and "how should lookup work?" and pushed for actual reasoning rather than a shrug, which is what's written above.
- **Where it caught something I'd have missed:** I asked for an adversarial pass against the plan before writing any code. It found a real bug before it existed — the CSV parser's default settings throw and abort the _entire_ import on a single malformed row (wrong column count), which would have directly broken the "reject rows and report why" requirement for exactly the kind of row a real partner file might contain. It also caught that the freshly-installed `typescript` and `@types/node` versions were mismatched/unusually new in a way that added risk with no benefit, and that "safe to run more than once" — the brief's most emphasized requirement — was only going to be checked manually rather than by an automated test. All three are reflected in the final code and tests.
- **Where it didn't help / I had to steer:** early drafts of the plan leaned toward "either storage option is equally fine" without a real justification — I had to explicitly ask for the actual trade-off reasoning before accepting a direction, since "the brief allows it" isn't the same as "it's the right call for a technical test."

## How I checked correctness

- `npm test` — 40 automated tests covering validation rules (including edge cases like leap years, `2024-02-30`, and rows with missing columns), store upsert semantics (created/updated/unchanged transitions, a malformed data file, including persistence across separate `JsonFileMemberStore` instances to simulate re-running the CLI as a fresh process), full-file import behaviour (idempotency, updates, rejected-row reporting with file line numbers, rows with too few or too many values, one save per import, all-or-nothing on failure), the printed import report (including a row with no id), the `DATA_FILE` and `PORT` settings, and the HTTP endpoint (hit and miss).
- Manually ran `npm run import -- samples/sample.csv` twice in a row and confirmed the second run reports zero creates and all previously-valid rows as `unchanged`, with identical rejections both times.
- Manually ran `npm run import -- samples/sample-updated.csv` and confirmed exactly one `updated` result, and that `data/members.json` reflects the new value.
- Manually started the server and `curl`'d both a known and an unknown `partner_member_id` to confirm the 200/404 responses.
