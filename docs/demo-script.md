# DraftBoard demo script

Use a dedicated, seeded local database and follow [README setup](../README.md). Start Docker and `npm run dev`, then open `http://localhost:3000`. The shared local-only demo password is `DraftBoardDemo!2026`. These steps use the current NBA scouting scope: draft prospects and drafting are future extensions. Reports, news and needs are generated or synthetic demonstration data, not real scouting, reporting or team requirements.

1. **Explain the model and corrections.** Open [ER diagram](er-diagram.png), [relational schema](relational-schema.md) and [data dictionary](data-dictionary.md). Point out one address and multiple `person_phone` rows; person role and one matching subtype; Game 1:N performances; roster membership's composite roster/season foreign key and unique player/season; news/player mentions; and actor-attributed roster audit rows. The deferred subtype trigger checks the match at commit.

2. **Explain provenance.** Open [data sources](data-sources.md): NBA Games 2017–2019 supplies real teams, games, performances and historical rosters; uniquely and plausibly matched Draft Combine rows supply measurements. Explain `import_unmatched`, empty imported injury and prospect tables, and generated supporting texts. Open [vector search](vector-search.md): the 384-dimensional model, cosine distance and index, and the limitations of the generated in-sample evaluation.

3. **Sign in as admin and show database queries.** At `/login`, use `admin@draftboard.local`. Open `/showcase`. Run **Open needs view**, **Player game context** (JOIN), **Scorers above 20 points** (GROUP BY/HAVING), and **Position rankings** (window function). The corresponding executable SQL and sample plans are in [queries.md](queries.md) and `db/postgres/07_queries.sql`.

4. **Show the trigger and audit.** Sign out, then sign in as `manager@draftboard.local`. Open `/team-match`, choose an eligible player and note their ID from the linked player profile URL (`/players/<id>`). Open `/teams`, find **Managed roster**, enter that ID and select **Add player**. The database enforces the season uniqueness and 15-player cap and the audit trigger records the insert. Select **Remove** for the same player to restore the roster; this records a delete. Sign out and sign back in as admin. Open `/showcase` and run **Roster audit log**: point to the `INSERT` and `DELETE` rows and their non-null `changed_by` manager ID. If the roster is already full, remove and restore only a demo-owned membership or use a separate seeded demo database; do not alter another person's data.

5. **Show transaction rollback and a rejected constraint.** Still as admin at `/showcase`, run **Rollback demonstration**. Its fixed fixture tries to add the same player to two rosters in season 2200. The `UNIQUE(player_id, season)` constraint rejects the second insert; the subtransaction rolls back the fixture and its audit changes. The result should show `duplicate_rejected: true` and `fixtures_rolled_back: true`. This leaves no demo teams or roster memberships behind.

6. **Show vector storage, HNSW and EXPLAIN ANALYZE.** In `/showcase`, select **Check embedding** to show the configured model and dimension, then run **Plan without index scans**, **Plan with index available**, and **Plan with sequential scans discouraged**. These execute `EXPLAIN (ANALYZE, BUFFERS)` with transaction-local planner settings. The last can show `idx_scouting_report_embedding_hnsw`; the default planner can choose a sequential scan on this small dataset. Forced plans demonstrate availability, not a speed advantage. For the underlying SQL and sample output, open [queries.md](queries.md). The hybrid SQL joins the player and applies position and injury filters in the same query as vector ordering; see [vector-search.md](vector-search.md) and `db/postgres/07_queries.sql`.

7. **Show the scout workflow.** Sign out and sign in as `scout@draftboard.local`. Open `/players`, filter by position, and open a player profile to show stats, measurements, reports, mentions and related news. Open `/reports`, show the scout's own reports and an **indexed** badge; open a similar-reports panel. Creating or editing a report is optional and changes demo data; embedding failures leave it pending for backfill.

8. **Compare keyword and semantic search.** As scout, open `/search` and select **Keyword vs Semantic**. Click each quick button in turn and show both columns for the same query:

   - `protects the basket from opposing layups`
   - `facilitator who sets up teammates`
   - `lockdown perimeter defender`

   The documented seed produced no keyword hits and semantic hits for these selected examples; results can vary with the seed and model. The examples were tuned on generated texts, so they are a demonstration, not independent evaluation. On **Semantic search**, apply a position filter and show similarity scores. Missing injury records do not imply medical clearance.

9. **Show Team Match and role restrictions.** Sign out and log in as `manager@draftboard.local`; open `/dashboard`, `/teams`, then `/team-match`. Show the manager's own open needs and ranked existing NBA players with score breakdown. The highest-priority matching open need, statistics and measurement count are transparent proxies; they are not predictions. A manager cannot manage another team's roster or needs. Optionally sign in as `analyst@draftboard.local` to show `/games` and a box score; the analyst records performances and measurements.

10. **Show tests and contribution history.** From the repository root, run `npm test` or the full `npm run test:all` with `DEMO_PASSWORD` set as in [README](../README.md). Show [test results](test-results.md), then run:

    ```sh
    git shortlog -sne --all
    git log --all --format='%h %an <%ae> %s' -20
    ```

    Explain that author history shows recorded authorship, not by itself proof of the division of work. Stop the dev server with Ctrl+C; leave the database volume intact unless intentionally removing demo data.
