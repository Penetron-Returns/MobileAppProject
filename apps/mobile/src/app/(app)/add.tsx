import { router } from 'expo-router';
import {
  Bell,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react-native';
import * as React from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface ClientItem {
  id: string;
  name: string;
  phone: string;
}

interface ServiceItem {
  id: string;
  name: string;
  duration: string;
  price: string;
}

const EXISTING_CLIENTS: ClientItem[] = [
  { id: 'c-1', name: 'Sarah Jenkins', phone: '+27 82 555 0123' },
  { id: 'c-2', name: 'Michael Chang', phone: '+27 83 555 0145' },
  { id: 'c-3', name: 'Emma Thompson', phone: '+27 84 555 0167' },
  { id: 'c-4', name: 'David Ross', phone: '+27 81 555 0189' },
  { id: 'c-5', name: 'Elena Rodriguez', phone: '+27 82 555 0199' },
];

const SERVICES: ServiceItem[] = [
  {
    id: 's-1',
    name: 'Signature Facial',
    duration: '60 min',
    price: '$95',
  },
  {
    id: 's-2',
    name: 'Deep Tissue Massage',
    duration: '90 min',
    price: '$120',
  },
  {
    id: 's-3',
    name: 'Full Color & Blowout',
    duration: '90 min',
    price: '$145',
  },
  {
    id: 's-4',
    name: 'Haircut & Styling',
    duration: '60 min',
    price: '$65',
  },
  {
    id: 's-5',
    name: 'Manicure & Pedicure',
    duration: '45 min',
    price: '$55',
  },
  {
    id: 's-6',
    name: 'Keratin Treatment',
    duration: '120 min',
    price: '$180',
  },
];

const STAFF_MEMBERS = [
  'No Preference',
  'Sarah Jenkins',
  'Michael Chang',
  'Elena Rodriguez',
];

const AVAILABLE_TIMES = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
];

