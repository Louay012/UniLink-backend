const users = [
  { id: "u-student-1", name: "Meriem Ben Ali", role: "STUDENT", classGroupCode: "GL4-A" },
  { id: "u-teacher-1", name: "Dr. Sami Trabelsi", role: "TEACHER", classGroupCode: "GL4-A" },
  { id: "u-teacher-2", name: "Dr. Aya Jlassi", role: "TEACHER", classGroupCode: "GL4-A" },
  { id: "u-coordinator-1", name: "Pr. Leila Mansour", role: "COORDINATOR", classGroupCode: "GL4-A" }
];

const courses = [
  {
    id: "c-1",
    code: "GL4A-ALGO",
    title: "Advanced Algorithms",
    description: "Complexity, graph algorithms, and optimization techniques.",
    classGroupCode: "GL4-A",
    teacherId: "u-teacher-1",
    semester: "S2",
    color: "#0E6BA8"
  },
  {
    id: "c-2",
    code: "GL4A-WEB",
    title: "Web Engineering",
    description: "Modern web architecture, APIs, and frontend integration.",
    classGroupCode: "GL4-A",
    teacherId: "u-teacher-2",
    semester: "S2",
    color: "#118AB2"
  }
];

const attachments = [
  {
    id: "a-1",
    courseId: "c-1",
    title: "Chapter 1 - Divide and Conquer",
    type: "pdf",
    size: "2.4 MB",
    uploadedAt: "2026-03-22T09:00:00Z",
    url: "#"
  },
  {
    id: "a-2",
    courseId: "c-1",
    title: "Lab Sheet 01",
    type: "docx",
    size: "510 KB",
    uploadedAt: "2026-03-23T13:30:00Z",
    url: "#"
  },
  {
    id: "a-3",
    courseId: "c-2",
    title: "REST API Checklist",
    type: "pdf",
    size: "1.1 MB",
    uploadedAt: "2026-03-21T11:15:00Z",
    url: "#"
  }
];

const announcements = [
  {
    id: "n-1",
    courseId: "c-1",
    title: "Quiz next Monday",
    body: "Quiz covers Chapters 1 and 2. Duration: 30 minutes.",
    createdAt: "2026-03-23T08:10:00Z",
    createdBy: "u-teacher-1"
  },
  {
    id: "n-2",
    courseId: "c-2",
    title: "Project brief uploaded",
    body: "Project brief and grading rubric are now available in attachments.",
    createdAt: "2026-03-24T10:45:00Z",
    createdBy: "u-teacher-2"
  }
];

const chats = [
  {
    id: "chat-class-gl4a",
    chatType: "GENERAL_CLASS",
    name: "GL4-A General",
    classGroupCode: "GL4-A",
    courseId: null,
    createdBy: "u-coordinator-1"
  },
  {
    id: "chat-course-c-1",
    chatType: "COURSE",
    name: "Advanced Algorithms Chat",
    classGroupCode: "GL4-A",
    courseId: "c-1",
    createdBy: "u-teacher-1"
  },
  {
    id: "chat-course-c-2",
    chatType: "COURSE",
    name: "Web Engineering Chat",
    classGroupCode: "GL4-A",
    courseId: "c-2",
    createdBy: "u-teacher-2"
  }
];

const chatMembers = [
  { chatId: "chat-class-gl4a", userId: "u-student-1" },
  { chatId: "chat-class-gl4a", userId: "u-coordinator-1" },

  { chatId: "chat-course-c-1", userId: "u-student-1" },
  { chatId: "chat-course-c-1", userId: "u-teacher-1" },

  { chatId: "chat-course-c-2", userId: "u-student-1" },
  { chatId: "chat-course-c-2", userId: "u-teacher-2" }
];

const messages = [
  {
    id: "m-1",
    chatId: "chat-course-c-1",
    senderUserId: "u-teacher-1",
    body: "Welcome to the course chat. Use this channel for quick questions.",
    createdAt: "2026-03-24T09:00:00Z"
  },
  {
    id: "m-2",
    chatId: "chat-course-c-1",
    senderUserId: "u-student-1",
    body: "Thank you, professor. Will we have office hours this week?",
    createdAt: "2026-03-24T09:18:00Z"
  }
];

module.exports = {
  users,
  courses,
  attachments,
  announcements,
  chats,
  chatMembers,
  messages
};
