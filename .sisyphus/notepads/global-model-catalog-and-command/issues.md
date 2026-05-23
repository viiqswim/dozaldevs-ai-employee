# Issues

## Pre-migration blocker (known, handled)
- 6 rows in model_catalog (3 models × 2 tenants = duplicates)
- Deduplication SQL must run before new unique constraint on model_id
- SQL: DELETE FROM "model_catalog" a USING "model_catalog" b WHERE a.ctid < b.ctid AND a.model_id = b.model_id;
