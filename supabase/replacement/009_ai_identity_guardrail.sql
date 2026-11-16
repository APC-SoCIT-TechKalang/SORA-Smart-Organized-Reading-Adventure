-- Permit valid account identity questions without weakening the other AI
-- request protections. Safe to run on an existing installation.
begin;

create or replace function sora_v2.ai_prompt_rejection_reason(p_prompt text)
returns text language plpgsql immutable set search_path = '' as $$
declare normalized text := lower(coalesce(btrim(p_prompt), ''));
begin
  if char_length(normalized) < 2 then return 'Request is empty or too short'; end if;
  if char_length(normalized) > 500 then return 'Request exceeds 500 characters'; end if;
  if normalized ~ '(ignore (all |the )?(previous|system)|system prompt|developer message|jailbreak|bypass (the )?(rules|guardrails)|api[_ -]?key|service[_ -]?role|password|drop table|delete from|alter table)' then
    return 'Request contains unsafe instructions or secret-access attempts';
  end if;
  if normalized ~ '(explicit sexual|porn|nude|rape|how to kill|make a bomb|self[ -]?harm|suicide instructions)' then
    return 'Request contains inappropriate or harmful content';
  end if;
  if normalized !~ '(book|manga|novel|read|reading|author|genre|catalog|library|shelf|available|recommend|quest|reward|progress|account|profile|membership|rank|points|who am i|my name|know me|identify me|sora|bon|hello|hi|help|thank)' then
    return 'Request is unrelated to the library system';
  end if;
  return null;
end;
$$;

revoke all on function sora_v2.ai_prompt_rejection_reason(text)
  from public, anon, authenticated;
grant execute on function sora_v2.ai_prompt_rejection_reason(text)
  to service_role;

commit;
