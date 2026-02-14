import type { TodoId } from "./todo-id.js";

export type TodoStatus = "pending" | "done";

export type TodoItem = {
  id: TodoId;
  title: string;
  status: TodoStatus;
};

export function createPendingTodo(id: TodoId, title: string): TodoItem {
  const normalizedTitle = title.trim();

  if (normalizedTitle.length === 0) {
    throw new Error("Title cannot be empty");
  }

  return {
    id,
    title: normalizedTitle,
    status: "pending"
  };
}
