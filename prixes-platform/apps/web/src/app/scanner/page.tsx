"use client";

/**
 * The barcode scanner and the photo recognition were removed on 2026-10-07:
 * the assistant finds the products and the shops for you. Old links and
 * shortcuts to /scanner land on the shops around you instead.
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ScannerGone() {
  const router = useRouter();
  useEffect(() => router.replace("/stores"), [router]);
  return null;
}
