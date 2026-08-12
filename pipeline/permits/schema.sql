-- WI-6 — the whole schema story for the permit records. `CREATE TABLE IF NOT EXISTS` in one file;
-- no migration framework. The SQL identifier uses underscores; the slug string `rock-island` lives
-- in the `county_slug` column.
CREATE TABLE IF NOT EXISTS permits_rock_island_city (
  id                     text PRIMARY KEY,
  county_slug            text        NOT NULL,
  jurisdiction           text        NOT NULL,
  permit_number          text        NOT NULL,
  permit_date            date,
  permit_type_source     text,
  purpose                text,
  parties                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tax_map                text,
  parcel_number_source   text,
  address_source         text,
  total_cost_usd         numeric(14,2),
  matched_pin            text,
  match_method           text,
  unmatched_reason       text,
  report_month           text        NOT NULL,
  report_url             text        NOT NULL,
  report_document_id     text        NOT NULL,
  report_sha256          text        NOT NULL,
  report_layout          text        NOT NULL,
  source_page            integer,
  extracted_at           timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS permits_ri_city_pin_idx   ON permits_rock_island_city (matched_pin);
CREATE INDEX IF NOT EXISTS permits_ri_city_month_idx ON permits_rock_island_city (report_month);
CREATE INDEX IF NOT EXISTS permits_ri_city_type_idx  ON permits_rock_island_city (permit_type_source);
