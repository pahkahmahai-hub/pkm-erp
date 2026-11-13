-- PKM ERP — 0042: หมวดค่าใช้จ่าย "ตกแต่งบูธ / Display" (ซื้อของแต่งบูธ ไม่หัก ณ ที่จ่าย) — ต่อจากหมวดการตลาด
insert into public.expense_categories (code, name, wht_pct, wht_income_type, sort_order)
values ('booth', 'ตกแต่งบูธ / Display', 0, null,
        coalesce((select sort_order + 1 from public.expense_categories where code = 'marketing'), 75))
on conflict (code) do update set name = excluded.name, is_active = true;
