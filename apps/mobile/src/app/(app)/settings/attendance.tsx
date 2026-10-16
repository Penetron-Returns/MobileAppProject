import { AttendanceModeScreen } from '@/features/attendance/components/AttendanceModeScreen';
import { OwnerOnly } from '@/features/business/components/OwnerOnly';

export default function Route() {
  return (
    <OwnerOnly>
      <AttendanceModeScreen />
    </OwnerOnly>
  );
}
