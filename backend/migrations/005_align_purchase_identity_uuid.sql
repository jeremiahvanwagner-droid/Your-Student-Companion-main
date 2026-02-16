-- 005_align_purchase_identity_uuid.sql
-- Align purchase/subscription identity fields to canonical UUID user references.

begin;

-- ------------------------------------------------------------------
-- user_purchases: user_id text -> uuid (with clerk_id backfill)
-- ------------------------------------------------------------------
do $$
declare
  purchases_user_type text;
  purchases_pack_type text;
  packs_id_type text;
begin
  if to_regclass('public.user_purchases') is null then
    return;
  end if;

  select data_type
  into purchases_user_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_purchases'
    and column_name = 'user_id';

  if purchases_user_type = 'text' then
    alter table public.user_purchases add column if not exists user_id_uuid uuid;

    update public.user_purchases
    set user_id_uuid = user_id::uuid
    where user_id_uuid is null
      and user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    update public.user_purchases up
    set user_id_uuid = u.id
    from public.users u
    where up.user_id_uuid is null
      and u.clerk_id = up.user_id;

    create table if not exists public.user_purchases_unresolved_backup as
    select * from public.user_purchases with no data;

    insert into public.user_purchases_unresolved_backup
    select *
    from public.user_purchases
    where user_id_uuid is null;

    delete from public.user_purchases
    where user_id_uuid is null;

    alter table public.user_purchases
      drop constraint if exists user_purchases_user_id_course_pack_id_key;

    alter table public.user_purchases
      drop column user_id;

    alter table public.user_purchases
      rename column user_id_uuid to user_id;
  end if;

  -- Convert course_pack_id text -> typed id if needed.
  select data_type
  into purchases_pack_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_purchases'
    and column_name = 'course_pack_id';

  select data_type
  into packs_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'course_packs'
    and column_name = 'id';

  if purchases_pack_type = 'text' and packs_id_type = 'integer' then
    alter table public.user_purchases add column if not exists course_pack_id_int integer;

    update public.user_purchases
    set course_pack_id_int = course_pack_id::integer
    where course_pack_id_int is null
      and course_pack_id ~ '^[0-9]+$';

    insert into public.user_purchases_unresolved_backup
    select *
    from public.user_purchases
    where course_pack_id_int is null;

    delete from public.user_purchases
    where course_pack_id_int is null;

    alter table public.user_purchases drop column course_pack_id;
    alter table public.user_purchases rename column course_pack_id_int to course_pack_id;
  elsif purchases_pack_type = 'text' and packs_id_type = 'bigint' then
    alter table public.user_purchases add column if not exists course_pack_id_bigint bigint;

    update public.user_purchases
    set course_pack_id_bigint = course_pack_id::bigint
    where course_pack_id_bigint is null
      and course_pack_id ~ '^[0-9]+$';

    insert into public.user_purchases_unresolved_backup
    select *
    from public.user_purchases
    where course_pack_id_bigint is null;

    delete from public.user_purchases
    where course_pack_id_bigint is null;

    alter table public.user_purchases drop column course_pack_id;
    alter table public.user_purchases rename column course_pack_id_bigint to course_pack_id;
  elsif purchases_pack_type = 'text' and packs_id_type = 'uuid' then
    alter table public.user_purchases add column if not exists course_pack_id_uuid uuid;

    update public.user_purchases
    set course_pack_id_uuid = course_pack_id::uuid
    where course_pack_id_uuid is null
      and course_pack_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    insert into public.user_purchases_unresolved_backup
    select *
    from public.user_purchases
    where course_pack_id_uuid is null;

    delete from public.user_purchases
    where course_pack_id_uuid is null;

    alter table public.user_purchases drop column course_pack_id;
    alter table public.user_purchases rename column course_pack_id_uuid to course_pack_id;
  end if;

  -- Remove accidental duplicates before re-applying unique constraint.
  delete from public.user_purchases p
  using (
    select ctid
    from (
      select
        ctid,
        row_number() over (
          partition by user_id, course_pack_id
          order by purchased_at desc nulls last, id desc
        ) as rn
      from public.user_purchases
    ) ranked
    where ranked.rn > 1
  ) dup
  where p.ctid = dup.ctid;

  -- Ensure canonical constraints and FKs.
  alter table public.user_purchases
    alter column user_id set not null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_purchases_user_id_fkey'
      and conrelid = 'public.user_purchases'::regclass
  ) then
    alter table public.user_purchases
      add constraint user_purchases_user_id_fkey
      foreign key (user_id)
      references public.users(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_purchases_course_pack_id_fkey'
      and conrelid = 'public.user_purchases'::regclass
  ) then
    begin
      alter table public.user_purchases
        add constraint user_purchases_course_pack_id_fkey
        foreign key (course_pack_id)
        references public.course_packs(id)
        on delete cascade;
    exception
      when others then
        -- Keep migration resilient if legacy type mismatch still exists.
        null;
    end;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_purchases_user_id_course_pack_id_key'
      and conrelid = 'public.user_purchases'::regclass
  ) then
    alter table public.user_purchases
      add constraint user_purchases_user_id_course_pack_id_key
      unique (user_id, course_pack_id);
  end if;
