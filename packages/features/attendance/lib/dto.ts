import type { AttendanceCheckDTO } from '@booking/types';
import type { AttendanceCheckRow } from '../ports.ts';
import { firstName } from './planner.ts';

export function toAttendanceCheckDTO(row: AttendanceCheckRow): AttendanceCheckDTO {
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    status: row.status,
    outcome: row.outcome,
    audience: row.audience,
    escalated: row.escalated_at !== null,
    created_at: row.created_at,
    answered_at: row.answered_at,
    client_first_name: firstName(row.client_name),
    service_name: row.service_name,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
  };
}
