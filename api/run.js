// ============================================
// GYM PRO - Vercel Serverless API
// ============================================

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'gym-pro-secret-key-change-in-production';
const COOKIE_NAME = 'gym_session';

// ── Helpers ────────────────────────────────

function genId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 3).toUpperCase();
}

function getSession(req) {
  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, email: user.email || '', role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/'
  }));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  }));
}

async function logAct(session, action, detail) {
  try {
    await supabase.from('activity_log').insert({
      id: genId('LOG'),
      user_id: session?.id || '',
      username: session?.username || 'System',
      action,
      detail,
      created_at: new Date().toISOString()
    });
  } catch (e) { /* silent */ }
}

function requireSession(req) {
  const s = getSession(req);
  if (!s) throw new Error('Sesi tidak valid. Silakan login kembali.');
  return s;
}

async function sendScheduleEmail(memberEmail, memberName, trainerName, date, timeStart, timeEnd, type) {
  if (!memberEmail || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporter.sendMail({
      from: `"GYM PRO" <${process.env.SMTP_USER}>`,
      to: memberEmail,
      subject: `[GYM PRO] Jadwal Latihan Baru – ${date}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;background:#1a1a2e;color:#e0e0e0;border-radius:12px;overflow:hidden;">
          <div style="background:#6c63ff;padding:24px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:22px;">GYM PRO</h1>
            <p style="margin:4px 0 0;color:#d0ccff;font-size:13px;">Jadwal Latihan Baru</p>
          </div>
          <div style="padding:28px;">
            <p>Halo, <strong>${memberName}</strong>!</p>
            <p>Jadwal latihan baru telah ditetapkan untuk Anda:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px 0;color:#aaa;">Tanggal</td><td style="padding:8px 0;font-weight:bold;">${date}</td></tr>
              <tr><td style="padding:8px 0;color:#aaa;">Waktu</td><td style="padding:8px 0;font-weight:bold;">${timeStart} – ${timeEnd}</td></tr>
              <tr><td style="padding:8px 0;color:#aaa;">Jenis</td><td style="padding:8px 0;font-weight:bold;">${type}</td></tr>
              <tr><td style="padding:8px 0;color:#aaa;">Trainer</td><td style="padding:8px 0;font-weight:bold;">${trainerName}</td></tr>
            </table>
            <p style="color:#aaa;font-size:13px;">Hadir tepat waktu dan semangat berlatih!</p>
          </div>
          <div style="padding:16px 28px;background:#111128;text-align:center;font-size:12px;color:#666;">
            © ${new Date().getFullYear()} GYM PRO – Management System
          </div>
        </div>`
    });
  } catch (e) { /* email errors are non-fatal */ }
}

// ── Auth ───────────────────────────────────

async function login(req, res, username, password) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .eq('active', true)
    .single();

  if (error || !data) return { success: false, message: 'Username atau password salah' };

  const user = { id: data.id, username: data.username, name: data.name, email: data.email, phone: data.phone, role: data.role };
  setSessionCookie(res, user);
  await logAct(user, 'LOGIN', `${user.username} masuk ke sistem`);
  return { success: true, user };
}

async function checkSession(req, res) {
  const session = getSession(req);
  if (!session) return { success: false };
  return { success: true, user: session };
}

async function doLogout(req, res) {
  const session = getSession(req);
  await logAct(session, 'LOGOUT', 'User keluar dari sistem');
  clearSessionCookie(res);
  return { success: true };
}

// ── Dashboard ──────────────────────────────

