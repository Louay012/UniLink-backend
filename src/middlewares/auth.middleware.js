const { data } = require("../config/db");

function resolveUser(req) {
  const role = (req.query.role || req.header("x-role") || "STUDENT").toUpperCase();
  const userId = req.query.userId || req.header("x-user-id");

  const fallbackUser = data.users.find((u) => u.role === role) || data.users[0];
  const user = data.users.find((u) => u.id === userId) || fallbackUser;

  return {
    id: user.id,
    role,
    classGroupCode: user.classGroupCode
  };
}

function attachResolvedUser(req, _res, next) {
  req.user = resolveUser(req);
  next();
}

module.exports = {
  resolveUser,
  attachResolvedUser
};
