import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  AspectRatio,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Icon,
  Input,
  Label,
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@booking/ui';
import { AlertTriangle, Info, Scissors } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Row, Section } from './Specimen';

/** The react-native-reusables base the design system wraps (shadcn for RN). */
export function BaseGallery() {
  const [checked, setChecked] = React.useState(true);
  const [pressed, setPressed] = React.useState(true);
  const [group, setGroup] = React.useState<string | undefined>('a');
  const [tab, setTab] = React.useState('one');
  const [menubar, setMenubar] = React.useState<string | undefined>(undefined);
  return (
    <>
      <Section
        title="Base: feedback"
        note="Alert, Badge, Card, Progress, AspectRatio"
      >
        <Alert icon={Info}>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>An informational message.</AlertDescription>
        </Alert>
        <Alert icon={AlertTriangle} variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>A destructive alert.</AlertDescription>
        </Alert>
        <Row>
          {(['default', 'secondary', 'outline', 'destructive'] as const).map(
            (v) => (
              <Badge key={v} variant={v}>
                <Text>{v}</Text>
              </Badge>
            ),
          )}
        </Row>
        <Card>
          <CardHeader>
            <CardTitle>Haircut and beard trim</CardTitle>
            <CardDescription>45 min</CardDescription>
          </CardHeader>
          <CardContent>
            <Text variant="muted">Card body.</Text>
          </CardContent>
          <CardFooter>
            <Button size="sm">
              <Text>Book</Text>
            </Button>
          </CardFooter>
        </Card>
        <Progress value={60} />
        <View className="w-40">
          <AspectRatio ratio={16 / 9}>
            <View className="bg-accent h-full w-full items-center justify-center rounded-md">
              <Icon as={Scissors} size={20} className="text-primary" />
            </View>
          </AspectRatio>
        </View>
        <Separator />
      </Section>

      <Section title="Base: form controls">
        <Row>
          <Checkbox checked={checked} onCheckedChange={setChecked} />
          <Checkbox checked={false} onCheckedChange={() => {}} />
          <Toggle pressed={pressed} onPressedChange={setPressed}>
            <Text>Toggle</Text>
          </Toggle>
        </Row>
        <ToggleGroup type="single" value={group} onValueChange={setGroup}>
          <ToggleGroupItem value="a" isFirst>
            <Text>A</Text>
          </ToggleGroupItem>
          <ToggleGroupItem value="b" isLast>
            <Text>B</Text>
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
        <Label nativeID="demo-input">Input</Label>
        <Input nativeID="demo-input" placeholder="Type here" />
        <Textarea placeholder="Textarea" />
        <Select defaultValue={{ value: 'confirmed', label: 'Confirmed' }}>
          <SelectTrigger>
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem label="Confirmed" value="confirmed" />
            <SelectItem label="Cancelled" value="cancelled" />
          </SelectContent>
        </Select>
      </Section>

      <Section title="Base: disclosure">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="one">
              <Text>One</Text>
            </TabsTrigger>
            <TabsTrigger value="two">
              <Text>Two</Text>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="one">
            <Text variant="muted">Tab one.</Text>
          </TabsContent>
          <TabsContent value="two">
            <Text variant="muted">Tab two.</Text>
          </TabsContent>
        </Tabs>
        <Accordion type="single" collapsible>
          <AccordionItem value="a">
            <AccordionTrigger>
              <Text>What is this?</Text>
            </AccordionTrigger>
            <AccordionContent>
              <Text variant="muted">A collapsible item.</Text>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="self-start">
              <Text>Toggle details</Text>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Text variant="muted" className="pt-2">
              Extra detail.
            </Text>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      <Section title="Base: overlays and menus">
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
              <Text variant="muted">Dialog body.</Text>
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
              <Text variant="muted">Sheet body.</Text>
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
              <Text variant="muted">Context on hover or press.</Text>
            </HoverCardContent>
          </HoverCard>
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
            </ContextMenuContent>
          </ContextMenu>
          <Menubar value={menubar} onValueChange={setMenubar}>
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
    </>
  );
}
