declare const todoIdBrand: unique symbol;

export type TodoId = string & {
  readonly [todoIdBrand]: "TodoId";
};

export function parseTodoId(value: string): TodoId {
  if (value.trim().length === 0) {
    throw new Error("TodoId cannot be empty");
  }

  return value as TodoId;
}
