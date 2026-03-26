const { data } = require("../config/db");

function getUserById(userId) {
  return data.users.find((user) => user.id === userId) || null;
}

function sameClassGroup(left, right) {
  return left.classGroupCode && left.classGroupCode === right.classGroupCode;
}

function studentCanMessageTeacher(student, teacher) {
  return data.courses.some(
    (course) => course.teacherId === teacher.id && course.classGroupCode === student.classGroupCode
  );
}

function canDirectMessage(sender, target) {
  if (!sender || !target || sender.id === target.id) {
    return false;
  }

  const pair = [sender.role, target.role].sort().join("-");

  if (pair === "STUDENT-STUDENT") {
    return false;
  }

  if (pair === "STUDENT-TEACHER") {
    const student = sender.role === "STUDENT" ? sender : target;
    const teacher = sender.role === "TEACHER" ? sender : target;
    return studentCanMessageTeacher(student, teacher);
  }

  if (pair === "COORDINATOR-STUDENT") {
    return sameClassGroup(sender, target);
  }

  if (pair === "TEACHER-TEACHER") {
    return true;
  }

  if (pair === "COORDINATOR-TEACHER") {
    return true;
  }

  if (pair === "COORDINATOR-COORDINATOR") {
    return true;
  }

  return false;
}

function canAccessChat(userId, chatId) {
  return data.chatMembers.some((member) => member.chatId === chatId && member.userId === userId);
}

function formatChatForUser(chat, userId) {
  const memberRows = data.chatMembers.filter((member) => member.chatId === chat.id);
  const members = memberRows
    .map((member) => getUserById(member.userId))
    .filter(Boolean)
    .map((member) => ({ id: member.id, name: member.name, role: member.role }));

  const chatMessages = data.messages
    .filter((message) => message.chatId === chat.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const lastMessage = chatMessages[0] || null;

  let title = chat.name;
  if (chat.chatType === "DIRECT") {
    const counterpart = members.find((member) => member.id !== userId);
    title = counterpart ? counterpart.name : "Direct Chat";
  }

  return {
    ...chat,
    title,
    members,
    messageCount: chatMessages.length,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          senderUserId: lastMessage.senderUserId,
          body: lastMessage.body,
          createdAt: lastMessage.createdAt
        }
      : null
  };
}

function listAllowedContacts(user) {
  return data.users
    .filter((candidate) => candidate.id !== user.id)
    .filter((candidate) => canDirectMessage(user, candidate))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      role: candidate.role,
      classGroupCode: candidate.classGroupCode
    }));
}

function listUserChats(userId, courseId) {
  const visibleChatIds = data.chatMembers
    .filter((member) => member.userId === userId)
    .map((member) => member.chatId);

  return data.chats
    .filter((chat) => visibleChatIds.includes(chat.id))
    .filter((chat) => {
      if (!courseId) {
        return true;
      }
      return chat.courseId === courseId;
    })
    .map((chat) => formatChatForUser(chat, userId))
    .sort((left, right) => {
      const leftTime = left.lastMessage ? new Date(left.lastMessage.createdAt).getTime() : 0;
      const rightTime = right.lastMessage ? new Date(right.lastMessage.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

function createOrGetDirectChat(user, targetUserId, initialMessage) {
  const target = getUserById(targetUserId);
  if (!target) {
    return { status: 404, body: { message: "Target user not found." } };
  }

  if (!canDirectMessage(user, target)) {
    return { status: 403, body: { message: "Direct chat not allowed by messaging policy." } };
  }

  let chat = data.chats.find((candidate) => {
    if (candidate.chatType !== "DIRECT") {
      return false;
    }

    const members = data.chatMembers
      .filter((member) => member.chatId === candidate.id)
      .map((member) => member.userId);
    return members.length === 2 && members.includes(user.id) && members.includes(target.id);
  });

  const wasCreated = !chat;
  if (!chat) {
    chat = {
      id: `chat-direct-${Date.now()}`,
      chatType: "DIRECT",
      name: null,
      classGroupCode: null,
      courseId: null,
      createdBy: user.id
    };

    data.chats.push(chat);
    data.chatMembers.push({ chatId: chat.id, userId: user.id });
    data.chatMembers.push({ chatId: chat.id, userId: target.id });
  }

  if (initialMessage) {
    data.messages.push({
      id: `m-${Date.now()}`,
      chatId: chat.id,
      senderUserId: user.id,
      body: initialMessage,
      createdAt: new Date().toISOString()
    });
  }

  return {
    status: wasCreated ? 201 : 200,
    body: {
      chat: formatChatForUser(chat, user.id)
    }
  };
}

function getChatById(chatId) {
  return data.chats.find((chat) => chat.id === chatId) || null;
}

module.exports = {
  getUserById,
  canAccessChat,
  formatChatForUser,
  listAllowedContacts,
  listUserChats,
  createOrGetDirectChat,
  getChatById
};
