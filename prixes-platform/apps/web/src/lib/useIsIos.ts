import { useEffect, useState } from "react";

import { nativePlatform } from "./platform";

/**
 * True inside the iPhone app. Apple forbids selling a digital subscription in the
 * app with anything but its own billing — and forbids pointing to a payment
 * elsewhere: there, Premium is shown to subscribers, never offered.
 *
 * Read after mount: a platform read during render breaks the static build's
 * hydration (see the hydration trap in the project notes).
 */
export function useIsIos(): boolean {
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(nativePlatform() === "ios"), []);
  return ios;
}
