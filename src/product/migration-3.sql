ALTER TABLE commitments ADD COLUMN approved_envelope_json TEXT CHECK (approved_envelope_json IS NULL OR json_valid(approved_envelope_json));
