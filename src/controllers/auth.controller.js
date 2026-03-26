function health(_req, res) {
  res.json({ status: "ok", service: "unilink-backend" });
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = {
  health,
  me
};
