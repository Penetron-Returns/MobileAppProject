import { ChevronRight, Clock, Plus, Trash2, X } from 'lucide-react-native';
import * as React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  durationText: string;
  price: string;
}

const INITIAL_SERVICES: ServiceItem[] = [
  {
    id: 's-1',
    name: "Women's Haircut",
    category: 'Hair',
    durationMinutes: 60,
    durationText: '60m',
    price: '$85.00',
  },
  {
    id: 's-2',
    name: "Men's Haircut",
    category: 'Hair',
    durationMinutes: 45,
    durationText: '45m',
    price: '$55.00',
  },
  {
    id: 's-3',
    name: 'Balayage & Toner',
    category: 'Hair',
    durationMinutes: 180,
    durationText: '180m',
    price: '$220.00',
  },
  {
    id: 's-4',
    name: 'Gel Manicure',
    category: 'Nails',
    durationMinutes: 45,
    durationText: '45m',
    price: '$45.00',
  },
  {
    id: 's-5',
    name: 'Spa Pedicure',
    category: 'Nails',
    durationMinutes: 60,
    durationText: '60m',
    price: '$65.00',
  },
];

const PRESET_CATEGORIES = ['Hair', 'Nails', 'Skincare', 'Massage'];
const DURATION_PRESETS = [
  { minutes: 30, text: '30m' },
  { minutes: 45, text: '45m' },
  { minutes: 60, text: '60m' },
  { minutes: 90, text: '90m' },
  { minutes: 120, text: '120m' },
  { minutes: 180, text: '180m' },
];