end
$$;

-- ------------------------------------------------------------------
-- user_subscriptions: user_id text -> uuid (with clerk_id backfill)
-- ------------------------------------------------------------------
do $$
declare
  subscriptions_user_type text;
begin
  if to_regclass('public.user_subscriptions') is null then
    return;
  end if;

  select data_type
  into subscriptions_user_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_subscriptions'
    and column_name = 'user_id';

  if subscriptions_user_type = 'text' then
    alter table public.user_subscriptions add column if not exists user_id_uuid uuid;

    update public.user_subscriptions
    set user_id_uuid = user_id::uuid
    where user_id_uuid is null
      and user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    update public.user_subscriptions us
    set user_id_uuid = u.id
    from public.users u
    where us.user_id_uuid is null
      and u.clerk_id = us.user_id;

    create table if not exists public.user_subscriptions_unresolved_backup as
    select * from public.user_subscriptions with no data;

    insert into public.user_subscriptions_unresolved_backup
    select *
    from public.user_subscriptions
    where user_id_uuid is null;

    delete from public.user_subscriptions
    where user_id_uuid is null;

    alter table public.user_subscriptions drop column user_id;
    alter table public.user_subscriptions rename column user_id_uuid to user_id;
  end if;

  alter table public.user_subscriptions
    alter column user_id set not null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_subscriptions_user_id_fkey'
      and conrelid = 'public.user_subscriptions'::regclass
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_user_id_fkey
      foreign key (user_id)
      references public.users(id)
      on delete cascade;
  end if;
end
$$;


-- ------------------------------------------------------------------
-- RLS policy alignment for UUID user identity on purchase/subscription.
-- ------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_purchases') is not null then
    drop policy if exists user_purchases_select_own on public.user_purchases;
    create policy user_purchases_select_own on public.user_purchases
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  if to_regclass('public.user_subscriptions') is not null then
    drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
    create policy user_subscriptions_select_own on public.user_subscriptions
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  if to_regclass('public.content_items') is not null
     and to_regclass('public.user_purchases') is not null
     and to_regclass('public.user_subscriptions') is not null then
    drop policy if exists content_items_select_unlocked on public.content_items;
    create policy content_items_select_unlocked on public.content_items
      for select to authenticated
      using (
        is_published = true
        and (
          exists (
            select 1
            from public.user_purchases up
            where up.user_id = auth.uid()
              and up.course_pack_id = content_items.course_pack_id
              and up.status = 'completed'
          )
          or exists (
            select 1
            from public.user_subscriptions us
            where us.user_id = auth.uid()
              and us.status = 'active'
              and us.plan_type in ('all_access_monthly', 'all_access_annual')
              and (us.current_period_end is null or us.current_period_end > now())
          )
        )
      );
  end if;
end
$$;

commit;
