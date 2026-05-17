-- ============================================
-- GYM PRO - Supabase Schema + Seed Data
-- Jalankan di Supabase SQL Editor
-- ============================================

-- Drop existing tables (urutan penting karena foreign key)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS finance CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS trainers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('User','Cashier','Admin','Supervisor','Manager')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trainers
CREATE TABLE trainers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  membership_type TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'Active',
  trainer_id TEXT REFERENCES trainers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedules
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  trainer_id TEXT REFERENCES trainers(id) ON DELETE SET NULL,
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  date DATE,
  time_start TEXT,
  time_end TEXT,
  type TEXT,
  status TEXT DEFAULT 'Scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Finance
CREATE TABLE finance (
  id TEXT PRIMARY KEY,
  type TEXT CHECK (type IN ('Income','Expense')),
  category TEXT,
  description TEXT,
  amount NUMERIC(15,2),
  member_id TEXT,
  created_by TEXT,
  date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  amount NUMERIC(15,2),
  method TEXT,
  status TEXT DEFAULT 'Paid',
  description TEXT,
  finance_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Log
CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  action TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  message TEXT,
  type TEXT DEFAULT 'info',
  priority TEXT DEFAULT 'normal',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO users VALUES
('USR001','admin','admin123','Administrator','admin@gym.com','081234567890','Admin',true,NOW(),NOW()),
('USR002','manager','manager123','Manager Gym','manager@gym.com','081234567891','Manager',true,NOW(),NOW()),
('USR003','cashier','cashier123','Kasir Gym','cashier@gym.com','081234567892','Cashier',true,NOW(),NOW()),
('USR004','supervisor','supervisor123','Supervisor Gym','supervisor@gym.com','081234567893','Supervisor',true,NOW(),NOW()),
('USR005','user','user123','Staff Gym','user@gym.com','081234567894','User',true,NOW(),NOW());

INSERT INTO trainers VALUES
('TRN001','Budi Santoso','Chest & Triceps','081111111111','budi@gym.com',true,NOW()),
('TRN002','Andi Wijaya','Back & Biceps','082222222222','andi@gym.com',true,NOW()),
('TRN003','Siti Rahayu','Legs & Cardio','083333333333','siti@gym.com',true,NOW()),
('TRN004','Roni Pratama','Shoulder & Abs','084444444444','roni@gym.com',true,NOW());

INSERT INTO members VALUES
('MBR001','Ahmad Fauzi','ahmad@email.com','081555555555','Jl. Merdeka 10','Premium','2024-01-01','2025-01-01','Active','TRN001',NOW(),NOW()),
('MBR002','Dewi Lestari','dewi@email.com','082666666666','Jl. Sudirman 20','Regular','2024-03-15','2024-09-15','Active','TRN002',NOW(),NOW()),
('MBR003','Budi Prasetyo','budi.p@email.com','083777777777','Jl. Gatot Subroto 5','Premium','2024-06-01','2025-06-01','Active','TRN003',NOW(),NOW()),
('MBR004','Rina Wati','rina@email.com','084888888888','Jl. Diponegoro 15','Regular','2024-02-01','2024-08-01','Expired','TRN001',NOW(),NOW()),
('MBR005','Joko Susilo','joko@email.com','085999999999','Jl. Ahmad Yani 30','VIP','2024-07-01','2025-07-01','Active','TRN004',NOW(),NOW());

INSERT INTO schedules VALUES
('SCH001','TRN001','MBR001','2025-06-15','08:00','09:00','Personal Training','Scheduled','Upper body focus',NOW()),
('SCH002','TRN002','MBR002','2025-06-16','10:00','11:00','Cardio','Scheduled','',NOW()),
('SCH003','TRN003','MBR003','2025-06-17','07:00','08:00','Leg Day','Scheduled','Focus on squats',NOW()),
('SCH004','TRN004','MBR005','2025-06-18','09:00','10:00','Full Body','Completed','Great session',NOW());

INSERT INTO finance VALUES
('FIN001','Income','Membership','Pembayaran membership Premium - Ahmad',5000000,'MBR001','admin','2024-01-01',NOW()),
('FIN002','Income','Membership','Pembayaran membership Regular - Dewi',2500000,'MBR002','admin','2024-03-15',NOW()),
('FIN003','Expense','Operasional','Biaya listrik bulan Januari',2000000,NULL,'admin','2024-01-15',NOW()),
('FIN004','Income','Membership','Pembayaran membership Premium - Budi',5000000,'MBR003','admin','2024-06-01',NOW()),
('FIN005','Income','Membership','Pembayaran membership VIP - Joko',7500000,'MBR005','cashier','2024-07-01',NOW()),
('FIN006','Expense','Gaji','Gaji Trainer Bulan Juli',12000000,NULL,'admin','2024-07-01',NOW()),
('FIN007','Expense','Peralatan','Pembelian dumbbell set',3500000,NULL,'manager','2024-07-10',NOW()),
('FIN008','Income','Personal Training','PT Session Ahmad - 10x',3000000,'MBR001','cashier','2024-07-15',NOW());

INSERT INTO payments VALUES
('PAY001','MBR001',5000000,'Transfer','Paid','Membership Premium 1 Tahun','FIN001',NOW()),
('PAY002','MBR002',2500000,'Cash','Paid','Membership Regular 6 Bulan','FIN002',NOW()),
('PAY003','MBR005',7500000,'Transfer','Paid','Membership VIP 1 Tahun','FIN005',NOW()),
('PAY004','MBR001',3000000,'QRIS','Paid','Personal Training 10 Session','FIN008',NOW());

INSERT INTO notifications VALUES
('NTF001','all','Selamat Datang','GYM PRO siap digunakan. Semua fitur aktif.','info','normal',false,NOW()),
('NTF002','all','Membership Expired','Member Rina Wati membership sudah expired','warning','high',false,NOW());
