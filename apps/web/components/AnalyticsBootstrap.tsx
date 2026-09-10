"use client";

import { useEffect } from "react";
import { trackLandingPageView } from "@/lib/analytics";

export function AnalyticsBootstrap() {
  useEffect(() => {
    trackLandingPageView();
  }, []);

  return null;
}
