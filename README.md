# S.O.R.A. — Smart Organized Reading Adventure

This repository contains two independently deployable web applications backed by
Supabase:

- `apps/bonbon-ui-user/`: the public reader experience (Vite + React static build)
- `apps/admin-dashboard/`: the staff dashboard (Next.js server deployment)
- `supabase/`: versioned PostgreSQL schema, RLS policies, functions, storage
  policies, and seed data

Read [DEPLOYMENT.md](DEPLOYMENT.md) before provisioning a production environment.

## S.O.R.A. fixed database

The project now uses the corrected 16-table database design and matching
reader/admin workflows. The technical migration and verification notes are in
[supabase/replacement/TEACHER_UPDATE.md](supabase/replacement/TEACHER_UPDATE.md).