export default function ServicesScreen() {
  const [services, setServices] =
    React.useState<ServiceItem[]>(INITIAL_SERVICES);

  // Modal State
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingServiceId, setEditingServiceId] = React.useState<string | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  // Form Fields
  const [formName, setFormName] = React.useState('');
  const [formCategory, setFormCategory] = React.useState('Hair');
  const [formDuration, setFormDuration] = React.useState('60m');
  const [formPrice, setFormPrice] = React.useState('');

  const categories = React.useMemo(() => {
    const list: string[] = [];
    services.forEach((s) => {
      if (!list.includes(s.category)) {
        list.push(s.category);
      }
    });
    return list;
  }, [services]);

  const handleOpenAdd = () => {
    setEditingServiceId(null);
    setFormName('');
    setFormCategory('Hair');
    setFormDuration('60m');
    setFormPrice('$50.00');
    setModalOpen(true);
  };

  const handleOpenEdit = (service: ServiceItem) => {
    setEditingServiceId(service.id);
    setFormName(service.name);
    setFormCategory(service.category);
    setFormDuration(service.durationText);
    setFormPrice(service.price);
    setModalOpen(true);
  };

  const handleSaveService = () => {
    if (!formName.trim()) {
      toast.error('Please enter a service name');
      return;
    }
    const cleanPrice = formPrice.trim().startsWith('$')
      ? formPrice.trim()
      : `$${formPrice.trim() || '0.00'}`;

    const durObj = DURATION_PRESETS.find((d) => d.text === formDuration) || {
      minutes: 60,
      text: formDuration,
    };

    if (editingServiceId) {
      setServices((prev) =>
        prev.map((s) =>
          s.id === editingServiceId
            ? {
                ...s,
                name: formName.trim(),
                category: formCategory,
                durationMinutes: durObj.minutes,
                durationText: durObj.text,
                price: cleanPrice,
              }
            : s,
        ),
      );
      toast.success('Service updated successfully');
    } else {
      const newService: ServiceItem = {
        id: `s-${Date.now()}`,
        name: formName.trim(),
        category: formCategory,
        durationMinutes: durObj.minutes,
        durationText: durObj.text,
        price: cleanPrice,
      };
      setServices((prev) => [...prev, newService]);
      toast.success('Service added successfully');
    }

    setModalOpen(false);
  };

  const handleDeleteService = () => {
    if (!editingServiceId) return;
    setServices((prev) => prev.filter((s) => s.id !== editingServiceId));
    setDeleteConfirmOpen(false);
    setModalOpen(false);
    toast.info('Service removed');
  };

  return (
    <Screen
      header={<Header title="Services" fallbackHref="/settings" />}
      footer={
        <View className="items-center pb-2">
          <Pressable
            onPress={handleOpenAdd}
            accessibilityRole="button"
            accessibilityLabel="Add Service"
            className="bg-primary active:opacity-90 h-14 w-full max-w-md flex-row items-center justify-center gap-2 rounded-full shadow-lg"
          >
            <Icon as={Plus} size={20} className="text-primary-foreground" />
            <Text className="text-primary-foreground text-base font-bold">
              Add Service
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="mx-auto w-full max-w-2xl gap-6 pb-6">
        {categories.map((cat) => {
          const categoryServices = services.filter((s) => s.category === cat);
          if (categoryServices.length === 0) return null;

          return (
            <View key={cat} className="gap-2.5">
              <Text className="text-primary px-1 text-lg font-bold">{cat}</Text>
              <View className="gap-2">
                {categoryServices.map((service) => (
                  <Pressable
                    key={service.id}
                    onPress={() => handleOpenEdit(service)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${service.name}`}
                    className="bg-card border-border active:border-primary flex-row items-center justify-between rounded-xl border p-4 shadow-sm"
                  >
                    <View className="flex-1 gap-1 pr-3">
                      <Text className="text-foreground text-base font-semibold">
                        {service.name}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <View className="flex-row items-center gap-1">
                          <Icon
                            as={Clock}
                            size={14}
                            className="text-muted-foreground"
                          />
                          <Text className="text-muted-foreground text-sm font-medium">
                            {service.durationText}
                          </Text>
                        </View>
                        <View className="bg-muted-foreground/30 h-1 w-1 rounded-full" />
                        <Text className="text-foreground text-sm font-bold">
                          {service.price}
                        </Text>
                      </View>
                    </View>
                    <View className="h-9 w-9 items-center justify-center rounded-full active:bg-accent">
                      <Icon
                        as={ChevronRight}
                        size={20}
                        className="text-muted-foreground"
                      />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {/* Add / Edit Service Modal */}
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
                {editingServiceId ? 'Edit Service' : 'Add New Service'}
              </Text>
              <Pressable
                onPress={() => setModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                accessibilityRole="button"
                accessibilityLabel="Close service modal"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView className="max-h-[75vh] p-4">
              <View className="gap-4">
                {/* Service Name */}
                <View className="gap-1.5">
                  <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    Service Name
                  </Text>
                  <TextInput
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="e.g. Balayage & Toner"
                    placeholderTextColor="#6f7880"
                    className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
                  />
                </View>

                {/* Category Selection */}
                <View className="gap-1.5">
                  <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    Category
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {PRESET_CATEGORIES.map((cat) => {
                      const isSelected = formCategory === cat;
                      return (
                        <Pressable
                          key={cat}
                          onPress={() => setFormCategory(cat)}
                          accessibilityRole="button"
                          accessibilityLabel={`Category ${cat}`}
                          className={cn(
                            'rounded-lg px-3 py-1.5 border',
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'bg-muted/40 border-border active:bg-muted',
                          )}
                        >
                          <Text
                            className={cn(
                              'text-xs font-semibold',
                              isSelected
                                ? 'text-primary-foreground'
                                : 'text-foreground',
                            )}
                          >
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Duration Presets */}
                <View className="gap-1.5">
                  <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    Duration
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {DURATION_PRESETS.map((dur) => {
                      const isSelected = formDuration === dur.text;
                      return (
                        <Pressable
                          key={dur.text}
                          onPress={() => setFormDuration(dur.text)}
                          accessibilityRole="button"
                          accessibilityLabel={`Duration ${dur.text}`}
                          className={cn(
                            'rounded-lg px-3 py-1.5 border',
                            isSelected
                              ? 'bg-primary border-primary'
                              : 'bg-muted/40 border-border active:bg-muted',
                          )}
                        >
                          <Text
                            className={cn(
                              'text-xs font-semibold',
                              isSelected
                                ? 'text-primary-foreground'
                                : 'text-foreground',
                            )}
                          >
                            {dur.text}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Price */}
                <View className="gap-1.5">
                  <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    Price
                  </Text>
                  <TextInput
                    value={formPrice}
                    onChangeText={setFormPrice}
                    placeholder="e.g. $85.00"
                    placeholderTextColor="#6f7880"
                    keyboardType="numeric"
                    className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
                  />
                </View>

                {/* Delete button when editing */}
                {editingServiceId ? (
                  <View className="border-border mt-2 border-t pt-3">
                    <Pressable
                      onPress={() => setDeleteConfirmOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete service"
                      className="border-destructive/30 bg-destructive/5 active:bg-destructive/10 flex-row items-center justify-center gap-2 rounded-xl border py-2.5"
                    >
                      <Icon
                        as={Trash2}
                        size={16}
                        className="text-destructive"
                      />
                      <Text className="text-destructive text-sm font-semibold">
                        Delete Service
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
                accessibilityLabel="Cancel service editing"
                className="border-border bg-muted/30 active:bg-muted flex-1 items-center justify-center rounded-xl border py-3"
              >
                <Text className="text-foreground text-sm font-semibold">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveService}
                accessibilityRole="button"
                accessibilityLabel="Save service"
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
        title="Delete Service?"
        description="Are you sure you want to remove this service from your catalogue? Clients will no longer be able to book it."
        confirmLabel="Yes, Delete"
        cancelLabel="Keep Service"
        destructive
        onConfirm={handleDeleteService}
      />
    </Screen>
  );
}
