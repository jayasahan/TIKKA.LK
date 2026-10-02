import React from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import PublicPage from "../pages/PublicPage.jsx";
import CustomerPage from "../pages/CustomerPage.jsx";
import AdminLoginPage from "../pages/AdminLoginPage.jsx";
import AdminPage from "../pages/AdminPage.jsx";
import AppFailure from "../components/AppFailure.jsx";

const router = createBrowserRouter([
  { path: "/", element: <PublicPage />, errorElement: <AppFailure /> },
  { path: "/app.html", element: <CustomerPage />, errorElement: <AppFailure /> },
  { path: "/admin-login.html", element: <AdminLoginPage />, errorElement: <AppFailure /> },
  { path: "/admin.html", element: <AdminPage />, errorElement: <AppFailure /> },
  { path: "*", element: <Navigate to="/" replace /> }
]);

export default router;
