export type UserRole = "admin" | "staff";
export type EmployeeStatus = "probation" | "active" | "resigned";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface Team {
  id: number;
  code: string;
  abbrev: string;
  name_th: string;
  name_en: string;
}

export interface Employee {
  id: string;
  emp_code: string;
  title: string | null;
  first_name: string;
  last_name: string;
  nickname: string | null;
  team_id: number | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  start_date: string | null;
  end_date: string | null;
  status: EmployeeStatus;
  needs_review: boolean;
  review_note: string | null;
  photo_url: string | null;
  notes: string | null;
  teams?: Team | null;
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  employee_id: string | null;
  auth_user_id: string | null;
  is_active: boolean;
  display_name: string | null;
  last_login_at: string | null;
}

export interface Attendance {
  id: string;
  employee_id: string;
  work_date: string;
  check_in_at: string | null;
  check_in_distance_m: number | null;
  check_in_in_range: boolean | null;
  check_out_at: string | null;
  check_out_distance_m: number | null;
  check_out_in_range: boolean | null;
  is_late: boolean;
  late_minutes: number;
  note: string | null;
  admin_note: string | null;
  employees?: Pick<Employee, "emp_code" | "first_name" | "last_name" | "nickname"> | null;
}

export interface LeaveType {
  code: string;
  name_th: string;
  quota_days: number;
  requires_doc: boolean;
  sort_order: number;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  employees?: Pick<Employee, "emp_code" | "first_name" | "last_name" | "nickname"> | null;
  leave_types?: Pick<LeaveType, "name_th"> | null;
}

export interface OtRequest {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours_requested: number;
  reason: string | null;
  status: RequestStatus;
  hours_approved: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  employees?: Pick<Employee, "emp_code" | "first_name" | "last_name" | "nickname"> | null;
}

export interface SessionInfo {
  authUser: { id: string; email: string; name: string | null; avatar: string | null };
  appUser: AppUser;
  employee: Employee | null;
  isAdmin: boolean;
}
