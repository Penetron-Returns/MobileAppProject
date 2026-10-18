import type {
  ChangePlanRequest,
  ChangePlanResultDTO,
  PlanChangePreviewDTO,
  AccountDeletionPreviewDTO,
  AnswerAttendanceRequest,
  AppointmentDTO,
  AttendanceCheckDTO,
  AttendancePendingResponse,
  AvailabilityRuleInput,
  AvailabilityConflictsResponse,
  AvailabilityConfigResponse,
  AvailableDaysResponse,
  AvailableSlotsResponse,
  BillingUsageDTO,
  BusinessDTO,
  CheckoutSessionDTO,
  PortalSessionDTO,
  CreateCheckoutRequest,
  DeviceTokenDTO,
  VoiceTodayDTO,
  VoiceAskDTO,
  VoiceAskRequest,
  VoiceActionDTO,
  CompanionSettingsDTO,
  VoiceApprovalResultDTO,
  CancelAppointmentRequest,
  ClientDTO,
  CompanionSessionDTO,
  CompanionSetupDTO,
  CompanionWhatsAppConnectSessionDTO,
  ClientNoteDTO,
  CreateAppointmentRequest,
  CreateClientNoteRequest,
  CreateClientRequest,
  CreateCompanionSessionRequest,
  CreateOverrideRequest,
  CreateServiceRequest,
  CreateSpecialDayRequest,
  CreateStaffTimeOffRequest,
  CreateInvitationRequest,
  DeleteAccountRequest,
  DeleteAccountResultDTO,
  CreateStaffRequest,
  ManualConnectRequest,
  MeDTO,
  ProductUpdatesViewRequest,
  StoriesResponseDTO,
  StoryEventsRequest,
  StoryViewRequest,
  OnboardingRequest,
  PlansDTO,
  RegisterDeviceRequest,
  UnregisterDeviceRequest,
  ReplaceBusinessHoursRequest,
  ReplaceStaffBreaksRequest,
  ReplaceStaffBreaksResponse,
  RescheduleAppointmentRequest,
  ResolveEscalationRequest,
  SendStaffMessageRequest,
  ServiceDTO,
  SetAppointmentStatusRequest,
  SpecialDayDTO,
  SpecialDaySuggestionsResponse,
  StaffDTO,
  StaffTimeOffDTO,
  TeamDTO,
  TeamInvitationDTO,
  TeamMemberDTO,
  TestMessageRequest,
  UpdateAppointmentRequest,
  UpdateBusinessRequest,
  UpdateClientRequest,
  UpdateMemberRoleRequest,
  UpdateServiceRequest,
  UpdateSpecialDayRequest,
  UpdateStaffTimeOffRequest,
  UpdateStaffRequest,
  WhatsAppChannelDTO,
} from '@booking/types';

import type { CheckoutPlanId } from '@/features/plans/checkout';

import { apiRequest, enc, get, send } from './client';

/** PATCH /v1/companion/settings body: either field. */
export type CompanionSettingsPatch = Partial<
  Pick<CompanionSettingsDTO, 'approvalPolicy' | 'undoWindowSeconds'>
>;

/** GET /v1/availability/conflicts: whole days, or `start_time`..`end_time` on each date. */
export type ConflictQuery = {
  from: string;
  to?: string;
  staff_id?: string;
  start_time?: string;
  end_time?: string;
  mode?: 'closed' | 'open_only';
};

