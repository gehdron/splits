-- Run this once in the Supabase SQL editor if groups already exist.
-- Lets a member delete their own membership. Owners delete the group instead.

drop policy if exists "members leave a group" on public.group_members;
create policy "members leave a group"
  on public.group_members for delete to authenticated
  using (user_id = auth.uid() and role = 'member');
