import { NextRequest } from "next/server";

const BACKEND_API_BASE = process.env.BACKEND_API_BASE ?? "http://127.0.0.1:8010";

const proxyRequest = async (request: NextRequest, path: string[]) => {
  const target = new URL(`/api/${path.join("/")}`, BACKEND_API_BASE);
  target.search = request.nextUrl.search;

  const response = await fetch(target, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
};

export const GET = (request: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
  context.params.then(({ path }) => proxyRequest(request, path));

export const POST = (request: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
  context.params.then(({ path }) => proxyRequest(request, path));
