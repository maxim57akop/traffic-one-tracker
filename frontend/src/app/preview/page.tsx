"use client";

import { useEffect, useState } from "react";
import { usePageTitle } from "@/lib/page-title";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type PreviewObject = "landings.preview" | "offers.preview";

type PreviewRecord = {
  url: string;
  offer_type?: string;
};

export default function PreviewPage() {
  const [previewURL, setPreviewURL] = useState("");
  const [previewError, setPreviewError] = useState("");
  usePageTitle("Preview");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams(window.location.search);
      const object = search.get("object") as PreviewObject | null;
      const id = search.get("id");

      if ((object !== "landings.preview" && object !== "offers.preview") || !id) {
        setPreviewError("Preview not found");
        return;
      }

      void fetch(`${API_URL}/preview?object=${encodeURIComponent(object)}&id=${encodeURIComponent(id)}`, {
        headers: {
          Accept: "application/json",
        },
      })
        .then(async (response) => {
          if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message ?? "Preview not found");
          }
          return response.json() as Promise<PreviewRecord>;
        })
        .then((record) => {
          if (!record.url) {
            throw new Error("Preview URL is empty");
          }
          if (object === "offers.preview" && record.offer_type && record.offer_type !== "local") {
            window.location.replace(record.url);
            return;
          }
          setPreviewURL(record.url);
        })
        .catch((error) => {
          setPreviewError(error instanceof Error ? error.message : "Could not load preview");
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (previewError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 text-neutral-950">
        <div className="max-w-md border border-neutral-200 p-5 shadow-sm">
          <h1 className="text-lg font-semibold tracking-normal">Preview unavailable</h1>
          <p className="mt-2 text-sm text-neutral-500">{previewError}</p>
        </div>
      </main>
    );
  }

  if (previewURL) {
    return <iframe className="h-screen w-screen border-0 bg-white" src={previewURL} title="Preview" />;
  }

  return null;
}
