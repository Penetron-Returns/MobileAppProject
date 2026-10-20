import { Redirect } from 'expo-router';

/** The app opens on the Calendar. */
export default function IndexRoute() {
  return <Redirect href="/calendar" />;
}
