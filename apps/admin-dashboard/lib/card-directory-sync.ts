import { database } from "./supabase";

const RETRY_DELAY_MS = 2_000;

export function subscribeToCardDirectory(onChange: () => void) {
  let disposed = false;
  let retryTimer: number | null = null;
  let channel: ReturnType<ReturnType<typeof database>["channel"]> | null = null;

  const reconnect = () => {
    if (disposed || retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void connect();
    }, RETRY_DELAY_MS);
  };

  const connect = async () => {
    if (disposed) return;
    if (channel) await database().removeChannel(channel);
    channel = database()
      .channel(`terminal-card-directory-${Date.now()}-${Math.random()}`)
      .on("postgres_changes", { event: "*", schema: "sora_v2", table: "librarycard" }, onChange)
      .on("postgres_changes", { event: "*", schema: "sora_v2", table: "users" }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "sora_v2", table: "terminal_card_sync" }, onChange)
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reconnect();
      });
  };

  void connect();
  return () => {
    disposed = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    if (channel) void database().removeChannel(channel);
  };
}
