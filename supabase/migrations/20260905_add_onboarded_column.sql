-- Migration: Add onboarded column to profiles
alter table profiles add column if not exists onboarded boolean default false;

-- Backfill existing profiles so current accounts aren't forced through onboarding
update profiles set onboarded = true where onboarded is null;
