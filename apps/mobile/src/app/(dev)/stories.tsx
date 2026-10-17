import { Ground, Text } from '@booking/ui';
import { Redirect } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClovieCharacter, EMOTIONS } from '@/features/clovie-character';
import {
  SAMPLE_STORIES,
  StoryRing,
  StoryViewer,
  type OriginFrame,
  type Story,
  type StoryEvent,
} from '@/features/stories';

interface Open {
  index: number;
  frame: OriginFrame;
}

/**
 * Dev-only demo for the stories row and viewer, on sample stories built from
 * the design board, so they can be checked on a phone before the backend is
 * live. Guarded so it never ships in a production build.
 */
export default function StoriesDemoScreen() {
  const insets = useSafeAreaInsets();
  const [stories, setStories] = React.useState<Story[]>(SAMPLE_STORIES);
  const [open, setOpen] = React.useState<Open | null>(null);
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [log, setLog] = React.useState<string[]>([]);

  if (!__DEV__) return <Redirect href="/" />;

  const record = (event: StoryEvent) =>
    setLog((l) =>
      [
        `${event.type} ${event.storyId} ${event.cardId ?? ''}`.trim(),
        ...l,
      ].slice(0, 6),
    );

  return (
    <Ground className="flex-1">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 48,
        }}
      >
        <Text
          role="heading"
          aria-level="1"
          className="text-large-title mx-5 font-bold"
        >
          Stories
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4 pt-4"
        >
          {stories.map((story, index) => (
            <StoryRing
              key={story.id}
              story={story}
              onPress={(_id, frame) => setOpen({ index, frame })}
            />
          ))}
        </ScrollView>

        <View className="mx-5 mt-6 gap-2">
          <Text className="text-meta uppercase text-muted-foreground">
            Last events
          </Text>
          {log.map((line, i) => (
            <Text key={`${line}-${i}`}>{line}</Text>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setStories(SAMPLE_STORIES)}
          >
            <Text className="text-primary">Reset viewed state</Text>
          </Pressable>
        </View>

        <View className="mx-5 mt-8 gap-3">
          <Text className="text-meta uppercase text-muted-foreground">
            Clovie emotions
          </Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isAnimating }}
            onPress={() => setIsAnimating((v) => !v)}
          >
            <Text className="text-primary">
              {isAnimating ? 'Stop animating' : 'Animate (pose loops)'}
            </Text>
          </Pressable>
          <View className="flex-row flex-wrap gap-x-6 gap-y-8 pt-6">
            {EMOTIONS.map((emotion) => (
              <View key={emotion} className="items-center gap-2">
                <ClovieCharacter
                  emotion={emotion}
                  size={84}
                  isActive={isAnimating}
                  isSearching={emotion === 'curious'}
                />
                <Text>{emotion}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {open ? (
        <StoryViewer
          stories={stories}
          initialIndex={open.index}
          originFrame={open.frame}
          onClose={() => setOpen(null)}
          onViewed={(id) =>
            setStories((all) =>
              all.map((s) => (s.id === id ? { ...s, viewed: true } : s)),
            )
          }
          onEvent={record}
          onAction={(card) =>
            record({ type: 'action', storyId: 'demo', cardId: card.id })
          }
        />
      ) : null}
    </Ground>
  );
}
