export default async () => {
  const siteUrl = process.env.URL?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!siteUrl || !cronSecret) {
    throw new Error("Tournament lifecycle scheduler requires URL and CRON_SECRET environment variables.");
  }

  const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/admin/tournaments/lifecycle`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "cache-control": "no-cache",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Tournament lifecycle endpoint failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const result = await response.json().catch(() => ({}));
  console.log("Tournament lifecycle scheduler completed", result);
}

export const config = {
  schedule: "* * * * *",
};
