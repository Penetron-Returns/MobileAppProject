import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect } from 'expo-router';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Heart,
  Info,
  Moon,
  Scissors,
  Sun,
} from 'lucide-react-native';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  EmptyState,
  ErrorState,
  LoadingCard,
  LoadingRows,
} from '@/components/States';
import { FormField } from '@/components/FormField';
import { Header } from '@/components/Header';
import { ListItem } from '@/components/ListItem';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { SearchInput } from '@/components/SearchInput';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/Sheet';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { toast } from '@/lib/toast';
import { ApiError } from '@/lib/api';

const demoSchema = z.object({
  name: z.string().min(2, 'Enter at least 2 characters'),
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text variant="h4">{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">{children}</View>
  );
}

/**
 * Every component and variant, in both themes. Dev-only: guarded below so it
 * never ships in a production build.
 */
export default function GalleryScreen() {
  const { isDark, toggle } = useAppColorScheme();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [segment, setSegment] = React.useState<'day' | 'week' | 'month'>(
    'week',
  );
  const [search, setSearch] = React.useState('');
  const [checkedOn, setCheckedOn] = React.useState(true);
  const [checkedOff, setCheckedOff] = React.useState(false);
  const [toggledOn, setToggledOn] = React.useState(true);
  const [toggledOff, setToggledOff] = React.useState(false);
  const [toggleGroupValue, setToggleGroupValue] = React.useState<
    string | undefined
  >('a');
  const [tabsValue, setTabsValue] = React.useState('one');
  const [menubarValue, setMenubarValue] = React.useState<string | undefined>(
    undefined,
  );
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(demoSchema),
    defaultValues: { name: '' },
  });

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen
      header={
        <Header
          title="Component gallery"
          hideBack
          right={
            <Button
              variant="ghost"
              size="icon"
              onPress={toggle}
              accessibilityLabel="Toggle theme"
            >
              <Icon as={isDark ? Sun : Moon} size={18} />
            </Button>
          }
        />
      }
    >
      <Section title="Typography">
        <Text variant="h1">Heading 1</Text>
        <Text variant="h2">Heading 2</Text>
        <Text variant="h3">Heading 3</Text>
        <Text variant="h4">Heading 4</Text>
        <Text variant="lead">Lead paragraph text.</Text>
        <Text variant="p">Body paragraph text for longer descriptions.</Text>
        <Text variant="muted">Muted helper text.</Text>
        <Text variant="small">Small text.</Text>
      </Section>

      <Separator />

      <Section title="Buttons">
        <Row>
          <Button>
            <Text>Default</Text>
          </Button>
          <Button variant="secondary">
            <Text>Secondary</Text>
          </Button>
          <Button variant="outline">
            <Text>Outline</Text>
          </Button>
          <Button variant="outline-primary">
            <Text>Outline primary</Text>
          </Button>
          <Button variant="outline-destructive">
            <Text>Outline destructive</Text>
          </Button>
          <Button variant="soft">
            <Text>Soft</Text>
          </Button>
          <Button variant="whatsapp">
            <Text>WhatsApp</Text>
          </Button>
          <Button variant="ghost">
            <Text>Ghost</Text>
          </Button>
          <Button variant="link">
            <Text>Link</Text>
          </Button>
          <Button variant="destructive">
            <Text>Destructive</Text>
          </Button>
          <Button disabled>
            <Text>Disabled</Text>
          </Button>
        </Row>
        <Row>
          <Button size="sm">
            <Text>Small</Text>
          </Button>
          <Button size="default">
            <Text>Default</Text>
          </Button>
          <Button size="lg">
            <Text>Large</Text>
          </Button>
          <Button size="icon" accessibilityLabel="Calendar">
            <Icon as={Calendar} size={18} />
          </Button>
        </Row>
      </Section>

      <Separator />

      <Section title="Badge / StatusBadge">
        <Row>
          <Badge>
            <Text>Default</Text>
          </Badge>
          <Badge variant="secondary">
            <Text>Secondary</Text>
          </Badge>
          <Badge variant="outline">
            <Text>Outline</Text>
          </Badge>
          <Badge variant="destructive">
            <Text>Destructive</Text>
          </Badge>
        </Row>
        <Row>
          <StatusBadge status="confirmed" pill />
          <StatusBadge status="completed" pill />
          <StatusBadge status="cancelled" pill />
          <StatusBadge status="no_show" pill />
        </Row>
      </Section>

      <Separator />

      <Section title="Alert">
        <Alert icon={Info}>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            An informational message for the owner.
          </AlertDescription>
        </Alert>
        <Alert icon={AlertTriangle} variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>A destructive-styled alert.</AlertDescription>
        </Alert>
      </Section>

      <Separator />

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Haircut &amp; beard trim</CardTitle>
            <CardDescription>45 min &middot; R250</CardDescription>
          </CardHeader>
          <CardContent>
            <Text variant="muted">Card body content goes here.</Text>
          </CardContent>
          <CardFooter>
            <Button size="sm">
              <Text>Book</Text>
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Separator />

      <Section title="Avatars">
        <Row>
          <Avatar alt="Fallback">
            <AvatarFallback>
              <Text>JD</Text>
            </AvatarFallback>
          </Avatar>
          <PersonAvatar name="Jane Doe" size="md" />
          <PersonAvatar name="Sam Owner" size="lg" solid />
          <PersonAvatar name="Ola" size="sm" online />
        </Row>
      </Section>

      <Separator />

      <Section title="Selection controls">
        <Row>
          <Checkbox checked={checkedOn} onCheckedChange={setCheckedOn} />
          <Checkbox checked={checkedOff} onCheckedChange={setCheckedOff} />
          <Switch checked={checkedOn} onCheckedChange={setCheckedOn} />
          <Switch checked={checkedOff} onCheckedChange={setCheckedOff} />
          <Toggle pressed={toggledOn} onPressedChange={setToggledOn}>
            <Text>Toggled</Text>
          </Toggle>
          <Toggle pressed={toggledOff} onPressedChange={setToggledOff}>
            <Text>Toggle</Text>
          </Toggle>
        </Row>
        <ToggleGroup
          type="single"
          value={toggleGroupValue}
          onValueChange={setToggleGroupValue}
        >
          <ToggleGroupItem value="a" isFirst>
            <Text>A</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="b">
            <Text>B</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="c" isLast>
            <Text>C</Text>
          </ToggleGroupItem>
        </ToggleGroup>
        <RadioGroup value="one" onValueChange={() => {}}>
          <View className="flex-row items-center gap-2">
            <RadioGroupItem value="one" aria-labelledby="r1" />
            <Label nativeID="r1">Option one</Label>
          </View>
          <View className="flex-row items-center gap-2">
            <RadioGroupItem value="two" aria-labelledby="r2" />
            <Label nativeID="r2">Option two</Label>
          </View>
        </RadioGroup>
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          options={[
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' },
          ]}
        />
      </Section>

      <Separator />

      <Section title="Inputs">
        <Label nativeID="demo-input">Name</Label>
        <Input nativeID="demo-input" placeholder="Type here" />
        <Textarea placeholder="A longer note" />
        <SearchInput value={search} onChangeText={setSearch} />
        <Select defaultValue={{ value: 'confirmed', label: 'Confirmed' }}>
          <SelectTrigger>
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem label="Confirmed" value="confirmed" />
            <SelectItem label="Completed" value="completed" />
            <SelectItem label="Cancelled" value="cancelled" />
          </SelectContent>
        </Select>
        <FormField
          control={control}
          name="name"
          label="react-hook-form + zod"
          placeholder="Jane"
        />
        <Button
          size="sm"
          variant="outline"
          onPress={handleSubmit(() => toast.success('Valid!'))}
        >
          <Text>Validate demo field</Text>
        </Button>
      </Section>

      <Separator />

      <Section title="Tabs / Accordion / Collapsible">
        <Tabs value={tabsValue} onValueChange={setTabsValue}>
          <TabsList>
            <TabsTrigger value="one">
              <Text>One</Text>
            </TabsTrigger>
            <TabsTrigger value="two">
              <Text>Two</Text>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="one">
            <Text variant="muted">Tab one content.</Text>
          </TabsContent>
          <TabsContent value="two">
            <Text variant="muted">Tab two content.</Text>
          </TabsContent>
        </Tabs>

        <Accordion type="single" collapsible>
          <AccordionItem value="a">
            <AccordionTrigger>
              <Text>What is this?</Text>
            </AccordionTrigger>
            <AccordionContent>
              <Text variant="muted">A collapsible accordion item.</Text>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <Text>Toggle details</Text>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Text variant="muted" className="pt-2">
              Extra detail revealed by the collapsible.
            </Text>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      <Separator />

      <Section title="Progress / Skeleton / AspectRatio">
        <Progress value={60} />
        <LoadingRows count={2} />
        <LoadingCard />
        <Skeleton className="h-6 w-32" />
        <View className="w-40">
          <AspectRatio ratio={16 / 9}>
            <View className="bg-accent h-full w-full items-center justify-center rounded-md">
              <Icon as={Scissors} size={20} className="text-primary" />
            </View>
          </AspectRatio>
        </View>
      </Section>

      <Separator />

      <Section title="Overlays: dialog, alert dialog, sheet, popover, tooltip, hover card">
        <Row>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Dialog</Text>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
              </DialogHeader>
              <Text variant="muted">Dialog body content.</Text>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline-destructive" size="sm">
                <Text>Alert dialog</Text>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Text>Cancel</Text>
                </AlertDialogCancel>
                <AlertDialogAction>
                  <Text>Continue</Text>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Sheet</Text>
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Bottom sheet</SheetTitle>
              </SheetHeader>
              <Text variant="muted">Sheet body content.</Text>
            </SheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Popover</Text>
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <Text variant="muted">Popover content.</Text>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Tooltip</Text>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <Text>Helpful hint</Text>
            </TooltipContent>
          </Tooltip>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Hover card</Text>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent>
              <Text variant="muted">Extra context on hover (web) / press.</Text>
            </HoverCardContent>
          </HoverCard>
        </Row>

        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onPress={() => setConfirmOpen(true)}
        >
          <Text>ConfirmDialog</Text>
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Cancel this booking?"
          description="The client will be notified on WhatsApp."
          confirmLabel="Cancel booking"
          destructive
          onConfirm={() => setConfirmOpen(false)}
        />
      </Section>

      <Separator />

      <Section title="Menus: dropdown, context, menubar">
        <Row>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Dropdown</Text>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <Text>Edit</Text>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                <Text>Delete</Text>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Text>Long-press menu</Text>
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>
                <Text>Message</Text>
              </ContextMenuItem>
              <ContextMenuItem>
                <Text>Call</Text>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <Menubar value={menubarValue} onValueChange={setMenubarValue}>
            <MenubarMenu value="file">
              <MenubarTrigger>
                <Text>File</Text>
              </MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <Text>New</Text>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </Row>
      </Section>

      <Separator />

      <Section title="App composites">
        <ListItem
          title="Jane Doe"
          subtitle="+27 82 555 0101"
          leading={<PersonAvatar name="Jane Doe" size="sm" />}
          trailing={<StatusBadge status="confirmed" />}
          onPress={() => {}}
        />
        <View className="flex-row gap-3">
          <StatCard
            label="Today"
            value="8"
            icon={Calendar}
            hint="+2 vs yesterday"
            hintTone="positive"
          />
          <StatCard
            label="Revenue"
            value="R 4,120"
            icon={Heart}
            hint="This month"
          />
        </View>
        <EmptyState
          icon={Bell}
          title="Nothing here yet"
          description="An EmptyState example."
        />
        <ErrorState
          error={
            new ApiError({
              code: 'INTERNAL',
              message: 'Demo error',
              status: 500,
              requestId: 'req_demo123',
            })
          }
          onRetry={() => {}}
        />
      </Section>

      <Separator />

      <Section title="Toasts">
        <Row>
          <Button
            size="sm"
            variant="outline"
            onPress={() => toast.success('Saved')}
          >
            <Text>Success toast</Text>
          </Button>
          <Button size="sm" variant="outline" onPress={() => toast.info('FYI')}>
            <Text>Info toast</Text>
          </Button>
          <Button
            size="sm"
            variant="outline-destructive"
            onPress={() =>
              toast.error(
                new ApiError({
                  code: 'INTERNAL',
                  message: 'Demo failure',
                  status: 500,
                  requestId: 'req_demo456',
                }),
              )
            }
          >
            <Text>Error toast</Text>
          </Button>
        </Row>
      </Section>
    </Screen>
  );
}