/** Typed endpoint map (docs/BUILD_PLAN.md §4). */
export const api = {
  me: () => get<MeDTO>('/v1/me'),
  accountDeletionPreview: () =>
    get<AccountDeletionPreviewDTO>('/v1/me/deletion-preview'),
  deleteAccount: (b: DeleteAccountRequest, key: string) =>
    send<DeleteAccountRequest, DeleteAccountResultDTO>('DELETE', '/v1/me')(
      b,
      key,
    ),

  // plans, usage, companion (docs/BUILD_PLAN.md "Plans, usage, companion and reports")
  plans: () => get<PlansDTO>('/v1/plans'),
  billingUsage: (month?: string) =>
    get<BillingUsageDTO>('/v1/billing/usage', { month }),
  createCheckout: (b: CreateCheckoutRequest, key: string) =>
    send<CreateCheckoutRequest, CheckoutSessionDTO>(
      'POST',
      '/v1/billing/checkout',
    )(b, key),
  previewPlanChange: (plan: CheckoutPlanId) =>
    get<PlanChangePreviewDTO>('/v1/billing/plan/preview', { plan }),
  changePlan: (b: ChangePlanRequest, key: string) =>
    send<ChangePlanRequest, ChangePlanResultDTO>('POST', '/v1/billing/plan')(
      b,
      key,
    ),
  createPortalSession: (key: string) =>
    send<undefined, PortalSessionDTO>('POST', '/v1/billing/portal')(
      undefined,
      key,
    ),
  createCompanionSession: (b: CreateCompanionSessionRequest, key: string) =>
    send<CreateCompanionSessionRequest, CompanionSessionDTO>(
      'POST',
      '/v1/companion/session',
    )(b, key),

  // owner-only (Clerk): how much Clovie asks first, and how long a booking can be undone
  companionSettings: () => get<CompanionSettingsDTO>('/v1/companion/settings'),
  updateCompanionSettings: (b: CompanionSettingsPatch, key: string) =>
    send<CompanionSettingsPatch, CompanionSettingsDTO>(
      'PATCH',
      '/v1/companion/settings',
    )(b, key),
  companionSetup: () => get<CompanionSetupDTO>('/v1/companion/setup'),
  createCompanionWhatsAppSession: (key: string) =>
    send<undefined, CompanionWhatsAppConnectSessionDTO>(
      'POST',
      '/v1/companion/whatsapp/connect-session',
    )(undefined, key),

  // Clovie stories: the app sends its version and platform so product updates can be filtered
  stories: (headers: Record<string, string>) =>
    apiRequest<StoriesResponseDTO>('GET', '/v1/stories', { headers }),
  markStoryViewed: (id: string, b: StoryViewRequest, key: string) =>
    send<StoryViewRequest, { viewed: boolean }>(
      'POST',
      `/v1/stories/${enc(id)}/view`,
    )(b, key),
  markProductUpdatesViewed: (b: ProductUpdatesViewRequest, key: string) =>
    send<ProductUpdatesViewRequest, { viewed: boolean }>(
      'POST',
      '/v1/product-updates/view',
    )(b, key),
  recordStoryEvents: (b: StoryEventsRequest, key: string) =>
    send<StoryEventsRequest, unknown>('POST', '/v1/stories/events')(b, key),

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

  // team (owner only): Clerk organisation members and invitations
  team: () => get<TeamDTO>('/v1/team'),
  createInvitation: (b: CreateInvitationRequest, key: string) =>
    send<CreateInvitationRequest, TeamInvitationDTO>(
      'POST',
      '/v1/team/invitations',
    )(b, key),
  revokeInvitation: (id: string, key: string) =>
    send<undefined, { id: string; revoked: true }>(
      'DELETE',
      `/v1/team/invitations/${enc(id)}`,
    )(undefined, key),
  updateMemberRole: (userId: string, b: UpdateMemberRoleRequest, key: string) =>
    send<UpdateMemberRoleRequest, TeamMemberDTO>(
      'PATCH',
      `/v1/team/members/${enc(userId)}`,
    )(b, key),
  removeMember: (userId: string, key: string) =>
    send<undefined, { user_id: string; removed: true }>(
      'DELETE',
      `/v1/team/members/${enc(userId)}`,
    )(undefined, key),

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

  // availability model: special days, breaks, time off (docs/BUILD_PLAN.md)
  availabilityConfig: (q: { from: string; to: string }) =>
    get<AvailabilityConfigResponse>('/v1/availability/config', q),
  availabilityConflicts: (q: ConflictQuery) =>
    get<AvailabilityConflictsResponse>('/v1/availability/conflicts', q),
  specialDaySuggestions: (year: number) =>
    get<SpecialDaySuggestionsResponse>('/v1/special-days/suggestions', {
      year,
    }),
  createSpecialDay: (b: CreateSpecialDayRequest, key: string) =>
    send<CreateSpecialDayRequest, SpecialDayDTO>('POST', '/v1/special-days')(
      b,
      key,
    ),
  updateSpecialDay: (id: string, b: UpdateSpecialDayRequest, key: string) =>
    send<UpdateSpecialDayRequest, SpecialDayDTO>(
      'PATCH',
      `/v1/special-days/${enc(id)}`,
    )(b, key),
  deleteSpecialDay: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/special-days/${enc(id)}`)(
      undefined,
      key,
    ),
  replaceStaffBreaks: (id: string, b: ReplaceStaffBreaksRequest, key: string) =>
    send<ReplaceStaffBreaksRequest, ReplaceStaffBreaksResponse>(
      'PUT',
      `/v1/staff/${enc(id)}/breaks`,
    )(b, key),
  createTimeOff: (staffId: string, b: CreateStaffTimeOffRequest, key: string) =>
    send<CreateStaffTimeOffRequest, StaffTimeOffDTO>(
      'POST',
      `/v1/staff/${enc(staffId)}/time-off`,
    )(b, key),
  updateTimeOff: (id: string, b: UpdateStaffTimeOffRequest, key: string) =>
    send<UpdateStaffTimeOffRequest, StaffTimeOffDTO>(
      'PATCH',
      `/v1/time-off/${enc(id)}`,
    )(b, key),
  deleteTimeOff: (id: string, key: string) =>
    send<undefined, unknown>('DELETE', `/v1/time-off/${enc(id)}`)(
      undefined,
      key,
    ),

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

  // attendance check
  attendancePending: () =>
    get<AttendancePendingResponse>('/v1/attendance/pending'),
  answerAttendance: (
    checkId: string,
    b: AnswerAttendanceRequest,
    key: string,
  ) =>
    send<AnswerAttendanceRequest, AttendanceCheckDTO>(
      'POST',
      `/v1/attendance/${enc(checkId)}/answer`,
    )(b, key),

  // voice: today's appointments for the voice check-in (also reachable with a device token)
  voiceToday: () => get<VoiceTodayDTO>('/v1/voice/today'),

  // voice: a spoken request to the companion, and its approvals (decided by id only; device token allowed)
  voiceAsk: (b: VoiceAskRequest, key: string) =>
    send<VoiceAskRequest, VoiceAskDTO>('POST', '/v1/voice/ask')(b, key),
  voiceDecideApproval: (
    id: string,
    decision: 'approve' | 'decline',
    key: string,
  ) =>
    send<undefined, VoiceApprovalResultDTO>(
      'POST',
      `/v1/voice/approvals/${enc(id)}/${decision}`,
    )(undefined, key),

  // voice: act-then-undo. Undo exactly one executed action by id (device token allowed); list what is still undoable.
  voiceUndoAction: (id: string, key: string) =>
    send<undefined, VoiceActionDTO>(
      'POST',
      `/v1/voice/actions/${enc(id)}/undo`,
    )(undefined, key),
  voiceActions: (status: 'executed' | 'undone' = 'executed') =>
    get<VoiceActionDTO[]>('/v1/voice/actions', { status }),

  // voice: the scoped device token for background voice and attendance answers
  mintVoiceDeviceToken: (b: { device_label: string }, key: string) =>
    send<{ device_label: string }, DeviceTokenDTO>(
      'POST',
      '/v1/voice/device-token',
    )(b, key),
  revokeVoiceDeviceToken: (key: string) =>
    send<undefined, { revoked: boolean }>('DELETE', '/v1/voice/device-token')(
      undefined,
      key,
    ),

  // devices
  registerDevice: (b: RegisterDeviceRequest, key: string) =>
    send<RegisterDeviceRequest, unknown>('POST', '/v1/devices')(b, key),
  unregisterDevice: (b: UnregisterDeviceRequest, key: string) =>
    send<UnregisterDeviceRequest, unknown>('DELETE', '/v1/devices')(b, key),

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
