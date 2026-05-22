-- =============================================================================
-- MIGRATION: Fix message_reads schema
-- Run this ONCE against the live database to align it with group.service.js
-- =============================================================================
-- The old schema used (message_id, user_id) as PK — one row per message read.
-- The new schema uses (user_id, chat_id) as PK — one row per user per chat,
-- tracking the last message they read. This is more efficient and is what
-- group.service.js:markChatRead writes to.
-- =============================================================================

BEGIN;

-- Step 1: Drop the old table (we lose read history but it's all stale anyway)
DROP TABLE IF EXISTS message_reads;

-- Step 2: Re-create with the correct schema
CREATE TABLE message_reads (
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id               UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    last_read_message_id  UUID REFERENCES messages(id) ON DELETE SET NULL,
    read_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_user_chat ON message_reads(user_id, chat_id);

COMMIT;
