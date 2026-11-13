-- 0048: แก้ข้อมูลผู้รับเงินในบิลค่าใช้จ่ายทีหลัง (เลขผู้เสียภาษี / ที่อยู่ / สาขา / ชื่อ / ประเภท)
-- → หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ที่ผูกกับบิลนั้นอัปเดตตามอัตโนมัติ (เลขที่ใบ / ยอด / วันที่ ไม่เปลี่ยน)
create or replace function public.expense_sync_wht_payee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.wht_certificates w
     set payee_name = new.supplier_name,
         payee_tax_id = new.supplier_tax_id,
         payee_address = new.supplier_address,
         payee_branch = new.supplier_branch,
         form = case when w.form in ('pnd3', 'pnd53') then (case when new.supplier_is_company then 'pnd53' else 'pnd3' end)::public.wht_form else w.form end
   where w.expense_id = new.id;
  return new;
end $$;

drop trigger if exists trg_expense_sync_wht_payee on public.expenses;
create trigger trg_expense_sync_wht_payee
  after update of supplier_name, supplier_tax_id, supplier_address, supplier_branch, supplier_is_company on public.expenses
  for each row
  when (old.supplier_name is distinct from new.supplier_name or old.supplier_tax_id is distinct from new.supplier_tax_id
        or old.supplier_address is distinct from new.supplier_address or old.supplier_branch is distinct from new.supplier_branch
        or old.supplier_is_company is distinct from new.supplier_is_company)
  execute function public.expense_sync_wht_payee();
