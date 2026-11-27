-- Reader reward gallery is informational. Keep historical redemptions and staff fulfillment intact.
begin;
revoke execute on function sora_v2.reader_redeem_shop_reward(integer, uuid) from public, anon, authenticated;
commit;
