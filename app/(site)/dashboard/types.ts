export type DashGroup = {
  id: string;
  name: string;
  role: "owner" | "member";
};

export type DashMember = {
  id: string;
  groupId: string;
  userId: string;
  name: string;
  phone: string;
  role: "owner" | "member";
};

export type DashItem = {
  id: string;
  groupId: string;
  listName: string;
  name: string;
  quantity: number;
  priceCents: number;
  claimedBy: string[];
};

export type DashTotal = {
  groupId: string;
  userId: string;
  name: string;
  totalCents: number;
};

export type DashboardData = {
  me: { id: string; name: string; email: string; phone: string };
  groups: DashGroup[];
  members: DashMember[];
  items: DashItem[];
  totals: DashTotal[];
  selectedGroupId: string | null;
  loadError: string | null;
};
