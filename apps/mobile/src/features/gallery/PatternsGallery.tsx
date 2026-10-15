import {
  BackPill,
  BlockedActionSheet,
  Button,
  CenteredSpinner,
  CompanionDome,
  EmptyState,
  ErrorState,
  FlowCaption,
  FlowFooter,
  FlowHeading,
  FlowTopBar,
  FloatingTabBar,
  FormSheet,
  GlassPage,
  Ground,
  InboxDome,
  ListSkeleton,
  LoadingCard,
  OfflineBanner,
  Presenter,
  SaveFooter,
  StackHeader,
  Text,
  useOfflineGuard,
} from '@booking/ui';
import { CalendarX } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Row, Section, Specimen } from './Specimen';

const TAB_NAMES = ['index', 'calendar', 'reports', 'clients', 'settings'];
const TAB_STATE = {
  index: 0,
  routes: TAB_NAMES.map((name) => ({ key: `${name}-key`, name })),
};
const TAB_DESCRIPTORS = Object.fromEntries(
  TAB_STATE.routes.map((r) => [r.key, { options: {} }]),
);
const TAB_NAVIGATION = {
  emit: () => ({ defaultPrevented: false }),
  navigate: () => {},
};

/** A fixed-size stage for chrome that positions itself against the screen. */
function Stage({
  height,
  children,
}: {
  height: number;
  children: React.ReactNode;
}) {
  return (
    <Ground style={{ height }} className="overflow-hidden rounded-2xl">
      {children}
    </Ground>
  );
}

/** Page chrome, flows, states and the tab bar. */
export function PatternsGallery() {
  const [retrying, setRetrying] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const guard = useOfflineGuard(true, () =>
    Promise.reject(new Error('offline')),
  );
  return (
    <>
      <Section
        title="Page chrome"
        note="Page is the screen shell; these are its parts"
      >
        <Specimen label="StackHeader (classic), with a close variant">
          <StackHeader title="Cancel booking" hideBack />
          <StackHeader
            title="Edit service"
            close
            align="left"
            onBack={() => {}}
          />
        </Specimen>
        <Specimen label="BackPill">
          <View className="-ml-3">
            <BackPill label="Today" onPress={() => {}} />
          </View>
        </Specimen>
        <Specimen label="BackPill variant=glass">
          <BackPill variant="glass" label="Settings" onPress={() => {}} />
        </Specimen>
        <Specimen label="SaveFooter">
          <SaveFooter label="Save changes" onPress={() => {}} />
          <SaveFooter label="Save changes" disabled onPress={() => {}} />
        </Specimen>
      </Section>

      <Section
        title="Glass page, form sheet and presenter"
        note="Settings sub-screens: GlassPage; the editor: FormSheet inside a Presenter"
      >
        <Stage height={260}>
          <GlassPage title="Team" backLabel="Settings" onBack={() => {}}>
            <Text className="mx-5 text-subtitle text-muted-foreground">
              4 people can take bookings
            </Text>
          </GlassPage>
        </Stage>
        <Stage height={200}>
          <Presenter active={sheetOpen}>
            <Ground className="flex-1 items-center justify-center">
              <Button size="sm" onPress={() => setSheetOpen(true)}>
                <Text>Open the sheet</Text>
              </Button>
            </Ground>
          </Presenter>
        </Stage>
        <FormSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Edit service"
          footer={
            <Button size="lg" onPress={() => setSheetOpen(false)}>
              <Text>Save</Text>
            </Button>
          }
        >
          <Text className="text-title">Sheet body</Text>
        </FormSheet>
      </Section>

      <Section
        title="Flow chrome"
        note="Top bar, heading, caption and pinned footer"
      >
        <Stage height={300}>
          <FlowTopBar
            value={2}
            max={4}
            progressLabel="Step 2 of 4"
            showBack
            onBack={() => {}}
          />
          <View className="px-5 pt-28">
            <FlowHeading title="Your hours" subtitle="When can clients book?" />
            <FlowCaption>You can change this later.</FlowCaption>
          </View>
          <FlowFooter>
            <Button size="xl">
              <Text>Continue</Text>
            </Button>
          </FlowFooter>
        </Stage>
      </Section>

      <Section
        title="Error states"
        note="ErrorState variants: banner, card and screen"
      >
        <ErrorState
          variant="banner"
          message="We could not reach the server."
          requestId="req_demo123"
          onRetry={() => {}}
        />
        <ErrorState
          variant="card"
          className="mx-0"
          title="Couldn't load the calendar"
          description="Check your connection and try again."
          message="Network request failed"
          requestId="req_demo123"
          onRetry={() => {}}
        />
        <ErrorState
          variant="screen"
          message="Something went wrong."
          isRetrying={retrying}
          onRetry={() => setRetrying((r) => !r)}
        />
      </Section>

      <Section title="Empty, loading and offline">
        <EmptyState
          icon={CalendarX}
          title="Nothing here yet"
          description="EmptyState, inline variant."
        />
        <EmptyState
          variant="screen"
          icon={CalendarX}
          title="No clients yet"
          description="EmptyState, screen variant."
          action={
            <Button size="lg">
              <Text>Add a client</Text>
            </Button>
          }
        />
        <LoadingCard />
        <Specimen label="ListSkeleton">
          <ListSkeleton rows={2} />
        </Specimen>
        <Specimen label="CenteredSpinner">
          <View className="h-24">
            <CenteredSpinner />
          </View>
        </Specimen>
        <OfflineBanner label="Offline · showing what we had at 10:32" />
        <Row>
          <Button variant="outline" size="sm" onPress={guard.guard(() => {})}>
            <Text>Blocked action (offline)</Text>
          </Button>
        </Row>
        <BlockedActionSheet {...guard.sheetProps} />
      </Section>

      <Section title="Tab bar: Free (plus, Inbox dome) and paid (Reports tab, companion dome)">
        <Stage height={170}>
          <FloatingTabBar
            {...({
              state: TAB_STATE,
              descriptors: TAB_DESCRIPTORS,
              navigation: TAB_NAVIGATION,
            } as unknown as React.ComponentProps<typeof FloatingTabBar>)}
            onAdd={() => {}}
            dome={
              <InboxDome
                count={3}
                label="Inbox, 3 need a reply"
                onPress={() => {}}
              />
            }
          />
        </Stage>
        <Stage height={170}>
          <FloatingTabBar
            {...({
              state: { ...TAB_STATE, index: 2 },
              descriptors: TAB_DESCRIPTORS,
              navigation: TAB_NAVIGATION,
            } as unknown as React.ComponentProps<typeof FloatingTabBar>)}
            tabs={['index', 'calendar', 'reports', 'clients', 'settings']}
            dome={
              <CompanionDome
                character={require('@/assets/images/companion-default.png')}
                count={2}
                label="Open your companion, 2 need your attention"
                onPress={() => {}}
              />
            }
          />
        </Stage>
      </Section>
    </>
  );
}
