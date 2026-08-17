-- Runs once, on first init of an EMPTY Postgres data dir (pgvector image's
-- /docker-entrypoint-initdb.d). Creates the pgvector extension the migrations
-- depend on (they add vector(768) columns but don't CREATE EXTENSION). No-op on
-- an already-initialized database, so it can't affect an existing volume.
CREATE EXTENSION IF NOT EXISTS vector;
