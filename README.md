# GYM PRO — Management System

Stack: **Supabase** (PostgreSQL) + **Vercel** (Serverless) + **GitHub** (Version Control)

## 🚀 Setup Cepat

### 1. Supabase
1. Buat akun di [supabase.com](https://supabase.com)
2. Buat project baru
3. Buka **SQL Editor** → paste isi file `supabase/schema.sql` → **Run**
4. Ambil kredensial dari **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

### 2. GitHub
```bash
cd gym-pro
git init
git add .
git commit -m "feat: initial GYM PRO setup"
git remote add origin https://github.com/USERNAME/gym-pro.git
git push -u origin main
```

### 3. Vercel
1. Buka [vercel.com](https://vercel.com) → **New Project** → import repo GitHub
2. Tambahkan **Environment Variables**:
   ```
   SUPABASE_URL       = https://xxx.supabase.co
   SUPABASE_SERVICE_KEY = eyJ...
   JWT_SECRET         = string-random-panjang-minimal-32-karakter
   ```
3. Klik **Deploy**

## 🔑 Default Login

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Admin |
| manager | manager123 | Manager |
| cashier | cashier123 | Cashier |
| supervisor | supervisor123 | Supervisor |
| user | user123 | User |

## 🧪 Development Lokal

```bash
npm install
cp .env.example .env
# isi .env dengan kredensial Supabase
npx vercel dev
```

Buka `http://localhost:3000`

## 📁 Struktur Project

```
gym-pro/
├── api/
│   └── run.js          ← Semua API (auth, CRUD, laporan)
├── public/
│   └── index.html      ← Frontend SPA lengkap
├── supabase/
│   └── schema.sql      ← DDL + seed data
├── .env.example
├── package.json
└── vercel.json
```

## 🔐 Keamanan
- Password tersimpan plain-text di seed data — **ganti setelah deploy**
- Session menggunakan JWT di httpOnly cookie (7 hari)
- Di produksi pastikan `JWT_SECRET` adalah string random yang kuat
