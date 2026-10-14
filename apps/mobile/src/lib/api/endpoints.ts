import type {
  AppointmentDTO,
  AvailabilityRuleInput,
  AvailableDaysResponse,
  AvailableSlotsResponse,
  BusinessDTO,
  CancelAppointmentRequest,
  ClientDTO,
  ClientNoteDTO,
  CreateAppointmentRequest,
  CreateClientNoteRequest,
  CreateClientRequest,
  CreateOverrideRequest,
  CreateServiceRequest,
  CreateStaffRequest,
  ManualConnectRequest,
  MeDTO,
  OnboardingRequest,
  RegisterDeviceRequest,
  ReplaceBusinessHoursRequest,
  RescheduleAppointmentRequest,
  ResolveEscalationRequest,
  SendStaffMessageRequest,
  ServiceDTO,
  SetAppointmentStatusRequest,
  StaffDTO,
  TestMessageRequest,
  UpdateAppointmentRequest,
  UpdateBusinessRequest,
  UpdateClientRequest,
  UpdateServiceRequest,
  UpdateStaffRequest,
  WhatsAppChannelDTO,
} from '@shared/api';

import { enc, get, send } from './client';

/** Typed endpoint map (docs/BUILD_PLAN.md §4). */
export const api = {
  me: () => get<MeDTO>('/v1/me'),

  // onboarding: needs only an org-owner session, no business yet
  onboard: (b: OnboardingRequest, key: string) =>
    send<OnboardingRequest, MeDTO>('POST', '/v1/onboarding')(b, key),

  // business
  updateBusiness: (b: UpdateBusinessRequest, key: string) =>
    send<UpdateBusinessRequest, BusinessDTO>('PATCH', '/v1/business')(b, key),
  replaceHours: (b: ReplaceBusinessHoursRequest, key: string) =>
    send<ReplaceBusinessHoursRequest, unknown>('PUT', '/v1/business/hours')(
      b,
      key,
    ),

  // services
  createService: (b: CreateServiceRequest, key: string) =>
    send<CreateServiceRequest, ServiceDTO>('POST', '/v1/services')(b, key),
  updateService: (id: string, b: UpdateServiceRequest, key: string) =>
    send<UpdateServiceRequest, ServiceDTO>('PATCH', `/v1/services/${enc(id)}`)(
      b,
      key,
    ),
  deleteService: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/services/${enc(id)}`)(
      undefined,
      key,
    ),

  // staff
  createStaff: (b: CreateStaffRequest, key: string) =>
    send<CreateStaffRequest, StaffDTO>('POST', '/v1/staff')(b, key),
  updateStaff: (id: string, b: UpdateStaffRequest, key: string) =>
    send<UpdateStaffRequest, StaffDTO>('PATCH', `/v1/staff/${enc(id)}`)(b, key),
  deleteStaff: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/staff/${enc(id)}`)(undefined, key),
  replaceStaffServices: (id: string, service_ids: string[], key: string) =>
    send<{ service_ids: string[] }, unknown>(
      'PUT',
      `/v1/staff/${enc(id)}/services`,
    )({ service_ids }, key),
  replaceStaffAvailability: (
    id: string,
    rules: AvailabilityRuleInput[],
    key: string,
  ) =>
    send<{ rules: AvailabilityRuleInput[] }, unknown>(
      'PUT',
      `/v1/staff/${enc(id)}/availability`,
    )({ rules }, key),
  createOverride: (b: CreateOverrideRequest, key: string) =>
    send<CreateOverrideRequest, unknown>('POST', '/v1/overrides')(b, key),
  deleteOverride: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/overrides/${enc(id)}`)(
      undefined,
      key,
    ),

  // clients
  createClient: (b: CreateClientRequest, key: string) =>
    send<CreateClientRequest, ClientDTO>('POST', '/v1/clients')(b, key),
  updateClient: (id: string, b: UpdateClientRequest, key: string) =>
    send<UpdateClientRequest, ClientDTO>('PATCH', `/v1/clients/${enc(id)}`)(
      b,
      key,
    ),
  addClientNote: (id: string, b: CreateClientNoteRequest, key: string) =>
    send<CreateClientNoteRequest, ClientNoteDTO>(
      'POST',
      `/v1/clients/${enc(id)}/notes`,
    )(b, key),
  deleteClientNote: (id: string, noteId: string, key: string) =>
    send<undefined, unknown>(
      'DELETE',
      `/v1/clients/${enc(id)}/notes/${enc(noteId)}`,
    )(undefined, key),

  // availability (always live, never cached for long)
  availableDays: (q: {
    service_id: string;
    from: string;
    to: string;
    staff_id?: string | null;
  }) => get<AvailableDaysResponse>('/v1/availability/days', q),
  availableSlots: (q: {
    service_id: string;
    date: string;
    staff_id?: string | null;
  }) => get<AvailableSlotsResponse>('/v1/availability/slots', q),

  // appointments
  createAppointment: (b: CreateAppointmentRequest, key: string) =>
    send<CreateAppointmentRequest, AppointmentDTO>('POST', '/v1/appointments')(
      b,
      key,
    ),
  rescheduleAppointment: (
    id: string,
    b: RescheduleAppointmentRequest,
    key: string,
  ) =>
    send<RescheduleAppointmentRequest, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/reschedule`,
    )(b, key),
  cancelAppointment: (id: string, b: CancelAppointmentRequest, key: string) =>
    send<CancelAppointmentRequest, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/cancel`,
    )(b, key),
  setAppointmentStatus: (
    id: string,
    b: SetAppointmentStatusRequest,
    key: string,
  ) =>
    send<SetAppointmentStatusRequest, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/status`,
    )(b, key),
  checkInAppointment: (id: string, key: string) =>
    send<Record<string, never>, AppointmentDTO>(
      'POST',
      `/v1/appointments/${enc(id)}/check-in`,
    )({}, key),
  updateAppointment: (id: string, b: UpdateAppointmentRequest, key: string) =>
    send<UpdateAppointmentRequest, AppointmentDTO>(
      'PATCH',
      `/v1/appointments/${enc(id)}`,
    )(b, key),

  // devices
  registerDevice: (b: RegisterDeviceRequest, key: string) =>
    send<RegisterDeviceRequest, unknown>('POST', '/v1/devices')(b, key),

  // WhatsApp channel
  whatsapp: () => get<WhatsAppChannelDTO>('/v1/whatsapp'),
  whatsappConnect: (b: ManualConnectRequest, key: string) =>
    send<ManualConnectRequest, WhatsAppChannelDTO>(
      'POST',
      '/v1/whatsapp/connect',
    )(b, key),
  whatsappAction: (
    action: 'sync' | 'pause' | 'resume' | 'disconnect',
    key: string,
  ) =>
    send<Record<string, never>, unknown>('POST', `/v1/whatsapp/${action}`)(
      {},
      key,
    ),
  whatsappTestMessage: (b: TestMessageRequest, key: string) =>
    send<TestMessageRequest, unknown>('POST', '/v1/whatsapp/test-message')(
      b,
      key,
    ),

  // inbox
  sendStaffMessage: (
    conversationId: string,
    b: SendStaffMessageRequest,
    key: string,
  ) =>
    send<SendStaffMessageRequest, unknown>(
      'POST',
      `/v1/conversations/${enc(conversationId)}/messages`,
    )(b, key),
  releaseConversation: (conversationId: string, key: string) =>
    send<Record<string, never>, unknown>(
      'POST',
      `/v1/conversations/${enc(conversationId)}/release`,
    )({}, key),
  resolveEscalation: (id: string, b: ResolveEscalationRequest, key: string) =>
    send<ResolveEscalationRequest, unknown>(
      'POST',
      `/v1/escalations/${enc(id)}/resolve`,
    )(b, key),
};
