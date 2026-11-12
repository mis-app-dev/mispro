# MIS Project — Manado Independent School

Full-stack school Management Information System built with **Laravel 12** (backend) and **React 19** (frontend).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 12, PHP 8.2+, Laravel Sanctum |
| Frontend | React 19, React Router, Bootstrap 5, Recharts |
| Database | MySQL |
| Auth | Cookie-based session auth via Sanctum |

---

## Local Environment Setup

### Prerequisites

Make sure the following are installed before you begin:

- **PHP** 8.2 or higher
- **Composer** (latest)
- **Node.js** 18 or higher + **npm**
- **MySQL** 8.0 or higher

---

### 1. Clone the Repository

```bash
git clone <repository-url>
cd MIS_Project
```

---

### 2. Backend Setup (Laravel)

```bash
cd backend
```

**a. Install PHP dependencies**

```bash
composer install
```

**b. Create the environment file**

```bash
cp .env.example .env
```

**c. Configure your database**

Open `.env` and update the database credentials:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=db_mis
DB_USERNAME=root
DB_PASSWORD=your_password_here
```

**d. Create the database**

In MySQL, run:

```sql
CREATE DATABASE db_mis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**e. Generate the application key**

```bash
php artisan key:generate
```

**f. Run database migrations**

```bash
php artisan migrate
```

**g. Seed the database**

This creates the default admin account and master data:

```bash
php artisan db:seed
```

The admin account uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env`.
Set `ADMIN_PASSWORD` to your own password (at least 8 characters) **before** seeding —
there is no default password, and the admin account is skipped if it is empty.

**h. Create the storage symlink**

```bash
php artisan storage:link
```

**i. Start the backend server**

```bash
php artisan serve
```

The API will be available at `http://localhost:8000`.

---

### 3. Frontend Setup (React)

Open a new terminal tab, then:

```bash
cd frontend
```

**a. Install Node dependencies**

```bash
npm install
```

**b. Create the environment file**

```bash
cp .env.example .env
```

Or create `.env` manually with:

```env
REACT_APP_API_URL=http://localhost:8000/api
```

**c. Start the development server**

```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000).

---

### 4. Verify the Setup

1. Open [http://localhost:3000](http://localhost:3000)
2. Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `backend/.env`
3. You should land on the admin dashboard

---

## Project Structure

```
MIS_Project/
├── backend/          # Laravel API
│   ├── app/
│   │   ├── Http/Controllers/
│   │   ├── Models/
│   │   └── Middleware/
│   ├── database/
│   │   ├── migrations/
│   │   └── seeders/
│   ├── routes/
│   │   └── api.php
│   └── .env.example
│
└── frontend/         # React app
    └── src/
        ├── components/
        │   ├── atoms/        # Base UI components
        │   ├── molecules/    # Composite components
        │   ├── organisms/    # Page-level sections
        │   └── pages/        # Full pages
        ├── assets/
        ├── hooks/
        ├── router/
        └── services/         # API service layer
```

---

## Common Issues

**CORS errors** — Make sure `SANCTUM_STATEFUL_DOMAINS=localhost:3000` is set in `backend/.env`.

**Session not persisting** — Verify `SESSION_DOMAIN=localhost` is set and the frontend is calling the API with `withCredentials: true`.

**500 on first run** — Run `php artisan config:clear && php artisan cache:clear` after editing `.env`.

**Storage files not loading** — Run `php artisan storage:link` if you skipped step 2h.
