import { PortalHost } from '@rn-primitives/portal';
import { Info } from 'lucide-react-native';
import * as React from 'react';

import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../primitives/Icon';
import { Text } from '../../primitives/Text';
import { act, byLabel, render, textOf } from '../../testing/render';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { Badge } from '../badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../card';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Label } from '../label';
import { Separator } from '../separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import { Textarea } from '../textarea';
import { Toggle } from '../toggle';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

describe('react-native-reusables base', () => {
  it.each(['default', 'secondary', 'outline', 'destructive'] as const)(
    'renders the %s Badge with its label',
    (variant) => {
      const tree = render(
        <Badge variant={variant}>
          <Text>New</Text>
        </Badge>,
      );
      expect(textOf(tree)).toBe('New');
    },
  );

  it.each(['default', 'destructive'] as const)(
    'renders the %s Alert as an alert with title and description',
    (variant) => {
      const tree = render(
        <Alert icon={Info} variant={variant}>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Details</AlertDescription>
        </Alert>,
      );
      expect(textOf(tree)).toContain('Heads up');
      expect(textOf(tree)).toContain('Details');
      expect(
        tree.root.find(
          (n) =>
            n.props.role === 'alert' || n.props.accessibilityRole === 'alert',
        ),
      ).toBeTruthy();
    },
  );

  it('composes a Card from its parts', () => {
    const tree = render(
      <Card>
        <CardHeader>
          <CardTitle>Haircut</CardTitle>
          <CardDescription>45 min</CardDescription>
        </CardHeader>
        <CardContent>
          <Text>Body</Text>
        </CardContent>
        <CardFooter>
          <Text>Footer</Text>
        </CardFooter>
      </Card>,
    );
    for (const part of ['Haircut', '45 min', 'Body', 'Footer']) {
      expect(textOf(tree)).toContain(part);
    }
  });

  it('renders a Separator, Label, Input and Textarea', () => {
    const tree = render(
      <>
        <Separator />
        <Label nativeID="n">Name</Label>
        <Input
          nativeID="n"
          placeholder="Type"
          accessibilityLabel="Name input"
        />
        <Textarea placeholder="Note" accessibilityLabel="Note input" />
      </>,
    );
    expect(textOf(tree)).toContain('Name');
    expect(byLabel(tree, 'Name input').length).toBeGreaterThan(0);
    expect(byLabel(tree, 'Note input').length).toBeGreaterThan(0);
  });

  it('toggles a Checkbox and a Toggle', () => {
    const onChecked = jest.fn();
    const onPressed = jest.fn();
    const tree = render(
      <>
        <Checkbox
          checked={false}
          onCheckedChange={onChecked}
          accessibilityLabel="Agree"
        />
        <Toggle
          pressed={false}
          onPressedChange={onPressed}
          accessibilityLabel="Bold"
        >
          <Text>B</Text>
        </Toggle>
      </>,
    );
    act(() =>
      byLabel(tree, 'Agree')
        .find((n) => !!n.props.onPress)!
        .props.onPress(),
    );
    act(() =>
      byLabel(tree, 'Bold')
        .find((n) => !!n.props.onPress)!
        .props.onPress(),
    );
    expect(onChecked).toHaveBeenCalledWith(true);
    expect(onPressed).toHaveBeenCalledWith(true);
  });

  it('shows only the active Tabs content', () => {
    const tree = render(
      <Tabs value="one" onValueChange={jest.fn()}>
        <TabsList>
          <TabsTrigger value="one">
            <Text>One</Text>
          </TabsTrigger>
          <TabsTrigger value="two">
            <Text>Two</Text>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">
          <Text>First panel</Text>
        </TabsContent>
        <TabsContent value="two">
          <Text>Second panel</Text>
        </TabsContent>
      </Tabs>,
    );
    expect(textOf(tree)).toContain('First panel');
    expect(textOf(tree)).not.toContain('Second panel');
  });

  it('renders an Icon with a className colour', () => {
    const tree = render(<Icon as={Info} size={20} className="text-primary" />);
    expect(JSON.stringify(tree.toJSON())).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  function dialog(
    props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
  ) {
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    const tree = render(
      <>
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Cancel this booking?"
          description="The client is told on WhatsApp."
          onConfirm={onConfirm}
          {...props}
        />
        <PortalHost />
      </>,
    );
    return { tree, onConfirm };
  }

  it('asks the question with a description and the default labels', () => {
    const { tree } = dialog();
    const text = textOf(tree);
    expect(text).toContain('Cancel this booking?');
    expect(text).toContain('The client is told on WhatsApp.');
    expect(text).toContain('Confirm');
    expect(text).toContain('Cancel');
  });

  it('uses custom labels and confirms through the action', () => {
    const { tree, onConfirm } = dialog({
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    expect(textOf(tree)).toContain('Keep it');
    const confirm = tree.root.find(
      (n) => !!n.props.onPress && textOf(n).includes('Cancel booking'),
    );
    act(() => confirm.props.onPress());
    expect(onConfirm).toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    const { tree } = dialog({ open: false });
    expect(textOf(tree)).not.toContain('Cancel this booking?');
  });
});
