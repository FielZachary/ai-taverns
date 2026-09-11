"use client";

import { useEffect } from "react";
import { trackLandingPageView } from "../../lib/analytics";

/** Initializes analytics while the browser still has the original UTM URL. */
export function AnalyticsBootstrap() {
  useEffect(() => {
    trackLandingPageView();
  }, []);

  return null;
}
