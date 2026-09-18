-- Migration: 202609180002_private_realtime_channels.sql
-- Enforce Supabase Realtime Authorization for private channels:
-- Allows authenticated users to subscribe (SELECT) and broadcast (INSERT)
-- only on private grocery channels ('grocery:<sessionId>') that belong to them.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    -- Drop existing policies if they exist
    drop policy if exists "Users can subscribe to own grocery session channels" on realtime.messages;
    drop policy if exists "Users can broadcast to own grocery session channels" on realtime.messages;

    -- SELECT policy for subscribing to private channel broadcasts
    create policy "Users can subscribe to own grocery session channels"
      on realtime.messages for select to authenticated
      using (
        extension = 'broadcast'
        and topic like 'grocery:%'
        and exists (
          select 1 from public.grocery_sessions
          where id::text = split_part(topic, ':', 2)
            and user_id = (select auth.uid())
        )
      );

    -- INSERT policy for sending broadcasts on private channels
    create policy "Users can broadcast to own grocery session channels"
      on realtime.messages for insert to authenticated
      with check (
        extension = 'broadcast'
        and topic like 'grocery:%'
        and exists (
          select 1 from public.grocery_sessions
          where id::text = split_part(topic, ':', 2)
            and user_id = (select auth.uid())
        )
      );
  end if;
end
$$;
