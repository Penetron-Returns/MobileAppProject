# 🚀 **React Native Supabase Boilerplate 2025**

## Overview

A **React Native 0.76+** starter kit with **Expo**, **TypeScript**, and **Supabase Authentication**, designed to speed up the creation of new projects. This template comes with **ESLint**, **Prettier**, **Jest**, and **GitHub Actions**, ensuring code quality and best practices.

---

## 🛠️ **Technologies**

<p align="center">
  <img alt="React Native" src="https://img.shields.io/badge/React_Native-61DAFB?style=for-the-badge&logo=react&logoColor=white"/>
  <img alt="Expo" src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white"/>
  <img alt="Jest" src="https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white"/>
</p>

---

## 📖 **Table of Contents**

- [🚀 **React Native Supabase Boilerplate 2025**](#-react-native-supabase-boilerplate-2025)
  - [Overview](#overview)
  - [🛠️ **Technologies**](#️-technologies)
  - [📖 **Table of Contents**](#-table-of-contents)
  - [🚀 **Project Setup**](#-project-setup)
    - [Prerequisites](#prerequisites)
  - [▶️ **Running the Application**](#️-running-the-application)
  - [🧪 **Running Tests**](#-running-tests)
  - [📂 **Project Structure**](#-project-structure)
  - [🌐 **Routes Explanation**](#-routes-explanation)
  - [⚙️ **GitHub Actions**](#️-github-actions)
  - [🔮 **Future Improvements**](#-future-improvements)
  - [👤 **Author**](#-author)
  - [📜 **License**](#-license)
  - [🤝 **How to Contribute**](#-how-to-contribute)

---

## 🚀 **Project Setup**

### Prerequisites

- **Node.js >= 22**
- **npm >= 10**
- **Expo CLI** (`npm install -g expo-cli`)

## ▶️ **Running the Application**

1. Clone this repository:

   ```bash
   git clone https://github.com/yourusername/react-native-supabase-boilerplate-2025.git
   cd react-native-supabase-boilerplate-2025
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Setup your Supabase environment:

   - Create a project on [Supabase](https://supabase.io/).
   - At Supabase, create 'users' table and add the following columns:
     - id (uuid)
     - creeated_at (timestampz)
     - name (text)
     - last_name (text)
     - profile_picture (text)
     - email (text)
     - updated_at (timestampz)
   - Add a foreign key on users table:
     - Schema: auth
     - table to reference: users
     - public.users "id" => auth.users "id"
   - At "Authentication">Polices create a new policy:

     - Name: allow all access for auth users
     - Table: public.users
     - Policy Command: Select "ALL" option
     - Target Roles: auth.authenticated
     - Script:

       ```sql
         alter policy "allow all access for auth users"
         on "public"."users"
         to authenticated
         using (true);
       ```

   - At "SQL Editor" add and run a new script to create a function and trigger:

     ```sql
       -- inserts a row into public.users
       create function public.handle_new_user()
       returns trigger
       language plpgsql
       security definer set search_path = public
       as $$
       begin
         insert into public.users (id, name, last_name, email, updated_at)
         values (
           new.id,
           coalesce(new.raw_user_meta_data ->> 'first_name', ''),
           coalesce(new.raw_user_meta_data ->> 'last_name', ''),
           -- coalesce(new.raw_user_meta_data ->> 'profilePicture', ''),
           new.email,
           now()
         );
         return new;
       end;
       $$;

       -- trigger the function every time a user is created
       create trigger createAuthUser
         after insert on auth.users
         for each row execute procedure public.handle_new_user();

      -- insert test.
      -- insert into auth.users (id, email, raw_user_meta_data)
      -- values (
      --  gen_random_uuid(),
      --  'jane.doe2@example.com',
      --  '{"name": "Jane", "last_name": "Doe"}'
      -- ); -->

      -- DELETE FROM auth.users
      -- WHERE id = 'ADD USER ID';
      -- end test
     ```

   - Add your environment variables ('supabaseUrl', 'supabaseAnonKey') to `src\constants\supabase\index.ts`.

4. Run the development server:

   ```bash
   npx expo start
   ```

---

## 🧪 **Running Tests**

Run all tests:

```bash
npm run test
```

Run all tests with noWatch:

```bash
npm run test:no-watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

---

## 📂 **Project Structure**

```bash
📦react-native-boilerplate-supabase-2025
  ├──.github/                # GitHub configurations
  │    └── workflows         # CI/CD workflows
  ├──.husky/                 # husky configurations. pre-commit and  pre-push hooks
  ├──.vscode/                # VS Code configurations
  └──src/                    # Source code
      ├── app/               # Application: Logic and organization of pages and routes
      │   ├── (private)/     # Private pages
      │   │   ├── dashboard  # Dashboard page
      │   │   ├── product    # Product page
      │   │   └── profile    # Profile page
      │   └── (public)/      # Public pages
      │       └── (auth)/    # Authentication pages
      │           ├── signin # Sign-in page
      │           └── signup # Sign-up page
      ├── assets/            # Static files (images, fonts)
      │   ├── fonts          # Fonts used in the app
      │   └── images         # Images for the app
      ├── components/        # Reusable components
      ├── constants/         # Constants and fixed values (e.g., supabase, theme)
      │   ├── supabase       # Supabase configuration and integration
      │   └── theme          # Theme definitions
      ├── contexts/          # React contexts for state management
      │   └── auth           # Authentication context
      ├── hooks/             # Custom hooks
      └── lib/               # Libraries and utilities
          ├── i18n           # Internationalization (i18n)
          │   └── locales    # Translation files
          ├── supabase       # Supabase integration utilities
          └── zod            # Zod validation utilities
```

---

## 🌐 **Routes Explanation**

- **/** – Splash Screen
- **/(public)/(auth)/signin/page** – Sign In page
- **/(public)/(auth)/signup/page** – Sign Up page
- **/(private)/dashboard/page** – Dashboard (authenticated users only)
- **/(private)/profile/page** – User Profile (authenticated users only)

---

## ⚙️ **GitHub Actions**

The project uses GitHub Actions for:

- **Linting and formatting**: Ensures code quality with ESLint and Prettier.
- **Running tests**: Runs the Jest tests on every push and pull request.

---

## 🔮 **Future Improvements**

- Add **commit linting** for enforcing commit message conventions.
- Implement **unit tests** for all components and pages.
- Create a **dark mode** version of the app.

---

## 🤝 **How to Contribute**

We work in branches on this repository. **Don't fork.** `master` only changes through reviewed pull requests.

1. Update master: `git switch master && git pull`.
2. Create a branch named `contributor-name/feature-name`: `git switch -c charl/login-page`.
3. Make your changes, run the checks, and commit: `git commit -m "Add login page"`.
4. Push the branch: `git push -u origin HEAD`.
5. Open a pull request into `master`. It needs CI to pass and approval from @xd-Park3rr or @JpegAndre.

Never push to `master` directly. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.
