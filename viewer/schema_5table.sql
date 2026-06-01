-- schema_5table.sql — PB canonical 5-table runtime storage (docs/ERP.md §0, §0.1)
-- Witness: PB gate §BRIDGE (scripts/test_bridge.js).
--
-- The 5 tables are GENERIC. Every domain field (C_Order's ~60 columns, etc.) lives
-- in `metadata` JSON keyed by AD ColumnName; the P0 manifest tells the UI which keys
-- to render per doc_type. This is what lets 5 tables hold 1003 tables' worth of fields.
-- Structural relationships get real columns (the gate-derived set, ERP.md §0):
--   derivation lineage      -> documents.source_id
--   sub-document            -> documents.parent_id
--   line -> its document    -> document_lines.document_id
--   line-level lineage      -> document_lines.source_line_id   (InvoiceLine->OrderLine)
--   settlement / 3-way match-> document_lines.match_type + source_line_id + metadata ref
--   master recursion        -> items.parent_id                  (Product->Category)
--   spatial hierarchy       -> containers.parent_id
--   ledger Batch->Journal   -> journal.batch_id / journal.journal_id
-- Citations (a row naming another by id) are always representable as a metadata ref.
--
-- IDs are TEXT so the op-log can use GUIDs (acceptance discipline #5: no MAX+1).
-- The bridge stores a legacy AD key as String(<Table>_ID); ad_data reconstructs it.
--
-- RECONCILIATION RESOLVED (2026-05-29, docs/ERP.md §0.2): THIS is the single canonical
-- 5-table runtime. doc_engine.js (Spatial ERP POC) defined same-named tables with
-- different columns but is UNREACHABLE dead code (its only consumer erp_panel.js is
-- loaded by no HTML). It is retired as the P3b reference oracle, NOT a live engine —
-- so there is no shared-DB hazard. kernel_ops.js stays the shared module.

CREATE TABLE IF NOT EXISTS containers (
  id        TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES containers(id),  -- Site->Building->Floor
  type      TEXT NOT NULL,                   -- legacy AD TableName (the "category")
  metadata  TEXT NOT NULL DEFAULT '{}'       -- domain fields keyed by ColumnName
);

CREATE TABLE IF NOT EXISTS items (
  id        TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES items(id),       -- master is recursive: Product->Category
  type      TEXT NOT NULL,                   -- legacy AD TableName
  metadata  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  doc_type     TEXT NOT NULL,                -- 1:1 with legacy AD TableName (hub preserved)
  doc_status   TEXT DEFAULT 'DR',            -- AD DocStatus value (DR/IP/CO/VO/CL/RE)
  source_id    TEXT REFERENCES documents(id),-- derivation lineage (Invoice->Order)
  parent_id    TEXT REFERENCES documents(id),-- sub-document (ProductionPlan->Production)
  container_id TEXT REFERENCES containers(id),
  metadata     TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS document_lines (
  id             TEXT PRIMARY KEY,
  document_id    TEXT REFERENCES documents(id),       -- the line's owning document
  source_line_id TEXT REFERENCES document_lines(id),  -- line lineage (InvoiceLine->OrderLine)
  line_no        INTEGER,                              -- AD "Line" sequence
  match_type     TEXT,                                 -- settlement edge tag (MATCH_INV/MATCH_PO/CONFIRM/LANDED_COST); NULL for plain lines
  metadata       TEXT NOT NULL DEFAULT '{}'            -- domain fields + counterpart line-refs
);

CREATE TABLE IF NOT EXISTS journal (
  id         TEXT PRIMARY KEY,
  batch_id   TEXT,                            -- GL_JournalBatch
  journal_id TEXT,                            -- GL_Journal (Batch->Journal->Line)
  source     TEXT REFERENCES documents(id),   -- the document this posting derives from
  metadata   TEXT NOT NULL DEFAULT '{}'       -- account/debit/credit/etc. as Fact_Acct fields
);

-- kernel_ops already exists (kernel_ops.js ensureTable). The 5 tables above are a
-- rebuildable projection of that log (event sourcing, ERP.md §0).

CREATE INDEX IF NOT EXISTS idx_documents_type      ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_source    ON documents(source_id);
CREATE INDEX IF NOT EXISTS idx_doclines_document   ON document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_doclines_sourceline ON document_lines(source_line_id);
CREATE INDEX IF NOT EXISTS idx_items_parent        ON items(parent_id);
CREATE INDEX IF NOT EXISTS idx_containers_parent   ON containers(parent_id);
