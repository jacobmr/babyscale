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
