import { redirect } from "next/navigation";

// v4 is the main board now; keep old links working.
export default function V4LeaderboardRedirect() {
  redirect("/leaderboard");
}
