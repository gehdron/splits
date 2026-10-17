import { connection } from "next/server";
import { createList, listAll } from "@/lib/store";

export async function GET() {
  await connection();
  return Response.json(listAll());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const list = createList(body.name || "Shared list");
  return Response.json(list, { status: 201 });
}