import React from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router.jsx";
import AppFailure from "../components/AppFailure.jsx";

export class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <AppFailure />;
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  );
}
