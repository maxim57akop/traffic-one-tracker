"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

type PostbackItem = {
  id: string;
  name: string;
  goal: string;
  status: string;
  url: string;
};

export default function PostbacksPage() {
  return <AppShell title="Postbacks">{() => <PostbacksManagement />}</AppShell>;
}

function PostbacksManagement() {
  const [origin, setOrigin] = useState("http://127.0.0.1:8080");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOrigin(window.location.origin);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const items = useMemo<PostbackItem[]>(
    () => [
      {
        id: "lead",
        name: "Lead",
        goal: "lead",
        status: "accepted",
        url: `${origin}/lead?subid=REPLACE&payout=REPLACE&currency=USD`,
      },
      {
        id: "lead-rejected",
        name: "Rejected lead",
        goal: "lead",
        status: "rejected",
        url: `${origin}/lead?subid=REPLACE&status=rejected&payout=0&currency=USD`,
      },
      {
        id: "ftd",
        name: "FTD",
        goal: "ftd",
        status: "accepted",
        url: `${origin}/ftd?subid=REPLACE&payout=REPLACE&currency=USD`,
      },
    ],
    [origin],
  );

  async function copyURL(item: PostbackItem) {
    await navigator.clipboard.writeText(item.url);
    setCopied(item.id);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className="space-y-4">
      <div className="border border-neutral-200 bg-white px-5 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-xl font-semibold tracking-normal">Postback URLs</h2>
        <p className="mt-2 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          Send the click identifier in the <span className="font-mono">subid</span> parameter. The redirector also
          adds <span className="font-mono">click_id</span> for compatibility, but postbacks should use <span className="font-mono">subid</span>.
        </p>
      </div>

      <div className="overflow-x-auto border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">Event</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">Goal</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">Status</th>
              <th className="h-10 border-b border-neutral-200 px-3 font-medium dark:border-neutral-800">URL</th>
              <th className="h-10 w-20 border-b border-neutral-200 px-3 text-right font-medium dark:border-neutral-800" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-200 last:border-0 dark:border-neutral-800">
                <td className="h-14 px-3 font-medium">{item.name}</td>
                <td className="h-14 px-3">
                  <span className="rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                    {item.goal}
                  </span>
                </td>
                <td className="h-14 px-3">
                  <span className="rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                    {item.status}
                  </span>
                </td>
                <td className="h-14 px-3">
                  <div className="truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-900">
                    {item.url}
                  </div>
                </td>
                <td className="h-14 px-3 text-right">
                  <Button aria-label={`Copy ${item.name} URL`} size="icon-sm" variant="outline" onClick={() => void copyURL(item)}>
                    {copied === item.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
