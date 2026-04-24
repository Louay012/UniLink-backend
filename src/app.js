const express = require("express");
const cors = require("cors");
const path = require("path");

const apiRoutes = require("./routes");
const { attachResolvedUser } = require("./middlewares/auth.middleware");

const app = express();

app.use(cors());
app.use(express.json());
app.use(attachResolvedUser);
app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")));

app.use("/api", apiRoutes);

module.exports = app;
