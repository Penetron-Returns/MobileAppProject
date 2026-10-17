import {
  CollapsingBar,
  Ground,
  INBOX_DOME_CLEARANCE,
  NAV_ROW_HEIGHT,
  SearchField,
  Text,
  collapseThreshold,
  tabBarClearance,
  titleCollapse,
  useDepth,
  useReduceMotion,
} from '@booking/ui';
import { BlurView } from 'expo-blur';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ISODate } from '@/lib/time';

import {
  bookItemLayout,
  CONTENT_TOP_BELOW_INSET,
  listChrome,
  sectionIndexForLetter,
  type BookClient,
  type BookRow,
  type BookSection,
} from '../phoneBook';
import { ClientGroup, ROW_HEIGHT } from './ClientGroup';
import { IndexScrubber } from './IndexScrubber';
import { RecentCard } from './RecentCard';

/** Board: the scrubber starts 216pt down on a 54pt status inset (inset + 162). */
const SCRUBBER_TOP_BELOW_INSET = 162;
const TITLE_LINE = 41;
const TITLE_TOP = 4;
/** 20pt of air above the 28pt letter row. */
const SECTION_HEADER_HEIGHT = 48;
/** Space between two groups. */
const GROUP_GAP = 12;
/** Estimate used until the header has been measured. */
const HEADER_ESTIMATE = 280;

interface BookListSection {
  key: string;
  letter: string;
  data: BookRow[][];
}

export interface PhoneBookListProps {
  title: string;
  sections: BookSection[];
  recent: BookClient[];
  search: string;
  onSearch: (text: string) => void;
  isSearching: boolean;
  emptyText: string;
  banner?: React.ReactNode;
  today: ISODate;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<unknown>;
}

/** The Clients phone book: large title, search, Recent, A-Z groups and the index strip. */
export function PhoneBookList({
  title,
  sections,
  recent,
  search,
  onSearch,
  isSearching,
  emptyText,
  banner,
  today,
  onOpen,
  onRefresh,
}: PhoneBookListProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const list = React.useRef<SectionList<BookRow[], BookListSection>>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [headerHeight, setHeaderHeight] = React.useState(HEADER_ESTIMATE);

  const chrome = listChrome(insets.top);
  // Where the title sits at rest is the same on both platforms.
  const inset = insets.top + CONTENT_TOP_BELOW_INSET;
  const barHeight = insets.top + NAV_ROW_HEIGHT;
  const threshold = collapseThreshold(
    inset + TITLE_TOP + TITLE_LINE,
    barHeight,
  );
  const offset = useSharedValue(0);
  // `restOffset` makes 0 mean at rest (iOS rests at -inset, Android at 0).
  const onScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.value = event.nativeEvent.contentOffset.y + chrome.restOffset;
    },
    [offset, chrome.restOffset],
  );
  const barStyle = useAnimatedStyle(() => ({
    opacity: titleCollapse(offset.value, threshold, reduceMotion).barOpacity,
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transformOrigin: 'left bottom',
    transform: [
      {
        scale: titleCollapse(offset.value, threshold, reduceMotion).titleScale,
      },
    ],
  }));

  const listSections = React.useMemo<BookListSection[]>(
    () =>
      sections.map((s) => ({
        key: s.letter,
        letter: s.letter,
        data: [s.rows],
      })),
    [sections],
  );
  const present = React.useMemo(
    () => new Set(sections.map((s) => s.letter)),
    [sections],
  );
  const layout = React.useMemo(
    () =>
      bookItemLayout(sections, {
        listHeader: headerHeight,
        sectionHeader: SECTION_HEADER_HEIGHT,
        row: ROW_HEIGHT,
        gap: GROUP_GAP,
      }),
    [sections, headerHeight],
  );

  const jumpTo = React.useCallback(
    (letter: string, animated = true) => {
      const sectionIndex = sectionIndexForLetter(sections, letter);
      if (sectionIndex < 0) return;
      // itemIndex 0 is the section header; viewOffset lands it on the sticky line.
      list.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewOffset: chrome.jumpViewOffset,
        animated,
      });
    },
    [sections, chrome.jumpViewOffset],
  );

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const onHeaderLayout = React.useCallback((event: LayoutChangeEvent) => {
    setHeaderHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  const showRecent = !isSearching && recent.length > 0;
  const header = (
    <View onLayout={onHeaderLayout}>
      <View style={{ height: chrome.topSpacer }} />
      <View className="px-5" style={{ paddingTop: TITLE_TOP }}>
        <Animated.View style={titleStyle}>
          <Text
            role="heading"
            aria-level="1"
            className="text-large-title font-bold"
          >
            {title}
          </Text>
        </Animated.View>
      </View>
      <SearchField
        clear="cancel"
        containerClassName="mx-5 mt-3"
        value={search}
        onChangeText={onSearch}
        placeholder={t('clients.searchPlaceholder')}
        label={t('clients.searchLabel')}
        autoCorrect={false}
      />
      {banner}
      {showRecent ? (
        <>
          <Text
            accessibilityRole="header"
            className="mx-5 mb-2 mt-7 text-section font-bold"
          >
            {t('clients.recent')}
          </Text>
          <RecentCard
            clients={recent}
            onOpen={onOpen}
            label={t('clients.recentLabel')}
          />
        </>
      ) : null}
      <View style={{ height: GROUP_GAP }} />
    </View>
  );

  return (
    <Ground className="flex-1">
      <SectionList
        ref={list}
        sections={listSections}
        keyExtractor={(group: BookRow[]) => group[0].id}
        renderItem={({ item }: { item: BookRow[] }) => (
          <ClientGroup rows={item} today={today} onOpen={onOpen} />
        )}
        renderSectionHeader={({ section }: { section: BookListSection }) => (
          <SectionHeader letter={section.letter} />
        )}
        getItemLayout={(_data: unknown, index: number) => layout(index)}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text className="m-5 text-title text-muted-foreground">
            {emptyText}
          </Text>
        }
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        style={{ marginTop: chrome.frameTop }}
        contentInset={{ top: chrome.contentInset }}
        contentOffset={{ x: 0, y: -chrome.contentInset }}
        scrollIndicatorInsets={{ top: chrome.contentInset, right: 0 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={12}
        windowSize={9}
        contentContainerStyle={{
          paddingBottom: tabBarClearance(insets.bottom) + INBOX_DOME_CLEARANCE,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={depth.colors.tint}
          />
        }
      />
      {!isSearching ? (
        <IndexScrubber
          present={present}
          onJump={jumpTo}
          top={insets.top + SCRUBBER_TOP_BELOW_INSET}
        />
      ) : null}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        testID="page-nav-fade"
        style={[
          depth.navFade,
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 8,
          },
        ]}
      />
      <CollapsingBar title={title} height={barHeight} style={barStyle} />
    </Ground>
  );
}

/** Sticky letter header: 28pt, translucent fill over a blur (board: blur 12). */
const SectionHeader = React.memo(function SectionHeader({
  letter,
}: {
  letter: string;
}) {
  const depth = useDepth();
  return (
    <View
      accessibilityRole="header"
      style={{
        height: SECTION_HEADER_HEIGHT,
        paddingTop: 24,
        paddingRight: 36,
        paddingLeft: 28,
      }}
      className="overflow-hidden"
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={30}
          tint={depth.scheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: depth.colors.stickyHeader },
        ]}
      />
      <Text
        style={{ color: depth.colors.secondary }}
        maxFontSizeMultiplier={1.1}
        className="text-subtitle font-bold"
      >
        {letter}
      </Text>
    </View>
  );
});