export default function AddBookingScreen() {
  const [clientMode, setClientMode] = React.useState<'existing' | 'new'>(
    'existing',
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedClient, setSelectedClient] = React.useState<ClientItem | null>(
    null,
  );
  const [newClientName, setNewClientName] = React.useState('');
  const [newClientPhone, setNewClientPhone] = React.useState('');

  const [selectedService, setSelectedService] = React.useState<ServiceItem>(
    SERVICES[0],
  );
  const [serviceModalOpen, setServiceModalOpen] = React.useState(false);

  const [selectedDate, setSelectedDate] = React.useState('2023-10-24');
  const [selectedTime, setSelectedTime] = React.useState('10:00');
  const [timeModalOpen, setTimeModalOpen] = React.useState(false);

  const [selectedStaff, setSelectedStaff] = React.useState(STAFF_MEMBERS[0]);
  const [staffModalOpen, setStaffModalOpen] = React.useState(false);

  const [notes, setNotes] = React.useState('');
  const [sendWhatsApp, setSendWhatsApp] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const filteredClients = React.useMemo(() => {
    if (!searchQuery.trim()) return EXISTING_CLIENTS;
    const q = searchQuery.toLowerCase();
    return EXISTING_CLIENTS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const handleSave = () => {
    const clientName =
      clientMode === 'existing' ? selectedClient?.name : newClientName.trim();

    if (!clientName) {
      toast.error('Please select or enter a client name');
      return;
    }

    if (!selectedService) {
      toast.error('Please select a service');
      return;
    }

    setIsSubmitting(true);
    try {
      toast.success(`Booking created for ${clientName}!`);
      if (sendWhatsApp) {
        toast.info('WhatsApp confirmation queued');
      }
      router.replace('/calendar' as never);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      header={
        <Header
          title="Administrator"
          hideBack
          right={
            <Pressable
              onPress={() => toast.info('No new notifications')}
              className="relative h-10 w-10 items-center justify-center rounded-full active:bg-accent"
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={8}
            >
              <Icon as={Bell} size={20} className="text-foreground" />
              <View className="bg-destructive absolute right-2 top-2 h-2 w-2 rounded-full border border-background" />
            </Pressable>
          }
        />
      }
      footer={
        <View className="border-border bg-card/95 border-t px-4 py-3 backdrop-blur-sm sm:px-6">
          <Pressable
            onPress={handleSave}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Save Booking"
            className="bg-primary flex-row items-center justify-center gap-2 rounded-xl py-3.5 shadow-md active:opacity-90"
          >
            <Icon
              as={CheckCircle}
              size={20}
              className="text-primary-foreground"
            />
            <Text className="text-primary-foreground text-base font-semibold">
              Save Booking
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="mx-auto w-full max-w-lg gap-6 pb-8">
        {/* Client Section */}
        <View className="gap-2">
          <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
            Client
          </Text>

          {/* Existing vs New Tab Toggle */}
          <View className="bg-muted flex-row rounded-lg p-1">
            <Pressable
              onPress={() => setClientMode('existing')}
              accessibilityRole="tab"
              accessibilityState={{ selected: clientMode === 'existing' }}
              className={cn(
                'flex-1 items-center justify-center rounded-md py-2 transition-all',
                clientMode === 'existing'
                  ? 'bg-card shadow-sm'
                  : 'active:bg-accent/50',
              )}
            >
              <Text
                className={cn(
                  'text-xs font-bold uppercase tracking-wide',
                  clientMode === 'existing'
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}
              >
                Existing
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setClientMode('new')}
              accessibilityRole="tab"
              accessibilityState={{ selected: clientMode === 'new' }}
              className={cn(
                'flex-1 items-center justify-center rounded-md py-2 transition-all',
                clientMode === 'new'
                  ? 'bg-card shadow-sm'
                  : 'active:bg-accent/50',
              )}
            >
              <Text
                className={cn(
                  'text-xs font-bold uppercase tracking-wide',
                  clientMode === 'new'
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}
              >
                New Client
              </Text>
            </Pressable>
          </View>

          {clientMode === 'existing' ? (
            /* Existing Client Search / Selected View */
            <View className="gap-2">
              {selectedClient ? (
                <View className="border-primary/40 bg-primary/5 flex-row items-center justify-between rounded-xl border p-3">
                  <View className="flex-row items-center gap-3">
                    <PersonAvatar name={selectedClient.name} size="md" />
                    <View>
                      <Text className="text-foreground text-sm font-semibold">
                        {selectedClient.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        {selectedClient.phone}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setSelectedClient(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Change client"
                    className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                    hitSlop={8}
                  >
                    <Icon as={X} size={16} className="text-muted-foreground" />
                  </Pressable>
                </View>
              ) : (
                <View className="gap-2">
                  <View className="border-border bg-card flex-row items-center rounded-lg border px-3 py-1">
                    <Icon
                      as={Search}
                      size={18}
                      className="text-muted-foreground mr-2.5"
                    />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search by name or phone..."
                      placeholderTextColor="#6f7880"
                      className="text-foreground flex-1 py-2 text-sm"
                    />
                    {searchQuery ? (
                      <Pressable
                        onPress={() => setSearchQuery('')}
                        hitSlop={8}
                        className="p-1"
                      >
                        <Icon
                          as={X}
                          size={14}
                          className="text-muted-foreground"
                        />
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Client matching suggestions */}
                  <View className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
                    {filteredClients.map((client, idx) => (
                      <Pressable
                        key={client.id}
                        onPress={() => setSelectedClient(client)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select client ${client.name}`}
                        className={cn(
                          'flex-row items-center justify-between p-3 active:bg-accent/50',
                          idx < filteredClients.length - 1 &&
                            'border-border border-b',
                        )}
                      >
                        <View className="flex-row items-center gap-2.5">
                          <PersonAvatar name={client.name} size="sm" />
                          <View>
                            <Text className="text-foreground text-sm font-medium">
                              {client.name}
                            </Text>
                            <Text className="text-muted-foreground text-xs">
                              {client.phone}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-primary text-xs font-semibold">
                          Select
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            /* New Client Inputs */
            <View className="gap-3">
              <View className="border-border bg-card flex-row items-center rounded-lg border px-3 py-1">
                <Icon
                  as={User}
                  size={18}
                  className="text-muted-foreground mr-2.5"
                />
                <TextInput
                  value={newClientName}
                  onChangeText={setNewClientName}
                  placeholder="Full Name"
                  placeholderTextColor="#6f7880"
                  className="text-foreground flex-1 py-2 text-sm"
                />
              </View>
              <View className="border-border bg-card flex-row items-center rounded-lg border px-3 py-1">
                <Icon
                  as={Phone}
                  size={18}
                  className="text-muted-foreground mr-2.5"
                />
                <TextInput
                  value={newClientPhone}
                  onChangeText={setNewClientPhone}
                  placeholder="Mobile Number"
                  keyboardType="phone-pad"
                  placeholderTextColor="#6f7880"
                  className="text-foreground flex-1 py-2 text-sm"
                />
              </View>
            </View>
          )}
        </View>

        {/* Service Selection */}
        <View className="gap-2">
          <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
            Service
          </Text>
          <Pressable
            onPress={() => setServiceModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Select service"
            className="border-border bg-card flex-row items-center justify-between rounded-lg border px-3.5 py-3 active:border-primary"
          >
            <View className="flex-1 flex-row items-center gap-2.5 pr-2">
              <Icon as={Sparkles} size={18} className="text-primary" />
              <View className="flex-1">
                <Text className="text-foreground text-sm font-medium">
                  {selectedService
                    ? selectedService.name
                    : 'Select a service...'}
                </Text>
                {selectedService ? (
                  <Text className="text-muted-foreground text-xs">
                    {selectedService.duration} · {selectedService.price}
                  </Text>
                ) : null}
              </View>
            </View>
            <Icon
              as={ChevronDown}
              size={18}
              className="text-muted-foreground"
            />
          </Pressable>
        </View>

        {/* Date & Time Row */}
        <View className="flex-row gap-3">
          {/* Date Picker */}
          <View className="flex-1 gap-1.5">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Date
            </Text>
            <View className="border-border bg-card flex-row items-center rounded-lg border px-3 py-1">
              <Icon
                as={Calendar}
                size={18}
                className="text-muted-foreground mr-2.5"
              />
              <TextInput
                value={selectedDate}
                onChangeText={setSelectedDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6f7880"
                className="text-foreground flex-1 py-2 text-sm"
              />
            </View>
          </View>

          {/* Time Picker */}
          <View className="flex-1 gap-1.5">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Time
            </Text>
            <Pressable
              onPress={() => setTimeModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Select time"
              className="border-border bg-card flex-row items-center justify-between rounded-lg border px-3 py-2.5 active:border-primary"
            >
              <View className="flex-1 flex-row items-center">
                <Icon
                  as={Clock}
                  size={18}
                  className="text-muted-foreground mr-2.5"
                />
                <Text className="text-foreground text-sm font-medium">
                  {selectedTime}
                </Text>
              </View>
              <Icon
                as={ChevronDown}
                size={16}
                className="text-muted-foreground"
              />
            </Pressable>
          </View>
        </View>

        {/* Staff Selection */}
        <View className="gap-2">
          <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
            Staff Member
          </Text>
          <Pressable
            onPress={() => setStaffModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Select staff member"
            className="border-border bg-card flex-row items-center justify-between rounded-lg border px-3.5 py-3 active:border-primary"
          >
            <View className="flex-1 flex-row items-center gap-2.5 pr-2">
              <Icon as={User} size={18} className="text-muted-foreground" />
              <Text className="text-foreground text-sm font-medium">
                {selectedStaff}
              </Text>
            </View>
            <Icon
              as={ChevronDown}
              size={18}
              className="text-muted-foreground"
            />
          </Pressable>
        </View>

        {/* Internal Notes */}
        <View className="gap-2">
          <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
            Internal Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="Add any special requests, allergies, or notes for the staff..."
            placeholderTextColor="#6f7880"
            className="text-foreground border-border bg-card min-h-[96px] rounded-lg border p-3.5 text-sm"
          />
        </View>

        {/* Send WhatsApp Confirmation Toggle */}
        <View className="border-border bg-accent/30 flex-row items-center justify-between rounded-xl border p-4">
          <View className="flex-1 flex-row items-center gap-3 pr-3">
            <View className="bg-whatsapp/10 h-10 w-10 items-center justify-center rounded-full">
              <Icon as={MessageCircle} size={22} className="text-whatsapp" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">
                Send WhatsApp confirmation
              </Text>
              <Text className="text-muted-foreground text-xs">
                Instant booking details
              </Text>
            </View>
          </View>
          <Switch
            checked={sendWhatsApp}
            onCheckedChange={setSendWhatsApp}
            accessibilityLabel="Send WhatsApp confirmation toggle"
          />
        </View>
      </View>

      {/* Service Selection Modal */}
      <Modal
        visible={serviceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setServiceModalOpen(false)}
      >
        <Pressable
          onPress={() => setServiceModalOpen(false)}
          className="bg-black/50 flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="border-border bg-card w-full max-w-sm overflow-hidden rounded-2xl border shadow-xl"
          >
            <View className="border-border flex-row items-center justify-between border-b p-4">
              <Text className="text-foreground text-base font-bold">
                Select Service
              </Text>
              <Pressable
                onPress={() => setServiceModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            <ScrollView className="max-h-80">
              {SERVICES.map((service) => {
                const isSelected = selectedService.id === service.id;
                return (
                  <Pressable
                    key={service.id}
                    onPress={() => {
                      setSelectedService(service);
                      setServiceModalOpen(false);
                    }}
                    className={cn(
                      'flex-row items-center justify-between p-3.5 active:bg-accent',
                      isSelected && 'bg-primary/5',
                    )}
                  >
                    <View className="flex-1 pr-2">
                      <Text
                        className={cn(
                          'text-sm font-semibold',
                          isSelected ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {service.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        {service.duration} · {service.price}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Icon as={Check} size={18} className="text-primary" />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Staff Selection Modal */}
      <Modal
        visible={staffModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStaffModalOpen(false)}
      >
        <Pressable
          onPress={() => setStaffModalOpen(false)}
          className="bg-black/50 flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="border-border bg-card w-full max-w-sm overflow-hidden rounded-2xl border shadow-xl"
          >
            <View className="border-border flex-row items-center justify-between border-b p-4">
              <Text className="text-foreground text-base font-bold">
                Select Staff Member
              </Text>
              <Pressable
                onPress={() => setStaffModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            <ScrollView className="max-h-80">
              {STAFF_MEMBERS.map((staff) => {
                const isSelected = selectedStaff === staff;
                return (
                  <Pressable
                    key={staff}
                    onPress={() => {
                      setSelectedStaff(staff);
                      setStaffModalOpen(false);
                    }}
                    className={cn(
                      'flex-row items-center justify-between p-3.5 active:bg-accent',
                      isSelected && 'bg-primary/5',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        isSelected ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {staff}
                    </Text>
                    {isSelected ? (
                      <Icon as={Check} size={18} className="text-primary" />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Time Selection Modal */}
      <Modal
        visible={timeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeModalOpen(false)}
      >
        <Pressable
          onPress={() => setTimeModalOpen(false)}
          className="bg-black/50 flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="border-border bg-card w-full max-w-sm overflow-hidden rounded-2xl border shadow-xl"
          >
            <View className="border-border flex-row items-center justify-between border-b p-4">
              <Text className="text-foreground text-base font-bold">
                Select Time Slot
              </Text>
              <Pressable
                onPress={() => setTimeModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            <ScrollView className="max-h-80 p-3">
              <View className="flex-row flex-wrap gap-2">
                {AVAILABLE_TIMES.map((time) => {
                  const isSelected = selectedTime === time;
                  return (
                    <Pressable
                      key={time}
                      onPress={() => {
                        setSelectedTime(time);
                        setTimeModalOpen(false);
                      }}
                      className={cn(
                        'w-[74px] items-center justify-center rounded-lg border py-2.5 active:bg-accent',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card',
                      )}
                    >
                      <Text
                        className={cn(
                          'text-xs font-semibold',
                          isSelected
                            ? 'text-primary-foreground font-bold'
                            : 'text-foreground',
                        )}
                      >
                        {time}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
