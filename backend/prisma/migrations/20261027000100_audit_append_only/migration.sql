-- The audit trail is append-only at the database level.
-- Even an application bug or a direct SQL session cannot rewrite history.
CREATE OR REPLACE FUNCTION audit_event_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_block_mutation();

CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_block_mutation();

CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_block_mutation();
