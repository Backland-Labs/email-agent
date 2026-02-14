import { completeTodo, createPendingTodo, parseTodoId } from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("todo workflow", () => {
  it("creates and completes a todo", () => {
    const id = parseTodoId("todo_123");
    const pending = createPendingTodo(id, "  Write tests  ");

    expect(pending).toEqual({
      id,
      title: "Write tests",
      status: "pending"
    });

    const completed = completeTodo(pending);

    expect(completed).toEqual({
      id,
      title: "Write tests",
      status: "done"
    });
  });

  it("rejects empty ids", () => {
    expect(() => parseTodoId("")).toThrowError("TodoId cannot be empty");
  });

  it("rejects blank titles", () => {
    const id = parseTodoId("todo_124");

    expect(() => createPendingTodo(id, "   ")).toThrowError("Title cannot be empty");
  });
});
