export function handleHealthEndpoint(): Response {
  return Response.json({ status: "ok" }, { status: 200 });
}
