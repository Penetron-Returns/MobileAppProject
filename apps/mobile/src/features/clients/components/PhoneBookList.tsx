import {
  CollapsingBar,
  INBOX_DOME_CLEARANCE,
  NAV_ROW_HEIGHT,
  SearchField,
  Text,
  collapseThreshold,
  tabBarClearance,
  useDepth,
  useTitleCollapse,
} from '@booking/ui';
import { BlurView } from 'expo-blur';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ISODate } from '@/lib/time';

import {
  bookItemLayout,
  CONTENT_TOP_BELOW_INSET,
  flattenSections,
  listChrome,
  sectionIndexForLetter,
  type BookClient,
  type BookItem,
  type BookSection,
} from '../phoneBook';
import { ClientListRow, GROUP_GAP, ROW_HEIGHT } from './ClientGroup';
import { IndexScrubber } from './IndexScrubber';
import { RecentCard } from './RecentCard';

/** Board: the scrubber starts 216pt down on a 54pt status inset (inset + 162). */
const SCRUBBER_TOP_BELOW_INSET = 162;
const TITLE_LINE = 41;
const TITLE_TOP = 4;
/** 20pt of air above the 28pt letter row. */
const SECTION_HEADER_HEIGHT = 48;
/** Estimate used until the header has been measured. */
const HEADER_ESTIMATE = 280;

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
  const { fontScale } = useWindowDimensions();
  const list = React.useRef<FlatList<BookItem>>(null);
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
  // `restOffset` makes 0 mean at rest (iOS rests at -inset, Android at 0).
  const { scrollHandler, barStyle, titleStyle } = useTitleCollapse(
    threshold,
    chrome.restOffset,
  );

  const { items, headerIndices } = React.useMemo(
    () => flattenSections(sections),
    [sections],
  );
  const present = React.useMemo(
    () => new Set(sections.map((s) => s.letter)),
    [sections],
  );
  // Rows are exactly ROW_HEIGHT only at the default text size; larger text
  // grows them, so the exact layout is dropped and the list measures instead.
  const layout = React.useMemo(
    () =>
      fontScale <= 1
        ? bookItemLayout(items, {
            listHeader: headerHeight,
            sectionHeader: SECTION_HEADER_HEIGHT,
            row: ROW_HEIGHT,
            gap: GROUP_GAP,
          })
        : null,
    [items, headerHeight, fontScale],
  );

  const jumpTo = React.useCallback(
    (letter: string, animated = true) => {
      const sectionIndex = sectionIndexForLetter(sections, letter);
      if (sectionIndex < 0) return;
      // The section's header item; viewOffset lands it on the sticky line.
      list.current?.scrollToIndex({
        index: headerIndices[sectionIndex],
        viewOffset: chrome.jumpViewOffset,
        animated,
      });
    },
    [sections, headerIndices, chrome.jumpViewOffset],
  );

  // Without an exact layout a far, unmeasured row cannot be scrolled to
  // directly: go near it by the average row, then land on it.
  const onScrollToIndexFailed = React.useCallback(
    (info: { index: number; averageItemLength: number }) => {
      list.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      setTimeout(
        () =>
          list.current?.scrollToIndex({
            index: info.index,
            viewOffset: chrome.jumpViewOffset,
            animated: false,
          }),
        80,
      );
    },
    [chrome.jumpViewOffset],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: BookItem }) =>
      item.kind === 'header' ? (
        <SectionHeader letter={item.letter} />
      ) : (
        <ClientListRow
          row={item.row}
          today={today}
          onOpen={onOpen}
          isFirst={item.isFirst}
          isLast={item.isLast}
        />
      ),
    [today, onOpen],
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
    // A flat page, not the Ground gradient: the pinned letter header needs an
    // opaque fill, and only a flat page lets it match exactly (a gradient shows
    // as grey bands per section).
    <View
      className="flex-1"
      style={{ backgroundColor: depth.ground.backgroundColor }}
    >
      <AnimatedFlatList
        ref={list}
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout ? (_data, index) => layout(index) : undefined}
        onScrollToIndexFailed={onScrollToIndexFailed}
        stickyHeaderIndices={headerIndices}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text className="m-5 text-title text-muted-foreground">
            {emptyText}
          </Text>
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        style={{ marginTop: chrome.frameTop }}
        contentInset={{ top: chrome.contentInset }}
        contentOffset={{ x: 0, y: -chrome.contentInset }}
        scrollIndicatorInsets={{ top: chrome.contentInset, right: 0 }}
        onScroll={scrollHandler}
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
    </View>
  );
}

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<BookItem>);

const keyOf = (item: BookItem) => item.key;

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
        minHeight: SECTION_HEADER_HEIGHT,
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
          {
            // iOS blurs behind a translucent fill; elsewhere the page colour, opaque.
            backgroundColor:
              Platform.OS === 'ios'
                ? depth.colors.stickyHeader
                : depth.ground.backgroundColor,
          },
        ]}
      />
      <Text
        style={{ color: depth.colors.secondary }}
        className="text-subtitle font-bold"
      >
        {letter}
      </Text>
    </View>
  );
});
