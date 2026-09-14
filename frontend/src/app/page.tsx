"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { usePageTitle } from "@/lib/page-title";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

type PreviewObject = "landings.preview" | "offers.preview";

type PreviewRecord = {
  url: string;
  offer_type?: string;
};

export default function HomePage() {
  const router = useRouter();
  const [previewURL, setPreviewURL] = useState("");
  const [previewError, setPreviewError] = useState("");
  const isPreviewPage = typeof window !== "undefined" && isPreviewSearch(window.location.search);
  usePageTitle(isPreviewPage ? "Preview" : undefined);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const object = search.get("object") as PreviewObject | null;
    const id = search.get("id");
    const isPreview = (object === "landings.preview" || object === "offers.preview") && id;

    if (isPreview) {
      const token = getAuthToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const path = object === "landings.preview" ? `/landings/${id}` : `/offers/${id}`;
      void fetch(`${API_URL}${path}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
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
      return;
    }

    const timer = window.setTimeout(() => {
      router.replace(getAuthToken() ? "/dashboard" : "/login");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [router]);

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

function isPreviewSearch(search: string) {
  const params = new URLSearchParams(search);
  const object = params.get("object");
  return object === "landings.preview" || object === "offers.preview";
}
