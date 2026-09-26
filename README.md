# Partner eligibility import

A small TypeScript / Node.js program that imports a partner's CSV list of eligible members. It saves the valid rows, rejects the invalid ones with the reasons why, and lets you look up a member by `partner_member_id` over HTTP.

## What you need

- Node.js 22 or later

## Install

```bash
npm install
```

## Run the import

```bash
npm run import -- samples/sample.csv
```

This prints how many rows were created, updated, unchanged and rejected. For each rejected row, it shows the line number in the file and every reason the row failed.

Running the same file again is safe. It won't create duplicates, and rows that haven't changed are reported as `unchanged`.

To see a row being updated, import the second sample file after the first:

```bash
npm run import -- samples/sample.csv
npm run import -- samples/sample-updated.csv   # PM-1002's email has changed
```

Imported members are saved to `data/members.json`. The file is created on the first run and is not committed to git. Set `DATA_FILE` to use a different file.

### The sample file

`samples/sample.csv` has 3 valid rows and 6 deliberately broken ones:

| Line | Problem                                           |
| ---- | ------------------------------------------------- |
| 5    | Missing email                                     |
| 6    | Email isn't a valid address (`[at]`)              |
| 7    | Date of birth in the wrong format                 |
| 8    | Policy ends before it starts                      |
| 9    | Missing `partner_member_id`                       |
| 10   | Missing `policy_end` (the row is one value short) |

## Look up a member

Start the server:

```bash
npm run dev
```

Then, in another terminal:

```bash
curl localhost:3000/members/PM-1001     # 200 and the member's details
curl localhost:3000/members/no-such-id  # 404
```

The server runs on port 3000. Set `PORT` to change it. If you import while the server is running, the server picks up the new data without a restart.

## Run the tests

```bash
npm test
```

Other checks: `npm run lint` (ESLint), `npm run format:check` (Prettier) and `npm run build` (TypeScript type check).

## How the code is organised

- `src/types.ts`: the shape of a member and of the import report.
- `src/validate.ts`: checks one CSV row. It doesn't read or write anything, so it's easy to test on its own.
- `src/import.ts`: reads the CSV, checks each row, and saves all the valid rows in one go.
- `src/store.ts`: where members are saved. `MemberStore` is the interface, and `JsonFileMemberStore` saves to a JSON file. The rest of the code only uses the interface, so the storage could be swapped (for example, to a database) by changing this one file.
- `src/server.ts`: the Express app with the lookup endpoint. It's given a store, so the tests can use a temporary one.
- `src/report.ts`: turns the import results into the text the import command prints.
- `src/config.ts`: the settings shared by the import command and the server (`DATA_FILE` and `PORT`). An invalid `PORT` gives a clear error.
- `src/cli.ts` and `src/index.ts`: the two starting points (the import command and the server). They are the only files that create the real store or use `process` and `console`.

## Assumptions and decisions

The brief leaves some things open on purpose. Here's what I decided and why.

- **Same member:** a member is identified only by `partner_member_id`. If any other field changes, including the email, it's an update to the same person, not a new member.
- **New, changed or unchanged:** each valid row is compared with the saved member that has the same id. No saved member means it's created. Any difference means it's updated. No difference means nothing changes.
- **Same id twice in one file:** the later row wins, just as if it had come in a later import.
- **All or nothing:** the whole import is saved in one write, at the end. It's written to a temporary file which then replaces the real one, so the file is never half-written. If an import fails partway, nothing from it is saved and it can simply be run again. Re-importing an unchanged file doesn't write anything.
- **Dates:** dates must be `YYYY-MM-DD` and a real calendar date, so `2024-02-30` is rejected rather than quietly turned into 1 March. I don't check whether a date of birth gives a sensible age.
- **Emails:** a simple shape check (`name@domain.tld`), not the full email standard. It catches clearly broken addresses.
- **Policy dates:** `policy_end` can't be before `policy_start`. The same day is allowed.
- **Wrong number of values:** a row with too few values is rejected with a "… is required" reason for each missing field. A row with more values than the header is also rejected, because an extra comma shifts every later value into the wrong column. That includes a trailing comma.
- **Reporting rejections:** every reason a row fails is reported at once, not just the first. The line number matches the line in the file, counting blank lines, so the partner can find the row in their editor.
- **The data file is checked when it's read:** `data/members.json` could be edited by hand. If it isn't valid JSON, isn't a list, or has a member with a missing field, the program stops with an error that names the file.
- **Storage:** a JSON file, which the brief allows. A real system would use a proper database. What matters more is that only `store.ts` knows how members are stored, so changing it later is a one-file change. A JSON file also needs no extra software, so the project runs straight after `npm install`.
- **Lookup:** an HTTP endpoint rather than a command. In practice, another system is more likely to look members up than a person is, and the extra work over a command is small.

## What I'd do next

These were left out to keep the exercise small:

- Authentication on the lookup endpoint.
- An endpoint to list members, with pagination.
- Keeping each partner's ids separate. This version assumes one partner's file at a time.
- Locking, so two imports running at the same moment can't overwrite each other's changes.
- A real database instead of the JSON file.

## How I used AI tools

I used Claude Code throughout. I treated it as a pair programmer that I directed and checked, not something whose output I accepted as-is.

**Where it helped:**

- Setting up the project and the boilerplate: TypeScript, ESLint, Prettier, Vitest, and the Express and supertest wiring.
- Reviewing the plan before any code was written. It found that the CSV library's default settings stop the whole import when one row has the wrong number of values, which would have broken "reject invalid rows and report why". It also found that npm had installed a very new TypeScript version and Node type definitions that didn't match the Node version in use, and that running the import twice was only going to be checked by hand, not by a test.
- Reviewing the finished code. This found that:
  - the running server didn't see new imports until it was restarted;
  - the data file could be left half-written if the program crashed while saving;
  - the file was saved once per row instead of once per import;
  - rejected rows were numbered by row, not by their line in the file.

  All of these are fixed and covered by tests.

- Explaining the code back to me in plain language, so I could check I understood every part of it.
- Drafting this README from the decisions we made.

**Where it didn't help, or I had to steer it:**

- On storage, its first answer was that either option was fine, with no real reasoning. I had to push for the actual trade-offs before choosing.
- It worked around a gap in the CSV library's TypeScript types with a type cast. When I questioned it, there was a cleaner option the library does support, so I switched to that.
- It added a save-one-member method that only the tests used. I removed it, so the tests exercise the same code path as the real import.

## How I checked it works

- **Automated tests:** `npm test` runs 40 tests. They cover:
  - validation rules, including leap years, `2024-02-30`, and rows with missing values;
  - the store: created, updated and unchanged; data surviving between separate runs; a running server seeing a new import; a bad data file; a failed save leaving the old data untouched;
  - the import: running the same file twice, updates, rejected rows with their line numbers, rows with too few or too many values, saving once per import, and saving nothing if the import fails partway;
  - the printed report, the `DATA_FILE` and `PORT` settings, and the lookup endpoint (member found and not found).
- **By hand:**
  - Imported `samples/sample.csv` twice. The first run created 3 members and rejected 6 rows. The second run reported the 3 members as unchanged, with the same 6 rejections.
  - Imported `samples/sample-updated.csv` and got exactly 1 update (PM-1002's email), which was then in `data/members.json`.
  - Started the server and used `curl` to look up a known id (200) and an unknown id (404).
