import type { TodoItem } from "../../domain/todo-item.js";

export function completeTodo(todo: TodoItem): TodoItem {
  return {
    ...todo,
    status: "done"
  };
}
