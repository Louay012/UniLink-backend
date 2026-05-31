const express = require("express");
const adminController = require("../controllers/admin.controller");
const requireAdmin = require("../middlewares/requireAdmin.middleware");
const upload  = require('../middlewares/upload.middleware');
const { bulkCreateUsers } = require('../controllers/bulkUser.controller');

const router = express.Router();

// All routes below this line require the user to be an ADMIN
router.use("/admin", requireAdmin);

router.get("/admin/users",           adminController.getAllUsers);
router.get("/admin/audit-logs",      adminController.getAuditLogs);
router.get("/admin/courses",         adminController.getAllCourses);
router.get("/admin/coursesinfo",         adminController.getAllCoursesinfo);
router.post("/admin/courses",        adminController.createCourse);
router.get("/admin/departments",     adminController.getAllDepartments);
router.get("/admin/levels",          adminController.getAllLevels);
router.get("/admin/class-groups",    adminController.getAllClassGroups);
router.post("/admin/class-groups",   adminController.createClassGroup);
router.patch("/admin/users/:id/class-group", adminController.assignUserClassGroup);
router.patch("/admin/courses/:id/class-group", adminController.assignCourseClassGroup);
router.post("/admin/users/:id/courses", adminController.assignCourse);
router.get("/admin/users/:id",       adminController.getUserById);
router.get("/admin/users/:id/details", adminController.getUserDetails);
router.patch("/admin/users/:id",    adminController.updateUser);
router.post("/admin/users",          adminController.createUser);
router.patch("/admin/users/:id/role",adminController.updateUserRole);
router.patch("/admin/users/:id/teacher", adminController.updateTeacherProfile);
router.delete("/admin/users/:id",    adminController.deleteUser);
router.get('/admin/stats', adminController.getStats);
router.post('/admin/bulk', upload.single('file'), bulkCreateUsers);

module.exports = router;
