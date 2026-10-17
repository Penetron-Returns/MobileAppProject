import { useAppColorScheme } from '@booking/ui';
import { ListChecks } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

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

interface OpenState {
  index: number;
  frame: OriginFrame;
}

/** Static placeholder rings while the stories load: no shimmer, nothing moves. */
function SkeletonRings() {
  const { isDark } = useAppColorScheme();
  const fill = isDark ? 'rgba(235,235,245,0.12)' : 'rgba(60,60,67,0.1)';
  return (
    <View
      testID="stories-skeleton"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row gap-2 px-4 pt-4"
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 80 }} className="items-center">
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: fill,
            }}
          />
          <View
            style={{
              width: 56,
              height: 10,
              borderRadius: 5,
              marginTop: 12,
              backgroundColor: fill,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * The stories row: skeleton rings while loading, nothing when there are none,
 * otherwise a ring per story. A tap opens the viewer from that ring's frame.
 */
export function StoriesRow({
  stories,
  isLoading,
  onViewed,
  onEvent,
  onAction,
  onClose,
}: {
  stories: Story[];
  isLoading: boolean;
  onViewed: (storyId: string, lastCardIndex: number) => void;
  onEvent: (event: StoryEvent) => void;
  onAction: (card: StoryCard) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState<OpenState | null>(null);
  // The viewer keeps the stories it opened with, so a ring flipping to viewed
  // underneath never reshuffles the cards it is showing.
  const opened = React.useRef<Story[]>(stories);
  const setup = useSetupStory();

  if (isLoading) return <SkeletonRings />;
  if (stories.length === 0 && !setup) return null;
  // "Get set up" sits right after Business update, i.e. before Product updates.
  const productAt = stories.findIndex((s) => s.kind === 'product');
  const setupAt = productAt === -1 ? stories.length : productAt;
  const setupRing = setup ? (
    <ProgressStoryRing
      key="get-set-up"
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
  ) : null;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="stories-row"
        style={{ flexGrow: 0 }}
        accessibilityLabel={t('stories.listLabel')}
        contentContainerClassName="gap-2 px-4 pt-4"
      >
        {stories.map((story, index) => (
          <React.Fragment key={story.id}>
            {index === setupAt ? setupRing : null}
            <StoryRing
              story={story}
              onPress={(_id, frame) => {
                opened.current = stories;
                setOpen({ index, frame });
              }}
            />
          </React.Fragment>
        ))}
        {setupAt === stories.length ? setupRing : null}
      </ScrollView>
      {open ? (
        <StoryViewer
          stories={opened.current}
          initialIndex={open.index}
          originFrame={open.frame}
          onClose={() => {
            setOpen(null);
            onClose();
          }}
          onViewed={onViewed}
          onEvent={onEvent}
          onAction={onAction}
        />
      ) : null}
    </>
  );
}
