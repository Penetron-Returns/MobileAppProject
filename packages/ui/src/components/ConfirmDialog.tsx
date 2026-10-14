import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../rnr/alert-dialog';
import { Text } from '../primitives/Text';
import { buttonTextVariants } from './Button';
import { cn } from '../lib/cn';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive (cancel/delete-type actions). */
  destructive?: boolean;
  onConfirm: () => void;
}

/** Controlled yes/no confirmation, e.g. "Cancel this booking?". */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>{cancelLabel}</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            onPress={onConfirm}
            className={cn(
              destructive && 'bg-destructive active:bg-destructive/90',
            )}
          >
            <Text
              className={cn(
                destructive && buttonTextVariants({ variant: 'destructive' }),
              )}
            >
              {confirmLabel}
            </Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
