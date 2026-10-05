-- Foreign keys are disabled only around this transactional table rebuild, then checked.
CREATE TABLE proposals_v4(
 id TEXT PRIMARY KEY,goal_id TEXT NOT NULL REFERENCES purchase_goals(id),revision INTEGER NOT NULL,
 package_id TEXT REFERENCES merchant_packages(id),state TEXT NOT NULL CHECK(state IN ('PROPOSED','REPLAN_REQUIRED','PROPOSAL_STALE','CONFIRMED')),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),explanation TEXT NOT NULL,explanation_source TEXT NOT NULL CHECK(explanation_source IN ('OPENAI','OFFLINE_DEMO')),
 created_at TEXT NOT NULL,commitment_fingerprint TEXT,financial_state TEXT NOT NULL DEFAULT 'AWAITING_COMMITMENTS',UNIQUE(goal_id,revision));
INSERT INTO proposals_v4 SELECT * FROM proposals;
DROP TABLE proposals;
ALTER TABLE proposals_v4 RENAME TO proposals;
CREATE INDEX proposal_goal_revision ON proposals(goal_id,revision DESC);
CREATE TABLE capture_sagas(
 id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id),proposal_version INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PREFLIGHT','READY','CAPTURING','RECONCILING','CONFIRMED','CAPTURE_FAILED','COMPENSATING','COMPENSATED','COMPENSATION_FAILED','REQUIRES_MANUAL_REVIEW')),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),negative_test INTEGER NOT NULL DEFAULT 0 CHECK(negative_test IN (0,1)),
 failure_reason TEXT,frozen_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT,
 lock_owner TEXT,lock_until TEXT);
CREATE TABLE financial_steps(
 id TEXT PRIMARY KEY,saga_id TEXT NOT NULL REFERENCES capture_sagas(id),commitment_id TEXT NOT NULL REFERENCES commitments(id),position INTEGER NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('CAPTURE','REFUND','VOID')),state TEXT NOT NULL CHECK(state IN ('PENDING','REQUESTING','UNKNOWN','SUCCEEDED','FAILED')),
 request_id TEXT NOT NULL UNIQUE CHECK(length(request_id)<=38),authorization_id TEXT NOT NULL,capture_id TEXT,refund_id TEXT,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),currency TEXT NOT NULL CHECK(currency='USD'),
 attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,provider_status TEXT,first_attempt_at TEXT,verified_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(saga_id,commitment_id,operation));
CREATE INDEX financial_steps_saga ON financial_steps(saga_id,position,operation);
CREATE TRIGGER immutable_step_identity BEFORE UPDATE OF saga_id,commitment_id,position,operation,request_id,authorization_id,amount_cents,currency ON financial_steps
 BEGIN SELECT RAISE(ABORT,'FINANCIAL_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER immutable_saga_snapshot BEFORE UPDATE OF proposal_id,proposal_version,snapshot_json,negative_test ON capture_sagas
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
-- Approved terms remain immutable forever once execution is frozen. Financial status/IDs may advance.
CREATE TRIGGER frozen_allocations_update BEFORE UPDATE ON proposal_allocations
 WHEN EXISTS(SELECT 1 FROM capture_sagas WHERE proposal_id=OLD.proposal_id AND frozen_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER frozen_allocations_delete BEFORE DELETE ON proposal_allocations
 WHEN EXISTS(SELECT 1 FROM capture_sagas WHERE proposal_id=OLD.proposal_id AND frozen_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER frozen_commitment_terms BEFORE UPDATE OF allocation_id,authorized_ceiling_cents,currency,proposal_version,proposal_fingerprint,approved_envelope_json ON commitments
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposal_allocations a ON a.proposal_id=s.proposal_id WHERE a.id=OLD.allocation_id AND s.frozen_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER frozen_proposal_terms BEFORE UPDATE OF result_json,package_id,revision,commitment_fingerprint ON proposals
 WHEN EXISTS(SELECT 1 FROM capture_sagas WHERE proposal_id=OLD.id AND frozen_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_constraints_update BEFORE UPDATE ON constraints
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=OLD.group_id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_catalog_update BEFORE UPDATE ON merchant_packages
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id WHERE p.package_id=OLD.id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_constraint_delete BEFORE DELETE ON constraints
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=OLD.group_id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_goal_revision BEFORE UPDATE OF revision,description,group_id ON purchase_goals
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id WHERE p.goal_id=OLD.id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_member_delete BEFORE DELETE ON group_members
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=OLD.group_id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_member_update BEFORE UPDATE ON group_members
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=OLD.group_id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_member_insert BEFORE INSERT ON group_members
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=NEW.group_id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER frozen_allocation_insert BEFORE INSERT ON proposal_allocations
 WHEN EXISTS(SELECT 1 FROM capture_sagas WHERE proposal_id=NEW.proposal_id AND frozen_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
CREATE TRIGGER active_group_update BEFORE UPDATE ON groups
 WHEN EXISTS(SELECT 1 FROM capture_sagas s JOIN proposals p ON p.id=s.proposal_id JOIN purchase_goals g ON g.id=p.goal_id WHERE g.group_id=OLD.id AND s.frozen_at IS NOT NULL AND s.state NOT IN ('CONFIRMED','COMPENSATED'))
 BEGIN SELECT RAISE(ABORT,'TRANSACTION_TERMS_FROZEN'); END;
