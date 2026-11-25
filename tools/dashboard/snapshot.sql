\set ON_ERROR_STOP on
\if :{?days}
\else
  \set days 56
\endif
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '12s';
SET LOCAL lock_timeout = '2s';

WITH coverage AS (
  SELECT now() AS "asOf",
         date_trunc('day', now()) - (greatest(1, least(56, :'days'::int)) - 1) * interval '1 day' AS "from"
), attempts AS (
  SELECT left(encode(sha256(convert_to('purrcels-dashboard-v1:' || attempt_id::text, 'UTF8')), 'hex'), 24) AS id,
         puzzle_id AS puzzle,
         CASE WHEN mode = 'campaign' AND left(puzzle_id, 6) = 'tower_' THEN 'tower' ELSE mode END AS mode,
         difficulty, grid_size AS grid, started_at AS "startedAt", expires_at AS "expiresAt",
         completed_at AS "completedAt", time_seconds AS seconds, mistakes_used AS mistakes, stars
  FROM public.ranked_puzzle_attempts, coverage
  WHERE started_at BETWEEN coverage."from" AND coverage."asOf"
  LIMIT 50001
)
SELECT CASE WHEN count(*) > 50000 THEN json_build_object('error', 'too_many_attempts')
            ELSE json_build_object('version', 1, 'asOf', (SELECT "asOf" FROM coverage),
                   'from', (SELECT "from" FROM coverage), 'attempts',
                   coalesce(json_agg(a ORDER BY a."startedAt" DESC, a.id), '[]'::json)) END
FROM attempts a;
COMMIT;
