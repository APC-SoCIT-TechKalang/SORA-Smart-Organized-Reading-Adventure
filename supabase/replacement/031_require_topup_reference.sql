-- Apply to an existing sora_v2 database to require a reference on new top-ups.
-- NOT VALID preserves historic transactions with missing references; PostgreSQL
-- still checks every new or updated row. Reconcile old rows before validating it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'sora_v2.topup_transactions'::regclass
      and conname = 'topup_transactions_reference_required'
  ) then
    alter table sora_v2.topup_transactions
      add constraint topup_transactions_reference_required
      check (nullif(btrim(payment_reference), '') is not null) not valid;
  end if;
end;
$$;
