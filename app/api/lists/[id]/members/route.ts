import { connection } from "next/server";
import { currentListViewer } from "@/lib/list-viewer";
import { normalizePhone } from "@/lib/phone";
import { addListMember, memberOnList, type ListMember } from "@/lib/store";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request, ctx: RouteContext<"/api/lists/[id]/members">) {
  await connection();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const phone = body.phone ? normalizePhone(String(body.phone)) : null;
  const email = emailPattern.test(String(body.email ?? "").trim()) ? String(body.email).trim().toLowerCase() : "";
  if (body.phone && !phone) return Response.json({ error: "Enter a phone number, including the area code." }, { status: 400 });
  if (body.email && !email) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (!phone && !email) return Response.json({ error: "Add a phone number or email." }, { status: 400 });

  const name = String(body.name ?? "").trim() || phone || email;
  const viewer = await currentListViewer();
  const member: ListMember = { name };
  if (phone) member.phone = phone;
  if (email) member.email = email;
  if (viewer && memberOnList(member, viewer)) member.userId = viewer.userId;

  const list = addListMember(id, member);
  if (!list) return Response.json({ error: "List not found" }, { status: 404 });
  return Response.json({
    members: (list.members ?? []).map((entry) => ({ name: entry.name, userId: entry.userId })),
  });
}
