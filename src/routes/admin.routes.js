const express = require("express");
const adminController = require("../controllers/admin.controller");
const requireAdmin = require("../middlewares/requireAdmin.middleware");

const router = express.Router();

// All routes below this line require the user to be an ADMIN
router.use(requireAdmin);

router.get("/admin/users",           adminController.getAllUsers);
router.get("/admin/courses",         adminController.getAllCourses);
router.post("/admin/users/:id/courses", adminController.assignCourse);
router.get("/admin/users/:id",       adminController.getUserById);
router.post("/admin/users",          adminController.createUser);
router.patch("/admin/users/:id/role",adminController.updateUserRole);
router.delete("/admin/users/:id",    adminController.deleteUser);

module.exports = router;