-- babyscale schema. Idempotent: safe to run on every deploy.
create table if not exists babies (
  id            text primary key,             -- public id in the editor URL (/b/<id>)
  name          text not null,
  birth_date    date not null,
  sex           text not null check (sex in ('girl', 'boy', 'unspecified')),
  units         text not null default 'lb' check (units in ('lb', 'kg')),
  password_hash text not null,                -- scrypt, "salt:hash" hex
  share_token   text not null unique,         -- read-only link (/s/<token>)
  device_token  text not null unique,         -- bearer token for /api/ingest
  created_at    timestamptz not null default now()
);

create table if not exists entries (
  id          bigserial primary key,
  baby_id     text not null references babies(id) on delete cascade,
  grams       integer not null check (grams > 0 and grams < 50000),
  measured_at timestamptz not null,
  source      text not null check (source in ('manual', 'device')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists entries_baby_time on entries (baby_id, measured_at);

-- Scale bridges. A bridge makes a random key on first boot and registers itself with its first
-- reading (trust on first use). Editors link a bridge to one or more babies (or pets) in the app.
create table if not exists bridges (
  id           text primary key,              -- the bridge's MAC, 12 uppercase hex digits
  key_hash     text not null,                 -- sha256 hex of the bridge's key
  fw_version   text,
  last_seen_at timestamptz,
  last_grams   integer,
  created_at   timestamptz not null default now()
);

create table if not exists bridge_links (
  bridge_id  text not null references bridges(id) on delete cascade,
  baby_id    text not null references babies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bridge_id, baby_id)
);

alter table entries add column if not exists bridge_id text references bridges(id) on delete set null;

-- Accounts: sign in by emailed magic link. A session cookie (400 days, renewed on each visit)
-- keeps a browser signed in. Babies have members; the creator is the owner.
create table if not exists users (
  id         text primary key,
  email      text not null unique,             -- lowercase
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,                 -- sha256 hex of the cookie value
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists login_tokens (
  token_hash text primary key,                 -- sha256 hex of the token in the emailed link
  email      text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists baby_members (
  baby_id    text not null references babies(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  role       text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (baby_id, user_id)
);

-- Per-baby passwords are retired; the column stays for old rows.
alter table babies alter column password_hash drop not null;

-- Scale readings wait in an inbox until someone saves them; unsaved ones archive after 7 days.
alter table entries add column if not exists status text not null default 'saved'
  check (status in ('pending', 'saved', 'archived'));
create index if not exists entries_baby_status_time on entries (baby_id, status, measured_at);

-- Bridges belong to people (a household), not to one baby: readings from a claimed bridge land
-- in that person's inbox and get assigned with one tap. Readings may wait with no baby yet.
create table if not exists bridge_users (
  bridge_id  text not null references bridges(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bridge_id, user_id)
);
insert into bridge_users (bridge_id, user_id)
  select distinct l.bridge_id, m.user_id from bridge_links l join baby_members m on m.baby_id = l.baby_id
  on conflict do nothing;
alter table entries alter column baby_id drop not null;

-- Web push: one row per browser/phone that asked for notifications.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    text not null references users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Rate limits: one row per counted event, keyed like "signin-ip:1.2.3.4" or "bridge:D80BCB2B7D1D".
-- lib/rate.ts writes it and deletes rows older than 2 days as it goes.
create table if not exists rate_events (
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists rate_events_key on rate_events (key, at);
create index if not exists rate_events_at on rate_events (at);
