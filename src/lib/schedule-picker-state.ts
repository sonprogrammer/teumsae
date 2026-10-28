export type SchedulePicker = 'date' | 'start' | 'end'
export type ActiveSchedulePicker = SchedulePicker | null

export function toggleSchedulePicker(active: ActiveSchedulePicker, selected: SchedulePicker): ActiveSchedulePicker {
  return active === selected ? null : selected
}
