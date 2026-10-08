import { Camera, Check, ChevronDown, X } from 'lucide-react-native';
import * as React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const DEFAULT_LOGO =
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&auto=format&fit=crop&q=80';

const CURRENCY_OPTIONS = [
  { code: 'ZAR', label: 'South African Rand (ZAR)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
];

export default function BusinessDetailsScreen() {
  const [businessName, setBusinessName] = React.useState('Luxe Beauty Lounge');
  const [businessEmail, setBusinessEmail] = React.useState(
    'hello@luxebeauty.com',
  );
  const [businessPhone, setBusinessPhone] = React.useState('+27 82 123 4567');
  const [businessWebsite, setBusinessWebsite] =
    React.useState('www.luxebeauty.com');
  const [streetAddress, setStreetAddress] = React.useState(
    '45 Main Road, Sea Point',
  );
  const [city, setCity] = React.useState('Cape Town');
  const [zipCode, setZipCode] = React.useState('8005');
  const [currency, setCurrency] = React.useState('South African Rand (ZAR)');

  const [currencyModalOpen, setCurrencyModalOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSaveChanges = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Business details updated successfully');
    }, 400);
  };

  return (
    <Screen
      header={<Header title="Business Details" fallbackHref="/settings" />}
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
        {/* Logo Section */}
        <View className="bg-card border-border items-center justify-center gap-3 rounded-xl border p-5 shadow-sm">
          <View className="relative">
            <View className="border-border bg-muted h-28 w-28 overflow-hidden rounded-full border-2 shadow-sm">
              <Image
                source={{ uri: DEFAULT_LOGO }}
                accessibilityLabel="Business Logo"
                className="h-full w-full object-cover"
              />
            </View>
            <Pressable
              onPress={() => toast.info('Logo upload dialog')}
              accessibilityRole="button"
              accessibilityLabel="Upload salon logo"
              className="bg-primary absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full shadow-md active:opacity-90"
            >
              <Icon as={Camera} size={16} className="text-primary-foreground" />
            </Pressable>
          </View>
          <Text className="text-muted-foreground max-w-xs text-center text-xs leading-4">
            Upload your salon&apos;s logo. Recommended size: 512x512px.
          </Text>
        </View>

        {/* Business Information Section */}
        <View className="bg-card border-border gap-4 rounded-xl border p-5 shadow-sm">
          <Text className="text-foreground border-border border-b pb-2.5 text-base font-bold">
            Business Information
          </Text>

          <View className="gap-3.5">
            <View className="gap-1.5">
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Business Name
              </Text>
              <TextInput
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Enter business name"
                placeholderTextColor="#6f7880"
                className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Business Email
              </Text>
              <TextInput
                value={businessEmail}
                onChangeText={setBusinessEmail}
                placeholder="Enter email address"
                placeholderTextColor="#6f7880"
                keyboardType="email-address"
                autoCapitalize="none"
                className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Phone Number
              </Text>
              <TextInput
                value={businessPhone}
                onChangeText={setBusinessPhone}
                placeholder="Enter phone number"
                placeholderTextColor="#6f7880"
                keyboardType="phone-pad"
                className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Website
              </Text>
              <TextInput
                value={businessWebsite}
                onChangeText={setBusinessWebsite}
                placeholder="https://"
                placeholderTextColor="#6f7880"
                autoCapitalize="none"
                className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
              />
            </View>
          </View>
        </View>

        {/* Location Section */}
        <View className="bg-card border-border gap-4 rounded-xl border p-5 shadow-sm">
          <Text className="text-foreground border-border border-b pb-2.5 text-base font-bold">
            Location Details
          </Text>

          <View className="gap-3.5">
            <View className="gap-1.5">
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                Street Address
              </Text>
              <TextInput
                value={streetAddress}
                onChangeText={setStreetAddress}
                placeholder="Street address"
                placeholderTextColor="#6f7880"
                className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
              />
            </View>

            <View className="gap-3.5 sm:flex-row">
              <View className="flex-1 gap-1.5">
                <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  City
                </Text>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor="#6f7880"
                  className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
                />
              </View>

              <View className="flex-1 gap-1.5">
                <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  Zip / Postal Code
                </Text>
                <TextInput
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder="Zip / Postal Code"
                  placeholderTextColor="#6f7880"
                  className="border-border bg-muted/30 text-foreground focus:border-primary rounded-xl border px-3.5 py-2.5 text-sm"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Regional Section */}
        <View className="bg-card border-border gap-4 rounded-xl border p-5 shadow-sm">
          <Text className="text-foreground border-border border-b pb-2.5 text-base font-bold">
            Regional Settings
          </Text>

          <View className="gap-1.5">
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
              Currency
            </Text>
            <Pressable
              onPress={() => setCurrencyModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Selected currency: ${currency}`}
              className="border-border bg-muted/30 active:border-primary flex-row items-center justify-between rounded-xl border px-3.5 py-2.5"
            >
              <Text className="text-foreground text-sm font-medium">
                {currency}
              </Text>
              <Icon
                as={ChevronDown}
                size={18}
                className="text-muted-foreground"
              />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Currency Selection Modal */}
      <Modal
        visible={currencyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalOpen(false)}
      >
        <Pressable
          onPress={() => setCurrencyModalOpen(false)}
          className="bg-black/50 flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={() => {}}
            className="border-border bg-card w-full max-w-sm overflow-hidden rounded-2xl border shadow-xl"
          >
            <View className="border-border flex-row items-center justify-between border-b p-4">
              <Text className="text-foreground text-base font-bold">
                Select Currency
              </Text>
              <Pressable
                onPress={() => setCurrencyModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
                accessibilityRole="button"
                accessibilityLabel="Close currency picker"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView className="max-h-80">
              {CURRENCY_OPTIONS.map((opt) => {
                const isSelected = currency === opt.label;
                return (
                  <Pressable
                    key={opt.code}
                    onPress={() => {
                      setCurrency(opt.label);
                      setCurrencyModalOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${opt.label}`}
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
                      {opt.label}
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
    </Screen>
  );
}
