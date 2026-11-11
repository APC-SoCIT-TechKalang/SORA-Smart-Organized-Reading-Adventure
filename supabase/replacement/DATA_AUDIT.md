# Current data audit for the exact ERD

The counts below came from the read-only `000_preflight_summary.sql` result
provided by the project owner. They describe the current Supabase project at
the time of that query; they are not a fresh database connection or a backup.

| Data | Current count | Exact-ERD migration impact |
| --- | ---: | --- |
| Profiles | 8 | 6 lack username, 6 lack birthdate, all 8 lack mobile number. The ERD requires all three. |
| Books | 10 | All 10 age ratings are nonnumeric; 1 book type is unsupported. Authors are present and volume values are numeric or null. |
| Book copies | 1 | Status value still needs inspection. |
| Memberships | 3 | All have expiry; 1 has null remaining minutes, which the ERD forbids. |
| Seats | 7 | All seat numbers are nonnumeric, while the ERD requires `INT`. |
| Visits | 2 | One is an unregistered walk-in without a user; the ERD's `sessions.user_id` is required. A registered `Wanderer` is supported. |
| Reading logs | 0 | No reading history needs conversion yet. |
| Quests and quest progress | 0 | No quest history needs conversion yet. |
| Points ledger | 0 | No points transactions need conversion yet. |

The exact ERD also has no foreign key from its integer `users.user_id` to
Supabase Auth's UUID. A data mapping and authorization design is required
before the current sign-in flow can use these tables. The current reader and
staff apps cannot simply switch to `sora_v2`.

## Decisions required before data copy

1. Obtain real birthdates and mobile numbers for profiles that lack them, or
   revise the ERD's `NOT NULL` requirements. Do not invent personal data.
2. Inspect the existing age-rating, book-type, seat, copy-status, and
   membership-minute values with `000_preflight_values.sql`, then define
   explicit conversion rules with no silent loss of meaning.
3. Use `Wanderer` for registered walk-ins. Unregistered walk-in visits and
   check-in without a book cannot be represented by the exact `sessions` table;
   the project owner chose to remove unsupported features.
4. Decide how Supabase Auth UUIDs map to integer `users.user_id` and how RLS
   verifies ownership without adding a link column to the ERD.

Until these are resolved, the current project should keep using its existing
`public` tables and functions. `001_schema.sql` is an isolated translation,
not a cutover or data transfer.
