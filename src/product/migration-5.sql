-- Existing unused Phase 1 offer placeholders remain historical; Phase 5 uses versioned records.
CREATE TABLE merchant_offer_simulations(
 id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL REFERENCES merchants(id),session_id TEXT NOT NULL,
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 catalog_fingerprint TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE merchant_offer_versions(
 id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL REFERENCES merchants(id),version INTEGER NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','EXPIRED','REVOKED')),
 terms_json TEXT NOT NULL CHECK(json_valid(terms_json)),terms_hash TEXT NOT NULL,
 source_simulation_id TEXT NOT NULL REFERENCES merchant_offer_simulations(id),
 created_by TEXT NOT NULL CHECK(created_by IN ('MERCHANT','AGENT_DRAFT')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT);
CREATE TABLE merchant_publish_confirmations(
 token_hash TEXT PRIMARY KEY,session_id TEXT NOT NULL,offer_id TEXT NOT NULL REFERENCES merchant_offer_versions(id),
 terms_hash TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT);
CREATE TABLE group_catalogs(
 group_id TEXT PRIMARY KEY REFERENCES groups(id),catalog_json TEXT NOT NULL CHECK(json_valid(catalog_json)),fixture TEXT NOT NULL);
CREATE TABLE offer_applications(
 id TEXT PRIMARY KEY,offer_id TEXT NOT NULL REFERENCES merchant_offer_versions(id),group_id TEXT NOT NULL REFERENCES groups(id),
 previous_proposal_id TEXT NOT NULL REFERENCES proposals(id),proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),
 offer_snapshot_json TEXT NOT NULL CHECK(json_valid(offer_snapshot_json)),
 state TEXT NOT NULL CHECK(state IN ('RESERVED','CONSUMED','RELEASED')),
 cleanup_state TEXT NOT NULL CHECK(cleanup_state IN ('PENDING','COMPLETE','REQUIRES_RETRY')),
 created_at TEXT NOT NULL,consumed_at TEXT,UNIQUE(offer_id,group_id));
CREATE INDEX offer_redemption_count ON offer_applications(offer_id,state);
CREATE TRIGGER immutable_published_offer BEFORE UPDATE OF merchant_id,version,terms_json,terms_hash,source_simulation_id,created_by,created_at,published_at ON merchant_offer_versions
 WHEN OLD.status!='DRAFT' BEGIN SELECT RAISE(ABORT,'PUBLISHED_OFFER_IMMUTABLE'); END;
CREATE TRIGGER offer_status_transition BEFORE UPDATE OF status ON merchant_offer_versions
 WHEN NOT(NEW.status=OLD.status OR (OLD.status='DRAFT' AND NEW.status IN ('PUBLISHED','REVOKED')) OR (OLD.status='PUBLISHED' AND NEW.status IN ('REVOKED','EXPIRED')))
 BEGIN SELECT RAISE(ABORT,'INVALID_OFFER_TRANSITION'); END;
CREATE TRIGGER immutable_offer_application BEFORE UPDATE OF offer_id,group_id,previous_proposal_id,proposal_id,offer_snapshot_json,created_at ON offer_applications
 BEGIN SELECT RAISE(ABORT,'APPROVED_OFFER_IMMUTABLE'); END;
CREATE TRIGGER immutable_group_catalog BEFORE UPDATE ON group_catalogs
 BEGIN SELECT RAISE(ABORT,'DECLARED_CATALOG_IMMUTABLE'); END;
CREATE TRIGGER immutable_simulation BEFORE UPDATE ON merchant_offer_simulations
 BEGIN SELECT RAISE(ABORT,'SIMULATION_IMMUTABLE'); END;
