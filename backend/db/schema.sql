-- Target PostgreSQL schema. The MVP keeps the same shapes in memory (src/pipeline/store.ts).
-- Run: psql $DATABASE_URL -f backend/db/schema.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy name search; add PostGIS later if you need radius queries

CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT NOT NULL, trust NUMERIC(3,2) NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('synthetic','official_api','partner_feed')));

-- Canonical identity (the SSOT): one row per physical outlet
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, area TEXT, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  phone TEXT, cuisines TEXT[] NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX restaurants_name_trgm ON restaurants USING gin (name gin_trgm_ops);
CREATE INDEX restaurants_geo ON restaurants (lat, lng);

-- Provider-specific listing, mapped to ONE canonical restaurant. (provider, record) is unique, which prevents duplicate ingestion.
CREATE TABLE provider_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id), provider_record_id TEXT NOT NULL,
  raw_name TEXT NOT NULL, raw_address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, raw_phone TEXT, url TEXT,
  UNIQUE (provider_id, provider_record_id),
  UNIQUE (restaurant_id, provider_id)   -- a provider cannot list the same canonical outlet twice
);

CREATE TABLE menu_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id UUID NOT NULL REFERENCES restaurants(id), name TEXT NOT NULL, veg BOOLEAN NOT NULL, portion TEXT NOT NULL DEFAULT 'full', UNIQUE (restaurant_id, name, portion));
CREATE TABLE provider_menu_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), listing_id UUID NOT NULL REFERENCES provider_listings(id), menu_item_id UUID REFERENCES menu_items(id), provider_item_name TEXT NOT NULL, UNIQUE (listing_id, provider_item_name));

-- Append-only observations: every price/eta/fee/rating we ever saw, with provenance. NULL value = unknown (never 0).
CREATE TABLE observations (
  id BIGSERIAL PRIMARY KEY, listing_id UUID NOT NULL REFERENCES provider_listings(id), provider_menu_item_id UUID REFERENCES provider_menu_items(id),
  attribute TEXT NOT NULL, value_num NUMERIC, value_text TEXT, observed_at TIMESTAMPTZ NOT NULL, effective_at TIMESTAMPTZ,
  confidence NUMERIC(3,2) NOT NULL, validation_status TEXT NOT NULL DEFAULT 'valid', reconciliation_status TEXT NOT NULL DEFAULT 'unreviewed'
);
CREATE INDEX observations_latest ON observations (listing_id, attribute, observed_at DESC);   -- "latest value" lookups; older rows = history

CREATE TABLE provider_offers (id BIGSERIAL PRIMARY KEY, listing_id UUID NOT NULL REFERENCES provider_listings(id), pct NUMERIC, cap NUMERIC, min_order NUMERIC, label TEXT, observed_at TIMESTAMPTZ NOT NULL);

CREATE TABLE reviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), listing_id UUID NOT NULL REFERENCES provider_listings(id), text TEXT NOT NULL, rating NUMERIC(2,1), reviewed_at DATE, text_hash TEXT NOT NULL, UNIQUE (text_hash, listing_id));
CREATE INDEX reviews_hash ON reviews (text_hash);  -- cross-provider duplicate detection
CREATE TABLE review_aspects (review_id UUID REFERENCES reviews(id) ON DELETE CASCADE, aspect TEXT NOT NULL, sentiment SMALLINT NOT NULL, model_version TEXT NOT NULL, PRIMARY KEY (review_id, aspect, model_version));
CREATE TABLE reputation_snapshots (id BIGSERIAL PRIMARY KEY, restaurant_id UUID NOT NULL REFERENCES restaurants(id), provider_id TEXT REFERENCES providers(id), computed_at TIMESTAMPTZ NOT NULL DEFAULT now(), method TEXT NOT NULL, payload JSONB NOT NULL);

CREATE TABLE entity_match_candidates (id TEXT PRIMARY KEY, listing_a UUID NOT NULL REFERENCES provider_listings(id), listing_b UUID NOT NULL REFERENCES provider_listings(id), score NUMERIC(4,3) NOT NULL, parts JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','merged','rejected')), decided_by UUID, decided_at TIMESTAMPTZ);
CREATE TABLE reconciliation_events (id BIGSERIAL PRIMARY KEY, restaurant_id UUID REFERENCES restaurants(id), attribute TEXT NOT NULL, policy TEXT NOT NULL, chosen_value TEXT, evidence JSONB NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE user_preferences (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, veg_only BOOLEAN DEFAULT false, cuisines TEXT[] DEFAULT '{}', max_budget NUMERIC, max_eta_min INT, analytics_consent BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE saved_restaurants (user_id UUID REFERENCES users(id) ON DELETE CASCADE, restaurant_id UUID REFERENCES restaurants(id), PRIMARY KEY (user_id, restaurant_id));
