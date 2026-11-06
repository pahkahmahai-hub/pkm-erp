export function MonthPicker({ value, name = "ym" }: { value: string; name?: string }) {
  return (
    <div>
      <label className="label">เดือน</label>
      <input type="month" name={name} defaultValue={value} className="input w-44" />
    </div>
  );
}