async function getDashboardData(req, res) {
  const session = requireSession(req);

  const [membersR, schedulesR, financeR, trainersR, logR] = await Promise.all([
    supabase.from('members').select('*'),
    supabase.from('schedules').select('*'),
    supabase.from('finance').select('*'),
    supabase.from('trainers').select('*'),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(10)
  ]);

  const members = membersR.data || [];
  const schedules = schedulesR.data || [];
  const finances = financeR.data || [];
  const trainers = trainersR.data || [];
  const logs = logR.data || [];

  const trainerMap = {};
  trainers.forEach(t => { trainerMap[t.id] = t.name; });

  // Stats
  const totalMembers = members.length;
  const activeMembers = members.filter(m => m.status === 'Active').length;
  const today = new Date().toDateString();
  const todaySchedules = schedules.filter(s => new Date(s.date).toDateString() === today).length;

  // Membership types
  const membershipTypes = {};
  members.forEach(m => {
    const t = m.membership_type || 'Lainnya';
    membershipTypes[t] = (membershipTypes[t] || 0) + 1;
  });

  // Monthly finance
  let totalIncome = 0, totalExpense = 0;
  const monthly = {};
  const currentYear = new Date().getFullYear();

  finances.forEach(f => {
    const a = Number(f.amount);
    if (f.type === 'Income') totalIncome += a; else totalExpense += a;
    const d = new Date(f.created_at);
    if (d.getFullYear() === currentYear) {
      const mo = d.getMonth();
      if (!monthly[mo]) monthly[mo] = { i: 0, e: 0 };
      if (f.type === 'Income') monthly[mo].i += a; else monthly[mo].e += a;
    }
  });

  const mn = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const labels = [], income = [], expense = [];
  for (let m = 0; m < 12; m++) {
    labels.push(mn[m]);
    income.push(monthly[m] ? monthly[m].i : 0);
    expense.push(monthly[m] ? monthly[m].e : 0);
  }

  // Upcoming schedules
  const upcomingSchedules = schedules
    .filter(s => s.status === 'Scheduled' && new Date(s.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5)
    .map(s => ({
      date: s.date, timeStart: s.time_start, timeEnd: s.time_end,
      trainer: trainerMap[s.trainer_id] || '-', type: s.type, room: 'Main Hall'
    }));

  // Recent activities
  const recentActivities = logs.map(l => ({
    username: l.username, action: ': ' + l.action, time: l.created_at
  }));

  return {
    stats: { totalMembers, activeMembers, todaySchedules, net: totalIncome - totalExpense },
    charts: { labels, income, expense },
    membershipTypes,
    upcomingSchedules,
    recentActivities
  };
}

// ── Members ────────────────────────────────

async function getMembers(req, res) {
  requireSession(req);
  const [membersR, trainersR] = await Promise.all([
    supabase.from('members').select('*').order('created_at', { ascending: false }),
    supabase.from('trainers').select('id,name')
  ]);
  const trainerMap = {};
  (trainersR.data || []).forEach(t => { trainerMap[t.id] = t.name; });
  return (membersR.data || []).map(m => ({
    id: m.id, name: m.name, email: m.email, phone: m.phone, address: m.address,
    membershipType: m.membership_type, startDate: m.start_date, endDate: m.end_date,
    status: m.status, trainerId: m.trainer_id, trainerName: trainerMap[m.trainer_id] || '-',
    createdAt: m.created_at
  }));
}

async function addMember(req, res, data) {
  const session = requireSession(req);
  const id = genId('MBR');
  const { error } = await supabase.from('members').insert({
    id, name: data.name, email: data.email || null, phone: data.phone || null,
    address: data.address || null, membership_type: data.membershipType,
    start_date: data.startDate || null, end_date: data.endDate || null,
    status: 'Active', trainer_id: data.trainerId || null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  await logAct(session, 'ADD_MEMBER', `Tambah member: ${data.name}`);
  return { success: true, id };
}

async function updateMember(req, res, id, data) {
  const session = requireSession(req);
  const { error } = await supabase.from('members').update({
    name: data.name, email: data.email || null, phone: data.phone || null,
    address: data.address || null, membership_type: data.membershipType,
    start_date: data.startDate || null, end_date: data.endDate || null,
    status: data.status, trainer_id: data.trainerId || null,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_MEMBER', `Update member: ${data.name}`);
  return { success: true };
}

async function deleteMember(req, res, id) {
  const session = requireSession(req);
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'DELETE_MEMBER', `Hapus member ID: ${id}`);
  return { success: true };
}

// ── Trainers ───────────────────────────────

async function getTrainers(req, res) {
  requireSession(req);
  const { data, error } = await supabase.from('trainers').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data || []).map(t => ({
    id: t.id, name: t.name, specialty: t.specialty, phone: t.phone,
    email: t.email, active: t.active, createdAt: t.created_at
  }));
}

async function addTrainer(req, res, data) {
  const session = requireSession(req);
  const id = genId('TRN');
  const { error } = await supabase.from('trainers').insert({
    id, name: data.name, specialty: data.specialty || null,
    phone: data.phone || null, email: data.email || null,
    active: true, created_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  await logAct(session, 'ADD_TRAINER', `Tambah trainer: ${data.name}`);
  return { success: true, id };
}

async function updateTrainer(req, res, id, data) {
  const session = requireSession(req);
  const { error } = await supabase.from('trainers').update({
    name: data.name, specialty: data.specialty || null,
    phone: data.phone || null, email: data.email || null, active: data.active
  }).eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_TRAINER', `Update trainer: ${data.name}`);
  return { success: true };
}

async function deleteTrainer(req, res, id) {
  const session = requireSession(req);
  const { error } = await supabase.from('trainers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'DELETE_TRAINER', `Hapus trainer ID: ${id}`);
  return { success: true };
}

// ── Schedules ──────────────────────────────

async function getSchedules(req, res) {
  requireSession(req);
  const [schedulesR, trainersR, membersR] = await Promise.all([
    supabase.from('schedules').select('*').order('date', { ascending: false }),
    supabase.from('trainers').select('id,name'),
    supabase.from('members').select('id,name')
  ]);
  const tm = {}, mm = {};
  (trainersR.data || []).forEach(t => { tm[t.id] = t.name; });
  (membersR.data || []).forEach(m => { mm[m.id] = m.name; });
  return (schedulesR.data || []).map(s => ({
    id: s.id, trainerId: s.trainer_id, trainerName: tm[s.trainer_id] || '-',
    memberId: s.member_id, memberName: mm[s.member_id] || '-',
    date: s.date, timeStart: s.time_start, timeEnd: s.time_end,
    type: s.type, status: s.status, notes: s.notes, createdAt: s.created_at
  }));
}

async function addSchedule(req, res, data) {
  const session = requireSession(req);
  const id = genId('SCH');
  const { error } = await supabase.from('schedules').insert({
    id, trainer_id: data.trainerId, member_id: data.memberId,
    date: data.date, time_start: data.timeStart, time_end: data.timeEnd,
    type: data.type, status: 'Scheduled', notes: data.notes || '',
    created_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);

  const [memberR, trainerR] = await Promise.all([
    supabase.from('members').select('name,email').eq('id', data.memberId).single(),
    supabase.from('trainers').select('name').eq('id', data.trainerId).single()
  ]);
  const memberName = memberR.data?.name || '';
  const memberEmail = memberR.data?.email || '';
  const trainerName = trainerR.data?.name || '';

  await supabase.from('notifications').insert({
    id: genId('NTF'), user_id: 'all',
    title: `Jadwal Baru: ${memberName}`,
    message: `Latihan pada ${data.date} pukul ${data.timeStart}–${data.timeEnd} (${data.type})`,
    type: 'schedule', priority: 'normal', read: false, created_at: new Date().toISOString()
  });

  sendScheduleEmail(memberEmail, memberName, trainerName, data.date, data.timeStart, data.timeEnd, data.type);

  await logAct(session, 'ADD_SCHEDULE', `Tambah jadwal: ${memberName} tgl ${data.date}`);
  return { success: true, id };
}

async function updateSchedule(req, res, id, data) {
  const session = requireSession(req);
  const { error } = await supabase.from('schedules').update({
    trainer_id: data.trainerId, member_id: data.memberId,
    date: data.date, time_start: data.timeStart, time_end: data.timeEnd,
    type: data.type, status: data.status, notes: data.notes || ''
  }).eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_SCHEDULE', `Update jadwal ID: ${id}`);
  return { success: true };
}

async function deleteSchedule(req, res, id) {
  const session = requireSession(req);
  const { error } = await supabase.from('schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'DELETE_SCHEDULE', `Hapus jadwal ID: ${id}`);
  return { success: true };
}

// ── Finance ────────────────────────────────

async function getFinance(req, res) {
  requireSession(req);
  const [financeR, membersR] = await Promise.all([
    supabase.from('finance').select('*').order('created_at', { ascending: false }),
    supabase.from('members').select('id,name')
  ]);
  const mm = {};
  (membersR.data || []).forEach(m => { mm[m.id] = m.name; });
  return (financeR.data || []).map(f => ({
    id: f.id, type: f.type, category: f.category, description: f.description,
    amount: Number(f.amount), memberId: f.member_id, memberName: mm[f.member_id] || '-',
    createdBy: f.created_by, date: f.date, createdAt: f.created_at
  }));
}

async function addFinance(req, res, data) {
  const session = requireSession(req);
  const id = genId('FIN');
  const { error } = await supabase.from('finance').insert({
    id, type: data.type, category: data.category, description: data.description,
    amount: Number(data.amount), member_id: data.memberId || null,
    created_by: session.username, date: data.date, created_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  await logAct(session, 'ADD_FINANCE',
    `${data.type === 'Income' ? 'Pemasukan' : 'Pengeluaran'}: ${data.description} Rp ${Number(data.amount).toLocaleString('id-ID')}`);
  return { success: true, id };
}

async function updateFinance(req, res, id, data) {
  const session = requireSession(req);
  const { error } = await supabase.from('finance').update({
    type: data.type, category: data.category, description: data.description,
    amount: Number(data.amount), member_id: data.memberId || null, date: data.date
  }).eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_FINANCE', `Update finance ID: ${id}`);
  return { success: true };
}

async function deleteFinance(req, res, id) {
  const session = requireSession(req);
  const { error } = await supabase.from('finance').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'DELETE_FINANCE', `Hapus finance ID: ${id}`);
  return { success: true };
}

// ── Payments ───────────────────────────────

async function getPayments(req, res) {
  requireSession(req);
  const [paymentsR, membersR] = await Promise.all([
    supabase.from('payments').select('*').order('created_at', { ascending: false }),
    supabase.from('members').select('id,name')
  ]);
  const mm = {};
  (membersR.data || []).forEach(m => { mm[m.id] = m.name; });
  return (paymentsR.data || []).map(p => ({
    id: p.id, memberId: p.member_id, memberName: mm[p.member_id] || '-',
    amount: Number(p.amount), method: p.method, status: p.status,
    description: p.description, financeId: p.finance_id, createdAt: p.created_at
  }));
}

async function addPayment(req, res, data) {
  const session = requireSession(req);
  const id = genId('PAY');
  const { error } = await supabase.from('payments').insert({
    id, member_id: data.memberId, amount: Number(data.amount),
    method: data.method, status: data.status || 'Paid',
    description: data.description, finance_id: data.financeId || null,
    created_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  await logAct(session, 'ADD_PAYMENT', `Pembayaran Rp ${Number(data.amount).toLocaleString('id-ID')} via ${data.method}`);
  return { success: true, id };
}

async function updatePayment(req, res, id, data) {
  const session = requireSession(req);
  const { error } = await supabase.from('payments').update({
    member_id: data.memberId, amount: Number(data.amount),
    method: data.method, status: data.status, description: data.description,
    finance_id: data.financeId || null
  }).eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_PAYMENT', `Update payment ID: ${id}`);
  return { success: true };
}

async function deletePayment(req, res, id) {
  const session = requireSession(req);
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'DELETE_PAYMENT', `Hapus payment ID: ${id}`);
  return { success: true };
}

// ── Users ──────────────────────────────────

async function getUsers(req, res) {
  requireSession(req);
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(u => ({
    id: u.id, username: u.username, password: u.password,
    name: u.name, email: u.email, phone: u.phone,
    role: u.role, active: u.active, createdAt: u.created_at
  }));
}

async function addUser(req, res, data) {
  const session = requireSession(req);
  const id = genId('USR');
  const { error } = await supabase.from('users').insert({
    id, username: data.username, password: data.password,
    name: data.name, email: data.email || null, phone: data.phone || null,
    role: data.role, active: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  await logAct(session, 'ADD_USER', `Tambah user: ${data.username} (${data.role})`);
  return { success: true, id };
}

async function updateUser(req, res, id, data) {
  const session = requireSession(req);
  const updateData = {
    username: data.username, name: data.name, email: data.email || null,
    phone: data.phone || null, role: data.role, active: data.active,
    updated_at: new Date().toISOString()
  };
  if (data.password) updateData.password = data.password;
  const { error } = await supabase.from('users').update(updateData).eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_USER', `Update user: ${data.username}`);
  return { success: true };
}

async function deleteUser(req, res, id) {
  const session = requireSession(req);
  if (session.id === id) return { success: false, message: 'Tidak bisa menghapus akun sendiri' };
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await logAct(session, 'DELETE_USER', `Hapus user ID: ${id}`);
  return { success: true };
}

// ── Logs & Notifications ───────────────────

async function getActivityLog(req, res) {
  requireSession(req);
  const { data, error } = await supabase
    .from('activity_log').select('*')
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data || []).map(l => ({
    id: l.id, userId: l.user_id, username: l.username,
    action: l.action, detail: l.detail, createdAt: l.created_at
  }));
}

async function getNotifications(req, res) {
  const session = getSession(req);
  if (!session) return [];
  const { data, error } = await supabase.from('notifications').select('*')
    .or(`user_id.eq.${session.id},user_id.eq.all`)
    .order('created_at', { ascending: false }).limit(50);
  if (error) return [];
  return (data || []).map(n => ({
    id: n.id, userId: n.user_id, title: n.title, message: n.message,
    type: n.type, priority: n.priority || 'normal', read: n.read, createdAt: n.created_at
  }));
}

async function markNotifRead(req, res, id) {
  requireSession(req);
  await supabase.from('notifications').update({ read: true }).eq('id', id);
  return { success: true };
}

// ── Reports ────────────────────────────────

async function getReportData(req, res, period) {
  requireSession(req);
  const now = new Date();
  let startDate, endDate;
  if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    startDate = new Date(now.getFullYear(), q * 3, 1).toISOString();
    endDate = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59).toISOString();
  } else {
    startDate = new Date(now.getFullYear(), 0, 1).toISOString();
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
  }

  const [financeR, membersR, paymentsR] = await Promise.all([
    supabase.from('finance').select('*').gte('created_at', startDate).lte('created_at', endDate),
    supabase.from('members').select('*'),
    supabase.from('payments').select('*').gte('created_at', startDate).lte('created_at', endDate)
  ]);

  let inc = 0, exp = 0;
  const byCat = {}, byMethod = {};
  (financeR.data || []).forEach(f => {
    const a = Number(f.amount);
    if (f.type === 'Income') inc += a; else exp += a;
    const c = f.category || 'Lainnya';
    byCat[c] = (byCat[c] || 0) + a;
  });
  (paymentsR.data || []).forEach(p => {
    const m = p.method || 'Lainnya';
    byMethod[m] = (byMethod[m] || 0) + Number(p.amount);
  });

  const members = membersR.data || [];
  let newM = 0, actM = 0, expM = 0;
  members.forEach(m => {
    if (m.created_at >= startDate && m.created_at <= endDate) newM++;
    if (m.status === 'Active') actM++;
    if (m.status === 'Expired') expM++;
  });

  return {
    period, inc, exp, net: inc - exp, byCat, byMethod,
    newM, expM, actM, totalM: members.length, totalP: (paymentsR.data || []).length
  };
}

// ── Profile ────────────────────────────────

async function getProfile(req, res) {
  const session = requireSession(req);
  const { data, error } = await supabase.from('users').select('*').eq('id', session.id).single();
  if (error || !data) throw new Error('Profil tidak ditemukan');
  return { id: data.id, username: data.username, name: data.name, email: data.email, phone: data.phone, role: data.role, createdAt: data.created_at };
}

async function updateProfile(req, res, data) {
  const session = requireSession(req);
  const upd = { name: data.name, email: data.email || null, phone: data.phone || null, updated_at: new Date().toISOString() };
  if (data.password) upd.password = data.password;
  const { error } = await supabase.from('users').update(upd).eq('id', session.id);
  if (error) throw new Error(error.message);
  await logAct(session, 'UPDATE_PROFILE', 'Update profil');
  return { success: true };
}

// ── Function Registry ──────────────────────

const FUNCTIONS = {
  login, checkSession, doLogout,
  getDashboardData,
  getMembers, addMember, updateMember, deleteMember,
  getTrainers, addTrainer, updateTrainer, deleteTrainer,
  getSchedules, addSchedule, updateSchedule, deleteSchedule,
  getFinance, addFinance, updateFinance, deleteFinance,
  getPayments, addPayment, updatePayment, deletePayment,
  getUsers, addUser, updateUser, deleteUser,
  getActivityLog, getNotifications, markNotifRead,
  getReportData,
  getProfile, updateProfile
};

// ── Main Handler ───────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { fn, args = [] } = req.body || {};

  if (!fn || !FUNCTIONS[fn]) {
    return res.status(404).json({ message: `Fungsi '${fn}' tidak ditemukan` });
  }

  try {
    const result = await FUNCTIONS[fn](req, res, ...args);
    if (!res.headersSent) res.status(200).json(result);
  } catch (e) {
    console.error(`[GYM PRO] Error in ${fn}:`, e.message);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Terjadi kesalahan server' });
  }
};
