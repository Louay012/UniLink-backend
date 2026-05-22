const pool = require("../config/db");
const socketUtils = require("../socket");

async function toggleReaction(req, res) {
  try {
    const { chatId, messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    if (!emoji) return res.status(400).json({ error: "emoji is required" });

    // Check if the reaction already exists
    const exists = await pool.query(
      "SELECT 1 FROM message_reactions WHERE message_id = $1::uuid AND user_id = $2::uuid AND emoji = $3",
      [messageId, userId, emoji]
    );

    if (exists.rows.length > 0) {
      // Remove it
      await pool.query(
        "DELETE FROM message_reactions WHERE message_id = $1::uuid AND user_id = $2::uuid AND emoji = $3",
        [messageId, userId, emoji]
      );
    } else {
      // Add it
      await pool.query(
        "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1::uuid, $2::uuid, $3)",
        [messageId, userId, emoji]
      );
    }

    // Now get all reactions for this message to broadcast
    const reactionsRes = await pool.query(
      "SELECT json_agg(json_build_object('emoji', emoji, 'userId', user_id)) as reactions FROM message_reactions WHERE message_id = $1::uuid",
      [messageId]
    );

    const io = socketUtils.getIo();
    if (io) {
      io.to(chatId).emit("message.reaction.updated", {
        messageId,
        reactions: reactionsRes.rows[0].reactions || []
      });
    }

    res.json({ success: true, reactions: reactionsRes.rows[0].reactions || [] });
  } catch (err) {
    console.error("[toggleReaction]", err);
    res.status(500).json({ error: "Failed to toggle reaction" });
  }
}

module.exports = { toggleReaction };
