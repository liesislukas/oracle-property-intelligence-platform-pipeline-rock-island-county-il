-- Geo-signal tables for the Rock Island County pipeline database.
--
-- Plain Postgres 16, no PostGIS. Geometry is GeoJSON in jsonb plus a centroid pair, which is
-- everything a nearest-feature distance needs. Do not CREATE EXTENSION postgis — it is not in the
-- postgres:16 image the pipeline stands up.
--
-- All fetched features are loaded, each flagged in_county, so "bbox count vs clipped count" is
-- directly queryable rather than asserted. Every figure presented anywhere as a county figure is
-- WHERE in_county — no exceptions.

CREATE TABLE IF NOT EXISTS geo_signal_source (
  id                    text PRIMARY KEY,
  county_slug           text        NOT NULL,
  label                 text        NOT NULL,
  publisher             text        NOT NULL,
  endpoint              text        NOT NULL,
  query                 text        NOT NULL,
  geometry_type         text        NOT NULL,
  licence               text        NOT NULL,
  licence_source        text        NOT NULL,
  licence_url           text,
  attribution           text,
  crowd_sourced         boolean     NOT NULL,
  completeness_known    boolean     NOT NULL,
  retrieved_at          timestamptz NOT NULL,
  http_status           integer     NOT NULL,
  elapsed_s             numeric(10,3) NOT NULL,
  fetch_bbox_wsen       text        NOT NULL,
  discovery_bbox_wsen   text        NOT NULL,
  count_fetch_bbox      integer     NOT NULL,
  count_discovery_bbox  integer     NOT NULL,
  count_clipped         integer     NOT NULL,
  raw_archive_path      text        NOT NULL,
  clipped_artifact_path text        NOT NULL,
  caveats               jsonb       NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_signal_feature (
  source_id      text        NOT NULL REFERENCES geo_signal_source(id) ON DELETE CASCADE,
  feature_uid    text        NOT NULL,
  kind           text        NOT NULL,
  geometry       jsonb       NOT NULL,
  centroid_lon   double precision NOT NULL,
  centroid_lat   double precision NOT NULL,
  props          jsonb       NOT NULL,
  in_county      boolean     NOT NULL,
  source_licence text        NOT NULL,
  retrieved_at   timestamptz NOT NULL,
  crowd_sourced  boolean     NOT NULL,
  inferred       text,
  sourcedate     date,
  voltage_raw    integer,
  voltage_kv     numeric(8,2),
  volt_class     text,
  owner          text,
  status         text,
  PRIMARY KEY (source_id, feature_uid)
);

CREATE INDEX IF NOT EXISTS geo_signal_feature_in_county_idx
  ON geo_signal_feature (source_id, in_county);
CREATE INDEX IF NOT EXISTS geo_signal_feature_centroid_idx
  ON geo_signal_feature (centroid_lon, centroid_lat);
