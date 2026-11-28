# BON recommendation data

BON searches the reader catalog loaded from `sora_v2.books` (or the legacy `books` schema). It ranks the complete local list, groups volumes by recorded series and format, then checks at most 50 candidates. Recommendation cards and reasons are built from stored catalog fields in the reader app, so a temporary `/api/bon-chat` failure does not stop catalog recommendations. Book recommendation requests do not use the language model. Other BON features keep their existing API request flow. The catalog refreshes every 30 seconds while the app is visible and again when Bonbon opens, so newly registered books enter the same search without a hard-coded title list.

## Metadata audit

Available in the replacement schema: title, series name, volume number, author, book type (`Manga`, `Light Novel`, `Adult Manga`), genre, free-text themes, description, cover, and copy status. The legacy schema has fewer fields. The reader refreshes catalog data periodically; displayed recommendation cards recheck their few copy IDs in one database request. If that check fails, the card asks the reader to check availability in the catalog.

There are no dedicated, verified fields for protagonist identity, relationship, tone, content notes, page count or reading time, or series completion status. BON treats those details as **unknown** unless staff have explicitly recorded them in themes or description. It never infers them from a cover, format, title, or genre alone. As a result, requests such as “completed series,” “no love triangle,” “little violence,” and “female protagonist” may return qualified alternatives or no match until catalog records are filled in.

## Staff workflow

Staff can use Book Management → Edit Book to update **Themes** and **Description** now. Use explicit, sourced phrases such as `female protagonist`, `sapphic romance`, `gentle tone`, `little violence`, or `completed series` only after checking the publisher's description or the book itself. Do not use a blank field to imply a negative fact. A future catalog migration should split these into controlled, nullable fields with a source note and a last-verified date; the admin editor should expose those fields and use `unknown` as the default. Keep series completion on a series record when the data model has one, rather than repeating it on every volume.

The matching logic is in `src/lib/bon-recommendations.ts`. Add new synonym rules there when a frequent reader phrasing has an evidenced catalog equivalent. The general topic terms also allow requests beyond the explicit synonym list.
