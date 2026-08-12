-- ISSUE-021 — owner entity reconciliation, an ADDITIVE extension to the elephant-query-db schema.
--
-- The kit's loader dedupes by (source_system, source_record_key) — exact-key dedupe, not entity
-- resolution — and elephant-query-db carries no entity-resolution logic anywhere in src/ or
-- scripts/. Owner reconciliation is therefore an extension this issue owns. It is written into two
-- new, clearly namespaced tables. NO KIT TABLE IS ALTERED.

CREATE TABLE IF NOT EXISTS owner_entities (
  owner_entity_id      text PRIMARY KEY,           -- sha256(normalized_name) truncated to 32 chars
  normalized_name      text NOT NULL UNIQUE,       -- kit normalizeName(canonical name)
  canonical_name       text NOT NULL,              -- most frequent raw spelling in the group
  canonical_name_field text NOT NULL,              -- 'owner1_name' | 'taxbill_name'
  entity_kind          text NOT NULL,              -- 'company' | 'person'
  entity_tags          text[] NOT NULL DEFAULT '{}',
  parcel_count         integer NOT NULL,
  mailing_city         text,
  mailing_state        text,
  mailing_postal_code  text,
  mailing_plus_four    text,
  mailing_parse_status text NOT NULL,              -- 'parsed' | 'blank' | 'unparsed'
  source_system        text NOT NULL,
  source_http_request  jsonb NOT NULL,             -- provenance: url, retrieved_at, licence, item id
  loaded_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_entity_parcels (
  owner_entity_id    text NOT NULL REFERENCES owner_entities(owner_entity_id) ON DELETE CASCADE,
  request_identifier text NOT NULL,                -- OBJECTID as a decimal string (contract 4)
  parcel_identifier  text NOT NULL,                -- PIN, VERBATIM. Never digits-only-normalized.
  owner1_name        text,                         -- BOTH source name fields, always, per record
  taxbill_name       text,                         -- a DIFFERENT legal entity, never a merge key
  names_disagree     boolean NOT NULL,
  PRIMARY KEY (owner_entity_id, request_identifier)
);

CREATE INDEX IF NOT EXISTS owner_entities_parcel_count_idx ON owner_entities (parcel_count DESC);
CREATE INDEX IF NOT EXISTS owner_entities_mailing_state_idx ON owner_entities (mailing_state);
CREATE INDEX IF NOT EXISTS owner_entity_parcels_request_idx ON owner_entity_parcels (request_identifier);
CREATE INDEX IF NOT EXISTS owner_entity_parcels_pin_idx ON owner_entity_parcels (parcel_identifier);

-- Owner mailing state/city per PARCEL, which is what ISSUE-024's regional-owner question consumes
-- and what ISSUE-022 publishes into the signals sidecar. It is a view, not a copy, so it can never
-- drift from the reconciliation.
CREATE OR REPLACE VIEW parcel_owner_location AS
SELECT
  p.request_identifier,
  p.parcel_identifier,
  e.owner_entity_id,
  e.canonical_name        AS owner_name,
  e.canonical_name_field  AS owner_name_field,
  p.owner1_name,
  p.taxbill_name,
  p.names_disagree,
  e.entity_kind,
  e.entity_tags,
  e.mailing_city          AS owner_city,
  e.mailing_state         AS owner_state,
  e.mailing_postal_code   AS owner_postal_code,
  e.mailing_parse_status  AS owner_location_parse_status,
  e.parcel_count          AS owner_parcel_count,
  e.source_http_request
FROM owner_entity_parcels p
JOIN owner_entities e USING (owner_entity_id);
