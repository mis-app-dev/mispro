import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

import LoginPage from '../components/Pages/Login/LoginPage.js';
import Home from '../components/Pages/Home/Home.js';
import Analytics from '../components/Pages/Analytics/Analytics.js';
import StudentList from '../components/Pages/StudentList/StudentList.js';
import Registration from '../components/Pages/Registration/Registration.js';
import CanceledRegistration from '../components/Pages/Registration/CanceledRegistration/CanceledRegistration.js';
import RegistrationPage from '../components/Pages/Registration/RegistrationForm/RegistrationForm.js';
import Print from '../components/Pages/PrintContent/Print.js';
import MainLayout from '../components/Layout/Main';
import StudentProfile from '../components/Pages/StudentList/StudentProfile/StudentProfile.js';
import Logbook from '../components/Pages/Logbook/Logbook.js';
import Guestbook from '../components/Pages/Guestbook/Guestbook.js';
import Users from '../components/Pages/Users/Users.js';
import Section from '../components/Pages/Section/Section.js';

import ProtectedRoute from './ProtectedRoute';

const RegistrarAccess = ({ children }) => {
  const { isAdmin, isRegistrar } = useAuth();
  if (!isAdmin() && !isRegistrar()) {
    return <Navigate to='/Home' replace />;
  }
  return children;
};

const AdminAccess = ({ children }) => {
  const { isAdmin } = useAuth();
  if (!isAdmin()) {
    return <Navigate to='/Home' replace />;
  }
  return children;
};

const appRoutes = [
  {
    path: '/Login',
    element: <LoginPage />,
  },
  {
    path: '/Home',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <Home />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Analytics',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <Analytics />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/students',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <StudentList />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/students/:id',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <StudentProfile />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Logbook',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <Logbook />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Guestbook',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <Guestbook />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Registration',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <Registration />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/canceled-registration',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <CanceledRegistration />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Section',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <Section />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Users',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <AdminAccess>
            <Users />
          </AdminAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/Registration-form',
    element: (
      <ProtectedRoute>
        <MainLayout>
          <RegistrarAccess>
            <RegistrationPage />
          </RegistrarAccess>
        </MainLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: '/print',
    element: (
      <ProtectedRoute>
        <RegistrarAccess>
          <Print />
        </RegistrarAccess>
      </ProtectedRoute>
    ),
  },
  {
    path: '/',
    element: <Navigate to='/Login' replace />,
  },
  {
    path: '*',
    element: <Navigate to='/Login' replace />,
  },
];

export default appRoutes;
