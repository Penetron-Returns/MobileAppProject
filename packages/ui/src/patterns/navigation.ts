import { router } from 'expo-router';

/** Goes back, or to `fallbackHref` when there is no history (deep link, web refresh). */
export function goBack(fallbackHref = '/dashboard') {
  if (router.canGoBack()) router.back();
  else router.replace(fallbackHref as never);
}
