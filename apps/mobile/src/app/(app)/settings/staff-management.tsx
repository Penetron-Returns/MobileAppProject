import {
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import * as React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  imageUrl?: string;
  isActive: boolean;
  canAcceptBookings: boolean;
}

const INITIAL_STAFF: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Emma Thompson',
    role: 'Senior Colorist',
    imageUrl:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&auto=format&fit=crop&q=80',
    isActive: true,
    canAcceptBookings: true,
  },
  {
    id: 'staff-2',
    name: 'Marcus Chen',
    role: 'Master Stylist',
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    isActive: true,
    canAcceptBookings: true,
  },
  {
    id: 'staff-3',
    name: 'Sarah Jenkins',
    role: 'Junior Stylist',
    imageUrl: undefined,
    isActive: false,
    canAcceptBookings: false,
  },
];

const ROLE_SUGGESTIONS = [
  'Senior Colorist',
  'Master Stylist',
  'Junior Stylist',
  'Esthetician',
  'Nail Artist',
];

export default function StaffManagementScreen() {
  const [staffList, setStaffList] =
    React.useState<StaffMember[]>(INITIAL_STAFF);
  const [isSaving, setIsSaving] = React.useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingStaffId, setEditingStaffId] = React.useState<string | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  // Form Fields
  const [formName, setFormName] = React.useState('');
  const [formRole, setFormRole] = React.useState('Senior Colorist');
  const [formIsActive, setFormIsActive] = React.useState(true);
  const [formCanBook, setFormCanBook] = React.useState(true);

  const handleToggleBookings = (id: string, value: boolean) => {
    setStaffList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, canAcceptBookings: value } : s)),
    );
  };

  const handleOpenAdd = () => {
    setEditingStaffId(null);
    setFormName('');
    setFormRole('Senior Colorist');
    setFormIsActive(true);
    setFormCanBook(true);
    setModalOpen(true);
  };

  const handleOpenEdit = (staff: StaffMember) => {
    setEditingStaffId(staff.id);
    setFormName(staff.name);
    setFormRole(staff.role);
    setFormIsActive(staff.isActive);
    setFormCanBook(staff.canAcceptBookings);
    setModalOpen(true);
  };

  const handleSaveStaff = () => {
    if (!formName.trim()) {
      toast.error('Please enter a staff name');
      return;
    }

    if (editingStaffId) {
      setStaffList((prev) =>
        prev.map((s) =>
          s.id === editingStaffId
            ? {
                ...s,
                name: formName.trim(),
                role: formRole.trim(),
                isActive: formIsActive,
                canAcceptBookings: formCanBook,
              }
            : s,
        ),
      );
      toast.success('Staff details updated');
    } else {
      const newStaff: StaffMember = {
        id: `staff-${Date.now()}`,
        name: formName.trim(),
        role: formRole.trim(),
        isActive: formIsActive,
        canAcceptBookings: formCanBook,
      };
      setStaffList((prev) => [...prev, newStaff]);
      toast.success('Staff member added');
    }

    setModalOpen(false);
  };

  const handleDeleteStaff = () => {
    if (!editingStaffId) return;
    setStaffList((prev) => prev.filter((s) => s.id !== editingStaffId));
    setDeleteConfirmOpen(false);
    setModalOpen(false);
    toast.info('Staff member removed');
  };

  const handleSaveChanges = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Staff availability saved successfully');
    }, 400);
  };

  return (
    <Screen
      header={<Header title="Staff Management" fallbackHref="/settings" />}
      footer={
        <View className="w-full">
          <Pressable
            onPress={handleSaveChanges}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save Changes"
            className="bg-primary active:opacity-90 h-12 w-full flex-row items-center justify-center gap-2 rounded-xl shadow-md"
          >
            <Icon as={Check} size={18} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-base font-semibold">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="mx-auto w-full max-w-2xl gap-5 pb-6">
        {/* Action Header Area */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-foreground text-lg font-bold">
              Team Directory
            </Text>
            <Text className="text-muted-foreground mt-0.5 text-sm">
              Manage roles and availability
            </Text>
          </View>
          <Pressable
            onPress={handleOpenAdd}
            accessibilityRole="button"
            accessibilityLabel="Add Staff"
            className="bg-primary flex-row items-center gap-1.5 rounded-lg px-4 py-2.5 shadow-sm active:opacity-90"
          >
            <Icon as={Plus} size={18} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-xs font-bold uppercase tracking-wider">
              Add Staff
            </Text>
          </Pressable>
        </View>

        {/* Staff Members List */}
        <View className="gap-3">
          {staffList.map((staff) => (
            <Pressable
              key={staff.id}
              onPress={() => handleOpenEdit(staff)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${staff.name}`}
              className={cn(
                'bg-card border-border relative flex-row items-center gap-3.5 overflow-hidden rounded-xl border p-4 shadow-sm active:border-primary',
                !staff.isActive && 'opacity-75',
              )}
            >
              {/* Left Accent Bar */}
              <View
                className={cn(
                  'absolute bottom-0 left-0 top-0 w-1',
                  staff.isActive ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              />

              {/* Staff Avatar */}
              <PersonAvatar
                name={staff.name}
                imageUrl={staff.imageUrl}
                size="lg"
              />

              {/* Staff Details */}
              <View className="flex-1 min-w-0">
                <Text
                  className="text-foreground text-base font-bold"
                  numberOfLines={1}
                >
                  {staff.name}
                </Text>
                <Text
                  className="text-muted-foreground text-sm"
                  numberOfLines={1}
                >
                  {staff.role}
                </Text>
                <View className="mt-1 flex-row items-center gap-1">
                  {staff.isActive ? (
                    <>
                      <Icon
                        as={CheckCircle2}
                        size={14}
                        className="text-whatsapp"
                      />
                      <Text className="text-whatsapp text-xs font-semibold">
                        Active
                      </Text>
                    </>
                  ) : (
                    <>
                      <Icon
                        as={Clock}
                        size={14}
                        className="text-muted-foreground"
                      />
                      <Text className="text-muted-foreground text-xs font-medium">
                        On Leave
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Bookings Switch */}
              <View className="items-end justify-center pl-2">
                <Text className="text-muted-foreground mb-1.5 text-xs font-medium">
                  Bookings
                </Text>
                <Switch
                  value={staff.canAcceptBookings}
                  onValueChange={(val) => handleToggleBookings(staff.id, val)}
                  trackColor={{ false: '#cbd5e1', true: '#006389' }}
                  accessibilityLabel={`Toggle bookings for ${staff.name}`}
                />
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Add / Edit Staff Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          onPress={() => setModalOpen(false)}
          className="bg-black/50 flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={() => {}}
            className="border-border bg-card w-full max-w-md overflow-hidden rounded-2xl border shadow-xl"
          >
            {/* Modal Header */}
            <View className="border-border flex-row items-center justify-between border-b p-4">
              <Text className="text-foreground text-lg font-bold">
                {editingStaffId ? 'Edit Staff Member' : 'Add Staff Member'}
              </Text>
              <Pressable
                onPress={() => setModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                accessibilityRole="button"
                accessibilityLabel="Close staff modal"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView className="max-h-[75vh] p-4">
              <View className="gap-4">
                {/* Staff Name */}
                <View className="gap-1.5">
                  <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    Full Name
                  </Text>
                  <TextInput
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="e.g. Emma Thompson"
                    placeholderTextColor="#6f7880"
                    className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
                  />
                </View>

                {/* Role Input & Suggestions */}
                <View className="gap-1.5">
                  <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    Role / Title
                  </Text>
                  <TextInput
                    value={formRole}
                    onChangeText={setFormRole}
                    placeholder="e.g. Senior Colorist"
                    placeholderTextColor="#6f7880"
                    className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
                  />
                  <View className="mt-1 flex-row flex-wrap gap-1.5">
                    {ROLE_SUGGESTIONS.map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setFormRole(r)}
                        className={cn(
                          'rounded-md px-2.5 py-1 border',
                          formRole === r
                            ? 'bg-primary/10 border-primary'
                            : 'bg-muted/40 border-border active:bg-muted',
                        )}
                      >
                        <Text
                          className={cn(
                            'text-xs',
                            formRole === r
                              ? 'text-primary font-semibold'
                              : 'text-muted-foreground',
                          )}
                        >
                          {r}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Active Status */}
                <View className="border-border flex-row items-center justify-between border-t pt-3">
                  <View>
                    <Text className="text-foreground text-sm font-semibold">
                      Active Status
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      Mark as Active or On Leave
                    </Text>
                  </View>
                  <Switch
                    value={formIsActive}
                    onValueChange={setFormIsActive}
                    trackColor={{ false: '#cbd5e1', true: '#006389' }}
                    accessibilityLabel="Toggle Active Status"
                  />
                </View>

                {/* Online Bookings */}
                <View className="border-border flex-row items-center justify-between border-t pt-3">
                  <View>
                    <Text className="text-foreground text-sm font-semibold">
                      Accept Online Bookings
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      Clients can select this staff member
                    </Text>
                  </View>
                  <Switch
                    value={formCanBook}
                    onValueChange={setFormCanBook}
                    trackColor={{ false: '#cbd5e1', true: '#006389' }}
                    accessibilityLabel="Toggle Accept Online Bookings"
                  />
                </View>

                {/* Delete button when editing */}
                {editingStaffId ? (
                  <View className="border-border mt-2 border-t pt-3">
                    <Pressable
                      onPress={() => setDeleteConfirmOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete staff member"
                      className="border-destructive/30 bg-destructive/5 active:bg-destructive/10 flex-row items-center justify-center gap-2 rounded-xl border py-2.5"
                    >
                      <Icon
                        as={Trash2}
                        size={16}
                        className="text-destructive"
                      />
                      <Text className="text-destructive text-sm font-semibold">
                        Delete Staff Member
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            {/* Modal Footer Actions */}
            <View className="border-border bg-card flex-row gap-2.5 border-t p-4">
              <Pressable
                onPress={() => setModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel staff editing"
                className="border-border bg-muted/30 active:bg-muted flex-1 items-center justify-center rounded-xl border py-3"
              >
                <Text className="text-foreground text-sm font-semibold">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveStaff}
                accessibilityRole="button"
                accessibilityLabel="Save staff member"
                className="bg-primary active:opacity-90 flex-1 items-center justify-center rounded-xl py-3 shadow-sm"
              >
                <Text className="text-primary-foreground text-sm font-semibold">
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Remove Staff Member?"
        description="Are you sure you want to remove this staff member from your team directory? Their existing bookings will remain preserved."
        confirmLabel="Yes, Remove"
        cancelLabel="Keep Staff"
        destructive
        onConfirm={handleDeleteStaff}
      />
    </Screen>
  );
}
