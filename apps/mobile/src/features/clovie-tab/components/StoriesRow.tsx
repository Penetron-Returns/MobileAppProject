import { Text, useAppColorScheme } from '@booking/ui';
import { ListChecks } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { useSetupStory } from '@/features/setup-checklist/useSetupStory';
import {
  ProgressStoryRing,
  StoryRing,
  StoryViewer,
  type OriginFrame,
  type Story,
  type StoryCard,
  type StoryEvent,
} from '@/features/stories';
import {
  LABEL_MARGIN_TOP,
  RING_SIZE,
  ROW_PAD_TOP,
  storyLabelHeight,
  storyRingHeight,
} from '@/features/stories/ringLayout';

import { useAfterInteractions } from '../useAfterInteractions';

interface OpenState {
  index: number;
  frame: OriginFrame;
}

/** Static placeholder rings while the stories load: the real row's exact geometry, nothing moves. */
function SkeletonRings({ fontScale }: { fontScale: number }) {
  const { isDark } = useAppColorScheme();
  const fill = isDark ? 'rgba(235,235,245,0.12)' : 'rgba(60,60,67,0.1)';
  return (
    <View
      testID="stories-skeleton"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row gap-2 px-4"
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 80 }} className="items-center">
          <View
            style={{
              width: RING_SIZE,
              height: RING_SIZE,
              borderRadius: RING_SIZE / 2,
              backgroundColor: fill,
            }}
          />
          <View
            style={{
              width: 80,
              height: storyLabelHeight(fontScale),
              marginTop: LABEL_MARGIN_TOP,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 56,
                height: 10,
                borderRadius: 5,
                marginTop: 4,
                backgroundColor: fill,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The failure stays visible and recoverable ("Can't load updates. Retry"), never a blank row. */
function LoadErrorRow({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      testID="stories-error"
      className="min-h-11 flex-row items-center gap-2 px-5"
    >
      <Text className="flex-shrink text-subtitle text-muted-foreground">
        {t('stories.loadError')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('stories.retry')}
        onPress={onRetry}
        hitSlop={8}
        className="min-h-11 justify-center"
      >
        <Text className="text-subtitle font-semibold text-primary">
          {t('stories.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The "Get set up" bubble. Mounted only after the first screen has settled, so
 * the checklist's queries never compete with it. Reports whether it shows
 * anything, so the row can collapse when there is nothing at all.
 */
function SetupRing({ onPresence }: { onPresence: (isShown: boolean) => void }) {
  const { t } = useTranslation();
  const setup = useSetupStory();
  const isShown = setup !== null;
  React.useEffect(() => onPresence(isShown), [isShown, onPresence]);
  if (!setup) return null;
  return (
    <ProgressStoryRing
      label={t('checklist.title')}
      accessibilityLabel={t('checklist.storyLabel', {
        title: t('checklist.title'),
        done: setup.done,
        total: setup.total,
      })}
      icon={ListChecks}
      done={setup.done}
      total={setup.total}
      onPress={setup.open}
    />
  );
}

interface StoriesRowProps {
  stories: Story[];
  isLoading: boolean;
  /** The load failed (offline, server): shows the inline retry row when there is nothing to show. */
  isError?: boolean;
  onRetry?: () => void;
  onViewed: (storyId: string, lastCardIndex: number) => void;
  onEvent: (event: StoryEvent) => void;
  onAction: (card: StoryCard) => void;
  onClose: () => void;
}

/**
 * The stories row: skeleton rings while loading, an inline retry on failure,
 * otherwise a ring per story. It reserves one fixed height from the first
 * frame, so nothing below it shifts when the stories arrive; it collapses only
 * once everything has settled and there is truly nothing to show. A press
 * opens the viewer at once from the frame measured as the finger landed.
 */
export const StoriesRow = React.memo(function StoriesRow({
  stories,
  isLoading,
  isError = false,
  onRetry,
  onViewed,
  onEvent,
  onAction,
  onClose,
}: StoriesRowProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = React.useState<OpenState | null>(null);
  const [hasSetup, setHasSetup] = React.useState(false);
  const isSettled = useAfterInteractions();
  // The viewer keeps the stories it opened with, so a ring flipping to viewed
  // underneath never reshuffles the cards it is showing.
  const opened = React.useRef<Story[]>(stories);
  const latest = React.useRef(stories);
  latest.current = stories;

  const onOpen = React.useCallback((storyId: string, frame: OriginFrame) => {
    const index = latest.current.findIndex((s) => s.id === storyId);
    if (index === -1) return;
    opened.current = latest.current;
    setOpen({ index, frame });
  }, []);
  const onViewerClose = React.useCallback(() => {
    setOpen(null);
    onClose();
  }, [onClose]);

  const isFailed = isError && stories.length === 0;
  const isEmpty =
    isSettled && !isLoading && !isFailed && stories.length === 0 && !hasSetup;
  const height = isEmpty ? 0 : ROW_PAD_TOP + storyRingHeight(fontScale);

  let body: React.ReactNode;
  if (isLoading) {
    body = <SkeletonRings fontScale={fontScale} />;
  } else if (isFailed) {
    body = <LoadErrorRow onRetry={onRetry ?? noop} />;
  } else {
    // "Get set up" sits right after Business update, i.e. before Product updates.
    const productAt = stories.findIndex((s) => s.kind === 'product');
    const setupAt = productAt === -1 ? stories.length : productAt;
    const setupRing = isSettled ? (
      <SetupRing key="get-set-up" onPresence={setHasSetup} />
    ) : null;
    body = (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="stories-row"
        style={{ flexGrow: 0 }}
        accessibilityLabel={t('stories.listLabel')}
        contentContainerClassName="gap-2 px-4"
      >
        {stories.map((story, index) => (
          <React.Fragment key={story.id}>
            {index === setupAt ? setupRing : null}
            <StoryRing story={story} onPress={onOpen} />
          </React.Fragment>
        ))}
        {setupAt === stories.length ? setupRing : null}
      </ScrollView>
    );
  }

  return (
    <>
      <View
        style={{ height, paddingTop: ROW_PAD_TOP, overflow: 'hidden' }}
        pointerEvents={isEmpty ? 'none' : 'auto'}
      >
        {body}
      </View>
      {open ? (
        <StoryViewer
          stories={opened.current}
          initialIndex={open.index}
          originFrame={open.frame}
          onClose={onViewerClose}
          onViewed={onViewed}
          onEvent={onEvent}
          onAction={onAction}
        />
      ) : null}
    </>
  );
});

function noop() {}
